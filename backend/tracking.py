import json
import numpy as np
import crud
import asyncio
from datetime import datetime, UTC
from typing import Tuple
from skyfield.api import load, wgs84
from contextlib import asynccontextmanager
from fastapi import FastAPI
from common import timeit, async_timeit
from skyfield.api import Loader, Topos, EarthSatellite
from db import engine, AsyncSessionLocal
from logger import logger
from models import ModelEncoder


@async_timeit
async def fetch_next_events(norad_id: int, hours: float = 24.0, above_el = 0, step_minutes = 0.5) -> dict:

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



async def satellite_tracking_task(sio, logger):
    """
    This task will continuously run in the background.
    """

    async with (AsyncSessionLocal() as dbsession):
        while True:
            try:
                tracking_state = await crud.get_satellite_tracking_state(dbsession, name='satellite-tracking')
                logger.info(f"Tracking state: {tracking_state}")
                if tracking_state.get('success', False) is False:
                    raise Exception(f"No satellite tracking information found in the db for name satellite-tracking")

                norad_id = tracking_state['data']['value'].get('norad_id', None)
                state = tracking_state['data']['value'].get('state', None)

                #logger.info(f"Norad id: {norad_id}, state: {state}")
                satellite = await crud.fetch_satellites(dbsession, satellite_id=norad_id)

                if satellite.get('success', False) is False:
                    raise Exception(f"No satellite found in the db for norad id {norad_id}")

                if len(satellite.get('data', [])) != 1:
                    raise Exception(f"Expected exactly one satellite in the result for norad id {norad_id} got"
                                    f" {len(satellite.get('data', []))}")

                #logger.info(f"Satellites: {satellite}")

                location = await crud.fetch_location_for_userid(dbsession, user_id=None)
                if location.get('success', False) is False:
                    raise Exception(f"No location found in the db for user id None, please set one")

                #logger.info(f"location {location}")

                home_lat = location['data']['lat']
                home_lon = location['data']['lon']

                sky_point = get_satellite_az_el(home_lat, home_lon, satellite['data'][0]['tle1'],
                                                satellite['data'][0]['tle2'], datetime.now(UTC))

                logger.info(f"Sky point: az: {sky_point[0]} el: {sky_point[1]}")




            except Exception as e:
                logger.error(f"Error in satellite tracking task: {e}")
                logger.exception(e)

            finally:
                await asyncio.sleep(1)

