import json
import logging
import numpy as np
from common import async_timeit
from skyfield.api import Loader, Topos, EarthSatellite
from models import ModelEncoder
from skyfield.api import load, wgs84, EarthSatellite
from typing import List, Dict, Union, Tuple, Optional


logger = logging.getLogger('passes-worker')

def calculate_next_events(tle_groups: list[list[str]], home_location: dict[str, float], hours: float = 6.0,
                          above_el=0, step_minutes=0.5) -> dict:
    """
    This function calculates upcoming satellite observation events based on TLE lines, observation location,
    duration, elevation threshold, and time step. The function computes satellite
    pass details like start and end times, maximum altitude, and relative distances
    for an observer at the specified ground position.

    :param tle_groups: List of lists containing three strings each: [norad_id, TLE line 1, TLE line 2]
    :param home_location: Dictionary containing 'lat' and 'lon' keys with float values for observer location
    :param hours: Observation duration in hours.
    :param above_el: Minimum elevation angle (in degrees) above the horizon for
        an event to be considered. Default is 0.
    :param step_minutes: Time step in minutes for evaluating satellite positions.
        Smaller time steps increase calculation accuracy. Default is 0.5 minutes.
    :return: Dictionary containing the calculated satellite pass events,
        parameters used for computation, and a success flag.
    :rtype: dict
    """

    reply: dict[str, Union[bool, None, list, None, dict, str]] = {'success': None, 'data': None, 'parameters': None, 'error': None}
    events = []

    logger.info(f"Calculating passes for {len(tle_groups)} satellites for the next {hours} hours.")

    try:
        assert isinstance(tle_groups, list), "tle_groups must be a list of lists"
        assert all(len(group) == 3 for group in tle_groups), "Each TLE group must contain norad_id and 2 TLE lines"
        assert isinstance(home_location, dict), "home_location must be a dictionary"
        assert 'lat' in home_location and 'lon' in home_location, "home_location must contain 'lat' and 'lon' keys"

        # set a temporary folder for the skyfield library to do its thing
        skyfieldloader = Loader('/tmp/skyfield-data')  # or any preferred path
        ts = skyfieldloader.timescale()

        homelat = float(home_location['lat'])
        homelon = float(home_location['lon'])

        # Coordinates can be in decimal degrees:
        observer = Topos(latitude_degrees=homelat, longitude_degrees=homelon)

        # Build a time range for pass calculation
        t0 = ts.now()
        t1 = ts.now().utc_jpl()  # Just for reference in printing
        t_end = t0 + (hours / 24.0)

        # Step through times. Typically, you'll choose a reasonable step size (e.g., 1 minute):
        t_points = t0 + (np.arange(0, int(hours) * 60, step_minutes) / (24.0 * 60.0))

        event_id = 1
        for tle_group in tle_groups:
            norad_id, line1, line2 = tle_group

            satellite = EarthSatellite(
                line1,
                line2,
                name=f"satellite_{norad_id}"
            )

            # For each time, compute altitude above observer. We subtract the observer (Topos) from the satellite to
            # get the satellite's position relative to the observer, then do `.altaz()` to get altitude.
            difference = satellite - observer
            altitudes = []
            azimuths = []
            distances = []
            for t in t_points:
                topocentric = difference.at(t)
                alt, az, distance = topocentric.altaz()
                altitudes.append(alt.degrees)
                azimuths.append(az.degrees)
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
                    pass_end_index = i - 1  # last index when above the horizon
                    passes.append((pass_start_index, pass_end_index))

            # If the last pass goes until the end of the array, close it out
            if in_pass:
                passes.append((pass_start_index, len(above_horizon) - 1))

            # Print out pass start/end times
            for start_i, end_i in passes:
                start_time = t_points[start_i]
                end_time = t_points[end_i]
                dist_start = distances[start_i]
                dist_end = distances[end_i]
                duration = end_time.utc_datetime() - start_time.utc_datetime()

                # Extract the slice of data for this pass
                pass_altitudes = altitudes[start_i:end_i + 1]
                pass_azimuths = azimuths[start_i:end_i + 1]
                pass_distances = distances[start_i:end_i + 1]

                # Calculate max elevation and max/min azimuth
                max_elevation = max(pass_altitudes)
                min_azimuth = min(pass_azimuths)
                max_azimuth = max(pass_azimuths)

                events.append({
                    'id': event_id,
                    'norad_id': norad_id,
                    'event_start': start_time.utc_iso(),
                    'event_end': end_time.utc_iso(),
                    'duration': duration,
                    'distance_at_start': dist_start,
                    'distance_at_end': dist_end,
                    'distance_at_peak': max(pass_distances),
                    'peak_altitude': max_elevation,
                    'max_azimuth': max_azimuth,
                    'min_azimuth': min_azimuth
                })
                event_id += 1

        events = json.loads(json.dumps(events, cls=ModelEncoder))

        reply['data'] = events
        reply['parameters'] = {'tle_count': len(tle_groups), 'hours': hours, 'above_el': above_el,
                               'step_minutes': step_minutes}
        reply['success'] = True

    except Exception as e:
        logger.error(f"Failed to calculate satellite events, error: {e}")
        logger.exception(e)
        reply['success'] = False
        reply['error'] = str(e)

    finally:
        pass

    return reply