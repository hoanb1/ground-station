
import json
import multiprocessing
import crud
import asyncio
from db import AsyncSessionLocal
from logger import logger
from models import ModelEncoder
from typing import List, Dict, Union, Tuple
from .passes import calculate_next_events


def run_calculation(tle_groups, homelat, homelon, hours, above_el, step_minutes):
    events = calculate_next_events(
        tle_groups=tle_groups,
        home_location={"lat": homelat, "lon": homelon},
        hours=hours,
        above_el=above_el,
        step_minutes=step_minutes
    )
    return events


async def fetch_next_events_for_group(group_id: str, hours: float = 2.0, above_el=0, step_minutes=1):
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

    reply: dict[str, Union[bool, None, list, dict]] = {'success': None, 'data': None, 'parameters': None}
    events = []

    logger.info(
        "Calculating satellite events for group id: " + str(group_id) + " for next " + str(hours) + " hours")

    async with AsyncSessionLocal() as dbsession:
        try:
            # Get home location
            home = await crud.fetch_location_for_userid(dbsession, user_id=None)
            homelat = float(home['data']['lat'])
            homelon = float(home['data']['lon'])

            # Fetch satellite data
            satellites = await crud.fetch_satellites_for_group_id(dbsession, group_id)
            satellites = json.loads(json.dumps(satellites['data'], cls=ModelEncoder))

            # Prepare TLE groups list
            tle_groups = []
            for satellite in satellites:
                tle_groups.append([
                    satellite['norad_id'],
                    satellite['tle1'],
                    satellite['tle2']
                ])

            with multiprocessing.Pool(processes=1) as pool:
                # Submit the calculation task to the pool
                result = await asyncio.get_event_loop().run_in_executor(
                    None,
                    pool.apply,
                    run_calculation,
                    (tle_groups, homelat, homelon, hours, above_el, step_minutes)
                )

            if result.get('success', False):
                events_data = result.get('data', [])

                # Create a lookup dict for satellite names, transmitters and counts
                satellite_info = {sat['norad_id']: {
                    'name': sat['name'],
                    'transmitters': sat.get('transmitters', []),
                    'transmitter_count': len([t for t in sat.get('transmitters', [])])
                } for sat in satellites}

                # Add satellite names, transmitters and counts to events
                for event in events_data:
                    event['name'] = satellite_info[event['norad_id']]['name']
                    event['transmitters'] = satellite_info[event['norad_id']]['transmitters']
                    event['transmitter_count'] = satellite_info[event['norad_id']]['transmitter_count']
                    event['id'] = f"{event['norad_id']}_{event['event_start']}"
                    events.append(event)

                reply['success'] = True
                reply['parameters'] = {'group_id': group_id, 'hours': hours, 'above_el': above_el,
                                       'step_minutes': step_minutes}
                reply['data'] = events
            else:
                raise Exception(f"Subprocess for calculating next passes failed: {result}")

        except Exception as e:
            logger.error(f'Error fetching next passes for group: {group_id}, error: {e}')
            logger.exception(e)
            reply['success'] = False
            reply['data'] = []

        finally:
            return reply


async def fetch_next_events_for_satellite(norad_id: int, hours: float = 2.0, above_el=0, step_minutes=1):
    """
    This function fetches the next satellite events for a specified satellite within a specified
    time frame. This function calculates the satellite events over a defined number
    of hours, altitude threshold, and minute step interval.

    :param norad_id: The NORAD ID of the satellite for which events are being fetched
    :type norad_id: int
    :param hours: The number of hours to calculate future satellite events. Defaults to 2.0
    :type hours: float
    :param above_el: The minimum elevation in degrees above the horizon to filter satellite
        events. Defaults to 0.
    :type above_el: int
    :param step_minutes: The interval in minutes at which satellite positions are queried.
        Defaults to 1.
    :type step_minutes: int
    :return: A dictionary containing the success status, input parameters for the request,
        and the list of satellite events.
    :rtype: dict
    """

    assert norad_id, f"NORAD ID is required ({norad_id}, {type(norad_id)})"

    reply: dict[str, Union[bool, None, list, dict]] = {'success': None, 'data': None, 'parameters': None}
    events = []

    logger.info(f"Calculating satellite events for NORAD ID: {norad_id} for next {hours} hours")
    async with AsyncSessionLocal() as dbsession:
        try:
            # Get home location
            home = await crud.fetch_location_for_userid(dbsession, user_id=None)
            homelat = float(home['data']['lat'])
            homelon = float(home['data']['lon'])

            # Fetch satellite data
            satellite_reply = await crud.fetch_satellites(dbsession, norad_id=norad_id)
            satellite = json.loads(json.dumps(satellite_reply['data'][0], cls=ModelEncoder))

            # Prepare TLE group for single satellite
            tle_group = [[
                satellite['norad_id'],
                satellite['tle1'],
                satellite['tle2']
            ]]
            with multiprocessing.Pool(processes=1) as pool:
                # Submit the calculation task to the pool
                result = await asyncio.get_event_loop().run_in_executor(
                    None,
                    pool.apply,
                    run_calculation,
                    (tle_group, homelat, homelon, hours, above_el, step_minutes)
                )

            if result.get('success', False):
                events_for_satellite = result.get('data', [])
                for event in events_for_satellite:
                    event['name'] = satellite['name']
                    event['id'] = f"{satellite['norad_id']}_{event['event_start']}"
                    events.append(event)

                reply['success'] = True
                reply['parameters'] = {'norad_id': norad_id, 'hours': hours, 'above_el': above_el,
                                       'step_minutes': step_minutes}
                reply['data'] = events
            else:
                raise Exception(f"Subprocess for calculating next passes failed: {result}")

        except Exception as e:
            logger.error(f'Error fetching next passes for satellite: {norad_id}, error: {e}')
            logger.exception(e)
            reply['success'] = False
            reply['data'] = []

        finally:
            return reply
