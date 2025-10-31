import asyncio
import os
from typing import Optional

from audio.audioconsumer import WebAudioConsumer
from common.logger import logger
from sdr.utils import cleanup_sdr_session

# Globals used by audio threads
audio_consumer: Optional[WebAudioConsumer] = None


def cleanup_everything():
    """Cleanup function to stop all processes and threads."""
    logger.info("Cleaning up all processes and threads...")

    # Terminate tracker process
    try:
        from tracker.runner import tracker_process

        if tracker_process and tracker_process.is_alive():
            logger.info(f"Killing tracker process PID: {tracker_process.pid}")
            tracker_process.kill()
            logger.info("Tracker killed")
    except Exception as e:  # pragma: no cover - best effort cleanup
        logger.info(f"Error killing tracker: {e}")

    # Clean up all SDR sessions
    try:
        from sdr.utils import active_sdr_clients

        if active_sdr_clients:
            logger.info(f"Cleaning up {len(active_sdr_clients)} SDR sessions...")
            session_ids = list(active_sdr_clients.keys())
            for sid in session_ids:
                try:
                    event_loop = asyncio.get_event_loop()
                    if event_loop.is_running():
                        asyncio.create_task(cleanup_sdr_session(sid))
                    else:
                        event_loop.run_until_complete(cleanup_sdr_session(sid))
                    logger.info(f"Cleaned up SDR session: {sid}")
                except Exception as e:  # pragma: no cover - best effort cleanup
                    logger.warning(f"Error cleaning up SDR session {sid}: {e}")
            logger.info("All SDR sessions cleaned up")
    except Exception as e:  # pragma: no cover
        logger.warning(f"Error during SDR sessions cleanup: {e}")

    # Stop audio threads
    try:
        if audio_consumer:
            audio_consumer.stop()
    except Exception as e:  # pragma: no cover
        logger.warning(f"Error stopping audio: {e}")

    logger.info("Cleanup complete")


def signal_handler(signum, frame):
    """Handle SIGINT and SIGTERM signals."""
    logger.info(f"\nReceived signal {signum}, initiating shutdown...")
    cleanup_everything()
    logger.info("Forcing exit...")
    os._exit(0)


def stop_tracker():
    """Simple function to kill the tracker process."""
    try:
        from tracker.runner import tracker_process

        if tracker_process and tracker_process.is_alive():
            tracker_process.kill()
    except Exception:  # pragma: no cover - best effort cleanup
        pass
