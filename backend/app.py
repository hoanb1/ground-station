
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
import signal
import json
import asyncio
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import uvicorn
import socketio
import httpx
import queue
import threading
import multiprocessing
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
from tracker.runner import start_tracker_process


# Add setproctitle import for process naming
try:
    import setproctitle
    HAS_SETPROCTITLE = True
except ImportError:
    HAS_SETPROCTITLE = False

# Global references for cleanup
audio_producer: Optional[threading.Thread] = None
audio_consumer: Optional[threading.Thread] = None

# Some globals for the tracker process
tracker_process: Optional[multiprocessing.Process] = None
queue_to_tracker: Optional[multiprocessing.Queue] = None
queue_from_tracker: Optional[multiprocessing.Queue] = None
tracker_stop_event: Optional[multiprocessing.Event] = None

def cleanup_everything():
    """Cleanup function to stop all processes and threads"""
    logger.info("Cleaning up all processes and threads...")

    # Import here to avoid circular imports
    try:
        # Kill tracker process immediately - no graceful shutdown
        if tracker_process and tracker_process.is_alive():
            logger.info(f"Killing tracker process PID: {tracker_process.pid}")
            tracker_process.kill()
            logger.info("Tracker killed")
    except Exception as e:
        logger.info(f"Error killing tracker: {e}")

    # Clean up all SDR sessions
    try:
        from sdr.utils import active_sdr_clients
        if active_sdr_clients:
            logger.info(f"Cleaning up {len(active_sdr_clients)} SDR sessions...")
            # Create a copy of the keys to avoid dictionary changed size during iteration
            session_ids = list(active_sdr_clients.keys())
            for sid in session_ids:
                try:
                    # Run cleanup_sdr_session for each session
                    event_loop = asyncio.get_event_loop()
                    if event_loop.is_running():
                        # If we're in an async context, create a task
                        asyncio.create_task(cleanup_sdr_session(sid))
                    else:
                        # If we're not in an async context, run it
                        event_loop.run_until_complete(cleanup_sdr_session(sid))
                    logger.info(f"Cleaned up SDR session: {sid}")
                except Exception as e:
                    logger.warning(f"Error cleaning up SDR session {sid}: {e}")
            logger.info("All SDR sessions cleaned up")
    except Exception as e:
        logger.warning(f"Error during SDR sessions cleanup: {e}")

    # Stop audio
    try:
        if audio_producer:
            audio_producer.stop()
        if audio_consumer:
            audio_consumer.stop()
    except Exception as e:
        logger.warning(f"Error stopping audio: {e}")

    logger.info("Cleanup complete")


def signal_handler(signum, frame):
    """Handle SIGINT and SIGTERM signals"""
    logger.info(f"\nReceived signal {signum}, initiating shutdown...")
    cleanup_everything()
    logger.info("Forcing exit...")
    os._exit(0)

# Register signal handlers BEFORE starting anything
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

# Set the main process name early in the application startup
if HAS_SETPROCTITLE:
    setproctitle.setproctitle("Ground Station - Main Thread")

# Set the multiprocessing current process name
multiprocessing.current_process().name = "Ground Station - Main"

# Set the main thread name
threading.current_thread().name = "Ground Station - Main Thread"

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

async def run_discover_soapy():
    while True:
        await discover_soapy_servers()
        await asyncio.sleep(120)

async def handle_tracker_messages(sockio):
    """
    Continuously checks for messages from the tracker process and forwards them to Socket.IO
    """
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

@asynccontextmanager
async def lifespan(fastapiapp: FastAPI):
    """
    Custom lifespan for FastAPI.
    Create and cleanup background tasks or other
    resources in this context manager.
    """
    global audio_producer, audio_consumer, tracker_process, queue_to_tracker, queue_from_tracker, tracker_stop_event

    logger.info("FastAPI lifespan startup...")

    # Start the tracker process here
    _tracker_process, _queue_to_tracker, _queue_from_tracker, _tracker_stop_event = start_tracker_process()
    tracker_process = _tracker_process
    queue_to_tracker = _queue_to_tracker
    queue_from_tracker = _queue_from_tracker
    tracker_stop_event = _tracker_stop_event

    # Get the current event loop
    event_loop = asyncio.get_event_loop()

    # Start audio producer/consumer threads
    audio_producer = WebAudioProducer(audio_queue)
    audio_consumer = WebAudioConsumer(audio_queue, sio, event_loop)

    audio_producer.start()
    audio_consumer.start()

    # Start the message handler in your tracker process event loop
    asyncio.create_task(handle_tracker_messages(sio))

    if arguments.runonce_soapy_discovery:
        # Run SoapyDR discovery task on startup
        await discover_soapy_servers()

    # Start the Soapy server discovery task only if continuous discovery enabled
    discover_task = None
    if arguments.enable_soapy_discovery:
        discover_task = asyncio.create_task(run_discover_soapy())

    try:
        yield
    finally:
        logger.info("FastAPI lifespan cleanup...")
        cleanup_everything()

# Create an asynchronous Socket.IO server using ASGI mode.
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*', logger=True, engineio_logger=True, binary=True)
app = FastAPI(lifespan=lifespan)

# Queues for the sound streams
audio_queue = queue.Queue(maxsize=20)

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
    Simple function to kill the tracker process
    """
    try:
        if tracker_process and tracker_process.is_alive():
            tracker_process.kill()
    except:
        pass

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
    # Ensure process naming is set when running as main
    if HAS_SETPROCTITLE:
        setproctitle.setproctitle("Ground Station - Main Thread")

    multiprocessing.current_process().name = "Ground Station - Main"
    threading.current_thread().name = "Ground Station - Main Thread"

    logger.info("Configuring database connection...")
    loop = asyncio.get_event_loop()
    loop.run_until_complete(init_db())

    logger.info(f'Starting Ground Station server with parameters {arguments}')

    try:
        # Run the ASGI application with Uvicorn on port 5000.
        uvicorn.run(socket_app, host=arguments.host, port=arguments.port, log_config=get_logger_config(arguments))

    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt in main")
        cleanup_everything()
        os._exit(0)

    except Exception as e:
        logger.error(f"Error starting Ground Station server: {str(e)}")
        logger.exception(e)
        cleanup_everything()
        os._exit(1)