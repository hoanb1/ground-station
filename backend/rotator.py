import time
import asyncio
import socket
from typing import Optional, Tuple, Dict, Any, Union
import logging
from arguments import arguments as args
from contextlib import asynccontextmanager
from Hamlib import Hamlib


class RotatorController:
    def __init__(
            self,
            model: int = Hamlib.ROT_MODEL_SATROTCTL,
            host: str = "127.0.0.1",
            port: int = 4533,
            verbose: bool = False,
            timeout: float = 5.0,
    ):

        # Set up logging
        device_path = f"{host}:{port}"
        self.logger = logging.getLogger(__name__)
        self.logger.setLevel(args.log_level)
        self.logger.info(f"Initializing RotatorController with model={model}, device={device_path}")

        # Initialize Hamlib
        Hamlib.rig_set_debug(Hamlib.RIG_DEBUG_NONE)
        if verbose:
            Hamlib.rig_set_debug(Hamlib.RIG_DEBUG_VERBOSE)

        # Initialize attributes
        self.host = host
        self.port = port
        self.model = model
        self.device_path = device_path
        self.verbose = verbose
        self.rotator = None
        self.connected = False
        self.timeout = timeout

    async def connect(self) -> bool:

        if self.connected:
            self.logger.warning("Already connected to rotator")
            return True

        try:
            # first we ping the rotator
            pingcheck = await self.ping()
            assert pingcheck, "Rotator did not respond to ping"

            self.logger.debug(f"Connecting to rotator at {self.device_path}")
            self.rotator = Hamlib.Rot(self.model)
            self.rotator.set_conf("rot_pathname", self.device_path)

            # Set timeout
            self.rotator.set_conf("timeout", str(int(self.timeout * 1000)))  # Convert to ms

            # Initialize the rotator (opens the connection)
            self.rotator.open()

            self.connected = True
            self.logger.info(f"Successfully connected to rotator as {self.device_path}")
            return True

        except Exception as e:
            self.logger.error(f"Error connecting to rotator: {e}")
            raise RuntimeError(f"Error connecting to rotator: {e}")

    async def async_connect(self, timeout_s: float = 5.0) -> bool:

        if self.connected:
            self.logger.warning("Already connected to rotator")
            return True

        # Run the synchronous connect method in a thread pool
        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(
                None, lambda: self.connect(timeout_s)
            )
        except Exception as e:
            self.logger.error(f"Error in async connection: {e}")
            raise

    def disconnect(self) -> bool:

        if not self.connected or self.rotator is None:
            self.logger.warning("Not connected to rotator")
            return True

        try:
            result = self.rotator.close()
            self.logger.debug(f"Close command: result={result}")

            #if result != Hamlib.RIG_OK:
            #    self.logger.warning(f"Error closing rotator connection: {self.get_error_message(result)}")
            #    return False

            self.connected = False
            self.rotator = None
            self.logger.info("Disconnected from rotator")
            return True

        except Exception as e:
            self.logger.error(f"Error disconnecting from rotator: {e}")
            return False

    async def async_disconnect(self) -> bool:

        if not self.connected or self.rotator is None:
            self.logger.warning("Not connected to rotator")
            return True

        # Run the synchronous disconnect method in a thread pool
        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(None, self.disconnect)
        except Exception as e:
            self.logger.error(f"Error in async disconnection: {e}")
            return False

    @asynccontextmanager
    async def _create_connection(self):
        """
        Async context manager for creating and cleaning up a connection.
        Uses native asyncio TCP connection handling.
        """
        reader = writer = None
        try:
            # Use asyncio's open_connection with timeout
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=self.timeout
            )
            yield reader, writer

        finally:
            # Close the connection if it was opened
            if writer is not None:
                writer.close()
                try:
                    # Wait for the writer to close, but with a timeout
                    await asyncio.wait_for(writer.wait_closed(), timeout=1.0)
                except (asyncio.TimeoutError, Exception):
                    # Ignore errors during cleanup
                    pass

    async def ping(self):
        """
        Ping the rotator controller to check if it's responsive.

        Returns:
            bool: True if a valid position can be obtained, False otherwise
        """
        try:
            # Use the async connection manager
            async with self._create_connection() as (reader, writer):
                # Send position query command

                writer.write(b"p\n")
                await writer.drain()

                # Receive response with timeout
                response_bytes = await asyncio.wait_for(
                    reader.read(1000),
                    timeout=self.timeout
                )

                response = response_bytes.decode('utf-8', errors='replace').strip()

                # Parse the response (same as before)
                if not response:
                    return False

                # Handle different response formats
                if response.startswith('RPRT'):
                    error_code = int(response.split()[1])
                    return error_code >= 0

                elif response.startswith('get_pos:'):
                    parts = response.split(':')[1].strip().split()
                    if len(parts) >= 2:
                        try:
                            float(parts[0])
                            float(parts[1])
                            return True
                        except ValueError:
                            return False
                    return False

                else:
                    parts = response.split()
                    if len(parts) >= 2:
                        try:
                            float(parts[0])
                            float(parts[1])
                            return True
                        except ValueError:
                            return False
                    return False

        except (asyncio.TimeoutError, ConnectionRefusedError, OSError) as e:
            # Handle all connection-related errors
            self.logger.exception(e)
            return False

        except Exception as e:
            # Catch all other exceptions
            self.logger.exception(e)
            return False

    async def get_position(self) -> Tuple[float, float]:

        self.check_connection()

        loop = asyncio.get_event_loop()
        az, el = await loop.run_in_executor(None, self._get_position)

        return az, el

    def _get_position(self) -> Tuple[float, float]:

        try:
            az, el = self.rotator.get_position()
            assert az is not None, "Azimuth is None"
            assert el is not None, "Elevation is None"

            self.logger.debug(f"Current position: az={az}, el={el}")
            return az, el

        except Exception as e:
            self.logger.error(f"Error getting position: {e}")
            raise RuntimeError(f"Error getting position: {e}")

    async def set_position(self, azimuth: float, elevation: Optional[float] = None, wait_complete: bool = False,
                           timeout_s: float = 30.0):

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._set_position(
                azimuth=azimuth,
                elevation=elevation,
                wait_complete=wait_complete,
                timeout_s=timeout_s
            )
        )

    def _set_position(self, azimuth: float, elevation: Optional[float] = None, wait_complete: bool = False,
                     timeout_s: float = 30.0) -> bool:

        self.check_connection()

        # Validate azimuth
        if not 0 <= azimuth <= 360:
            error_msg = f"Azimuth out of range (0-360): {azimuth}"
            self.logger.error(error_msg)
            raise ValueError(error_msg)

        # Get current elevation if not specified
        if elevation is None:
            _, el = self._get_position()
            elevation = el

        elif not 0 <= elevation <= 90:
            error_msg = f"Elevation out of range (0-90): {elevation}"
            self.logger.error(error_msg)
            raise ValueError(error_msg)

        try:
            self.logger.info(f"Setting position to az={azimuth}, el={elevation}")
            status = self.rotator.set_position(azimuth, elevation)
            self.logger.debug(f"Set position: status={status}")

            #if status != Hamlib.RIG_OK:
            #    error_msg = f"Failed to set position: {self.get_error_message(status)}"
            #    self.logger.error(error_msg)
            #    raise RuntimeError(error_msg)

            if wait_complete:
                return self._wait_for_position(azimuth, elevation, tolerance=2.0, timeout_s=timeout_s)

            return True

        except Exception as e:
            self.logger.error(f"Error setting position: {e}")
            raise RuntimeError(f"Error setting position: {e}")

    def _wait_for_position(self, target_az: float, target_el: float, tolerance: float = 2.0, timeout_s: float = 30.0,
            check_interval_s: float = 0.5) -> bool:

        self.logger.info(f"Waiting for rotator to reach az={target_az}, el={target_el}")
        start_time = time.time()

        while time.time() - start_time < timeout_s:
            try:
                current_az, current_el = self._get_position()

                # Check if we're within tolerance
                az_diff = abs((current_az - target_az + 180) % 360 - 180)
                el_diff = abs(current_el - target_el)

                if az_diff <= tolerance and el_diff <= tolerance:
                    self.logger.info(f"Target position reached: az={current_az}, el={current_el}")
                    return True

                self.logger.debug(f"Current: az={current_az}, el={current_el}, "
                                  f"Target: az={target_az}, el={target_el}, "
                                  f"Diff: az={az_diff}, el={el_diff}")

                # Sleep before checking again
                time.sleep(check_interval_s)

            except Exception as e:
                self.logger.error(f"Error while waiting for position: {e}")
                return False

        self.logger.warning(f"Timed out waiting for position after {timeout_s}s")
        return False

    async def park(self) -> bool:
        # Park the rotator
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._park)

        return True

    def _park(self) -> bool:

        self.check_connection()

        try:
            self.logger.info("Parking rotator")
            status = self.rotator.park()
            self.logger.debug(f"Park command: status={status}")

            #if status != Hamlib.RIG_OK:
            #    error_msg = f"Failed to park rotator: {self.get_error_message(status)}"
            #    self.logger.error(error_msg)
            #    raise RuntimeError(error_msg)

            return True

        except Exception as e:
            self.logger.error(f"Error parking rotator: {e}")
            raise RuntimeError(f"Error parking rotator: {e}")


    def check_connection(self) -> bool:

        if not self.connected or self.rotator is None:
            error_msg = f"Not connected to rotator (connected: {self.connected}, rotator: {self.rotator})"
            self.logger.error(error_msg)
            raise RuntimeError(error_msg)

        return True

    def __enter__(self) -> 'RotatorController':
        """Context manager entry point - connects to the rotator."""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit point - disconnects from the rotator."""
        self.disconnect()

    # New asynchronous context manager methods
    async def __aenter__(self) -> 'RotatorController':
        """Async context manager entry point - connects to the rotator asynchronously."""
        await self.async_connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit point - disconnects from the rotator asynchronously."""
        await self.async_disconnect()

    def __del__(self) -> None:
        """Destructor - ensure we disconnect when the object is garbage collected."""
        if self.connected:
            self.disconnect()

    @staticmethod
    def get_error_message(error_code: int) -> str:
        """
        Convert a Hamlib error code to a readable message.

        Args:
            error_code: Hamlib error code

        Returns:
            str: Human-readable error message
        """
        error_messages = {
            Hamlib.RIG_OK: "No error",
            Hamlib.RIG_EINVAL: "Invalid parameter",
            Hamlib.RIG_ECONF: "Invalid configuration",
            Hamlib.RIG_ENOMEM: "Memory shortage",
            Hamlib.RIG_ENIMPL: "Function not implemented",
            Hamlib.RIG_ETIMEOUT: "Communication timed out",
            Hamlib.RIG_EIO: "IO error",
            Hamlib.RIG_EINTERNAL: "Internal Hamlib error",
            Hamlib.RIG_EPROTO: "Protocol error",
            Hamlib.RIG_ERJCTED: "Command rejected",
            Hamlib.RIG_ETRUNC: "String truncated",
            Hamlib.RIG_ENAVAIL: "Function not available",
            Hamlib.RIG_ENTARGET: "Target not available",
            Hamlib.RIG_BUSERROR: "Bus error",
            Hamlib.RIG_BUSBUSY: "Bus busy",
            Hamlib.RIG_EARG: "Invalid argument",
            Hamlib.RIG_EVFO: "Invalid VFO",
            Hamlib.RIG_EDOM: "Argument out of domain",
        }

        return error_messages.get(error_code, f"Unknown error code: {error_code}")


async def main():
    """
    Example of how to use the async context manager.
    """
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    try:
        # Use the async context manager
        async with RotatorController(host='127.0.0.1', port=4533) as rotator:
            print("Rotator connected asynchronously")

            # Get current position (would need an async version in a real implementation)
            # For this example, we'll run the blocking method in a thread pool
            az, el = await rotator.get_position()
            print(f"Current position: Azimuth = {az}°, Elevation = {el}°")

            await rotator.set_position(azimuth=0.0, elevation=70.0, wait_complete=True)

            # Get position again to confirm
            az, el = await rotator.get_position()
            print(f"New position: Azimuth = {az}°, Elevation = {el}°")

            await rotator.park()

    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    import asyncio

    # Run the async example
    asyncio.run(main())
