# Ground Station - Transcription Consumer
# Developed by Claude (Anthropic AI) for the Ground Station project
#
# This module connects to DeBabel transcription service and streams audio for
# real-time speech-to-text conversion. It runs as a background thread that:
#
# 1. Consumes audio chunks from the transcription queue (fed by AudioBroadcaster)
# 2. Buffers audio into appropriate chunks for transcription (3-5 seconds)
# 3. Connects to DeBabel via WebSocket
# 4. Sends audio with optional per-VFO settings (model, language)
# 5. Receives transcriptions and emits them to frontend via Socket.IO
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

        # Per-session audio buffers
        # {session_id: {"buffer": [], "model": "small.en", "language": "en"}}
        self.session_buffers: Dict[str, dict] = {}

        # Buffer settings (in seconds)
        self.min_buffer_duration = (
            5.0  # Minimum 5 seconds before sending (better context for accuracy)
        )
        self.max_buffer_duration = 8.0  # Maximum 8 seconds (prevent queue buildup)
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
                if vfo_state is None or not getattr(vfo_state, "transcription_enabled", False):
                    self.transcription_queue.task_done()
                    continue

                # Initialize buffer for new session
                if session_id not in self.session_buffers:
                    self.session_buffers[session_id] = {
                        "buffer": [],
                        "model": getattr(vfo_state, "transcription_model", "small.en"),
                        "language": getattr(vfo_state, "transcription_language", "en"),
                    }

                # Add audio to buffer
                self.session_buffers[session_id]["buffer"].append(audio_chunk)

                # Calculate buffered duration
                total_samples = sum(
                    len(chunk) for chunk in self.session_buffers[session_id]["buffer"]
                )
                duration = total_samples / self.sample_rate

                # Send to DeBabel when buffer is full enough
                if duration >= self.min_buffer_duration:
                    self._send_for_transcription(session_id)

                self.transcription_queue.task_done()

            except queue.Empty:
                # Check for any buffers that have been waiting too long
                self._flush_old_buffers()
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

        # Normalize audio to use full dynamic range without clipping
        max_val = np.abs(audio_array).max()
        if max_val > 0:
            # Normalize to 0.8 to leave headroom
            audio_array = audio_array * (0.8 / max_val)

        # Clear buffer
        buffer_data["buffer"] = []

        # Send to DeBabel asynchronously
        asyncio.run_coroutine_threadsafe(
            self._transcribe_audio(
                session_id=session_id,
                audio_data=audio_array,
                model=buffer_data["model"],
                language=buffer_data["language"],
            ),
            self.loop,
        )

    def _flush_old_buffers(self):
        """Flush any buffers that have been waiting too long"""
        for session_id in list(self.session_buffers.keys()):
            buffer_data = self.session_buffers[session_id]
            if buffer_data["buffer"]:
                total_samples = sum(len(chunk) for chunk in buffer_data["buffer"])
                duration = total_samples / self.sample_rate

                if duration >= self.max_buffer_duration:
                    logger.debug(f"Flushing buffer for session {session_id} ({duration:.1f}s)")
                    self._send_for_transcription(session_id)

    async def _receiver_loop(self):
        """Background task to receive transcription results from DeBabel"""
        while self.running and self.ws_connected:
            try:
                if not self.ws_connection:
                    await asyncio.sleep(0.1)
                    continue

                # Receive transcription result
                response = await asyncio.wait_for(self.ws_connection.recv(), timeout=1.0)
                result = json.loads(response)

                session_id = result.get("client_id", "unknown")

                # Emit transcription to frontend
                if result.get("text"):
                    await self.sio.emit(
                        "transcription-data",
                        {
                            "text": result["text"],
                            "start": result.get("start", 0),
                            "end": result.get("end", 0),
                            "confidence": result.get("confidence", 0),
                            "language": result.get("language", "unknown"),
                            "session_id": session_id,
                        },
                        room=session_id,
                    )
                    logger.info(f"[{session_id}] Transcription: {result['text']}")
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
                    ping_interval=None,  # Disable ping (causes issues during processing)
                    ping_timeout=None,  # Disable ping timeout
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

            # Send audio (don't wait for response - receiver task handles that)
            if self.ws_connection:
                await self.ws_connection.send(json.dumps(message))
            logger.debug(
                f"Sent {len(audio_data)/self.sample_rate:.1f}s audio to DeBabel (session: {session_id})"
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
