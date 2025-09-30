# Copyright (c) 2025 Efstratios Goudelis
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

import crud
from tracker.data import get_ui_tracker_state, compiled_satellite_data


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

        tracking_state_reply = await crud.satellites.get_tracking_state(dbsession, name='satellite-tracking')
        norad_id = tracking_state_reply['data']['value'].get('norad_id', None)
        satellite_data = await compiled_satellite_data(dbsession, norad_id)
        data = {
            'satellite_data': satellite_data,
            'tracking_state':tracking_state_reply['data']['value'],
        }
        await sio.emit('satellite-tracking', data)

    except Exception as e:
        logger.error(f'Error emitting tracker data: {e}')
        logger.exception(e)


async def emit_ui_tracker_values(dbsession, sio, logger):
    """
    Call this when UI tracker values are updated

    :param dbsession:
    :param sio:
    :param logger:
    :return:
    """

    try:
        logger.debug("Sending UI tracker value to clients...")

        tracking_state_reply = await crud.satellites.get_tracking_state(dbsession, name='satellite-tracking')
        group_id = tracking_state_reply['data']['value'].get('group_id', None)
        norad_id = tracking_state_reply['data']['value'].get('norad_id', None)
        ui_tracker_state = await get_ui_tracker_state(group_id, norad_id)
        data = ui_tracker_state['data']
        await sio.emit('ui-tracker-state', data)

    except Exception as e:
        logger.error(f'Error emitting UI tracker values: {e}')
        logger.exception(e)