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


import logging

from processing.consumerbase import ConsumerManager


class RecorderManager(ConsumerManager):
    """
    Manager for recorder consumers
    """

    def __init__(self, processes):
        super().__init__(processes)
        self.logger = logging.getLogger("recorder-manager")

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

    def stop_recorder(self, sdr_id, session_id):
        """
        Stop a recorder thread for a specific session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

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
            recorder.stop()
            recorder.join(timeout=2.0)  # Wait up to 2 seconds

            # Unsubscribe from the broadcaster using the correct subscription key
            broadcaster = process_info.get("iq_broadcaster")
            if broadcaster:
                broadcaster.unsubscribe(subscription_key)

            del recorders[session_id]
            self.logger.info(f"Stopped {recorder_name} for session {session_id}")
            return True

        except Exception as e:
            self.logger.error(f"Error stopping recorder: {str(e)}")
            return False

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
