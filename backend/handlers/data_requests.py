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

from typing import Union

import crud
from db import AsyncSessionLocal
from db.models import SatelliteGroupType
from sdr.soapysdrbrowser import discovered_servers
from sdr.utils import get_local_soapy_sdr_devices, get_sdr_parameters
from tlesync.logic import synchronize_satellite_data
from tlesync.state import sync_state_manager
from tracker.data import compiled_satellite_data
from tracking.events import fetch_next_events_for_group, fetch_next_events_for_satellite

from .tracking import emit_tracker_data, emit_ui_tracker_values


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

        reply: dict[str, Union[bool, None, dict, list, str]] = {"success": None, "data": None}

        if cmd == "get-tle-sources":
            logger.debug(f"Getting TLE sources")
            tle_sources = await crud.tle_sources.fetch_satellite_tle_source(dbsession)

            reply = {"success": tle_sources["success"], "data": tle_sources.get("data", [])}

        elif cmd == "get-satellites":
            logger.debug(f"Getting satellites, data: {data}")
            satellites = await crud.satellites.fetch_satellites(dbsession, data)

            reply = {"success": satellites["success"], "data": satellites.get("data", [])}

        elif cmd == "get-satellite":
            logger.debug(f"Getting satellite data for norad id, data: {data}")

            try:
                # compile a complete satellite data set with details position coverage etc.
                satellite_data = await compiled_satellite_data(dbsession, data)
            except Exception as e:
                logger.error(f"Error: {e}")
                reply = {"success": False, "data": {}}
            else:
                reply = {"success": True, "data": satellite_data}

        elif cmd == "get-satellites-for-group-id":
            logger.debug(f"Getting satellites for group id, data: {data}")
            satellites = await crud.satellites.fetch_satellites_for_group_id(dbsession, data)

            # get transmitters
            if satellites:
                for satellite in satellites.get("data", []):
                    transmitters = await crud.transmitters.fetch_transmitters_for_satellite(
                        dbsession, satellite["norad_id"]
                    )
                    satellite["transmitters"] = transmitters["data"]
            else:
                logger.debug(f"No satellites found for group id: {data}")

            reply = {"success": satellites["success"], "data": satellites.get("data", [])}

        elif cmd == "get-satellite-groups-user":
            logger.debug(f"Getting user satellite groups, data: {data}")
            satellite_groups = await crud.groups.fetch_satellite_group(dbsession)

            # only return the user groups
            filtered_groups = [
                satellite_group
                for satellite_group in satellite_groups["data"]
                if satellite_group["type"] == SatelliteGroupType.USER
            ]

            reply = {"success": satellite_groups["success"], "data": filtered_groups}

        elif cmd == "get-satellite-groups-system":
            logger.debug(f"Getting system satellite groups, data: {data}")
            satellite_groups = await crud.groups.fetch_satellite_group(dbsession)

            # only return the system groups
            filtered_groups = [
                satellite_group
                for satellite_group in satellite_groups["data"]
                if satellite_group["type"] == SatelliteGroupType.SYSTEM
            ]
            reply = {"success": satellite_groups["success"], "data": filtered_groups}

        elif cmd == "get-satellite-groups":
            logger.debug(f"Getting satellite groups, data: {data}")
            satellite_groups = await crud.groups.fetch_satellite_group(dbsession)
            reply = {
                "success": satellite_groups["success"],
                "data": satellite_groups.get("data", []),
            }

        elif cmd == "sync-satellite-data":
            logger.debug(f"Syncing satellite data with known TLE sources")
            await synchronize_satellite_data(dbsession, logger, sio)

        elif cmd == "get-users":
            logger.debug(f"Getting users, data: {data}")
            users = await crud.users.fetch_users(dbsession, user_id=None)
            reply = {"success": users["success"], "data": users.get("data", [])}

        elif cmd == "get-rigs":
            logger.debug(f"Getting radio rigs, data: {data}")
            rigs = await crud.hardware.fetch_rigs(dbsession)
            reply = {"success": rigs["success"], "data": rigs.get("data", [])}

        elif cmd == "get-rotators":
            logger.debug(f"Getting antenna rotators, data: {data}")
            rotators = await crud.hardware.fetch_rotators(dbsession)
            reply = {"success": rotators["success"], "data": rotators.get("data", [])}

        elif cmd == "get-cameras":
            logger.debug(f"Getting cameras, data: {data}")
            cameras = await crud.hardware.fetch_cameras(dbsession)
            reply = {"success": cameras["success"], "data": cameras.get("data", [])}

        elif cmd == "get-sdrs":
            logger.debug(f"Getting SDRs, data: {data}")
            sdrs = await crud.hardware.fetch_sdrs(dbsession)
            reply = {"success": sdrs["success"], "data": sdrs.get("data", [])}

        elif cmd == "get-location-for-user-id":
            logger.debug(f"Getting location for user id, data: {data}")
            locations = await crud.locations.fetch_location_for_userid(dbsession, user_id=data)
            reply = {"success": locations["success"], "data": locations.get("data", [])}

        elif cmd == "fetch-next-passes":
            logger.debug(f"Fetching next passes, data: {data}")
            next_passes = await fetch_next_events_for_satellite(
                norad_id=data.get("norad_id", None), hours=data.get("hours", 4.0)
            )
            reply = {
                "success": next_passes["success"],
                "data": next_passes.get("data", []),
                "cached": next_passes.get("cached", False),
                "forecast_hours": next_passes.get("forecast_hours", 4.0),
            }

        elif cmd == "fetch-next-passes-for-group":
            logger.debug(f"Fetching next passes for group, data: {data}")
            next_passes = await fetch_next_events_for_group(
                group_id=data.get("group_id", None), hours=data.get("hours", 2.0)
            )
            reply = {
                "success": next_passes["success"],
                "data": next_passes.get("data", []),
                "cached": next_passes.get("cached", False),
                "forecast_hours": next_passes.get("forecast_hours", 4.0),
            }

        elif cmd == "get-satellite-search":
            logger.debug(f"Searching satellites, data: {data}")
            satellites = await crud.satellites.search_satellites(dbsession, keyword=data)
            reply = {"success": satellites["success"], "data": satellites.get("data", [])}

        elif cmd == "fetch-preferences":
            logger.debug(f"Fetching preferences for user id, data: {data}")
            preferences = await crud.preferences.fetch_preference_for_userid(
                dbsession, user_id=None
            )
            reply = {"success": preferences["success"], "data": preferences.get("data", [])}

        elif cmd == "get-tracking-state":
            logger.debug(f"Fetching tracking state, data: {data}")
            tracking_state = await crud.tracking_state.get_tracking_state(
                dbsession, name="satellite-tracking"
            )
            await emit_tracker_data(dbsession, sio, logger)
            await emit_ui_tracker_values(dbsession, sio, logger)
            reply = {"success": tracking_state["success"], "data": tracking_state.get("data", [])}

        elif cmd == "get-map-settings":
            logger.debug(f"Fetching map settings, data: {data}")
            map_settings = await crud.preferences.get_map_settings(dbsession, name=data)
            reply = {"success": map_settings["success"], "data": map_settings.get("data", [])}

        elif cmd == "get-soapy-servers":
            logger.debug(f"Getting discovered SoapySDR servers")
            reply = {"success": True, "data": discovered_servers}

        elif cmd == "get-sdr-parameters":
            logger.debug(f"Getting SDR parameters")
            parameters = await get_sdr_parameters(dbsession, data)
            reply = {
                "success": parameters["success"],
                "data": parameters.get("data", []),
                "error": parameters.get("error", None),
            }

        elif cmd == "get-local-soapy-sdr-devices":
            logger.debug(f"Getting local SoapySDR devices")
            devices = await get_local_soapy_sdr_devices()
            reply = {
                "success": devices["success"],
                "data": devices["data"],
                "error": devices["error"],
            }

        elif cmd == "fetch-sync-state":
            logger.debug(f"Getting TLE synchronization state")
            reply = {"success": True, "data": sync_state_manager.get_state()}

        else:
            logger.error(f"Unknown command: {cmd}")

    return reply
