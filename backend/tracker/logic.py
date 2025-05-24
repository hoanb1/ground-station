# Copyright (c) 2024 Efstratios Goudelis
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.


import json
import multiprocessing
import pprint
import crud
import asyncio
import socketio
from io import StringIO
from datetime import UTC
import math
import logging
from common import is_geostationary, serialize_object
from db import AsyncSessionLocal
from models import ModelEncoder
from exceptions import AzimuthOutOfBounds, ElevationOutOfBounds, MinimumElevationError
from controllers.rotator import RotatorController
from controllers.rig import RigController
from controllers.sdr import SDRController
from arguments import arguments as args
from .state import StateTracker
from skyfield.api import load, wgs84, EarthSatellite
from datetime import datetime, timedelta
from typing import List, Dict, Union, Tuple
from tracking.footprint import get_satellite_coverage_circle
from tracking.doppler import calculate_doppler_shift
from tracking.passes import calculate_next_events
from tracking.satellite import get_satellite_position_from_tle, get_satellite_az_el, get_satellite_path


logger = logging.getLogger("tracker-worker")


# Create queues for bi-directional communication
queue_to_tracker = multiprocessing.Queue()
queue_from_tracker = multiprocessing.Queue()

# Create a stop event to signal the process to terminate
stop_event = multiprocessing.Event()

def pretty_dict(d):
    # Create a string buffer and pretty print the dict to it
    output = StringIO()
    pprint.pprint(d, stream=output)
    # Get the string value and return it without the last newline
    return output.getvalue().rstrip()


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
    reply: dict[str, Union[bool, None, dict]] = {'success': False, 'data': None}

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
            tracking_state = await crud.get_tracking_state(dbsession, name='satellite-tracking')
            transmitters = await crud.fetch_transmitters_for_satellite(dbsession, norad_id=norad_id)
            data['groups'] = groups['data']
            data['satellites'] = satellites['data']
            data['group_id'] = group_id
            data['norad_id'] = norad_id
            data['rig_id'] = tracking_state['data']['value'].get('rig_id', "none")
            data['rotator_id'] = tracking_state['data']['value'].get('rotator_id', "none")
            data['transmitter_id'] = tracking_state['data']['value'].get('transmitter_id', "none")
            data['transmitters'] = transmitters['data']
            reply['success'] = True
            reply['data'] = data

    except Exception as e:
        logger.error(f"Failed to get tracker state for group id: {group_id}, satellite id: {norad_id}, error: {e}")
        logger.exception(e)

    finally:
        pass

    return reply


def start_tracker_process():
    """
    Starts the satellite tracking task in a separate process using multiprocessing.

    This function creates the necessary queues for communication between the main process
    and the tracker process, and handles the lifecycle of the tracker process.

    :return: A tuple containing (process, queue_in, queue_out, stop_event)
    """

    # Define the process target function that will run the async tracking task
    def run_tracking_task():
        import asyncio
        # Create a new event loop for this process
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            # Run the tracking task
            loop.run_until_complete(
                satellite_tracking_task(queue_from_tracker, queue_to_tracker, stop_event)
            )
        except Exception as e:
            logger.error(f"Error in tracker process: {e}")
            logger.exception(e)
        finally:
            loop.close()

    # Create and start the process
    tracker_process = multiprocessing.Process(
        target=run_tracking_task,
        name="SatelliteTracker"
    )
    tracker_process.daemon = True  # Process will terminate when main process exits
    tracker_process.start()

    logger.info(f"Started satellite tracker process with PID {tracker_process.pid}")

    return tracker_process, queue_to_tracker, queue_from_tracker, stop_event


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

    satellite_data = serialize_object(satellite_data)
    
    return satellite_data


async def satellite_tracking_task(queue_out: multiprocessing.Queue, queue_in: multiprocessing.Queue, stop_event=None):
    """
    Periodically tracks and transmits satellite position and details along with user location data
    using multiprocessing Queue instead of Socket.IO for inter-process communication.

    This function performs satellite tracking by retrieving tracking states, determining current
    satellite position, and calculating azimuth and elevation values based on user geographic
    location. Data retrieval is achieved through database queries for satellite and user
    information, and updates are transmitted via the queue_out Queue.

    :param queue_out: Queue to send tracking data to the main process
    :type queue_out: multiprocessing.Queue
    :param queue_in: Queue to receive commands from the main process
    :type queue_in: multiprocessing.Queue
    :param stop_event: Event to signal this function to stop execution
    :type stop_event: multiprocessing.Event
    :return: None
    """

    logger.info(f"Starting satellite tracker-worker...")

    # check interval value, should be between 2 and 5 (including)
    assert 1 < args.track_interval < 6, f"track_interval must be between 2 and 5, got {args.track_interval}"

    azimuthlimits = (0, 360)
    eleveationlimits = (0, 90)
    minelevation = 10.0
    az_tolerance = 1.0
    el_tolerance = 1.0
    previous_rotator_state = None
    rotator_controller = None
    rig_controller = None
    current_rotator_id = None
    current_transmitter_id = "none"
    rotator_data = {
        'az': 0,
        'el': 0,
        'connected': False,
        'tracking': False,
        'slewing': False,
        'outofbounds': False,
        'minelevation': False,
        'stopped': False,
        'error': False
    }
    rig_data = {
        'connected': False,
        'tracking': False,
        'stopped': False,
        'error': False,
        'frequency': 0,
        'observed_freq': 0, # hz
        'doppler_shift': 0, # hz
        'original_freq': 0, # hz
        'transmitter_id': 'none',
        'device_type': '',
    }

    notified = {}

    def in_tracking_state():
        if current_rotator_state == "tracking":
            return True
        else:
            return False

    async def handle_satellite_change(old, new):
        nonlocal notified, rotator_data, current_transmitter_id, current_rig_state, new_tracking_state

        logger.info(f"Target satellite change detected from '{old}' to '{new}'")

        # reset the minelevation error
        rotator_data['minelevation'] = False

        notified = {}
        queue_out.put({
            'event': 'satellite-tracking',
            'data': {
                'events': [
                    {'name': "norad_id_change", 'old': old, 'new': new},
                ]
            }
        })

        # change the rig_state in the tracking_state in the db
        new_tracking_state = await crud.set_tracking_state(dbsession, {
            'name': 'satellite-tracking',
            'value': {
                'rig_state': 'connected',
                'transmitter_id': "none"
            }
        })

        # since the satellite changed, reset the transmitter_id too
        #current_transmitter_id = "none"

    async def connect_to_rotator():
        """
        Check if rotator_controller is set up, if not set it up.
        :return:
        """
        nonlocal rotator_controller, current_rotator_state

        if current_rotator_id is not None and rotator_controller is None:
            # rotator_controller was selected, and a rotator_controller is not setup, set it up now
            try:
                rotator_details_reply = await crud.fetch_rotators(dbsession, rotator_id=current_rotator_id)
                rotator_details = rotator_details_reply['data']
                rotator_controller = RotatorController(host=rotator_details['host'], port=rotator_details['port'])
                await rotator_controller.connect()
                rotator_data['connected'] = True
                rotator_data['tracking'] = False
                rotator_data['slewing'] = False
                rotator_data['outofbounds'] = False
                rotator_data['stopped'] = True
                queue_out.put({
                    'event': 'satellite-tracking',
                    'data': {
                        'events': [{'name': "rotator_connected"}],
                        'rotator_data': rotator_data.copy()
                    }
                })

            except Exception as e:
                logger.error(f"Failed to connect to rotator_controller: {e}")
                logger.exception(e)
                rotator_data['connected'] = False
                rotator_data['tracking'] = False
                rotator_data['slewing'] = False
                rotator_data['stopped'] = False
                rotator_data['error'] = True

                # change the rotator_state in the tracking_state in the db
                _new_tracking_state = await crud.set_tracking_state(dbsession, {
                    'name': 'satellite-tracking',
                    'value': {'rotator_state': 'disconnected'}
                })

                # report to the main thread
                queue_out.put({
                    'event': 'satellite-tracking',
                    'data': {
                        'events': [
                            {'name': "rotator_error", "error": str(e)}
                        ],
                        'rotator_data': rotator_data.copy(),
                        'tracking_state': _new_tracking_state['data']['value'],
                    }
                })

                # dereference object
                rotator_controller = None


    async def handle_rotator_state_change(old, new):
        nonlocal rotator_controller

        logger.info(f"Rotator state change detected from '{old}' to '{new}'")

        # reset the minelevation error
        rotator_data['minelevation'] = False
        if new == "connected":
            # check what hardware was chosen and set it up
            await connect_to_rotator()

        elif new == "tracking":
            # check what hardware was chosen and set it up
            await connect_to_rotator()
            rotator_data['tracking'] = True

        elif new == "stopped":
            # check what hardware was chosen and set it up
            rotator_data['tracking'] = False
            rotator_data['slewing'] = False
            rotator_data['stopped'] = True

        elif new == "disconnected":
            # disconnect from the controller
            if rotator_controller is not None:
                logger.info(f"Disconnecting from rotator_controller at {rotator_controller.host}:{rotator_controller.port}...")
                try:
                    await rotator_controller.disconnect()
                    rotator_data['connected'] = False
                    queue_out.put({
                        'event': 'satellite-tracking',
                        'data': {
                            'events': [{'name': "rotator_disconnected"}],
                            'rotator_data': rotator_data.copy()
                        }
                    })

                except Exception as e:
                    logger.error(f"Error disconnecting from rotator_controller: {e}")
                    logger.exception(e)

                finally:
                    # Set to None regardless of disconnect success
                    rotator_controller = None

        elif new == "parked":
            rotator_data['tracking'] = False
            rotator_data['slewing'] = False

            try:
                # going to park position
                park_reply = await rotator_controller.park()

                if park_reply:
                    rotator_data['parked'] = True
                    queue_out.put({
                        'event': 'satellite-tracking',
                        'data': {
                            'events': [{'name': "rotator_parked"}],
                            'rotator_data': rotator_data.copy()
                        }
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
                    if not rig_details_reply.get('data', None):
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
                rig_data['tracking'] = False
                rig_data['tuning'] = False

                rig_data['device_type'] = rig_details.get('type', 'hardware')
                queue_out.put({
                    'event': 'satellite-tracking',
                    'data': {
                        'events': [{'name': "rig_connected"}],
                        'rig_data': rig_data.copy()
                    }
                })

            except Exception as e:
                logger.error(f"Failed to connect to rig_controller: {e}")
                logger.exception(e)
                rig_data['connected'] = False
                rig_data['tracking'] = False
                rig_data['tuning'] = False
                rig_data['error'] = True

                # change the rig_state in the tracking_state in the db
                _new_tracking_state = await crud.set_tracking_state(dbsession, {
                    'name': 'satellite-tracking',
                    'value': {'rig_state': 'disconnected'}
                })

                queue_out.put({
                    'event': 'satellite-tracking',
                    'data': {
                        'events': [
                            {'name': "rig_error", "error": str(e)}
                        ],
                        'rig_data': rig_data.copy(),
                        'tracking_state': _new_tracking_state['data']['value'],
                    }
                })

                # dereference object
                rig_controller = None


    async def handle_rig_state_change(old, new):
        nonlocal rig_controller

        logger.info(f"Rig state change detected from '{old}' to '{new}'")

        if new == "connected":
            # check what hardware was chosen and set it up
            await connect_to_rig()

        elif new == "disconnected":
            # disconnected rig_controller
            if rig_controller is not None:
                logger.info(f"Disconnecting from rig...")
                try:
                    await rig_controller.disconnect()
                    rig_data['connected'] = False
                    rig_data['tracking'] = False
                    rig_data['tuning'] = False
                    queue_out.put({
                        'event': 'satellite-tracking',
                        'data': {
                            'events': [{'name': "rig_disconnected"}],
                            'rig_data': rig_data.copy()
                        }
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
            rig_data['tracking'] = False
            rig_data['tuning'] = False
            rig_data['stopped'] = True


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

    # nudge command queue
    nudge_commands = []

    # nudge command offset values
    nudge_offset = {'az': 0, 'el': 0}

    # main loop
    async with (AsyncSessionLocal() as dbsession):
        while True:

            # Check for any incoming commands from the main process
            try:
                # Process all available commands in the queue
                while not queue_in.empty():
                    command = queue_in.get_nowait()
                    logger.info(f"Received command from main process: {command}")

                    # Process the command based on its type
                    if command.get('command') == 'stop':
                        logger.info("Received stop command, exiting tracking task")
                        return

                    elif command.get('command') == 'nudge_clockwise':
                        nudge_offset['az']  = nudge_offset['az'] + 2

                    elif command.get('command') == 'nudge_counter_clockwise':
                        nudge_offset['az']  = nudge_offset['az'] - 2

                    elif command.get('command') == 'nudge_up':
                        nudge_offset['el']  = nudge_offset['el'] + 2

                    elif command.get('command') == 'nudge_down':
                        nudge_offset['el']  = nudge_offset['el'] - 2

            # Handle other command types as needed
            except Exception as e:
                logger.error(f"Error processing command from queue: {e}")

            try:
                start_loop_date = datetime.now(UTC)
                events = []
                tracking_state_reply = await crud.get_tracking_state(dbsession, name='satellite-tracking')
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

                # check if the rotator is actually supposed to be connected
                if current_rotator_state == "connected" and rotator_controller is None:
                    logger.warning(f"Tracking state said rotator must be connected but it is not")

                    # change the rig_state in the tracking_state in the db
                    new_tracking_state = await crud.set_tracking_state(dbsession, {
                        'name': 'satellite-tracking',
                        'value': {'rotator_state': 'disconnected'}
                    })

                    queue_out.put({
                        'event': 'satellite-tracking',
                        'data': {
                            'rotator_data': rotator_data.copy(),
                            'tracking_state': new_tracking_state['data']['value'],
                        }
                    })

                # check if the rig is actually supposed to be connected
                if current_rig_state == "connected" and rig_controller is None:
                    logger.warning(f"Tracking state said rig must be connected but it is not")

                    # change the rig_state in the tracking_state in the db
                    new_tracking_state = await crud.set_tracking_state(dbsession, {
                        'name': 'satellite-tracking',
                        'value': {'rig_state': 'disconnected'}
                    })

                    queue_out.put({
                        'event': 'satellite-tracking',
                        'data': {
                            'rig_data': rig_data.copy(),
                            'tracking_state': new_tracking_state['data']['value'],
                        }
                    })

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

                # everything good, move on to actual rotator and rig tracking
                logger.info(f"We have a valid target (#{current_norad_id} {satellite_name}) at az: {skypoint[0]}° el: {skypoint[1]}°")

                # check if we have a transmitter selected
                if current_transmitter_id != "none":
                    current_transmitter_reply = await crud.fetch_transmitter(dbsession, transmitter_id=current_transmitter_id)
                    current_transmitter = current_transmitter_reply.get('data', {})

                    if current_transmitter:
                        if current_rig_state == "tracking":
                            # calculate doppler shift
                            rig_data['observed_freq'], rig_data['doppler_shift'] = calculate_doppler_shift(
                                satellite_tles[0],
                                satellite_tles[1],
                                location['lat'],
                                location['lon'],
                                0,
                                current_transmitter.get('downlink_low', 0)
                            )
                            rig_data['tracking'] = True

                        else:
                            rig_data['observed_freq'] = 0
                            rig_data['doppler_shift'] = 0
                            rig_data['tracking'] = False

                    rig_data['original_freq'] = current_transmitter.get('downlink_low', 0)
                    rig_data['transmitter_id'] = current_transmitter_id

                else:
                    logger.debug(f"No satellite transmitter selected")
                    rig_data['transmitter_id'] = current_transmitter_id

                # tune freq to observed frequency
                if rig_controller and current_rig_state == "tracking":
                    frequency_gen = rig_controller.set_frequency(rig_data['observed_freq'])

                    try:
                        current_frequency, is_tuning = await anext(frequency_gen)
                        rig_data['tuning'] = is_tuning
                        logger.info(f"Current frequency: {current_frequency}, tuning={is_tuning}")

                    except StopAsyncIteration:
                        # generator is done (tuning complete)
                        logger.info(f"Tuning to frequency {rig_data['observed_freq']} complete")

                # slew rotator to the new target location in the sky
                if rotator_controller and current_rotator_state == "tracking":

                    # Check if the target position is within tolerance of the current position
                    if (abs(skypoint[0] - rotator_data['az']) > az_tolerance or
                            abs(skypoint[1] - rotator_data['el']) > el_tolerance):
                        position_gen = rotator_controller.set_position(skypoint[0], skypoint[1])

                        # go through the yields while it is slewing
                        try:
                            az, el, is_slewing = await anext(position_gen)
                            rotator_data['slewing'] = is_slewing
                            logger.info(f"Current position: AZ={az}°, EL={el}°, slewing={is_slewing}")

                        except StopAsyncIteration:
                            logger.info(f"Slewing to AZ={az}° EL={el}° complete")
                            
                elif rotator_controller and current_rotator_state != "tracking":
                    # since we are not tracking, process those nudge commands if there are any
                    if nudge_offset['az'] != 0 or nudge_offset['el'] != 0:
                        new_az = rotator_data['az'] + nudge_offset['az']
                        new_el = rotator_data['el'] + nudge_offset['el']

                        position_gen = rotator_controller.set_position(new_az, new_el)

                        # go through the yields while it is slewing
                        try:
                            az, el, is_slewing = await anext(position_gen)
                            rotator_data['slewing'] = is_slewing
                            logger.info(f"Current position: AZ={az}°, EL={el}°, slewing={is_slewing}")

                        except StopAsyncIteration:
                            logger.info(f"Slewing to AZ={az}° EL={el}° complete")

            except AzimuthOutOfBounds as e:
                logger.warning(f"Azimuth out of bounds for satellite #{current_norad_id} {satellite_name}: {e}")
                if in_tracking_state() and notified.get('azimuth_out_of_bounds', False) is not True:
                    queue_out.put({
                        'event': 'satellite-tracking',
                        'data': {
                            'events': [{'name': "azimuth_out_of_bounds"}]
                        }
                    })
                notified['azimuth_out_of_bounds'] = True
                rotator_data['minelevation'] = False
                rotator_data['outofbounds'] = True
                rotator_data['stopped'] = True
                rig_data['tracking'] = False
                rig_data['tuning'] = False

            except ElevationOutOfBounds as e:
                logger.warning(f"Elevation out of bounds for satellite #{current_norad_id} {satellite_name}: {e}")
                if in_tracking_state() and notified.get('elevation_out_of_bounds', False) is not True:
                    queue_out.put({
                        'event': 'satellite-tracking',
                        'data': {
                            'events': [{'name': "elevation_out_of_bounds"}]
                        }
                    })
                notified['elevation_out_of_bounds'] = True
                rotator_data['minelevation'] = False
                rotator_data['outofbounds'] = True
                rotator_data['stopped'] = True
                rig_data['tracking'] = False
                rig_data['tuning'] = False

            except MinimumElevationError as e:
                logger.warning(f"Elevation below minimum ({minelevation})° for satellite #{current_norad_id} {satellite_name}: {e}")
                if in_tracking_state() and notified.get('minelevation_error', False) is not True:
                    queue_out.put({
                        'event': 'satellite-tracking',
                        'data': {
                            'events': [{'name': "minelevation_error"}]
                        }
                    })
                notified['minelevation_error'] = True
                rotator_data['minelevation'] = True
                rotator_data['outofbounds'] = False
                rotator_data['stopped'] = True
                rig_data['tracking'] = False
                rig_data['tuning'] = False

            except Exception as e:
                logger.error(f"Error in satellite tracking task: {e}")
                logger.exception(e)

            finally:
                # Lastly, send updates via the queue
                try:
                    full_msg = {
                        'event': 'satellite-tracking',
                        'data': {
                            'satellite_data': satellite_data,
                            'events': events.copy(),              # copy(), because it will be modified later
                            'rotator_data': rotator_data.copy(),  # copy(), because it will be modified later
                            'rig_data': rig_data.copy(),          # copy(), because it will be modified later
                        }
                    }
                    logger.debug(f"Sending satellite tracking data: \n%s", pretty_dict(full_msg))
                    queue_out.put(full_msg)

                except Exception as e:
                    logger.critical(f"Error sending satellite tracking data: {e}")
                    logger.exception(e)

                # calculate sleep time
                end_loop_date = datetime.now(UTC)
                loop_duration = round((end_loop_date - start_loop_date).total_seconds(), 2)

                if loop_duration > args.track_interval:
                    logger.warning(f"Single tracking loop iteration took longer ({loop_duration}) than the configured "
                                   f"interval ({args.track_interval})")

                remaining_time_to_sleep = max((args.track_interval - loop_duration), 0)

                # Clean up rotator_data
                rotator_data['slewing'] = False
                rotator_data['outofbounds'] = False
                rotator_data['minelevation'] = False
                rotator_data['error'] = False

                # Clean up rig_data
                rig_data['tuning'] = False
                rig_data['error'] = False

                # reset those nudge offset values
                nudge_offset = {'az': 0, 'el': 0}

                # Check if stop_event is set before sleeping
                if stop_event and stop_event.is_set():
                    logger.info("Stop event detected, exiting tracking task")
                    break

                logger.info(f"Waiting for {round(remaining_time_to_sleep, 2)} seconds before next update "
                            f"(already spent {round(loop_duration, 2)})...")
                await asyncio.sleep(remaining_time_to_sleep)


# Start the tracker process
tracker_process, _, _, _ = start_tracker_process()
