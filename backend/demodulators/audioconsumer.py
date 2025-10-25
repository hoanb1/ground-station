import asyncio
import logging
import queue
import threading

import numpy as np

from vfos.state import VFOManager

# Configure logging
logger = logging.getLogger("audio-consumer")


class WebAudioConsumer(threading.Thread):
    def __init__(self, audio_queue, sio, loop):
        super().__init__(daemon=True, name="Ground Station - WebAudioConsumer")
        self.audio_queue = audio_queue
        self.sio = sio
        self.loop = loop  # Pass the main event loop
        self.vfo_manager = VFOManager()  # Singleton VFO manager
        self.running = True

    def run(self):
        while self.running:
            try:
                # Get audio chunk from queue
                audio_chunk = self.audio_queue.get(timeout=1.0)

                # Get all active session IDs
                session_ids = self.vfo_manager.get_all_session_ids()

                # Process audio for each active session
                for session_id in session_ids:
                    try:
                        # Get currently selected VFO state for this session
                        vfo_state = self.vfo_manager.get_selected_vfo(session_id)

                        # Check if VFO is neither active nor selected - if so, skip this session
                        if vfo_state is None or (not vfo_state.active and not vfo_state.selected):
                            continue

                        # Process audio based on VFO settings
                        if vfo_state.active:
                            # Convert volume from the 0-100 range to 0.0-1.0 multiplier
                            volume_multiplier = vfo_state.volume / 100.0
                            processed_audio = audio_chunk * volume_multiplier
                        else:
                            # Mute if VFO is inactive but still selected
                            processed_audio = np.zeros_like(audio_chunk)

                        # Prepare VFO data for transmission
                        vfo_data = {
                            "center_freq": vfo_state.center_freq,
                            "bandwidth": vfo_state.bandwidth,
                            "modulation": vfo_state.modulation,
                            "active": vfo_state.active,
                            "selected": vfo_state.selected,
                            "volume": vfo_state.volume,
                            "squelch": vfo_state.squelch,
                            "vfo_number": vfo_state.vfo_number,
                        }

                        # Convert to Web Audio compatible format
                        # Ensure float32 format and proper range (-1.0 to 1.0)
                        processed_audio = processed_audio.astype(np.float32)
                        processed_audio = np.clip(processed_audio, -1.0, 1.0)

                        # Convert to a list for JSON serialization
                        audio_data = processed_audio.tolist()

                        # Schedule the emit() in the main event loop for this specific session
                        future = asyncio.run_coroutine_threadsafe(
                            self.sio.emit(
                                "audio-data",
                                {
                                    "samples": audio_data,
                                    "sample_rate": 44100,
                                    "channels": 1,  # Mono audio
                                    "format": "float32",  # Specify format
                                    "length": len(audio_data),  # Number of samples
                                    "vfo": vfo_data,
                                    "session_id": session_id,  # Include session_id in the emitted data
                                },
                                room=session_id,
                            ),  # Emit to specific session room
                            self.loop,
                        )

                        # Wait for completion with timeout
                        try:
                            future.result(timeout=0.1)  # Short timeout to avoid blocking
                        except asyncio.TimeoutError:
                            logger.warning(
                                f"Socket.IO emit timed out for session {session_id} when sending audio data"
                            )

                    except Exception as e:
                        logger.error(
                            f"Error processing audio for session {session_id} when sending audio data: {e}"
                        )
                        continue

                # Mark the task as done after processing all sessions
                self.audio_queue.task_done()

            except queue.Empty:
                # Continue if no data available
                continue
            except Exception as e:
                logger.error(f"Audio consumer error: {e}")
                continue

    def stop(self):
        self.running = False
