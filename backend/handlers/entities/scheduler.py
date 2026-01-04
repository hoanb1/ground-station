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

"""Scheduler handlers for scheduled observations and monitored satellites."""

from typing import Any, Dict, List, Optional, Union

# In-memory storage for scheduled observations (will be replaced with DB later)
_scheduled_observations: Dict[str, Dict] = {}

# In-memory storage for monitored satellites (will be replaced with DB later)
_monitored_satellites: Dict[str, Dict] = {}


# ============================================================================
# SCHEDULED OBSERVATIONS
# ============================================================================


async def get_scheduled_observations(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, List, str]]:
    """
    Get all scheduled observations.

    Args:
        sio: Socket.IO server instance
        data: Not used
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and observations list
    """
    logger.info(f"[GET_SCHEDULED_OBSERVATIONS] data={data}, sid={sid}")
    observations_list = list(_scheduled_observations.values())
    return {"success": True, "data": observations_list}


async def create_scheduled_observation(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, Dict, str]]:
    """
    Create a new scheduled observation.

    Args:
        sio: Socket.IO server instance
        data: Observation data
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and created observation
    """
    logger.info(f"[CREATE_SCHEDULED_OBSERVATION] data={data}, sid={sid}")

    if not data:
        logger.error("No data provided")
        return {"success": False, "error": "No data provided"}

    observation_id = data.get("id")
    if not observation_id:
        logger.error("No ID provided in observation data")
        return {"success": False, "error": "Observation ID is required"}

    _scheduled_observations[observation_id] = data
    return {"success": True, "data": data}


async def update_scheduled_observation(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, Dict, str]]:
    """
    Update an existing scheduled observation.

    Args:
        sio: Socket.IO server instance
        data: Observation data with ID
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and updated observation
    """
    logger.info(f"[UPDATE_SCHEDULED_OBSERVATION] data={data}, sid={sid}")

    if not data:
        logger.error("No data provided")
        return {"success": False, "error": "No data provided"}

    observation_id = data.get("id")
    if not observation_id:
        logger.error("No ID provided in observation data")
        return {"success": False, "error": "Observation ID is required"}

    if observation_id not in _scheduled_observations:
        logger.error(f"Observation not found: {observation_id}")
        return {"success": False, "error": f"Observation not found: {observation_id}"}

    _scheduled_observations[observation_id] = data
    return {"success": True, "data": data}


async def delete_scheduled_observations(
    sio: Any, data: Optional[List], logger: Any, sid: str
) -> Dict[str, Union[bool, Dict, str]]:
    """
    Delete one or more scheduled observations.

    Args:
        sio: Socket.IO server instance
        data: List of observation IDs to delete
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status
    """
    logger.info(f"[DELETE_SCHEDULED_OBSERVATIONS] data={data}, sid={sid}")

    if not data or not isinstance(data, list):
        logger.error("Invalid data - list of IDs required")
        return {"success": False, "error": "List of IDs required"}

    deleted_count = 0
    for observation_id in data:
        if observation_id in _scheduled_observations:
            del _scheduled_observations[observation_id]
            deleted_count += 1

    return {"success": True, "data": {"deleted": deleted_count}}


async def toggle_observation_enabled(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, Dict, str]]:
    """
    Enable or disable a scheduled observation.

    Args:
        sio: Socket.IO server instance
        data: Dictionary with 'id' and 'enabled' keys
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status
    """
    logger.info(f"[TOGGLE_OBSERVATION_ENABLED] data={data}, sid={sid}")

    if not data:
        logger.error("No data provided")
        return {"success": False, "error": "No data provided"}

    observation_id = data.get("id")
    enabled = data.get("enabled")

    if not observation_id or enabled is None:
        logger.error("Missing id or enabled field")
        return {"success": False, "error": "ID and enabled status required"}

    if observation_id not in _scheduled_observations:
        logger.error(f"Observation not found: {observation_id}")
        return {"success": False, "error": f"Observation not found: {observation_id}"}

    _scheduled_observations[observation_id]["enabled"] = enabled
    return {"success": True, "data": {"id": observation_id, "enabled": enabled}}


async def cancel_observation(
    sio: Any, data: Optional[str], logger: Any, sid: str
) -> Dict[str, Union[bool, Dict, str]]:
    """
    Cancel a running observation.

    Args:
        sio: Socket.IO server instance
        data: Observation ID
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status
    """
    logger.info(f"[CANCEL_OBSERVATION] data={data}, sid={sid}")

    if not data:
        logger.error("No observation ID provided")
        return {"success": False, "error": "Observation ID required"}

    observation_id = data
    if observation_id not in _scheduled_observations:
        logger.error(f"Observation not found: {observation_id}")
        return {"success": False, "error": f"Observation not found: {observation_id}"}

    _scheduled_observations[observation_id]["status"] = "cancelled"
    return {"success": True, "data": {"id": observation_id}}


# ============================================================================
# MONITORED SATELLITES
# ============================================================================


async def get_monitored_satellites(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, List, str]]:
    """
    Get all monitored satellites.

    Args:
        sio: Socket.IO server instance
        data: Not used
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and monitored satellites list
    """
    logger.info(f"[GET_MONITORED_SATELLITES] data={data}, sid={sid}")
    satellites_list = list(_monitored_satellites.values())
    return {"success": True, "data": satellites_list}


async def create_monitored_satellite(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, Dict, str]]:
    """
    Create a new monitored satellite.

    Args:
        sio: Socket.IO server instance
        data: Monitored satellite data
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and created monitored satellite
    """
    logger.info(f"[CREATE_MONITORED_SATELLITE] data={data}, sid={sid}")

    if not data:
        logger.error("No data provided")
        return {"success": False, "error": "No data provided"}

    satellite_id = data.get("id")
    if not satellite_id:
        logger.error("No ID provided in monitored satellite data")
        return {"success": False, "error": "Satellite ID is required"}

    _monitored_satellites[satellite_id] = data
    return {"success": True, "data": data}


async def update_monitored_satellite(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, Dict, str]]:
    """
    Update an existing monitored satellite.

    Args:
        sio: Socket.IO server instance
        data: Monitored satellite data with ID
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and updated monitored satellite
    """
    logger.info(f"[UPDATE_MONITORED_SATELLITE] data={data}, sid={sid}")

    if not data:
        logger.error("No data provided")
        return {"success": False, "error": "No data provided"}

    satellite_id = data.get("id")
    if not satellite_id:
        logger.error("No ID provided in monitored satellite data")
        return {"success": False, "error": "Satellite ID is required"}

    if satellite_id not in _monitored_satellites:
        logger.error(f"Monitored satellite not found: {satellite_id}")
        return {"success": False, "error": f"Monitored satellite not found: {satellite_id}"}

    _monitored_satellites[satellite_id] = data
    return {"success": True, "data": data}


async def delete_monitored_satellites(
    sio: Any, data: Optional[List], logger: Any, sid: str
) -> Dict[str, Union[bool, Dict, str]]:
    """
    Delete one or more monitored satellites.

    Args:
        sio: Socket.IO server instance
        data: List of monitored satellite IDs to delete
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status
    """
    logger.info(f"[DELETE_MONITORED_SATELLITES] data={data}, sid={sid}")

    if not data or not isinstance(data, list):
        logger.error("Invalid data - list of IDs required")
        return {"success": False, "error": "List of IDs required"}

    deleted_count = 0
    for satellite_id in data:
        if satellite_id in _monitored_satellites:
            del _monitored_satellites[satellite_id]
            deleted_count += 1

    return {"success": True, "data": {"deleted": deleted_count}}


async def toggle_monitored_satellite_enabled(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, Dict, str]]:
    """
    Enable or disable a monitored satellite.

    Args:
        sio: Socket.IO server instance
        data: Dictionary with 'id' and 'enabled' keys
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status
    """
    logger.info(f"[TOGGLE_MONITORED_SATELLITE_ENABLED] data={data}, sid={sid}")

    if not data:
        logger.error("No data provided")
        return {"success": False, "error": "No data provided"}

    satellite_id = data.get("id")
    enabled = data.get("enabled")

    if not satellite_id or enabled is None:
        logger.error("Missing id or enabled field")
        return {"success": False, "error": "ID and enabled status required"}

    if satellite_id not in _monitored_satellites:
        logger.error(f"Monitored satellite not found: {satellite_id}")
        return {"success": False, "error": f"Monitored satellite not found: {satellite_id}"}

    _monitored_satellites[satellite_id]["enabled"] = enabled
    return {"success": True, "data": {"id": satellite_id, "enabled": enabled}}


def register_handlers(registry):
    """Register scheduler handlers with the command registry."""
    registry.register_batch(
        {
            # Scheduled observations
            "get-scheduled-observations": (get_scheduled_observations, "data_request"),
            "create-scheduled-observation": (create_scheduled_observation, "data_submission"),
            "update-scheduled-observation": (update_scheduled_observation, "data_submission"),
            "delete-scheduled-observations": (delete_scheduled_observations, "data_submission"),
            "toggle-observation-enabled": (toggle_observation_enabled, "data_submission"),
            "cancel-observation": (cancel_observation, "data_submission"),
            # Monitored satellites
            "get-monitored-satellites": (get_monitored_satellites, "data_request"),
            "create-monitored-satellite": (create_monitored_satellite, "data_submission"),
            "update-monitored-satellite": (update_monitored_satellite, "data_submission"),
            "delete-monitored-satellites": (delete_monitored_satellites, "data_submission"),
            "toggle-monitored-satellite-enabled": (
                toggle_monitored_satellite_enabled,
                "data_submission",
            ),
        }
    )
