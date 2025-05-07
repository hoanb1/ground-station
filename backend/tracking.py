import json
import multiprocessing
import pprint
import crud
import asyncio
import socketio
import numpy as np
from io import StringIO
from datetime import UTC
import math
from common import is_geostationary, serialize_object
from skyfield.api import Topos
from db import AsyncSessionLocal
from logger import logger
from models import ModelEncoder
from exceptions import AzimuthOutOfBounds, ElevationOutOfBounds, MinimumElevationError
from controllers.rotator import RotatorController
from controllers.rig import RigController
from controllers.sdr import SDRController
from arguments import arguments as args
from statetracker import StateTracker
from skyfield.api import load, wgs84, EarthSatellite
from datetime import datetime, timedelta
from typing import List, Dict, Union, Tuple
from footprint import get_satellite_coverage_circle
from passes import calculate_next_events



def pretty_dict(d):
    # Create a string buffer and pretty print the dict to it
    output = StringIO()
    pprint.pprint(d, stream=output)
    # Get the string value and return it without the last newline
    return output.getvalue().rstrip()


def calculate_doppler_shift(tle_line1, tle_line2, observer_lat, observer_lon, observer_elevation,
                            transmitted_freq_hz, time=None):
    """
    Calculate the Doppler shift for a satellite at a given time.

    Parameters:
    -----------
    tle_line1, tle_line2 : str
        The two-line element set for the satellite
    observer_lat, observer_lon : float
        Observer's latitude and longitude in degrees
    observer_elevation : float
        Observer's elevation in meters
    transmitted_freq_mhz : float
        Transmitted frequency in MHz
    time : skyfield.timelib.Time, optional
        Time of observation, defaults to current time

    Returns:
    --------
    observed_freq_mhz : float
        The Doppler-shifted frequency in MHz
    doppler_shift_hz : float
        The Doppler shift in Hz
    """
    # Load the timescale
    ts = load.timescale()

    # Set the time (now if not specified)
    if time is None:
        time = ts.now()

    # Create satellite object from TLEs
    satellite = EarthSatellite(tle_line1, tle_line2, name='Satellite', ts=ts)

    # Define the ground station
    topos = Topos(latitude_degrees=observer_lat,
                  longitude_degrees=observer_lon,
                  elevation_m=observer_elevation)

    # Get the difference directly using the observation from the topos
    difference = satellite - topos

    # Calculate position at the specified time
    topocentric = difference.at(time)

    # Get the range rate (radial velocity) in km/s
    # The radial_velocity needs to be accessed from the velocity property
    # First, get the position and velocity vectors
    pos, vel = topocentric.position.km, topocentric.velocity.km_per_s

    # Calculate the radial velocity (component of velocity along the line of sight)
    # This is done by taking the dot product of the unit position vector and velocity vector
    pos_unit = pos / np.sqrt(np.sum(pos ** 2))  # Normalize position to get unit vector
    range_rate = np.dot(pos_unit, vel)  # Dot product gives radial component

    # Speed of light in km/s
    c = 299792.458  # speed of light in km/s

    # Calculate Doppler shift
    doppler_factor = 1.0 - (range_rate / c)

    # Calculate observed frequency
    observed_freq_hz = transmitted_freq_hz * doppler_factor

    # Calculate the shift in Hz
    doppler_shift_hz = observed_freq_hz - transmitted_freq_hz

    return round(float(observed_freq_hz), 2), round(float(doppler_shift_hz), 2)


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

            # Create subprocess to run calculate_next_events
            process = await asyncio.create_subprocess_exec(
                'python', '-c',
                f'''
import asyncio
import json
from passes import calculate_next_events

async def run():
    events = await calculate_next_events(
        tle_groups={tle_group},
        home_location={{"lat": {homelat}, "lon": {homelon}}},
        hours={hours},
        above_el={above_el}, 
        step_minutes={step_minutes}
    )
    print(json.dumps(events))

asyncio.run(run())
                ''',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            logger.info("******")
            logger.info(stdout)
            logger.info("******")

            if process.returncode == 0:
                events_reply = json.loads(stdout.decode())
                events_for_satellite = events_reply.get('data', [])
                for event in events_for_satellite:
                    event['name'] = satellite['name']
                    event['id'] = f"{satellite['norad_id']}_{event['event_start']}"
                    events.append(event)

                reply['success'] = True
                reply['parameters'] = {'norad_id': norad_id, 'hours': hours, 'above_el': above_el,
                                       'step_minutes': step_minutes}
                reply['data'] = events
            else:
                raise Exception(f"Subprocess failed: {stderr.decode()}")

        except Exception as e:
            logger.error(f'Error fetching next passes for satellite: {norad_id}, error: {e}')
            logger.exception(e)
            reply['success'] = False
            reply['data'] = []

        finally:
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
        'transmitters': [],
        'group_id': None,
        'norad_id': None,
        'rotator_id': 'none',
        'rig_id': 'none',
        'transmitter_id': 'none'
    }

    try:
        async with (AsyncSessionLocal() as dbsession):
            groups = await crud.fetch_satellite_group(dbsession)
            satellites = await crud.fetch_satellites_for_group_id(dbsession, group_id=group_id)
            tracking_state = await crud.get_satellite_tracking_state(dbsession, name='satellite-tracking')
            transmitters = await crud.fetch_transmitters_for_satellite(dbsession, norad_id=norad_id)
            data['groups'] = groups['data']
            data['satellites'] = satellites['data']
            data['group_id'] = group_id
            data['norad_id'] = norad_id
            data['rig_id'] = tracking_state['data']['value'].get('rig_id', "")
            data['rotator_id'] = tracking_state['data']['value'].get('rotator_id', "")
            data['transmitter_id'] = tracking_state['data']['value'].get('transmitter_id', "")
            data['transmitters'] = transmitters['data']
            reply['success'] = True
            reply['data'] = data

    except Exception as e:
        logger.error(f"Failed to get tracker state for group id: {group_id}, satellite id: {norad_id}, error: {e}")
        logger.exception(e)

    finally:
        return reply


def get_satellite_path(tle: List[str], duration_minutes: float, step_minutes: float = 1.0) -> Dict[
    str, List[List[Dict[str, float]]]]:
    """
    Computes the satellite's past and future path coordinates from its TLE.
    The path is computed at a fixed time step and then split into segments so that
    no segment contains a line crossing the dateline (+180 or -180 longitude).

    Args:
        tle: A list containing two TLE lines [line1, line2]
        duration_minutes: The projection duration (in minutes) for both past and future
        step_minutes: The time interval in minutes between coordinate samples

    Returns:
        An object with two properties:
        {
            'past': [[{lat, lon}], ...],
            'future': [[{lat, lon}], ...]
        }
        Each segment is a list of coordinate points that don't cross the dateline
    """

    try:
        # Load time scale
        ts = load.timescale()

        # Create satellite object from TLE
        if len(tle) != 2:
            raise ValueError("TLE must contain exactly two lines")

        satellite = EarthSatellite(tle[0], tle[1], 'Satellite', ts)

        # Get current time
        now = datetime.now(UTC)
        now_time = ts.utc(now.year, now.month, now.day,
                          now.hour, now.minute, now.second + now.microsecond / 1e6)

        past_points = []
        future_points = []
        step_td = timedelta(minutes=step_minutes)

        # Compute past points: from (now - durationMinutes) up to now (inclusive)
        past_start = now - timedelta(minutes=duration_minutes)
        current = past_start

        while current <= now:
            time = ts.utc(current.year, current.month, current.day,
                          current.hour, current.minute, current.second + current.microsecond / 1e6)

            geocentric = satellite.at(time)
            subpoint = wgs84.subpoint(geocentric)

            lat = float(subpoint.latitude.degrees)
            lon = normalize_longitude(float(subpoint.longitude.degrees))

            past_points.append({'lat': lat, 'lon': lon})
            current += step_td

        # Compute future points: from now up to (now + durationMinutes) (inclusive)
        future_end = now + timedelta(minutes=duration_minutes)
        current = now

        while current <= future_end:
            time = ts.utc(current.year, current.month, current.day,
                          current.hour, current.minute, current.second + current.microsecond / 1e6)

            geocentric = satellite.at(time)
            subpoint = wgs84.subpoint(geocentric)

            lat = float(subpoint.latitude.degrees)
            lon = normalize_longitude(float(subpoint.longitude.degrees))

            future_points.append({'lat': lat, 'lon': lon})
            current += step_td

        # Split the past and future arrays into segments to avoid drawing lines across the dateline
        past_segments = split_at_dateline(past_points)
        future_segments = split_at_dateline(future_points)

        return {'past': past_segments, 'future': future_segments}

    except Exception as e:
        print(f"Error computing satellite paths: {str(e)}")
        return {'past': [], 'future': []}


def normalize_longitude(lon: float) -> float:
    """
    Normalize longitude to be in the range [-180, 180].

    Args:
        lon: The longitude value to normalize

    Returns:
        The normalized longitude value
    """
    while lon > 180:
        lon -= 360
    while lon < -180:
        lon += 360
    return lon


def split_at_dateline(points: List[Dict[str, float]]) -> List[List[Dict[str, float]]]:
    """
    Splits a list of coordinate points into segments so that no segment
    crosses the international date line (longitude ±180°).

    Args:
        points: A list of coordinate dictionaries with 'lat' and 'lon' keys

    Returns:
        A list of segments, where each segment is a list of coordinate points
    """
    if not points:
        return []

    segments = []
    current_segment = [points[0]]

    for i in range(1, len(points)):
        prev_point = points[i - 1]
        current_point = points[i]

        # Check if we cross the dateline (large longitude change)
        if abs(current_point['lon'] - prev_point['lon']) > 180:
            # End the current segment
            segments.append(current_segment)
            # Start a new segment
            current_segment = [current_point]
        else:
            # Add point to the current segment
            current_segment.append(current_point)

    # Add the last segment if it's not empty
    if current_segment:
        segments.append(current_segment)

    return segments


async def compiled_satellite_data(dbsession, norad_id) -> dict:
    """
    Compiles detailed information about a satellite, including its orbital details,
    transmitters, and sky position based on tracking data and user's location.

    :param dbsession: Database session object used to interact with the database
    :param norad_id: Tracking state dictionary containing satellite tracking data
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
        'paths': {
            'past': [],
            'future': []
        },
        'coverage': [],
        'transmitters': [],
    }

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

    # get target map settings
    target_map_settings_reply = await crud.get_map_settings(dbsession, 'target-map-settings')
    target_map_settings = target_map_settings_reply['data'].get('value', {})

    # fetch transmitters
    transmitters = await crud.fetch_transmitters_for_satellite(dbsession, norad_id=norad_id)
    satellite_data['transmitters'] = transmitters['data']

    location = await crud.fetch_location_for_userid(dbsession, user_id=None)
    if location.get('success', False) is False:
        raise Exception(f"No location found in the db for user id None, please set one")

    # get current position
    position = await asyncio.to_thread(get_satellite_position_from_tle, [
        satellite_data['details']['name'],
        satellite_data['details']['tle1'],
        satellite_data['details']['tle2']
    ])

    # get position in the sky
    home_lat = location['data']['lat']
    home_lon = location['data']['lon']
    sky_point = await asyncio.to_thread(get_satellite_az_el, home_lat, home_lon, satellite['data'][0]['tle1'],
                                        satellite['data'][0]['tle2'], datetime.now(UTC))

    # calculate paths
    paths = await asyncio.to_thread(get_satellite_path, [
        satellite_data['details']['tle1'],
        satellite_data['details']['tle2']
    ], duration_minutes=int(target_map_settings.get('orbitProjectionDuration', 240)), step_minutes=0.5)

    satellite_data['paths'] = paths

    satellite_data['coverage'] = await asyncio.to_thread(get_satellite_coverage_circle,
                                                         position['lat'],
                                                         position['lon'],
                                                         position['alt'] / 1000,
                                                         num_points=300
                                                         )

    satellite_data['position'] = position
    position['az'] = sky_point[0]
    position['el'] = sky_point[1]

    # # calculate elevation and azimuth on LOS and AOS
    # satellite_data['nextPass'] = await asyncio.to_thread(calculate_next_pass,
    #     [satellite_data['details']['tle1'], satellite_data['details']['tle2']],
    #     location['data']['lat'],
    #     location['data']['lon'],
    #     0,
    # )

    satellite_data = serialize_object(satellite_data)
    
    return satellite_data


async def satellite_tracking_task(sio: socketio.AsyncServer, stop_event=None):
    """
    Periodically tracks and transmits satellite position and details along with user location data
    to the browser using Socket.IO.

    This function performs satellite tracking by retrieving tracking states, determining current
    satellite position, and calculating azimuth and elevation values based on user geographic
    location. Data retrieval is achieved through database queries for satellite and user
    information, and updates are transmitted via a Socket.IO communication channel.

    :param stop_event:
    :param stop_event:
    :param sio: The Socket.IO server instance for emitting satellite tracking data asynchronously.
    :type sio: socketio.AsyncServer
    :return: None
    """

    # check interval value, should be between 2 and 5 (including)
    assert 1 < args.track_interval < 6, f"track_interval must be between 2 and 5, got {args.track_interval}"

    azimuthlimits = (0, 360)
    eleveationlimits = (0, 90)
    minelevation = 10.0
    previous_rotator_state = None
    rotator_controller = None
    rig_controller = None
    current_rotator_id = None
    rotator_data = {
        'az': 0,
        'el': 0,
        'connected': False,
        'tracking': False,
        'slewing': False,
        'outofbounds': False,
        'minelevation': False
    }
    rig_data = {
        'connected': False,
        'tracking': False,
        'frequency': 0,
        'observed_freq': 0, # hz
        'doppler_shift': 0, # hz
        'original_freq': 0, # hz
    }
    notified = {}
    is_slewing = False


    def in_tracking_state():
        if current_rotator_state == "tracking":
            return True
        else:
            return False

    async def handle_satellite_change(old, new):
        nonlocal notified, rotator_data

        logger.info(f"Target satellite change detected from '{old}' to '{new}'")

        # reset the minelevation error
        rotator_data['minelevation'] = False

        notified = {}
        await sio.emit('satellite-tracking', {'events': [
            {'name': "norad_id_change", 'old': old, 'new': new},
        ]})


    async def connect_to_rotator():
        """
        Check if rotator_controller is set up, if not set it up.
        :return:
        """
        nonlocal rotator_controller
        if current_rotator_id is not None and rotator_controller is None:
            # rotator_controller was selected, and a rotator_controller is not setup, set it up now
            try:
                rotator_details_reply = await crud.fetch_rotators(dbsession, rotator_id=current_rotator_id)
                rotator_details = rotator_details_reply['data']
                rotator_controller = RotatorController(host=rotator_details['host'], port=rotator_details['port'])
                await rotator_controller.connect()
                rotator_data['connected'] = True
                await sio.emit('satellite-tracking', {
                    'events': [{'name': "rotator_connected"}],
                    'rotator_data': rotator_data
                })

            except Exception as e:
                logger.error(f"Failed to connect to rotator_controller: {e}")
                logger.exception(e)
                await sio.emit('satellite-tracking', {'events': [
                    {'name': "rotator_error", "error": str(e)}
                ]})
                rotator_controller = None


    async def handle_rotator_state_change(old, new):
        nonlocal rotator_controller

        logger.info(f"Rotator state change detected from '{old}' to '{new}'")

        # reset the minelevation error
        rotator_data['minelevation'] = False
        if new == "connected":
            # check what hardware was chosen and set it up
            await connect_to_rotator()
            rotator_data['connected'] = True

        elif new == "tracking":
            # check what hardware was chosen and set it up
            await connect_to_rotator()
            rotator_data['tracking'] = True

        elif new == "stopped":
            # check what hardware was chosen and set it up
            await connect_to_rotator()
            rotator_data['tracking'] = False

        elif new == "disconnected":

            if rotator_controller is not None:
                logger.info(f"Disconnecting from rotator_controller at {rotator_controller.host}:{rotator_controller.port}...")
                try:
                    await rotator_controller.disconnect()
                    rotator_data['connected'] = False
                    await sio.emit('satellite-tracking', {
                        'events': [{'name': "rotator_disconnected"}],
                        'rotator_data': rotator_data
                    })

                except Exception as e:
                    logger.error(f"Error disconnecting from rotator_controller: {e}")
                    logger.exception(e)

                finally:
                    # Set to None regardless of disconnect success
                    rotator_controller = None

        elif new == "parked":
            rotator_data['tracking'] = False

            try:
                # going to park position
                park_reply = await rotator_controller.park()

                if park_reply:
                    rotator_data['parked'] = True
                    await sio.emit('satellite-tracking', {
                        'events': [{'name': "rotator_parked"}],
                        'rotator_data': rotator_data
                    })
                else:
                    raise Exception("Failed to park rotator")

            except Exception as e:
                logger.error(f"Failed to park rotator: {e}")
                logger.exception(e)

        else:
            logger.error(f"unknown tracking state: {new}")


    async def handle_rotator_id_change(old, new):
        logger.info(f"Rotator ID change detected from '{old}' to '{new}'")


    async def connect_to_rig():
        """
        If rig_controller is not set up yet, set it up.
        Handles both hardware rigs and SDR devices.
        :return:
        """
        nonlocal rig_controller
        # check what hardware was chosen and set it up
        if current_rig_id is not None and rig_controller is None:
            # rig_controller was selected, and a rig_controller is not setup, set it up now
            try:
                # Try fetching hardware rig details first
                rig_details_reply = await crud.fetch_rigs(dbsession, rig_id=current_rig_id)

                if rig_details_reply.get('data') is not None:
                    rig_type = 'radio'

                else:
                    # If hardware Rig not found, try fetching SDR details
                    rig_details_reply = await crud.fetch_sdr(dbsession, sdr_id=current_rig_id)
                    if not rig_details_reply.get('data'):
                        raise Exception(f"No hardware radio rig or SDR device found with ID: {current_rig_id}")
                    else:
                        rig_type = 'sdr'

                rig_details = rig_details_reply['data']

                # Handle different device types
                if rig_type == 'sdr':
                    rig_controller = SDRController(sdr_details=rig_details)
                else:
                    rig_controller = RigController(host=rig_details['host'], port=rig_details['port'])

                await rig_controller.connect()
                rig_data['connected'] = True
                rig_data['device_type'] = rig_details.get('type', 'hardware')
                await sio.emit('satellite-tracking', {
                    'events': [{'name': "rig_connected"}],
                    'rig_data': rig_data
                })

            except Exception as e:
                logger.error(f"Failed to connect to rig_controller: {e}")
                logger.exception(e)
                await sio.emit('satellite-tracking', {'events': [
                    {'name': "rig_error", "error": str(e)}
                ]})
                rig_controller = None


    async def handle_rig_state_change(old, new):
        nonlocal rig_controller

        logger.info(f"Rig state change detected from '{old}' to '{new}'")

        if new == "connected":
            # check what hardware was chosen and set it up
            await connect_to_rig()
            rig_data['connected'] = True

        elif new == "disconnected":
            # disconnected rig_controller
            if rig_controller is not None:
                logger.info(f"Disconnecting from rig...")
                try:
                    await rig_controller.disconnect()
                    rig_data['connected'] = False
                    await sio.emit('satellite-tracking', {
                        'events': [{'name': "rig_disconnected"}],
                        'rig_data': rig_data
                    })

                except Exception as e:
                    logger.error(f"Error disconnecting from rig_controller: {e}")
                    logger.exception(e)

                finally:
                    # Set to None regardless of disconnect success
                    rig_controller = None

        elif new == "tracking":
            # check what hardware was chosen and set it up
            await connect_to_rig()
            rig_data['tracking'] = True

        elif new == "stopped":
            # check what hardware was chosen and set it up
            await connect_to_rig()
            rotator_data['tracking'] = False


    async def handle_transmitter_id_change(old, new):
        logger.info(f"Transmitter ID change detected from '{old}' to '{new}'")

    async def handle_rig_id_change(old, new):
        logger.info(f"Rig ID change detected from '{old}' to '{new}'")

    # check if satellite was changed in the UI and send a message/event
    norad_id_change_tracker = StateTracker(initial_state="")
    norad_id_change_tracker.register_async_callback(handle_satellite_change)

    # check if the rotator state changed, do stuff if it has
    rotator_state_tracker = StateTracker(initial_state="")
    rotator_state_tracker.register_async_callback(handle_rotator_state_change)

    # check if the rotator id changed, do stuff if it has
    rotator_id_tracker = StateTracker(initial_state="")
    rotator_id_tracker.register_async_callback(handle_rotator_id_change)

    # check if the rig state changed, do stuff if it has
    rig_state_tracker = StateTracker(initial_state="")
    rig_state_tracker.register_async_callback(handle_rig_state_change)

    # check if the transmitter id changed, do stuff if it has
    transmitter_id_state_tracker = StateTracker(initial_state="")
    transmitter_id_state_tracker.register_async_callback(handle_transmitter_id_change)

    # check if the rig id changed, do stuff if it has
    rig_id_state_tracker = StateTracker(initial_state="")
    rig_id_state_tracker.register_async_callback(handle_rig_id_change)

    async with (AsyncSessionLocal() as dbsession):
        while True:
            try:
                start_loop_date = datetime.now(UTC)
                events = []
                tracking_state_reply = await crud.get_satellite_tracking_state(dbsession, name='satellite-tracking')
                assert tracking_state_reply.get('success', False) is True, f"Error in satellite tracking task: {tracking_state_reply}"
                assert tracking_state_reply['data']['value']['group_id'], f"No group id found in satellite tracking state: {tracking_state_reply}"
                assert tracking_state_reply['data']['value']['norad_id'], f"No norad id found in satellite tracking state: {tracking_state_reply}"
                satellite_data = await compiled_satellite_data(dbsession, tracking_state_reply['data']['value']['norad_id'])
                satellite_tles = [satellite_data['details']['tle1'], satellite_data['details']['tle2']]
                satellite_name = satellite_data['details']['name']
                location_reply = await crud.fetch_location_for_userid(dbsession, user_id=None)
                location = location_reply['data']
                tracker = tracking_state_reply['data']['value']
                current_norad_id = tracker.get('norad_id', None)
                current_group_id = tracker.get('group_id', None)
                current_rotator_id = tracker.get('rotator_id', None)
                current_rig_id = tracker.get('rig_id', None)
                current_rotator_state = tracker.get('rotator_state')
                current_rig_state = tracker.get('rig_state')
                current_transmitter_id = tracker.get('transmitter_id', "none")

                # check norad_id and detect change
                await norad_id_change_tracker.update_state(current_norad_id)

                # check rotator_controller state change
                await rotator_state_tracker.update_state(current_rotator_state)

                # check rotator_controller ID change
                await rotator_id_tracker.update_state(current_rotator_id)

                # check rig state change
                await rig_state_tracker.update_state(current_rig_state)

                # check transmitter id state change
                await transmitter_id_state_tracker.update_state(current_transmitter_id)

                # check rig id state change
                await rig_id_state_tracker.update_state(current_rig_id)

                # get rotator controller position
                if rotator_controller:
                    rotator_data['az'], rotator_data['el'] = await rotator_controller.get_position()

                # get rig controller frequency and set a new one
                if rig_controller:
                    rig_data['frequency'] = await rig_controller.get_frequency()

                # work on our sky coordinates
                skypoint = (satellite_data['position']['az'], satellite_data['position']['el'])

                # first we check if the az end el values in the skypoint tuple are reachable
                if skypoint[0] > azimuthlimits[1] or skypoint[0] < azimuthlimits[0]:
                    raise AzimuthOutOfBounds(f"azimuth {round(skypoint[0], 3)}° is out of range (range: {azimuthlimits})")

                # check elevation limits
                if skypoint[1] < eleveationlimits[0] or skypoint[1] > eleveationlimits[1]:
                    raise ElevationOutOfBounds(f"elevation {round(skypoint[1], 3)}° is out of range (range: {eleveationlimits})")

                # check if the satellite is over a specific elevation limit
                if skypoint[1] < minelevation:
                    raise MinimumElevationError(f"target has not reached minimum elevation {minelevation}° degrees")

                # everything good, move on
                logger.info(f"We have a valid target (#{current_norad_id} {satellite_name}) at az: {round(skypoint[0], 3)}° el: {round(skypoint[1], 3)}°")

                if current_transmitter_id:
                    current_transmitter_reply = await crud.fetch_transmitter(dbsession, transmitter_id=current_transmitter_id)
                    current_transmitter = current_transmitter_reply.get('data', {})

                    if current_transmitter:
                        # calculate doppler shift
                        rig_data['observed_freq'], rig_data['doppler_shift'] = calculate_doppler_shift(
                            satellite_tles[0],
                            satellite_tles[1],
                            location['lat'],
                            location['lon'],
                            0,
                            current_transmitter.get('downlink_low', 0)
                        )
                        rig_data['original_freq'] = current_transmitter.get('downlink_low', 0)
                        rig_data['transmitter_id'] = current_transmitter_id

                # tune freq
                if rig_controller and current_rig_state == "tracking":
                    frequency_gen = rig_controller.set_frequency(rig_data['observed_freq'])

                    try:
                        current_frequency, is_tuning = await anext(frequency_gen)
                        rig_data['tuning'] = is_tuning
                        logger.info(f"Current frequency: {current_frequency}, tuning={is_tuning}")

                    except StopAsyncIteration:
                        # generator is done (tuning complete)
                        logger.info(f"Tuning to frequency {rig_data['observed_freq']} complete")

                # slew rotator
                if rotator_controller and current_rotator_state == "tracking":
                    position_gen = rotator_controller.set_position(round(skypoint[0], 3), round(skypoint[1], 3))

                    try:
                        az, el, is_slewing = await anext(position_gen)
                        rotator_data['slewing'] = is_slewing
                        logger.info(f"Current position: AZ={round(az, 3)}°, EL={round(el, 3)}°, slewing={is_slewing}")

                    except StopAsyncIteration:
                        logger.info(f"Slewing to AZ={round(az, 3)}° EL={round(el, 3)}° complete")

            except AzimuthOutOfBounds as e:
                logger.warning(f"Azimuth out of bounds for satellite #{current_norad_id} {satellite_name}: {e}")
                if in_tracking_state() and notified.get('azimuth_out_of_bounds', False) is not True:
                    await sio.emit('satellite-tracking', {'events': [
                        {'name': "azimuth_out_of_bounds"}
                    ]})
                    notified['azimuth_out_of_bounds'] = True

            except ElevationOutOfBounds as e:
                logger.warning(f"Elevation out of bounds for satellite #{current_norad_id} {satellite_name}: {e}")
                if in_tracking_state() and notified.get('elevation_out_of_bounds', False) is not True:
                    await sio.emit('satellite-tracking', {'events': [
                        {'name': "elevation_out_of_bounds"}
                    ]})
                    notified['elevation_out_of_bounds'] = True

            except MinimumElevationError as e:
                logger.warning(f"Elevation below minimum ({minelevation})° for satellite #{current_norad_id} {satellite_name}: {e}")
                if in_tracking_state() and notified.get('minelevation_error', False) is not True:
                    await sio.emit('satellite-tracking', {'events': [
                        {'name': "minelevation_error"}
                    ]})
                    notified['minelevation_error'] = True
                    rotator_data['minelevation'] = True

            except Exception as e:
                logger.error(f"Error in satellite tracking task: {e}")
                logger.exception(e)

            finally:
                # lastly send updates to the UI
                try:
                    data = {
                        'satellite_data': satellite_data,
                        #'tracking_state': tracker,
                        'events': events,
                        'rotator_data': rotator_data,
                        'rig_data': rig_data,
                    }

                    logger.debug(f"Sending satellite tracking data to the browser: \n%s", pretty_dict(data))
                    await sio.emit('satellite-tracking', data)

                except Exception as e:
                    logger.critical(f"Error sending satellite tracking data to the browser: {e}")
                    logger.exception(e)

                # calculate sleep time
                end_loop_date = datetime.now(UTC)
                loop_duration = round((end_loop_date - start_loop_date).total_seconds(), 2)

                if loop_duration > args.track_interval:
                    logger.warning(f"Single tracking loop iteration took longer ({loop_duration}) than the configured "
                                   f"interval ({args.track_interval})")

                remaining_time_to_sleep = max((args.track_interval - loop_duration), 0)

                logger.info(f"Waiting for {remaining_time_to_sleep} seconds before next update (already spent {loop_duration})...")
                await asyncio.sleep(remaining_time_to_sleep)



