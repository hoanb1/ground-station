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


import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import uvicorn
import socketio
import httpx
import queue
from demodulators.webaudioproducer import WebAudioProducer
from demodulators.webaudioconsumer import WebAudioConsumer
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, Request, HTTPException
from db.models import Base
from logger import get_logger_config
from handlers import *
from db import *
from sqlalchemy.ext.asyncio import (AsyncSession)
from fastapi.staticfiles import StaticFiles
from logger import logger
from engineio.payload import Payload
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict
from sdr.utils import cleanup_sdr_session
from sdr.sdrprocessmanager import sdr_process_manager
from sdr.soapysdrbrowser import discover_soapy_servers
from tracker.logic import start_tracker_process


# Show NumPy configuration
# np.show_config()

Payload.max_decode_packets = 50

# Models for request/response
class RTCSessionDescription(BaseModel):
    type: str
    sdp: str

class IceCandidate(BaseModel):
    candidate: str
    sdpMid: str
    sdpMLineIndex: int

class CameraSource(BaseModel):
    source_url: str
    camera_id: Optional[str] = None

class WebRTCRequest(BaseModel):
    source_url: str
    camera_id: Optional[str] = None
    type: str
    sdp: str

# Store active connections
active_connections: Dict[str, WebSocket] = {}

# hold a list of sessions
SESSIONS = {}

# Add these global variables
tracker_process = None
queue_to_tracker = None
queue_from_tracker = None
tracker_stop_event = None

async def run_discover_soapy():
    while True:
        await discover_soapy_servers()
        await asyncio.sleep(120)


@asynccontextmanager
async def lifespan(fastapiapp: FastAPI):
    """
    Custom lifespan for FastAPI.
    Create and cleanup background tasks or other
    resources in this context manager.
    """
    global audio_producer, audio_consumer, tracker_process, queue_to_tracker, queue_from_tracker, tracker_stop_event

    # Start the tracker process here
    tracker_process, queue_to_tracker, queue_from_tracker, tracker_stop_event = start_tracker_process()

    # Get the current event loop
    event_loop = asyncio.get_event_loop()

    # Start audio producer/consumer threads
    audio_producer = WebAudioProducer(audio_queue)
    audio_consumer = WebAudioConsumer(audio_queue, sio, event_loop)

    audio_producer.start()
    audio_consumer.start()

    if arguments.runonce_soapy_discovery:
        # Run SoapyDR discovery task on startup
        await discover_soapy_servers()

    # Start the Soapy server discovery task only if continuous discovery enabled
    discover_task = None
    if arguments.enable_soapy_discovery:
        discover_task = asyncio.create_task(run_discover_soapy())

    # Start the message handler in your tracker process event loop
    asyncio.create_task(handle_tracker_messages(sio))

    try:
        yield
    finally:
        # Stop audio threads
        if audio_producer:
            audio_producer.stop()
        if audio_consumer:
            audio_consumer.stop()

        # Cancel the Soapy server discovery task if it was started
        if discover_task:
            discover_task.cancel()
            try:
                await discover_task
            except asyncio.CancelledError:
                pass

        # Stop the tracker process
        if tracker_process and tracker_process.is_alive():
            try:
                stop_tracker()
            except Exception as e:
                logger.error(f"Error stopping tracker: {e}")


# Create an asynchronous Socket.IO server using ASGI mode.
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*', logger=True, engineio_logger=True, binary=True)
app = FastAPI(lifespan=lifespan)

# Queues for the sound streams
audio_queue = queue.Queue(maxsize=20)
audio_producer = None
audio_consumer = None

# Wrap the Socket.IO server with an ASGI application.
# This allows non-Socket.IO routes (like the FastAPI endpoints) to be served as well.
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Feed in the Socket.IO server instance to the SDR process manager
sdr_process_manager.set_sio(sio)

def stop_tracker():
    """
    Send a command to the tracker process to stop it.

    """
    global tracker_stop_event, queue_to_tracker, tracker_process

    if tracker_stop_event is None or queue_to_tracker is None or tracker_process is None:
        logger.warning("Tracker components not initialized, cannot stop")
        return

    logger.info("Stopping tracker process...")

    try:
        # Set the stop event
        tracker_stop_event.set()

        # Send a stop command through the queue as well
        queue_to_tracker.put({'command': 'stop'})

        # Wait for the process to terminate
        tracker_process.join(timeout=5)

        # Force terminate if it's still running
        if tracker_process.is_alive():
            logger.warning("Tracker process didn't terminate gracefully, forcing termination")
            tracker_process.terminate()
            tracker_process.join(timeout=2)  # Give it a bit more time

        logger.info("Tracker process stopped successfully")

    except Exception as e:
        logger.error(f"Error during tracker shutdown: {e}")
        # Force terminate as last resort
        if tracker_process and tracker_process.is_alive():
            tracker_process.terminate()


async def handle_tracker_messages(sockio):
    """
    Continuously checks for messages from the tracker process and forwards them to Socket.IO
    """
    global queue_from_tracker

    while True:
        try:
            if queue_from_tracker is not None and not queue_from_tracker.empty():
                message = queue_from_tracker.get_nowait()
                event = message.get('event')
                data = message.get('data', {})

                # Forward the message to Socket.IO clients
                if event:
                    await sockio.emit(event, data)

            # Don't busy-wait
            await asyncio.sleep(0.1)

        except Exception as e:
            logger.error(f"Error handling tracker messages: {e}")
            # Wait a bit longer on error
            await asyncio.sleep(1)


@sio.on('connect')
async def connect(sid, environ, auth=None):
    client_ip = environ.get("REMOTE_ADDR")
    logger.info(f'Client {sid} from {client_ip} connected, auth: {auth}')
    SESSIONS[sid] = environ

@sio.on('disconnect')
async def disconnect(sid, environ):
    logger.info(f'Client {sid} from {SESSIONS[sid]["REMOTE_ADDR"]} disconnected')
    del SESSIONS[sid]

    # clean up any SDR sessions
    await cleanup_sdr_session(sid)

@sio.on('sdr_data')
async def handle_sdr_data_requests(sid, cmd, data=None):
    logger.info(f'Received SDR event from: {sid}, with cmd: {cmd}, and data: {data}')
    reply = await sdr_data_request_routing(sio, cmd, data, logger, sid)
    return reply

@sio.on('data_request')
async def handle_frontend_data_requests(sid, cmd, data=None):
    logger.info(f'Received event from: {sid}, with cmd: {cmd}, and data: {data}')
    reply = await data_request_routing(sio, cmd, data, logger, sid)
    return reply

@sio.on('data_submission')
async def handle_frontend_data_submissions(sid, cmd, data=None):
    logger.info(f'Received event from: {sid}, with cmd: {cmd}, and data: {data}')
    reply = await data_submission_routing(sio, cmd, data, logger, sid)
    return reply

@sio.on('auth_request')
async def handle_frontend_auth_requests(sid, cmd, data):
    logger.info(f'Received authentication event from client {sid} with IP {SESSIONS[sid]["REMOTE_ADDR"]}: {data}')
    reply = await auth_request_routing(sio, cmd, data, logger, sid)

    logger.info(f'Replying to authentication event from client {sid} with IP {SESSIONS[sid]["REMOTE_ADDR"]}: {reply}')
    return {'success': reply['success'], 'token': reply['token'], 'user': reply['user']}

@app.post("/api/webrtc/offer")
async def create_webrtc_session(request: WebRTCRequest):
    """Relay WebRTC offer to go2rtc and return an answer"""
    try:
        # Extract base URL from the provided stream URL
        base_url = request.source_url.split('/stream.html')[0]
        webrtc_url = f"{base_url}/api/webrtc"

        # Extract camera ID from URL query parameter if not provided
        camera_id = request.camera_id
        if not camera_id and "src=" in request.source_url:
            camera_id = request.source_url.split("src=")[1].split("&")[0]

        logger.info(f"Creating WebRTC session for camera: {camera_id}")

        # Forward the offer to go2rtc WebRTC API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                webrtc_url,
                json={"type": request.type, "sdp": request.sdp},
                params={"src": camera_id} if camera_id else None
            )

            if response.status_code != 200:
                logger.error(f"Error from go2rtc: {response.status_code} - {response.text}")
                raise HTTPException(status_code=response.status_code, detail="Failed to create WebRTC session")

            # Return the SDP answer from go2rtc
            answer_data = response.json()
            return RTCSessionDescription(type=answer_data["type"], sdp=answer_data["sdp"])

    except Exception as e:
        logger.error(f"Error creating WebRTC session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating WebRTC session: {str(e)}")

@app.websocket("/ws/webrtc/{client_id}")
async def webrtc_websocket(websocket: WebSocket, client_id: str):
    """WebSocket endpoint for ICE candidate exchange"""
    await websocket.accept()
    active_connections[client_id] = websocket

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle different message types
            if message.get("type") == "ice-candidate":
                # Forward ICE candidate to go2rtc
                # You would implement this if go2rtc supports WebSocket-based ICE candidate exchange
                pass

            # Echo back for testing
            await websocket.send_text(json.dumps({"type": "echo", "data": message}))

    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
    finally:
        if client_id in active_connections:
            del active_connections[client_id]

# the satimages directory
app.mount("/satimages", StaticFiles(directory="satimages"), name="satimages")

@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    static_files_dir = os.environ.get("STATIC_FILES_DIR", "../frontend/dist")

    # Skip requests for static assets (optional, depending on your setup)
    # If you're serving static files from a 'static' subdirectory
    if full_path.startswith(("static/", "assets/", "favicon.ico")):
        return FileResponse(os.path.join(static_files_dir, full_path))

    # For all other routes, serve the index.html file
    return FileResponse(os.path.join(static_files_dir, "index.html"))

# root path
app.mount("/", StaticFiles(directory=os.environ.get("STATIC_FILES_DIR", "../frontend/dist"), html=True), name="static")


# Function to check and create tables
async def init_db():
    """
    Create all tables and insert a sample user into the database.
    """
    logger.info("Initializing database...")
    async with engine.begin() as conn:
        # Create tables
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized.")


if __name__ == "__main__":
    logger.info("Configuring database connection...")
    loop = asyncio.get_event_loop()
    loop.run_until_complete(init_db())

    logger.info(f'Starting Ground Station server with parameters {arguments}')

    try:
        # Run the ASGI application with Uvicorn on port 5000.
        uvicorn.run(socket_app, host=arguments.host, port=arguments.port, log_config=get_logger_config(arguments))

    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt, shutting down...")
        sys.exit(0)

    except Exception as e:
        logger.error(f"Error starting Ground Station server: {str(e)}")
        logger.exception(e)
        sys.exit(1)