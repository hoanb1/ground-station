# Ground Station - Web Audio Consumer
# Developed by Claude (Anthropic AI) for the Ground Station project
#
# This module bridges the gap between demodulated audio (from FM/AM/SSB demodulators)
# and web clients via Socket.IO. It runs as a background thread that:
#
# 1. Consumes audio chunks from the shared audio_queue (fed by demodulators)
# 2. Applies per-session VFO settings (volume, active/mute state)
# 3. Routes audio only to the originating session (multi-user support)
# 4. Emits audio data to web clients via Socket.IO for real-time playback
# 5. Includes VFO state information with each audio packet
#
# This ensures each user hears only their own VFO's audio with their own
# volume settings, enabling multiple independent receivers on the same SDR hardware.
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
                # Get audio message from queue (now contains session_id and audio data)
                audio_message = self.audio_queue.get(timeout=1.0)

                # Extract session_id and audio chunk from the message
                originating_session_id = audio_message.get("session_id")
                audio_chunk = audio_message.get("audio")

                if originating_session_id is None or audio_chunk is None:
                    logger.warning("Received malformed audio message, skipping")
                    self.audio_queue.task_done()
                    continue

                # Only process audio for the originating session
                try:
                    # Get currently selected VFO state for this session
                    vfo_state = self.vfo_manager.get_selected_vfo(originating_session_id)

                    # Check if VFO is neither active nor selected - if so, skip
                    if vfo_state is None or (not vfo_state.active and not vfo_state.selected):
                        self.audio_queue.task_done()
                        continue

                    # Process audio based on VFO settings
                    if vfo_state.active:
                        # Convert volume from the 0-100 range to 0.0-1.5 multiplier
                        volume_multiplier = vfo_state.volume / 100.0 * 1.5
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

                    # Detect if audio is stereo (interleaved L/R) or mono
                    # Stereo demodulators produce interleaved samples: [L0, R0, L1, R1, ...]
                    # Mono demodulators produce: [M0, M1, M2, ...]
                    # We detect stereo by checking if modulation is FM_STEREO
                    is_stereo = vfo_state.modulation.upper() == "FM_STEREO"
                    channels = 2 if is_stereo else 1

                    # Schedule the emit() in the main event loop ONLY for the originating session
                    # Use fire-and-forget to avoid blocking the audio consumer thread
                    asyncio.run_coroutine_threadsafe(
                        self.sio.emit(
                            "audio-data",
                            {
                                "samples": audio_data,
                                "sample_rate": 44100,
                                "channels": channels,  # Mono (1) or Stereo (2)
                                "format": "float32",  # Specify format
                                "length": len(
                                    audio_data
                                ),  # Number of samples (including both L and R for stereo)
                                "vfo": vfo_data,
                                "session_id": originating_session_id,
                            },
                            room=originating_session_id,
                        ),  # Emit ONLY to the originating session
                        self.loop,
                    )
                    # Don't wait for result - fire and forget to keep audio flowing

                except Exception as e:
                    logger.error(
                        f"Error processing audio for session {originating_session_id} when sending audio data: {e}"
                    )

                # Mark the task as done after processing
                self.audio_queue.task_done()

            except queue.Empty:
                # Continue if no data available
                continue
            except Exception as e:
                logger.error(f"Audio consumer error: {e}")
                continue

    def stop(self):
        self.running = False
