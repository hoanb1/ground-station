import uuid
import crud
import requests
import json
import rtlsdr
import concurrent.futures
import functools
from db import engine, AsyncSessionLocal
from sync import *
from datetime import date, datetime
from auth import *
from tracking import fetch_next_events, fetch_next_events_for_group, get_ui_tracker_state, get_satellite_position_from_tle
from common import is_geostationary
from tracking import compiled_satellite_data
from sdr import rtlsdr_devices, active_sdr_clients, process_rtlsdr_data
from waterfall import cleanup_sdr_session, add_sdr_session, get_sdr_session
from sdrprocessmanager import sdr_process_manager


# Create a global thread pool executor
#thread_executor = concurrent.futures.ThreadPoolExecutor(max_workers=10)

# Function to run async code in a thread
def run_async_in_thread(async_func, *args, **kwargs):
    """Run an async function in a separate thread."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(async_func(*args, **kwargs))
    finally:
        loop.close()


async def data_request_routing(sio, cmd, data, logger, sid):
    """
    Routes data requests based on the command provided, fetching respective
    data from the database. Depending on the `cmd` parameter, it retrieves
    specific information by invoking respective CRUD operations. Logs
    information if the command is unrecognized.

    :param sid:
    :param sio:
    :param cmd: Command string specifying the action to perform. It determines
                the target data to fetch.
    :type cmd: str
    :param data: Additional data that might need to be considered during
                 processing. Not used in the current implementation.
    :type data: Any
    :param logger: Logging object used to log informational messages.
    :param logger: Logging object used to log informational messages.
    :type logger: logging.Logger
    :return: Dictionary containing 'success' status and fetched 'data'. The
             structure of 'data' depends on the command executed.
    :rtype: dict
    """

    async with AsyncSessionLocal() as dbsession:

        reply = {'success': None, 'data': None}

        if cmd == "get-tle-sources":
            logger.debug(f'Getting TLE sources')
            tle_sources = await crud.fetch_satellite_tle_source(dbsession)

            reply = {'success': tle_sources['success'], 'data': tle_sources.get('data', [])}

        elif cmd == "get-satellites":
            logger.debug(f'Getting satellites, data: {data}')
            satellites = await crud.fetch_satellites(dbsession, data)

            reply = {'success': satellites['success'], 'data': satellites.get('data', [])}

        elif cmd == "get-satellite":
            logger.debug(f'Getting satellite data for norad id, data: {data}')
            satellite = await crud.fetch_satellites(dbsession, data)

            # get transmitters
            satellite_data = satellite.get('data', [])[0]
            transmitters = await crud.fetch_transmitters_for_satellite(dbsession, satellite_data['norad_id'])

            # add in the result if the satellite is geostationary
            satellite_data['is_geostationary'] = is_geostationary([satellite_data['tle1'], satellite_data['tle2']])

            # get position
            position = get_satellite_position_from_tle([
                satellite_data['name'],
                satellite_data['tle1'],
                satellite_data['tle2']
            ])

            satellite_data = await compiled_satellite_data(dbsession, satellite_data['norad_id'])

            reply = {'success': (satellite['success'] & transmitters['success']), 'data': satellite_data}

        elif cmd == "get-satellites-for-group-id":
            logger.debug(f'Getting satellites for group id, data: {data}')
            satellites = await crud.fetch_satellites_for_group_id(dbsession, data)

            # get transmitters
            if satellites:
                for satellite in satellites.get('data', []):
                    transmitters = await crud.fetch_transmitters_for_satellite(dbsession, satellite['norad_id'])
                    satellite['transmitters'] = transmitters['data']
            else:
                logger.debug(f'No satellites found for group id: {data}')

            reply = {'success': satellites['success'], 'data': satellites.get('data', [])}

        elif cmd == "get-satellite-groups-user":
            logger.debug(f'Getting user satellite groups, data: {data}')
            satellite_groups = await crud.fetch_satellite_group(dbsession)

            # only return the user groups
            filtered_groups = [satellite_group for satellite_group in satellite_groups['data']
                                        if satellite_group['type'] == SatelliteGroupType.USER]

            reply = {'success': satellite_groups['success'], 'data': filtered_groups}

        elif cmd == "get-satellite-groups-system":
            logger.debug(f'Getting system satellite groups, data: {data}')
            satellite_groups = await crud.fetch_satellite_group(dbsession)

            # only return the system groups
            filtered_groups = [satellite_group for satellite_group in satellite_groups['data']
                               if satellite_group['type'] == SatelliteGroupType.SYSTEM]
            reply = {'success': satellite_groups['success'], 'data': filtered_groups}

        elif cmd == "get-satellite-groups":
            logger.debug(f'Getting satellite groups, data: {data}')
            satellite_groups = await crud.fetch_satellite_group(dbsession)
            reply = {'success': satellite_groups['success'], 'data': satellite_groups.get('data', [])}

        elif cmd == "sync-satellite-data":
            logger.debug(f'Syncing satellite data with known TLE sources')
            await synchronize_satellite_data(dbsession, logger, sio)

        elif cmd == "get-users":
            logger.debug(f'Getting users, data: {data}')
            users = await crud.fetch_users(dbsession, user_id=None)
            reply = {'success': users['success'], 'data': users.get('data', [])}

        elif cmd == "get-rigs":
            logger.debug(f'Getting radio rigs, data: {data}')
            rigs = await crud.fetch_rigs(dbsession)
            reply = {'success': rigs['success'], 'data': rigs.get('data', [])}

        elif cmd == "get-rotators":
            logger.debug(f'Getting antenna rotators, data: {data}')
            rotators = await crud.fetch_rotators(dbsession)
            reply = {'success': rotators['success'], 'data': rotators.get('data', [])}

        elif cmd == "get-cameras":
            logger.debug(f'Getting cameras, data: {data}')
            cameras = await crud.fetch_cameras(dbsession)
            reply = {'success': cameras['success'], 'data': cameras.get('data', [])}

        elif cmd == "get-sdrs":
            logger.debug(f'Getting SDRs, data: {data}')
            sdrs = await crud.fetch_sdrs(dbsession)
            reply = {'success': sdrs['success'], 'data': sdrs.get('data', [])}

        elif cmd == "get-location-for-user-id":
            logger.debug(f'Getting location for user id, data: {data}')
            locations = await crud.fetch_location_for_userid(dbsession, user_id=data)
            reply = {'success': locations['success'], 'data': locations.get('data', [])}

        elif cmd == "fetch-next-passes":
            logger.debug(f'Fetching next passes, data: {data}')
            next_passes = await fetch_next_events(norad_id=data.get('norad_id', None), hours=data.get('hours', 6.0))
            reply = {'success': next_passes['success'], 'data': next_passes.get('data', [])}

        elif cmd == "fetch-next-passes-for-group":
            logger.debug(f'Fetching next passes for group, data: {data}')
            next_passes = await fetch_next_events_for_group(group_id=data.get('group_id', None), hours=data.get('hours', 2.0))
            reply = {'success': next_passes['success'], 'data': next_passes.get('data', [])}

        elif cmd == "get-satellite-search":
            logger.debug(f'Searching satellites, data: {data}')
            satellites = await crud.search_satellites(dbsession, keyword=data)
            reply = {'success': satellites['success'], 'data': satellites.get('data', [])}

        elif cmd == "fetch-preferences":
            logger.debug(f'Fetching preferences for user id, data: {data}')
            preferences = await crud.fetch_preference_for_userid(dbsession, user_id=None)
            reply = {'success': preferences['success'], 'data': preferences.get('data', [])}

        elif cmd == "get-tracking-state":
            logger.debug(f'Fetching tracking state, data: {data}')
            tracking_state = await crud.get_satellite_tracking_state(dbsession, name='satellite-tracking')
            await emit_tracker_data(dbsession, sio, logger)
            reply = {'success': tracking_state['success'], 'data': tracking_state.get('data', [])}

        elif cmd == "get-map-settings":
            logger.debug(f'Fetching map settings, data: {data}')
            map_settings = await crud.get_map_settings(dbsession, name=data)
            reply = {'success': map_settings['success'], 'data': map_settings.get('data', [])}

        else:
            logger.error(f'Unknown command: {cmd}')

    return reply

async def data_submission_routing(sio, cmd, data, logger, sid):
    """
    Routes data submission commands to the appropriate CRUD operations and
    returns the response. The function supports creating, deleting, and
    editing TLE (Two-Line Element) sources. It processes the input data,
    executes the corresponding command, and fetches the latest data from
    the database to include in the response.

    :param sid:
    :param sio:
    :param cmd: Command string indicating the operation to perform. Supported
                commands are "submit-tle-sources", "delete-tle-sources",
                and "edit-tle-source".
    :type cmd: str
    :param data: Data necessary for executing the specified command. For creation,
                 it includes details of the new TLE source. For deletion, it
                 specifies the identifiers of sources to delete. For editing, it
                 includes the ID of the source to edit and its updated details.
    :type data: dict
    :param logger: Logger instance used to log information about the operation.
    :type logger: logging.Logger
    :return: A dictionary containing the operation status and any updated
             TLE source data.
    :rtype: dict
    """

    reply = {'success': None, 'data': None}
    async with AsyncSessionLocal() as dbsession:

        if cmd == "submit-tle-sources":
            logger.debug(f'Adding TLE source, data: {data}')
            submit_reply = await crud.add_satellite_tle_source(dbsession, data)

            tle_sources = await crud.fetch_satellite_tle_source(dbsession)
            reply = {'success': (tle_sources['success'] & submit_reply['success']),
                     'data': tle_sources.get('data', [])}

        elif cmd == "delete-tle-sources":
            logger.debug(f'Deleting TLE source, data: {data}')
            delete_reply = await crud.delete_satellite_tle_sources(dbsession, data)

            tle_sources = await crud.fetch_satellite_tle_source(dbsession)
            reply = {'success': (tle_sources['success'] & delete_reply['success']),
                     'data': tle_sources.get('data', [])}

        elif cmd == "edit-tle-source":
            logger.debug(f'Editing TLE source, data: {data}')
            edit_reply = await crud.edit_satellite_tle_source(dbsession, data['id'], data)

            tle_sources = await crud.fetch_satellite_tle_source(dbsession)
            reply = {'success': (tle_sources['success'] & edit_reply['success']),
                     'data': tle_sources.get('data', [])}

        elif cmd == "submit-satellite-group":
            logger.debug(f'Adding satellite group, data: {data}')
            submit_reply = await crud.add_satellite_group(dbsession, data)

            satellite_groups = await crud.fetch_satellite_group(dbsession, group_type='user')
            reply = {'success': (satellite_groups['success'] & submit_reply['success']),
                     'data': satellite_groups.get('data', [])}

        elif cmd == "delete-satellite-group":
            logger.debug(f'Deleting satellite groups, data: {data}')
            delete_reply = await crud.delete_satellite_group(dbsession, data)

            satellite_groups = await crud.fetch_satellite_group(dbsession, group_type="user")
            reply = {'success': (satellite_groups['success'] & delete_reply['success']),
                     'data': satellite_groups.get('data', [])}

        elif cmd == "edit-satellite-group":
            logger.debug(f'Editing satellite group, data: {data}')
            edit_reply = await crud.edit_satellite_group(dbsession, data['id'], data)

            satellite_groups = await crud.fetch_satellite_group(dbsession, group_type="user")
            reply = {'success': (satellite_groups['success'] & edit_reply['success']),
                     'data': satellite_groups.get('data', [])}

        elif cmd == "submit-user":
            logger.debug(f'Adding user, data: {data}')
            add_reply = await crud.add_user(dbsession, data)

            users = await crud.fetch_users(dbsession, user_id=None)
            reply = {'success': (users['success'] & add_reply['success']),
                     'data': users.get('data', [])}

        elif cmd == "edit-user":
            logger.debug(f'Editing user, data: {data}')
            edit_reply = await crud.edit_user(dbsession, data)

            users = await crud.fetch_users(dbsession, user_id=None)
            reply = {'success': (users['success'] & edit_reply['success']),
                     'data': users.get('data', [])}

        elif cmd == "delete-user":
            logger.debug(f'Delete user, data: {data}')
            delete_reply = await crud.delete_user(dbsession, data)

            users = await crud.fetch_users(dbsession, user_id=None)
            reply = {'success': (users['success'] & delete_reply['success']),
                     'data': users.get('data', [])}

        elif cmd == "submit-rig":
            logger.debug(f'Adding rig, data: {data}')
            add_reply = await crud.add_rig(dbsession, data)

            rigs = await crud.fetch_rigs(dbsession)
            reply = {'success': (rigs['success'] & add_reply['success']),
                     'data': rigs.get('data', [])}

        elif cmd == "edit-rig":
            logger.debug(f'Editing rig, data: {data}')
            edit_reply = await crud.edit_rig(dbsession, data)

            rigs = await crud.fetch_rigs(dbsession)
            reply = {'success': (rigs['success'] & edit_reply['success']),
                     'data': rigs.get('data', [])}

        elif cmd == "delete-rig":
            logger.debug(f'Delete rig, data: {data}')
            delete_reply = await crud.delete_rig(dbsession, data)

            rigs = await crud.fetch_rigs(dbsession)
            reply = {'success': (rigs['success'] & delete_reply['success']),
                     'data': rigs.get('data', [])}

        elif cmd == "submit-rotator":
            logger.debug(f'Adding rotator, data: {data}')
            add_reply = await crud.add_rotator(dbsession, data)

            rotators = await crud.fetch_rotators(dbsession)
            reply = {'success': (rotators['success'] & add_reply['success']),
                     'data': rotators.get('data', [])}

        elif cmd == "edit-rotator":
            logger.debug(f'Editing rotator, data: {data}')
            edit_reply = await crud.edit_rotator(dbsession, data)
            logger.debug(f'Edit rotator reply: {edit_reply}')

            rotators = await crud.fetch_rotators(dbsession)
            logger.debug(f'Rotators: {rotators}')
            reply = {'success': (rotators['success'] & edit_reply['success']),
                     'data': rotators.get('data', [])}

        elif cmd == "delete-rotator":
            logger.debug(f'Delete rotator, data: {data}')
            delete_reply = await crud.delete_rotators(dbsession, data)

            rotators = await crud.fetch_rotators(dbsession)
            reply = {'success': (rotators['success'] & delete_reply['success']),
                     'data': rotators.get('data', [])}

        elif cmd == "submit-camera":
            logger.debug(f'Adding camera, data: {data}')
            add_reply = await crud.add_camera(dbsession, data)

            cameras = await crud.fetch_cameras(dbsession)
            reply = {'success': (cameras['success'] & add_reply['success']),
                     'data': cameras.get('data', [])}

        elif cmd == "edit-camera":
            logger.debug(f'Editing camera, data: {data}')
            edit_reply = await crud.edit_camera(dbsession, data)
            logger.debug(f'Edit camera reply: {edit_reply}')

            cameras = await crud.fetch_cameras(dbsession)
            logger.debug(f'Cameras: {cameras}')
            reply = {'success': (cameras['success'] & edit_reply['success']),
                     'data': cameras.get('data', [])}

        elif cmd == "delete-camera":
            logger.debug(f'Delete camera, data: {data}')
            delete_reply = await crud.delete_cameras(dbsession, data)

            cameras = await crud.fetch_cameras(dbsession)
            reply = {'success': (cameras['success'] & delete_reply['success']),
                         'data': cameras.get('data', [])}

        elif cmd == "delete-sdr":
            logger.debug(f'Delete SDR, data: {data}')
            delete_reply = await crud.delete_sdrs(dbsession, list(data))

            sdrs = await crud.fetch_sdrs(dbsession)
            reply = {'success': (sdrs['success'] & delete_reply['success']),
                     'data': sdrs.get('data', [])}

        elif cmd == "submit-sdr":
            logger.debug(f'Adding SDR, data: {data}')
            add_reply = await crud.add_sdr(dbsession, data)
            logger.info(add_reply)

            sdrs = await crud.fetch_sdrs(dbsession)
            logger.info(sdrs)

            reply = {'success': (sdrs['success'] & add_reply['success']),
                     'data': sdrs.get('data', [])}

        elif cmd == "edit-sdr":
            logger.debug(f'Editing SDR, data: {data}')
            edit_reply = await crud.edit_sdr(dbsession, data)
            logger.debug(f'Edit SDR reply: {edit_reply}')

            sdrs = await crud.fetch_sdrs(dbsession)
            logger.debug(f'SDRs: {sdrs}')
            reply = {'success': (sdrs['success'] & edit_reply['success']),
                     'data': sdrs.get('data', [])}

        elif cmd == "submit-location":
            logger.debug(f'Adding location, data: {data}')
            add_reply = await crud.add_location(dbsession, data)
            reply = {'success': add_reply['success'], 'data': None}

        elif cmd == "submit-location-for-user-id":
            logger.debug(f'Adding location for user id, data: {data}')
            locations = await crud.fetch_location_for_userid(dbsession, user_id=data['userid'])

            # if there is a location for the user id then don't add, update the location,
            # if there are multiple users at some point then we change this logic again
            if not locations['data']:
                add_reply = await crud.add_location(dbsession, data)
                reply = {'success': add_reply['success'], 'data': add_reply['data'], 'error': add_reply.get('error', None)}
            else:
                # update the location
                update_reply = await crud.edit_location(dbsession, data)
                reply = {'success': update_reply['success'], 'data': update_reply['data'], 'error': update_reply.get('error', None)}

        elif cmd == "edit-location":
            logger.debug(f'Editing location, data: {data}')
            edit_reply = await crud.edit_location(dbsession, data)
            reply = {'success': edit_reply['success'], 'data': None}

        elif cmd == "delete-location":
            logger.debug(f'Delete location, data: {data}')
            delete_reply = await crud.delete_location(dbsession, data)
            reply = {'success': delete_reply['success'], 'data': None}

        elif cmd == "update-preferences":
            logger.debug(f'Updating preferences, data: {data}')
            update_reply = await crud.set_preferences(dbsession, list(data))
            reply = {'success': update_reply['success'], 'data': update_reply.get('data', [])}

        elif cmd == "set-tracking-state":
            logger.debug(f'Updating satellite tracking state, data: {data}')
            tracking_state_reply = await crud.set_satellite_tracking_state(dbsession, data)

            # we emit here so that any open browsers are also informed of any change
            await emit_tracker_data(dbsession, sio, logger)

            reply = {'success': tracking_state_reply['success'], 'data': tracking_state_reply['data']['value']}

        elif cmd == "set-map-settings":
            logger.debug(f'Updating map settings, data: {data}')
            map_settings_reply = await crud.set_map_settings(dbsession, data)

            # we emit here so that any open browsers are also informed of any change
            await emit_tracker_data(dbsession, sio, logger)

            reply = {'success': map_settings_reply['success'], 'data': map_settings_reply['data']}

        else:
            logger.error(f'Unknown command 1: {cmd}')

    return reply


async def emit_tracker_data(dbsession, sio, logger):
    """
    Emits satellite tracking data to the provided Socket.IO instance. This function retrieves the
    current state of satellite tracking from the database, processes the relevant satellite data,
    fetches the UI tracker state, and emits the resulting combined data to a specific event on
    the Socket.IO instance. Errors during data retrieval, processing, or emitting are logged.

    :param dbsession: Database session object used to access and query the database.
    :type dbsession: Any
    :param sio: Socket.IO server instance for emitting events.
    :type sio: AsyncServer
    :param logger: Logger object for logging errors or exceptions.
    :type logger: Any
    :return: This function does not return any value as it emits data asynchronously.
    :rtype: None
    """
    try:
        logger.debug("Sending tracker data to clients...")

        tracking_state_reply = await crud.get_satellite_tracking_state(dbsession, name='satellite-tracking')
        group_id = tracking_state_reply['data']['value'].get('group_id', None)
        norad_id = tracking_state_reply['data']['value'].get('norad_id', None)
        satellite_data = await compiled_satellite_data(dbsession, norad_id)
        ui_tracker_state = await get_ui_tracker_state(group_id, norad_id)
        data = {
            'satellite_data': satellite_data,
            'ui_tracker_state': ui_tracker_state['data'],
            'tracking_state':tracking_state_reply['data']['value'],
        }
        await sio.emit('satellite-tracking', data)

    except Exception as e:
        logger.error(f'Error emitting tracker data: {e}')
        logger.exception(e)


async def auth_request_routing(sio, cmd, data, logger, sid):
    """
    Routes authentication requests to the appropriate handle based on the command
    provided. Establishes an asynchronous session with the database for processing
    the request. Ensures the database session is properly closed after use.

    :param sid:
    :param sio: Socket.IO server instance facilitating communication via events.
    :type sio: AsyncServer
    :param cmd: Command string determining the operation to be performed.
    :param data: Payload of the authentication request containing data required for
        processing.
    :type data: dict
    :param logger: Logger instance for logging the events, errors or general
        information related to the processing of the request.
    :type logger: Logger
    :return: A dictionary containing the success status of the operation and
        any resulting data after processing the request.
    :rtype: dict
    """

    reply = {'success': None, 'user': None, 'token': None}
    async with AsyncSessionLocal() as dbsession:

        logger.debug(f'Auth request, cmd: {cmd}, data: {data}')
        auth_reply = await authenticate_user(dbsession, data['email'], data['password'])

        if auth_reply is not None:
            # login success
            reply['success'] = True
            reply['token'] = auth_reply.get('token', None)

            # fetch user data
            reply['user'] = auth_reply.get('user', None)

        else:
            reply['success'] = False

    return reply


async def sdr_data_request_routing(sio, cmd, data, logger, sid):

    async with AsyncSessionLocal() as dbsession:
        reply: dict = {'success': None, 'data': None}

        if cmd == "configure-rtlsdr":
            try:
                # SDR device id
                sdr_id = data.get('selectedSDRId', None)

                # Fetch SDR device details from database
                sdr_device_reply = await crud.fetch_sdr(dbsession, sdr_id)
                if not sdr_device_reply['success'] or not sdr_device_reply['data']:
                    raise Exception(f"SDR device with id {sdr_id} not found in database")


                sdr_device = sdr_device_reply['data']
                sdr_serial = sdr_device.get('serial', 0)
                sdr_host = sdr_device.get('host', None)
                sdr_port = sdr_device.get('port', None)

                # Default to 100 MHz
                center_freq = data.get('centerFrequency', 100e6)

                # Validate center frequency against device limits
                frequency_range = sdr_device.get('frequency_range', {'min': float("-inf"), 'max': float("inf")})
                if not (frequency_range['min'] * 1e6 <= center_freq <= frequency_range['max'] * 1e6):
                    raise Exception(
                        f"Center frequency {center_freq / 1e6:.2f} MHz is outside device limits "
                        f"({frequency_range['min']:.2f} MHz - {frequency_range['max']:.2f} MHz)")

                # Default to 2.048 MSPS
                sample_rate = data.get('sampleRate', 2.048e6)

                # Default to 20 dB gain
                gain = data.get('gain', 20)

                # Default FFT size
                fft_size = data.get('fftSize', 1024)

                # Enable/disable Bias-T
                bias_t = data.get('biasT', False)

                # Read tuner AGC setting
                tuner_agc = data.get('tunerAgc', False)

                # Read AGC mode
                rtl_agc = data.get('rtlAgc', False)

                # Read the FFT window
                fft_window = data.get('fftWindow', 'hanning')

                sdr_config = {
                    'center_freq': center_freq,
                    'sample_rate': sample_rate,
                    'gain': gain,
                    'fft_size': fft_size,
                    'bias_t': bias_t,
                    'tuner_agc': tuner_agc,
                    'rtl_agc': rtl_agc,
                    'fft_window': fft_window,
                    'sdr_id': sdr_id,
                    'serial_number': sdr_serial,
                    'host': sdr_host,
                    'port': sdr_port,
                    'client_id': sid,
                }

                # Create an SDR session entry in memory
                logger.info(f"Creating an SDR session for client {sid}")
                session = add_sdr_session(sid, sdr_config)

                await sio.emit('sdr-status', session, room=sid)

                is_running = sdr_process_manager.is_sdr_process_running(sdr_id)
                if is_running:
                    logger.info(f"Updating SDR configuration for client {sid} with SDR id: {sdr_id}")
                    await sdr_process_manager.update_configuration(sdr_id, sdr_config)

                reply['success'] = True

            except Exception as e:
                logger.error(f"Error configuring SDR: {str(e)}")
                logger.exception(e)
                await sio.emit('sdr-error', {'message': f"Failed to configure SDR: {str(e)}"}, room=sid)
                reply['success'] = False

        elif cmd == "start-streaming":

            try:
                # SDR device id
                sdr_id = data.get('selectedSDRId', None)

                # Fetch SDR device details from database
                sdr_device_reply = await crud.fetch_sdr(dbsession, sdr_id)
                if not sdr_device_reply['success'] or not sdr_device_reply['data']:
                    raise Exception(f"SDR device with id {sdr_id} not found in database")

                sdr_device = sdr_device_reply['data']

                if sid not in active_sdr_clients:
                    raise Exception(f"Client with id: {sid} not registered")

                sdr_config = get_sdr_session(sid)

                logger.info(f"Starting streaming SDR data for client {sid}")

                # Start or join the SDR process
                process_sdr_id = await sdr_process_manager.start_sdr_process(sdr_device, sdr_config, sid)
                logger.info(f"SDR process started for client {sid} with process id: {process_sdr_id}")

            except Exception as e:
                logger.error(f"Error starting SDR stream: {str(e)}")
                logger.exception(e)
                await sio.emit('sdr-error', {'message': f"Failed to start SDR stream: {str(e)}"}, room=sid)
                reply['success'] = False

        elif cmd == "stop-streaming":

            try:
                # SDR device id
                sdr_id = data.get('selectedSDRId', None)

                # Fetch SDR device details from database
                sdr_device_reply = await crud.fetch_sdr(dbsession, sdr_id)
                if not sdr_device_reply['success'] or not sdr_device_reply['data']:
                    raise Exception(f"SDR device with id {sdr_id} not found in database")

                sdr_device = sdr_device_reply['data']

                client = get_sdr_session(sid)

                if sdr_id:
                    # Stop or leave the SDR process
                    await sdr_process_manager.stop_sdr_process(sdr_id, sid)

                if sid not in active_sdr_clients:
                    logger.error(f"Client not registered: {sid}")
                    await sio.emit('sdr-error', {'message': "Client not registered"}, room=sid)
                    reply['success'] = False

                # cleanup
                await cleanup_sdr_session(sid)

                await sio.emit('sdr-status', {'streaming': False}, room=sid)
                logger.info(f"Stopped streaming SDR data for client {sid}")

            except Exception as e:
                logger.error(f"Error stopping SDR stream: {str(e)}")
                logger.exception(e)
                await sio.emit('sdr-error', {'message': f"Failed to stop SDR stream: {str(e)}"}, room=sid)
                reply['success'] = False

        else:
            logger.error(f'Unknown SDR command: {cmd}')

    return reply

