# Ground Station - Transcription Worker Base Class
# Developed by Claude (Anthropic AI) for the Ground Station project
#
# This module provides an abstract base class for transcription workers that
# stream audio to various speech-to-text APIs. It handles:
#
# 1. Audio buffering and queue management
# 2. Audio resampling and format conversion
# 3. Performance statistics tracking
# 4. Socket.IO event emissions to frontend
# 5. Thread lifecycle management
#
# Provider-specific implementations (Gemini, Deepgram, etc.) extend this class
# and implement the abstract methods for their specific API requirements.
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
import time
from abc import ABC, abstractmethod
from asyncio import Task
from typing import Any, Dict, List, Optional

import numpy as np
from scipy import signal

# Configure logging
logger = logging.getLogger("transcription")


class TranscriptionWorker(ABC, threading.Thread):
    """
    Abstract base class for transcription workers.

    Handles common functionality like audio buffering, resampling, stats tracking,
    and Socket.IO events. Provider-specific implementations extend this class.
    """

    def __init__(
        self,
        transcription_queue,
        sio,
        loop,
        api_key: str,
        session_id: str,
        vfo_number: int,
        language: str = "auto",
        translate_to: str = "none",
        provider_name: str = "unknown",
    ):
        """
        Initialize the transcription worker.

        Args:
            transcription_queue: Queue receiving audio from per-VFO AudioBroadcaster
            sio: Socket.IO server instance for emitting to frontend
            loop: Asyncio event loop
            api_key: API key for the transcription service
            session_id: Session identifier
            vfo_number: VFO number (1-4)
            language: Source language code (e.g., "en", "es", "auto")
            translate_to: Target language code for translation (e.g., "en", "none")
            provider_name: Name of the provider (e.g., "gemini", "deepgram")
        """
        super().__init__(
            daemon=True,
            name=f"Ground Station - {provider_name.capitalize()}Worker-{session_id[:8]}-VFO{vfo_number}",
        )
        self.transcription_queue = transcription_queue
        self.sio = sio
        self.loop = loop
        self.api_key = api_key
        self.running = True
        self.provider_name = provider_name

        # VFO-specific settings (immutable after creation)
        self.session_id = session_id
        self.vfo_number = vfo_number
        self.language = language
        self.translate_to = translate_to

        # Audio buffer for this VFO (stores dicts with audio data and type)
        self.audio_buffer: List[Dict[str, Any]] = []

        # Streaming settings - configurable by subclasses
        self.chunk_duration = 3.0  # Send audio every 3 seconds for better context
        self.input_sample_rate = 44100  # Input from demodulators
        self.target_sample_rate = 16000  # Most APIs prefer 16kHz
        self.silence_threshold = 0.001  # RMS threshold for silence detection

        # Connection state
        self.connected: bool = False
        self.receiver_task: Optional[Task] = None

        # Connection backoff to prevent quota exhaustion
        self.last_connection_attempt = 0.0
        self.connection_backoff_seconds = 60

        # Performance monitoring stats
        self.stats: Dict[str, Any] = {
            "audio_chunks_in": 0,
            "audio_samples_in": 0,
            "transcriptions_sent": 0,
            "transcriptions_received": 0,
            "queue_timeouts": 0,
            "last_activity": None,
            "errors": 0,
            "connection_attempts": 0,
            "connection_failures": 0,
            "audio_samples_per_sec": 0.0,
            "audio_chunks_per_sec": 0.0,
            "is_connected": False,
            "audio_type": "unknown",
        }
        self.stats_lock = threading.Lock()

    def run(self):
        """Main processing loop"""
        logger.info(
            f"{self.provider_name.capitalize()} transcription worker started for session {self.session_id[:8]} "
            f"VFO {self.vfo_number} (language={self.language}, translate_to={self.translate_to})"
        )

        # Send initial status to UI
        self._send_status_to_ui("idle")

        # Rate tracking and stats heartbeat
        rate_window_start = time.time()
        rate_samples_accum = 0
        rate_chunks_accum = 0
        last_stats_time = time.time()
        last_status_print = time.time()

        while self.running:
            try:
                # Get audio message from queue
                audio_message = self.transcription_queue.get(timeout=1.0)

                # Update stats
                with self.stats_lock:
                    self.stats["audio_chunks_in"] += 1
                    self.stats["last_activity"] = time.time()

                # Extract audio chunk and metadata
                audio_chunk = audio_message.get("audio")
                audio_type = audio_message.get("audio_type", "mono")

                if audio_chunk is None:
                    logger.warning("Received malformed audio message for transcription")
                    self.transcription_queue.task_done()
                    continue

                # Update sample count and rate accumulators
                with self.stats_lock:
                    self.stats["audio_samples_in"] += len(audio_chunk)
                    self.stats["audio_type"] = audio_type
                rate_samples_accum += len(audio_chunk)
                rate_chunks_accum += 1

                # Add audio to buffer along with its type
                self.audio_buffer.append({"audio": audio_chunk, "type": audio_type})

                # Calculate total duration of buffered audio
                total_samples = sum(len(chunk["audio"]) for chunk in self.audio_buffer)
                is_stereo = audio_type == "stereo"

                if is_stereo:
                    duration = (total_samples / 2) / self.input_sample_rate
                else:
                    duration = total_samples / self.input_sample_rate

                # Send when we have accumulated chunk_duration seconds
                if duration >= self.chunk_duration:
                    # Concatenate all buffered chunks
                    concatenated = np.concatenate([chunk["audio"] for chunk in self.audio_buffer])

                    # Convert stereo to mono if needed
                    if is_stereo:
                        left_channel = concatenated[0::2]
                        right_channel = concatenated[1::2]
                        concatenated = (left_channel + right_channel) / 2.0

                    # Check if audio has sufficient energy (not just silence)
                    rms = np.sqrt(np.mean(concatenated**2))

                    if rms >= self.silence_threshold:
                        # Ensure audio is mono float32
                        audio_array = np.array(concatenated, dtype=np.float32)

                        # Clear buffer
                        self.audio_buffer = []

                        # Stream to provider
                        asyncio.run_coroutine_threadsafe(
                            self._stream_audio(audio_data=audio_array),
                            self.loop,
                        )
                    else:
                        # Silence detected, clear buffer
                        self.audio_buffer = []

                self.transcription_queue.task_done()

            except queue.Empty:
                with self.stats_lock:
                    self.stats["queue_timeouts"] += 1
                continue

            except Exception as e:
                logger.error(f"Transcription worker error: {e}", exc_info=True)
                with self.stats_lock:
                    self.stats["errors"] += 1
                continue
            finally:
                # Time-based stats tick (every ~1s), compute rates
                now = time.time()
                if now - last_stats_time >= 1.0:
                    dt = now - rate_window_start
                    if dt > 0:
                        rate_sps = rate_samples_accum / dt
                        rate_cps = rate_chunks_accum / dt
                    else:
                        rate_sps = 0.0
                        rate_cps = 0.0

                    with self.stats_lock:
                        self.stats["audio_samples_per_sec"] = rate_sps
                        self.stats["audio_chunks_per_sec"] = rate_cps
                        self.stats["is_connected"] = self.connected

                    # Reset window
                    rate_window_start = now
                    rate_samples_accum = 0
                    rate_chunks_accum = 0
                    last_stats_time = now

                # Print status every 5 seconds
                if now - last_status_print >= 5.0:
                    with self.stats_lock:
                        stats_copy = self.stats.copy()
                    logger.info(
                        f"[{self.provider_name.upper()}] [VFO {self.vfo_number}] "
                        f"Connected={stats_copy['is_connected']}, "
                        f"AudioType={stats_copy['audio_type']}, "
                        f"Audio Rate={stats_copy['audio_chunks_per_sec']:.1f} chunks/s, "
                        f"Sent={stats_copy['transcriptions_sent']}, "
                        f"Received={stats_copy['transcriptions_received']}, "
                        f"Errors={stats_copy['errors']}"
                    )

                    # Emit status to frontend
                    self._send_status_to_ui(
                        "transcribing" if stats_copy["is_connected"] else "idle"
                    )

                    last_status_print = now

        logger.info(f"{self.provider_name.capitalize()} transcription worker stopped")

    def _send_status_to_ui(self, status: str):
        """
        Send status update to UI via Socket.IO.

        Args:
            status: Status string ("idle", "connecting", "transcribing", "closed")
        """
        with self.stats_lock:
            stats_copy = self.stats.copy()

        asyncio.run_coroutine_threadsafe(
            self.sio.emit(
                "decoder-data",
                {
                    "type": "decoder-status",
                    "session_id": self.session_id,
                    "vfo": self.vfo_number,
                    "decoder_type": "transcription",
                    "decoder_id": f"transcription_{self.session_id}_{self.vfo_number}",
                    "status": status,
                    "timestamp": time.time(),
                    "progress": None,
                    "mode": None,
                    "info": {
                        "provider": self.provider_name,
                        "language": self.language,
                        "translate_to": self.translate_to,
                        "audio_type": stats_copy["audio_type"],
                        "audio_chunks_in": stats_copy["audio_chunks_in"],
                        "audio_samples_in": stats_copy["audio_samples_in"],
                        "transcriptions_sent": stats_copy["transcriptions_sent"],
                        "transcriptions_received": stats_copy["transcriptions_received"],
                        "queue_timeouts": stats_copy["queue_timeouts"],
                        "errors": stats_copy["errors"],
                        "connection_attempts": stats_copy["connection_attempts"],
                        "connection_failures": stats_copy["connection_failures"],
                        "audio_samples_per_sec": stats_copy["audio_samples_per_sec"],
                        "audio_chunks_per_sec": stats_copy["audio_chunks_per_sec"],
                    },
                },
                room=self.session_id,
            ),
            self.loop,
        )

    def _resample_audio(
        self, audio_array: np.ndarray, target_rate: Optional[int] = None
    ) -> np.ndarray:
        """
        Resample audio from input_sample_rate to target_sample_rate.

        Args:
            audio_array: Audio samples as float32 numpy array
            target_rate: Target sample rate (defaults to self.target_sample_rate)

        Returns:
            Resampled audio as float32 numpy array
        """
        if target_rate is None:
            target_rate = self.target_sample_rate

        if self.input_sample_rate == target_rate:
            return audio_array

        num_samples = int(len(audio_array) * target_rate / self.input_sample_rate)
        return signal.resample(audio_array, num_samples).astype(np.float32)

    def _normalize_audio(self, audio_array: np.ndarray, target_level: float = 0.7) -> np.ndarray:
        """
        Normalize audio amplitude to target level.

        Args:
            audio_array: Audio samples as numpy array
            target_level: Target amplitude level (0.0 to 1.0)

        Returns:
            Normalized audio array
        """
        peak = np.max(np.abs(audio_array))
        if peak > 0.001:  # Avoid division by zero
            return audio_array * (target_level / peak)
        return audio_array

    async def _send_error_to_ui(self, error: Exception):
        """
        Send user-friendly error message to UI via Socket.IO.

        Args:
            error: Exception that occurred
        """
        error_str = str(error).lower()

        # Detect specific error types
        if "quota" in error_str or "exceeded" in error_str:
            error_type = "quota_exceeded"
            error_message = f"{self.provider_name.capitalize()} API quota exceeded"
            error_details = "API quota limit reached. Check your billing or wait for quota reset."
        elif "api key" in error_str or "authentication" in error_str or "unauthorized" in error_str:
            error_type = "invalid_api_key"
            error_message = f"Invalid {self.provider_name.capitalize()} API key"
            error_details = (
                "The API key is invalid or has been revoked. Please check your settings."
            )
        elif "rate limit" in error_str:
            error_type = "rate_limit"
            error_message = f"{self.provider_name.capitalize()} rate limit reached"
            error_details = "Sending requests too quickly. Wait a moment and try again."
        elif "deadline" in error_str or "timeout" in error_str:
            # Timeout errors are recoverable - don't send to UI
            return
        elif "network" in error_str or "connection" in error_str:
            error_type = "network_error"
            error_message = f"Network error connecting to {self.provider_name.capitalize()}"
            error_details = "Could not connect. Check your internet connection."
        else:
            error_type = "unknown_error"
            error_message = f"Transcription error: {str(error)[:100]}"
            error_details = str(error)

        await self.sio.emit(
            "transcription-error",
            {
                "session_id": self.session_id,
                "vfo_number": self.vfo_number,
                "provider": self.provider_name,
                "error_type": error_type,
                "message": error_message,
                "details": error_details,
                "timestamp": __import__("datetime").datetime.now().isoformat(),
            },
            room=self.session_id,
        )

    async def _emit_transcription(
        self, text: str, language: str, is_final: bool, confidence: Optional[float] = None
    ):
        """
        Emit transcription result to UI.

        Args:
            text: Transcribed text
            language: Detected/configured language code
            is_final: Whether this is a final or partial transcription
            confidence: Optional confidence score (0.0 to 1.0)
        """
        transcription_data = {
            "text": text,
            "session_id": self.session_id,
            "vfo_number": self.vfo_number,
            "language": language,
            "is_final": is_final,
            "provider": self.provider_name,
        }

        if confidence is not None:
            transcription_data["confidence"] = confidence

        # Log based on completeness
        log_type = "final" if is_final else "partial"
        logger.info(f"[{self.provider_name.upper()}] Transcription {log_type} ({language}): {text}")

        await self.sio.emit("transcription-data", transcription_data, room=self.session_id)

        # Update stats
        with self.stats_lock:
            self.stats["transcriptions_received"] += 1

    def stop(self):
        """Stop the transcription worker"""
        logger.info(f"Stopping {self.provider_name} transcription worker...")
        self.running = False

        # Send final status to UI
        self._send_status_to_ui("closed")

    # Abstract methods that must be implemented by subclasses

    @abstractmethod
    async def _connect(self):
        """
        Connect to the transcription service API.
        Must set self.connected = True on success.
        """
        pass

    @abstractmethod
    async def _disconnect(self):
        """
        Disconnect from the transcription service API.
        Must set self.connected = False.
        """
        pass

    @abstractmethod
    async def _send_audio_to_provider(self, audio_data: np.ndarray):
        """
        Send audio data to the provider's API.

        Args:
            audio_data: Audio samples as float32 numpy array
        """
        pass

    @abstractmethod
    async def _receive_loop(self):
        """
        Background task to receive transcription results from the provider.
        Should call self._emit_transcription() when results are received.
        """
        pass

    async def _stream_audio(self, audio_data: np.ndarray):
        """
        Stream audio to the transcription service.

        Args:
            audio_data: Audio samples as numpy array (44.1kHz float32)
        """
        try:
            # Check if API key is configured
            if not self.api_key:
                logger.debug(
                    f"No API key configured for {self.provider_name}, skipping transcription"
                )
                return

            # Connect if not connected
            if not self.connected:
                # Check backoff period
                time_since_last_attempt = time.time() - self.last_connection_attempt
                if time_since_last_attempt < self.connection_backoff_seconds:
                    return

                self._send_status_to_ui("connecting")
                self.last_connection_attempt = time.time()

                # Update connection attempt stats
                with self.stats_lock:
                    self.stats["connection_attempts"] += 1

                await self._connect()

                # Start receiver task if not already running
                if self.connected and (self.receiver_task is None or self.receiver_task.done()):
                    self.receiver_task = asyncio.create_task(self._receive_loop())

            # Send audio to provider
            if self.connected:
                await self._send_audio_to_provider(audio_data)

                # Update stats
                with self.stats_lock:
                    self.stats["transcriptions_sent"] += 1

        except Exception as e:
            logger.error(f"Audio streaming error: {e}", exc_info=True)
            self.connected = False

            # Update connection failure stats
            with self.stats_lock:
                self.stats["connection_failures"] += 1

            await self._send_error_to_ui(e)
