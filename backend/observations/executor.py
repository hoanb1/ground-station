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

            # Mark observation as failed since stop encountered an error
            try:
                await self._update_observation_status(observation_id, STATUS_FAILED, error_msg)
            except Exception as update_error:
                logger.error(f"Failed to update observation status to failed: {update_error}")

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
        from session.service import session_service
        from vfos.state import VFOManager

        # Extract configuration
        # Note: CRUD layer flattens hardware_config to top-level keys (sdr, rotator, rig)
        satellite = observation.get("satellite", {})
        tasks = observation.get("tasks", [])
        # pass_info = observation.get("pass", {})

        logger.info(f"Starting observation for {satellite.get('name', 'unknown')}")
        logger.info(f"Observation ID: {observation_id}")
        logger.info(f"Tasks: {len(tasks)} configured")

        try:
            # 1. Extract SDR configuration (at top level, not nested in hardware_config)
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
            # Use values from observation's sdr config, which includes antenna_port and other settings
            sdr_config = {
                "sdr_id": sdr_id,
                "center_frequency": sdr_config_dict.get("center_frequency", 100000000),
                "sample_rate": sdr_config_dict.get("sample_rate", 2048000),
                "gain": sdr_config_dict.get("gain", 20),
                "ppm_error": sdr_config_dict.get("ppm_error", 0),
                "antenna": sdr_config_dict.get("antenna_port", "TX/RX"),  # B210 uses TX/RX or RX2
            }

            # 2. Register internal observation session (creates session, starts SDR)
            vfo_number = 1  # Default to VFO 1 for automated observations
            metadata = {
                "observation_id": observation_id,
                "satellite_name": satellite.get("name"),
                "norad_id": satellite.get("norad_id"),
            }

            session_id = await session_service.register_internal_observation(
                observation_id=observation_id,
                sdr_device=sdr_device,
                sdr_config=sdr_config,
                vfo_number=vfo_number,
                metadata=metadata,
            )

            logger.info(f"Internal session created: {session_id}")

            # 3. Configure VFOs and start tasks
            vfo_manager = VFOManager()

            for task in tasks:
                task_type = task.get("type")
                task_config = task.get("config", {})

                if task_type == "decoder":
                    # Configure VFO for decoder
                    transmitter_id = task_config.get("transmitter_id", "none")
                    decoder_type = task_config.get("decoder_type", "none")

                    # Get transmitter details to extract frequency/modulation
                    # For now, use defaults - TODO: fetch from transmitter config
                    center_freq = task_config.get("frequency", sdr_config["center_frequency"])
                    modulation = task_config.get("modulation", "FM")
                    bandwidth = task_config.get("bandwidth", 40000)

                    vfo_manager.configure_internal_vfo(
                        observation_id=observation_id,
                        vfo_number=vfo_number,
                        center_freq=center_freq,
                        bandwidth=bandwidth,
                        modulation=modulation,
                        decoder=decoder_type,
                        locked_transmitter_id=transmitter_id,
                    )

                    logger.info(
                        f"Configured VFO {vfo_number} for {decoder_type} decoder on {transmitter_id}"
                    )

                    # TODO: Start decoder process
                    # decoder_class = get_decoder_class(decoder_type)
                    # self.process_manager.decoder_manager.start_decoder(
                    #     sdr_id, session_id, decoder_class, data_queue, **task_config
                    # )

                elif task_type == "iq_recording":
                    # TODO: Start IQ recorder
                    # from processing.iqrecorder import IQRecorder
                    # self.process_manager.recorder_manager.start_recorder(
                    #     sdr_id, session_id, IQRecorder, **task_config
                    # )
                    logger.info("IQ recording task configured (not yet started)")

                elif task_type == "audio_recording":
                    # TODO: Start audio recorder
                    # from processing.audiorecorder import AudioRecorder
                    # self.process_manager.audio_recorder_manager.start_audio_recorder(
                    #     sdr_id, session_id, vfo_number, AudioRecorder, **task_config
                    # )
                    logger.info("Audio recording task configured (not yet started)")

                elif task_type == "transcription":
                    # TODO: Start transcription
                    # self.process_manager.transcription_manager.start_transcription(
                    #     sdr_id, session_id, vfo_number, **task_config
                    # )
                    logger.info("Transcription task configured (not yet started)")

            # 4. Start rotator tracker if enabled
            rotator_config = observation.get("rotator", {})
            if rotator_config.get("tracking_enabled") and rotator_config.get("id"):
                from crud.tracking_state import set_tracking_state

                # Extract transmitter ID from decoder tasks (if any)
                transmitter_id = "none"
                for task in tasks:
                    if task.get("type") == "decoder":
                        transmitter_id = task.get("config", {}).get("transmitter_id", "none")
                        break

                # Update tracking state to target this satellite
                tracking_update = {
                    "name": "satellite-tracking",
                    "value": {
                        "norad_id": satellite.get("norad_id"),
                        "group_id": satellite.get("group_id"),
                        "rotator_state": "tracking",  # Start tracking satellite
                        "rotator_id": rotator_config.get("id"),
                        "rig_state": "disconnected",  # Observations don't use rig for now
                        "rig_id": "none",
                        "transmitter_id": transmitter_id,
                        "rig_vfo": "none",
                        "vfo1": "uplink",
                        "vfo2": "downlink",
                    },
                }

                async with AsyncSessionLocal() as db_session:
                    await set_tracking_state(db_session, tracking_update)

                logger.info(
                    f"Started tracking {satellite.get('name')} (NORAD {satellite.get('norad_id')}) "
                    f"for observation {observation_id}"
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
        from session.service import session_service
        from vfos.state import VFOManager

        # Note: CRUD layer flattens hardware_config to top-level keys (sdr, rotator, rig)
        satellite = observation.get("satellite", {})

        logger.info(f"Stopping observation for {satellite.get('name', 'unknown')}")
        logger.info(f"Observation ID: {observation_id}")

        try:
            # 1. Stop tracker if it was enabled
            rotator_config = observation.get("rotator", {})
            if rotator_config.get("tracking_enabled") and rotator_config.get("id"):
                from crud.tracking_state import set_tracking_state

                # Stop tracking by setting state to disconnected
                tracking_update = {
                    "name": "satellite-tracking",
                    "value": {
                        "rotator_state": "disconnected",
                    },
                }

                async with AsyncSessionLocal() as db_session:
                    await set_tracking_state(db_session, tracking_update)

                logger.info(f"Stopped tracking for observation {observation_id}")

            # 2. Cleanup internal observation session
            # This will:
            # - Stop SDR process (which cascades to all consumers: decoders, recorders)
            # - Clear SessionTracker relationships
            # - Remove configuration
            # - Unregister from internal sessions
            await session_service.cleanup_internal_observation(observation_id)

            logger.info(f"Internal session cleaned up for {observation_id}")

            # 3. Cleanup VFO state
            vfo_manager = VFOManager()
            vfo_manager.cleanup_internal_vfos(observation_id)

            logger.info(f"Observation {observation_id} stopped successfully")

        except Exception as e:
            logger.error(f"Failed to stop observation {observation_id}: {e}")
            logger.error(traceback.format_exc())
            raise

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
