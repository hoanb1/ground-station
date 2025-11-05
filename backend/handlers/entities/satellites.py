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

"""Satellite data handlers."""

from typing import Any, Dict, Optional, Union

import crud
from db import AsyncSessionLocal
from tlesync.logic import synchronize_satellite_data
from tracker.data import compiled_satellite_data


async def get_satellites(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """
    Get list of satellites.

    Args:
        sio: Socket.IO server instance
        data: Filter parameters
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and satellite data
    """
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Getting satellites, data: {data}")
        satellites = await crud.satellites.fetch_satellites(dbsession, data)
        return {"success": satellites["success"], "data": satellites.get("data", [])}


async def get_satellite(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, dict]]:
    """
    Get single satellite with complete details (position, coverage, etc.).

    Args:
        sio: Socket.IO server instance
        data: Satellite identifier
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and satellite data
    """
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Getting satellite data for norad id, data: {data}")
        try:
            satellite_data = await compiled_satellite_data(dbsession, data)
            return {"success": True, "data": satellite_data}
        except Exception as e:
            logger.error(f"Error: {e}")
            return {"success": False, "data": {}}


async def get_satellites_for_group_id(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """
    Get satellites for a specific group ID with their transmitters.

    Args:
        sio: Socket.IO server instance
        data: Group ID
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and satellites data
    """
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Getting satellites for group id, data: {data}")
        satellites = await crud.satellites.fetch_satellites_for_group_id(dbsession, data)

        # Get transmitters for each satellite
        if satellites:
            for satellite in satellites.get("data", []):
                transmitters = await crud.transmitters.fetch_transmitters_for_satellite(
                    dbsession, satellite["norad_id"]
                )
                satellite["transmitters"] = transmitters["data"]
        else:
            logger.debug(f"No satellites found for group id: {data}")

        return {"success": satellites["success"], "data": satellites.get("data", [])}


async def search_satellites(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """
    Search satellites by keyword.

    Args:
        sio: Socket.IO server instance
        data: Search keyword
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and search results
    """
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Searching satellites, data: {data}")
        satellites = await crud.satellites.search_satellites(dbsession, keyword=data)
        return {"success": satellites["success"], "data": satellites.get("data", [])}


async def delete_satellite(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, list]]:
    """
    Delete a satellite.

    Args:
        sio: Socket.IO server instance
        data: Satellite identifier
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and updated satellites list
    """
    async with AsyncSessionLocal() as dbsession:
        logger.debug(f"Delete satellite, data: {data}")
        delete_reply = await crud.satellites.delete_satellite(dbsession, data)

        satellites = await crud.satellites.fetch_satellites(dbsession, None)
        return {
            "success": (satellites["success"] & delete_reply["success"]),
            "data": satellites.get("data", []),
        }


async def sync_satellite_data(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, None]]:
    """
    Synchronize satellite data with known TLE sources.

    Args:
        sio: Socket.IO server instance
        data: Not used
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status
    """
    async with AsyncSessionLocal() as dbsession:
        logger.debug("Syncing satellite data with known TLE sources")
        await synchronize_satellite_data(dbsession, logger, sio)
        return {"success": True, "data": None}


def register_handlers(registry):
    """Register satellite handlers with the command registry."""
    registry.register_batch(
        {
            "get-satellites": (get_satellites, "data_request"),
            "get-satellite": (get_satellite, "data_request"),
            "get-satellites-for-group-id": (get_satellites_for_group_id, "data_request"),
            "get-satellite-search": (search_satellites, "data_request"),
            "delete-satellite": (delete_satellite, "data_submission"),
            "sync-satellite-data": (sync_satellite_data, "data_request"),
        }
    )
