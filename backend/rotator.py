import time
import asyncio
import socket
from typing import Optional, Tuple, Dict, Any, Union, AsyncGenerator, Generator
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
        try:
            connected = await asyncio.to_thread(self.connect)
            return connected

        except Exception as e:
            self.logger.error(f"Error in async connection: {e}")
            raise

    async def disconnect(self) -> bool:

        if not self.connected or self.rotator is None:
            self.logger.warning("Not connected to rotator")
            return True

        try:
            result = await asyncio.to_thread(self.rotator.close)
            self.logger.debug(f"Close command: result={result}")

            # if result != Hamlib.RIG_OK:
            #    self.logger.warning(f"Error closing rotator connection: {self.get_error_message(result)}")
            #    return False

            self.connected = False
            self.rotator = None
            self.logger.info("Disconnected from rotator")
            return True

        except Exception as e:
            self.logger.error(f"Error disconnecting from rotator: {e}")
            return False

    @asynccontextmanager
    async def _create_connection(self):
        """
        An asynchronous context manager to create and manage a connection.

        This method establishes a connection to the specified host and port using
        asyncio's open_connection function, with the ability to set a timeout for
        connection attempts. Upon exiting the context, it ensures the connection is
        closed properly, handling potential exceptions during cleanup to maintain
        robustness.

        :param self: The instance of the class invoking this function.
        :yield: A tuple containing the asyncio StreamReader and StreamWriter
                objects for the established connection.
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
        Send a ping command to the device and validate the response to determine
        if the ping was successful. The method communicates using an asynchronous
        connection manager to send a position query command, read the response, and
        parse it for ensuring the expected format or values. Various error responses
        and exceptions are handled to ensure robust execution.

        :return: A boolean indicating whether the ping was successful or not
        :rtype: bool
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

        az, el = await self._get_position()

        return round(az, 3), round(el, 3)

    async def _get_position(self) -> Tuple[float, float]:
        """
        Obtains the current position of the rotator (azimuth and elevation) and logs it.

        This method queries the rotator device for its current position, ensuring both azimuth
        and elevation are not `None`. If successful, it logs the values and returns them as a tuple.
        In case of an error during the retrieval process, a runtime exception is raised after logging.

        :returns: A tuple containing the azimuth and elevation as floating-point values.
        :rtype: Tuple[float, float]

        :raises RuntimeError: If an error occurs while retrieving the position from the rotator or if
            there is an unexpected issue in accessing the data.
        """
        try:
            az, el = await asyncio.to_thread(self.rotator.get_position)
            assert az is not None, "Azimuth is None"
            assert el is not None, "Elevation is None"

            self.logger.debug(f"Current position: az={az}, el={el}")
            return az, el

        except Exception as e:
            self.logger.error(f"Error getting position: {e}")
            raise RuntimeError(f"Error getting position: {e}")

    async def park(self) -> bool:
        """
        Asynchronously parks the rotator device.

        This method calls an internal function to perform the park operation
        in a background thread. It ensures that the device is secured and
        safely parked to prevent unintended movement or usage.

        :return: Indicates whether the operation to park was successful.
        :rtype: bool
        """
        # Park the rotator
        await asyncio.to_thread(self._park)

        return True

    def _park(self) -> bool:
        """
        Attempts to park the rotator by sending a command to the rotator system and
        logging the operation status.

        This method first checks the current connection status before attempting
        to park the rotator. It logs messages to indicate the progress and status
        of the parking operation. If an error occurs during this process, the
        method will log the error details and raise a `RuntimeError` with the
        appropriate message.

        :raises RuntimeError: If any exception occurs during the parking process.
        :return: A boolean indicating whether the parking of the rotator was initiated successfully.
        :rtype: bool
        """
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
        """
        Checks the connection status of the rotator.

        This method verifies if the object is connected to the rotator and if the rotator
        instance exists. If either of these conditions is not met, it logs an error message
        and raises a RuntimeError. Otherwise, it confirms the connection by returning True.

        :return: Indicates successful connection to the rotator.
        :rtype: bool

        :raises RuntimeError: If the object is not connected or the rotator instance is None.
        """
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
        loop = asyncio.get_event_loop()
        try:
            loop.run_until_complete(self.disconnect())
        finally:
            pass

    def __del__(self) -> None:
        """Destructor - ensure we disconnect when the object is garbage collected."""
        if self.connected:
            loop = asyncio.get_event_loop()
            try:
                loop.run_until_complete(self.disconnect())
            finally:
                pass

    @staticmethod
    def get_error_message(error_code: int) -> str:
        """
        Retrieves the error message corresponding to a given error code. This static
        method takes an error code as input and returns a string describing the error
        associated with the provided code. If the error code is not recognized, a
        default message indicating the unrecognized code is returned.

        :param error_code: An integer representing the error code for which the error
            message is to be fetched.
        :type error_code: int
        :return: A string containing the error message corresponding to the provided
            error code, or a default message if the error code is not recognized.
        :rtype: str
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

    async def set_position(self, target_az: float, target_el: float, update_interval: float = 2,
                           az_tolerance: float = 1.0, el_tolerance: float = 1.0) -> AsyncGenerator[
        Tuple[float, float, bool], None]:
        """
        Set the position of the system to the target azimuth and elevation levels. This is
        an asynchronous generator method that periodically checks and updates the
        position until it reaches the specified target or remains within the given
        tolerances.

        The generator yields the current azimuth, elevation, and slewing status during
        execution. If the target is reached within the tolerances, the status will indicate
        the completion of the slewing operation.

        :param target_az: The target azimuth level to reach.
        :type target_az: float
        :param target_el: The target elevation level to reach.
        :type target_el: float
        :param update_interval: The time interval, in seconds, between status updates.
        :type update_interval: float
        :param az_tolerance: The tolerance within which the target azimuth is considered reached.
        :type az_tolerance: float
        :param el_tolerance: The tolerance within which the target elevation is considered reached.
        :type el_tolerance: float
        :yield: A tuple of the current azimuth, current elevation, and a boolean indicating
                if the system is still slewing.
        :rtype: AsyncGenerator[Tuple[float, float, bool], None]
        """
        # Start the slew operation
        await self._set_position_start(target_az, target_el)

        # Initial status
        current_az, current_el = await self._get_position()
        az_reached = abs(current_az - target_az) <= az_tolerance
        el_reached = abs(current_el - target_el) <= el_tolerance
        is_slewing = not (az_reached and el_reached)

        # First yield with initial position
        yield current_az, current_el, is_slewing

        # Keep checking position when consumer requests an update
        while is_slewing:
            # Wait for the update interval
            await asyncio.sleep(update_interval)

            # Get current position
            current_az, current_el = await self._get_position()

            # Check if we've reached the target
            az_reached = abs(current_az - target_az) <= az_tolerance
            el_reached = abs(current_el - target_el) <= el_tolerance
            is_slewing = not (az_reached and el_reached)

            # Yield the current position and slewing status
            yield current_az, current_el, is_slewing

    async def _set_position_start(self, az: float, el: float) -> bool:
        """
        Sets the start position of the rotator by defining azimuth and elevation values.

        This method attempts to configure the rotator with the given azimuth and
        elevation. Upon invocation, it logs the target values, sends a command to
        update the rotator's position, and logs the status of the operation. If an
        exception occurs during the process, an error message is logged, and a
        RuntimeError is raised.

        :param az: The azimuth angle that the rotator should be set to.
        :type az: float
        :param el: The elevation angle that the rotator should be set to.
        :type el: float
        :return: True if the rotator position is successfully set.
        :rtype: bool
        :raises RuntimeError: If the rotator encounters an error when attempting
            to set the position.

        """
        try:
            self.logger.info(f"Setting rotator position to az={az}, el={el}")
            status = await asyncio.to_thread(self.rotator.set_position, az, el)
            self.logger.debug(f"Set position command: status={status}")

            return True

        except Exception as e:
            self.logger.error(f"Error setting rotator position: {e}")
            self.logger.exception(e)
            raise RuntimeError(f"Error setting rotator position: {e}")
