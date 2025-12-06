import asyncio
import hashlib
import json
import logging
import multiprocessing
import time
from datetime import datetime
from multiprocessing import Manager
from typing import Any, Dict, List, Union

import numpy as np
from skyfield.api import EarthSatellite, Loader, Topos

import crud
from common.common import ModelEncoder
from db import AsyncSessionLocal

from .passes import calculate_next_events

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
    params_str = json.dumps(
        {
            "tle_groups": tle_groups,
            "homelat": homelat,
            "homelon": homelon,
            "above_el": above_el,
            "step_minutes": step_minutes,
        },
        sort_keys=True,
    )

    # Hash the parameters string to create a compact key
    return hashlib.md5(params_str.encode()).hexdigest()


def _named_worker_init():
    """Initialize worker process with a descriptive name"""
    # Set process title for system monitoring tools
    if HAS_SETPROCTITLE:
        setproctitle.setproctitle("Ground Station - SatellitePassWorker")

    # Set multiprocessing process name
    multiprocessing.current_process().name = "Ground Station - SatellitePassWorker"


def _calculate_elevation_curve(
    satellite_data, home_location, event_start, event_end, extend_start_minutes=0
):
    """
    Calculate elevation curve for a single satellite pass with adaptive sampling.

    :param satellite_data: Dictionary containing satellite TLE data
    :param home_location: Dictionary with 'lat' and 'lon' keys
    :param event_start: ISO format start time string
    :param event_end: ISO format end time string
    :param extend_start_minutes: Minutes to extend before event_start (for first pass in timeline)
    :return: List of dictionaries with 'time' and 'elevation' keys
    """
    try:
        # Initialize Skyfield
        skyfieldloader = Loader("/tmp/skyfield-data")
        ts = skyfieldloader.timescale()

        # Create satellite and observer objects
        satellite = EarthSatellite(
            satellite_data["tle1"],
            satellite_data["tle2"],
            name=f"satellite_{satellite_data['norad_id']}",
        )
        observer = Topos(
            latitude_degrees=float(home_location["lat"]),
            longitude_degrees=float(home_location["lon"]),
        )

        # Parse times for the actual pass
        start_dt = datetime.fromisoformat(event_start.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(event_end.replace("Z", "+00:00"))

        # Extend by requested minutes before (for first pass) and 2 minutes after to ensure curve touches horizon
        from datetime import timedelta

        extended_start_dt = start_dt - timedelta(minutes=max(2, extend_start_minutes))
        extended_end_dt = end_dt + timedelta(minutes=2)

        # Calculate duration including the buffer
        total_duration_seconds = (extended_end_dt - extended_start_dt).total_seconds()

        # Adaptive sampling: aim for ~60-120 points per pass
        # For short passes (< 10 min), sample every 10 seconds
        # For medium passes (10-30 min), sample every 15 seconds
        # For long passes (> 30 min), sample every 30 seconds
        if total_duration_seconds < 600:  # Less than 10 minutes
            sample_interval = 10  # 10 seconds
        elif total_duration_seconds < 1800:  # Less than 30 minutes
            sample_interval = 15  # 15 seconds
        else:  # 30 minutes or more
            sample_interval = 30  # 30 seconds

        # Calculate number of samples
        num_samples = max(int(total_duration_seconds / sample_interval), 2)

        # Create time array including the buffer
        t_start = ts.from_datetime(extended_start_dt)
        t_end = ts.from_datetime(extended_end_dt)
        time_offsets = np.linspace(0, (t_end.tt - t_start.tt), num_samples)
        t_points = t_start + time_offsets

        # Calculate elevation at each time point
        difference = satellite - observer
        all_points = []

        for t in t_points:
            topocentric = difference.at(t)
            alt, az, distance = topocentric.altaz()

            all_points.append(
                {
                    "time": t.utc_iso(),
                    "elevation": round(float(alt.degrees), 2),
                    "azimuth": round(float(az.degrees), 2),
                    "distance": round(float(distance.km), 2),
                }
            )

        # Filter to only include points above horizon, plus interpolate 0° crossing points
        filtered_points: List[Dict[str, Any]] = []

        for i, point in enumerate(all_points):
            if point["elevation"] >= 0:
                # If this is the first positive point and there's a previous point
                if len(filtered_points) == 0 and i > 0:
                    prev_point = all_points[i - 1]
                    if prev_point["elevation"] < 0:
                        # Interpolate to find 0° crossing
                        ratio = (0 - prev_point["elevation"]) / (
                            point["elevation"] - prev_point["elevation"]
                        )

                        # Interpolate time
                        time_diff_seconds = (t_points[i].tt - t_points[i - 1].tt) * 86400
                        interpolated_time = t_points[i - 1].tt + (ratio * time_diff_seconds / 86400)
                        interpolated_t = ts.tt_jd(interpolated_time)

                        filtered_points.append(
                            {
                                "time": interpolated_t.utc_iso(),
                                "elevation": 0.0,
                                "azimuth": round(
                                    prev_point["azimuth"]
                                    + ratio * (point["azimuth"] - prev_point["azimuth"]),
                                    2,
                                ),
                                "distance": round(
                                    prev_point["distance"]
                                    + ratio * (point["distance"] - prev_point["distance"]),
                                    2,
                                ),
                            }
                        )

                # Add the positive elevation point
                filtered_points.append(point)

                # If next point is negative, interpolate the 0° crossing at the end
                if i < len(all_points) - 1:
                    next_point = all_points[i + 1]
                    if next_point["elevation"] < 0:
                        # Interpolate to find 0° crossing
                        ratio = (0 - point["elevation"]) / (
                            next_point["elevation"] - point["elevation"]
                        )

                        # Interpolate time
                        time_diff_seconds = (t_points[i + 1].tt - t_points[i].tt) * 86400
                        interpolated_time = t_points[i].tt + (ratio * time_diff_seconds / 86400)
                        interpolated_t = ts.tt_jd(interpolated_time)

                        filtered_points.append(
                            {
                                "time": interpolated_t.utc_iso(),
                                "elevation": 0.0,
                                "azimuth": round(
                                    point["azimuth"]
                                    + ratio * (next_point["azimuth"] - point["azimuth"]),
                                    2,
                                ),
                                "distance": round(
                                    point["distance"]
                                    + ratio * (next_point["distance"] - point["distance"]),
                                    2,
                                ),
                            }
                        )
                        break  # Stop after adding the last 0° point

        return filtered_points

    except Exception as e:
        logger.error(f"Error calculating elevation curve: {e}")
        logger.exception(e)
        return []


def run_events_calculation(
    satellite_data, homelat, homelon, hours, above_el, step_minutes, use_cache=True
):
    # Set process name if not already set by pool initializer
    current_proc = multiprocessing.current_process()
    if current_proc.name.startswith("ForkPoolWorker"):
        if HAS_SETPROCTITLE:
            setproctitle.setproctitle("Ground Station - SatellitePassWorker")
        current_proc.name = "Ground Station - SatellitePassWorker"

    cache_key = None

    # Extract TLE data for cache key generation (maintaining compatibility with existing cache)
    if isinstance(satellite_data, dict):
        # Single satellite case
        tle_groups_for_cache = [
            [satellite_data["norad_id"], satellite_data["tle1"], satellite_data["tle2"]]
        ]
    elif isinstance(satellite_data, list):
        # Multiple satellites case
        tle_groups_for_cache = []
        for sat in satellite_data:
            if isinstance(sat, dict):
                tle_groups_for_cache.append([sat["norad_id"], sat["tle1"], sat["tle2"]])
            else:
                # Fallback for old format
                tle_groups_for_cache.append(sat)
    else:
        # Fallback for old format (tle_groups directly)
        tle_groups_for_cache = satellite_data

    if use_cache:
        # Generate a unique cache key (without hours) using TLE data for compatibility
        cache_key = _generate_cache_key(
            tle_groups_for_cache, homelat, homelon, hours, above_el, step_minutes
        )

        # Get current time
        current_time = time.time()

        # Check if we have a cached result
        try:
            if cache_key in _cache:
                calculation_time, valid_until, cached_result = _cache[cache_key]

                # Check if the cache is still valid (current time < valid_until)
                if current_time < valid_until:
                    logger.info(
                        f"Using cached satellite pass calculation (key: {cache_key[:8]}...)"
                    )

                    # Return the cached result, adjusting the forecast hours if needed
                    result = {
                        "success": cached_result["success"],
                        "forecast_hours": hours,  # Return the requested hours
                        "data": cached_result["data"],  # Keep all the data
                        "cached": True,
                    }
                    logger.info(
                        f"Returning cached result with {len(cached_result.get('data', []))} events"
                    )
                    return result
            else:
                logger.info(f"Passes cache miss, {cache_key[:8]}... not found in cache")
        except Exception as cache_error:
            logger.error(
                f"Error accessing cache (key: {cache_key[:8]}...), bypassing cache: {cache_error}"
            )

    # Calculate events as before if no cache hit or cache disabled
    logger.info("Calculating satellite passes (cache miss or disabled)")
    events = calculate_next_events(
        satellite_data=satellite_data,  # Pass the full satellite data directly
        home_location={"lat": homelat, "lon": homelon},
        hours=hours,
        above_el=above_el,
        step_minutes=step_minutes,
    )

    events["cached"] = False

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


async def fetch_next_events_for_group(
    group_id: str, hours: float = 2.0, above_el=0, step_minutes=1
):
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

    reply: Dict[str, Union[bool, None, list, Dict]] = {
        "success": None,
        "data": None,
        "parameters": None,
    }
    events = []

    logger.info(
        "Calculating satellite events for group id: "
        + str(group_id)
        + " for next "
        + str(hours)
        + " hours"
    )

    async with AsyncSessionLocal() as dbsession:
        try:
            # Get home location (get first location from list)
            home = await crud.locations.fetch_all_locations(dbsession)

            if not home["data"] or len(home["data"]) == 0:
                raise Exception("No home location found in the database")

            homelat = float(home["data"][0]["lat"])
            homelon = float(home["data"][0]["lon"])

            # Fetch satellite data
            satellites = await crud.satellites.fetch_satellites_for_group_id(dbsession, group_id)
            satellites = json.loads(json.dumps(satellites["data"], cls=ModelEncoder))

            # Create pool with named processes
            with multiprocessing.Pool(processes=1, initializer=_named_worker_init) as pool:
                # Submit the calculation task to the pool, passing the serialized satellites list
                async_result = pool.apply_async(
                    run_events_calculation,
                    (satellites, homelat, homelon, hours, above_el, step_minutes),
                )
                result = await asyncio.get_event_loop().run_in_executor(None, async_result.get)

            if result.get("success", False):
                events_data = result.get("data", [])

                # Create a lookup dict for satellite names, transmitters and counts
                satellite_info = {
                    sat["norad_id"]: {
                        "name": sat["name"],
                        "transmitters": sat.get("transmitters", []),
                        "transmitter_count": len([t for t in sat.get("transmitters", [])]),
                    }
                    for sat in satellites
                }

                # Add satellite names, transmitters and counts to events
                for event in events_data:
                    event["name"] = satellite_info[event["norad_id"]]["name"]
                    event["transmitters"] = satellite_info[event["norad_id"]]["transmitters"]
                    event["transmitter_count"] = satellite_info[event["norad_id"]][
                        "transmitter_count"
                    ]
                    event["id"] = f"{event['id']}_{event['norad_id']}_{event['event_start']}"
                    events.append(event)

                reply["success"] = True
                reply["parameters"] = {
                    "group_id": group_id,
                    "hours": hours,
                    "above_el": above_el,
                    "step_minutes": step_minutes,
                }
                reply["data"] = events
                reply["forecast_hours"] = result.get("forecast_hours", hours)
                reply["cached"] = result.get("cached", False)

            else:
                raise Exception(f"Subprocess for calculating next passes failed: {result}")

        except Exception as e:
            logger.error(f"Error fetching next passes for group: {group_id}, error: {e}")
            logger.exception(e)
            reply["success"] = False
            reply["data"] = []

        finally:
            pass

    return reply


async def fetch_next_events_for_satellite(
    norad_id: int, hours: float = 2.0, above_el=0, step_minutes=1
):
    """
    This function fetches the next satellite events for a specified satellite within a specified
    time frame. This function calculates the satellite events over a defined number
    of hours, altitude threshold, and minute step interval. Each event includes an elevation
    curve with adaptive sampling (30s for short passes, up to 2min for long passes).

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
        and the list of satellite events with elevation curves.
    :rtype: dict
    """

    assert norad_id, f"NORAD ID is required ({norad_id}, {type(norad_id)})"

    reply: Dict[str, Union[bool, None, list, Dict]] = {
        "success": None,
        "data": None,
        "parameters": None,
        "cached": False,
    }
    events = []

    logger.info(f"Calculating satellite events for NORAD ID: {norad_id} for next {hours} hours")
    async with AsyncSessionLocal() as dbsession:
        try:
            # Get home location (get first location from list)
            home = await crud.locations.fetch_all_locations(dbsession)

            if not home["data"] or len(home["data"]) == 0:
                raise Exception("No home location found in the database")

            homelat = float(home["data"][0]["lat"])
            homelon = float(home["data"][0]["lon"])

            # Fetch satellite data
            satellite_reply = await crud.satellites.fetch_satellites(dbsession, norad_id=norad_id)
            satellite = json.loads(json.dumps(satellite_reply["data"][0], cls=ModelEncoder))

            # Create a pool with named processes
            with multiprocessing.Pool(processes=1, initializer=_named_worker_init) as pool:
                # Submit the calculation task to the pool, passing the serialized satellite dict
                async_result = pool.apply_async(
                    run_events_calculation,
                    (satellite, homelat, homelon, hours, above_el, step_minutes),
                )
                result = await asyncio.get_event_loop().run_in_executor(None, async_result.get)

            if result.get("success", False):
                events_for_satellite = result.get("data", [])
                home_location = {"lat": homelat, "lon": homelon}

                # Get current time to determine which passes should be extended
                from datetime import datetime
                from datetime import timezone as dt_timezone

                current_time = datetime.now(dt_timezone.utc)

                for idx, event in enumerate(events_for_satellite):
                    event["name"] = satellite["name"]
                    event["id"] = f"{event['id']}_{satellite['norad_id']}_{event['event_start']}"

                    # Extend passes that are happening now or will happen soon
                    # Check if pass is active or upcoming within 2 hours
                    event_start = datetime.fromisoformat(
                        event["event_start"].replace("Z", "+00:00")
                    )
                    event_end = datetime.fromisoformat(event["event_end"].replace("Z", "+00:00"))

                    # Calculate time until pass starts (negative if already started)
                    time_until_start = (event_start - current_time).total_seconds() / 60  # minutes
                    # Calculate time since pass ended (negative if not yet ended)
                    time_since_end = (current_time - event_end).total_seconds() / 60  # minutes

                    # Extend if: pass is active OR starts within next 2 hours OR ended less than 30 min ago
                    should_extend = (time_until_start <= 120) and (time_since_end <= 30)
                    extend_start_minutes = 30 if should_extend else 0

                    # Calculate elevation curve for this pass
                    elevation_curve = _calculate_elevation_curve(
                        satellite,
                        home_location,
                        event["event_start"],
                        event["event_end"],
                        extend_start_minutes=extend_start_minutes,
                    )
                    event["elevation_curve"] = elevation_curve

                    events.append(event)

                reply["success"] = True
                reply["parameters"] = {
                    "norad_id": norad_id,
                    "hours": hours,
                    "above_el": above_el,
                    "step_minutes": step_minutes,
                }
                reply["data"] = events
                reply["cached"] = result.get("cached", False)
                reply["forecast_hours"] = result.get("forecast_hours", hours)

            else:
                raise Exception(f"Subprocess for calculating next passes failed: {result}")

        except Exception as e:
            logger.error(f"Error fetching next passes for satellite: {norad_id}, error: {e}")
            logger.exception(e)
            reply["success"] = False
            reply["data"] = []

        finally:
            pass

    return reply
