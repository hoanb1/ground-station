# Copyright (c) 2024 Efstratios Goudelis
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


import time
import logging
import asyncio
from typing import Optional, Tuple, Dict, Any, Union, AsyncGenerator, Generator
from arguments import arguments as args


class SDRController:
    def __init__(
            self,
            sdr_details: None,
            verbose: bool = False,
            timeout: float = 3.0,
    ):

        assert sdr_details is not None, "SDR details must be provided"
        assert isinstance(sdr_details, dict), "SDR details must be a dictionary"

        # Set up logging
        self.logger = logging.getLogger("sdr-controller")
        self.logger.setLevel(args.log_level)

        # Initialize attributes
        self.verbose = verbose
        self.connected = False
        self.timeout = timeout

        # Setup init values from SDR details
        self.sdr_details = sdr_details
        self.sdr_id = sdr_details['id']
        self.sdr_name = sdr_details['name']
        self.sdr_type = sdr_details['type']
        self.sdr_serial = sdr_details['serial']
        self.sdr_host = sdr_details['host']
        self.sdr_port = sdr_details['port']
        self.sdr_driver = sdr_details['driver']
        self.frequency_range = {'min': sdr_details['frequency_min'], 'max': sdr_details['frequency_max']}

        self.logger.info(f"Initialized SDRController for SDR with id {self.sdr_id}")

    async def connect(self) -> bool:
        """Connect to the SDR device.

        Returns:
            bool: True if connected successfully, False otherwise
        """
        if self.connected:
            self.logger.warning("Already connected to SDR")
            return True

        try:
            # TODO: Implement SDR connection logic here

            self.logger.debug("Connecting to SDR")

            # Placeholder for connection implementation

            self.connected = True
            self.logger.info("Successfully connected to SDR")
            return True

        except Exception as e:
            self.logger.error(f"Error connecting to SDR: {e}")
            raise RuntimeError(f"Error connecting to SDR: {e}")

    async def disconnect(self) -> bool:
        """Disconnect from the SDR device.

        Returns:
            bool: True if disconnected successfully
        """
        if not self.connected:
            self.logger.warning("Not connected to SDR")
            return True

        try:
            # TODO: Implement SDR disconnection logic here

            self.connected = False
            self.logger.info("Disconnected from SDR")
            return True

        except Exception as e:
            self.logger.error(f"Error disconnecting from SDR: {e}")
            return False

    async def ping(self) -> bool:
        """Check if the SDR is responsive.

        Returns:
            bool: True if SDR responds, False otherwise
        """
        try:
            # TODO: Implement ping/check logic for the SDR

            # Placeholder for ping implementation
            return True

        except Exception as e:
            # Catch all exceptions during ping
            self.logger.exception(e)
            return False

    def check_connection(self) -> bool:
        """Check if connected to the SDR.

        Returns:
            bool: True if connected

        Raises:
            RuntimeError: If not connected
        """
        if not self.connected:
            error_msg = f"Not connected to SDR (connected: {self.connected})"
            self.logger.error(error_msg)
            raise RuntimeError(error_msg)
        return True

    async def get_frequency(self) -> float:
        """Get the current frequency of the SDR.

        Returns:
            float: Current frequency in Hz
        """
        self.check_connection()

        try:
            # TODO: Implement get frequency logic for the SDR

            # Placeholder: return a dummy frequency
            return 100000000.0  # 100 MHz

        except Exception as e:
            self.logger.error(f"Error getting frequency: {e}")
            raise RuntimeError(f"Error getting frequency: {e}")

    async def set_frequency(self, target_freq: float, update_interval: float = 0.5, freq_tolerance: float = 10.0) -> AsyncGenerator[
        Tuple[float, bool], None]:
        """Set the SDR frequency and yield updates until it reaches the target.

        Args:
            target_freq: Target frequency in Hz
            update_interval: Time between updates in seconds
            freq_tolerance: Frequency tolerance in Hz

        Yields:
            Tuple[float, bool]: Current frequency and whether still tuning
        """
        self.check_connection()
        self.logger.info(f"Setting SDR frequency to {target_freq} Hz")

        try:
            # TODO: Implement set frequency logic for the SDR

            # Initial status (placeholder)
            current_freq = target_freq  # Assume immediate tuning in this stub
            freq_reached = True
            is_tuning = False

            # First yield with initial frequency
            yield current_freq, is_tuning

        except Exception as e:
            self.logger.error(f"Error setting SDR frequency: {e}")
            self.logger.exception(e)
            raise RuntimeError(f"Error setting SDR frequency: {e}")

    async def get_mode(self) -> Tuple[str, int]:
        """Get the current mode and bandwidth.

        Returns:
            Tuple[str, int]: Mode name and bandwidth in Hz
        """
        self.check_connection()

        try:
            # TODO: Implement get mode logic for the SDR

            # Placeholder: return dummy mode and bandwidth
            mode = "AM"
            bandwidth = 6000
            self.logger.debug(f"Current mode: {mode}, bandwidth: {bandwidth} Hz")
            return mode, bandwidth

        except Exception as e:
            self.logger.error(f"Error getting mode: {e}")
            raise RuntimeError(f"Error getting mode: {e}")

    async def set_mode(self, mode: str, bandwidth: int = 0) -> bool:
        """Set the SDR mode and bandwidth.

        Args:
            mode: Demodulation mode (AM, FM, etc.)
            bandwidth: Filter bandwidth in Hz

        Returns:
            bool: True if successful
        """
        self.check_connection()

        try:
            self.logger.info(f"Setting SDR mode to {mode}, bandwidth={bandwidth} Hz")

            # TODO: Implement set mode logic for the SDR

            return True

        except Exception as e:
            self.logger.error(f"Error setting SDR mode: {e}")
            self.logger.exception(e)
            raise RuntimeError(f"Error setting SDR mode: {e}")


    def __del__(self) -> None:
        """Destructor - ensure we disconnect when the object is garbage collected."""
        if hasattr(self, 'connected') and self.connected:
            # Just log a warning
            if hasattr(self, 'logger'):
                self.logger.warning("Object SDRController being destroyed while still connected to SDR")

    @staticmethod
    def get_error_message(error_code: int) -> str:
        """Map error codes to messages.

        Args:
            error_code: Error code to translate

        Returns:
            str: Human-readable error message
        """
        error_messages = {
            0: "No error",
            -1: "Invalid parameter",
            -2: "Invalid configuration",
            -3: "Memory shortage",
            -4: "Function not implemented",
            -5: "Communication timed out",
            -6: "IO error",
            -7: "Internal error",
            -8: "Protocol error",
            -9: "Command rejected",
            -10: "String truncated",
            -11: "Function not available",
            -12: "Target not available",
            -13: "Device error",
            -14: "Device busy",
            -15: "Invalid argument",
            -16: "Invalid device",
            -17: "Argument out of domain",
        }

        return error_messages.get(error_code, f"Unknown error code: {error_code}")