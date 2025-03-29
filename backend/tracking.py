import json
import numpy as np
import crud
import asyncio
import math
import socketio
from datetime import datetime, UTC
from typing import Tuple
from skyfield.api import load, wgs84
from common import timeit, async_timeit
from skyfield.api import Loader, Topos, EarthSatellite
from db import engine, AsyncSessionLocal
from logger import logger
from models import ModelEncoder


@async_timeit
async def fetch_next_events(norad_id: int, hours: float = 24.0, above_el = 0, step_minutes = 0.5) -> dict:
    """
    Calculates upcoming satellite observation events based on NORAD id, observation
    duration, elevation threshold, and time step. The function computes satellite
    pass details like start and end times, maximum altitude, and relative distances
    for an observer located at a specific ground position.

    :param norad_id: Integer representing the NORAD Catalog Number for a satellite.
    :param hours: Observation duration in hours.
    :param above_el: Minimum elevation angle (in degrees) above the horizon for
        an event to be considered. Default is 0.
    :param step_minutes: Time step in minutes for evaluating satellite positions.
        Smaller time steps increase calculation accuracy. Default is 0.5 minutes.
    :return: Dictionary containing the calculated satellite pass events,
        parameters used for computation, and a success flag.
    :rtype: dict
    """

    reply = {'success': None, 'data': None}
    events = []

    logger.info("Calculating satellite events for norad id: " + str(norad_id) + " for next " + str(hours) + " hours.")

    async with AsyncSessionLocal() as dbsession:
        # set a temporary folder for the skyfield library to do its thing
        skyfieldloader = Loader('/tmp/skyfield-data')  # or any preferred path

        ts = skyfieldloader.timescale()
        satellite_data = await crud.fetch_satellites(dbsession, norad_id)
        satellite_data = json.loads(json.dumps(satellite_data, cls=ModelEncoder))

        satellite = EarthSatellite(
            satellite_data['data'][0]['tle1'],
            satellite_data['data'][0]['tle2'],
            name=satellite_data['data'][0]['name']
        )

        # get home location
        home = await crud.fetch_location_for_userid(dbsession, user_id=None)
        homelat = float(home['data']['lat'])
        homelon = float(home['data']['lon'])

        # Coordinates can be in decimal degrees:
        observer = Topos(latitude_degrees=homelat, longitude_degrees=homelon)

        # build a time range for pass calculation
        t0 = ts.now()
        t1 = ts.now().utc_jpl()  # Just for reference in printing
        t_end = t0 + (hours / 24.0)

        # step through times. Typically, you'll choose a reasonable step size (e.g., 1 minute):
        t_points = t0 + (np.arange(0, int(hours) * 60, step_minutes) / (24.0 * 60.0))

        # For each time, compute altitude above observer. We subtract the observer (Topos) from the satellite to
        # get the satellite's position relative to the observer, then do `.altaz()` to get altitude.
        difference = satellite - observer
        altitudes = []
        distances = []
        for t in t_points:
            topocentric = difference.at(t)
            alt, az, distance = topocentric.altaz()
            altitudes.append(alt.degrees)
            distances.append(distance.km)

        # Now we can find "passes" by looking for intervals where alt > 0
        above_horizon = np.array(altitudes) > above_el

        # For a simple pass report, find start/end indices of each pass
        passes = []
        in_pass = False
        pass_start_index = None

        for i in range(len(above_horizon)):
            if above_horizon[i] and not in_pass:
                # we are just now rising above the horizon
                in_pass = True
                pass_start_index = i

            elif not above_horizon[i] and in_pass:
                # we just fell below the horizon
                in_pass = False
                pass_end_index = i - 1  # last index when above horizon
                passes.append((pass_start_index, pass_end_index))

        # If the last pass goes until the end of the array, close it out
        if in_pass:
            passes.append((pass_start_index, len(above_horizon) - 1))

        # Print out pass start/end times
        for idx, (start_i, end_i) in enumerate(passes, 1):
            start_time = t_points[start_i]
            end_time = t_points[end_i]
            dist_start = distances[start_i]
            dist_end = distances[end_i]
            duration = end_time.utc_datetime() - start_time.utc_datetime()

            events.append({
                'id': idx,
                'event_start': start_time.utc_iso(),
                'event_end': end_time.utc_iso(),
                'duration': duration,
                'distance_at_start': dist_start,
                'distance_at_end': dist_end,
                'distance_at_peak': max(distances[start_i:end_i+1]),
                'peak_altitude': max(altitudes[start_i:end_i+1])
            })

        events = json.loads(json.dumps(events, cls=ModelEncoder))

    reply['data'] = events
    reply['parameters'] = {'norad_id': norad_id, 'hours': hours, 'above_el': above_el, 'step_minutes': step_minutes}
    reply['success'] = True
    return reply


async def fetch_next_events_for_group(group_id: str, hours: float = 6.0, above_el = 0, step_minutes = 1):
    """
    Fetches the next satellite events for a given group of satellites within a specified
    time frame. This function calculates the satellite events for a group identifier over
    a defined number of hours, altitude threshold, and minute step interval.

    :param group_id: The unique identifier of the satellite group for which satellite events
        are being fetched.
    :type group_id: str
    :param hours: The number of hours to calculate future satellite events. Defaults to 6.0.
    :type hours: float
    :param above_el: The minimum elevation in degrees above the horizon to filter satellite
        events. Defaults to 0.
    :type above_el: int
    :param step_minutes: The interval in minutes at which satellite positions are queried.
        Defaults to 1.
    :type step_minutes: int
    :return: A dictionary containing the success status, input parameters for the request,
        and the list of satellite events for the group.
    :rtype: dict
    """
    assert group_id, f"Group id is required ({group_id}, {type(group_id)})"

    reply = {'success': None, 'data': None}
    events = []

    logger.info("Calculating satellite events for group id: " + str(group_id) + " for next " + str(hours) + " hours")

    async with AsyncSessionLocal() as dbsession:
        try:
            satellites = await crud.fetch_satellites_for_group_id(dbsession, group_id)
            satellites = json.loads(json.dumps(satellites['data'], cls=ModelEncoder))

            for satellite in satellites:
                events_reply = await fetch_next_events(satellite['norad_id'], hours=hours, above_el=above_el, step_minutes=step_minutes)
                events_for_satellite = events_reply.get('data', None)
                events.append({'name': satellite['name'], 'events': events_for_satellite})

        except Exception as e:
            logger.error(f'Error fetching next passes for group: {group_id}, error: {e}')
            logger.exception(e)
            reply['success'] = False
            reply['data'] = []

        finally:
            reply['success'] = True
            reply['parameters'] = {'group_id': group_id, 'hours': hours, 'above_el': above_el, 'step_minutes': step_minutes}
            reply['data'] = events

    return reply


def get_satellite_az_el(home_lat: float, home_lon: float, satellite_tle_line1: str, satellite_tle_line2: str,
                        observation_time: datetime) -> Tuple[float, float]:
    """
    Given a home location (latitude, longitude), a satellite TLE (two-line element),
    and a specific observation time, this function returns the
    azimuth and elevation of the satellite in degrees.

    Parameters:
    - home_lat: Latitude of the home location in degrees
    - home_lon: Longitude of the home location in degrees
    - satellite_tle_line1: First line of the satellite's TLE
    - satellite_tle_line2: Second line of the satellite's TLE
    - observation_time: A Python datetime representing the observation time (UTC)

    Returns:
    - (azimuth, elevation): Tuple (in degrees)
    """
    # Create a timescale and convert the observation time to a Skyfield time object
    ts = load.timescale()
    t = ts.from_datetime(observation_time)

    # Create the EarthSatellite object directly from the TLE strings
    satellite = EarthSatellite(satellite_tle_line1, satellite_tle_line2)

    # Define the observer's location
    observer = wgs84.latlon(home_lat, home_lon)

    # Compute the difference vector between satellite and observer
    difference = satellite - observer

    # Get the altitude (elevation) and azimuth in degrees
    alt, az, _ = difference.at(t).altaz()

    return az.degrees, alt.degrees


def get_satellite_position_from_tle(tle_lines):
    """
    Computes the position and velocity of a satellite from its Two-Line Element (TLE) data.

    This function parses the provided TLE lines to create a satellite object and calculates
    its current geocentric position and velocity. It then determines the subpoint of the
    satellite (its latitude, longitude, and altitude above Earth's surface) and computes
    its velocity in kilometers per second.

    :param tle_lines: List of strings containing the TLE data for the satellite. The TLE must
        include exactly three lines: the satellite name, followed by two TLE lines.
    :type tle_lines: list[str]
    :return: A dictionary containing the latitude, longitude, altitude, and velocity of the satellite.
    :rtype: dict[str, float]
    """

    name = tle_lines[0].strip()
    line1 = tle_lines[1].strip()
    line2 = tle_lines[2].strip()

    # Load a timescale and get the current time.
    ts = load.timescale()
    t = ts.now()

    # Create an EarthSatellite object from the TLE.
    satellite = EarthSatellite(line1, line2, name, ts)

    # Compute the geocentric position for the current time.
    geocentric = satellite.at(t)

    # Obtain subpoint (latitude, longitude, and elevation above Earth).
    subpoint = geocentric.subpoint()

    lat_degrees = subpoint.latitude.degrees
    lon_degrees = subpoint.longitude.degrees
    altitude_m = subpoint.elevation.m  # altitude above Earth's surface in meters

    # Get velocity vector in km/s
    vx, vy, vz = geocentric.velocity.km_per_s
    velocity_km_s = math.sqrt(vx * vx + vy * vy + vz * vz)

    return {
        "lat": float(lat_degrees),
        "lon": float(lon_degrees),
        "alt": float(altitude_m),
        "vel": float(velocity_km_s)
    }


async def satellite_tracking_task(sio: socketio.AsyncServer):
    """
    Periodically tracks and transmits satellite position and details along with user location data
    to the browser using Socket.IO.

    This function performs satellite tracking by retrieving tracking states, determining current
    satellite position, and calculating azimuth and elevation values based on user geographic
    location. Data retrieval is achieved through database queries for satellite and user
    information, and updates are transmitted via a Socket.IO communication channel.

    :param sio: The Socket.IO server instance for emitting satellite tracking data asynchronously.
    :type sio: socketio.AsyncServer
    :return: None
    """
    satellite_data = {
        'details': {},
        'position': {},
        'transmitters': [],
    }

    async with (AsyncSessionLocal() as dbsession):
        while True:
            try:
                tracking_state_reply = await crud.get_satellite_tracking_state(dbsession, name='satellite-tracking')

                if tracking_state_reply.get('success', False) is False:
                    raise Exception(f"No satellite tracking information found in the db for name satellite-tracking")

                norad_id = tracking_state_reply['data']['value'].get('norad_id', None)

                satellite = await crud.fetch_satellites(dbsession, norad_id=norad_id)

                if satellite.get('success', False) is False:
                    raise Exception(f"No satellite found in the db for norad id {norad_id}")

                if len(satellite.get('data', [])) != 1:
                    raise Exception(f"Expected exactly one satellite in the result for norad id {norad_id} got"
                                    f" {len(satellite.get('data', []))}")

                satellite_data['details'] = satellite['data'][0]

                # fetch transmitters
                transmitters = await crud.fetch_transmitters_for_satellite(dbsession, norad_id=norad_id)
                satellite_data['transmitters'] = transmitters['data']

                location = await crud.fetch_location_for_userid(dbsession, user_id=None)
                if location.get('success', False) is False:
                    raise Exception(f"No location found in the db for user id None, please set one")

                # get current position
                position = get_satellite_position_from_tle([
                    satellite_data['details']['name'],
                    satellite_data['details']['tle1'],
                    satellite_data['details']['tle2']
                ])

                # get position in the sky
                home_lat = location['data']['lat']
                home_lon = location['data']['lon']
                sky_point = get_satellite_az_el(home_lat, home_lon, satellite['data'][0]['tle1'],
                                                satellite['data'][0]['tle2'], datetime.now(UTC))

                satellite_data['position'] = position
                position['az'] = sky_point[0]
                position['el'] = sky_point[1]

                logger.info(f"Sky point: az: {sky_point[0]} el: {sky_point[1]}, position: {position}")
                logger.info(f"Satellite data: {satellite_data}")

                # transmit data to the browser
                await sio.emit('satellite-tracking', satellite_data)

            except Exception as e:
                logger.error(f"Error in satellite tracking task: {e}")
                logger.exception(e)

            finally:

                await asyncio.sleep(2)

