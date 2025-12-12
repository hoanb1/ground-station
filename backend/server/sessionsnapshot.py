"""
Background task to ensure the session runtime snapshot emitter is running.

Follows the same startup task pattern as other background emitters:
- Expose a single `start_session_runtime_emitter(sio, background_tasks)` function
  that registers an asyncio.Task into the provided `background_tasks` set.

This task does not itself emit snapshots. Instead, it ensures the
ProcessManager's internal snapshot emission loop is started (and keeps
checking periodically). The actual emission cadence and payload are
handled by ProcessManager, which publishes the `session-runtime-snapshot`
event every ~3 seconds when running.
"""

import asyncio
import os
from typing import Set

from common.logger import logger
from processing.processmanager import process_manager


def start_session_runtime_emitter(sio, background_tasks: Set[asyncio.Task]) -> asyncio.Task:
    """Start a lightweight supervisor loop that (re)starts the snapshot emitter.

    This mirrors the pattern in server/systeminfo.py: it registers a background
    task in the shared `background_tasks` set so it can be cancelled during
    FastAPI lifespan shutdown.
    """

    async def _ensure_snapshot_emitter_loop():
        # Allow overriding check interval via env if desired; default every 3s
        interval = float(os.environ.get("SESSION_RUNTIME_POLL_INTERVAL_SECONDS", 3.0))

        while True:
            try:
                # Make sure ProcessManager knows about the Socket.IO server
                try:
                    process_manager.set_sio(sio)
                except Exception:
                    logger.debug("ProcessManager.set_sio failed in session emitter", exc_info=True)

                # Start (idempotent) the session snapshot emission loop
                try:
                    process_manager.start_session_snapshot_emission()
                except Exception:
                    logger.debug(
                        "Could not start session snapshot emission (will retry)",
                        exc_info=True,
                    )

                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Session runtime emitter supervisor error: {e}")
                await asyncio.sleep(interval)

    task = asyncio.create_task(_ensure_snapshot_emitter_loop())
    background_tasks.add(task)
    logger.info("Session runtime emitter supervisor task started")
    return task
