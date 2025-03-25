import uuid
import crud
import requests
import json
from db import engine, AsyncSessionLocal
from sync import *
from datetime import date, datetime
from auth import *
from models import ModelEncoder
from tracking import fetch_next_events, fetch_next_events_for_group


async def data_request_routing(sio, cmd, data, logger):
    """
    Routes data requests based on the command provided, fetching respective
    data from the database. Depending on the `cmd` parameter, it retrieves
    specific information by invoking respective CRUD operations. Logs
    information if the command is unrecognized.

    :param sio:
    :param cmd: Command string specifying the action to perform. It determines
                the target data to fetch.
    :type cmd: str
    :param data: Additional data that might need to be considered during
                 processing. Not utilized in the current implementation.
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
            logger.info(f'Getting TLE sources')
            tle_sources = await crud.fetch_satellite_tle_source(dbsession)

            reply = {'success': tle_sources['success'], 'data': tle_sources.get('data', [])}

        elif cmd == "get-satellites":
            logger.info(f'Getting satellites, data: {data}')
            satellites = await crud.fetch_satellites(dbsession, None)
            satellites = json.loads(json.dumps(satellites, cls=ModelEncoder))

            reply = {'success': satellites['success'], 'data': satellites.get('data', [])}

        elif cmd == "get-satellite":
            logger.info(f'Getting satellite data for norad id, data: {data}')
            satellite = await crud.fetch_satellites(dbsession, data)
            satellite = json.loads(json.dumps(satellite, cls=ModelEncoder))

            # get transmitters
            satellite_data = satellite.get('data', [])[0]
            transmitters = await crud.fetch_transmitters_for_satellite(dbsession, satellite_data['norad_id'])
            satellite_data['transmitters'] = json.loads(json.dumps(transmitters['data'], cls=ModelEncoder))

            reply = {'success': (satellite['success'] & transmitters['success']), 'data': [satellite_data]}

        elif cmd == "get-satellites-for-group-id":
            logger.info(f'Getting satellites for group id, data: {data}')
            satellites = await crud.fetch_satellites_for_group_id(dbsession, data)
            satellites = json.loads(json.dumps(satellites, cls=ModelEncoder))

            # get transmitters
            for satellite in satellites.get('data', []):
                transmitters = await crud.fetch_transmitters_for_satellite(dbsession, satellite['norad_id'])
                satellite['transmitters'] = json.loads(json.dumps(transmitters['data'], cls=ModelEncoder))

            reply = {'success': (satellites['success'] & transmitters['success']), 'data': satellites.get('data', [])}

        elif cmd == "get-satellite-groups-user":
            logger.info(f'Getting user satellite groups, data: {data}')
            satellite_groups = await crud.fetch_satellite_group(dbsession)
            satellite_groups = json.loads(json.dumps(satellite_groups, cls=ModelEncoder))

            # only return the user groups
            filtered_groups = [satellite_group for satellite_group in satellite_groups['data']
                                        if satellite_group['type'] == SatelliteGroupType.USER]
            reply = {'success': satellite_groups['success'], 'data': filtered_groups}

        elif cmd == "get-satellite-groups-system":
            logger.info(f'Getting system satellite groups, data: {data}')
            satellite_groups = await crud.fetch_satellite_group(dbsession)
            satellite_groups = json.loads(json.dumps(satellite_groups, cls=ModelEncoder))

            # only return the system groups
            filtered_groups = [satellite_group for satellite_group in satellite_groups['data']
                               if satellite_group['type'] == SatelliteGroupType.SYSTEM]
            reply = {'success': satellite_groups['success'], 'data': filtered_groups}

        elif cmd == "get-satellite-groups":
            logger.info(f'Getting satellite groups, data: {data}')
            satellite_groups = await crud.fetch_satellite_group(dbsession)
            satellite_groups = json.loads(json.dumps(satellite_groups, cls=ModelEncoder))
            reply = {'success': satellite_groups['success'], 'data': satellite_groups.get('data', [])}

        elif cmd == "sync-satellite-data":
            logger.info(f'Syncing satellite data with known TLE sources')
            await synchronize_satellite_data(dbsession, logger, sio)

        elif cmd == "get-users":
            logger.info(f'Getting users, data: {data}')
            users = await crud.fetch_users(dbsession, user_id=None)
            users = json.loads(json.dumps(users, cls=ModelEncoder))
            reply = {'success': users['success'], 'data': users.get('data', [])}

        elif cmd == "get-rigs":
            logger.info(f'Getting radio rigs, data: {data}')
            rigs = await crud.fetch_rigs(dbsession)
            rigs = json.loads(json.dumps(rigs, cls=ModelEncoder))
            reply = {'success': rigs['success'], 'data': rigs.get('data', [])}

        elif cmd == "get-rotators":
            logger.info(f'Getting antenna rotators, data: {data}')
            rotators = await crud.fetch_rotators(dbsession)
            rotators = json.loads(json.dumps(rotators, cls=ModelEncoder))
            reply = {'success': rotators['success'], 'data': rotators.get('data', [])}

        elif cmd == "get-location-for-user-id":
            logger.info(f'Getting location for user id, data: {data}')
            locations = await crud.fetch_location_for_userid(dbsession, user_id=data)
            locations = json.loads(json.dumps(locations, cls=ModelEncoder))
            reply = {'success': locations['success'], 'data': locations.get('data', [])}

        elif cmd == "fetch-next-passes":
            logger.info(f'Fetching next passes, data: {data}')
            next_passes = await fetch_next_events(norad_id=data)
            next_passes = json.loads(json.dumps(next_passes, cls=ModelEncoder))
            reply = {'success': next_passes['success'], 'data': next_passes.get('data', [])}

        elif cmd == "fetch-next-passes-for-group":
            logger.info(f'Fetching next passes for group, data: {data}')
            next_passes = await fetch_next_events_for_group(group_id=data)
            logger.info(f'Next passes for group: {next_passes}')
            next_passes = json.loads(json.dumps(next_passes, cls=ModelEncoder))
            reply = {'success': next_passes['success'], 'data': next_passes.get('data', [])}

        else:
            logger.info(f'Unknown command: {cmd}')

    return reply

async def data_submission_routing(sio, cmd, data, logger):
    """
    Routes data submission commands to the appropriate CRUD operations and
    returns the response. The function supports creating, deleting, and
    editing TLE (Two-Line Element) sources. It processes the input data,
    executes the corresponding command, and fetches the latest data from
    the database to include in the response.

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
            logger.info(f'Adding TLE source, data: {data}')
            submit_reply = await crud.add_satellite_tle_source(dbsession, data)

            tle_sources = await crud.fetch_satellite_tle_source(dbsession)
            reply = {'success': (tle_sources['success'] & submit_reply['success']),
                     'data': tle_sources.get('data', [])}

        elif cmd == "delete-tle-sources":
            logger.info(f'Deleting TLE source, data: {data}')
            delete_reply = await crud.delete_satellite_tle_sources(dbsession, data)

            tle_sources = await crud.fetch_satellite_tle_source(dbsession)
            reply = {'success': (tle_sources['success'] & delete_reply['success']),
                     'data': tle_sources.get('data', [])}

        elif cmd == "edit-tle-source":
            logger.info(f'Editing TLE source, data: {data}')
            edit_reply = await crud.edit_satellite_tle_source(dbsession, data['id'], data)

            tle_sources = await crud.fetch_satellite_tle_source(dbsession)
            reply = {'success': (tle_sources['success'] & edit_reply['success']),
                     'data': tle_sources.get('data', [])}

        elif cmd == "submit-satellite-group":
            logger.info(f'Adding satellite group, data: {data}')
            submit_reply = await crud.add_satellite_group(dbsession, data)

            satellite_groups = await crud.fetch_satellite_group(dbsession, group_type='user')
            reply = {'success': (satellite_groups['success'] & submit_reply['success']),
                     'data': satellite_groups.get('data', [])}

        elif cmd == "delete-satellite-group":
            logger.info(f'Deleting satellite groups, data: {data}')
            delete_reply = await crud.delete_satellite_group(dbsession, data)

            satellite_groups = await crud.fetch_satellite_group(dbsession, group_type="user")
            reply = {'success': (satellite_groups['success'] & delete_reply['success']),
                     'data': satellite_groups.get('data', [])}

        elif cmd == "edit-satellite-group":
            logger.info(f'Editing satellite group, data: {data}')
            edit_reply = await crud.edit_satellite_group(dbsession, data['id'], data)

            satellite_groups = await crud.fetch_satellite_group(dbsession, group_type="user")
            reply = {'success': (satellite_groups['success'] & edit_reply['success']),
                     'data': satellite_groups.get('data', [])}

        elif cmd == "submit-user":
            logger.info(f'Adding user, data: {data}')
            add_reply = await crud.add_user(dbsession, data)

            users = await crud.fetch_users(dbsession, user_id=None)
            users = json.loads(json.dumps(users, cls=ModelEncoder))
            reply = {'success': (users['success'] & add_reply['success']),
                     'data': users.get('data', [])}

        elif cmd == "edit-user":
            logger.info(f'Editing user, data: {data}')
            edit_reply = await crud.edit_user(dbsession, data)

            users = await crud.fetch_users(dbsession, user_id=None)
            users = json.loads(json.dumps(users, cls=ModelEncoder))
            reply = {'success': (users['success'] & edit_reply['success']),
                     'data': users.get('data', [])}

        elif cmd == "delete-user":
            logger.info(f'Delete user, data: {data}')
            delete_reply = await crud.delete_user(dbsession, data)

            users = await crud.fetch_users(dbsession, user_id=None)
            users = json.loads(json.dumps(users, cls=ModelEncoder))
            reply = {'success': (users['success'] & delete_reply['success']),
                     'data': users.get('data', [])}

        elif cmd == "submit-rig":
            logger.info(f'Adding rig, data: {data}')
            add_reply = await crud.add_rig(dbsession, data)

            rigs = await crud.fetch_rigs(dbsession)
            rigs = json.loads(json.dumps(rigs, cls=ModelEncoder))
            reply = {'success': (rigs['success'] & add_reply['success']),
                     'data': rigs.get('data', [])}

        elif cmd == "edit-rig":
            logger.info(f'Editing rig, data: {data}')
            edit_reply = await crud.edit_rig(dbsession, data)

            rigs = await crud.fetch_rigs(dbsession)
            rigs = json.loads(json.dumps(rigs, cls=ModelEncoder))
            reply = {'success': (rigs['success'] & edit_reply['success']),
                     'data': rigs.get('data', [])}

        elif cmd == "delete-rig":
            logger.info(f'Delete rig, data: {data}')
            delete_reply = await crud.delete_rig(dbsession, data)

            rigs = await crud.fetch_rigs(dbsession)
            rigs = json.loads(json.dumps(rigs, cls=ModelEncoder))
            reply = {'success': (rigs['success'] & delete_reply['success']),
                     'data': rigs.get('data', [])}

        elif cmd == "submit-rotator":
            logger.info(f'Adding rotator, data: {data}')
            add_reply = await crud.add_rotator(dbsession, data)

            rotators = await crud.fetch_rotators(dbsession)
            rotators = json.loads(json.dumps(rotators, cls=ModelEncoder))
            reply = {'success': (rotators['success'] & add_reply['success']),
                     'data': rotators.get('data', [])}

        elif cmd == "edit-rotator":
            logger.info(f'Editing rotator, data: {data}')
            edit_reply = await crud.edit_rotator(dbsession, data)
            logger.info(f'Edit rotator reply: {edit_reply}')

            rotators = await crud.fetch_rotators(dbsession)
            logger.info(f'Rotators: {rotators}')
            rotators = json.loads(json.dumps(rotators, cls=ModelEncoder))
            reply = {'success': (rotators['success'] & edit_reply['success']),
                     'data': rotators.get('data', [])}

        elif cmd == "delete-rotator":
            logger.info(f'Delete rotator, data: {data}')
            delete_reply = await crud.delete_rotators(dbsession, data)

            rotators = await crud.fetch_rotators(dbsession)
            rotators = json.loads(json.dumps(rotators, cls=ModelEncoder))
            reply = {'success': (rotators['success'] & delete_reply['success']),
                     'data': rotators.get('data', [])}

        elif cmd == "submit-location":
            logger.info(f'Adding location, data: {data}')
            add_reply = await crud.add_location(dbsession, data)
            reply = {'success': add_reply['success'], 'data': None}

        elif cmd == "submit-location-for-user-id":
            logger.info(f'Adding location for user id, data: {data}')
            locations = await crud.fetch_location_for_userid(dbsession, user_id=data['userid'])

            # if there is a location for the user id then skip adding a location for now,
            # if there are multiple users at some point then we change this logic again
            if not locations['data']:
                add_reply = await crud.add_location(dbsession, data)
                reply = {'success': add_reply['success'], 'data': None, 'error': add_reply.get('error', None)}
            else:
                # update the location
                update_reply = await crud.edit_location(dbsession, data)
                reply = {'success': update_reply['success'], 'data': None, 'error': update_reply.get('error', None)}

        elif cmd == "edit-location":
            logger.info(f'Editing location, data: {data}')
            edit_reply = await crud.edit_location(dbsession, data)
            reply = {'success': edit_reply['success'], 'data': None}

        elif cmd == "delete-location":
            logger.info(f'Delete location, data: {data}')
            delete_reply = await crud.delete_location(dbsession, data)
            reply = {'success': delete_reply['success'], 'data': None}

        else:
            logger.info(f'Unknown command: {cmd}')

    return reply


async def auth_request_routing(sio, cmd, data, logger):
    """
    Routes authentication requests to the appropriate handle based on the command
    provided. Establishes an asynchronous session with the database for processing
    the request. Ensures the database session is properly closed after use.

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

        logger.info(f'Auth request, cmd: {cmd}, data: {data}')
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
