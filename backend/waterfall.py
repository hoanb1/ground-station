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


import logging
import socketio
import rtlsdr
import crud
import asyncio
import json
from typing import Dict, List, Optional, Any, Union
from sdrprocessmanager import sdr_process_manager
from workers.common import window_functions

logger = logging.getLogger('waterfall-process')

# Store active SDR clients and client sessions, keyed by client ID and session ID, respectively.
active_sdr_clients: Dict[str, Dict[str, Any]] = {}

# Store active RTLSDR devices and client connections
rtlsdr_devices: Dict[str, rtlsdr.RtlSdr] = {}

# Create a second Socket.IO server instance specifically for waterfall data
waterfall_sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

# Create a separate ASGI app for this Socket.IO server
waterfall_socket_app = socketio.ASGIApp(waterfall_sio)


def add_sdr_session(sid: str, sdr_config: Dict):
    """
    Adds a new SDR (Software-Defined Radio) session to the active SDR sessions dictionary with
    the given session details. The session is uniquely identified by the `sid` key, and the
    associated configuration parameters such as device ID, center frequency, sampling rate, FFT
    size, gain, and FFT window are stored to manage the SDR client's properties. When the session
    is created, the `task` attribute is initialized to None until further assigned.

    """
    active_sdr_clients[sid] = sdr_config

    return active_sdr_clients[sid]


def get_sdr_session(sid: str) -> Optional[Dict]:
    """
    Returns the SDR session details for a given session ID.

    Args:
        sid: Client session ID to lookup

    Returns:
        The session configuration dictionary if found, None otherwise
    """
    return active_sdr_clients.get(sid)


async def cleanup_sdr_session(sid):
    """Clean up and release resources associated with an SDR client session.

    This function performs the following cleanup tasks:
    - Cancels any running processing tasks
    - Releases the RTLSDR device if no other clients are using it
    - Removes the client from the active clients list

    Args:
        sid: Client session ID to clean up
    """
    if sid in active_sdr_clients:

        client = get_sdr_session(sid)
        sdr_id = client.get('sdr_id')

        if sdr_id:
            # Stop or leave the SDR process
            await sdr_process_manager.stop_sdr_process(sdr_id, sid)

        # Remove client from active clients
        del active_sdr_clients[sid]

    else:
        logger.warning(f"Client {sid} not found in active clients while cleaning up")


# Set up event handlers for the waterfall Socket.IO server
@waterfall_sio.event
async def connect(sid, environ):
    """Connect to waterfall the client"""
    client_ip = environ.get("REMOTE_ADDR")
    logger.info(f'Waterfall client {sid} from {client_ip} connected')

@waterfall_sio.event
async def disconnect(sid):
    """Disconnect from the waterfall client"""

    # clean up any SDR sessions
    await cleanup_sdr_session(sid)


@waterfall_sio.event
async def configure(sid, config):
    """Handle waterfall configuration from the client"""

@waterfall_sio.event
async def start_streaming(sid):
    """Start streaming waterfall data to the client"""

@waterfall_sio.event
async def stop_streaming(sid):
    """Stop streaming waterfall data to the client"""

# Helper functions for waterfall streaming
async def stop_waterfall_streaming(sid):
    """Stop waterfall streaming for a client"""

async def stream_waterfall_data_task(sid, device_index, config):
    """Background task to stream waterfall data to a client"""


async def get_local_soapy_sdr_devices():
    """Retrieve a list of local SoapySDR devices with frequency range information"""

    reply: dict[str, bool | dict | list | str | None] = {'success': None, 'data': None, 'error': None}

    try:
        # Call probe_available_usb_sdrs using a subprocess instead of multiprocessing.Pool
        probe_process = await asyncio.create_subprocess_exec(
            'python3', '-c',
            'from workers.soapyenum import probe_available_usb_sdrs; import json; print(probe_available_usb_sdrs())',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        try:
            stdout, stderr = await asyncio.wait_for(probe_process.communicate(), timeout=35)
            result = json.loads(stdout.decode().strip())

            if result['success']:
                result = result['data']
            else:
                raise Exception("Error enumerating local SoapySDR devices")

            reply['success'] = True
            reply['data'] = result

        except asyncio.TimeoutError:
            # Kill the process if it times out
            probe_process.kill()
            logger.error("Process timed out while probing USB SDRs")
            reply['success'] = False
            reply['error'] = "Operation timed out after 5 seconds"

    except Exception as e:
        logger.error(f"Error probing USB SDRs: {str(e)}")
        logger.exception(e)
        reply['success'] = False
        reply['error'] = str(e)

    return reply



async def get_sdr_parameters(dbsession, sdr_id, timeout=30.0):
    """Retrieve SDR parameters from the SDR process manager"""

    reply: dict[str, Union[bool, None, dict, list, str]] = {'success': None, 'data': None, 'error': None}
    sdr = {}
    sdr_params = {}

    try:
        # Fetch SDR device details from database
        sdr_device_reply = await crud.fetch_sdr(dbsession, sdr_id)

        if not sdr_device_reply['data']:
            raise Exception(f"SDR device with id {sdr_id} not found in database")

        sdr = sdr_device_reply['data']

        if sdr.get('type') in ['rtlsdrtcpv3', 'rtlsdrusbv3', 'rtlsdrtcpv4', 'rtlsdrusbv4']:

            # Common RTL-SDR gain values in dB
            gain_values = [0.0, 0.9, 1.4, 2.7, 3.7, 7.7, 8.7, 12.5, 14.4, 15.7,
                           16.6, 19.7, 20.7, 22.9, 25.4, 28.0, 29.7, 32.8, 33.8,
                           36.4, 37.2, 38.6, 40.2, 42.1, 43.4, 43.9, 44.5, 48.0]

            # Common RTL-SDR sample rates in Hz
            sample_rate_values = [
                240000, 300000, 960000, 1024000, 1536000, 1792000, 1920000,
                2048000, 2304000, 2400000, 2560000, 2880000, 3200000
            ]

            # Common window functions
            window_function_names = list(window_functions.keys())

            # Common FFT sizes
            fft_size_values = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536]

            params = {
                'gain_values': gain_values,
                'sample_rate_values': sample_rate_values,
                'fft_size_values': fft_size_values,
                'fft_window_values': window_function_names,
                'has_bias_t': True,
                'has_tuner_agc': True,
                'has_rtl_agc': True,
                'antennas': {'tx': [], 'rx': []},
            }

            reply = {'success': True, 'data': params}

        elif sdr.get('type') in ['soapysdrremote', 'soapysdrlocal']:
            if sdr.get('type') == 'soapysdrremote':
                logger.info(f'Getting SDR parameters from SoapySDR server for SDR: {sdr}')
                # Get SDR parameters from the SoapySDR server in a separate process
                probe_process = await asyncio.create_subprocess_exec(
                    'python3', '-c',
                    f'from workers.soapysdrremoteprobe import probe_remote_soapy_sdr; print(probe_remote_soapy_sdr({sdr}))',
                    stdout=asyncio.subprocess.PIPE
                )

                try:
                    stdout, _ = await asyncio.wait_for(probe_process.communicate(), timeout=timeout)

                except asyncio.TimeoutError:
                    probe_process.kill()
                    raise TimeoutError('Timed out while getting SDR parameters from SoapySDR server')
            else:
                logger.info(f'Getting SDR parameters from local SoapySDR for SDR: {sdr}')
                # Get SDR parameters from local SoapySDR in a separate process
                probe_process = await asyncio.create_subprocess_exec(
                    'python3', '-c',
                    f'from workers.soapysdrlocalprobe import probe_local_soapy_sdr; print(probe_local_soapy_sdr({sdr}))',
                    stdout=asyncio.subprocess.PIPE
                )

                try:
                    stdout, _ = await asyncio.wait_for(probe_process.communicate(), timeout=timeout)

                except asyncio.TimeoutError:
                    probe_process.kill()
                    raise TimeoutError('Timed out while getting SDR parameters from SoapySDR server')

            sdr_params_reply = eval(stdout.decode().strip())

            if sdr_params_reply['success'] is False:
                logger.error(sdr_params_reply)
                raise Exception(sdr_params_reply['error'])

            sdr_params = sdr_params_reply['data']

            logger.debug(f'Got SDR parameters from SoapySDR server: {sdr_params}')

            # Common window functions
            window_function_names = list(window_functions.keys())

            # Common FFT sizes
            fft_size_values = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536]

            params = {
                'gain_values': sdr_params['gains'],
                'sample_rate_values': [rate for rate in sdr_params['rates'] if rate >= 500000],
                'fft_size_values': fft_size_values,
                'fft_window_values': window_function_names,
                'has_soapy_agc': sdr_params['has_soapy_agc'],
                'antennas': sdr_params['antennas'],
            }

            reply = {'success': True, 'data': params}

    except TimeoutError as e:
        error_msg = (f"Timeout occurred while getting parameters from SDR with id {sdr_id} "
                     f"within {timeout} seconds timeout")
        logger.error(error_msg)
        reply['success'] = False
        reply['error'] = error_msg

    except Exception as e:
        error_msg = f"Error occurred while getting parameters from SDR with id {sdr_id}"
        logger.error(error_msg)
        logger.exception(e)
        reply['success'] = False
        reply['error'] = error_msg

    finally:
        pass

    return reply

