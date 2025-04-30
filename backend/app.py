import uvicorn
import socketio
import os
import httpx
import rtlsdr
import logging
import threading
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from tracking import satellite_tracking_task
from fastapi import FastAPI, WebSocket, Request, HTTPException
from models import Base
from logger import get_logger, get_logger_config
from handlers import *
from db import *
from sqlalchemy.ext.asyncio import (create_async_engine, AsyncSession)
from fastapi.staticfiles import StaticFiles
from logger import logger
from engineio.payload import Payload
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, Union
from sdr import process_rtlsdr_data, active_sdr_clients, rtlsdr_devices
from waterfall import waterfall_socket_app, cleanup_sdr_session
from sdrprocessmanager import sdr_process_manager


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

# Create a session factory
AsyncSessionLocal = sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession
)

@asynccontextmanager
async def lifespan(fastapiapp: FastAPI):
    """
    Custom lifespan for FastAPI.
    Create and cleanup background tasks or other
    resources in this context manager.
    """
    # Start the background task
    tracking_task = asyncio.create_task(satellite_tracking_task(sio))

    try:
        yield
    finally:
        # Cancel the background task on shutdown
        tracking_task.cancel()
        try:
            await tracking_task
        except asyncio.CancelledError:
            pass


# Create an asynchronous Socket.IO server using ASGI mode.
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*', logger=True, engineio_logger=True, binary=True)
app = FastAPI(lifespan=lifespan)

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

@sio.on('connect')
async def connect(sid, environ, auth=None):
    client_ip = environ.get("REMOTE_ADDR")
    logger.info(f'Client {sid} from {client_ip} connected, auth: {auth}')
    SESSIONS[sid] = environ


@sio.on('disconnect')
async def disconnect(sid, environ):
    logger.info(f'Client {sid} from {SESSIONS[sid]['REMOTE_ADDR']} disconnected')
    del SESSIONS[sid]

    # clean up any SDR sessions
    cleanup_sdr_session(sid)


@sio.on('sdr_data')
async def handle_sdr_data_requests(sid, cmd, data=None):
    sdrlogger = logging.getLogger('sdr-data-process')
    sdrlogger.info(f'Received SDR event from: {sid}, with cmd: {cmd}, and data: {data}')
    reply = await sdr_data_request_routing(sio, cmd, data, sdrlogger, sid)
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
    logger.info(f'Received authentication event from client {sid} with IP {SESSIONS[sid]['REMOTE_ADDR']}: {data}')
    reply = await auth_request_routing(sio, cmd, data, logger, sid)

    logger.info(f'Replying to authentication event from client {sid} with IP {SESSIONS[sid]['REMOTE_ADDR']}: {reply}')
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

# Mount the waterfall Socket.IO app at the /waterfall path
app.mount("/ws/waterfall", waterfall_socket_app)

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

    # Run the ASGI application with Uvicorn on port 5000.
    uvicorn.run(socket_app, host=arguments.host, port=arguments.port, log_config=get_logger_config(arguments))