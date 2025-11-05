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

"""Hardware (rigs, rotators, cameras, SDRs) handlers."""

from typing import Any, Dict, Optional, Union

import crud
from db import AsyncSessionLocal
from sdr.soapysdrbrowser import discovered_servers
from sdr.utils import get_local_soapy_sdr_devices
from sdr.utils import get_sdr_parameters as fetch_sdr_parameters_util
from tracker.runner import queue_to_tracker

# ============================================================================
# RIGS
# ============================================================================


async def get_rigs(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Get all radio rigs."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Getting radio rigs, data: {data}")
        rigs = await crud.hardware.fetch_rigs(dbsession)
        return {"success": rigs["success"], "data": rigs.get("data", [])}


async def submit_rig(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Add a new rig."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Adding rig, data: {data}")
        add_reply = await crud.hardware.add_rig(dbsession, data)

        rigs = await crud.hardware.fetch_rigs(dbsession)
        return {
            "success": (rigs["success"] & add_reply["success"]),
            "data": rigs.get("data", []),
        }


async def edit_rig(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Edit an existing rig."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Editing rig, data: {data}")
        edit_reply = await crud.hardware.edit_rig(dbsession, data)

        rigs = await crud.hardware.fetch_rigs(dbsession)
        return {
            "success": (rigs["success"] & edit_reply["success"]),
            "data": rigs.get("data", []),
        }


async def delete_rig(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Delete a rig."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Delete rig, data: {data}")
        delete_reply = await crud.hardware.delete_rig(dbsession, data)

        rigs = await crud.hardware.fetch_rigs(dbsession)
        return {
            "success": (rigs["success"] & delete_reply["success"]),
            "data": rigs.get("data", []),
        }


# ============================================================================
# ROTATORS
# ============================================================================


async def get_rotators(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Get all antenna rotators."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Getting antenna rotators, data: {data}")
        rotators = await crud.hardware.fetch_rotators(dbsession)
        return {"success": rotators["success"], "data": rotators.get("data", [])}


async def submit_rotator(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Add a new rotator."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Adding rotator, data: {data}")
        add_reply = await crud.hardware.add_rotator(dbsession, data)

        rotators = await crud.hardware.fetch_rotators(dbsession)
        return {
            "success": (rotators["success"] & add_reply["success"]),
            "data": rotators.get("data", []),
        }


async def edit_rotator(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Edit an existing rotator."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Editing rotator, data: {data}")
        edit_reply = await crud.hardware.edit_rotator(dbsession, data)
        logger.debug(f"Edit rotator reply: {edit_reply}")

        rotators = await crud.hardware.fetch_rotators(dbsession)
        logger.debug(f"Rotators: {rotators}")
        return {
            "success": (rotators["success"] & edit_reply["success"]),
            "data": rotators.get("data", []),
        }


async def delete_rotator(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Delete rotators."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Delete rotator, data: {data}")
        delete_reply = await crud.hardware.delete_rotators(dbsession, data)

        rotators = await crud.hardware.fetch_rotators(dbsession)
        return {
            "success": (rotators["success"] & delete_reply["success"]),
            "data": rotators.get("data", []),
        }


async def nudge_rotator(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, None]]:
    """Nudge rotator position."""
    logger.info(f"Nudging rotator, data: {data}")
    # Put command into the tracker queue
    cmd = data.get("cmd", None) if data else None
    queue_to_tracker.put({"command": cmd, "data": None})
    return {"success": True, "data": None}


# ============================================================================
# CAMERAS
# ============================================================================


async def get_cameras(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Get all cameras."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Getting cameras, data: {data}")
        cameras = await crud.hardware.fetch_cameras(dbsession)
        return {"success": cameras["success"], "data": cameras.get("data", [])}


async def submit_camera(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Add a new camera."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Adding camera, data: {data}")
        add_reply = await crud.hardware.add_camera(dbsession, data)

        cameras = await crud.hardware.fetch_cameras(dbsession)
        return {
            "success": (cameras["success"] & add_reply["success"]),
            "data": cameras.get("data", []),
        }


async def edit_camera(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Edit an existing camera."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Editing camera, data: {data}")
        edit_reply = await crud.hardware.edit_camera(dbsession, data)
        logger.debug(f"Edit camera reply: {edit_reply}")

        cameras = await crud.hardware.fetch_cameras(dbsession)
        logger.debug(f"Cameras: {cameras}")
        return {
            "success": (cameras["success"] & edit_reply["success"]),
            "data": cameras.get("data", []),
        }


async def delete_camera(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Delete cameras."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Delete camera, data: {data}")
        delete_reply = await crud.hardware.delete_cameras(dbsession, data)

        cameras = await crud.hardware.fetch_cameras(dbsession)
        return {
            "success": (cameras["success"] & delete_reply["success"]),
            "data": cameras.get("data", []),
        }


# ============================================================================
# SDRs
# ============================================================================


async def get_sdrs(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Get all SDRs."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Getting SDRs, data: {data}")
        sdrs = await crud.hardware.fetch_sdrs(dbsession)

        # Add hardcoded SigMF Playback SDR for recording playback
        sdrs_list = sdrs.get("data", [])
        sigmf_playback_sdr = {
            "id": "sigmf-playback",
            "name": "SigMF Playback",
            "type": "sigmfplayback",
            "driver": "sigmfplayback",
            "serial": None,
            "host": None,
            "port": None,
            "frequency_min": 0,
            "frequency_max": 6000000000,
        }
        sdrs_list.append(sigmf_playback_sdr)

        return {"success": sdrs["success"], "data": sdrs_list}


async def submit_sdr(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Add a new SDR."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Adding SDR, data: {data}")
        add_reply = await crud.hardware.add_sdr(dbsession, data)
        logger.info(add_reply)

        sdrs = await crud.hardware.fetch_sdrs(dbsession)

        return {
            "success": (sdrs["success"] & add_reply["success"]),
            "data": sdrs.get("data", []),
        }


async def edit_sdr(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Edit an existing SDR."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Editing SDR, data: {data}")
        edit_reply = await crud.hardware.edit_sdr(dbsession, data)
        logger.debug(f"Edit SDR reply: {edit_reply}")

        sdrs = await crud.hardware.fetch_sdrs(dbsession)
        logger.debug(f"SDRs: {sdrs}")
        return {
            "success": (sdrs["success"] & edit_reply["success"]),
            "data": sdrs.get("data", []),
        }


async def delete_sdr(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list, str]]:
    """Delete SDRs."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Delete SDR, data: {data}")
        if not data:
            return {"success": False, "data": [], "error": "No data provided"}

        delete_reply = await crud.hardware.delete_sdrs(dbsession, list(data))

        sdrs = await crud.hardware.fetch_sdrs(dbsession)
        return {
            "success": (sdrs["success"] & delete_reply["success"]),
            "data": sdrs.get("data", []),
        }


async def get_soapy_servers(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """Get discovered SoapySDR servers."""
    logger.debug("Getting discovered SoapySDR servers")
    return {"success": True, "data": discovered_servers}


async def get_sdr_parameters(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list, str]]:
    """Get SDR parameters."""
    async with AsyncSessionLocal() as dbsession:
        logger.debug("Getting SDR parameters")
        parameters = await fetch_sdr_parameters_util(dbsession, data)
        return {
            "success": parameters["success"],
            "data": parameters.get("data", []),
            "error": parameters.get("error", None),
        }


async def get_local_soapy_sdr_devices_handler(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list, str]]:
    """Get local SoapySDR devices."""
    logger.debug("Getting local SoapySDR devices")
    devices = await get_local_soapy_sdr_devices()
    return {
        "success": devices["success"],
        "data": devices["data"],
        "error": devices["error"],
    }


def register_handlers(registry):
    """Register hardware handlers with the command registry."""
    registry.register_batch(
        {
            # Rigs
            "get-rigs": (get_rigs, "data_request"),
            "submit-rig": (submit_rig, "data_submission"),
            "edit-rig": (edit_rig, "data_submission"),
            "delete-rig": (delete_rig, "data_submission"),
            # Rotators
            "get-rotators": (get_rotators, "data_request"),
            "submit-rotator": (submit_rotator, "data_submission"),
            "edit-rotator": (edit_rotator, "data_submission"),
            "delete-rotator": (delete_rotator, "data_submission"),
            "nudge-rotator": (nudge_rotator, "data_submission"),
            # Cameras
            "get-cameras": (get_cameras, "data_request"),
            "submit-camera": (submit_camera, "data_submission"),
            "edit-camera": (edit_camera, "data_submission"),
            "delete-camera": (delete_camera, "data_submission"),
            # SDRs
            "get-sdrs": (get_sdrs, "data_request"),
            "submit-sdr": (submit_sdr, "data_submission"),
            "edit-sdr": (edit_sdr, "data_submission"),
            "delete-sdr": (delete_sdr, "data_submission"),
            "get-soapy-servers": (get_soapy_servers, "data_request"),
            "get-sdr-parameters": (get_sdr_parameters, "data_request"),
            "get-local-soapy-sdr-devices": (get_local_soapy_sdr_devices_handler, "data_request"),
        }
    )
