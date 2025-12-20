import asyncio
import os
from typing import Optional

from audio.audiobroadcaster import AudioBroadcaster
from audio.audiostreamer import WebAudioStreamer
from common.logger import logger
from session.service import session_service

# Globals used by audio threads
audio_consumer: Optional[WebAudioStreamer] = None
audio_broadcaster: Optional[AudioBroadcaster] = None


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
        from processing.utils import active_sdr_clients

        if active_sdr_clients:
            logger.info(f"Cleaning up {len(active_sdr_clients)} SDR sessions...")
            session_ids = list(active_sdr_clients.keys())
            for sid in session_ids:
                try:
                    event_loop = asyncio.get_event_loop()
                    if event_loop.is_running():
                        asyncio.create_task(session_service.cleanup_session(sid))
                    else:
                        event_loop.run_until_complete(session_service.cleanup_session(sid))
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
        if audio_broadcaster:
            audio_broadcaster.stop()
    except Exception as e:  # pragma: no cover
        logger.warning(f"Error stopping audio: {e}")

    # Stop all transcription consumers (per-VFO)
    try:
        from server import process_manager

        if process_manager and process_manager.transcription_manager:
            # Stop all transcription consumers across all SDRs and sessions
            for sdr_id in list(process_manager.processes.keys()):
                process_info = process_manager.processes.get(sdr_id, {})
                transcription_consumers = process_info.get("transcription_consumers", {})
                for session_id in list(transcription_consumers.keys()):
                    process_manager.transcription_manager.stop_transcription(sdr_id, session_id)
            logger.info("All transcription consumers stopped")
    except Exception as e:  # pragma: no cover
        logger.warning(f"Error stopping transcription consumers: {e}")

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
