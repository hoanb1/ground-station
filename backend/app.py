import uvicorn
import socketio
from contextlib import asynccontextmanager
from tracking import satellite_tracking_task
from fastapi import FastAPI, WebSocket, Depends
from models import Base
from fastapi.middleware.cors import CORSMiddleware
from logger import get_logger, get_logger_config
from handlers import *
from db import *
from sqlalchemy.ext.asyncio import (create_async_engine, AsyncSession)
from fastapi.staticfiles import StaticFiles
from logger import logger
from engineio.payload import Payload

Payload.max_decode_packets = 50


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
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*', logger=True, engineio_logger=True)
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

@sio.event
async def connect(sid, environ, auth=None):
    client_ip = environ.get("REMOTE_ADDR")
    logger.info(f'Client {sid} from {client_ip} connected, auth: {auth}')
    SESSIONS[sid] = environ


@sio.event
async def disconnect(sid, environ):
    logger.info(f'Client {sid} from {SESSIONS[sid]['REMOTE_ADDR']} disconnected',)
    del SESSIONS[sid]

@sio.on('data_request')
async def handle_frontend_data_requests(sid, cmd, data=None):
    logger.info(f'Received event from: {sid}, with cmd: {cmd}, and data: {data}')
    reply = await data_request_routing(sio, cmd, data, logger)
    return reply

@sio.on('data_submission')
async def handle_frontend_data_submissions(sid, cmd, data=None):
    logger.info(f'Received event from: {sid}, with cmd: {cmd}, and data: {data}')
    reply = await data_submission_routing(sio, cmd, data, logger)
    return reply

@sio.on('auth_request')
async def handle_frontend_auth_requests(sid, cmd, data):
    logger.info(f'Received authentication event from client {sid} with IP {SESSIONS[sid]['REMOTE_ADDR']}: {data}')
    reply = await auth_request_routing(sio, cmd, data, logger)

    logger.info(f'Replying to authentication event from client {sid} with IP {SESSIONS[sid]['REMOTE_ADDR']}: {reply}')
    return {'success': reply['success'], 'token': reply['token'], 'user': reply['user']}


# Example route
@app.get("/")
def read_root():
    logger.info("Root endpoint accessed")
    return {"message": "Welcome to the FastAPI app!"}

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

app.mount("/public", StaticFiles(directory="public"), name="public")


# Command-line argument parsing
if __name__ == "__main__":
    logger.info("Configuring database connection...")
    loop = asyncio.get_event_loop()
    loop.run_until_complete(init_db())

    logger.info(f'Starting Ground Station server with parameters {arguments}')

    # Run the ASGI application with Uvicorn on port 5000.
    uvicorn.run(socket_app, host="0.0.0.0", port=5000, log_config=get_logger_config(arguments))
