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
Rotator handler for satellite tracking.
Handles all rotator-related operations including connection, positioning, and limit checking.
"""

import logging
import sys

import crud

# anext is a builtin in Python 3.10+ but mypy may not recognize it
if sys.version_info >= (3, 10):
    anext = anext  # type: ignore[name-defined]
else:
    anext = __builtins__.anext  # type: ignore[attr-defined,name-defined,unused-ignore]

from common.constants import DictKeys, SocketEvents, TrackingEvents, TrackingStateNames
from controllers.rotator import RotatorController
from db.__init__ import AsyncSessionLocal

logger = logging.getLogger("tracker-worker")


class RotatorHandler:
    """Handles all rotator-related operations for satellite tracking."""

    def __init__(self, tracker):
        """
        Initialize the rotator handler.

        :param tracker: Reference to the parent SatelliteTracker instance
        """
        self.tracker = tracker

    def update_rotator_limits(self):
        """Update rotator limits from rotator_details if available."""
        if self.tracker.rotator_details:
            minaz = self.tracker.rotator_details.get("minaz")
            maxaz = self.tracker.rotator_details.get("maxaz")
            minel = self.tracker.rotator_details.get("minel")
            maxel = self.tracker.rotator_details.get("maxel")

            if minaz is not None and maxaz is not None:
                self.tracker.azimuth_limits = (minaz, maxaz)
                self.tracker.rotator_data["minaz"] = minaz
                self.tracker.rotator_data["maxaz"] = maxaz
                logger.debug(f"Updated azimuth limits to: {self.tracker.azimuth_limits}")

            if minel is not None and maxel is not None:
                self.tracker.elevation_limits = (minel, maxel)
                self.tracker.rotator_data["minel"] = minel
                self.tracker.rotator_data["maxel"] = maxel
                logger.debug(f"Updated elevation limits to: {self.tracker.elevation_limits}")

    async def connect_to_rotator(self):
        """Connect to the rotator hardware."""
        if self.tracker.current_rotator_id is not None and self.tracker.rotator_controller is None:
            try:
                async with AsyncSessionLocal() as dbsession:
                    rotator_details_reply = await crud.hardware.fetch_rotators(
                        dbsession, rotator_id=self.tracker.current_rotator_id
                    )
                    rotator_details = rotator_details_reply["data"]
                    self.tracker.rotator_details = rotator_details

                self.tracker.rotator_data.update(
                    {
                        "host": self.tracker.rotator_details["host"],
                        "port": self.tracker.rotator_details["port"],
                    }
                )

                self.tracker.rotator_controller = RotatorController(
                    host=rotator_details["host"], port=rotator_details["port"]
                )

                await self.tracker.rotator_controller.connect()

                # Update rotator limits from rotator_details
                self.update_rotator_limits()

                # Update state
                self.tracker.rotator_data.update(
                    {
                        "connected": True,
                        "tracking": False,
                        "slewing": False,
                        "outofbounds": False,
                        "stopped": True,
                    }
                )

                self.tracker.queue_out.put(
                    {
                        DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                        DictKeys.DATA: {
                            DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.ROTATOR_CONNECTED}],
                            DictKeys.ROTATOR_DATA: self.tracker.rotator_data.copy(),
                        },
                    }
                )

            except Exception as e:
                logger.error(f"Failed to connect to rotator: {e}")
                logger.exception(e)
                await self.handle_rotator_error(e)

    async def handle_rotator_error(self, error):
        """Handle rotator connection errors."""
        self.tracker.rotator_data.update(
            {
                "connected": False,
                "tracking": False,
                "slewing": False,
                "stopped": False,
                "error": True,
                "host": self.tracker.rotator_data.get("host", ""),
                "port": self.tracker.rotator_data.get("port", ""),
            }
        )

        async with AsyncSessionLocal() as dbsession:
            new_tracking_state = await crud.tracking_state.set_tracking_state(
                dbsession,
                {
                    DictKeys.NAME: TrackingStateNames.SATELLITE_TRACKING,
                    "value": {"rotator_state": "disconnected"},
                },
            )

        self.tracker.queue_out.put(
            {
                DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                DictKeys.DATA: {
                    DictKeys.EVENTS: [
                        {DictKeys.NAME: TrackingEvents.ROTATOR_ERROR, "error": str(error)}
                    ],
                    DictKeys.ROTATOR_DATA: self.tracker.rotator_data.copy(),
                    DictKeys.TRACKING_STATE: new_tracking_state[DictKeys.DATA]["value"],
                },
            }
        )

        self.tracker.rotator_controller = None

    async def handle_rotator_state_change(self, old, new):
        """Handle rotator state changes."""
        logger.info(f"Rotator state change detected from '{old}' to '{new}'")

        self.tracker.rotator_data["minelevation"] = False
        self.tracker.rotator_data["maxelevation"] = False
        self.tracker.rotator_data["minazimuth"] = False
        self.tracker.rotator_data["maxazimuth"] = False

        if new == "connected":
            await self.connect_to_rotator()
            self.tracker.rotator_data["connected"] = True
            self.tracker.rotator_data["stopped"] = True
        elif new == "tracking":
            await self.connect_to_rotator()
            self.tracker.rotator_data["tracking"] = True
            self.tracker.rotator_data["stopped"] = False
        elif new == "stopped":
            self.tracker.rotator_data["tracking"] = False
            self.tracker.rotator_data["slewing"] = False
            self.tracker.rotator_data["stopped"] = True
        elif new == "disconnected":
            await self.disconnect_rotator()
            self.tracker.rotator_data["tracking"] = False
            self.tracker.rotator_data["stopped"] = True
        elif new == "parked":
            await self.park_rotator()
        else:
            logger.error(f"Unknown tracking state: {new}")

    async def disconnect_rotator(self):
        """Disconnect from rotator."""
        if self.tracker.rotator_controller is not None:
            logger.info(
                f"Disconnecting from rotator at "
                f"{self.tracker.rotator_controller.host}:{self.tracker.rotator_controller.port}..."
            )
            try:
                await self.tracker.rotator_controller.disconnect()
                self.tracker.rotator_data["connected"] = False
                self.tracker.queue_out.put(
                    {
                        DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                        DictKeys.DATA: {
                            DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.ROTATOR_DISCONNECTED}],
                            DictKeys.ROTATOR_DATA: self.tracker.rotator_data.copy(),
                        },
                    }
                )
            except Exception as e:
                logger.error(f"Error disconnecting from rotator: {e}")
                logger.exception(e)
            finally:
                self.tracker.rotator_controller = None

    async def park_rotator(self):
        """Park the rotator."""
        self.tracker.rotator_data.update({"tracking": False, "slewing": False})

        try:
            park_reply = await self.tracker.rotator_controller.park()
            if park_reply:
                self.tracker.rotator_data["parked"] = True
                self.tracker.queue_out.put(
                    {
                        DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                        DictKeys.DATA: {
                            DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.ROTATOR_PARKED}],
                            DictKeys.ROTATOR_DATA: self.tracker.rotator_data.copy(),
                        },
                    }
                )
            else:
                raise Exception("Failed to park rotator")
        except Exception as e:
            logger.error(f"Failed to park rotator: {e}")
            logger.exception(e)

    def check_position_limits(self, skypoint, satellite_name):
        """Check if satellite position is within limits."""
        events = []
        out_of_bounds = False

        # Check azimuth limits
        if skypoint[0] < self.tracker.azimuth_limits[0]:
            logger.debug(
                f"Azimuth below minimum for satellite #{self.tracker.current_norad_id} {satellite_name}"
            )
            if self.tracker.in_tracking_state() and not self.tracker.notified.get(
                TrackingEvents.MIN_AZIMUTH_OUT_OF_BOUNDS, False
            ):
                events.append({DictKeys.NAME: TrackingEvents.MIN_AZIMUTH_OUT_OF_BOUNDS})
            self.tracker.notified[TrackingEvents.MIN_AZIMUTH_OUT_OF_BOUNDS] = True
            self.tracker.rotator_data["minazimuth"] = True
            self.tracker.rotator_data["maxazimuth"] = False
            out_of_bounds = True
        elif skypoint[0] > self.tracker.azimuth_limits[1]:
            logger.debug(
                f"Azimuth above maximum for satellite #{self.tracker.current_norad_id} {satellite_name}"
            )
            if self.tracker.in_tracking_state() and not self.tracker.notified.get(
                TrackingEvents.MAX_AZIMUTH_OUT_OF_BOUNDS, False
            ):
                events.append({DictKeys.NAME: TrackingEvents.MAX_AZIMUTH_OUT_OF_BOUNDS})
            self.tracker.notified[TrackingEvents.MAX_AZIMUTH_OUT_OF_BOUNDS] = True
            self.tracker.rotator_data["minazimuth"] = False
            self.tracker.rotator_data["maxazimuth"] = True
            out_of_bounds = True
        else:
            # Azimuth is within bounds
            self.tracker.rotator_data["minazimuth"] = False
            self.tracker.rotator_data["maxazimuth"] = False

        # Check elevation limits
        if skypoint[1] < self.tracker.elevation_limits[0]:
            logger.debug(
                f"Elevation below minimum for satellite "
                f"#{self.tracker.current_norad_id} {satellite_name}"
            )
            if self.tracker.in_tracking_state() and not self.tracker.notified.get(
                TrackingEvents.MIN_ELEVATION_OUT_OF_BOUNDS, False
            ):
                events.append({DictKeys.NAME: TrackingEvents.MIN_ELEVATION_OUT_OF_BOUNDS})
            self.tracker.notified[TrackingEvents.MIN_ELEVATION_OUT_OF_BOUNDS] = True
            self.tracker.rotator_data["minelevation"] = True
            self.tracker.rotator_data["maxelevation"] = False
            out_of_bounds = True
        elif skypoint[1] > self.tracker.elevation_limits[1]:
            logger.debug(
                f"Elevation above maximum for satellite "
                f"#{self.tracker.current_norad_id} {satellite_name}"
            )
            if self.tracker.in_tracking_state() and not self.tracker.notified.get(
                TrackingEvents.MAX_ELEVATION_OUT_OF_BOUNDS, False
            ):
                events.append({DictKeys.NAME: TrackingEvents.MAX_ELEVATION_OUT_OF_BOUNDS})
            self.tracker.notified[TrackingEvents.MAX_ELEVATION_OUT_OF_BOUNDS] = True
            self.tracker.rotator_data["minelevation"] = False
            self.tracker.rotator_data["maxelevation"] = True
            out_of_bounds = True
        else:
            # Elevation is within bounds
            self.tracker.rotator_data["minelevation"] = False
            self.tracker.rotator_data["maxelevation"] = False

        # Update outofbounds and stopped flags
        if out_of_bounds:
            self.tracker.rotator_data["outofbounds"] = True
            self.tracker.rotator_data["stopped"] = True
        else:
            self.tracker.rotator_data["outofbounds"] = False

        # Send events if any
        if events:
            self.tracker.queue_out.put(
                {
                    DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                    DictKeys.DATA: {
                        DictKeys.EVENTS: events,
                        DictKeys.DATA: {
                            "satellite_data": self.tracker.satellite_data,
                        },
                    },
                }
            )

    async def control_rotator_position(self, skypoint):
        """Control rotator position for tracking or nudging."""
        if (
            self.tracker.rotator_controller
            and self.tracker.current_rotator_state == "tracking"
            and not self.tracker.rotator_data["outofbounds"]
            and not self.tracker.rotator_data["minelevation"]
        ):

            # Check if movement is needed
            if (
                abs(skypoint[0] - self.tracker.rotator_data["az"]) > self.tracker.az_tolerance
                or abs(skypoint[1] - self.tracker.rotator_data["el"]) > self.tracker.el_tolerance
            ):
                # Clamp target position to rotator limits
                target_az = max(
                    self.tracker.azimuth_limits[0],
                    min(skypoint[0], self.tracker.azimuth_limits[1]),
                )
                target_el = max(
                    self.tracker.elevation_limits[0],
                    min(skypoint[1], self.tracker.elevation_limits[1]),
                )

                position_gen = self.tracker.rotator_controller.set_position(target_az, target_el)
                self.tracker.rotator_data["stopped"] = False

                try:
                    az, el, is_slewing = await anext(position_gen)
                    self.tracker.rotator_data["slewing"] = is_slewing
                    logger.debug(f"Current position: AZ={az}°, EL={el}°, slewing={is_slewing}")
                except StopAsyncIteration:
                    logger.info(f"Slewing to AZ={target_az}° EL={target_el}° complete")

        elif self.tracker.rotator_controller and self.tracker.current_rotator_state != "tracking":
            # Handle nudge commands when not tracking
            if self.tracker.nudge_offset["az"] != 0 or self.tracker.nudge_offset["el"] != 0:
                new_az = self.tracker.rotator_data["az"] + self.tracker.nudge_offset["az"]
                new_el = self.tracker.rotator_data["el"] + self.tracker.nudge_offset["el"]

                # Clamp nudge position to rotator limits
                new_az = max(
                    self.tracker.azimuth_limits[0],
                    min(new_az, self.tracker.azimuth_limits[1]),
                )
                new_el = max(
                    self.tracker.elevation_limits[0],
                    min(new_el, self.tracker.elevation_limits[1]),
                )

                position_gen = self.tracker.rotator_controller.set_position(new_az, new_el)

                try:
                    az, el, is_slewing = await anext(position_gen)
                    self.tracker.rotator_data["slewing"] = is_slewing
                    logger.debug(f"Current position: AZ={az}°, EL={el}°, slewing={is_slewing}")
                except StopAsyncIteration:
                    logger.info(f"Slewing to AZ={az}° EL={el}° complete")

    async def update_hardware_position(self):
        """Update current rotator position."""
        if self.tracker.rotator_controller:
            self.tracker.rotator_data["az"], self.tracker.rotator_data["el"] = (
                await self.tracker.rotator_controller.get_position()
            )
