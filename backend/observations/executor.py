# Copyright (c) 2025 Efstratios Goudelis
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.

"""Observation execution service - handles lifecycle of scheduled observations."""

import asyncio
import traceback
from typing import Any, Dict, Optional

from common.logger import logger
from crud.hardware import fetch_sdr
from crud.scheduledobservations import fetch_scheduled_observations
from db import AsyncSessionLocal
from observations.constants import (
    STATUS_CANCELLED,
    STATUS_COMPLETED,
    STATUS_FAILED,
    STATUS_RUNNING,
    STATUS_SCHEDULED,
)
from observations.events import observation_sync
from observations.helpers import (
    log_execution_event,
    remove_scheduled_stop_job,
    update_observation_status,
)
from observations.tasks.decoderhandler import DecoderHandler
from observations.tasks.recorderhandler import RecorderHandler
from observations.tasks.trackerhandler import TrackerHandler
from observations.tasks.transcriptionhandler import TranscriptionHandler
from session.service import session_service
from session.tracker import session_tracker
from vfos.state import INTERNAL_VFO_NUMBER, VFOManager


class ObservationExecutor:
    """
    Executes scheduled observations by orchestrating SDR, VFO, decoder, and tracker components.

    This service is triggered by APScheduler at AOS (Acquisition of Signal) time,
    starts all necessary processes, and stops them at LOS (Loss of Signal) time.
    """

    def __init__(self, process_manager: Any, sio: Any):
        """
        Initialize the observation executor.

        Args:
            process_manager: ProcessManager instance for SDR/decoder lifecycle
            sio: Socket.IO server instance for event emission
        """
        self.process_manager = process_manager
        self.sio = sio
        self._vfo_manager = None

        # Initialize task handlers
        self.decoder_handler = DecoderHandler(process_manager)
        self.recorder_handler = RecorderHandler(process_manager)
        self.transcription_handler = TranscriptionHandler(process_manager)
        self.tracker_handler = TrackerHandler()

        # Track actively executing observations to prevent concurrent starts
        self._running_observations: set[str] = set()
        self._observations_lock: Optional[asyncio.Lock] = None  # Will be initialized lazily

    @property
    def vfo_manager(self):
        """Lazy-load VFOManager to avoid circular import issues."""
        if self._vfo_manager is None:
            from vfos.state import VFOManager

            self._vfo_manager = VFOManager()
        return self._vfo_manager

    def _get_observations_lock(self) -> asyncio.Lock:
        """Lazy-load asyncio.Lock to avoid event loop issues during initialization."""
        if self._observations_lock is None:
            self._observations_lock = asyncio.Lock()
        return self._observations_lock

    async def start_observation(self, observation_id: str) -> Dict[str, Any]:
        """
        Start an observation at AOS time.

        This method:
        1. Loads observation configuration from database
        2. Checks if SDR is available (logs warning if in use)
        3. Creates internal VFO session
        4. Starts SDR process
        5. Configures VFOs based on tasks
        6. Starts decoders, recorders, and trackers
        7. Updates observation status to RUNNING

        Args:
            observation_id: The observation ID to start

        Returns:
            Dictionary with success status and error message if failed
        """
        try:
            logger.info(f"Starting observation: {observation_id}")
            await log_execution_event(observation_id, "Start requested", "info")

            # Check if this observation is already running (prevent duplicate execution)
            lock = self._get_observations_lock()
            async with lock:
                if observation_id in self._running_observations:
                    error_msg = f"Observation {observation_id} is already executing"
                    logger.error(error_msg)
                    await log_execution_event(observation_id, error_msg, "error")
                    return {"success": False, "error": error_msg}

                # Mark as running immediately to prevent race condition
                self._running_observations.add(observation_id)
                logger.debug(f"Marked observation {observation_id} as executing")

            # 1. Load observation from database
            async with AsyncSessionLocal() as session:
                result = await fetch_scheduled_observations(session, observation_id)
                if not result["success"] or not result["data"]:
                    error_msg = f"Observation not found: {observation_id}"
                    logger.error(error_msg)
                    await log_execution_event(observation_id, error_msg, "error")
                    return {"success": False, "error": error_msg}

                observation = result["data"]

            # 2. Check if observation is enabled and scheduled
            if not observation.get("enabled", True):
                logger.warning(f"Observation {observation_id} is disabled, skipping")
                await log_execution_event(observation_id, "Observation is disabled", "warning")
                return {"success": False, "error": "Observation is disabled"}

            status = observation.get("status", "").lower()
            if status != STATUS_SCHEDULED:
                error_msg = f"Invalid status: {observation.get('status')}"
                logger.warning(
                    f"Observation {observation_id} has status {observation.get('status')}, skipping"
                )
                await log_execution_event(observation_id, error_msg, "warning")
                return {"success": False, "error": error_msg}

            # 3. Check if SDR is available (not in use by other sessions)
            sdr_config_dict = observation.get("sdr", {})
            sdr_id = sdr_config_dict.get("id")

            if not sdr_id:
                error_msg = f"Observation {observation_id} has no SDR configured"
                logger.error(error_msg)
                await log_execution_event(observation_id, error_msg, "error")
                await update_observation_status(self.sio, observation_id, STATUS_FAILED, error_msg)
                await remove_scheduled_stop_job(observation_id)
                return {"success": False, "error": error_msg}

            # Check if SDR is already in use - if so, we'll hijack it and reconfigure
            sessions_using_sdr = session_tracker.get_sessions_for_sdr(sdr_id)
            if sessions_using_sdr:
                msg = f"SDR '{sdr_id}' in use by {len(sessions_using_sdr)} session(s), will hijack"
                logger.info(msg)
                await log_execution_event(observation_id, msg, "info")
            else:
                logger.info(f"SDR {sdr_id} is available for observation {observation_id}")

            # 4. Execute observation task
            logger.info(f"Executing observation task for {observation['name']}")
            await log_execution_event(
                observation_id, f"Starting tasks for {observation['name']}", "info"
            )
            await self._execute_observation_task(observation_id, observation)

            # 5. Update observation status to RUNNING
            await update_observation_status(self.sio, observation_id, STATUS_RUNNING)
            await log_execution_event(observation_id, "All tasks started successfully", "info")

            logger.info(f"Observation {observation_id} started successfully")
            return {"success": True}

        except Exception as e:
            error_msg = f"Error starting observation {observation_id}: {e}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            await log_execution_event(observation_id, error_msg, "error")

            # Clean up running observation tracking
            self._running_observations.discard(observation_id)

            await update_observation_status(self.sio, observation_id, STATUS_FAILED, str(e))
            # Remove scheduled stop job on error
            await remove_scheduled_stop_job(observation_id)
            return {"success": False, "error": error_msg}

    async def stop_observation(self, observation_id: str) -> Dict[str, Any]:
        """
        Stop an observation at LOS time.

        This method:
        1. Stops SDR process (cascades to decoders/recorders)
        2. Stops tracker
        3. Cleans up internal VFO session
        4. Updates observation status to COMPLETED

        Args:
            observation_id: The observation ID to stop

        Returns:
            Dictionary with success status and error message if failed
        """
        stop_errors = []

        try:
            logger.info(f"Stopping observation: {observation_id}")
            await log_execution_event(observation_id, "Stop requested", "info")

            # 1. Load observation from database
            async with AsyncSessionLocal() as session:
                result = await fetch_scheduled_observations(session, observation_id)
                if not result["success"] or not result["data"]:
                    error_msg = f"Observation not found: {observation_id}"
                    logger.error(error_msg)
                    await log_execution_event(observation_id, error_msg, "error")
                    return {"success": False, "error": error_msg}

                observation = result["data"]

            # 2. Stop observation task - collect errors but continue
            try:
                await self._stop_observation_task(observation_id, observation)
                await log_execution_event(observation_id, "All tasks stopped", "info")
            except Exception as task_error:
                error_msg = f"Error stopping tasks: {task_error}"
                stop_errors.append(error_msg)
                logger.error(error_msg)
                logger.error(traceback.format_exc())
                await log_execution_event(observation_id, error_msg, "error")

            # 3. Determine final status based on errors
            if stop_errors:
                # Observation ran but cleanup had issues
                combined_errors = "; ".join(stop_errors)
                warning_msg = f"Completed with cleanup warnings: {combined_errors}"
                await update_observation_status(
                    self.sio, observation_id, STATUS_COMPLETED, warning_msg
                )
                await log_execution_event(observation_id, warning_msg, "warning")
                logger.warning(f"Observation {observation_id} completed but cleanup had issues")
            else:
                await update_observation_status(self.sio, observation_id, STATUS_COMPLETED)
                await log_execution_event(
                    observation_id, "Observation completed successfully", "info"
                )

            # 4. Remove from running observations tracking
            self._running_observations.discard(observation_id)

            logger.info(
                f"Observation {observation['name']} ({observation_id}) stopped successfully"
            )
            return {"success": len(stop_errors) == 0, "errors": stop_errors}

        except Exception as e:
            # Critical failure during stop
            error_msg = f"Critical error stopping observation {observation_id}: {e}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            await log_execution_event(observation_id, error_msg, "error")

            # Clean up running observation tracking even on error
            self._running_observations.discard(observation_id)

            # Mark observation as failed since stop encountered a critical error
            try:
                await update_observation_status(self.sio, observation_id, STATUS_FAILED, error_msg)
            except Exception as update_error:
                logger.error(f"Failed to update observation status to failed: {update_error}")

            return {"success": False, "error": error_msg}

    async def cancel_observation(self, observation_id: str) -> Dict[str, Any]:
        """
        Cancel a running or scheduled observation.

        This will:
        1. Stop the observation if it's currently running
        2. Remove all scheduled jobs (start/stop) from APScheduler
        3. Update status to CANCELLED

        Args:
            observation_id: The observation ID to cancel

        Returns:
            Dictionary with success status and error message if failed
        """
        try:
            logger.info(f"Cancelling observation: {observation_id}")

            # 1. Load observation from database
            async with AsyncSessionLocal() as session:
                result = await fetch_scheduled_observations(session, observation_id)
                if not result["success"] or not result["data"]:
                    error_msg = f"Observation not found: {observation_id}"
                    logger.error(error_msg)
                    return {"success": False, "error": error_msg}

                observation = result["data"]
                status = observation.get("status")

            # 2. Remove scheduled jobs from APScheduler
            if observation_sync:
                await observation_sync.remove_observation(observation_id)
                logger.info(f"Removed scheduled jobs for observation {observation_id}")

            # 3. If running, stop it
            if status == STATUS_RUNNING:
                await self._stop_observation_task(observation_id, observation)

            # 4. Update status to CANCELLED
            await update_observation_status(self.sio, observation_id, STATUS_CANCELLED)

            # 5. Remove from running observations tracking
            self._running_observations.discard(observation_id)

            logger.info(f"Observation {observation_id} cancelled successfully")
            return {"success": True}

        except Exception as e:
            error_msg = f"Error cancelling observation {observation_id}: {e}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            return {"success": False, "error": error_msg}

    # ============================================================================
    # TASK EXECUTION
    # ============================================================================

    async def _execute_observation_task(
        self, observation_id: str, observation: Dict[str, Any]
    ) -> None:
        """
        Execute the actual observation task at AOS time.

        This is where the real work happens:
        - Create internal VFO session via SessionService
        - Start SDR process with hardware_config
        - Configure VFOs per transmitter
        - Start decoders/recorders based on tasks array
        - Start rotator tracker if enabled

        Args:
            observation_id: The observation ID
            observation: The observation data dict
        """

        # Extract configuration
        satellite = observation.get("satellite", {})
        tasks = observation.get("tasks", [])

        logger.info(f"Starting observation for {satellite.get('name', 'unknown')}")
        logger.info(f"Observation ID: {observation_id}")
        logger.info(f"Tasks: {len(tasks)} configured")

        try:
            # 1. Extract SDR configuration and create session
            sdr_config_dict = observation.get("sdr", {})
            if not sdr_config_dict:
                raise ValueError("No SDR configuration found in observation data")

            sdr_id = sdr_config_dict.get("id")
            if not sdr_id:
                raise ValueError("SDR ID missing from configuration")

            # Fetch SDR device details from database to get correct type
            async with AsyncSessionLocal() as db_session:
                sdr_result = await fetch_sdr(db_session, sdr_id)
                if not sdr_result or not sdr_result.get("success"):
                    raise ValueError(f"SDR with ID {sdr_id} not found in database")

                sdr_device = sdr_result["data"]

            # Build SDR config dict (operational parameters)
            sdr_config = {
                "sdr_id": sdr_id,
                "center_freq": sdr_config_dict.get("center_frequency", 100000000),
                "sample_rate": sdr_config_dict.get("sample_rate", 2048000),
                "gain": sdr_config_dict.get("gain", 20),
                "ppm_error": sdr_config_dict.get("ppm_error", 0),
                "antenna": sdr_config_dict.get("antenna_port", "TX/RX"),  # B210 uses TX/RX or RX2
            }

            # 2. Register internal observation session (creates session, starts SDR)
            metadata = {
                "observation_id": observation_id,
                "satellite_name": satellite.get("name"),
                "norad_id": satellite.get("norad_id"),
            }
            session_id = await session_service.register_internal_observation(
                observation_id=observation_id,
                sdr_device=sdr_device,
                sdr_config=sdr_config,
                vfo_number=1,  # Register with VFO 1 initially
                metadata=metadata,
            )

            logger.info(f"Internal session created: {session_id}")

            # 3. Process tasks
            vfo_counter = 1  # Counter for assigning VFO numbers to VFO-based tasks

            for task_index, task in enumerate(tasks, start=1):
                task_type = task.get("type")
                task_config = task.get("config", {})

                if task_type in {"decoder", "audio_recording", "transcription"}:
                    # Assign VFO number for this task (1-VFO_NUMBER)
                    if vfo_counter > INTERNAL_VFO_NUMBER:
                        logger.warning(
                            f"Maximum of {INTERNAL_VFO_NUMBER} VFOs supported, skipping additional tasks in observation {observation_id}"
                        )
                        continue
                    vfo_number = vfo_counter
                    vfo_counter += 1  # Increment for next VFO task
                    task_config["vfo_number"] = vfo_number

                if task_type == "decoder":
                    vfo_number = task_config.get("vfo_number")

                    await self.decoder_handler.start_decoder_task(
                        observation_id, session_id, sdr_id, sdr_config, task_config, vfo_number
                    )

                elif task_type == "iq_recording":
                    recorder_id = f"{session_id}:iq:{task_index}"
                    await self.recorder_handler.start_iq_recording_task(
                        observation_id,
                        session_id,
                        sdr_id,
                        satellite,
                        task_config,
                        recorder_id=recorder_id,
                    )

                elif task_type == "audio_recording":
                    vfo_number = task_config.get("vfo_number")
                    await self.recorder_handler.start_audio_recording_task(
                        observation_id, session_id, sdr_id, sdr_config, satellite, task_config
                    )

                elif task_type == "transcription":
                    vfo_number = task_config.get("vfo_number")
                    await self.transcription_handler.start_transcription_task(
                        observation_id, session_id, sdr_id, sdr_config, satellite, task_config
                    )

            # 4. Start rotator tracker if enabled
            rotator_config = observation.get("rotator", {})
            await self.tracker_handler.start_tracker_task(
                observation_id, satellite, rotator_config, tasks
            )

            logger.info(f"Observation {observation_id} started successfully")

        except Exception as e:
            logger.error(f"Failed to start observation {observation_id}: {e}")
            logger.error(traceback.format_exc())
            raise

    async def _stop_observation_task(
        self, observation_id: str, observation: Dict[str, Any]
    ) -> None:
        """
        Stop the observation task at LOS time.

        This is where cleanup happens:
        - Stop SDR process (cascades to all consumers)
        - Stop tracker
        - Cleanup internal VFO session via SessionService

        Args:
            observation_id: The observation ID
            observation: The observation data dict
        """
        satellite = observation.get("satellite", {})

        logger.info(f"Stopping observation for {satellite.get('name', 'unknown')}")
        logger.info(f"Observation ID: {observation_id}")

        try:
            # 1. Don't stop tracker - leave rotator connected for manual control or next observation
            await self.tracker_handler.stop_tracker_task(observation_id)

            # 2. Stop decoders explicitly before cleaning up session
            session_id = VFOManager.make_internal_session_id(observation_id)

            # Get SDR ID from session tracker
            sdr_id = session_tracker.get_session_sdr(session_id)

            if sdr_id:
                # Stop all decoders and recorders for this observation
                tasks = observation.get("tasks", [])
                has_decoder_task = any(task.get("type") == "decoder" for task in tasks)
                has_audio_task = any(task.get("type") == "audio_recording" for task in tasks)
                has_transcription_task = any(task.get("type") == "transcription" for task in tasks)
                has_iq_task = any(task.get("type") == "iq_recording" for task in tasks)

                vfo_manager = VFOManager()
                active_vfos = vfo_manager.get_active_vfos(session_id)
                vfo_numbers = [vfo.vfo_number for vfo in active_vfos]
                if not vfo_numbers:
                    vfo_numbers = list(range(1, INTERNAL_VFO_NUMBER + 1))

                for vfo_number in vfo_numbers:
                    if has_decoder_task:
                        self.decoder_handler.stop_decoder_task(sdr_id, session_id, vfo_number)
                    if has_audio_task:
                        self.recorder_handler.stop_audio_recording_task(
                            sdr_id, session_id, vfo_number
                        )
                    if has_transcription_task:
                        self.transcription_handler.stop_transcription_task(
                            sdr_id, session_id, vfo_number
                        )

                if has_iq_task:
                    stopped_count = (
                        self.process_manager.recorder_manager.stop_all_recorders_for_session(
                            sdr_id, session_id
                        )
                    )
                    if stopped_count == 0:
                        self.recorder_handler.stop_iq_recording_task(sdr_id, session_id)

            # 3. Cleanup internal observation session
            await session_service.cleanup_internal_observation(observation_id)

            # 4. Cleanup VFO state
            vfo_manager = VFOManager()
            vfo_manager.cleanup_internal_vfos(observation_id)

            logger.info(
                f"Observation task {observation_id} cleaned up (decoders stopped, session unregistered, VFOs cleaned)"
            )

        except Exception as e:
            logger.error(f"Failed to stop observation {observation_id}: {e}")
            logger.error(traceback.format_exc())
            raise
