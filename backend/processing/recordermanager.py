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


import asyncio
import logging
from pathlib import Path

from processing.consumerbase import ConsumerManager
from processing.waterfallgenerator import WaterfallConfig, WaterfallGenerator


class RecorderManager(ConsumerManager):
    """
    Manager for recorder consumers
    """

    def __init__(self, processes, sio=None):
        super().__init__(processes)
        self.logger = logging.getLogger("recorder-manager")
        self.sio = sio  # Socket.IO instance for emitting notifications

        # Load waterfall configuration
        waterfall_config = self._load_waterfall_config()
        self.waterfall_generator = WaterfallGenerator(waterfall_config)

    def _load_waterfall_config(self) -> WaterfallConfig:
        """Load waterfall configuration from file or use defaults."""
        config_path = Path("backend/data/configs/waterfall_config.json")
        return WaterfallConfig.load_from_file(config_path)

    def start_recorder(self, sdr_id, session_id, recorder_class, **kwargs):
        """
        Start a recorder thread for a specific session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier (client session ID)
            recorder_class: The recorder class to instantiate (e.g., IQRecorder)
            **kwargs: Additional arguments to pass to the recorder constructor (e.g., recording_path)

        Returns:
            bool: True if started successfully, False otherwise
        """
        return self._start_iq_consumer(
            sdr_id, session_id, recorder_class, None, "recorders", "recorder", **kwargs
        )

    def stop_recorder(self, sdr_id, session_id, skip_auto_waterfall=False):
        """
        Stop a recorder thread for a specific session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier
            skip_auto_waterfall: If True, skip automatic waterfall generation

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        if sdr_id not in self.processes:
            return False

        process_info = self.processes[sdr_id]
        recorders = process_info.get("recorders", {})

        if session_id not in recorders:
            return False

        try:
            recorder_entry = recorders[session_id]
            # Handle both old format (direct instance) and new format (dict with instance + key)
            if isinstance(recorder_entry, dict):
                recorder = recorder_entry["instance"]
                subscription_key = recorder_entry["subscription_key"]
            else:
                recorder = recorder_entry
                subscription_key = session_id  # Fallback for old format

            recorder_name = type(recorder).__name__

            # Get recording path before stopping (for IQ recordings)
            recording_path = getattr(recorder, "recording_path", None)

            recorder.stop()
            recorder.join(timeout=2.0)  # Wait up to 2 seconds

            # Unsubscribe from the broadcaster using the correct subscription key
            broadcaster = process_info.get("iq_broadcaster")
            if broadcaster:
                broadcaster.unsubscribe(subscription_key)

            del recorders[session_id]
            self.logger.info(f"Stopped {recorder_name} for session {session_id}")

            # Emit file browser state update to notify UI of new IQ recording
            # Only emit for IQRecorder (not for other recorder types)
            if self.sio and recording_path and recorder_name == "IQRecorder":
                asyncio.create_task(self._emit_recording_stopped_notification(recording_path))
                # Generate waterfall spectrograms (unless UI already provided one)
                if not skip_auto_waterfall:
                    self.logger.info(f"Scheduling waterfall generation for {recording_path}")
                    asyncio.create_task(self._generate_waterfall_async(recording_path))
                else:
                    self.logger.info(
                        f"Skipping auto-waterfall generation for {recording_path} (UI provided)"
                    )

            return True

        except Exception as e:
            self.logger.error(f"Error stopping recorder: {str(e)}")
            return False

    async def _emit_recording_stopped_notification(self, recording_path):
        """
        Emit file browser state update for IQ recording stopped.

        Args:
            recording_path: Path to the IQ recording file (without extension)
        """
        try:
            from handlers.entities.filebrowser import emit_file_browser_state

            await emit_file_browser_state(
                self.sio,
                {
                    "action": "recording-stopped",
                    "recording_path": recording_path,
                },
                self.logger,
            )
        except Exception as e:
            self.logger.error(f"Error emitting recording-stopped notification: {e}")

    async def _generate_waterfall_async(self, recording_path):
        """
        Generate waterfall spectrograms asynchronously after recording stops.

        Args:
            recording_path: Path to the IQ recording file (without extension)
        """
        try:
            self.logger.info(f"Starting waterfall generation for {recording_path}")

            # Run in thread pool to avoid blocking event loop
            loop = asyncio.get_event_loop()
            success = await loop.run_in_executor(
                None, self.waterfall_generator.generate_from_sigmf, Path(recording_path)
            )

            if success:
                self.logger.info(f"Waterfall generation completed for {recording_path}")

                # Emit notification that waterfall is ready
                if self.sio:
                    from handlers.entities.filebrowser import emit_file_browser_state

                    await emit_file_browser_state(
                        self.sio,
                        {
                            "action": "waterfall-generated",
                            "recording_path": recording_path,
                        },
                        self.logger,
                    )
            else:
                self.logger.warning(f"Waterfall generation failed for {recording_path}")

        except Exception as e:
            self.logger.error(f"Error generating waterfall: {e}")
            self.logger.exception(e)

    def _stop_consumer(self, sdr_id, session_id, storage_key, vfo_number=None):
        """
        Implementation of base class method for stopping recorders
        """
        return self.stop_recorder(sdr_id, session_id)

    def get_active_recorder(self, sdr_id, session_id):
        """
        Get the active recorder for a session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            Recorder instance or None if not found
        """
        if sdr_id not in self.processes:
            return None

        process_info = self.processes[sdr_id]
        recorders = process_info.get("recorders", {})
        recorder_entry = recorders.get(session_id)

        if recorder_entry is None:
            return None

        # Handle both old format (direct instance) and new format (dict with instance)
        if isinstance(recorder_entry, dict):
            return recorder_entry.get("instance")
        return recorder_entry
