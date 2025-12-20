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
from typing import Dict, Optional

import numpy as np
from scipy import signal

from vfos.state import VFOManager

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

    def __init__(self, transcription_queue, sio, loop, gemini_api_key: str):
        """
        Initialize the transcription consumer.

        Args:
            transcription_queue: Queue receiving audio from AudioBroadcaster
            sio: Socket.IO server instance for emitting to frontend
            loop: Asyncio event loop
            gemini_api_key: Google Gemini API key
        """
        super().__init__(daemon=True, name="Ground Station - TranscriptionConsumer")
        self.transcription_queue = transcription_queue
        self.sio = sio
        self.loop = loop
        self.gemini_api_key = gemini_api_key
        self.vfo_manager = VFOManager()
        self.running = True

        # Per-session audio buffers
        # {session_id: {"buffer": [], "language": "en"}}
        self.session_buffers: Dict[str, dict] = {}

        # Streaming settings - send audio frequently for real-time transcription
        self.chunk_duration = 0.5  # Send audio every 0.5 seconds for low latency
        self.input_sample_rate = 44100  # Input from demodulators
        self.gemini_sample_rate = 16000  # Gemini requires 16kHz

        # Gemini Live API session
        self.gemini_client = None
        self.gemini_session = None
        self.gemini_session_context = None  # Context manager for proper cleanup
        self.gemini_connected = False
        self.receiver_task: Optional[Task] = None  # Background task for receiving responses

        # Track current connection settings to detect changes
        self.current_language: Optional[str] = None
        self.current_translate_to: Optional[str] = None

        # Connection backoff to prevent quota exhaustion
        self.last_connection_attempt = 0.0
        self.connection_backoff_seconds = 60  # Wait 60 seconds after quota error before retrying

    def update_gemini_api_key(self, api_key: str):
        """
        Update the Gemini API key dynamically.

        Args:
            api_key: New Gemini API key
        """
        if self.gemini_api_key != api_key:
            logger.info(
                f"Updating Gemini API key: {api_key[:10]}...{api_key[-4:] if len(api_key) > 14 else ''}"
            )
            self.gemini_api_key = api_key
            # Force reconnect on next transcription
            if self.gemini_connected:
                self.gemini_connected = False
                if self.gemini_session:
                    asyncio.run_coroutine_threadsafe(self._close_connection(), self.loop)

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
        logger.info("Transcription consumer started (Google Gemini Live API)")

        while self.running:
            try:
                # Get audio message from queue
                audio_message = self.transcription_queue.get(timeout=1.0)

                # Extract session info
                session_id = audio_message.get("session_id")
                audio_chunk = audio_message.get("audio")
                vfo_number = audio_message.get("vfo_number")

                if session_id is None or audio_chunk is None:
                    logger.warning("Received malformed audio message for transcription")
                    self.transcription_queue.task_done()
                    continue

                # Check if transcription is enabled for this VFO
                # vfo_number is required
                if vfo_number is None:
                    logger.error(f"vfo_number is required for transcription (session {session_id})")
                    self.transcription_queue.task_done()
                    continue

                vfo_state = self.vfo_manager.get_vfo_state(session_id, vfo_number)

                if vfo_state is None:
                    # Silently skip if no VFO state (could be internal demodulator for decoder)
                    self.transcription_queue.task_done()
                    continue

                # Skip if VFO is not selected (only transcribe selected VFO audio)
                if not vfo_state.selected:
                    self.transcription_queue.task_done()
                    continue

                transcription_enabled = getattr(vfo_state, "transcription_enabled", False)
                if not transcription_enabled:
                    self.transcription_queue.task_done()
                    continue

                # Initialize session tracking
                if session_id not in self.session_buffers:
                    self.session_buffers[session_id] = {
                        "buffer": [],
                        "language": getattr(vfo_state, "transcription_language", "en"),
                    }

                # Get current language and translation settings for this session
                current_language = getattr(vfo_state, "transcription_language", "auto")
                translate_to = getattr(vfo_state, "transcription_translate_to", "none")

                # Add audio to buffer
                self.session_buffers[session_id]["buffer"].append(audio_chunk)

                # Calculate total duration of buffered audio
                total_samples = sum(
                    len(chunk) for chunk in self.session_buffers[session_id]["buffer"]
                )
                duration = total_samples / self.input_sample_rate

                # Send when we have accumulated chunk_duration seconds
                if duration >= self.chunk_duration:

                    # Concatenate all buffered chunks
                    concatenated = np.concatenate(self.session_buffers[session_id]["buffer"])

                    # Check if audio has sufficient energy (not just silence)
                    rms = np.sqrt(np.mean(concatenated**2))

                    if rms < 0.001:
                        self.session_buffers[session_id]["buffer"] = []
                        continue

                    # Check if this is stereo
                    is_stereo = vfo_state.modulation and vfo_state.modulation.upper() == "FM_STEREO"

                    # Convert stereo to mono if needed
                    if is_stereo:
                        stereo_array = np.array(concatenated, dtype=np.float32).reshape(-1, 2)
                        audio_array = np.mean(stereo_array, axis=1)
                    else:
                        audio_array = np.array(concatenated, dtype=np.float32)

                    # Clear buffer
                    self.session_buffers[session_id]["buffer"] = []

                    # Stream to Gemini immediately (true continuous streaming)
                    asyncio.run_coroutine_threadsafe(
                        self._stream_audio(
                            session_id=session_id,
                            audio_data=audio_array,
                            language=current_language,
                            translate_to=translate_to,
                        ),
                        self.loop,
                    )

                self.transcription_queue.task_done()

            except queue.Empty:
                # Continue - no need to flush buffers, we send immediately at chunk_duration
                continue

            except Exception as e:
                logger.error(f"Transcription consumer error: {e}", exc_info=True)
                continue

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

    async def _receiver_loop(self, session_id: str):
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

                                # Detect language from transcribed text
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
                                    "session_id": session_id,
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

                                # Broadcast to all clients (not just room)
                                await self.sio.emit("transcription-data", transcription_data)

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

    async def _send_error_to_ui(self, session_id: str, error: Exception):
        """
        Send user-friendly error message to UI via Socket.IO.

        Args:
            session_id: Session ID for routing message
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

        # Emit error to frontend (broadcast to all)
        await self.sio.emit(
            "transcription-error",
            {
                "session_id": session_id,
                "error_type": error_type,
                "message": error_message,
                "details": error_details,
                "timestamp": __import__("datetime").datetime.now().isoformat(),
            },
        )

    async def _connect_to_gemini(self, session_id: str, language: str, translate_to: str = "none"):
        """
        Connect to Gemini Live API and enter the async context.

        Args:
            session_id: Session ID for routing results
            language: Source language code (used for system instructions)
            translate_to: Target language code for translation (none = no translation)
        """
        try:

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
                        "silence_duration_ms": 50,  # Only 50ms of silence needed (more sensitive than default 100ms)
                    }
                },
            }

            # Build system instruction based on language and translation settings
            if translate_to != "none":
                # Translation requested
                if language != "auto":
                    system_instruction = (
                        f"Transcribe the audio to text (source language: {language}) "
                        f"and translate it to {translate_to}. Only output the translated text."
                    )
                else:
                    system_instruction = (
                        f"Transcribe the audio to text and translate it to {translate_to}. "
                        f"Only output the translated text."
                    )
                config["system_instruction"] = system_instruction
            elif language != "auto":
                # Just transcription with language hint
                system_instruction = f"Transcribe the audio to text. Audio language: {language}."
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
            logger.info("Connected to Gemini Live API")

            # Start receiver task
            self.receiver_task = asyncio.create_task(self._receiver_loop(session_id))

        except Exception as e:
            logger.error(f"Failed to connect to Gemini: {e}", exc_info=True)
            self.gemini_connected = False
            self.gemini_session = None

            # Send user-friendly error message to UI
            await self._send_error_to_ui(session_id, e)
            raise

    async def _stream_audio(
        self, session_id: str, audio_data: np.ndarray, language: str, translate_to: str = "none"
    ):
        """
        Stream audio to Gemini Live API for real-time transcription and optional translation.

        Uses continuous streaming pattern without end_of_turn signals,
        allowing Gemini to process audio in real-time and return partial transcriptions.

        Args:
            session_id: Session ID for routing results
            audio_data: Audio samples as numpy array (44.1kHz float32)
            language: Source language code (used for system instructions)
            translate_to: Target language code for translation (none = no translation)
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

            # Check if language/translation settings changed - reconnect if needed
            settings_changed = (
                self.current_language != language or self.current_translate_to != translate_to
            )

            if settings_changed and self.gemini_connected:
                logger.info(
                    f"Translation settings changed (lang: {self.current_language}->{language}, "
                    f"translate: {self.current_translate_to}->{translate_to}) - reconnecting to Gemini"
                )
                await self._close_connection()

            # Connect to Gemini if not connected or settings changed
            if not self.gemini_connected or self.gemini_session is None:
                # Check if we're in backoff period after quota error
                time_since_last_attempt = time.time() - self.last_connection_attempt
                if time_since_last_attempt < self.connection_backoff_seconds:
                    return

                self.last_connection_attempt = time.time()
                await self._connect_to_gemini(session_id, language, translate_to)

                # Store current settings
                self.current_language = language
                self.current_translate_to = translate_to

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

        except Exception as e:
            logger.error(f"Audio streaming error: {e}")
            # Mark as disconnected but let receiver loop handle cleanup
            self.gemini_connected = False
            # Send error to UI
            await self._send_error_to_ui(session_id, e)

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
