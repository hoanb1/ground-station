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
Rig handler for satellite tracking.
Handles all rig-related operations including connection, frequency control, and doppler calculation.
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
from controllers.rig import RigController
from controllers.sdr import SDRController
from db.__init__ import AsyncSessionLocal
from tracking.doppler import calculate_doppler_shift

logger = logging.getLogger("tracker-worker")


class RigHandler:
    """Handles all rig-related operations for satellite tracking."""

    def __init__(self, tracker):
        """
        Initialize the rig handler.

        :param tracker: Reference to the parent SatelliteTracker instance
        """
        self.tracker = tracker

    async def connect_to_rig(self):
        """Connect to rig hardware (radio or SDR)."""
        if self.tracker.current_rig_id is not None and self.tracker.rig_controller is None:
            try:
                async with AsyncSessionLocal() as dbsession:
                    # Try the hardware rig first
                    rig_details_reply = await crud.hardware.fetch_rigs(
                        dbsession, rig_id=self.tracker.current_rig_id
                    )

                    if rig_details_reply.get("data") is not None:
                        rig_type = "radio"
                    else:
                        # Try SDR
                        rig_details_reply = await crud.hardware.fetch_sdr(
                            dbsession, sdr_id=self.tracker.current_rig_id
                        )
                        if not rig_details_reply.get("data", None):
                            raise Exception(
                                f"No rig or SDR found with ID: {self.tracker.current_rig_id}"
                            )
                        rig_type = "sdr"

                    rig_details = rig_details_reply["data"]
                    self.tracker.rig_details = rig_details

                # Create appropriate controller
                if rig_type == "sdr":
                    self.tracker.rig_controller = SDRController(sdr_details=rig_details)
                else:
                    self.tracker.rig_controller = RigController(
                        host=rig_details["host"], port=rig_details["port"]
                    )

                self.tracker.rig_details.update(
                    {
                        "host": self.tracker.rig_details["host"],
                        "port": self.tracker.rig_details.get("port"),
                    },
                )

                await self.tracker.rig_controller.connect()

                # Update state
                self.tracker.rig_data.update(
                    {
                        "connected": True,
                        "tracking": False,
                        "tuning": False,
                        "device_type": rig_details.get("type", "hardware"),
                        "host": self.tracker.rig_details.get("host", ""),
                        "port": self.tracker.rig_details.get("port", ""),
                    }
                )

                self.tracker.queue_out.put(
                    {
                        DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                        DictKeys.DATA: {
                            DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.RIG_CONNECTED}],
                            DictKeys.RIG_DATA: self.tracker.rig_data.copy(),
                        },
                    }
                )

            except Exception as e:
                logger.error(f"Failed to connect to rig: {e}")
                logger.exception(e)
                await self.handle_rig_error(e)

    async def handle_rig_error(self, error):
        """Handle rig connection errors."""
        self.tracker.rig_data.update(
            {
                "connected": False,
                "tracking": False,
                "tuning": False,
                "error": True,
                "host": self.tracker.rig_data.get("host", ""),
                "port": self.tracker.rig_data.get("port", ""),
            }
        )

        async with AsyncSessionLocal() as dbsession:
            new_tracking_state = await crud.tracking_state.set_tracking_state(
                dbsession,
                {
                    DictKeys.NAME: TrackingStateNames.SATELLITE_TRACKING,
                    "value": {"rig_state": "disconnected"},
                },
            )

        self.tracker.queue_out.put(
            {
                DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                DictKeys.DATA: {
                    DictKeys.EVENTS: [
                        {DictKeys.NAME: TrackingEvents.RIG_ERROR, "error": str(error)}
                    ],
                    DictKeys.RIG_DATA: self.tracker.rig_data.copy(),
                    DictKeys.TRACKING_STATE: new_tracking_state[DictKeys.DATA]["value"],
                },
            }
        )

        self.tracker.rig_controller = None

    async def handle_rig_state_change(self, old, new):
        """Handle rig state changes."""
        logger.info(f"Rig state change detected from '{old}' to '{new}'")

        if new == "connected":
            await self.connect_to_rig()
            self.tracker.rig_data["connected"] = True

        elif new == "disconnected":
            await self.disconnect_rig()
            self.tracker.rig_data["connected"] = False
            self.tracker.rig_data["tracking"] = False
            self.tracker.rig_data["stopped"] = True

        elif new == "tracking":
            await self.connect_to_rig()
            self.tracker.rig_data["tracking"] = True
            self.tracker.rig_data["stopped"] = False

        elif new == "stopped":
            self.tracker.rig_data["tracking"] = False
            self.tracker.rig_data["tuning"] = False
            self.tracker.rig_data["stopped"] = True

    async def disconnect_rig(self):
        """Disconnect from rig."""
        if self.tracker.rig_controller is not None:
            logger.info("Disconnecting from rig...")
            try:
                await self.tracker.rig_controller.disconnect()
                self.tracker.rig_data.update(
                    {"connected": False, "tracking": False, "tuning": False}
                )
                self.tracker.queue_out.put(
                    {
                        DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                        DictKeys.DATA: {
                            DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.RIG_DISCONNECTED}],
                            DictKeys.RIG_DATA: self.tracker.rig_data.copy(),
                        },
                    }
                )
            except Exception as e:
                logger.error(f"Error disconnecting from rig: {e}")
                logger.exception(e)
            finally:
                self.tracker.rig_controller = None

    async def handle_transmitter_tracking(self, satellite_tles, location):
        """Handle transmitter selection and doppler calculation."""
        if self.tracker.current_transmitter_id != "none":
            async with AsyncSessionLocal() as dbsession:
                current_transmitter_reply = await crud.transmitters.fetch_transmitter(
                    dbsession, transmitter_id=self.tracker.current_transmitter_id
                )
                current_transmitter = current_transmitter_reply.get("data", {})

            if current_transmitter:
                self.tracker.rig_data["original_freq"] = current_transmitter.get("downlink_low", 0)

                # Calculate doppler shift
                self.tracker.rig_data["observed_freq"], self.tracker.rig_data["doppler_shift"] = (
                    calculate_doppler_shift(
                        satellite_tles[0],
                        satellite_tles[1],
                        location["lat"],
                        location["lon"],
                        0,
                        current_transmitter.get("downlink_low", 0),
                    )
                )

                if self.tracker.current_rig_state == "tracking":
                    self.tracker.rig_data["tracking"] = True
                    self.tracker.rig_data["stopped"] = False

                else:
                    self.tracker.rig_data["observed_freq"] = 0
                    self.tracker.rig_data["doppler_shift"] = 0
                    self.tracker.rig_data["tracking"] = False
                    self.tracker.rig_data["stopped"] = True

            self.tracker.rig_data["transmitter_id"] = self.tracker.current_transmitter_id

        else:
            logger.debug("No satellite transmitter selected")
            self.tracker.rig_data["transmitter_id"] = self.tracker.current_transmitter_id
            self.tracker.rig_data["observed_freq"] = 0
            self.tracker.rig_data["doppler_shift"] = 0
            self.tracker.rig_data["tracking"] = False
            self.tracker.rig_data["stopped"] = True

    async def calculate_all_transmitters_doppler(self, satellite_tles, location):
        """Calculate doppler shift for all active transmitters of the current satellite."""
        if self.tracker.current_norad_id is None:
            self.tracker.rig_data["transmitters"] = []
            return

        try:
            async with AsyncSessionLocal() as dbsession:
                all_transmitters_reply = await crud.transmitters.fetch_transmitters_for_satellite(
                    dbsession, norad_id=self.tracker.current_norad_id
                )
                all_transmitters = all_transmitters_reply.get("data", [])

            # Filter only active transmitters (status == "active")
            active_transmitters = [t for t in all_transmitters if t.get("status") == "active"]

            # Calculate doppler shift for each active transmitter
            transmitters_with_doppler = []
            for transmitter in active_transmitters:
                downlink_freq = transmitter.get("downlink_low", 0)
                if downlink_freq and downlink_freq > 0:
                    observed_freq, doppler_shift = calculate_doppler_shift(
                        satellite_tles[0],
                        satellite_tles[1],
                        location["lat"],
                        location["lon"],
                        0,
                        downlink_freq,
                    )

                    transmitters_with_doppler.append(
                        {
                            "id": transmitter.get("id"),
                            "description": transmitter.get("description"),
                            "type": transmitter.get("type"),
                            "mode": transmitter.get("mode"),
                            "downlink_low": downlink_freq,
                            "downlink_high": transmitter.get("downlink_high"),
                            "observed_freq": observed_freq,
                            "doppler_shift": doppler_shift,
                        }
                    )

            self.tracker.rig_data["transmitters"] = transmitters_with_doppler
            logger.debug(
                f"Calculated doppler shift for {len(transmitters_with_doppler)} "
                f"active transmitters for satellite #{self.tracker.current_norad_id}"
            )

        except Exception as e:
            logger.error(f"Error calculating doppler for all transmitters: {e}")
            logger.exception(e)
            self.tracker.rig_data["transmitters"] = []

    async def control_rig_frequency(self):
        """Control rig frequency based on doppler calculations."""
        if self.tracker.rig_controller and self.tracker.current_rig_state == "tracking":
            # Check if this is an SDR or hardware rig
            if isinstance(self.tracker.rig_controller, SDRController):
                # SDR: Don't set center frequency - user controls that manually from UI
                # VFO frequency updates are handled in vfos/updates.py:handle_vfo_updates_for_tracking()
                logger.debug(
                    f"SDR tracking - doppler freq: {self.tracker.rig_data['observed_freq']:.0f} Hz (VFO updates handled separately)"
                )

            else:
                # Hardware rig: Use the global rig_vfo to tune specific VFO
                frequency_gen = self.tracker.rig_controller.set_frequency(
                    self.tracker.rig_data["observed_freq"], vfo=self.tracker.current_rig_vfo
                )

                try:
                    current_frequency, is_tuning = await anext(frequency_gen)
                    self.tracker.rig_data["tuning"] = is_tuning

                    logger.debug(
                        f"Hardware rig VFO {self.tracker.current_rig_vfo} frequency: {current_frequency}, tuning={is_tuning}"
                    )
                except StopAsyncIteration:
                    logger.info(
                        f"Hardware rig tuning VFO {self.tracker.current_rig_vfo} to frequency {self.tracker.rig_data['observed_freq']} complete"
                    )

    async def update_hardware_frequency(self):
        """Update current rig frequency."""
        if self.tracker.rig_controller:
            self.tracker.rig_data["frequency"] = await self.tracker.rig_controller.get_frequency()
