import logging
import socketio
import rtlsdr
import asyncio
import numpy as np
from datetime import time
from typing import Dict, List, Optional, Any
from sdrprocessmanager import sdr_process_manager


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
