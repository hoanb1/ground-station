import asyncio
import os
import queue
from contextlib import asynccontextmanager

import socketio
from engineio.payload import Payload
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from common.arguments import arguments
from common.logger import logger
from db import *  # noqa: F401,F403
from db.models import Base
from demodulators.webaudioconsumer import WebAudioConsumer
from demodulators.webaudioproducer import WebAudioProducer
from sdr.sdrprocessmanager import sdr_process_manager
from sdr.soapysdrbrowser import discover_soapy_servers
from server import shutdown
from server.version import get_full_version_info
from tracker.runner import start_tracker_process

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
                event = message.get("event")
                data = message.get("data", {})
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
    async_mode="asgi", cors_allowed_origins="*", logger=True, engineio_logger=True, binary=True
)
app = FastAPI(
    lifespan=lifespan,
    title="Ground Station API",
    description="API for satellite tracking, SDR control, and radio communication",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)
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


# Add the version API endpoint BEFORE the catch-all route
@app.get("/api/version")
async def get_version():
    """Return the current version information of the application."""
    try:
        logger.info("Version request received")
        version_info = get_full_version_info()
        logger.info(f"Returning version info: {version_info}")
        return version_info
    except Exception as e:
        logger.error(f"Error retrieving version information: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve version information: {str(e)}"
        )


# This catch-all route comes AFTER specific API routes
@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    static_files_dir = os.environ.get("STATIC_FILES_DIR", "../../frontend/dist")
    if full_path.startswith(("static/", "assets/", "favicon.ico")):
        return FileResponse(os.path.join(static_files_dir, full_path))
    return FileResponse(os.path.join(static_files_dir, "index.html"))


async def init_db():
    """Create database tables."""
    logger.info("Initializing database...")

    # Check if database exists by trying to query metadata
    database_existed = False
    try:
        async with engine.begin() as conn:
            # Try to get table names - if this succeeds, database exists
            result = await conn.run_sync(
                lambda sync_conn: engine.dialect.get_table_names(sync_conn)
            )
            database_existed = len(result) > 0
    except Exception:
        # Database doesn't exist or is empty
        database_existed = False

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # If database didn't exist before, populate with initial data
    if not database_existed:
        logger.info("New database detected. Populating with initial data...")
        await first_time_initialization()

    logger.info("Database initialized.")


async def first_time_initialization():
    """Function called on first server start to populate database with default data."""
    import random
    import string

    from db import AsyncSessionLocal
    from db.models import TLESources

    async with AsyncSessionLocal() as session:
        try:
            # Generate random identifiers for the TLE sources
            def generate_identifier(length=16):
                """Generate a random identifier similar to what the CRUD does."""
                return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))

            # Add default TLE sources
            cubesat_source = TLESources(
                name="Cubesats",
                identifier=generate_identifier(),
                url="http://www.celestrak.com/NORAD/elements/cubesat.txt",
                format="3le",
            )
            session.add(cubesat_source)

            amateur_source = TLESources(
                name="Amateur",
                identifier=generate_identifier(),
                url="http://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle",
                format="3le",
            )
            session.add(amateur_source)

            await session.commit()
            logger.info(
                "Initial data populated successfully with default TLE sources (Cubesats and Amateur)."
            )
        except Exception as e:
            logger.error(f"Error populating initial data: {e}")
            await session.rollback()
            raise
