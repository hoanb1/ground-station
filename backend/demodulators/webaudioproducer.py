import threading
import queue
import time
import numpy as np
import socketio
from vfos.state import VFOManager

class WebAudioProducer(threading.Thread):
    def __init__(self, audio_queue):
        super().__init__(daemon=True, name="WebAudioProducer")
        self.audio_queue = audio_queue
        self.sample_rate = 44100
        self.chunk_size = 4096  # Increased from 1024 to 4096 (about 93ms)
        self.running = True
        self.vfo_manager = VFOManager()

        # Tone generation parameters
        self.frequency = 440.0  # 440 Hz (A4 note)
        self.phase = 0.0  # Track phase to ensure continuity between chunks
        self.amplitude = 0.3  # Lower amplitude to avoid clipping

    def _has_active_selected_vfos(self) -> bool:
        """Check if any session has active and selected VFOs."""
        session_ids = self.vfo_manager.get_all_session_ids()

        for session_id in session_ids:
            selected_vfo = self.vfo_manager.get_selected_vfo(session_id)
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

                # Generate continuous sine wave chunk
                # Calculate phase increment per sample
                phase_increment = 2.0 * np.pi * self.frequency / self.sample_rate

                # Generate sample indices for this chunk
                sample_indices = np.arange(self.chunk_size)

                # Calculate phases for all samples in this chunk
                phases = self.phase + (sample_indices * phase_increment)

                # Generate sine wave
                audio_chunk = (self.amplitude * np.sin(phases)).astype(np.float32)

                # Update phase for next chunk (maintain continuity)
                self.phase = (self.phase + (self.chunk_size * phase_increment)) % (2.0 * np.pi)

                # Put chunk in queue
                self.audio_queue.put(audio_chunk, timeout=1.0)

                # More precise timing
                sleep_time = (self.chunk_size / self.sample_rate) * 0.9  # Slight overlap
                time.sleep(sleep_time)

            except queue.Full:
                continue
            except Exception as e:
                print(f"Audio producer error: {e}")
                break

    def stop(self):
        self.running = False