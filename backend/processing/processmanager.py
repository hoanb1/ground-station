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
import signal
from typing import Any, Dict

from processing.decodermanager import DecoderManager
from processing.demodulatormanager import DemodulatorManager
from processing.processlifecycle import ProcessLifecycleManager
from processing.recordermanager import RecorderManager


class ProcessManager:
    """
    Manager for the SDR worker processes

    This is the main orchestrator that delegates to specialized manager classes:
    - ProcessLifecycleManager: handles process start/stop/configure/monitor
    - DemodulatorManager: manages demodulator consumers
    - RecorderManager: manages recorder consumers
    - DecoderManager: manages decoder consumers
    """

    def __init__(self, sio=None):
        self.logger = logging.getLogger("proc-manager")
        self.sio = sio
        self.processes: Dict[str, Dict[str, Any]] = {}  # Map of sdr_id to process information

        # Initialize specialized managers
        self.demodulator_manager = DemodulatorManager(self.processes)
        self.recorder_manager = RecorderManager(self.processes)
        self.decoder_manager = DecoderManager(self.processes, self.demodulator_manager)
        self.lifecycle_manager = ProcessLifecycleManager(
            self.processes,
            self.sio,
            self.demodulator_manager,
            self.recorder_manager,
            self.decoder_manager,
        )

        # Set up signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def set_sio(self, sio):
        """
        Update the Socket.IO server instance after initialization

        Args:
            sio: Socket.IO server instance
        """
        self.sio = sio
        self.lifecycle_manager.sio = sio

    # ==================== Process Lifecycle Methods ====================

    async def get_center_frequency(self, sdr_id):
        """
        Get the current center frequency of an SDR worker process

        Args:
            sdr_id: Device identifier

        Returns:
            float: Current center frequency in Hz, or None if process not found/running
        """
        return await self.lifecycle_manager.get_center_frequency(sdr_id)

    async def start_sdr_process(self, sdr_device, sdr_config, client_id):
        """
        Start an SDR worker process

        Args:
            sdr_device: Dictionary with device connection parameters
            sdr_config: Dictionary with configuration parameters
            client_id: Client identifier

        Returns:
            The device ID for the started process
        """
        return await self.lifecycle_manager.start_sdr_process(sdr_device, sdr_config, client_id)

    async def stop_sdr_process(self, sdr_id, client_id=None):
        """
        Stop an SDR worker process

        Args:
            sdr_id: Device identifier
            client_id: Client identifier (optional)
        """
        await self.lifecycle_manager.stop_sdr_process(sdr_id, client_id)

    async def update_configuration(self, sdr_id, config):
        """
        Update the configuration of an SDR worker process

        Args:
            sdr_id: Device identifier
            config: Dictionary with configuration parameters
        """
        await self.lifecycle_manager.update_configuration(sdr_id, config)

    def is_sdr_process_running(self, sdr_id):
        """
        Check if an SDR process exists and is running

        Args:
            sdr_id: Device identifier

        Returns:
            bool: True if the process exists and is running, False otherwise
        """
        return sdr_id in self.processes and self.processes[sdr_id]["process"].is_alive()

    # ==================== Demodulator Methods ====================

    def start_demodulator(
        self, sdr_id, session_id, demodulator_class, audio_queue, vfo_number=None, **kwargs
    ):
        """
        Start a demodulator thread for a specific session and VFO.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier (client session ID)
            demodulator_class: The demodulator class to instantiate
            audio_queue: Queue where demodulated audio will be placed
            vfo_number: VFO number (1-4). If None, uses session_id as key
            **kwargs: Additional arguments to pass to the demodulator constructor

        Returns:
            bool: True if started successfully, False otherwise
        """
        return self.demodulator_manager.start_demodulator(
            sdr_id, session_id, demodulator_class, audio_queue, vfo_number, **kwargs
        )

    def stop_demodulator(self, sdr_id, session_id, vfo_number=None):
        """
        Stop a demodulator thread for a specific session and optionally a specific VFO.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier
            vfo_number: VFO number (1-4). If None, stops all demodulators for session

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        return self.demodulator_manager.stop_demodulator(sdr_id, session_id, vfo_number)

    def get_active_demodulator(self, sdr_id, session_id):
        """
        Get the active demodulator for a session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            Demodulator instance or None if not found
        """
        return self.demodulator_manager.get_active_demodulator(sdr_id, session_id)

    def flush_all_demodulator_queues(self, sdr_id):
        """
        Flush all demodulator IQ queues for an SDR.

        Args:
            sdr_id: Device identifier
        """
        self.demodulator_manager.flush_all_demodulator_queues(sdr_id)

    # ==================== Recorder Methods ====================

    def start_recorder(self, sdr_id, session_id, recorder_class, **kwargs):
        """
        Start a recorder thread for a specific session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier (client session ID)
            recorder_class: The recorder class to instantiate
            **kwargs: Additional arguments to pass to the recorder constructor

        Returns:
            bool: True if started successfully, False otherwise
        """
        return self.recorder_manager.start_recorder(sdr_id, session_id, recorder_class, **kwargs)

    def stop_recorder(self, sdr_id, session_id):
        """
        Stop a recorder thread for a specific session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        return self.recorder_manager.stop_recorder(sdr_id, session_id)

    def get_active_recorder(self, sdr_id, session_id):
        """
        Get the active recorder for a session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            Recorder instance or None if not found
        """
        return self.recorder_manager.get_active_recorder(sdr_id, session_id)

    # ==================== Decoder Methods ====================

    def start_decoder(
        self, sdr_id, session_id, decoder_class, data_queue, audio_out_queue=None, **kwargs
    ):
        """
        Start a decoder thread for a specific session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier (client session ID)
            decoder_class: The decoder class to instantiate
            data_queue: Queue where decoded data will be placed
            audio_out_queue: Optional queue for streaming demodulated audio to UI
            **kwargs: Additional arguments to pass to the decoder constructor

        Returns:
            bool: True if started successfully, False otherwise
        """
        return self.decoder_manager.start_decoder(
            sdr_id, session_id, decoder_class, data_queue, audio_out_queue, **kwargs
        )

    def stop_decoder(self, sdr_id, session_id, vfo_number=None):
        """
        Stop a decoder thread for a specific session and optionally a specific VFO.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier
            vfo_number: VFO number (1-4). If None, stops all decoders for session

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        return self.decoder_manager.stop_decoder(sdr_id, session_id, vfo_number)

    def get_active_decoder(self, sdr_id, session_id, vfo_number=None):
        """
        Get the active decoder for a session and optionally a specific VFO.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier
            vfo_number: VFO number (1-4). If None, returns first decoder found

        Returns:
            Decoder instance or None if not found
        """
        return self.decoder_manager.get_active_decoder(sdr_id, session_id, vfo_number)

    # ==================== Utility Methods ====================

    def _signal_handler(self, signum, frame):
        """
        Handle system signals for graceful shutdown

        Args:
            signum: Signal number
            frame: Current stack frame
        """
        self.logger.info(f"Received signal {signum}, shutting down all SDR processes...")
        for sdr_id in list(self.processes.keys()):
            asyncio.create_task(self.stop_sdr_process(sdr_id))


# Set up the process manager
process_manager = ProcessManager()
