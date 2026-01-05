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
from crud.scheduledobservations import fetch_scheduled_observations
from db import AsyncSessionLocal
from observations.constants import (
    STATUS_CANCELLED,
    STATUS_COMPLETED,
    STATUS_FAILED,
    STATUS_RUNNING,
    STATUS_SCHEDULED,
)


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
        # VFOManager will be imported when needed to avoid circular imports
        self._vfo_manager = None

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
        2. Creates internal VFO session
        3. Starts SDR process
        4. Configures VFOs based on tasks
        5. Starts decoders, recorders, and trackers
        6. Updates observation status to RUNNING

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

            # 3. Execute placeholder observation task
            logger.info(f"Executing observation task for {observation['name']}")
            await self._execute_observation_task(observation_id, observation)

            # 4. Update observation status to RUNNING
            await self._update_observation_status(observation_id, STATUS_RUNNING)

            logger.info(f"Observation {observation_id} started successfully")
            return {"success": True}

        except Exception as e:
            error_msg = f"Error starting observation {observation_id}: {e}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            await self._update_observation_status(observation_id, STATUS_FAILED, str(e))
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
            logger.info(f"Stopping observation task for {observation['name']}")
            await self._stop_observation_task(observation_id, observation)

            # 3. Update observation status to COMPLETED
            await self._update_observation_status(observation_id, STATUS_COMPLETED)

            logger.info(f"Observation {observation_id} stopped successfully")
            return {"success": True}

        except Exception as e:
            error_msg = f"Error stopping observation {observation_id}: {e}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            return {"success": False, "error": error_msg}

    async def cancel_observation(self, observation_id: str) -> Dict[str, Any]:
        """
        Cancel a running or scheduled observation.

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

            # 2. If running, stop it
            if status == STATUS_RUNNING:
                await self._stop_observation_task(observation_id, observation)

            # 3. Update status to CANCELLED
            await self._update_observation_status(observation_id, STATUS_CANCELLED)

            logger.info(f"Observation {observation_id} cancelled successfully")
            return {"success": True}

        except Exception as e:
            error_msg = f"Error cancelling observation {observation_id}: {e}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            return {"success": False, "error": error_msg}

    # ============================================================================
    # PLACEHOLDER TASK EXECUTION
    # ============================================================================

    async def _execute_observation_task(
        self, observation_id: str, observation: Dict[str, Any]
    ) -> None:
        """
        PLACEHOLDER: Execute the actual observation task.

        This is where the real work happens:
        - Create internal VFO session
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
        hardware_config = observation.get("hardware_config", {})
        tasks = observation.get("tasks", [])
        pass_info = observation.get("pass", {})

        logger.info(f"[PLACEHOLDER] Executing observation for {satellite.get('name')}")
        logger.info(f"[PLACEHOLDER] Satellite: {satellite}")
        logger.info(f"[PLACEHOLDER] Hardware config: {hardware_config}")
        logger.info(f"[PLACEHOLDER] Pass info: {pass_info}")
        logger.info(f"[PLACEHOLDER] Tasks ({len(tasks)}): {tasks}")

        # TODO: Implement actual task execution:
        # 1. Create internal VFO session
        #    session_id = self.vfo_manager.create_internal_vfos(observation_id)
        #
        # 2. Start SDR process
        #    sdr_config = hardware_config.get("sdr", {})
        #    await self.process_manager.start_sdr_process(
        #        sdr_id=sdr_config.get("id"),
        #        session_id=session_id,
        #        center_freq=sdr_config.get("center_frequency"),
        #        sample_rate=sdr_config.get("sample_rate"),
        #        gain=sdr_config.get("gain")
        #    )
        #
        # 3. Configure VFOs and start tasks
        #    for task in tasks:
        #        if task["type"] == "decoder":
        #            config = task["config"]
        #            self.vfo_manager.configure_internal_vfo(
        #                observation_id=observation_id,
        #                vfo_number=1,  # Extract from task
        #                center_freq=...,
        #                modulation=...,
        #                decoder=config["decoder_type"],
        #                locked_transmitter_id=config["transmitter_id"]
        #            )
        #            await self.process_manager.decoder_manager.start_decoder(...)
        #
        #        elif task["type"] == "audio_recording":
        #            await self.process_manager.audio_recorder_manager.start_audio_recorder(...)
        #
        #        elif task["type"] == "iq_recording":
        #            await self.process_manager.recorder_manager.start_recorder(...)
        #
        #        elif task["type"] == "transcription":
        #            await self.process_manager.transcription_manager.start_transcription(...)
        #
        # 4. Start rotator tracker if enabled
        #    rotator_config = hardware_config.get("rotator", {})
        #    if rotator_config.get("tracking_enabled"):
        #        await start_tracker_for_observation(observation_id, satellite, rotator_config)

        # Simulate task execution
        await asyncio.sleep(0.1)

        logger.info(f"[PLACEHOLDER] Observation task started for {observation_id}")

    async def _stop_observation_task(
        self, observation_id: str, observation: Dict[str, Any]
    ) -> None:
        """
        PLACEHOLDER: Stop the observation task.

        This is where cleanup happens:
        - Stop SDR process (cascades to all consumers)
        - Stop tracker
        - Cleanup internal VFO session

        Args:
            observation_id: The observation ID
            observation: The observation data dict
        """
        logger.info(f"[PLACEHOLDER] Stopping observation task for {observation_id}")

        # TODO: Implement actual task stopping:
        # 1. Stop SDR process (cascades cleanup)
        #    session_id = self.vfo_manager.make_internal_session_id(observation_id)
        #    await self.process_manager.stop_sdr_process(sdr_id, session_id)
        #
        # 2. Stop tracker
        #    await stop_tracker_for_observation(observation_id)
        #
        # 3. Cleanup internal VFOs
        #    self.vfo_manager.cleanup_internal_vfos(observation_id)

        # Simulate cleanup
        await asyncio.sleep(0.1)

        logger.info(f"[PLACEHOLDER] Observation task stopped for {observation_id}")

    # ============================================================================
    # HELPER METHODS
    # ============================================================================

    async def _update_observation_status(
        self, observation_id: str, status: str, error_message: Optional[str] = None
    ) -> None:
        """
        Update observation status in database.

        Args:
            observation_id: The observation ID
            status: New status (RUNNING, COMPLETED, FAILED, CANCELLED)
            error_message: Optional error message for FAILED status
        """
        try:
            from crud.scheduledobservations import update_scheduled_observation_status

            async with AsyncSessionLocal() as session:
                result = await update_scheduled_observation_status(
                    session, observation_id, status, error_message
                )
                if not result["success"]:
                    logger.error(f"Failed to update observation status: {result.get('error')}")

            # Emit event to notify clients
            if self.sio:
                await self.sio.emit(
                    "observation-status-update",
                    {"id": observation_id, "status": status, "error": error_message},
                )

        except Exception as e:
            logger.error(f"Error updating observation status: {e}")
            logger.error(traceback.format_exc())
