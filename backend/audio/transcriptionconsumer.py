# Ground Station - Transcription Consumer
# Developed by Claude (Anthropic AI) for the Ground Station project
#
# This module connects to Google Gemini Live API and streams audio for
# real-time speech-to-text conversion. It runs as a background thread that:
#
# 1. Consumes audio chunks from the transcription queue (fed by AudioBroadcaster)
# 2. Streams audio continuously to Gemini Live API (every 0.5 seconds)
# 3. Connects to Gemini Live API for persistent streaming session
# 4. Resamples audio from 44.1kHz to 16kHz and converts to 16-bit PCM
# 5. Sends audio chunks continuously and receives transcriptions in real-time
# 6. Emits partial and final transcriptions to frontend via Socket.IO
#
# Architecture: True continuous streaming pattern
# - Audio chunks are streamed immediately using send_realtime_input()
# - No end_of_turn signals between chunks for continuous flow
# - Gemini processes audio in real-time and returns partial + final transcriptions
# - Results arrive asynchronously via the Live API session with low latency
#
# Transcription is per-VFO controllable - each VFO can enable/disable transcription
# independently with custom language settings.
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
import base64
import logging
import queue
import threading
import time
from asyncio import Task
from typing import Any, Dict, List, Optional

import numpy as np
from scipy import signal

try:
    from google import genai

    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    logging.warning("google-genai package not installed. Transcription will be disabled.")

try:
    from langdetect import LangDetectException, detect

    LANGDETECT_AVAILABLE = True
except ImportError:
    LANGDETECT_AVAILABLE = False
    logging.warning("langdetect package not installed. Language detection will be disabled.")

# Configure logging
logger = logging.getLogger("transcription")

# Reduce websockets logging verbosity to prevent API key exposure
logging.getLogger("websockets.client").setLevel(logging.WARNING)
logging.getLogger("websockets").setLevel(logging.WARNING)


class TranscriptionConsumer(threading.Thread):
    """
    Transcription consumer that streams audio to Google Gemini Live API.

    Connects to Gemini Live API for continuous audio streaming. Small audio chunks (0.5s)
    are resampled to 16kHz and streamed in real-time using send_realtime_input().
    Receives partial and final transcriptions with low latency and forwards to frontend.
    """

    def __init__(
        self,
        transcription_queue,
        sio,
        loop,
        gemini_api_key: str,
        session_id: str,
        vfo_number: int,
        language: str = "auto",
        translate_to: str = "none",
    ):
        """
        Initialize the per-VFO transcription consumer.

        Args:
            transcription_queue: Queue receiving audio from per-VFO AudioBroadcaster
            sio: Socket.IO server instance for emitting to frontend
            loop: Asyncio event loop
            gemini_api_key: Google Gemini API key
            session_id: Session identifier (this consumer is dedicated to this session/VFO)
            vfo_number: VFO number (1-4) this consumer is dedicated to
            language: Source language code (e.g., "en", "es", "auto")
            translate_to: Target language code for translation (e.g., "en", "none")
        """
        super().__init__(
            daemon=True,
            name=f"Ground Station - TranscriptionConsumer-{session_id[:8]}-VFO{vfo_number}",
        )
        self.transcription_queue = transcription_queue
        self.sio = sio
        self.loop = loop
        self.gemini_api_key = gemini_api_key
        self.running = True

        # VFO-specific settings (immutable after creation)
        self.session_id = session_id
        self.vfo_number = vfo_number
        self.language = language
        self.translate_to = translate_to

        # Audio buffer for this VFO (stores dicts with audio data and type)
        self.audio_buffer: List[Dict[str, Any]] = []

        # Streaming settings - send audio frequently for real-time transcription
        self.chunk_duration = 2.0  # Send audio every 2 seconds for better context
        self.input_sample_rate = 44100  # Input from demodulators
        self.gemini_sample_rate = 16000  # Gemini requires 16kHz

        # Gemini Live API session
        self.gemini_client = None
        self.gemini_session = None
        self.gemini_session_context = None  # Context manager for proper cleanup
        self.gemini_connected = False
        self.receiver_task: Optional[Task] = None  # Background task for receiving responses

        # Connection backoff to prevent quota exhaustion
        self.last_connection_attempt = 0.0
        self.connection_backoff_seconds = 60  # Wait 60 seconds after quota error before retrying

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
            # Flow metrics (updated every ~1s)
            "audio_samples_per_sec": 0.0,
            "audio_chunks_per_sec": 0.0,
            "is_connected": False,
            "audio_type": "unknown",  # Track detected audio type (mono/stereo)
        }
        self.stats_lock = threading.Lock()

    async def _close_connection(self):
        """Close Gemini session"""
        try:
            # Exit the context manager properly
            if self.gemini_session_context:
                await self.gemini_session_context.__aexit__(None, None, None)
                self.gemini_session_context = None
            self.gemini_session = None
            self.gemini_connected = False
        except Exception as e:
            logger.error(f"Error closing Gemini connection: {e}")

    def run(self):
        """Main processing loop"""
        logger.info(
            f"Transcription consumer started for session {self.session_id[:8]} "
            f"VFO {self.vfo_number} (language={self.language}, translate_to={self.translate_to})"
        )

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
                audio_type = audio_message.get(
                    "audio_type", "mono"
                )  # Default to mono for backward compatibility

                if audio_chunk is None:
                    logger.warning("Received malformed audio message for transcription")
                    self.transcription_queue.task_done()
                    continue

                # No filtering needed - we subscribe to a dedicated per-VFO audio broadcaster
                # Each VFO's demodulator creates its own AudioBroadcaster

                # Update sample count and rate accumulators
                with self.stats_lock:
                    self.stats["audio_samples_in"] += len(audio_chunk)
                rate_samples_accum += len(audio_chunk)
                rate_chunks_accum += 1

                # Add audio to buffer along with its type
                self.audio_buffer.append({"audio": audio_chunk, "type": audio_type})

                # Update stats with audio type
                with self.stats_lock:
                    self.stats["audio_type"] = audio_type

                # Calculate total duration of buffered audio
                # For stereo audio (FM Stereo), the sample count includes interleaved L+R
                total_samples = sum(len(chunk["audio"]) for chunk in self.audio_buffer)
                is_stereo = audio_type == "stereo"

                if is_stereo:
                    # Calculate duration assuming stereo (half the samples are for mono equivalent)
                    duration = (total_samples / 2) / self.input_sample_rate
                else:
                    # Mono audio
                    duration = total_samples / self.input_sample_rate

                # Send when we have accumulated chunk_duration seconds
                if duration >= self.chunk_duration:
                    # Concatenate all buffered chunks
                    concatenated = np.concatenate([chunk["audio"] for chunk in self.audio_buffer])

                    # Convert stereo to mono if needed
                    # FM Stereo demodulator outputs interleaved stereo: [L, R, L, R, ...]
                    if is_stereo:
                        left_channel = concatenated[0::2]
                        right_channel = concatenated[1::2]
                        concatenated = (left_channel + right_channel) / 2.0

                    # Check if audio has sufficient energy (not just silence)
                    rms = np.sqrt(np.mean(concatenated**2))

                    if rms < 0.001:
                        self.audio_buffer = []
                        continue

                    # Ensure audio is mono float32
                    audio_array = np.array(concatenated, dtype=np.float32)

                    # Clear buffer
                    self.audio_buffer = []

                    # Stream to Gemini immediately (true continuous streaming)
                    asyncio.run_coroutine_threadsafe(
                        self._stream_audio(audio_data=audio_array),
                        self.loop,
                    )

                self.transcription_queue.task_done()

            except queue.Empty:
                # Continue - no need to flush buffers, we send immediately at chunk_duration
                with self.stats_lock:
                    self.stats["queue_timeouts"] += 1
                continue

            except Exception as e:
                logger.error(f"Transcription consumer error: {e}", exc_info=True)
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
                        self.stats["is_connected"] = self.gemini_connected

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
                        f"[VFO {self.vfo_number}] Transcription Status: "
                        f"Connected={stats_copy['is_connected']}, "
                        f"AudioType={stats_copy['audio_type']}, "
                        f"Audio Rate={stats_copy['audio_chunks_per_sec']:.1f} chunks/s, "
                        f"Sent={stats_copy['transcriptions_sent']}, "
                        f"Received={stats_copy['transcriptions_received']}, "
                        f"Errors={stats_copy['errors']}, "
                        f"Language={self.language}, "
                        f"TranslateTo={self.translate_to}"
                    )
                    last_status_print = now

        logger.info("Transcription consumer stopped")

    def _convert_to_gemini_format(self, audio_array: np.ndarray) -> bytes:
        """
        Convert 44.1kHz float32 audio to 16kHz 16-bit PCM for Gemini.

        Args:
            audio_array: Audio samples as float32 numpy array (44.1kHz)

        Returns:
            PCM audio bytes (16kHz, 16-bit)
        """
        # Normalize audio to improve recognition
        # Find peak amplitude
        peak = np.max(np.abs(audio_array))

        if peak > 0.001:  # Avoid division by zero and silence
            # Normalize to 70% of full scale to avoid clipping but maintain good level
            audio_array = audio_array * (0.7 / peak)

        # Resample from 44.1kHz to 16kHz
        num_samples_16k = int(len(audio_array) * self.gemini_sample_rate / self.input_sample_rate)
        resampled = signal.resample(audio_array, num_samples_16k)

        # Convert float32 [-1, 1] to int16 [-32768, 32767]
        audio_int16 = np.clip(resampled * 32767, -32768, 32767).astype(np.int16)

        # Cast to bytes to satisfy mypy
        return bytes(audio_int16.tobytes())

    async def _receiver_loop(self):
        """Background task to receive transcription results from Gemini (async)

        This loop receives ALL responses from Gemini, including partial/incremental
        transcriptions, not just complete turns.
        """
        try:
            # Wait for session to be established
            while not self.gemini_session and self.running and self.gemini_connected:
                await asyncio.sleep(0.1)

            if not self.gemini_session:
                logger.debug("Receiver loop exiting: no session established")
                return

            # Use _receive() directly to get ALL responses (partial + complete)
            while self.running and self.gemini_connected:
                try:
                    response = await self.gemini_session._receive()

                    if not response:
                        continue

                    # Process server content (transcription results)
                    if response.server_content and response.server_content.model_turn:
                        is_complete = getattr(response.server_content, "turn_complete", False)

                        for part in response.server_content.model_turn.parts:
                            if part.text:
                                text = part.text.strip()

                                # Determine language based on translation settings
                                # If translation was requested, use the target language
                                # Otherwise use the configured source language or detect it
                                if self.translate_to and self.translate_to != "none":
                                    # Text is translated, use target language
                                    detected_language = self.translate_to
                                elif self.language and self.language != "auto":
                                    # Use configured source language
                                    detected_language = self.language
                                else:
                                    # Language is auto-detect, use langdetect as fallback
                                    detected_language = "unknown"
                                    if LANGDETECT_AVAILABLE and text:
                                        try:
                                            detected_language = detect(text)
                                        except LangDetectException:
                                            detected_language = "unknown"

                                # Emit all transcriptions (partial and final)
                                # For continuous streams, we get many partial updates
                                transcription_data = {
                                    "text": text,
                                    "session_id": self.session_id,
                                    "vfo_number": self.vfo_number,
                                    "language": detected_language,
                                    "is_final": is_complete,
                                }

                                # Log based on completeness
                                if is_complete:
                                    logger.info(
                                        f"Transcription final ({detected_language}): {text}"
                                    )
                                else:
                                    logger.info(
                                        f"Transcription partial ({detected_language}): {text}"
                                    )

                                # Send to the specific session that owns this transcription
                                await self.sio.emit(
                                    "transcription-data", transcription_data, room=self.session_id
                                )

                                # Update stats for received transcriptions
                                with self.stats_lock:
                                    self.stats["transcriptions_received"] += 1

                except Exception as e:
                    error_str = str(e).lower()
                    # Check if it's a deadline/timeout error - these are recoverable
                    if "deadline" in error_str or "timeout" in error_str:
                        self.gemini_connected = False
                        break
                    # Check if it's a clean close (1000 OK)
                    elif "1000 (ok)" in error_str:
                        logger.debug(f"Receiver closed cleanly: {e}")
                        self.gemini_connected = False
                        break
                    else:
                        logger.error(f"Receiver error: {e}")
                        self.gemini_connected = False
                        break

        except Exception as e:
            if self.gemini_session:  # Only log error if session was active
                logger.error(f"Gemini receiver error: {e}")
            self.gemini_connected = False

    async def _send_error_to_ui(self, error: Exception):
        """
        Send user-friendly error message to UI via Socket.IO.

        Args:
            error: Exception that occurred
        """
        error_str = str(error).lower()

        # Detect specific error types and provide helpful messages
        if "quota" in error_str or "exceeded" in error_str:
            error_type = "quota_exceeded"
            error_message = "Gemini API quota exceeded. Please check your billing at ai.google.dev"
            error_details = "Your Gemini API has reached its quota limit. You may need to enable billing or wait for quota to reset."
        elif "api key" in error_str or "authentication" in error_str or "unauthorized" in error_str:
            error_type = "invalid_api_key"
            error_message = "Invalid Gemini API key. Please check your settings."
            error_details = "The API key you provided is invalid or has been revoked. Please generate a new key at ai.google.dev"
        elif "rate limit" in error_str:
            error_type = "rate_limit"
            error_message = "Gemini API rate limit reached. Please wait a moment."
            error_details = (
                "You are sending requests too quickly. Wait a few seconds and try again."
            )
        elif "deadline" in error_str or "timeout" in error_str:
            # Deadline/timeout errors are recoverable - don't send to UI, just reconnect
            return  # Don't send error to UI for timeouts
        elif "network" in error_str or "connection" in error_str:
            error_type = "network_error"
            error_message = "Network error connecting to Gemini API."
            error_details = "Could not connect to Google's servers. Check your internet connection."
        else:
            error_type = "unknown_error"
            error_message = f"Transcription error: {str(error)[:100]}"
            error_details = str(error)

        # Emit error to frontend (send to specific session)
        await self.sio.emit(
            "transcription-error",
            {
                "session_id": self.session_id,
                "vfo_number": self.vfo_number,
                "error_type": error_type,
                "message": error_message,
                "details": error_details,
                "timestamp": __import__("datetime").datetime.now().isoformat(),
            },
            room=self.session_id,
        )

    async def _connect_to_gemini(self):
        """
        Connect to Gemini Live API and enter the async context.

        Uses the instance's language and translate_to settings.
        """
        try:
            # Update connection attempt stats
            with self.stats_lock:
                self.stats["connection_attempts"] += 1

            # Initialize client
            self.gemini_client = genai.Client(api_key=self.gemini_api_key)

            # Create session config for audio transcription
            # Configure VAD to be more sensitive - detect gaps faster
            config: dict = {
                "response_modalities": ["TEXT"],  # We only want text transcription
                "realtime_input_config": {
                    "automatic_activity_detection": {
                        "disabled": False,
                        "end_of_speech_sensitivity": "END_SENSITIVITY_HIGH",  # Detect end of speech faster
                        "silence_duration_ms": 30,  # Only 50ms of silence needed (more sensitive than default 100ms)
                    }
                },
            }

            # Build system instruction based on language and translation settings
            if self.translate_to != "none":
                # Translation requested
                if self.language != "auto":
                    system_instruction = (
                        f"Transcribe the audio to text (source language: {self.language}) "
                        f"and translate it to {self.translate_to}. "
                        f"Mark unclear words with [inaudible]. "
                        f"Preserve numbers, callsigns, and codes exactly as spoken. "
                        f"Identify and label different speakers if multiple voices are present. "
                        f"Only output the translated text."
                    )
                else:
                    system_instruction = (
                        f"Transcribe the audio to text and translate it to {self.translate_to}. "
                        f"Mark unclear words with [inaudible]. "
                        f"Preserve numbers, callsigns, and codes exactly as spoken. "
                        f"Identify and label different speakers if multiple voices are present. "
                        f"Only output the translated text."
                    )
                config["system_instruction"] = system_instruction
            elif self.language != "auto":
                # Just transcription with language hint
                system_instruction = (
                    f"Transcribe the audio to text. Audio language: {self.language}. "
                    f"Mark unclear words with [inaudible]. "
                    f"Preserve numbers, callsigns, and codes exactly as spoken. "
                    f"Identify and label different speakers if multiple voices are present."
                )
                config["system_instruction"] = system_instruction
            else:
                # Auto-detect language with enhanced instructions
                system_instruction = (
                    "Transcribe the audio to text. "
                    "Mark unclear words with [inaudible]. "
                    "Preserve numbers, callsigns, and codes exactly as spoken. "
                    "Identify and label different speakers if multiple voices are present."
                )
                config["system_instruction"] = system_instruction

            # Type check: ensure client is not None
            if self.gemini_client is None:
                raise RuntimeError("Gemini client not initialized")

            # Connect to Live API (enter context manager)
            # Note: Only certain models support Live API (bidiGenerateContent)
            # Try gemini-2.0-flash-exp first (better for transcription, but has quota limits)
            # Falls back to gemini-2.5-flash-native-audio-preview if quota exceeded
            model = "models/gemini-2.0-flash-exp"
            session_context = self.gemini_client.aio.live.connect(model=model, config=config)

            # Enter the async context manager
            self.gemini_session = await session_context.__aenter__()
            self.gemini_session_context = session_context  # Store for cleanup
            self.gemini_connected = True
            self.last_connection_attempt = 0  # Reset backoff on successful connection
            logger.info(
                f"Connected to Gemini Live API for session {self.session_id[:8]} VFO {self.vfo_number}"
            )

            # Start receiver task
            self.receiver_task = asyncio.create_task(self._receiver_loop())

        except Exception as e:
            logger.error(f"Failed to connect to Gemini: {e}", exc_info=True)
            self.gemini_connected = False
            self.gemini_session = None

            # Update connection failure stats
            with self.stats_lock:
                self.stats["connection_failures"] += 1

            # Send user-friendly error message to UI
            await self._send_error_to_ui(e)
            raise

    async def _stream_audio(self, audio_data: np.ndarray):
        """
        Stream audio to Gemini Live API for real-time transcription and optional translation.

        Uses continuous streaming pattern without end_of_turn signals,
        allowing Gemini to process audio in real-time and return partial transcriptions.

        Args:
            audio_data: Audio samples as numpy array (44.1kHz float32)
        """
        try:
            # Check if Gemini is available
            if not GEMINI_AVAILABLE:
                logger.debug("google-genai package not installed, skipping transcription")
                return

            # Check if API key is configured, try to fetch from preferences if empty
            if not self.gemini_api_key:
                # Try to fetch from preferences once
                try:
                    from sqlalchemy.ext.asyncio import async_sessionmaker

                    from crud.preferences import fetch_all_preferences
                    from db import engine

                    async_session = async_sessionmaker(engine, expire_on_commit=False)
                    async with async_session() as session:
                        result = await fetch_all_preferences(session)
                        if result.get("success"):
                            preferences = result.get("data", [])
                            gemini_api_key = next(
                                (p["value"] for p in preferences if p["name"] == "gemini_api_key"),
                                "",
                            )
                            if gemini_api_key:
                                self.gemini_api_key = gemini_api_key
                                logger.info(
                                    f"Loaded Gemini API key from preferences (length: {len(gemini_api_key)})"
                                )
                            else:
                                logger.debug(
                                    "No Gemini API key found in preferences, skipping transcription"
                                )
                                return
                        else:
                            logger.debug(
                                f"Failed to fetch preferences: {result.get('error')}, skipping transcription"
                            )
                            return
                except Exception as e:
                    logger.debug(
                        f"Failed to fetch Gemini API key from preferences: {e}, skipping transcription"
                    )
                    return

            # Connect to Gemini if not connected (no need to check for session/settings changes
            # since this consumer is dedicated to one VFO with fixed settings)
            if not self.gemini_connected or self.gemini_session is None:
                # Check if we're in backoff period after quota error
                time_since_last_attempt = time.time() - self.last_connection_attempt
                if time_since_last_attempt < self.connection_backoff_seconds:
                    return

                self.last_connection_attempt = time.time()
                await self._connect_to_gemini()

            # Type check: ensure session is not None
            if self.gemini_session is None:
                raise RuntimeError("Gemini session not established")

            # Convert audio to Gemini format (16kHz 16-bit PCM)
            audio_pcm = self._convert_to_gemini_format(audio_data)
            audio_b64 = base64.b64encode(audio_pcm).decode("utf-8")

            # Stream audio continuously (no end_of_turn for continuous streaming)
            # This allows Gemini to process audio in real-time and return partial transcriptions
            await self.gemini_session.send(
                input={"media_chunks": [{"data": audio_b64, "mime_type": "audio/pcm"}]},
                end_of_turn=False,  # Keep stream open for continuous audio
            )

            # Update stats for sent transcriptions
            with self.stats_lock:
                self.stats["transcriptions_sent"] += 1

        except Exception as e:
            logger.error(f"Audio streaming error: {e}")
            # Mark as disconnected but let receiver loop handle cleanup
            self.gemini_connected = False
            # Send error to UI
            await self._send_error_to_ui(e)

    def stop(self):
        """Stop the transcription consumer"""
        logger.info("Stopping transcription consumer...")
        self.running = False

        # Close Gemini session
        if self.gemini_session_context:
            try:
                asyncio.run_coroutine_threadsafe(self._close_connection(), self.loop)
            except Exception as e:
                logger.error(f"Error closing Gemini session: {e}")
