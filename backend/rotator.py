import time
import asyncio
import socket
from typing import Optional, Tuple, Dict, Any, Union, AsyncGenerator
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
        self.logger = logging.getLogger("rotator-control")
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

    async def set_position(self, target_az: float, target_el: float, update_interval: float = 2) -> AsyncGenerator[
        Tuple[float, float, bool], None]:
        """
        Generator function that sets the rotator position and yields progress updates.

        Args:
            target_az: Target azimuth in degrees
            target_el: Target elevation in degrees
            update_interval: How often to yield position updates in seconds

        Yields:
            Tuple[float, float, bool]: Current (azimuth, elevation, is_complete)
            - When is_complete is True, the rotator has reached the target position
        """
        self.check_connection()

        # Start the position set in a separate thread
        loop = asyncio.get_event_loop()
        self.logger.info(f"Slewing rotator to position: az={target_az}, el={target_el}")
        set_task = loop.run_in_executor(None, self._set_position_start, target_az, target_el)

        # Get the starting position
        current_az, current_el = await self.get_position()

        # Define what "reached target" means (within 1 degree tolerance)
        def is_at_target(az, el):
            az_diff = min(abs(az - target_az), 360 - abs(az - target_az))
            el_diff = abs(el - target_el)
            return az_diff < 1.0 and el_diff < 1.0

        # Keep yielding the position until we're done
        complete = False
        while not complete:
            # Yield the current position and status
            yield current_az, current_el, complete

            # Wait a bit before checking again
            await asyncio.sleep(update_interval)

            # Get updated position
            current_az, current_el = await self.get_position()

            # Check if we've reached the target
            complete = is_at_target(current_az, current_el)

        # Wait for the set_position task to complete
        await set_task

        # Final yield with completed status
        yield current_az, current_el, True


    def _set_position_start(self, az: float, el: float) -> bool:
        """
        Starts the rotator slewing to the specified position.
        This is meant to be run in a separate thread.

        Args:
            az: Target azimuth in degrees
            el: Target elevation in degrees

        Returns:
            bool: True if command was sent successfully
        """
        try:
            self.logger.info(f"Setting rotator position to az={az}, el={el}")
            status = self.rotator.set_position(az, el)
            self.logger.debug(f"Set position command: status={status}")

            #if status != Hamlib.RIG_OK:
            #    error_msg = f"Failed to set rotator position: {self.get_error_message(status)}"
            #    self.logger.error(error_msg)
            #    raise RuntimeError(error_msg)

            return True

        except Exception as e:
            self.logger.error(f"Error setting rotator position: {e}")
            self.logger.exception(e)
            raise RuntimeError(f"Error setting rotator position: {e}")



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

            async for current_az, current_el, is_complete in rotator.set_position(180, 45):
                print(f"Position: AZ={current_az:.1f}° EL={current_el:.1f}°")
                if is_complete:
                    print("Target position reached!")

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
