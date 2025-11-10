# Ground Station - Transcription Consumer
# Developed by Claude (Anthropic AI) for the Ground Station project
#
# This module connects to DeBabel transcription service and streams audio for
# real-time speech-to-text conversion. It runs as a background thread that:
#
# 1. Consumes audio chunks from the transcription queue (fed by AudioBroadcaster)
# 2. Buffers audio into 3-5 second chunks for transcription
# 3. Connects to DeBabel via WebSocket
# 4. Sends audio chunks immediately without waiting for transcription results
# 5. Receives transcriptions asynchronously and emits them to frontend via Socket.IO
#
# Architecture: Asynchronous send/receive pattern
# - Audio chunks are sent immediately to DeBabel (every 3-5 seconds)
# - DeBabel queues and processes chunks independently
# - Transcription results arrive asynchronously with stats (queue depth, confidence, processing time)
#
# Transcription is per-VFO controllable - each VFO can enable/disable transcription
# independently with custom model and language settings.
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
import json
import logging
import queue
import threading
from asyncio import Task
from typing import Dict, Optional

import numpy as np
import websockets

from vfos.state import VFOManager

# Configure logging
logger = logging.getLogger("transcription-consumer")


class TranscriptionConsumer(threading.Thread):
    """
    Transcription consumer that streams audio to DeBabel service.

    Connects to DeBabel WebSocket API, buffers audio chunks, and sends them
    for transcription. Receives transcription results and forwards to frontend.
    """

    def __init__(self, transcription_queue, sio, loop, debabel_url: str):
        """
        Initialize the transcription consumer.

        Args:
            transcription_queue: Queue receiving audio from AudioBroadcaster
            sio: Socket.IO server instance for emitting to frontend
            loop: Asyncio event loop
            debabel_url: DeBabel WebSocket URL (e.g., ws://localhost:8765)
        """
        super().__init__(daemon=True, name="Ground Station - TranscriptionConsumer")
        self.transcription_queue = transcription_queue
        self.sio = sio
        self.loop = loop
        self.debabel_url = debabel_url
        self.vfo_manager = VFOManager()
        self.running = True

        # Per-session audio buffers (no pending flag - we send immediately)
        # {session_id: {"buffer": [], "model": "small", "language": "en"}}
        self.session_buffers: Dict[str, dict] = {}

        # Buffer settings (in seconds) - hardcoded 3-5 second chunks
        self.chunk_duration = 4.0  # Send audio every 4 seconds
        self.sample_rate = 44100

        # WebSocket connection
        self.ws_connection = None
        self.ws_connected = False
        self.receiver_task: Optional[Task] = None  # Background task for receiving responses

    def update_debabel_url(self, url: str):
        """
        Update the DeBabel URL dynamically.

        Args:
            url: New DeBabel WebSocket URL
        """
        if self.debabel_url != url:
            logger.info(f"Updating DeBabel URL from '{self.debabel_url}' to '{url}'")
            self.debabel_url = url
            # Force reconnect on next transcription
            if self.ws_connected:
                self.ws_connected = False
                if self.ws_connection:
                    asyncio.run_coroutine_threadsafe(self._close_connection(), self.loop)

    async def _close_connection(self):
        """Close WebSocket connection"""
        try:
            if self.ws_connection:
                await self.ws_connection.close()
        except Exception:
            pass

    def run(self):
        """Main processing loop"""
        logger.info(f"Transcription consumer started (DeBabel URL: {self.debabel_url})")

        while self.running:
            try:
                # Get audio message from queue
                audio_message = self.transcription_queue.get(timeout=1.0)

                # Extract session info
                session_id = audio_message.get("session_id")
                audio_chunk = audio_message.get("audio")

                if session_id is None or audio_chunk is None:
                    logger.warning("Received malformed audio message for transcription")
                    self.transcription_queue.task_done()
                    continue

                # Check if transcription is enabled for this VFO
                vfo_state = self.vfo_manager.get_selected_vfo(session_id)
                if vfo_state is None:
                    logger.debug(f"No VFO state for session {session_id}")
                    self.transcription_queue.task_done()
                    continue

                transcription_enabled = getattr(vfo_state, "transcription_enabled", False)
                if not transcription_enabled:
                    self.transcription_queue.task_done()
                    continue

                # Initialize buffer for new session
                if session_id not in self.session_buffers:
                    self.session_buffers[session_id] = {
                        "buffer": [],
                        "model": getattr(vfo_state, "transcription_model", "small"),
                        "language": getattr(vfo_state, "transcription_language", "en"),
                    }

                # Add audio to buffer
                self.session_buffers[session_id]["buffer"].append(audio_chunk)

                # Calculate buffered duration
                # Note: For stereo audio, samples are interleaved [L, R, L, R, ...]
                # So we need to divide by 2 to get actual frames
                total_samples = sum(
                    len(chunk) for chunk in self.session_buffers[session_id]["buffer"]
                )
                # Check if this is stereo by looking at VFO modulation
                is_stereo = vfo_state.modulation and vfo_state.modulation.upper() == "FM_STEREO"
                frames = total_samples / 2 if is_stereo else total_samples
                duration = frames / self.sample_rate

                # Send to DeBabel immediately when buffer reaches chunk duration
                # No need to wait for response - DeBabel will queue and process asynchronously
                if duration >= self.chunk_duration:
                    logger.info(
                        f"Chunk ready: {duration:.1f}s accumulated, sending to DeBabel immediately..."
                    )
                    self._send_for_transcription(session_id)

                self.transcription_queue.task_done()

            except queue.Empty:
                # Continue - no need to flush buffers, we send immediately at chunk_duration
                continue

            except Exception as e:
                logger.error(f"Transcription consumer error: {e}", exc_info=True)
                continue

        logger.info("Transcription consumer stopped")

    def _send_for_transcription(self, session_id: str):
        """
        Send buffered audio to DeBabel for transcription.

        Args:
            session_id: Session ID to transcribe
        """
        if session_id not in self.session_buffers:
            return

        buffer_data = self.session_buffers[session_id]

        # Concatenate all audio chunks
        audio_array = np.concatenate(buffer_data["buffer"])

        # Get current VFO state to check if stereo and get settings
        vfo_state = self.vfo_manager.get_selected_vfo(session_id)
        is_stereo = (
            vfo_state and vfo_state.modulation and vfo_state.modulation.upper() == "FM_STEREO"
        )

        # Convert stereo to mono if needed (Whisper expects mono audio)
        if is_stereo:
            # Audio is interleaved [L, R, L, R, ...], convert to mono by averaging
            left_channel = audio_array[0::2]
            right_channel = audio_array[1::2]
            audio_array = (left_channel + right_channel) / 2.0
            logger.debug(f"Converted stereo to mono: {len(audio_array)} samples")

        # Normalize audio to use full dynamic range without clipping
        max_val = np.abs(audio_array).max()
        if max_val > 0:
            # Normalize to 0.8 to leave headroom
            audio_array = audio_array * (0.8 / max_val)

        # Clear buffer (no pending flag - send immediately)
        buffer_data["buffer"] = []

        # Get current transcription settings
        current_model = getattr(vfo_state, "transcription_model", "small")
        current_language = getattr(vfo_state, "transcription_language", "en")

        # Send to DeBabel asynchronously with current settings
        asyncio.run_coroutine_threadsafe(
            self._transcribe_audio(
                session_id=session_id,
                audio_data=audio_array,
                model=current_model,
                language=current_language,
            ),
            self.loop,
        )

    async def _receiver_loop(self):
        """Background task to receive transcription results from DeBabel (async)"""
        while self.running and self.ws_connected:
            try:
                if not self.ws_connection:
                    await asyncio.sleep(0.1)
                    continue

                # Receive transcription result asynchronously
                response = await asyncio.wait_for(self.ws_connection.recv(), timeout=1.0)
                result = json.loads(response)

                session_id = result.get("client_id", "unknown")

                # Emit transcription to frontend with stats
                if result.get("text"):
                    transcription_data = {
                        "text": result["text"],
                        "start": result.get("start", 0),
                        "end": result.get("end", 0),
                        "confidence": result.get("confidence", 0),
                        "language": result.get("language", "unknown"),
                        "session_id": session_id,
                    }

                    # Add stats if provided by DeBabel
                    if "stats" in result:
                        transcription_data["stats"] = result["stats"]
                        logger.info(
                            f"[{session_id}] Transcription: {result['text']} "
                            f"(queue: {result['stats'].get('queue_depth', 'N/A')}, "
                            f"processing: {result['stats'].get('processing_time_ms', 'N/A')}ms)"
                        )
                    else:
                        logger.info(f"[{session_id}] Transcription: {result['text']}")

                    await self.sio.emit("transcription-data", transcription_data, room=session_id)

                elif result.get("info") == "no_speech_detected":
                    logger.debug(f"[{session_id}] No speech detected")

            except asyncio.TimeoutError:
                # Timeout is normal, just continue
                continue

            except websockets.exceptions.WebSocketException as e:
                logger.error(f"WebSocket receiver error: {e}")
                self.ws_connected = False
                self.ws_connection = None
                break

            except Exception as e:
                logger.error(f"Receiver error: {e}", exc_info=True)

    async def _transcribe_audio(
        self, session_id: str, audio_data: np.ndarray, model: str, language: str
    ):
        """
        Send audio to DeBabel for transcription.

        Args:
            session_id: Session ID for routing results
            audio_data: Audio samples as numpy array
            model: Whisper model to use
            language: Language code
        """
        try:
            # Check if DeBabel URL is configured
            if not self.debabel_url:
                logger.debug("DeBabel URL not configured, skipping transcription")
                return

            # Connect to DeBabel if not connected
            if not self.ws_connected or self.ws_connection is None:
                logger.info(f"Connecting to DeBabel at {self.debabel_url}")
                # Increase max message size and connection timeout for GPU processing
                self.ws_connection = await websockets.connect(
                    self.debabel_url,
                    max_size=10 * 1024 * 1024,  # 10MB max message
                    open_timeout=30,  # 30 seconds to connect (GPU model loading)
                    close_timeout=10,  # 10 seconds to close
                    ping_interval=60,  # Match server: ping every 60 seconds
                    ping_timeout=60,  # Match server: wait 60 seconds for pong
                )
                self.ws_connected = True
                logger.info("Connected to DeBabel")

                # Start receiver task
                self.receiver_task = asyncio.create_task(self._receiver_loop())

            # Prepare message for DeBabel
            message = {
                "audio": audio_data.tolist(),
                "sample_rate": self.sample_rate,
                "client_id": session_id,
                "model": model,
                "language": language,
            }

            # Send audio immediately (don't wait for response - receiver task handles async results)
            if self.ws_connection:
                await self.ws_connection.send(json.dumps(message))
            logger.debug(
                f"Sent {len(audio_data)/self.sample_rate:.1f}s audio to DeBabel immediately (session: {session_id})"
            )

        except websockets.exceptions.WebSocketException as e:
            logger.error(f"WebSocket send error: {e}")
            self.ws_connected = False
            self.ws_connection = None

        except Exception as e:
            logger.error(f"Transcription send error for session {session_id}: {e}", exc_info=True)

    def stop(self):
        """Stop the transcription consumer"""
        logger.info("Stopping transcription consumer...")
        self.running = False

        # Close WebSocket connection
        if self.ws_connection:
            try:
                asyncio.run_coroutine_threadsafe(self.ws_connection.close(), self.loop)
            except Exception as e:
                logger.error(f"Error closing WebSocket: {e}")
