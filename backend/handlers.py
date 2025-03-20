import crud
import requests
import json
from db import engine, AsyncSessionLocal
from sync import *
from datetime import date, datetime


class SQLAlchemyRowEncoder(json.JSONEncoder):
    def default(self, obj):
        # Handle date and datetime objects
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()

        # Attempt to convert SQLAlchemy model objects
        # by reading their columns
        try:
            return {
                column.name: getattr(obj, column.name)
                for column in obj.__table__.columns
            }
        except AttributeError:
            # If the object is not a SQLAlchemy model row, fallback
            return super().default(obj)


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
            logger.info(f'Getting satellites: {data}')
            satellites = await crud.fetch_satellites(dbsession, None)
            satellites = json.loads(json.dumps(satellites, cls=SQLAlchemyRowEncoder))

            reply = {'success': satellites['success'], 'data': satellites.get('data', [])}

        elif cmd == "get-satellite":
            logger.info(f'Getting satellite data for norad id: {data}')
            satellite = await crud.fetch_satellites(dbsession, data)
            satellite = json.loads(json.dumps(satellite, cls=SQLAlchemyRowEncoder))

            reply = {'success': satellite['success'], 'data': satellite.get('data', [])}

        elif cmd == "get-satellites-for-group-id":
            logger.info(f'Getting satellites for group id: {data}')
            satellites = await crud.fetch_satellites_for_group_id(dbsession, data)
            satellites = json.loads(json.dumps(satellites, cls=SQLAlchemyRowEncoder))

            reply = {'success': satellites['success'], 'data': satellites.get('data', [])}

        elif cmd == "get-satellite-groups-user":
            logger.info(f'Getting user satellite groups: {data}')
            satellite_groups = await crud.fetch_satellite_group(dbsession)
            satellite_groups = json.loads(json.dumps(satellite_groups, cls=SQLAlchemyRowEncoder))

            # only return the user groups
            filtered_groups = [satellite_group for satellite_group in satellite_groups['data']
                                        if satellite_group['type'] == SatelliteGroupType.USER]
            reply = {'success': satellite_groups['success'], 'data': filtered_groups}

        elif cmd == "get-satellite-groups-system":
            logger.info(f'Getting system satellite groups: {data}')
            satellite_groups = await crud.fetch_satellite_group(dbsession)
            satellite_groups = json.loads(json.dumps(satellite_groups, cls=SQLAlchemyRowEncoder))

            # only return the system groups
            filtered_groups = [satellite_group for satellite_group in satellite_groups['data']
                               if satellite_group['type'] == SatelliteGroupType.SYSTEM]
            reply = {'success': satellite_groups['success'], 'data': filtered_groups}

        elif cmd == "get-satellite-groups":
            logger.info(f'Getting satellite groups: {data}')
            satellite_groups = await crud.fetch_satellite_group(dbsession)
            satellite_groups = json.loads(json.dumps(satellite_groups, cls=SQLAlchemyRowEncoder))
            reply = {'success': satellite_groups['success'], 'data': satellite_groups.get('data', [])}

        elif cmd == "sync-satellite-data":
            logger.info(f'Syncing satellite data with known TLE sources')
            await synchronize_satellite_data(dbsession, logger, sio)

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
            logger.info(f'Adding TLE source: {data}')
            await crud.add_satellite_tle_source(dbsession, data)

            tle_sources = await crud.fetch_satellite_tle_source(dbsession)
            reply = {'success': tle_sources['success'], 'data': tle_sources.get('data', [])}

        elif cmd == "delete-tle-sources":
            logger.info(f'Deleting TLE source: {data}')
            await crud.delete_satellite_tle_sources(dbsession, data)

            tle_sources = await crud.fetch_satellite_tle_source(dbsession)
            reply = {'success': tle_sources['success'], 'data': tle_sources.get('data', [])}

        elif cmd == "edit-tle-source":
            logger.info(f'Editing TLE source: {data}')
            await crud.edit_satellite_tle_source(dbsession, data['id'], data)

            # get rows
            tle_sources = await crud.fetch_satellite_tle_source(dbsession)
            reply = {'success': tle_sources['success'], 'data': tle_sources.get('data', [])}

        elif cmd == "submit-satellite-group":
            logger.info(f'Adding satellite group: {data}')
            await crud.add_satellite_group(dbsession, data)

            satellite_groups = await crud.fetch_satellite_group(dbsession, group_type='user')
            reply = {'success': satellite_groups['success'], 'data': satellite_groups.get('data', [])}

        elif cmd == "delete-satellite-group":
            logger.info(f'Deleting satellite groups: {data}')
            await crud.delete_satellite_group(dbsession, data)

            satellite_groups = await crud.fetch_satellite_group(dbsession, group_type="user")
            reply = {'success': satellite_groups['success'], 'data': satellite_groups.get('data', [])}

        elif cmd == "edit-satellite-group":
            logger.info(f'Editing satellite group: {data}')
            await crud.edit_satellite_group(dbsession, data['id'], data)

            # get rows
            satellite_groups = await crud.fetch_satellite_group(dbsession, group_type="user")
            reply = {'success': satellite_groups['success'], 'data': satellite_groups.get('data', [])}

        else:
            logger.info(f'Unknown command: {cmd}')

    return reply


def auth_request_routing(session, cmd, data, logger):
    """
    Routes authentication requests to the appropriate handler based on the provided
    command and data, while managing the database session and logging activities.

    :param session: A callable used to create a new database session.
    :param cmd: A string representing the specific command or action to be
        executed.
    :param data: A dictionary containing data required for processing the
        authentication request.
    :param logger: An object or module used for logging activity within the
        function.
    :return: A dictionary with keys 'success' and 'data' indicating the result of
        the operation.
    """
    reply = {'success': None, 'data': None}
    dbsession = session()
    dbsession.close()
    return reply