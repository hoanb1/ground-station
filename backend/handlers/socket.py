import os
import threading
import time
from typing import Dict

from common.logger import logger
from handlers import (
    data_request_routing,
    data_submission_routing,
    filebrowser_request_routing,
    sdr_data_request_routing,
)
from sdr.utils import cleanup_sdr_session
from server.shutdown import cleanup_everything

# hold a list of sessions
SESSIONS: Dict[str, Dict] = {}


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
        await cleanup_sdr_session(sid)

    @sio.on("sdr_data")
    async def handle_sdr_data_requests(sid, cmd, data=None):
        logger.info(f"Received SDR event from: {sid}, with cmd: {cmd}")
        reply = await sdr_data_request_routing(sio, cmd, data, logger, sid)
        return reply

    @sio.on("data_request")
    async def handle_frontend_data_requests(sid, cmd, data=None):
        logger.info(f"Received event from: {sid}, with cmd: {cmd}")
        reply = await data_request_routing(sio, cmd, data, logger, sid)
        return reply

    @sio.on("data_submission")
    async def handle_frontend_data_submissions(sid, cmd, data=None):
        logger.info(f"Received event from: {sid}, with cmd: {cmd}, and data: {data}")
        reply = await data_submission_routing(sio, cmd, data, logger, sid)
        return reply

    @sio.on("file_browser")
    async def handle_file_browser_requests(sid, cmd, data=None):
        logger.info(f"Received file browser event from: {sid}, with cmd: {cmd}")
        reply = await filebrowser_request_routing(sio, cmd, data, logger, sid)
        return reply

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
