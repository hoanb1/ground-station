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

"""
TrackerManager: Clean interface for controlling the satellite tracker.

The tracker loop polls the database for tracking state changes. This manager
provides a simple API to update that state without directly coupling to the
database schema.
"""

import logging
from typing import Any, Dict, Optional

import crud
from common.constants import TrackingStateNames
from db import AsyncSessionLocal

logger = logging.getLogger("tracker-manager")


class TrackerManager:
    """
    Manager for controlling the satellite tracker through database state updates.

    The tracker loop continuously polls the 'satellite-tracking' state record
    in the database. This manager provides a clean interface to update that
    state, which the tracker will pick up on its next iteration (~2 seconds).
    """

    async def update_tracking_state(self, **kwargs) -> Dict[str, Any]:
        """
        Update any fields in the satellite tracking state.

        The tracker loop will detect these changes on its next iteration and
        respond accordingly (e.g., connecting hardware, changing satellites).

        Args:
            norad_id (int, optional): NORAD ID of satellite to track
            group_id (str, optional): UUID of satellite group
            rotator_state (str, optional): Rotator state - "connected", "disconnected",
                                          "tracking", "stopped", "parked"
            rig_state (str, optional): Rig state - "connected", "disconnected", "tuning"
            rotator_id (str, optional): UUID of rotator hardware or "none"
            rig_id (str, optional): UUID of rig hardware or "none"
            transmitter_id (str, optional): UUID of transmitter or "none"
            rig_vfo (str, optional): VFO configuration or "none"
            vfo1 (str, optional): VFO1 mode - "uplink" or "downlink"
            vfo2 (str, optional): VFO2 mode - "uplink" or "downlink"

        Returns:
            dict: Response from database operation with 'success' and 'data' fields

        Example:
            # Change target satellite
            await manager.update_tracking_state(norad_id=25544, group_id="abc-123")

            # Connect rotator
            await manager.update_tracking_state(rotator_state="connected")

            # Update multiple fields
            await manager.update_tracking_state(
                norad_id=20442,
                rotator_state="connected",
                rotator_id="2fb00a81-c0fd-4848-ab40-3101751d0534"
            )
        """
        if not kwargs:
            logger.warning("update_tracking_state called with no arguments")
            return {"success": False, "error": "No fields provided to update"}

        async with AsyncSessionLocal() as dbsession:
            # Get current tracking state
            current_state_reply = await crud.tracking_state.get_tracking_state(
                dbsession, name=TrackingStateNames.SATELLITE_TRACKING
            )

            if not current_state_reply.get("success"):
                logger.error(f"Failed to get current tracking state: {current_state_reply}")
                return dict(current_state_reply)

            # Merge new values with existing state
            # Handle case where data is None (tracking state doesn't exist yet)
            current_value = (current_state_reply.get("data") or {}).get("value", {})
            updated_value = {**current_value, **kwargs}

            # Update tracking state in database
            result = await crud.tracking_state.set_tracking_state(
                dbsession,
                {
                    "name": TrackingStateNames.SATELLITE_TRACKING,
                    "value": updated_value,
                },
            )

            if result.get("success"):
                logger.info(
                    f"Updated tracking state: {', '.join(f'{k}={v}' for k, v in kwargs.items())}"
                )
            else:
                logger.error(f"Failed to update tracking state: {result}")

            return dict(result)

    async def get_tracking_state(self) -> Optional[Dict[str, Any]]:
        """
        Get the current satellite tracking state from the database.

        Returns:
            dict or None: Current tracking state value containing norad_id, group_id,
                         rotator_state, rig_state, hardware IDs, etc. Returns None
                         if no tracking state exists.

        Example:
            state = await manager.get_tracking_state()
            # Returns: {
            #     "norad_id": 20442,
            #     "group_id": "8d8bdad0-...",
            #     "rotator_state": "connected",
            #     "rig_state": "disconnected",
            #     "rotator_id": "2fb00a81-...",
            #     ...
            # }
        """
        async with AsyncSessionLocal() as dbsession:
            result = await crud.tracking_state.get_tracking_state(
                dbsession, name=TrackingStateNames.SATELLITE_TRACKING
            )

            if result.get("success") and result.get("data"):
                value = result["data"].get("value")
                return dict(value) if value else None

            logger.warning(f"Failed to get tracking state: {result}")
            return None

    async def stop_tracking(self) -> Dict[str, Any]:
        """
        Stop all tracking and disconnect hardware.

        This is a convenience method that sets both rotator and rig states
        to disconnected.

        Returns:
            dict: Response from database operation
        """
        return await self.update_tracking_state(
            rotator_state="disconnected",
            rig_state="disconnected",
        )
