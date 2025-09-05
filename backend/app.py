"""Entry point for Ground Station backend."""
import os
import signal
import sys
import asyncio
import multiprocessing
import threading

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import uvicorn

from common.arguments import arguments
from common.logger import get_logger_config, logger
from shutdown import cleanup_everything, signal_handler
from server import app, socket_app, sio, init_db
from socket_handlers import register_socketio_handlers
from webrtc import register_webrtc_routes

# Set process and thread names
def configure_process_names():
    try:
        import setproctitle
        setproctitle.setproctitle("Ground Station - Main Thread")
    except ImportError:  # pragma: no cover - optional dependency
        pass
    multiprocessing.current_process().name = "Ground Station - Main"
    threading.current_thread().name = "Ground Station - Main Thread"


def main() -> None:
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    configure_process_names()

    register_webrtc_routes(app)
    register_socketio_handlers(sio)

    logger.info("Configuring database connection...")
    loop = asyncio.get_event_loop()
    loop.run_until_complete(init_db())

    logger.info(f'Starting Ground Station server with parameters {arguments}')
    try:
        uvicorn.run(
            socket_app,
            host=arguments.host,
            port=arguments.port,
            log_config=get_logger_config(arguments),
        )
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt in main")
        cleanup_everything()
        os._exit(0)
    except Exception as e:  # pragma: no cover - startup errors
        logger.error(f"Error starting Ground Station server: {str(e)}")
        logger.exception(e)
        cleanup_everything()
        os._exit(1)


if __name__ == "__main__":
    main()
