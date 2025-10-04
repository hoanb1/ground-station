import logging
import queue
import threading
import time

import numpy as np
import socketio

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
        while self.running:
            try:
                # Check if there are any active and selected VFOs
                if not self._has_active_selected_vfos():
                    # No active VFOs, sleep a bit longer and skip audio generation
                    time.sleep(0.1)  # 100ms sleep when no active VFOs
                    continue

                # We have at least one active and selected VFO from the user,
                # let's generate a continuous sine wave chunk

                # Calculate phase increment per sample
                phase_increment = 2.0 * np.pi * self.frequency / self.sample_rate

                # Generate sample indices for this chunk
                # sample_indices = np.arange(self.chunk_size)  # Remove this line

                # Calculate phases for all samples in this chunk
                phases = self.phase + (self.sample_indices * self.phase_increment)

                # Generate sine wave directly into pre-allocated buffer
                np.sin(phases, out=self.audio_buffer)
                self.audio_buffer *= self.amplitude

                # Update phase for next chunk (maintain continuity)
                self.phase = (self.phase + (self.chunk_size * self.phase_increment)) % (2.0 * np.pi)

                # Put chunk in queue
                self.audio_queue.put(self.audio_buffer.copy(), timeout=1.0)

                # More aggressive timing for lower latency
                sleep_time = (self.chunk_size / self.sample_rate) * 0.8  # Reduced from 0.9 to 0.8
                time.sleep(sleep_time)

            except queue.Full:
                continue
            except Exception as e:
                print(f"Audio producer error: {e}")
                break

    def stop(self):
        self.running = False
