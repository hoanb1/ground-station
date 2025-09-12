import asyncio
import os
import queue
import socketio
from server import shutdown
from contextlib import asynccontextmanager
from engineio.payload import Payload
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from common.logger import logger
from db import *  # noqa: F401,F403
from db.models import Base
from sdr.sdrprocessmanager import sdr_process_manager
from sdr.soapysdrbrowser import discover_soapy_servers
from tracker.runner import start_tracker_process
from demodulators.webaudioproducer import WebAudioProducer
from demodulators.webaudioconsumer import WebAudioConsumer
from common.arguments import arguments

Payload.max_decode_packets = 50

# Queues for the sound streams
audio_queue = queue.Queue(maxsize=2)


async def run_discover_soapy():
    while True:
        await discover_soapy_servers()
        await asyncio.sleep(120)


async def handle_tracker_messages(sockio):
    """Continuously checks for messages from the tracker process."""
    while True:
        try:
            from tracker.runner import queue_from_tracker
            if queue_from_tracker is not None and not queue_from_tracker.empty():
                message = queue_from_tracker.get_nowait()
                event = message.get('event')
                data = message.get('data', {})
                if event:
                    await sockio.emit(event, data)
            await asyncio.sleep(0.1)
        except Exception as e:  # pragma: no cover - best effort
            logger.error(f"Error handling tracker messages: {e}")
            await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(fastapiapp: FastAPI):
    """Custom lifespan for FastAPI."""
    logger.info("FastAPI lifespan startup...")
    start_tracker_process()
    event_loop = asyncio.get_event_loop()
    shutdown.audio_producer = WebAudioProducer(audio_queue)
    shutdown.audio_consumer = WebAudioConsumer(audio_queue, sio, event_loop)
    shutdown.audio_producer.start()
    shutdown.audio_consumer.start()
    asyncio.create_task(handle_tracker_messages(sio))
    if arguments.runonce_soapy_discovery:
        await discover_soapy_servers()
    if arguments.enable_soapy_discovery:
        asyncio.create_task(run_discover_soapy())
    try:
        yield
    finally:
        logger.info("FastAPI lifespan cleanup...")
        shutdown.cleanup_everything()


sio = socketio.AsyncServer(
    async_mode='asgi', cors_allowed_origins='*', logger=True, engineio_logger=True, binary=True
)
app = FastAPI(lifespan=lifespan)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sdr_process_manager.set_sio(sio)

# Mount static directories
app.mount("/satimages", StaticFiles(directory="satimages"), name="satimages")
#app.mount("/", StaticFiles(directory=os.environ.get("STATIC_FILES_DIR", "../frontend/dist"), html=True), name="static")


@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    static_files_dir = os.environ.get("STATIC_FILES_DIR", "../../frontend/dist")
    if full_path.startswith(("static/", "assets/", "favicon.ico")):
        return FileResponse(os.path.join(static_files_dir, full_path))
    return FileResponse(os.path.join(static_files_dir, "index.html"))


async def init_db():
    """Create database tables."""
    logger.info("Initializing database...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized.")
