import logging
import socketio
import rtlsdr
import asyncio
import numpy as np
from datetime import time
from typing import Dict, List, Optional, Any

logger = logging.getLogger('waterfall-process')

# Store active SDR clients and client sessions, keyed by client ID and session ID, respectively.
active_sdr_clients: Dict[str, Dict[str, Any]] = {}

# Store active RTLSDR devices and client connections
rtlsdr_devices: Dict[int, rtlsdr.RtlSdr] = {}

# Create a second Socket.IO server instance specifically for waterfall data
waterfall_sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

# Create a separate ASGI app for this Socket.IO server
waterfall_socket_app = socketio.ASGIApp(waterfall_sio)


def add_sdr_session(sid, device_id=None, center_frequency=None, sample_rate=None, gain=None, fft_size=1024):
    """Store new SDR client session parameters.

    Args:
        sid: Client session ID
        device_id: RTL-SDR device identifier
        center_frequency: Center frequency in Hz
        sample_rate: Sample rate in Hz
        gain: Device gain in dB
        fft_size: FFT size for spectral analysis
    """
    active_sdr_clients[sid] = {
        'device_id': device_id,
        'center_frequency': center_frequency,
        'sample_rate': sample_rate,
        'gain': gain,
        'fft_size': fft_size,
        'task': None,
    }


def cleanup_sdr_session(sid):
    """Clean up and release resources associated with an SDR client session.

    This function performs the following cleanup tasks:
    - Cancels any running processing tasks
    - Releases the RTLSDR device if no other clients are using it
    - Removes the client from the active clients list

    Args:
        sid: Client session ID to clean up
    """
    if sid in active_sdr_clients:
        client = active_sdr_clients[sid]
        if 'task' in client and client['task']:
            client['task'].cancel()
            client['task'] = None

        if 'thread_future' in client and client['thread_future']:
            client['thread_future'].cancel()
            client['thread_future'] = None

        device_id = client.get('device_id')

        # Close and release the RTLSDR device if it was exclusively used by this client
        if device_id is not None and device_id in rtlsdr_devices:
            # Check if no other clients are using this device
            other_users = [cid for cid, c in active_sdr_clients.items()
                           if cid != sid and c.get('device_id') == device_id]

            if not other_users:
                try:
                    rtlsdr_devices[device_id].close()
                    del rtlsdr_devices[device_id]
                    logger.info(f"Released RTLSDR device {device_id}")
                except Exception as e:
                    logger.error(f"Error closing RTLSDR device: {str(e)}")
                    logger.exception(e)

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
    cleanup_sdr_session(sid)


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
