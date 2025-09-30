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

import crud
from typing import Union
from db import AsyncSessionLocal
from sdr.utils import cleanup_sdr_session, add_sdr_session, get_sdr_session, active_sdr_clients
from sdr.sdrprocessmanager import sdr_process_manager


async def sdr_data_request_routing(sio, cmd, data, logger, client_id):

    async with AsyncSessionLocal() as dbsession:
        reply: dict[str, Union[bool, None, dict, list, str]] = {'success': False, 'data': None}

        if cmd == "configure-sdr":
            try:
                # SDR device id
                sdr_id = data.get('selectedSDRId', None)

                logger.info(f"Configuring SDR {sdr_id} for client {client_id} with config {data}")

                # Fetch SDR device details from database
                sdr_device_reply = await crud.hardware.fetch_sdr(dbsession, sdr_id)
                if not sdr_device_reply['success'] or not sdr_device_reply['data']:
                    raise Exception(f"SDR device with id {sdr_id} not found in database")

                sdr_device = sdr_device_reply['data']
                sdr_serial = sdr_device.get('serial', 0)
                sdr_host = sdr_device.get('host', None)
                sdr_port = sdr_device.get('port', None)

                # Default to 100 MHz
                center_freq = data.get('centerFrequency', 100e6)

                # Validate center frequency against device limits
                frequency_range = sdr_device.get('frequency_range', {'min': float("-inf"), 'max': float("inf")})
                if not (frequency_range['min'] * 1e6 <= center_freq <= frequency_range['max'] * 1e6):
                    raise Exception(
                        f"Center frequency {center_freq / 1e6:.2f} MHz is outside device limits "
                        f"({frequency_range['min']:.2f} MHz - {frequency_range['max']:.2f} MHz)")

                # Default to 2.048 MSPS
                sample_rate = data.get('sampleRate', 2.048e6)

                # Default to 20 dB gain
                gain = data.get('gain', 20)

                # Default FFT size
                fft_size = data.get('fftSize', 1024)

                # Enable/disable Bias-T
                bias_t = data.get('biasT', False)

                # Read tuner AGC setting
                tuner_agc = data.get('tunerAgc', False)

                # Read AGC mode
                rtl_agc = data.get('rtlAgc', False)

                # Read the FFT window
                fft_window = data.get('fftWindow', 'hanning')

                # FFT Averaging
                fft_averaging = data.get('fftAveraging', 1)

                # Antenna port
                antenna = data.get('antenna', None)

                # Soapy AGC
                soapy_agc = data.get('soapyAgc', False)

                # Offset frequency for downconverters and upconverters
                offset_freq = data.get('offsetFrequency', 0)

                # SDR configuration dictionary
                sdr_config = {
                    'center_freq': center_freq,
                    'sample_rate': sample_rate,
                    'gain': gain,
                    'fft_size': fft_size,
                    'bias_t': bias_t,
                    'tuner_agc': tuner_agc,
                    'rtl_agc': rtl_agc,
                    'fft_window': fft_window,
                    'fft_averaging': fft_averaging,
                    'antenna': antenna,
                    'sdr_id': sdr_id,
                    'serial_number': sdr_serial,
                    'host': sdr_host,
                    'port': sdr_port,
                    'client_id': client_id,
                    'soapy_agc': soapy_agc,
                    'offset_freq': offset_freq,
                }

                # Create an SDR session entry in memory
                logger.info(f"Creating an SDR session for client {client_id}")
                session = add_sdr_session(client_id, sdr_config)

                # Check if other clients are already connected in the same room (SDR), if so then send them an update
                if sdr_process_manager.processes.get(sdr_id, None) is not None:
                    other_clients = [client for client in sdr_process_manager.processes[sdr_id]['clients'] if client != client_id]

                    # For every other client id, send an update
                    for other_client in other_clients:
                        await sio.emit('sdr-config', sdr_config, room=other_client)

                is_running = sdr_process_manager.is_sdr_process_running(sdr_id)
                if is_running:
                    logger.info(f"Updating SDR configuration for client {client_id} with SDR id: {sdr_id}")
                    await sdr_process_manager.update_configuration(sdr_id, sdr_config)

                reply['success'] = True

            except Exception as e:
                logger.error(f"Error configuring SDR: {str(e)}")
                logger.exception(e)
                await sio.emit('sdr-config-error', {'message': f"Failed to configure SDR: {str(e)}"}, room=client_id)
                reply['success'] = False

        elif cmd == "start-streaming":

            try:
                # SDR device id
                sdr_id = data.get('selectedSDRId', None)

                # Fetch SDR device details from database
                sdr_device_reply = await crud.hardware.fetch_sdr(dbsession, sdr_id)
                if not sdr_device_reply['success'] or not sdr_device_reply['data']:
                    raise Exception(f"SDR device with id {sdr_id} not found in database")

                sdr_device = sdr_device_reply['data']

                if client_id not in active_sdr_clients:
                    raise Exception(f"Client with id: {client_id} not registered")

                sdr_config = get_sdr_session(client_id)

                logger.info(f"Starting streaming SDR data for client {client_id}")

                # Start or join the SDR process
                process_sdr_id = await sdr_process_manager.start_sdr_process(sdr_device, sdr_config, client_id)
                logger.info(f"SDR process started for client {client_id} with process id: {process_sdr_id}")

            except Exception as e:
                logger.error(f"Error starting SDR stream: {str(e)}")
                logger.exception(e)
                await sio.emit('sdr-error', {'message': f"Failed to start SDR stream: {str(e)}"}, room=client_id)
                reply['success'] = False

        elif cmd == "stop-streaming":

            try:
                # SDR device id
                sdr_id = data.get('selectedSDRId', None)

                # Fetch SDR device details from database
                sdr_device_reply = await crud.hardware.fetch_sdr(dbsession, sdr_id)
                if not sdr_device_reply['success'] or not sdr_device_reply['data']:
                    raise Exception(f"SDR device with id {sdr_id} not found in database")

                sdr_device = sdr_device_reply['data']

                client = get_sdr_session(client_id)

                if sdr_id:
                    # Stop or leave the SDR process
                    await sdr_process_manager.stop_sdr_process(sdr_id, client_id)

                if client_id not in active_sdr_clients:
                    logger.error(f"Client {client_id} not registered while stopping SDR stream")
                    reply['success'] = False

                # cleanup
                await cleanup_sdr_session(client_id)

                await sio.emit('sdr-status', {'streaming': False}, room=client_id)
                logger.info(f"Stopped streaming SDR data for client {client_id}")

            except Exception as e:
                logger.error(f"Error stopping SDR stream: {str(e)}")
                logger.exception(e)
                await sio.emit('sdr-error', {'message': f"Failed to stop SDR stream: {str(e)}"}, room=client_id)
                reply['success'] = False

        else:
            logger.error(f'Unknown SDR command: {cmd}')

    return reply