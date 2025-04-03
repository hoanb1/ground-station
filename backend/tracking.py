import json
import numpy as np
import crud
import asyncio
import math
import socketio
from datetime import datetime, UTC
from typing import Tuple
from skyfield.api import load, wgs84
from common import timeit, async_timeit, is_geostationary
from skyfield.api import Loader, Topos, EarthSatellite
from db import engine, AsyncSessionLocal
from logger import logger
from models import ModelEncoder
from exceptions import AzimuthOutOfBounds, ElevationOutOfBounds
from rotator import RotatorController
from arguments import arguments as args


@async_timeit
async def fetch_next_events(norad_id: int, hours: float = 6.0, above_el = 0, step_minutes = 0.5) -> dict:
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

    try:
        assert norad_id, f"norad_id is required ({norad_id}, {type(norad_id)})"

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

    except Exception as e:
        logger.error(f"Failed to calculate satellite events for norad id: {norad_id}, error: {e}")
        logger.exception(e)

    finally:
        return reply


async def fetch_next_events_for_group(group_id: str, hours: float = 2.0, above_el = 0, step_minutes = 1):
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

async def get_ui_tracker_state(group_id: str, norad_id: int):
    """
    Fetches the current tracker state for a specified group ID and satellite ID. This function
    interacts with the tracking database using asynchronous functions to retrieve data related
    to the specified identifiers. The response contains the success status and fetched data,
    or an error on failure.

    :param group_id: The unique identifier for the group whose satellites are to be fetched.
    :type group_id: int
    :param norad_id: The unique identifier for the satellite whose state is to be fetched.
    :type norad_id: int
    :return: A dictionary containing the success status and the tracker state data, or None
        if the operation fails.
    :rtype: dict
    """
    reply = {'success': False, 'data': None}
    data = {
        'groups': [],
        'satellites': [],
        'group_id': None,
        'norad_id': None,
        'rotator_id': '',
        'rig_id': ''
    }

    try:
        async with (AsyncSessionLocal() as dbsession):
            groups = await crud.fetch_satellite_group(dbsession)
            satellites = await crud.fetch_satellites_for_group_id(dbsession, group_id=group_id)
            tracking_state = await crud.get_satellite_tracking_state(dbsession, name='satellite-tracking')
            data['groups'] = groups['data']
            data['satellites'] = satellites['data']
            data['group_id'] = group_id
            data['norad_id'] = norad_id
            data['rig_id'] = tracking_state['data']['value'].get('rig_id', "")
            data['rotator_id'] = tracking_state['data']['value'].get('rotator_id', "")
            reply['success'] = True
            reply['data'] = data

    except Exception as e:
        logger.error(f"Failed to get tracker state for group id: {group_id}, satellite id: {norad_id}, error: {e}")
        logger.exception(e)

    finally:
        return reply


async def compiled_satellite_data(dbsession, tracking_state) -> dict:
    """
    Compiles detailed information about a satellite, including its orbital details,
    transmitters, and sky position based on tracking data and user's location.

    :param dbsession: Database session object used to interact with the database
    :param tracking_state: Tracking state dictionary containing satellite tracking data
    :return: Dictionary containing satellite details, transmitters, and position
    :rtype: dict
    :raises Exception: If satellite tracking data is unavailable or incomplete
    :raises Exception: If no satellite matches the provided NORAD ID
    :raises Exception: If more than one satellite is found for the same NORAD ID
    :raises Exception: If user location is not found in the database
    """

    satellite_data = {
        'details': {},
        'position': {},
        'transmitters': [],
    }

    if tracking_state.get('success', False) is False:
        raise Exception(f"No satellite tracking information found in the db for name satellite-tracking")

    norad_id = tracking_state['data']['value'].get('norad_id', None)

    satellite = await crud.fetch_satellites(dbsession, norad_id=norad_id)

    if satellite.get('success', False) is False:
        raise Exception(f"No satellite found in the db for norad id {norad_id}")

    if len(satellite.get('data', [])) != 1:
        raise Exception(f"Expected exactly one satellite in the result for norad id {norad_id} got"
                        f" {len(satellite.get('data', []))}")

    satellite_data['details'] = satellite['data'][0]
    satellite_data['details']['is_geostationary'] = is_geostationary([
        satellite_data['details']['tle1'],
        satellite_data['details']['tle2']
    ])

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

    return satellite_data


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

    # check interval value, should be between 2 and 5 (including)
    assert 1 < args.track_interval < 6, f"track_interval must be between 2 and 5, got {args.track_interval}"

    azimuthlimits = (0, 360)
    eleveationlimits = (0, 180)
    previous_tracking_state = None
    rotator = None

    async with (AsyncSessionLocal() as dbsession):
        while True:
            try:
                tracking_state_reply = await crud.get_satellite_tracking_state(dbsession, name='satellite-tracking')
                assert tracking_state_reply.get('success', False) is True, f"Error in satellite tracking task: {tracking_state_reply}"
                assert tracking_state_reply['data']['value']['group_id'], f"No group id found in satellite tracking state: {tracking_state_reply}"
                assert tracking_state_reply['data']['value']['norad_id'], f"No norad id found in satellite tracking state: {tracking_state_reply}"
                group_id = tracking_state_reply['data']['value']['group_id']
                norad_id = tracking_state_reply['data']['value']['norad_id']

                satellite_data = await compiled_satellite_data(dbsession, tracking_state_reply)
                satellite_name = satellite_data['details']['name']
                tracker = tracking_state_reply['data']['value']
                selected_rotator_id = tracker.get('rotator_id', None)
                selected_rig_id = tracker.get('rig_id', None)
                current_tracking_state = tracker.get('tracking_state')

                # detect tracker state change
                if current_tracking_state != previous_tracking_state:
                    logger.info(f"Tracking state changed from {previous_tracking_state} to {current_tracking_state}")

                    # check if the new state is not tracking
                    if current_tracking_state == "tracking":

                        # check what hardware was chosen and set it up
                        if selected_rotator_id is not None and rotator is None:

                            # rotator was selected, and a rotator is not setup, set it up now
                            try:
                                rotator_details_reply = await crud.fetch_rotators(dbsession, rotator_id=selected_rotator_id)
                                rotator_details = rotator_details_reply['data']
                                rotator_path = f"{rotator_details['host']}:{rotator_details['port']}"
                                rotator = RotatorController(host=rotator_details['host'], port=rotator_details['port'])
                                slew_complete = False
                                await rotator.connect()

                            except Exception as e:
                                logger.error(f"Failed to connect to rotator: {e}")
                                logger.exception(e)
                                rotator = None  # Reset to None if connection fails

                    elif current_tracking_state == "idle":

                        if rotator is not None:
                            logger.info(f"Disconnecting from rotator at {rotator_path}...")
                            try:
                                rotator.disconnect()  # Assuming disconnect method exists
                                logger.info(f"Successfully disconnected from rotator at {rotator_path}")

                            except Exception as e:
                                logger.error(f"Error disconnecting from rotator: {e}")
                                logger.exception(e)

                            finally:
                                # Set to None regardless of disconnect success
                                rotator = None

                    else:
                        logger.error(f"unknown tracking state: {tracker['tracking_state']}")

                else:
                    # no tracker state change detected, move on
                    pass

                # set this to the current value so that the above logic works
                previous_tracking_state = current_tracking_state

                # work on our sky coordinates
                skypoint = (satellite_data['position']['az'], satellite_data['position']['el'])

                # first we check if the az end el values in the skypoint tuple are reachable
                if skypoint[0] > azimuthlimits[1] or skypoint[0] < azimuthlimits[0]:
                    raise AzimuthOutOfBounds(f"azimuth {round(skypoint[0], 3)} is out of range (range: {azimuthlimits})")

                if skypoint[1] < eleveationlimits[0] or skypoint[1] > eleveationlimits[1]:
                    raise ElevationOutOfBounds(f"elevation {round(skypoint[1], 3)} is out of range (range: {eleveationlimits})")

                logger.info(f"We have a valid target (#{norad_id} {satellite_name}) at az: {round(skypoint[0], 3)} el: {round(skypoint[1], 3)}")

                if rotator:
                    position_gen = rotator.set_position(round(skypoint[0], 3), round(skypoint[1], 3))

                    try:
                        az, el, is_slewing = await anext(position_gen)
                        logger.info(f"Current position: Az={round(az, 3)}°, El={round(el, 3)}°, Moving={is_slewing}")

                    except StopAsyncIteration:
                        # Generator is done (slewing complete)
                        logger.info("Slewing complete")

            except AzimuthOutOfBounds as e:
                logger.warning(f"Azimuth out of bounds for satellite #{norad_id} {satellite_name}: {e}")

            except ElevationOutOfBounds as e:
                logger.warning(f"Elevation out of bounds for satellite #{norad_id} {satellite_name}: {e}")

            except Exception as e:
                logger.error(f"Error in satellite tracking task: {e}")
                logger.exception(e)

            finally:
                # lastly send updates to the UI
                data = {
                    'satellite_data': satellite_data,
                    'tracking_state': tracker,
                    #'ui_tracker_state': ui_tracker_state['data']
                }

                logger.debug(f"Sending satellite tracking data to the browser: {data}")
                await sio.emit('satellite-tracking', data)

                logger.info(f"Waiting for {args.track_interval} seconds before next update...")
                await asyncio.sleep(args.track_interval)

