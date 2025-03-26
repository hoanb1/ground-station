import json
import numpy as np
import crud
from common import timeit, async_timeit
from skyfield.api import Loader, Topos, EarthSatellite
from db import engine, AsyncSessionLocal
from app import logger, SkyFieldLoader
from models import ModelEncoder


@async_timeit
async def fetch_next_events(norad_id: int, hours: float = 24.0, above_el = 0, step_minutes = 0.5) -> dict:

    reply = {'success': None, 'data': None}
    events = []

    logger.info("Calculating satellite events for norad id: " + str(norad_id) + " for next " + str(hours) + " hours.")

    async with AsyncSessionLocal() as dbsession:
        ts = SkyFieldLoader.timescale()
        satellite_data = await crud.fetch_satellites(dbsession, norad_id)
        satellite_data = json.loads(json.dumps(satellite_data, cls=ModelEncoder))

        satellite = EarthSatellite(
            satellite_data['data'][0]['tle1'],
            satellite_data['data'][0]['tle2'],
            name=satellite_data['data'][0]['name']
        )

        # get home location
        home = await crud.fetch_location_for_userid(dbsession, user_id=None)
        home = json.loads(json.dumps(home, cls=ModelEncoder))
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


async def fetch_next_events_for_group(group_id: str, hours: float = 2.0, above_el = 0, step_minutes = 1):

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