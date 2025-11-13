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

from sdr.consumerbase import ConsumerManager


class DemodulatorManager(ConsumerManager):
    """
    Manager for demodulator consumers
    """

    def __init__(self, processes):
        super().__init__(processes)
        self.logger = logging.getLogger("demodulator-manager")

    def start_demodulator(
        self, sdr_id, session_id, demodulator_class, audio_queue, vfo_number=None, **kwargs
    ):
        """
        Start a demodulator thread for a specific session and VFO.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier (client session ID)
            demodulator_class: The demodulator class to instantiate (e.g., FMDemodulator, AMDemodulator, SSBDemodulator)
            audio_queue: Queue where demodulated audio will be placed
            vfo_number: VFO number (1-4). If None, uses session_id as key for backward compatibility
            **kwargs: Additional arguments to pass to the demodulator constructor

        Returns:
            bool: True if started successfully, False otherwise
        """
        return self._start_iq_consumer(
            sdr_id,
            session_id,
            demodulator_class,
            audio_queue,
            "demodulators",
            "demod",
            vfo_number=vfo_number,
            **kwargs,
        )

    def stop_demodulator(self, sdr_id, session_id, vfo_number=None):
        """
        Stop a demodulator thread for a specific session and optionally a specific VFO.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier
            vfo_number: VFO number (1-4). If None, stops all demodulators for session (legacy mode)

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        if sdr_id not in self.processes:
            return False

        process_info = self.processes[sdr_id]
        demodulators = process_info.get("demodulators", {})

        if session_id not in demodulators:
            return False

        try:
            # Check if this is multi-VFO mode (nested dict) or legacy mode
            demod_entry = demodulators[session_id]

            if isinstance(demod_entry, dict) and vfo_number in demod_entry:
                # Multi-VFO mode: stop specific VFO
                vfo_entry = demod_entry[vfo_number]
                demodulator = vfo_entry["instance"]
                subscription_key = vfo_entry["subscription_key"]

                demod_name = type(demodulator).__name__
                demodulator.stop()
                demodulator.join(timeout=2.0)  # Wait up to 2 seconds

                # Unsubscribe from the broadcaster
                broadcaster = process_info.get("iq_broadcaster")
                if broadcaster:
                    broadcaster.unsubscribe(subscription_key)

                # Remove from storage
                del demod_entry[vfo_number]
                self.logger.info(f"Stopped {demod_name} for session {session_id} VFO {vfo_number}")

                # Clean up empty session dict
                if not demod_entry:
                    del demodulators[session_id]

                return True

            elif isinstance(demod_entry, dict) and "instance" in demod_entry:
                # Legacy mode: stop single demodulator
                demodulator = demod_entry["instance"]
                subscription_key = demod_entry["subscription_key"]

                demod_name = type(demodulator).__name__
                demodulator.stop()
                demodulator.join(timeout=2.0)

                # Unsubscribe from the broadcaster
                broadcaster = process_info.get("iq_broadcaster")
                if broadcaster:
                    broadcaster.unsubscribe(subscription_key)

                del demodulators[session_id]
                self.logger.info(f"Stopped {demod_name} for session {session_id}")
                return True

            elif vfo_number is None and isinstance(demod_entry, dict):
                # Stop all VFOs for this session
                broadcaster = process_info.get("iq_broadcaster")
                stopped_count = 0

                for vfo_num in list(demod_entry.keys()):
                    vfo_entry = demod_entry[vfo_num]
                    demodulator = vfo_entry["instance"]
                    subscription_key = vfo_entry["subscription_key"]

                    demod_name = type(demodulator).__name__
                    demodulator.stop()
                    demodulator.join(timeout=2.0)

                    if broadcaster:
                        broadcaster.unsubscribe(subscription_key)

                    stopped_count += 1
                    self.logger.info(f"Stopped {demod_name} for session {session_id} VFO {vfo_num}")

                del demodulators[session_id]
                self.logger.info(f"Stopped {stopped_count} demodulator(s) for session {session_id}")
                return True

            else:
                self.logger.warning(
                    f"No demodulator found for session {session_id} VFO {vfo_number}"
                )
                return False

        except Exception as e:
            self.logger.error(f"Error stopping demodulator: {str(e)}")
            return False

    def _stop_consumer(self, sdr_id, session_id, storage_key, vfo_number=None):
        """
        Implementation of base class method for stopping demodulators
        """
        return self.stop_demodulator(sdr_id, session_id, vfo_number)

    def get_active_demodulator(self, sdr_id, session_id):
        """
        Get the active demodulator for a session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            Demodulator instance or None if not found
        """
        if sdr_id not in self.processes:
            return None

        process_info = self.processes[sdr_id]
        demodulators = process_info.get("demodulators", {})
        demod_entry = demodulators.get(session_id)

        if demod_entry is None:
            return None

        # Handle both old format (direct instance) and new format (dict with instance)
        if isinstance(demod_entry, dict):
            return demod_entry.get("instance")
        return demod_entry
