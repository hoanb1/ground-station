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

from typing import Dict, Union

import crud
from db import AsyncSessionLocal
from tracker.runner import queue_to_tracker
from vfos.state import VFOManager

from .tracking import emit_tracker_data, emit_ui_tracker_values


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

    async with AsyncSessionLocal() as dbsession:

        reply: Dict[str, Union[bool, None, dict, list, str]] = {"success": None, "data": None}

        if cmd == "submit-tle-sources":
            logger.debug(f"Adding TLE source, data: {data}")
            submit_reply = await crud.tle_sources.add_satellite_tle_source(dbsession, data)

            tle_sources = await crud.tle_sources.fetch_satellite_tle_source(dbsession)
            reply = {
                "success": (tle_sources["success"] & submit_reply["success"]),
                "data": tle_sources.get("data", []),
            }

        elif cmd == "delete-tle-sources":
            logger.debug(f"Deleting TLE source, data: {data}")
            delete_reply = await crud.tle_sources.delete_satellite_tle_sources(dbsession, data)

            tle_sources = await crud.tle_sources.fetch_satellite_tle_source(dbsession)
            reply = {
                "success": (tle_sources["success"] & delete_reply["success"]),
                "data": tle_sources.get("data", []),
                "summary": delete_reply.get("deletion_summary", None),
                "message": delete_reply.get("data", None),
            }

        elif cmd == "edit-tle-source":
            logger.debug(f"Editing TLE source, data: {data}")
            edit_reply = await crud.tle_sources.edit_satellite_tle_source(
                dbsession, data["id"], data
            )

            tle_sources = await crud.tle_sources.fetch_satellite_tle_source(dbsession)
            reply = {
                "success": (tle_sources["success"] & edit_reply["success"]),
                "data": tle_sources.get("data", []),
            }

        elif cmd == "submit-satellite-group":
            logger.debug(f"Adding satellite group, data: {data}")
            submit_reply = await crud.groups.add_satellite_group(dbsession, data)

            satellite_groups = await crud.groups.fetch_satellite_group(dbsession, group_type="user")
            reply = {
                "success": (satellite_groups["success"] & submit_reply["success"]),
                "data": satellite_groups.get("data", []),
            }

        elif cmd == "delete-satellite-group":
            logger.debug(f"Deleting satellite groups, data: {data}")
            delete_reply = await crud.groups.delete_satellite_group(dbsession, data)

            satellite_groups = await crud.groups.fetch_satellite_group(dbsession, group_type="user")
            reply = {
                "success": (satellite_groups["success"] & delete_reply["success"]),
                "data": satellite_groups.get("data", []),
            }

        elif cmd == "edit-satellite-group":
            logger.debug(f"Editing satellite group, data: {data}")
            edit_reply = await crud.groups.edit_satellite_group(dbsession, data["id"], data)

            satellite_groups = await crud.groups.fetch_satellite_group(dbsession, group_type="user")
            reply = {
                "success": (satellite_groups["success"] & edit_reply["success"]),
                "data": satellite_groups.get("data", []),
            }

        elif cmd == "submit-user":
            logger.debug(f"Adding user, data: {data}")
            add_reply = await crud.users.add_user(dbsession, data)

            users = await crud.users.fetch_users(dbsession, user_id=None)
            reply = {
                "success": (users["success"] & add_reply["success"]),
                "data": users.get("data", []),
            }

        elif cmd == "edit-user":
            logger.debug(f"Editing user, data: {data}")
            edit_reply = await crud.users.edit_user(dbsession, data)

            users = await crud.users.fetch_users(dbsession, user_id=None)
            reply = {
                "success": (users["success"] & edit_reply["success"]),
                "data": users.get("data", []),
            }

        elif cmd == "delete-user":
            logger.debug(f"Delete user, data: {data}")
            delete_reply = await crud.users.delete_user(dbsession, data)

            users = await crud.users.fetch_users(dbsession, user_id=None)
            reply = {
                "success": (users["success"] & delete_reply["success"]),
                "data": users.get("data", []),
            }

        elif cmd == "submit-rig":
            logger.debug(f"Adding rig, data: {data}")
            add_reply = await crud.hardware.add_rig(dbsession, data)

            rigs = await crud.hardware.fetch_rigs(dbsession)
            reply = {
                "success": (rigs["success"] & add_reply["success"]),
                "data": rigs.get("data", []),
            }

        elif cmd == "edit-rig":
            logger.debug(f"Editing rig, data: {data}")
            edit_reply = await crud.hardware.edit_rig(dbsession, data)

            rigs = await crud.hardware.fetch_rigs(dbsession)
            reply = {
                "success": (rigs["success"] & edit_reply["success"]),
                "data": rigs.get("data", []),
            }

        elif cmd == "delete-rig":
            logger.debug(f"Delete rig, data: {data}")
            delete_reply = await crud.hardware.delete_rig(dbsession, data)

            rigs = await crud.hardware.fetch_rigs(dbsession)
            reply = {
                "success": (rigs["success"] & delete_reply["success"]),
                "data": rigs.get("data", []),
            }

        elif cmd == "submit-rotator":
            logger.debug(f"Adding rotator, data: {data}")
            add_reply = await crud.hardware.add_rotator(dbsession, data)

            rotators = await crud.hardware.fetch_rotators(dbsession)
            reply = {
                "success": (rotators["success"] & add_reply["success"]),
                "data": rotators.get("data", []),
            }

        elif cmd == "edit-rotator":
            logger.debug(f"Editing rotator, data: {data}")
            edit_reply = await crud.hardware.edit_rotator(dbsession, data)
            logger.debug(f"Edit rotator reply: {edit_reply}")

            rotators = await crud.hardware.fetch_rotators(dbsession)
            logger.debug(f"Rotators: {rotators}")
            reply = {
                "success": (rotators["success"] & edit_reply["success"]),
                "data": rotators.get("data", []),
            }

        elif cmd == "delete-rotator":
            logger.debug(f"Delete rotator, data: {data}")
            delete_reply = await crud.hardware.delete_rotators(dbsession, data)

            rotators = await crud.hardware.fetch_rotators(dbsession)
            reply = {
                "success": (rotators["success"] & delete_reply["success"]),
                "data": rotators.get("data", []),
            }

        elif cmd == "submit-camera":
            logger.debug(f"Adding camera, data: {data}")
            add_reply = await crud.hardware.add_camera(dbsession, data)

            cameras = await crud.hardware.fetch_cameras(dbsession)
            reply = {
                "success": (cameras["success"] & add_reply["success"]),
                "data": cameras.get("data", []),
            }

        elif cmd == "edit-camera":
            logger.debug(f"Editing camera, data: {data}")
            edit_reply = await crud.hardware.edit_camera(dbsession, data)
            logger.debug(f"Edit camera reply: {edit_reply}")

            cameras = await crud.hardware.fetch_cameras(dbsession)
            logger.debug(f"Cameras: {cameras}")
            reply = {
                "success": (cameras["success"] & edit_reply["success"]),
                "data": cameras.get("data", []),
            }

        elif cmd == "delete-camera":
            logger.debug(f"Delete camera, data: {data}")
            delete_reply = await crud.hardware.delete_cameras(dbsession, data)

            cameras = await crud.hardware.fetch_cameras(dbsession)
            reply = {
                "success": (cameras["success"] & delete_reply["success"]),
                "data": cameras.get("data", []),
            }

        elif cmd == "delete-sdr":
            logger.debug(f"Delete SDR, data: {data}")
            delete_reply = await crud.hardware.delete_sdrs(dbsession, list(data))

            sdrs = await crud.hardware.fetch_sdrs(dbsession)
            reply = {
                "success": (sdrs["success"] & delete_reply["success"]),
                "data": sdrs.get("data", []),
            }

        elif cmd == "submit-sdr":
            logger.debug(f"Adding SDR, data: {data}")
            add_reply = await crud.hardware.add_sdr(dbsession, data)
            logger.info(add_reply)

            sdrs = await crud.hardware.fetch_sdrs(dbsession)

            reply = {
                "success": (sdrs["success"] & add_reply["success"]),
                "data": sdrs.get("data", []),
            }

        elif cmd == "edit-sdr":
            logger.debug(f"Editing SDR, data: {data}")
            edit_reply = await crud.hardware.edit_sdr(dbsession, data)
            logger.debug(f"Edit SDR reply: {edit_reply}")

            sdrs = await crud.hardware.fetch_sdrs(dbsession)
            logger.debug(f"SDRs: {sdrs}")
            reply = {
                "success": (sdrs["success"] & edit_reply["success"]),
                "data": sdrs.get("data", []),
            }

        elif cmd == "submit-location":
            logger.debug(f"Adding location, data: {data}")
            add_reply = await crud.locations.add_location(dbsession, data)
            reply = {"success": add_reply["success"], "data": None}

        elif cmd == "submit-location-for-user-id":
            logger.debug(f"Adding location for user id, data: {data}")
            locations = await crud.locations.fetch_location_for_userid(
                dbsession, user_id=data["userid"]
            )

            # if there is a location for the user id then don't add, update the location,
            # if there are multiple users at some point then we change this logic again
            if not locations["data"]:
                add_reply = await crud.locations.add_location(dbsession, data)
                reply = {
                    "success": add_reply["success"],
                    "data": add_reply["data"],
                    "error": add_reply.get("error", None),
                }
            else:
                # update the location
                update_reply = await crud.locations.edit_location(dbsession, data)
                reply = {
                    "success": update_reply["success"],
                    "data": update_reply["data"],
                    "error": update_reply.get("error", None),
                }

        elif cmd == "edit-location":
            logger.debug(f"Editing location, data: {data}")
            edit_reply = await crud.locations.edit_location(dbsession, data)
            reply = {"success": edit_reply["success"], "data": None}

        elif cmd == "delete-location":
            logger.debug(f"Delete location, data: {data}")
            delete_reply = await crud.locations.delete_location(dbsession, data)
            reply = {"success": delete_reply["success"], "data": None}

        elif cmd == "update-preferences":
            logger.debug(f"Updating preferences, data: {data}")
            update_reply = await crud.preferences.set_preferences(dbsession, list(data))
            reply = {"success": update_reply["success"], "data": update_reply.get("data", [])}

        elif cmd == "set-tracking-state":
            logger.info(f"Updating satellite tracking state, data: {data}")
            # store the tracking state in the db
            tracking_state_reply = await crud.tracking_state.set_tracking_state(dbsession, data)

            # we emit here so that any open browsers are also informed of any change
            await emit_tracker_data(dbsession, sio, logger)
            await emit_ui_tracker_values(dbsession, sio, logger)
            reply = {
                "success": tracking_state_reply["success"],
                "data": tracking_state_reply["data"]["value"],
            }

        elif cmd == "set-map-settings":
            logger.debug(f"Updating map settings, data: {data}")
            map_settings_reply = await crud.preferences.set_map_settings(dbsession, data)
            # we emit here so that any open browsers are also informed of any change
            await emit_tracker_data(dbsession, sio, logger)
            await emit_ui_tracker_values(dbsession, sio, logger)
            reply = {"success": map_settings_reply["success"], "data": map_settings_reply["data"]}

        elif cmd == "nudge-rotator":
            logger.info(f"Nudging rotator, data: {data}")
            # Put command into the tracker queue
            queue_to_tracker.put({"command": data.get("cmd", None), "data": None})
            reply = {"success": True, "data": None}

        elif cmd == "submit-transmitter":
            logger.debug(f"Adding transmitter, data: {data}")
            add_reply = await crud.transmitters.add_transmitter(dbsession, data)
            transmitters = await crud.transmitters.fetch_transmitters_for_satellite(
                dbsession, data.get("norad_cat_id")
            )
            reply = {
                "success": (transmitters["success"] & add_reply["success"]),
                "data": transmitters.get("data", []),
            }

        elif cmd == "edit-transmitter":
            logger.debug(f"Editing transmitter, data: {data}")
            edit_reply = await crud.transmitters.edit_transmitter(dbsession, data)
            logger.info(edit_reply)
            transmitters = await crud.transmitters.fetch_transmitters_for_satellite(
                dbsession, data.get("norad_cat_id")
            )
            reply = {
                "success": (transmitters["success"] & edit_reply["success"]),
                "data": transmitters.get("data", []),
            }

        elif cmd == "delete-transmitter":
            logger.debug(f"Deleting transmitter, data: {data}")
            delete_reply = await crud.transmitters.delete_transmitter(
                dbsession, data.get("transmitter_id")
            )
            transmitters = await crud.transmitters.fetch_transmitters_for_satellite(
                dbsession, data.get("norad_cat_id")
            )
            reply = {
                "success": (transmitters["success"] & delete_reply["success"]),
                "data": transmitters.get("data", []),
            }

        elif cmd == "update-vfo-parameters":
            logger.debug(f"Updating VFO parameters, data: {data}")
            vfomanager = VFOManager()
            vfomanager.update_vfo_state(
                session_id=sid,
                vfo_id=data.get("vfoNumber", 0),
                center_freq=int(data.get("frequency", 0)),
                bandwidth=int(data.get("bandwidth", 0)),
                modulation=data.get("mode", "fm"),
                active=data.get("active", None),
                selected=data.get("selected", None),
                volume=data.get("volume", None),
                squelch=data.get("squelch", None),
            )

            reply = {"success": True, "data": {}}

        elif cmd == "delete-satellite":
            logger.debug(f"Delete satellite, data: {data}")
            delete_reply = await crud.satellites.delete_satellite(dbsession, data)

            satellites = await crud.satellites.fetch_satellites(dbsession, None)
            reply = {
                "success": (satellites["success"] & delete_reply["success"]),
                "data": satellites.get("data", []),
            }

        else:
            logger.error(f"Unknown command: {cmd}")

    return reply
