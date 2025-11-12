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


import asyncio
import logging
import multiprocessing
import signal

import numpy as np

from common.constants import DictKeys, QueueMessageTypes, SocketEvents
from fft.processor import fft_processor_process
from sdr.iqbroadcaster import IQBroadcaster
from workers.rtlsdrworker import rtlsdr_worker_process
from workers.sigmfplaybackworker import sigmf_playback_worker_process
from workers.soapysdrlocalworker import soapysdr_local_worker_process
from workers.soapysdrremoteworker import soapysdr_remote_worker_process
from workers.uhdworker import uhd_worker_process

# Add setproctitle import for process naming
try:
    import setproctitle

    HAS_SETPROCTITLE = True
except ImportError:
    HAS_SETPROCTITLE = False


def generate_room_name(client_id1, client_id2):
    """
    Generate a consistent room name from two client IDs.
    Sorts the IDs to ensure the same room name regardless of the order they're provided.

    Args:
        client_id1 (str): First client's socket ID
        client_id2 (str): Second client's socket ID

    Returns:
        str: A unique, consistent room name for these two clients
    """
    return "_".join(sorted([client_id1, client_id2]))


def create_named_worker_process(worker_func, process_name, *args):
    """
    Wrapper function to create a named worker process

    Args:
        worker_func: The actual worker function to run
        process_name: Name to assign to the process
        *args: Arguments to pass to the worker function
    """

    def named_worker(*args):
        # Set the process title if available
        if HAS_SETPROCTITLE:
            setproctitle.setproctitle(process_name)

        # Set the multiprocessing process name
        multiprocessing.current_process().name = process_name

        # Call the actual worker function
        worker_func(*args)

    return named_worker


class SDRProcessManager:
    """
    Manager for the SDR worker processes
    """

    def __init__(self, sio=None):
        self.logger = logging.getLogger("sdr-manager")
        self.sio = sio
        self.processes = {}  # Map of sdr_id to process information
        # Note: session_to_sdr mapping is now handled by SessionTracker singleton
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def set_sio(self, sio):
        """
        Update the Socket.IO server instance after initialization

        Args:
            sio: Socket.IO server instance
        """
        self.sio = sio

    async def get_center_frequency(self, sdr_id):
        """
        Get the current center frequency of an SDR worker process

        Args:
            sdr_id: Device identifier

        Returns:
            float: Current center frequency in Hz, or None if process not found/running
        """
        if not self.is_sdr_process_running(sdr_id):
            self.logger.warning(f"No running SDR process found for device {sdr_id}")
            return None

        process_info = self.processes[sdr_id]

        # Create a temporary queue for receiving the response
        response_queue: multiprocessing.Queue = multiprocessing.Queue()

        # Send a request to the worker process to get the center frequency
        request = {
            DictKeys.TYPE: QueueMessageTypes.GET_CENTER_FREQ,
            "response_queue": response_queue,
        }

        process_info["config_queue"].put(request)

        # Wait for the response with a timeout
        try:
            # Poll the queue for a response with a timeout
            for _ in range(50):  # Wait up to 5 seconds
                if not response_queue.empty():
                    response = response_queue.get()
                    if "center_freq" in response:
                        return response["center_freq"]
                    else:
                        self.logger.error(
                            f"Invalid response format from SDR process for device {sdr_id}"
                        )
                        return None
                await asyncio.sleep(0.1)

            self.logger.warning(
                f"Timeout waiting for center frequency from SDR process for device {sdr_id}"
            )
            return None
        except Exception as e:
            self.logger.error(
                f"Error getting center frequency from SDR process for device {sdr_id}: {str(e)}"
            )
            return None

    async def start_sdr_process(self, sdr_device, sdr_config, client_id):
        """
        Start an SDR worker process

        Args:
            sdr_device: Dictionary with device connection parameters
            sdr_config: Dictionary with configuration parameters
            client_id: Client identifier

        Returns:
            The device ID for the started process
        """

        assert self.sio is not None, (
            "Socket.IO server instance not set when setting up SDR process manager."
            " Please call set_sio() first."
        )
        assert sdr_device["type"] in [
            "rtlsdrusbv3",
            "rtlsdrtcpv3",
            "rtlsdrusbv4",
            "rtlsdrtcpv4",
            "soapysdrremote",
            "soapysdrlocal",
            "uhd",
            "sigmfplayback",
        ]
        assert sdr_device["id"]

        sdr_id = sdr_device["id"]
        connection_type = None
        hostname = None
        port = None
        driver = None
        worker_process = None
        process_name = None

        if sdr_device["type"] == "rtlsdrusbv3":
            # serial_number = sdr_device["serial"]
            connection_type = "usb"
            driver = None
            worker_process = rtlsdr_worker_process
            process_name = f"Ground Station - RTL-SDR-USB-v3-{sdr_id}"

        elif sdr_device["type"] == "rtlsdrtcpv3":
            hostname = sdr_device["host"]
            port = sdr_device["port"]
            # serial_number = 0
            connection_type = "tcp"
            driver = None
            worker_process = rtlsdr_worker_process
            process_name = f"Ground Station - RTL-SDR-TCP-v3-{sdr_id}"

        elif sdr_device["type"] == "rtlsdrusbv4":
            # serial_number = sdr_device["serial"]
            connection_type = "usb"
            driver = None
            worker_process = rtlsdr_worker_process
            process_name = f"Ground Station - RTL-SDR-USB-v4-{sdr_id}"

        elif sdr_device["type"] == "rtlsdrtcpv4":
            hostname = sdr_device["host"]
            port = sdr_device["port"]
            # serial_number = 0
            connection_type = "tcp"
            driver = None
            worker_process = rtlsdr_worker_process
            process_name = f"Ground Station - RTL-SDR-TCP-v4-{sdr_id}"

        elif sdr_device["type"] == "soapysdrremote":
            hostname = sdr_device["host"]
            port = sdr_device["port"]
            connection_type = "soapysdrremote"
            driver = sdr_device["driver"]
            # serial_number = sdr_device["serial"]
            worker_process = soapysdr_remote_worker_process
            process_name = f"Ground Station - SoapySDR-Remote-{sdr_id}"

        elif sdr_device["type"] == "soapysdrlocal":
            connection_type = "soapysdrlocal"
            driver = sdr_device["driver"]
            # serial_number = sdr_device["serial"]
            worker_process = soapysdr_local_worker_process
            process_name = f"Ground Station - SoapySDR-Local-{sdr_id}"

        elif sdr_device["type"] == "uhd":
            connection_type = "uhd"
            driver = "uhd"
            worker_process = uhd_worker_process
            process_name = f"Ground Station - UHD-Worker-{sdr_id}"

        elif sdr_device["type"] == "sigmfplayback":
            connection_type = "sigmfplayback"
            driver = "sigmfplayback"
            worker_process = sigmf_playback_worker_process
            process_name = f"Ground Station - SigMF-Playback-{sdr_id}"

        # Check if a process for this device already exists
        if sdr_id in self.processes and self.processes[sdr_id]["process"].is_alive():
            self.logger.info(
                f"SDR process for device {sdr_id} already running, adding client {client_id} to room"
            )

            # Add the client to the existing process
            self.processes[sdr_id]["clients"].add(client_id)

            self.logger.info("CLIENTS : ")
            self.logger.info(self.processes[sdr_id]["clients"])

            # Update the configuration if needed
            config = {"client_id": client_id}

            # Add optional parameters
            for param in [
                "fft_size",
                "fft_window",
                "sample_rate",
                "center_freq",
                "gain",
                "bias_t",
                "tuner_agc",
                "rtl_agc",
                "soapy_agc",
            ]:
                if param in sdr_device:
                    config[param] = sdr_config[param]

            # Send configuration to the process
            self.processes[sdr_id]["config_queue"].put(config)

            # Add this client to the room
            await self.sio.enter_room(client_id, sdr_id)

            # Note: session-to-SDR mapping is handled by SessionTracker in handlers/entities/sdr.py

            # Send a message to the UI of the specific client that streaming started
            await self.sio.emit(SocketEvents.SDR_STATUS, {"streaming": True}, room=client_id)

            return sdr_id

        else:
            # New process, create communication queues and events
            config_queue: multiprocessing.Queue = multiprocessing.Queue()
            data_queue: multiprocessing.Queue = multiprocessing.Queue()

            # Separate IQ queues for FFT and demodulation to avoid contention
            # FFT can drop frames (visual only), but demod needs moderate buffering
            # Target: ~250ms of buffering (good balance between gaps and retune lag)
            # At 15-40ms per buffer, 10 slots = 150-400ms buffering
            iq_queue_fft: multiprocessing.Queue = multiprocessing.Queue(maxsize=3)
            iq_queue_demod: multiprocessing.Queue = multiprocessing.Queue(maxsize=3)

            # Stop event for the process
            stop_event = multiprocessing.Event()

            # Prepare initial configuration
            config = {
                "sdr_id": sdr_id,
                "client_id": client_id,
                "connection_type": connection_type,
                "serial_number": sdr_config.get("serial_number", 0),
                "hostname": hostname,
                "port": port,
                "driver": driver,
                "sample_rate": sdr_config.get("sample_rate", 2.048e6),
                "center_freq": sdr_config.get("center_freq", 100e6),
                "gain": sdr_config.get("gain", "auto"),
                "fft_size": sdr_config.get("fft_size", 1024),
                "fft_window": sdr_config.get("fft_window", "hanning"),
                "bias_t": sdr_config.get("bias_t", 0),
                "tuner_agc": sdr_config.get("tuner_agc", False),
                "rtl_agc": sdr_config.get("rtl_agc", False),
                "antenna": sdr_config.get("antenna", "RX"),
                "soapy_agc": sdr_config.get("soapy_agc", False),
                "offset_freq": int(sdr_config.get("offset_freq", 0)),
                "fft_averaging": sdr_config.get("fft_averaging", 1),
                "recording_path": sdr_config.get("recording_path", ""),
                "loop_playback": sdr_config.get("loop_playback", True),
            }

            if not worker_process:
                raise Exception(f"Worker process {worker_process} for SDR id: {sdr_id} not found")

            # Create a named worker function
            named_worker = create_named_worker_process(worker_process, process_name)

            # Create and start the process with a descriptive name
            # Pass both IQ queues so SDR can broadcast to both consumers
            process = multiprocessing.Process(
                target=named_worker,
                args=(config_queue, data_queue, stop_event, iq_queue_fft, iq_queue_demod),
                name=process_name,
                daemon=True,
            )
            process.start()

            self.logger.info(
                f"Started SDR process '{process_name}' for device {sdr_id} (PID: {process.pid})"
            )

            # Create and start FFT processor process
            fft_process_name = f"Ground Station - FFT-Processor-{sdr_id}"
            fft_named_worker = create_named_worker_process(fft_processor_process, fft_process_name)
            fft_process = multiprocessing.Process(
                target=fft_named_worker,
                args=(iq_queue_fft, data_queue, stop_event, client_id),
                name=fft_process_name,
                daemon=True,
            )
            fft_process.start()

            self.logger.info(
                f"Started FFT processor '{fft_process_name}' for device {sdr_id} (PID: {fft_process.pid})"
            )

            # Create and start IQ broadcaster for demodulators
            # The broadcaster reads from iq_queue_demod and distributes to multiple demodulators
            iq_broadcaster = IQBroadcaster(iq_queue_demod, sdr_id)
            iq_broadcaster.start()

            self.logger.info(f"Started IQ broadcaster for device {sdr_id}")

            # Store process information
            self.processes[sdr_id] = {
                "process": process,
                "fft_process": fft_process,
                "config_queue": config_queue,
                "data_queue": data_queue,
                "iq_queue_fft": iq_queue_fft,
                "iq_queue_demod": iq_queue_demod,  # Separate queue for demodulation
                "iq_broadcaster": iq_broadcaster,  # Broadcaster for multiple demodulators
                "stop_event": stop_event,
                "clients": {client_id},
                "demodulators": {},  # Will store demodulator threads per session
                "recorders": {},  # Will store recorder threads per session (separate from demodulators)
                "decoders": {},  # Will store decoder threads per session (SSTV, AFSK, RTTY, etc.)
            }

            # Send initial configuration
            config_queue.put(config)

            # Add this client to the room
            await self.sio.enter_room(client_id, sdr_id)

            # Note: session-to-SDR mapping is handled by SessionTracker in handlers/entities/sdr.py

            # Start async task to monitor the data queue
            asyncio.create_task(self._monitor_data_queue(sdr_id))

            return sdr_id

    async def stop_sdr_process(self, sdr_id, client_id=None):
        """
        Stop an SDR worker process

        Args:
            sdr_id: Device identifier
            client_id: Client identifier (optional)
        """
        if sdr_id not in self.processes:
            self.logger.warning(f"No SDR process found for device {sdr_id}")
            return

        process_info = self.processes[sdr_id]

        # If client_id is provided, only remove that client
        if client_id:
            if client_id in process_info["clients"]:
                # Remove client from Socket.IO room
                process_info["clients"].remove(client_id)

                # Make a client leave a specific room
                await self.sio.leave_room(client_id, sdr_id)

                # Note: session-to-SDR mapping cleanup is handled by SessionTracker in handlers/socket.py

                # Stop any active demodulator for this client
                self.stop_demodulator(sdr_id, client_id)

                # Stop any active recorder for this client
                self.stop_recorder(sdr_id, client_id)

                # Stop any active decoder for this client
                self.stop_decoder(sdr_id, client_id)

                self.logger.info(f"Removed client {client_id} from SDR process {sdr_id}")

            # If there are still other clients, don't stop the process
            if process_info["clients"]:
                return

        # Stop the broadcaster first
        if "iq_broadcaster" in process_info:
            broadcaster = process_info["iq_broadcaster"]
            broadcaster.stop()
            broadcaster.join(timeout=2.0)
            self.logger.info(f"Stopped IQ broadcaster for device {sdr_id}")

        # Stop the process
        if process_info["process"].is_alive():
            self.logger.info(f"Stopping SDR process for device {sdr_id}")
            process_info["stop_event"].set()

            # Wait briefly for the process to terminate
            for _ in range(50):  # Wait up to 5 seconds
                if not process_info["process"].is_alive():
                    break
                await asyncio.sleep(0.1)

            # Force terminate if still running
            if process_info["process"].is_alive():
                self.logger.warning(f"Forcing termination of SDR process for device {sdr_id}")
                process_info["process"].terminate()

            # Wait briefly for termination
            for _ in range(10):  # Wait up to 1 second
                if not process_info["process"].is_alive():
                    break
                await asyncio.sleep(0.1)

            # If still alive, send SIGKILL
            if process_info["process"].is_alive():
                self.logger.warning(
                    f"Process {sdr_id} still alive after terminate, sending SIGKILL"
                )
                process_info["process"].kill()

        # Clean up
        if sdr_id in self.processes:
            del self.processes[sdr_id]

        self.logger.info(f"SDR process for device {sdr_id} stopped")

    async def update_configuration(self, sdr_id, config):
        """
        Update the configuration of an SDR worker process

        Args:
            sdr_id: Device identifier
            config: Dictionary with configuration parameters
        """
        if sdr_id not in self.processes:
            self.logger.warning(f"No SDR process found for SDR device {sdr_id}")
            return

        process_info = self.processes[sdr_id]

        # Check if sample rate or center frequency is changing
        old_config = process_info.get("config", {})
        old_sample_rate = old_config.get("sample_rate")
        new_sample_rate = config.get("sample_rate")
        old_center_freq = old_config.get("center_freq")
        new_center_freq = config.get("center_freq")

        # If sample rate OR center frequency changed, flush all queues
        if (old_sample_rate is not None and new_sample_rate != old_sample_rate) or (
            old_center_freq is not None and new_center_freq != old_center_freq
        ):
            # Log appropriate message based on what changed
            if old_sample_rate is not None and new_sample_rate != old_sample_rate:
                self.logger.info(
                    f"Sample rate changing from {old_sample_rate/1e6:.2f} MHz to {new_sample_rate/1e6:.2f} MHz, "
                    f"flushing all queues"
                )
            if old_center_freq is not None and new_center_freq != old_center_freq:
                self.logger.info(
                    f"Center frequency changing from {old_center_freq/1e6:.3f} MHz to {new_center_freq/1e6:.3f} MHz, "
                    f"flushing all queues"
                )
            # Flush demodulator queues
            self.flush_all_demodulator_queues(sdr_id)

            # Flush FFT input queue (from SDR worker to FFT processor)
            iq_queue_fft = process_info.get("iq_queue_fft")
            if iq_queue_fft:
                flushed_count = 0
                while not iq_queue_fft.empty():
                    try:
                        iq_queue_fft.get_nowait()
                        flushed_count += 1
                    except Exception:
                        break
                if flushed_count > 0:
                    self.logger.info(f"Flushed {flushed_count} items from FFT input queue")

                # Send reset command to FFT processor to clear its internal averager
                try:
                    iq_queue_fft.put_nowait(
                        {
                            "samples": np.array([], dtype=np.complex64),
                            "center_freq": 0,
                            "sample_rate": new_sample_rate,
                            "timestamp": 0,
                            "config": {"reset_averager": True},
                        }
                    )
                    self.logger.info("Sent reset command to FFT processor")
                except Exception:
                    pass

            # Flush data_queue (FFT output to UI) - CRITICAL for fast UI sync!
            # At high sample rates (4-8 MHz), this queue accumulates hundreds of stale FFT messages
            data_queue = process_info.get("data_queue")
            if data_queue:
                flushed_count = 0
                while not data_queue.empty():
                    try:
                        data_queue.get_nowait()
                        flushed_count += 1
                    except Exception:
                        break
                if flushed_count > 0:
                    self.logger.info(f"Flushed {flushed_count} stale FFT messages from data_queue")

        # Send configuration to the process
        process_info["config_queue"].put(config)

        # Store the new config for future comparisons
        process_info["config"] = config

        self.logger.info(f"Sent configuration update to SDR process for device {sdr_id}")

    def is_sdr_process_running(self, sdr_id):
        """
        Check if an SDR process exists and is running

        Args:
            sdr_id: Device identifier

        Returns:
            bool: True if the process exists and is running, False otherwise
        """
        return sdr_id in self.processes and self.processes[sdr_id]["process"].is_alive()

    def _signal_handler(self, signum, frame):
        """
        Handle system signals for graceful shutdown

        Args:
            signum: Signal number
            frame: Current stack frame
        """
        self.logger.info(f"Received signal {signum}, shutting down all SDR processes...")
        for sdr_id in list(self.processes.keys()):
            asyncio.create_task(self.stop_sdr_process(sdr_id))

    async def _monitor_data_queue(self, sdr_id):
        """
        Monitor the data queue for a specific device

        Args:
            sdr_id: Device identifier
        """
        if sdr_id not in self.processes:
            return

        process_info = self.processes[sdr_id]
        data_queue = process_info["data_queue"]

        self.logger.info(f"Started monitoring data queue for device {sdr_id}")

        try:
            while sdr_id in self.processes and process_info["process"].is_alive():
                # Check if data is available
                if not data_queue.empty():
                    try:
                        # Get data from the queue
                        data = data_queue.get()

                        # Process data based on type
                        data_type = data.get(DictKeys.TYPE)
                        client_id = data.get(DictKeys.CLIENT_ID)

                        if data_type == QueueMessageTypes.FFT_DATA:
                            # Send FFT data to all clients connected to this SDR
                            await self.sio.emit(
                                SocketEvents.SDR_FFT_DATA, data[DictKeys.DATA], room=sdr_id
                            )

                        elif data_type == QueueMessageTypes.STREAMING_START:
                            # Send streaming status to all clients connected to this SDR
                            await self.sio.emit(
                                SocketEvents.SDR_STATUS, {"streaming": True}, room=sdr_id
                            )

                        elif data_type == QueueMessageTypes.CONFIG_ERROR:
                            # Send config error to all clients connected to this SDR
                            await self.sio.emit(
                                SocketEvents.SDR_CONFIG_ERROR,
                                {DictKeys.MESSAGE: f"SDR error: {data[DictKeys.MESSAGE]}"},
                                room=sdr_id,
                            )
                            self.logger.error(
                                f"Config error from SDR process: {data[DictKeys.MESSAGE]}"
                            )

                        elif data_type == QueueMessageTypes.ERROR:
                            # Send error to all clients connected to this SDR
                            await self.sio.emit(
                                SocketEvents.SDR_ERROR,
                                {DictKeys.MESSAGE: f"SDR error: {data[DictKeys.MESSAGE]}"},
                                room=sdr_id,
                            )
                            self.logger.error(f"Error from SDR process: {data[DictKeys.MESSAGE]}")

                        elif data_type == QueueMessageTypes.TERMINATED:
                            # Process has terminated
                            self.logger.info(f"SDR process for device {sdr_id} has terminated")

                            # Notify all clients
                            for client_id in process_info["clients"]:
                                await self.sio.emit(
                                    SocketEvents.SDR_STATUS, {"streaming": False}, room=sdr_id
                                )

                            # Remove process info
                            if sdr_id in self.processes:
                                del self.processes[sdr_id]

                            # Exit the loop
                            break

                        elif data_type in [
                            "decoder-status",
                            "decoder-progress",
                            "decoder-output",
                            "decoder-error",
                        ]:
                            # Decoder messages (SSTV, AFSK, RTTY, PSK31, etc.)
                            # Send to specific session only
                            session_id = data.get("session_id")
                            if session_id:
                                await self.sio.emit(
                                    SocketEvents.DECODER_DATA, data, room=session_id
                                )
                            else:
                                self.logger.warning(
                                    f"Decoder message missing session_id: {data_type}"
                                )

                    except Exception as e:
                        self.logger.error(f"Error processing data from SDR process: {str(e)}")
                        self.logger.exception(e)
                else:
                    # Short sleep to avoid CPU hogging
                    await asyncio.sleep(0.05)

        except Exception as e:
            self.logger.error(f"Error monitoring data queue for device {sdr_id}: {str(e)}")

        finally:
            self.logger.info(f"Stopped monitoring data queue for device {sdr_id}")

            # Make sure the process is cleaned up
            if sdr_id in self.processes:
                await self.stop_sdr_process(sdr_id)

    def _start_iq_consumer(
        self,
        sdr_id,
        session_id,
        consumer_class,
        audio_queue,
        storage_key,
        subscription_prefix,
        **kwargs,
    ):
        """
        Internal method to start an IQ consumer (demodulator or recorder).

        Args:
            sdr_id: Device identifier
            session_id: Session identifier (client session ID)
            consumer_class: The consumer class to instantiate
            audio_queue: Queue where audio will be placed (None for recorders)
            storage_key: "demodulators" or "recorders"
            subscription_prefix: "demod" or "recorder"
            **kwargs: Additional arguments to pass to the consumer constructor

        Returns:
            bool: True if started successfully, False otherwise
        """
        if sdr_id not in self.processes:
            self.logger.warning(f"No SDR process found for device {sdr_id}")
            return False

        process_info = self.processes[sdr_id]

        # Check if consumer already exists for this session
        if session_id in process_info.get(storage_key, {}):
            existing_entry = process_info[storage_key][session_id]
            existing = (
                existing_entry.get("instance")
                if isinstance(existing_entry, dict)
                else existing_entry
            )
            # If same type, just return success (already running)
            if isinstance(existing, consumer_class):
                self.logger.debug(
                    f"{consumer_class.__name__} already running for session {session_id}"
                )
                return True
            else:
                # Different type, stop the old one first
                self.logger.info(
                    f"Switching from {type(existing).__name__} to {consumer_class.__name__} for session {session_id}"
                )
                # Stop using the appropriate method based on storage key
                if storage_key == "recorders":
                    self.stop_recorder(sdr_id, session_id)
                else:
                    self.stop_demodulator(sdr_id, session_id)

        try:
            # Get the IQ broadcaster from the process info
            broadcaster = process_info.get("iq_broadcaster")
            if not broadcaster:
                self.logger.error(f"No IQ broadcaster found for device {sdr_id}")
                return False

            # Create a unique subscription key to prevent sharing queues
            subscription_key = f"{subscription_prefix}:{session_id}"

            # Subscribe to the broadcaster to get a dedicated queue
            subscriber_queue = broadcaster.subscribe(subscription_key, maxsize=3)

            # Create and start the consumer with the subscriber queue
            consumer = consumer_class(subscriber_queue, audio_queue, session_id, **kwargs)
            consumer.start()

            # Store reference along with subscription key for cleanup
            if storage_key not in process_info:
                process_info[storage_key] = {}
            process_info[storage_key][session_id] = {
                "instance": consumer,
                "subscription_key": subscription_key,
            }

            self.logger.info(
                f"Started {consumer_class.__name__} for session {session_id} on device {sdr_id}"
            )
            return True

        except Exception as e:
            self.logger.error(f"Error starting {consumer_class.__name__}: {str(e)}")
            self.logger.exception(e)
            return False

    def start_demodulator(self, sdr_id, session_id, demodulator_class, audio_queue, **kwargs):
        """
        Start a demodulator thread for a specific session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier (client session ID)
            demodulator_class: The demodulator class to instantiate (e.g., FMDemodulator, AMDemodulator, SSBDemodulator)
            audio_queue: Queue where demodulated audio will be placed
            **kwargs: Additional arguments to pass to the demodulator constructor

        Returns:
            bool: True if started successfully, False otherwise
        """
        return self._start_iq_consumer(
            sdr_id, session_id, demodulator_class, audio_queue, "demodulators", "demod", **kwargs
        )

    def start_recorder(self, sdr_id, session_id, recorder_class, **kwargs):
        """
        Start a recorder thread for a specific session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier (client session ID)
            recorder_class: The recorder class to instantiate (e.g., IQRecorder)
            **kwargs: Additional arguments to pass to the recorder constructor (e.g., recording_path)

        Returns:
            bool: True if started successfully, False otherwise
        """
        return self._start_iq_consumer(
            sdr_id, session_id, recorder_class, None, "recorders", "recorder", **kwargs
        )

    def stop_demodulator(self, sdr_id, session_id):
        """
        Stop a demodulator thread for a specific session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        if sdr_id not in self.processes:
            return False

        process_info = self.processes[sdr_id]
        demodulators = process_info.get("demodulators", {})

        if session_id not in demodulators:
            return False

        try:
            demod_entry = demodulators[session_id]
            # Handle both old format (direct instance) and new format (dict with instance + key)
            if isinstance(demod_entry, dict):
                demodulator = demod_entry["instance"]
                subscription_key = demod_entry["subscription_key"]
            else:
                demodulator = demod_entry
                subscription_key = session_id  # Fallback for old format

            demod_name = type(demodulator).__name__
            demodulator.stop()
            demodulator.join(timeout=2.0)  # Wait up to 2 seconds

            # Unsubscribe from the broadcaster using the correct subscription key
            broadcaster = process_info.get("iq_broadcaster")
            if broadcaster:
                broadcaster.unsubscribe(subscription_key)

            del demodulators[session_id]
            self.logger.info(f"Stopped {demod_name} for session {session_id}")
            return True

        except Exception as e:
            self.logger.error(f"Error stopping demodulator: {str(e)}")
            return False

    def stop_recorder(self, sdr_id, session_id):
        """
        Stop a recorder thread for a specific session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        if sdr_id not in self.processes:
            return False

        process_info = self.processes[sdr_id]
        recorders = process_info.get("recorders", {})

        if session_id not in recorders:
            return False

        try:
            recorder_entry = recorders[session_id]
            # Handle both old format (direct instance) and new format (dict with instance + key)
            if isinstance(recorder_entry, dict):
                recorder = recorder_entry["instance"]
                subscription_key = recorder_entry["subscription_key"]
            else:
                recorder = recorder_entry
                subscription_key = session_id  # Fallback for old format

            recorder_name = type(recorder).__name__
            recorder.stop()
            recorder.join(timeout=2.0)  # Wait up to 2 seconds

            # Unsubscribe from the broadcaster using the correct subscription key
            broadcaster = process_info.get("iq_broadcaster")
            if broadcaster:
                broadcaster.unsubscribe(subscription_key)

            del recorders[session_id]
            self.logger.info(f"Stopped {recorder_name} for session {session_id}")
            return True

        except Exception as e:
            self.logger.error(f"Error stopping recorder: {str(e)}")
            return False

    def get_active_demodulator(self, sdr_id, session_id):
        """
        Get the active demodulator for a session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            Demodulator instance or None if not found
        """
        if sdr_id not in self.processes:
            return None

        process_info = self.processes[sdr_id]
        demodulators = process_info.get("demodulators", {})
        demod_entry = demodulators.get(session_id)

        if demod_entry is None:
            return None

        # Handle both old format (direct instance) and new format (dict with instance)
        if isinstance(demod_entry, dict):
            return demod_entry.get("instance")
        return demod_entry

    def get_active_recorder(self, sdr_id, session_id):
        """
        Get the active recorder for a session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            Recorder instance or None if not found
        """
        if sdr_id not in self.processes:
            return None

        process_info = self.processes[sdr_id]
        recorders = process_info.get("recorders", {})
        recorder_entry = recorders.get(session_id)

        if recorder_entry is None:
            return None

        # Handle both old format (direct instance) and new format (dict with instance)
        if isinstance(recorder_entry, dict):
            return recorder_entry.get("instance")
        return recorder_entry

    def start_decoder(self, sdr_id, session_id, decoder_class, data_queue, **kwargs):
        """
        Start a decoder thread for a specific session.

        Decoders consume audio from a demodulator and produce decoded data
        (e.g., SSTV images, AFSK packets, RTTY text).

        This method automatically creates an internal FM demodulator specifically
        for the decoder if one doesn't already exist for this session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier (client session ID)
            decoder_class: The decoder class to instantiate (e.g., SSTVDecoder, AFSKDecoder)
            data_queue: Queue where decoded data will be placed (same as SDR data_queue)
            **kwargs: Additional arguments to pass to the decoder constructor

        Returns:
            bool: True if started successfully, False otherwise
        """
        if sdr_id not in self.processes:
            self.logger.warning(f"No SDR process found for device {sdr_id}")
            return False

        process_info = self.processes[sdr_id]

        # Check if decoder already exists for this session
        if session_id in process_info.get("decoders", {}):
            existing_entry = process_info["decoders"][session_id]
            existing = (
                existing_entry.get("instance")
                if isinstance(existing_entry, dict)
                else existing_entry
            )
            # If same type, just return success (already running)
            if isinstance(existing, decoder_class):
                self.logger.debug(
                    f"{decoder_class.__name__} already running for session {session_id}"
                )
                return True
            else:
                # Different type, stop the old one first
                self.logger.info(
                    f"Switching from {type(existing).__name__} to {decoder_class.__name__} for session {session_id}"
                )
                self.stop_decoder(sdr_id, session_id)

        try:
            # Check if there's an active demodulator for this session
            # If not, or if it's not in internal mode, create an internal FM demodulator specifically for the decoder
            demod_entry = process_info.get("demodulators", {}).get(session_id)
            internal_demod_created = False

            # Check if we need to create/recreate the internal FM demodulator
            need_internal_demod = False
            if not demod_entry:
                need_internal_demod = True
                self.logger.info(
                    f"No active demodulator found for session {session_id}. "
                    f"Creating internal FM demodulator for decoder."
                )
            else:
                # Check if existing demodulator is in internal mode
                demodulator = (
                    demod_entry.get("instance") if isinstance(demod_entry, dict) else demod_entry
                )
                if not getattr(demodulator, "internal_mode", False):
                    need_internal_demod = True
                    self.logger.info(
                        f"Existing demodulator for session {session_id} is not in internal mode. "
                        f"Stopping it and creating internal FM demodulator for decoder."
                    )
                    # Stop the existing non-internal demodulator
                    self.stop_demodulator(sdr_id, session_id)

            if need_internal_demod:
                # Import FMDemodulator here to avoid circular imports
                from demodulators.fmdemodulator import FMDemodulator

                # Create internal audio queue for the FM demodulator
                internal_audio_queue: multiprocessing.Queue = multiprocessing.Queue(maxsize=10)

                # Get VFO center frequency from kwargs if provided
                vfo_center_freq = kwargs.get("vfo_center_freq", None)

                # Start internal FM demodulator with internal_mode enabled
                success = self.start_demodulator(
                    sdr_id=sdr_id,
                    session_id=session_id,
                    demodulator_class=FMDemodulator,
                    audio_queue=internal_audio_queue,
                    internal_mode=True,  # Enable internal mode to bypass VFO checks
                    center_freq=vfo_center_freq,  # Pass VFO frequency
                    bandwidth=12500,  # Default bandwidth for SSTV
                )

                if not success:
                    self.logger.error(
                        f"Failed to start internal FM demodulator for session {session_id}"
                    )
                    return False

                internal_demod_created = True
                demod_entry = process_info.get("demodulators", {}).get(session_id)

            # Get the demodulator's audio queue
            if demod_entry is None:
                self.logger.error(f"No demodulator entry found for session {session_id}")
                return False
            demodulator = (
                demod_entry.get("instance") if isinstance(demod_entry, dict) else demod_entry
            )
            if demodulator is None:
                self.logger.error(f"No demodulator instance found for session {session_id}")
                return False
            audio_queue = demodulator.audio_queue

            # Filter out internal parameters before passing to decoder
            decoder_kwargs = {k: v for k, v in kwargs.items() if k != "vfo_center_freq"}

            # Create and start the decoder with the audio queue
            decoder = decoder_class(audio_queue, data_queue, session_id, **decoder_kwargs)
            decoder.start()

            # Store reference
            if "decoders" not in process_info:
                process_info["decoders"] = {}
            process_info["decoders"][session_id] = {
                "instance": decoder,
                "decoder_type": decoder_class.__name__,
                "internal_demod": internal_demod_created,  # Track if we created the demod
            }

            self.logger.info(
                f"Started {decoder_class.__name__} for session {session_id} on device {sdr_id}"
            )
            return True

        except Exception as e:
            self.logger.error(f"Error starting {decoder_class.__name__}: {str(e)}")
            self.logger.exception(e)
            return False

    def stop_decoder(self, sdr_id, session_id):
        """
        Stop a decoder thread for a specific session.

        If an internal FM demodulator was created for this decoder,
        it will also be stopped automatically.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        if sdr_id not in self.processes:
            return False

        process_info = self.processes[sdr_id]
        decoders = process_info.get("decoders", {})

        if session_id not in decoders:
            return False

        try:
            decoder_entry = decoders[session_id]
            # Handle both old format (direct instance) and new format (dict with instance)
            if isinstance(decoder_entry, dict):
                decoder = decoder_entry["instance"]
                internal_demod = decoder_entry.get("internal_demod", False)
            else:
                decoder = decoder_entry
                internal_demod = False

            decoder_name = type(decoder).__name__
            decoder.stop()
            decoder.join(timeout=2.0)  # Wait up to 2 seconds

            # If we created an internal demodulator for this decoder, stop it too
            if internal_demod:
                self.logger.info(f"Stopping internal FM demodulator for session {session_id}")
                self.stop_demodulator(sdr_id, session_id)

            del decoders[session_id]
            self.logger.info(f"Stopped {decoder_name} for session {session_id}")
            return True

        except Exception as e:
            self.logger.error(f"Error stopping decoder: {str(e)}")
            return False

    def get_active_decoder(self, sdr_id, session_id):
        """
        Get the active decoder for a session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            Decoder instance or None if not found
        """
        if sdr_id not in self.processes:
            return None

        process_info = self.processes[sdr_id]
        decoders = process_info.get("decoders", {})
        decoder_entry = decoders.get(session_id)

        if decoder_entry is None:
            return None

        # Handle both old format (direct instance) and new format (dict with instance)
        if isinstance(decoder_entry, dict):
            return decoder_entry.get("instance")
        return decoder_entry

    def flush_all_demodulator_queues(self, sdr_id):
        """
        Flush all demodulator IQ queues for an SDR.

        This should be called when sample rate changes, since all buffered
        data at the old sample rate becomes invalid and would cause
        processing errors.

        Args:
            sdr_id: Device identifier
        """
        if sdr_id not in self.processes:
            return

        process_info = self.processes[sdr_id]
        broadcaster = process_info.get("iq_broadcaster")

        if broadcaster:
            broadcaster.flush_all_queues()
            self.logger.info(
                f"Flushed all demodulator queues for SDR {sdr_id} due to sample rate change"
            )


# Set up the SDR process manager
sdr_process_manager = SDRProcessManager()
