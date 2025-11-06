import os
import threading
import time
from typing import Dict

from common.logger import logger

# Import all entity modules to register their handlers
from handlers.entities import (
    groups,
    hardware,
    locations,
    preferences,
    satellites,
    tle_sources,
    tracking,
    transmitters,
    vfo,
)
from handlers.entities.filebrowser import filebrowser_request_routing
from handlers.entities.sdr import sdr_data_request_routing
from handlers.routing import dispatch_request, handler_registry
from sdr.utils import cleanup_sdr_session
from server.shutdown import cleanup_everything
from session.tracker import session_tracker

# hold a list of sessions
SESSIONS: Dict[str, Dict] = {}


def _register_all_handlers():
    """Register all entity handlers with the global registry."""
    satellites.register_handlers(handler_registry)
    tle_sources.register_handlers(handler_registry)
    groups.register_handlers(handler_registry)
    hardware.register_handlers(handler_registry)
    locations.register_handlers(handler_registry)
    preferences.register_handlers(handler_registry)
    transmitters.register_handlers(handler_registry)
    tracking.register_handlers(handler_registry)
    vfo.register_handlers(handler_registry)


# Register all handlers at module load time
_register_all_handlers()


def register_socketio_handlers(sio):
    """Register Socket.IO event handlers."""

    @sio.on("connect")
    async def connect(sid, environ, auth=None):
        client_ip = environ.get("REMOTE_ADDR")
        logger.info(f"Client {sid} from {client_ip} connected, auth: {auth}")
        SESSIONS[sid] = environ

    @sio.on("disconnect")
    async def disconnect(sid, environ):
        logger.info(f'Client {sid} from {SESSIONS[sid]["REMOTE_ADDR"]} disconnected')
        del SESSIONS[sid]
        # Clean up session tracking
        session_tracker.clear_session(sid)
        await cleanup_sdr_session(sid)

    @sio.on("sdr_data")
    async def handle_sdr_data_requests(sid, cmd, data=None):
        logger.info(f"Received SDR event from: {sid}, with cmd: {cmd}")
        reply = await sdr_data_request_routing(sio, cmd, data, logger, sid)
        return reply

    @sio.on("data_request")
    async def handle_frontend_data_requests(sid, cmd, data=None):
        logger.info(f"Received event from: {sid}, with cmd: {cmd}")
        reply = await dispatch_request(sio, cmd, data, logger, sid, handler_registry)
        return reply

    @sio.on("data_submission")
    async def handle_frontend_data_submissions(sid, cmd, data=None):
        logger.info(f"Received event from: {sid}, with cmd: {cmd}, and data: {data}")
        reply = await dispatch_request(sio, cmd, data, logger, sid, handler_registry)
        return reply

    @sio.on("file_browser")
    async def handle_file_browser_requests(sid, cmd, data=None):
        logger.info(f"Received file browser event from: {sid}, with cmd: {cmd}")
        # No callback - responses are emitted as events
        await filebrowser_request_routing(sio, cmd, data, logger, sid)

    @sio.on("service_control")
    async def handle_service_control_requests(sid, cmd, data=None):
        logger.info(
            f"Received service control event from: {sid}, with cmd: {cmd}, and data: {data}"
        )
        if cmd == "restart_service":
            logger.info(
                f"Service restart requested by client {sid} with IP {SESSIONS[sid]['REMOTE_ADDR']}"
            )

            def delayed_shutdown():
                """Shutdown after a small delay to allow response to be sent."""
                time.sleep(2)
                logger.info("Service restart requested via Socket.IO - initiating shutdown...")
                cleanup_everything()
                logger.info("Forcing container exit for restart...")
                os._exit(0)

            shutdown_thread = threading.Thread(target=delayed_shutdown)
            shutdown_thread.daemon = True
            shutdown_thread.start()

            return {
                "status": "success",
                "message": "Service restart initiated. All processes will be stopped and container will restart in 2 seconds.",
            }
        return {"status": "error", "message": "Unknown service control command"}

    return SESSIONS
