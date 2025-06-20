import threading
import queue
import time
import numpy as np
import socketio

class WebAudioProducer(threading.Thread):
    def __init__(self, audio_queue):
        super().__init__(daemon=True)
        self.audio_queue = audio_queue
        self.sample_rate = 44100
        self.chunk_size = 1024
        self.running = True

    def run(self):
        while self.running:
            try:
                # Generate white noise chunk
                audio_chunk = np.random.uniform(-1.0, 1.0, self.chunk_size).astype(np.float32)

                # Put chunk in queue
                self.audio_queue.put(audio_chunk, timeout=1.0)

                # Simulate real-time audio timing
                time.sleep(self.chunk_size / self.sample_rate)

            except queue.Full:
                # Skip if queue is full
                continue
            except Exception as e:
                print(f"Audio producer error: {e}")
                break

    def stop(self):
        self.running = False


