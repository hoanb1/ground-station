import logging
import threading
import time

import numpy as np

from vfos.state import VFOManager

# Configure logging
logger = logging.getLogger("audio-producer")


class WebAudioProducer(threading.Thread):
    def __init__(self, audio_queue):
        super().__init__(daemon=True, name="Ground Station - WebAudioProducer")
        self.audio_queue = audio_queue
        self.sample_rate = 44100
        self.chunk_size = 2048  # Reduced from 4096 to 512 (~11.6ms latency)
        self.running = True
        self.vfo_manager = VFOManager()

        # Tone generation parameters
        self.frequency = 440.0
        self.phase = 0.0
        self.amplitude = 0.3

        # Pre-allocate buffers to avoid memory allocation during runtime
        self.sample_indices = np.arange(self.chunk_size)
        self.audio_buffer = np.zeros(self.chunk_size, dtype=np.float32)
        self.phase_increment = 2.0 * np.pi * self.frequency / self.sample_rate

    def _has_active_selected_vfos(self) -> bool:
        """Check if any session has active and selected VFOs."""
        session_ids = self.vfo_manager.get_all_session_ids()

        # logger.info(f"session_ids: {session_ids}")

        for session_id in session_ids:
            selected_vfo = self.vfo_manager.get_selected_vfo(session_id)
            # logger.info(f"session: {session_id} with selected vfo: {selected_vfo}")
            if selected_vfo and selected_vfo.active and selected_vfo.selected:
                return True

        return False

    def run(self):
        """
        WebAudioProducer is now disabled as audio is produced by demodulators.

        The audio flow is:
        - FM/AM/SSB Demodulators → audio_queue → WebAudioConsumer → Browser

        This thread remains for backward compatibility but does nothing.
        It can be removed entirely if desired.
        """
        logger.info("WebAudioProducer started (disabled - demodulators produce audio directly)")

        while self.running:
            try:
                # Just sleep - demodulators are producing audio directly
                time.sleep(1.0)

            except Exception as e:
                logger.error(f"Audio producer error: {e}")
                break

    def stop(self):
        self.running = False
