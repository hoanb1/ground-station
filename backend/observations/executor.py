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

import traceback
from typing import Any, Dict

from common.logger import logger
from crud.scheduledobservations import fetch_scheduled_observations
from db import AsyncSessionLocal
from observations.constants import (
    STATUS_CANCELLED,
    STATUS_COMPLETED,
    STATUS_FAILED,
    STATUS_RUNNING,
    STATUS_SCHEDULED,
)
from observations.helpers import remove_scheduled_stop_job, update_observation_status
from observations.tasks.decoderhandler import DecoderHandler
from observations.tasks.recorderhandler import RecorderHandler
from observations.tasks.trackerhandler import TrackerHandler
from observations.tasks.transcriptionhandler import TranscriptionHandler
from session.service import session_service
from session.tracker import session_tracker
from vfos.state import VFOManager


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

    @property
    def vfo_manager(self):
        """Lazy-load VFOManager to avoid circular import issues."""
        if self._vfo_manager is None:
            from vfos.state import VFOManager

            self._vfo_manager = VFOManager()
        return self._vfo_manager

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

            # 1. Load observation from database
            async with AsyncSessionLocal() as session:
                result = await fetch_scheduled_observations(session, observation_id)
                if not result["success"] or not result["data"]:
                    error_msg = f"Observation not found: {observation_id}"
                    logger.error(error_msg)
                    return {"success": False, "error": error_msg}

                observation = result["data"]

            # 2. Check if observation is enabled and scheduled
            if not observation.get("enabled", True):
                logger.warning(f"Observation {observation_id} is disabled, skipping")
                return {"success": False, "error": "Observation is disabled"}

            status = observation.get("status", "").lower()
            if status != STATUS_SCHEDULED:
                logger.warning(
                    f"Observation {observation_id} has status {observation.get('status')}, skipping"
                )
                return {"success": False, "error": f"Invalid status: {observation.get('status')}"}

            # 3. Check if SDR is available (not in use by other sessions)
            sdr_config_dict = observation.get("sdr", {})
            sdr_id = sdr_config_dict.get("id")

            if not sdr_id:
                error_msg = f"Observation {observation_id} has no SDR configured"
                logger.error(error_msg)
                await update_observation_status(self.sio, observation_id, STATUS_FAILED, error_msg)
                await remove_scheduled_stop_job(observation_id)
                return {"success": False, "error": error_msg}

            # Check if SDR is already in use - if so, we'll hijack it and reconfigure
            from session.tracker import session_tracker

            sessions_using_sdr = session_tracker.get_sessions_for_sdr(sdr_id)
            if sessions_using_sdr:
                logger.info(
                    f"SDR '{sdr_id}' is currently in use by {len(sessions_using_sdr)} session(s) {list(sessions_using_sdr)}. "
                    f"Observation {observation_id} ({observation.get('name')}) will hijack the SDR and reconfigure it."
                )
            else:
                logger.info(f"SDR {sdr_id} is available for observation {observation_id}")

            # 4. Execute placeholder observation task
            logger.info(f"Executing observation task for {observation['name']}")
            await self._execute_observation_task(observation_id, observation)

            # 5. Update observation status to RUNNING
            await update_observation_status(self.sio, observation_id, STATUS_RUNNING)

            logger.info(f"Observation {observation_id} started successfully")
            return {"success": True}

        except Exception as e:
            error_msg = f"Error starting observation {observation_id}: {e}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
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
        try:
            logger.info(f"Stopping observation: {observation_id}")

            # 1. Load observation from database
            async with AsyncSessionLocal() as session:
                result = await fetch_scheduled_observations(session, observation_id)
                if not result["success"] or not result["data"]:
                    error_msg = f"Observation not found: {observation_id}"
                    logger.error(error_msg)
                    return {"success": False, "error": error_msg}

                observation = result["data"]

            # 2. Stop placeholder observation task
            await self._stop_observation_task(observation_id, observation)

            # 3. Update observation status to COMPLETED
            await update_observation_status(self.sio, observation_id, STATUS_COMPLETED)

            logger.info(
                f"Observation {observation['name']} ({observation_id}) stopped successfully"
            )
            return {"success": True}

        except Exception as e:
            error_msg = f"Error stopping observation {observation_id}: {e}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())

            # Mark observation as failed since stop encountered an error
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
            from observations.events import observation_sync

            if observation_sync:
                await observation_sync.remove_observation(observation_id)
                logger.info(f"Removed scheduled jobs for observation {observation_id}")

            # 3. If running, stop it
            if status == STATUS_RUNNING:
                await self._stop_observation_task(observation_id, observation)

            # 4. Update status to CANCELLED
            await update_observation_status(self.sio, observation_id, STATUS_CANCELLED)

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
            from crud.hardware import fetch_sdr

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
            vfo_counter = 1  # Counter for assigning VFO numbers to decoders

            for task in tasks:
                task_type = task.get("type")
                task_config = task.get("config", {})

                if task_type == "decoder":
                    # Assign VFO number for this decoder (1-4)
                    vfo_number = vfo_counter
                    if vfo_counter >= 4:
                        logger.warning(
                            f"Maximum of 4 VFOs supported, skipping additional decoders in observation {observation_id}"
                        )
                        continue
                    vfo_counter += 1  # Increment for next decoder

                    await self.decoder_handler.start_decoder_task(
                        observation_id, session_id, sdr_id, sdr_config, task_config, vfo_number
                    )

                elif task_type == "iq_recording":
                    await self.recorder_handler.start_iq_recording_task(
                        observation_id, session_id, sdr_id, satellite
                    )

                elif task_type == "audio_recording":
                    await self.recorder_handler.start_audio_recording_task(
                        observation_id, session_id, sdr_id, sdr_config, satellite, task_config
                    )

                elif task_type == "transcription":
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
                vfo_counter = 1
                for task in tasks:
                    task_type = task.get("type")
                    task_config = task.get("config", {})

                    if task_type == "decoder":
                        vfo_number = vfo_counter
                        vfo_counter += 1
                        self.decoder_handler.stop_decoder_task(sdr_id, session_id, vfo_number)

                    elif task_type == "iq_recording":
                        self.recorder_handler.stop_iq_recording_task(sdr_id, session_id)

                    elif task_type == "audio_recording":
                        audio_vfo_number = task_config.get("vfo_number", 1)
                        self.recorder_handler.stop_audio_recording_task(
                            sdr_id, session_id, audio_vfo_number
                        )

                    elif task_type == "transcription":
                        transcription_vfo_number = task_config.get("vfo_number", 1)
                        self.transcription_handler.stop_transcription_task(
                            sdr_id, session_id, transcription_vfo_number
                        )

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
