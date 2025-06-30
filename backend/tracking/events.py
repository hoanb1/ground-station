import json
import time
import hashlib
import multiprocessing
import crud
import asyncio
import logging
from db import AsyncSessionLocal
from db.models import ModelEncoder
from typing import Union
from .passes import calculate_next_events
from multiprocessing import Manager

# Add setproctitle import for process naming
try:
    import setproctitle
    HAS_SETPROCTITLE = True
except ImportError:
    HAS_SETPROCTITLE = False

# Create logger
logger = logging.getLogger("passes-worker")

# Create a manager for shared objects
manager = Manager()

# Create a shared dictionary
_cache = manager.dict()


def _generate_cache_key(tle_groups, homelat, homelon, hours, above_el, step_minutes):
    """Generate a unique cache key from function parameters, excluding hours"""
    # Create a string representation of the parameters, excluding hours
    # since we'll handle time separately
    params_str = json.dumps({
        "tle_groups": tle_groups,
        "homelat": homelat,
        "homelon": homelon,
        "above_el": above_el,
        "step_minutes": step_minutes
    }, sort_keys=True)

    # Hash the parameters string to create a compact key
    return hashlib.md5(params_str.encode()).hexdigest()


def _named_worker_init():
    """Initialize worker process with a descriptive name"""
    # Set process title for system monitoring tools
    if HAS_SETPROCTITLE:
        setproctitle.setproctitle("Ground Station - SatellitePassWorker")

    # Set multiprocessing process name
    multiprocessing.current_process().name = "Ground Station - SatellitePassWorker"


def run_events_calculation(tle_groups, homelat, homelon, hours, above_el, step_minutes, use_cache=True):
    # Set process name if not already set by pool initializer
    current_proc = multiprocessing.current_process()
    if current_proc.name.startswith('ForkPoolWorker'):
        if HAS_SETPROCTITLE:
            setproctitle.setproctitle("Ground Station - SatellitePassWorker")
        current_proc.name = "Ground Station - SatellitePassWorker"

    cache_key = None

    if use_cache:
        # Generate a unique cache key (without hours)
        cache_key = _generate_cache_key(tle_groups, homelat, homelon, hours, above_el, step_minutes)

        # Get current time
        current_time = time.time()

        # Check if we have a cached result
        if cache_key in _cache:
            calculation_time, valid_until, cached_result = _cache[cache_key]

            # Check if the cache is still valid (current time < valid_until)
            if current_time < valid_until:
                logger.info(f"Using cached satellite pass calculation (key: {cache_key[:8]}...)")

                # Return the cached result, adjusting the forecast hours if needed
                return {
                    "success": cached_result["success"],
                    "forecast_hours": hours,  # Return the requested hours
                    "data": cached_result["data"],  # Keep all the data
                    "cached": True,
                }
        else:
            logger.info(f"Passes cache miss, {cache_key[:8]}... not found in cache")

    # Calculate events as before if no cache hit or cache disabled
    logger.info("Calculating satellite passes (cache miss or disabled)")
    events = calculate_next_events(
        tle_groups=tle_groups,
        home_location={"lat": homelat, "lon": homelon},
        hours=hours,
        above_el=above_el,
        step_minutes=step_minutes
    )

    events['cached'] = False

    # Enrich the events result with the forecast window
    if isinstance(events, dict):
        events["forecast_hours"] = hours

    # Store the result in cache if caching is enabled
    if use_cache:
        # Calculate how long this calculation is valid for, hours / 2
        validity_period = int((hours / 4) * 3600)
        valid_until = time.time() + validity_period

        _cache[cache_key] = (time.time(), valid_until, events)

        # Optional: Clean up expired cache entries
        for k in list(_cache.keys()):
            if time.time() > _cache[k][1]:  # If the current time is past valid_until
                del _cache[k]

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

            if home['data'] is None:
                raise Exception("No home location found in the database")

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

            # Create pool with named processes
            with multiprocessing.Pool(processes=1, initializer=_named_worker_init) as pool:
                # Submit the calculation task to the pool
                result = await asyncio.get_event_loop().run_in_executor(
                    None,
                    pool.apply,
                    run_events_calculation,
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
                    event['id'] = f"{event['id']}_{event['norad_id']}_{event['event_start']}"
                    events.append(event)

                reply['success'] = True
                reply['parameters'] = {'group_id': group_id, 'hours': hours, 'above_el': above_el,
                                       'step_minutes': step_minutes}
                reply['data'] = events
                reply['forecast_hours'] = result.get('forecast_hours', hours)
                reply['cached'] = result.get('cached', False)

            else:
                raise Exception(f"Subprocess for calculating next passes failed: {result}")

        except Exception as e:
            logger.error(f'Error fetching next passes for group: {group_id}, error: {e}')
            logger.exception(e)
            reply['success'] = False
            reply['data'] = []

        finally:
            pass

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

    reply: dict[str, Union[bool, None, list, dict]] = {'success': None, 'data': None, 'parameters': None, 'cached': False}
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

            # Create pool with named processes
            with multiprocessing.Pool(processes=1, initializer=_named_worker_init) as pool:
                # Submit the calculation task to the pool
                result = await asyncio.get_event_loop().run_in_executor(
                    None,
                    pool.apply,
                    run_events_calculation,
                    (tle_group, homelat, homelon, hours, above_el, step_minutes)
                )

            if result.get('success', False):
                events_for_satellite = result.get('data', [])
                for event in events_for_satellite:
                    event['name'] = satellite['name']
                    event['id'] = f"{event['id']}_{satellite['norad_id']}_{event['event_start']}"
                    events.append(event)

                reply['success'] = True
                reply['parameters'] = {
                    'norad_id': norad_id,
                    'hours': hours,
                    'above_el': above_el,
                    'step_minutes': step_minutes
                }
                reply['data'] = events
                reply['cached'] = result.get('cached', False)
                reply['forecast_hours'] = result.get('forecast_hours', hours)

            else:
                raise Exception(f"Subprocess for calculating next passes failed: {result}")

        except Exception as e:
            logger.error(f'Error fetching next passes for satellite: {norad_id}, error: {e}')
            logger.exception(e)
            reply['success'] = False
            reply['data'] = []

        finally:
            pass

    return reply