import asyncio
import multiprocessing
import os
import signal
import sys
import threading

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import uvicorn  # noqa: E402

from common.arguments import arguments  # noqa: E402
from common.logger import get_logger_config, logger  # noqa: E402
from handlers.socket import register_socketio_handlers  # noqa: E402
from server.shmmonitor import start_cleanup_thread  # noqa: E402
from server.shutdown import cleanup_everything, signal_handler  # noqa: E402
from server.startup import app, init_db, sio, socket_app  # noqa: E402
from video.webrtc import register_webrtc_routes  # noqa: E402


def print_banner():
    """Print ASCII art banner with version."""
    print(
        """
   ██████╗ ██████╗  ██████╗ ██╗   ██╗███╗   ██╗██████╗
  ██╔════╝ ██╔══██╗██╔═══██╗██║   ██║████╗  ██║██╔══██╗
  ██║  ███╗██████╔╝██║   ██║██║   ██║██╔██╗ ██║██║  ██║
  ██║   ██║██╔══██╗██║   ██║██║   ██║██║╚██╗██║██║  ██║
  ╚██████╔╝██║  ██║╚██████╔╝╚██████╔╝██║ ╚████║██████╔╝
   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═════╝

  ███████╗████████╗ █████╗ ████████╗██╗ ██████╗ ███╗   ██╗
  ██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║
  ███████╗   ██║   ███████║   ██║   ██║██║   ██║██╔██╗ ██║
  ╚════██║   ██║   ██╔══██║   ██║   ██║██║   ██║██║╚██╗██║
  ███████║   ██║   ██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║
  ╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝

                            v0.1.77
    """
    )


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
    print_banner()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    configure_process_names()

    # Start shared memory monitor thread (for GNU Radio segment tracking)
    logger.info("Starting shared memory monitor thread...")
    start_cleanup_thread(monitor_interval=30)

    # Register other routes
    register_webrtc_routes(app)
    register_socketio_handlers(sio)

    logger.info("Configuring database connection...")
    # Use asyncio.run to create/manage a temporary event loop (Python 3.12+ friendly)
    asyncio.run(init_db())

    # Note: Static files and API routes are already configured in startup.py

    logger.info(f"Starting Ground Station server with parameters {arguments}")
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
