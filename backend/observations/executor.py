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

import os
import traceback
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import select

from common.logger import logger
from crud.preferences import fetch_all_preferences
from crud.scheduledobservations import fetch_scheduled_observations
from db import AsyncSessionLocal
from db.models import Satellites, Transmitters
from demodulators.amdemodulator import AMDemodulator
from demodulators.audiorecorder import AudioRecorder
from demodulators.fmdemodulator import FMDemodulator
from demodulators.iqrecorder import IQRecorder
from demodulators.ssbdemodulator import SSBDemodulator
from observations.constants import (
    STATUS_CANCELLED,
    STATUS_COMPLETED,
    STATUS_FAILED,
    STATUS_RUNNING,
    STATUS_SCHEDULED,
)
from processing.decoderregistry import decoder_registry
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
        2. Checks if SDR is available (not in use)
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
                await self._update_observation_status(observation_id, STATUS_FAILED, error_msg)
                await self._remove_scheduled_stop_job(observation_id)
                return {"success": False, "error": error_msg}

            # Check if SDR is already in use
            from session.tracker import session_tracker

            sessions_using_sdr = session_tracker.get_sessions_for_sdr(sdr_id)
            if sessions_using_sdr:
                error_msg = (
                    f"SDR '{sdr_id}' is currently in use by {len(sessions_using_sdr)} session(s). "
                    f"Cannot start observation {observation_id} ({observation.get('name')}). "
                    f"Aborting task and marking as failed."
                )
                logger.error(error_msg)
                logger.error(f"Sessions using SDR {sdr_id}: {list(sessions_using_sdr)}")

                # Mark observation as failed
                await self._update_observation_status(observation_id, STATUS_FAILED, error_msg)

                # Remove the scheduled stop job since we're not starting
                await self._remove_scheduled_stop_job(observation_id)

                return {"success": False, "error": error_msg}

            logger.info(f"SDR {sdr_id} is available for observation {observation_id}")

            # 4. Execute placeholder observation task
            logger.info(f"Executing observation task for {observation['name']}")
            await self._execute_observation_task(observation_id, observation)

            # 5. Update observation status to RUNNING
            await self._update_observation_status(observation_id, STATUS_RUNNING)

            logger.info(f"Observation {observation_id} started successfully")
            return {"success": True}

        except Exception as e:
            error_msg = f"Error starting observation {observation_id}: {e}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            await self._update_observation_status(observation_id, STATUS_FAILED, str(e))
            # Remove scheduled stop job on error
            await self._remove_scheduled_stop_job(observation_id)
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
            await self._update_observation_status(observation_id, STATUS_COMPLETED)

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
                await self._update_observation_status(observation_id, STATUS_FAILED, error_msg)
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

            # 3. Configure VFOs and start tasks
            vfo_manager = VFOManager()
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

                    # Configure VFO for decoder
                    transmitter_id = task_config.get("transmitter_id", "none")
                    decoder_type = task_config.get("decoder_type", "none")

                    # Get transmitter details to extract frequency/modulation/bandwidth
                    center_freq = task_config.get("frequency", sdr_config["center_freq"])
                    modulation = task_config.get("modulation", "none")
                    bandwidth = task_config.get("bandwidth", 40000)

                    # Fetch transmitter and satellite info from database
                    transmitter_info = None
                    satellite_info = None

                    if transmitter_id and transmitter_id != "none":
                        try:
                            async with AsyncSessionLocal() as db_session:
                                # Fetch transmitter
                                result = await db_session.execute(
                                    select(Transmitters).where(Transmitters.id == transmitter_id)
                                )
                                transmitter_record = result.scalar_one_or_none()

                                if transmitter_record:
                                    center_freq = task_config.get(
                                        "frequency", transmitter_record.downlink_low
                                    )

                                    transmitter_info = {
                                        "id": transmitter_record.id,
                                        "description": transmitter_record.description,
                                        "mode": transmitter_record.mode,
                                        "baud": transmitter_record.baud,
                                        "downlink_low": transmitter_record.downlink_low,
                                        "downlink_high": transmitter_record.downlink_high,
                                        "center_frequency": center_freq,
                                        "bandwidth": bandwidth,  # Use default/config bandwidth (40000)
                                        "norad_cat_id": transmitter_record.norad_cat_id,
                                    }
                                    modulation = transmitter_record.mode or modulation

                                    # Fetch satellite info
                                    sat_result = await db_session.execute(
                                        select(Satellites).where(
                                            Satellites.norad_id == transmitter_record.norad_cat_id
                                        )
                                    )
                                    satellite_record = sat_result.scalar_one_or_none()
                                    if satellite_record:
                                        satellite_info = {
                                            "norad_id": satellite_record.norad_id,
                                            "name": satellite_record.name,
                                            "alternative_name": satellite_record.alternative_name,
                                            "status": satellite_record.status,
                                            "image": satellite_record.image,
                                        }

                                    logger.info(
                                        f"Loaded transmitter {transmitter_record.description} "
                                        f"for observation {observation_id}"
                                    )
                        except Exception as e:
                            logger.warning(f"Failed to fetch transmitter {transmitter_id}: {e}")
                            logger.warning(traceback.format_exc())

                    # Fallback if no transmitter info available
                    if not transmitter_info:
                        transmitter_info = {
                            "description": f"Observation {observation_id} Signal",
                            "mode": decoder_type.upper(),
                            "center_frequency": center_freq,
                            "bandwidth": bandwidth,
                        }
                        logger.warning(
                            f"No transmitter info for observation {observation_id} - using defaults"
                        )

                    # Configure VFO
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

                    # Start decoder process
                    decoder_class = decoder_registry.get_decoder_class(decoder_type)
                    if decoder_class:
                        try:
                            process_info = self.process_manager.processes.get(sdr_id)
                            if process_info:
                                data_queue = process_info["data_queue"]

                                decoder_kwargs = {
                                    "sdr_id": sdr_id,
                                    "session_id": session_id,
                                    "decoder_class": decoder_class,
                                    "data_queue": data_queue,
                                    "audio_out_queue": None,  # No audio streaming for observations
                                    "output_dir": "data/decoded",
                                    "vfo_center_freq": center_freq,
                                    "vfo": vfo_number,
                                    "decoder_param_overrides": {},  # Use defaults from transmitter
                                    "caller": "executor.py:_execute_observation_task",
                                }

                                # Add transmitter config if decoder supports it
                                if decoder_registry.supports_transmitter_config(decoder_type):
                                    decoder_kwargs["satellite"] = satellite_info
                                    decoder_kwargs["transmitter"] = transmitter_info

                                success = self.process_manager.start_decoder(**decoder_kwargs)
                                if success:
                                    logger.info(
                                        f"Started {decoder_type} decoder for observation {observation_id}"
                                    )
                                else:
                                    logger.error(
                                        f"Failed to start {decoder_type} decoder for observation {observation_id}"
                                    )
                            else:
                                logger.error(f"No SDR process found for {sdr_id}")
                        except Exception as e:
                            logger.error(f"Error starting decoder: {e}")
                            logger.error(traceback.format_exc())
                    else:
                        logger.warning(f"Decoder class not found for type: {decoder_type}")

                elif task_type == "iq_recording":
                    # Start IQ recorder
                    try:
                        # Generate timestamp for recording filename
                        now = datetime.now()
                        date = now.strftime("%Y%m%d")
                        time_str = now.strftime("%H%M%S")
                        timestamp = f"{date}_{time_str}"

                        # Build recording name: satellite_name_timestamp
                        satellite_name = satellite.get("name", "unknown").replace(" ", "_")
                        recording_name = f"{satellite_name}_{timestamp}"

                        # Build recording path (directory creation handled by IQRecorder)
                        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                        recordings_dir = os.path.join(backend_dir, "data", "recordings")
                        recording_path = os.path.join(recordings_dir, recording_name)

                        # Start IQ recorder
                        success = self.process_manager.start_recorder(
                            sdr_id,
                            session_id,
                            IQRecorder,
                            recording_path=recording_path,
                            target_satellite_norad_id=str(satellite.get("norad_id", "")),
                            target_satellite_name=satellite.get("name", ""),
                        )

                        if success:
                            logger.info(
                                f"Started IQ recording for observation {observation_id}: {recording_path}"
                            )
                        else:
                            logger.error(
                                f"Failed to start IQ recording for observation {observation_id}"
                            )
                    except Exception as e:
                        logger.error(f"Error starting IQ recorder: {e}")
                        logger.error(traceback.format_exc())

                elif task_type == "audio_recording":
                    # Start audio recorder for VFO
                    # This requires starting both a demodulator and audio recorder
                    # Get VFO number from task config
                    audio_vfo_number = task_config.get("vfo_number", 1)
                    vfo_frequency = task_config.get("frequency", sdr_config["center_freq"])
                    demodulator_type = task_config.get("demodulator_type", "FM")
                    bandwidth = task_config.get("bandwidth", 40000)

                    try:
                        # 1. Configure VFO for audio recording
                        vfo_manager.configure_internal_vfo(
                            observation_id=observation_id,
                            vfo_number=audio_vfo_number,
                            center_freq=vfo_frequency,
                            bandwidth=bandwidth,
                            modulation=demodulator_type,
                            decoder="none",  # No decoder, just demodulator
                            locked_transmitter_id="none",
                        )

                        logger.info(
                            f"Configured VFO {audio_vfo_number} for audio recording at {vfo_frequency/1e6:.3f} MHz"
                        )

                        # 2. Start demodulator for this VFO
                        # Pass None for audio_queue since observations don't stream to UI
                        # Demodulator will create its own AudioBroadcaster for audio recorder
                        demod_type_lower = demodulator_type.lower()
                        demod_started = False

                        if demod_type_lower == "fm":
                            demod_started = self.process_manager.start_demodulator(
                                sdr_id, session_id, FMDemodulator, None, vfo_number=audio_vfo_number
                            )
                        elif demod_type_lower in ["usb", "lsb", "cw"]:
                            demod_started = self.process_manager.start_demodulator(
                                sdr_id,
                                session_id,
                                SSBDemodulator,
                                None,
                                vfo_number=audio_vfo_number,
                                mode=demod_type_lower,
                            )
                        elif demod_type_lower == "am":
                            demod_started = self.process_manager.start_demodulator(
                                sdr_id, session_id, AMDemodulator, None, vfo_number=audio_vfo_number
                            )
                        else:
                            logger.error(
                                f"Unsupported demodulator type for audio recording: {demodulator_type}"
                            )

                        if not demod_started:
                            logger.error(
                                f"Failed to start demodulator for audio recording VFO {audio_vfo_number}"
                            )
                            continue

                        logger.info(
                            f"Started {demodulator_type} demodulator for audio recording VFO {audio_vfo_number}"
                        )

                        # 3. Generate recording path (following server/audiorecorder.py pattern)
                        now = datetime.now()
                        timestamp = now.strftime("%Y%m%d_%H%M%S")

                        # Build recording name from satellite name
                        recording_name = satellite.get("name", "unknown_satellite")
                        recording_name = recording_name.replace(" ", "_").replace("/", "_")
                        recording_name_full = f"{recording_name}_vfo{audio_vfo_number}_{timestamp}"

                        # Create audio recordings directory
                        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                        audio_dir = os.path.join(backend_dir, "data", "audio")
                        os.makedirs(audio_dir, exist_ok=True)

                        recording_path = os.path.join(audio_dir, recording_name_full)

                        # 4. Start audio recorder
                        success = self.process_manager.audio_recorder_manager.start_audio_recorder(
                            sdr_id,
                            session_id,
                            audio_vfo_number,
                            AudioRecorder,
                            recording_path=recording_path,
                            sample_rate=44100,  # Match demodulator output rate
                            target_satellite_norad_id=str(satellite.get("norad_id", "")),
                            target_satellite_name=satellite.get("name", ""),
                            center_frequency=sdr_config["center_freq"],
                            vfo_frequency=vfo_frequency,
                            demodulator_type=demodulator_type,
                        )

                        if success:
                            logger.info(
                                f"Started audio recording for observation {observation_id} VFO {audio_vfo_number}: {recording_path}"
                            )
                        else:
                            logger.error(
                                f"Failed to start audio recording for observation {observation_id}"
                            )
                    except Exception as e:
                        logger.error(f"Error starting audio recorder: {e}")
                        logger.error(traceback.format_exc())

                elif task_type == "transcription":
                    # Start transcription for VFO
                    # This requires starting both a demodulator and transcription worker
                    transcription_vfo_number = task_config.get("vfo_number", 1)
                    vfo_frequency = task_config.get("frequency", sdr_config["center_freq"])
                    demodulator_type = task_config.get("demodulator_type", "FM")
                    bandwidth = task_config.get("bandwidth", 40000)
                    provider = task_config.get("provider", "gemini")
                    language = task_config.get("language", "auto")
                    translate_to = task_config.get("translate_to", "none")

                    try:
                        # 1. Configure VFO for transcription
                        vfo_manager.configure_internal_vfo(
                            observation_id=observation_id,
                            vfo_number=transcription_vfo_number,
                            center_freq=vfo_frequency,
                            bandwidth=bandwidth,
                            modulation=demodulator_type,
                            decoder="none",  # No decoder, just demodulator
                            locked_transmitter_id="none",
                        )

                        logger.info(
                            f"Configured VFO {transcription_vfo_number} for transcription at {vfo_frequency/1e6:.3f} MHz"
                        )

                        # 2. Start demodulator for this VFO
                        # Pass None for audio_queue since observations don't stream to UI
                        # Demodulator will create its own AudioBroadcaster for transcription worker
                        demod_type_lower = demodulator_type.lower()
                        demod_started = False

                        if demod_type_lower == "fm":
                            demod_started = self.process_manager.start_demodulator(
                                sdr_id,
                                session_id,
                                FMDemodulator,
                                None,
                                vfo_number=transcription_vfo_number,
                            )
                        elif demod_type_lower in ["usb", "lsb", "cw"]:
                            demod_started = self.process_manager.start_demodulator(
                                sdr_id,
                                session_id,
                                SSBDemodulator,
                                None,
                                vfo_number=transcription_vfo_number,
                                mode=demod_type_lower,
                            )
                        elif demod_type_lower == "am":
                            demod_started = self.process_manager.start_demodulator(
                                sdr_id,
                                session_id,
                                AMDemodulator,
                                None,
                                vfo_number=transcription_vfo_number,
                            )
                        else:
                            logger.error(
                                f"Unsupported demodulator type for transcription: {demodulator_type}"
                            )

                        if not demod_started:
                            logger.error(
                                f"Failed to start demodulator for transcription VFO {transcription_vfo_number}"
                            )
                            continue

                        logger.info(
                            f"Started {demodulator_type} demodulator for transcription VFO {transcription_vfo_number}"
                        )

                        # 3. Get transcription manager and fetch API keys
                        transcription_manager = self.process_manager.transcription_manager
                        if not transcription_manager:
                            logger.error("Transcription manager not initialized")
                            continue

                        # Fetch API keys from preferences
                        async with AsyncSessionLocal() as dbsession:
                            prefs_result = await fetch_all_preferences(dbsession)
                            if not prefs_result["success"]:
                                logger.error("Failed to fetch preferences for transcription")
                                continue

                            preferences = prefs_result["data"]

                            # Set appropriate API key based on provider
                            if provider == "gemini":
                                api_key = next(
                                    (
                                        p["value"]
                                        for p in preferences
                                        if p["name"] == "gemini_api_key"
                                    ),
                                    "",
                                )
                                if not api_key:
                                    logger.error("Gemini API key not configured")
                                    continue
                                transcription_manager.set_gemini_api_key(api_key)
                            elif provider == "deepgram":
                                api_key = next(
                                    (
                                        p["value"]
                                        for p in preferences
                                        if p["name"] == "deepgram_api_key"
                                    ),
                                    "",
                                )
                                if not api_key:
                                    logger.error("Deepgram API key not configured")
                                    continue
                                transcription_manager.set_deepgram_api_key(api_key)

                                # Set Google Translate API key for Deepgram translation
                                google_translate_key = next(
                                    (
                                        p["value"]
                                        for p in preferences
                                        if p["name"] == "google_translate_api_key"
                                    ),
                                    "",
                                )
                                transcription_manager.set_google_translate_api_key(
                                    google_translate_key
                                )
                            else:
                                logger.error(f"Unknown transcription provider: {provider}")
                                continue

                            # 4. Start transcription worker
                            success = transcription_manager.start_transcription(
                                sdr_id=sdr_id,
                                session_id=session_id,
                                vfo_number=transcription_vfo_number,
                                language=language,
                                translate_to=translate_to,
                                provider=provider,
                            )

                            if success:
                                logger.info(
                                    f"Started transcription for observation {observation_id} VFO {transcription_vfo_number} "
                                    f"(provider={provider}, language={language}, translate_to={translate_to})"
                                )
                            else:
                                logger.error(
                                    f"Failed to start transcription for observation {observation_id}"
                                )
                    except Exception as e:
                        logger.error(f"Error starting transcription: {e}")
                        logger.error(traceback.format_exc())

            # 4. Start rotator tracker if enabled
            rotator_config = observation.get("rotator", {})
            if rotator_config.get("tracking_enabled") and rotator_config.get("id"):
                from tracker.runner import get_tracker_manager

                # Extract transmitter ID from decoder tasks (if any)
                transmitter_id = "none"
                for task in tasks:
                    if task.get("type") == "decoder":
                        transmitter_id = task.get("config", {}).get("transmitter_id", "none")
                        break

                # Update tracking state to target this satellite
                tracker_manager = get_tracker_manager()
                await tracker_manager.update_tracking_state(
                    norad_id=satellite.get("norad_id"),
                    group_id=satellite.get("group_id"),
                    rotator_state="tracking",  # Start tracking satellite
                    rotator_id=rotator_config.get("id"),
                    rig_state="disconnected",  # Observations don't use rig for now
                    rig_id="none",
                    transmitter_id=transmitter_id,
                    rig_vfo="none",
                    vfo1="uplink",
                    vfo2="downlink",
                )

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
        # Note: CRUD layer flattens hardware_config to top-level keys (sdr, rotator, rig)
        satellite = observation.get("satellite", {})

        logger.info(f"Stopping observation for {satellite.get('name', 'unknown')}")
        logger.info(f"Observation ID: {observation_id}")

        try:
            # 1. Don't stop tracker - leave rotator connected for manual control or next observation
            # The user can manually disconnect the rotator if desired
            logger.debug(f"Leaving rotator connected after observation {observation_id}")

            # 2. Stop decoders explicitly before cleaning up session
            # Get session ID from observation
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
                        try:
                            self.process_manager.stop_decoder(sdr_id, session_id, vfo_number)
                            logger.info(
                                f"Stopped decoder for observation {observation_id} VFO {vfo_number}"
                            )
                        except Exception as e:
                            logger.warning(f"Error stopping decoder: {e}")

                    elif task_type == "iq_recording":
                        try:
                            self.process_manager.stop_recorder(sdr_id, session_id)
                            logger.info(f"Stopped IQ recorder for observation {observation_id}")
                        except Exception as e:
                            logger.warning(f"Error stopping IQ recorder: {e}")

                    elif task_type == "audio_recording":
                        audio_vfo_number = task_config.get("vfo_number", 1)
                        try:
                            # Stop audio recorder first
                            self.process_manager.audio_recorder_manager.stop_audio_recorder(
                                sdr_id, session_id, audio_vfo_number
                            )
                            logger.info(
                                f"Stopped audio recorder for observation {observation_id} VFO {audio_vfo_number}"
                            )

                            # Stop demodulator for this VFO
                            self.process_manager.stop_demodulator(
                                sdr_id, session_id, audio_vfo_number
                            )
                            logger.info(
                                f"Stopped demodulator for audio recording VFO {audio_vfo_number}"
                            )
                        except Exception as e:
                            logger.warning(f"Error stopping audio recorder/demodulator: {e}")

                    elif task_type == "transcription":
                        transcription_vfo_number = task_config.get("vfo_number", 1)
                        try:
                            # Stop transcription worker first
                            transcription_manager = self.process_manager.transcription_manager
                            if transcription_manager:
                                transcription_manager.stop_transcription(
                                    sdr_id, session_id, transcription_vfo_number
                                )
                                logger.info(
                                    f"Stopped transcription for observation {observation_id} VFO {transcription_vfo_number}"
                                )

                            # Stop demodulator for this VFO
                            self.process_manager.stop_demodulator(
                                sdr_id, session_id, transcription_vfo_number
                            )
                            logger.info(
                                f"Stopped demodulator for transcription VFO {transcription_vfo_number}"
                            )
                        except Exception as e:
                            logger.warning(f"Error stopping transcription/demodulator: {e}")

            # 3. Cleanup internal observation session
            # This will:
            # - Stop SDR process (which cascades to remaining consumers: recorders)
            # - Clear SessionTracker relationships
            # - Remove configuration
            # - Unregister from internal sessions
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

    # ============================================================================
    # HELPER METHODS
    # ============================================================================

    async def _remove_scheduled_stop_job(self, observation_id: str) -> None:
        """
        Remove the scheduled stop job for an observation.

        This is called when an observation fails to start or is aborted,
        to prevent the stop job from running in the future.

        Args:
            observation_id: The observation ID
        """
        try:
            from observations.events import observation_sync

            if observation_sync:
                # Remove just the stop job
                job_id = f"obs_{observation_id}_stop"
                try:
                    observation_sync.scheduler.remove_job(job_id)
                    logger.info(f"Removed scheduled stop job for observation {observation_id}")
                except Exception as job_error:
                    # Job might not exist, that's okay
                    logger.debug(f"Stop job {job_id} not found or already removed: {job_error}")
        except Exception as e:
            logger.warning(f"Failed to remove scheduled stop job for {observation_id}: {e}")

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
