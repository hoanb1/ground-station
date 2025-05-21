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


import multiprocessing
import asyncio
import logging
import signal
from workers.rtlsdrworker import rtlsdr_worker_process
from workers.soapysdrworker import soapysdr_worker_process


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


class SDRProcessManager:
    """
    Manager for the SDR worker processes
    """
    def __init__(self, sio=None):
        self.logger = logging.getLogger('sdr-process-manager')
        self.sio = sio
        self.processes = {}  # Map of sdr_id to process information
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
        response_queue = multiprocessing.Queue()

        # Send a request to the worker process to get the center frequency
        request = {
            'type': 'get_center_freq',
            'response_queue': response_queue
        }

        process_info['config_queue'].put(request)

        # Wait for the response with a timeout
        try:
            # Poll the queue for a response with a timeout
            for _ in range(50):  # Wait up to 5 seconds
                if not response_queue.empty():
                    response = response_queue.get()
                    if 'center_freq' in response:
                        return response['center_freq']
                    else:
                        self.logger.error(f"Invalid response format from SDR process for device {sdr_id}")
                        return None
                await asyncio.sleep(0.1)

            self.logger.warning(f"Timeout waiting for center frequency from SDR process for device {sdr_id}")
            return None
        except Exception as e:
            self.logger.error(f"Error getting center frequency from SDR process for device {sdr_id}: {str(e)}")
            return None

    async def start_sdr_process(self, sdr_device, sdr_config, client_id):
        """
        Start an SDR worker process

        Args:
            sdr_device: Dictionary with device connection parameters
            client_id: Client identifier

        Returns:
            The device ID for the started process
            :param client_id:
            :param sdr_device:
            :param sdr_config:
        """

        assert self.sio is not None, ("Socket.IO server instance not set when setting up SDR process manager."
                                      " Please call set_sio() first.")
        assert sdr_device['type'] in [
            'rtlsdrusbv3', 'rtlsdrtcpv3',
            'rtlsdrusbv4', 'rtlsdrtcpv4',
            'soapysdrremote', 'soapysdrlocal'
        ]
        assert sdr_device['id']

        sdr_id = sdr_device['id']
        connection_type = None
        hostname = None
        port = None
        driver = None
        worker_process = None

        if sdr_device['type'] == 'rtlsdrusbv3':
            serial_number = sdr_device['serial']
            connection_type = "usb"
            driver = None
            worker_process = rtlsdr_worker_process

        elif sdr_device['type'] == 'rtlsdrtcpv3':
            hostname = sdr_device['host']
            port = sdr_device['port']
            serial_number = 0
            connection_type = "tcp"
            driver = None
            worker_process = rtlsdr_worker_process

        elif sdr_device['type'] == 'rtlsdrusbv4':
            serial_number = sdr_device['serial']
            connection_type = "usb"
            driver = None
            worker_process = rtlsdr_worker_process

        elif sdr_device['type'] == 'rtlsdrtcpv4':
            hostname = sdr_device['host']
            port = sdr_device['port']
            serial_number = 0
            connection_type = "tcp"
            driver = None
            worker_process = rtlsdr_worker_process

        elif sdr_device['type'] == 'soapysdrremote':
            hostname = sdr_device['host']
            port = sdr_device['port']
            connection_type = "soapysdrremote"
            driver = sdr_device['driver']
            serial_number = sdr_device['serial']
            worker_process = soapysdr_worker_process

        elif sdr_device['type'] == 'soapysdrlocal':
            connection_type = "soapysdrlocal"
            driver = sdr_device['driver']
            serial_number = sdr_device['serial']
            worker_process = soapysdr_worker_process

        # Check if a process for this device already exists
        if sdr_id in self.processes and self.processes[sdr_id]['process'].is_alive():
            self.logger.info(f"SDR process for device {sdr_id} already running, adding client {client_id} to room")

            # Add the client to the existing process
            self.processes[sdr_id]['clients'].add(client_id)

            self.logger.info("CLIENTS : ")
            self.logger.info(self.processes[sdr_id]['clients'])

            # Update the configuration if needed
            config = {
                'client_id': client_id
            }

            # Add optional parameters
            for param in ['fft_size', 'fft_window', 'sample_rate', 'center_freq', 'gain',
                          'bias_t', 'tuner_agc', 'rtl_agc']:
                if param in sdr_device:
                    config[param] = sdr_config[param]

            # Send configuration to the process
            self.processes[sdr_id]['config_queue'].put(config)

            # Add this client to the room
            await self.sio.enter_room(client_id, sdr_id)

            # Send a message to the UI of the specific client that streaming started
            await self.sio.emit('sdr-status', {'streaming': True}, room=client_id)

            return sdr_id

        else:
            # New process, create communication queues and events
            config_queue = multiprocessing.Queue()
            data_queue = multiprocessing.Queue()
            stop_event = multiprocessing.Event()

            # Prepare initial configuration
            config = {
                'sdr_id': sdr_id,
                'client_id': client_id,
                'connection_type': connection_type,
                'serial_number': sdr_config.get('serial_number', 0),
                'hostname': hostname,
                'port': port,
                'driver': driver,
                'sample_rate': sdr_config.get('sample_rate', 2.048e6),
                'center_freq': sdr_config.get('center_freq', 100e6),
                'gain': sdr_config.get('gain', 'auto'),
                'fft_size': sdr_config.get('fft_size', 1024),
                'fft_window': sdr_config.get('fft_window', 'hanning'),
                'bias_t': sdr_config.get('bias_t', 0),
                'tuner_agc': sdr_config.get('tuner_agc', False),
                'rtl_agc': sdr_config.get('rtl_agc', False),
                'antenna': sdr_config.get('antenna', 'RX'),
                'gain_mode': 'automatic' if sdr_config.get('soapy_agc', True) else 'manual',
                'offset_freq': int(sdr_config.get('offset_freq', 0)),
            }

            if not worker_process:
                raise Exception(f"Worker process {worker_process} for SDR id: {sdr_id} not found")

            # Create and start the process
            process = multiprocessing.Process(
                target=worker_process,
                args=(config_queue, data_queue, stop_event),
                daemon=True
            )
            process.start()

            self.logger.info(f"Started SDR process for device {sdr_id} (PID: {process.pid})")

            # Store process information
            self.processes[sdr_id] = {
                'process': process,
                'config_queue': config_queue,
                'data_queue': data_queue,
                'stop_event': stop_event,
                'clients': {client_id}
            }

            # Send initial configuration
            config_queue.put(config)

            # Add this client to the room
            await self.sio.enter_room(client_id, sdr_id)

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
            if client_id in process_info['clients']:
                # Remove client from Socket.IO room
                process_info['clients'].remove(client_id)

                # Make a client leave a specific room
                await self.sio.leave_room(client_id, sdr_id)

                self.logger.info(f"Removed client {client_id} from SDR process {sdr_id}")

            # If there are still other clients, don't stop the process
            if process_info['clients']:
                return

        # Stop the process
        if process_info['process'].is_alive():
            self.logger.info(f"Stopping SDR process for device {sdr_id}")
            process_info['stop_event'].set()

            # Wait briefly for the process to terminate
            for _ in range(50):  # Wait up to 5 seconds
                if not process_info['process'].is_alive():
                    break
                await asyncio.sleep(0.1)

            # Force terminate if still running
            if process_info['process'].is_alive():
                self.logger.warning(f"Forcing termination of SDR process for device {sdr_id}")
                process_info['process'].terminate()

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

        # Send configuration to the process
        process_info['config_queue'].put(config)
        self.logger.info(f"Sent configuration update to SDR process for device {sdr_id}")

    def is_sdr_process_running(self, sdr_id):
        """
        Check if an SDR process exists and is running
    
        Args:
            sdr_id: Device identifier
    
        Returns:
            bool: True if the process exists and is running, False otherwise
        """
        return sdr_id in self.processes and self.processes[sdr_id]['process'].is_alive()

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
        data_queue = process_info['data_queue']

        self.logger.info(f"Started monitoring data queue for device {sdr_id}")

        try:
            while sdr_id in self.processes and process_info['process'].is_alive():
                # Check if data is available
                if not data_queue.empty():
                    try:
                        # Get data from the queue
                        data = data_queue.get()

                        # Process data based on type
                        data_type = data.get('type')
                        client_id = data.get('client_id')

                        if data_type == 'fft_data' and client_id:
                            # Send FFT data to the client if still connected
                            if client_id in process_info['clients']:
                                # Get client's Socket.IO room
                                await self.sio.emit('sdr-fft-data', data['data'], room=sdr_id)

                        if data_type == 'streamingstart' and client_id:
                            if client_id in process_info['clients']:
                                # Sent a message to the UI, streaming started
                                await self.sio.emit('sdr-status', {'streaming': True}, room=sdr_id)

                        elif data_type == 'config_error' and client_id:
                            # Send config error to the client
                            if client_id in process_info['clients']:
                                await self.sio.emit('sdr-config-error',
                                                    {'message': f"SDR error: {data['message']}"},
                                                    room=sdr_id)
                                self.logger.error(f"Config error from SDR process for client {client_id}: {data['message']}")

                        elif data_type == 'error' and client_id:
                            # Send error to the client
                            if client_id in process_info['clients']:
                                await self.sio.emit('sdr-error',
                                               {'message': f"SDR error: {data['message']}"},
                                               room=sdr_id)
                                self.logger.error(f"Error from SDR process for client {client_id}: {data['message']}")

                        elif data_type == 'terminated':
                            # Process has terminated
                            self.logger.info(f"SDR process for device {sdr_id} has terminated")

                            # Notify all clients
                            for client_id in process_info['clients']:
                                await self.sio.emit('sdr-status', {'streaming': False}, room=sdr_id)

                            # Remove process info
                            if sdr_id in self.processes:
                                del self.processes[sdr_id]

                            # Exit the loop
                            break

                    except Exception as e:
                        self.logger.error(f"Error processing data from SDR process: {str(e)}")
                        self.logger.exception(e)

                # Short sleep to avoid CPU hogging
                await asyncio.sleep(0.01)

        except Exception as e:
            self.logger.error(f"Error monitoring data queue for device {sdr_id}: {str(e)}")

        finally:
            self.logger.info(f"Stopped monitoring data queue for device {sdr_id}")

            # Make sure the process is cleaned up
            if sdr_id in self.processes:
                await self.stop_sdr_process(sdr_id)


# Set up the SDR process manager
sdr_process_manager = SDRProcessManager()
