# Ground Station - Transcription Consumer
# Developed by Claude (Anthropic AI) for the Ground Station project
#
# This module connects to Google Gemini Live API and streams audio for
# real-time speech-to-text conversion. It runs as a background thread that:
#
# 1. Consumes audio chunks from the transcription queue (fed by AudioBroadcaster)
# 2. Buffers audio into 3-5 second chunks for transcription
# 3. Connects to Gemini Live API
# 4. Resamples audio from 44.1kHz to 16kHz and converts to 16-bit PCM
# 5. Sends audio chunks to Gemini and receives transcriptions asynchronously
# 6. Emits transcriptions to frontend via Socket.IO
#
# Architecture: Asynchronous send/receive pattern
# - Audio chunks are sent to Gemini API (every 3-5 seconds)
# - Gemini processes chunks and returns text transcriptions
# - Results arrive asynchronously via the Live API session
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
logger = logging.getLogger("transcription-consumer")

# Reduce websockets logging verbosity to prevent API key exposure
logging.getLogger("websockets.client").setLevel(logging.WARNING)
logging.getLogger("websockets").setLevel(logging.WARNING)


class TranscriptionConsumer(threading.Thread):
    """
    Transcription consumer that streams audio to Google Gemini Live API.

    Connects to Gemini Live API, buffers audio chunks, resamples to 16kHz,
    and sends them for transcription. Receives transcription results and forwards to frontend.
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

        # Buffer settings (in seconds) - hardcoded 3-5 second chunks
        self.chunk_duration = 4.0  # Send audio every 4 seconds
        self.input_sample_rate = 44100  # Input from demodulators
        self.gemini_sample_rate = 16000  # Gemini requires 16kHz

        # Gemini Live API session
        self.gemini_client = None
        self.gemini_session = None
        self.gemini_session_context = None  # Context manager for proper cleanup
        self.gemini_connected = False
        self.receiver_task: Optional[Task] = None  # Background task for receiving responses

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

                # Initialize buffer for new session
                if session_id not in self.session_buffers:
                    self.session_buffers[session_id] = {
                        "buffer": [],
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
                duration = frames / self.input_sample_rate

                # Send to Gemini immediately when buffer reaches chunk duration
                if duration >= self.chunk_duration:
                    logger.info(
                        f"Chunk ready: {duration:.1f}s accumulated, sending to Gemini API..."
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

    def _convert_to_gemini_format(self, audio_array: np.ndarray) -> bytes:
        """
        Convert 44.1kHz float32 audio to 16kHz 16-bit PCM for Gemini.

        Args:
            audio_array: Audio samples as float32 numpy array (44.1kHz)

        Returns:
            PCM audio bytes (16kHz, 16-bit)
        """
        # Resample from 44.1kHz to 16kHz
        num_samples_16k = int(len(audio_array) * self.gemini_sample_rate / self.input_sample_rate)
        resampled = signal.resample(audio_array, num_samples_16k)

        # Convert float32 [-1, 1] to int16 [-32768, 32767]
        audio_int16 = np.clip(resampled * 32767, -32768, 32767).astype(np.int16)

        # Cast to bytes to satisfy mypy
        return bytes(audio_int16.tobytes())

    def _send_for_transcription(self, session_id: str):
        """
        Send buffered audio to Gemini for transcription.

        Args:
            session_id: Session ID to transcribe
        """
        if session_id not in self.session_buffers:
            return

        buffer_data = self.session_buffers[session_id]

        # Concatenate all audio chunks
        audio_array = np.concatenate(buffer_data["buffer"])

        # Get current VFO state to check if stereo and get settings
        vfo_state = None
        all_vfos = self.vfo_manager.get_all_vfo_states(session_id)
        for vfo_num, vfo in all_vfos.items():
            if vfo.selected and getattr(vfo, "transcription_enabled", False):
                vfo_state = vfo
                break

        is_stereo = (
            vfo_state and vfo_state.modulation and vfo_state.modulation.upper() == "FM_STEREO"
        )

        # Convert stereo to mono if needed (Gemini expects mono audio)
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

        # Clear buffer
        buffer_data["buffer"] = []

        # Get current transcription settings
        current_language = getattr(vfo_state, "transcription_language", "en")

        # Send to Gemini asynchronously
        asyncio.run_coroutine_threadsafe(
            self._transcribe_audio(
                session_id=session_id,
                audio_data=audio_array,
                language=current_language,
            ),
            self.loop,
        )

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

                    logger.debug(f"[{session_id}] Received response from Gemini")

                    # Process server content (transcription results)
                    if response.server_content and response.server_content.model_turn:
                        is_complete = getattr(response.server_content, "turn_complete", False)
                        logger.debug(f"[{session_id}] Turn complete: {is_complete}")

                        for part in response.server_content.model_turn.parts:
                            if part.text:
                                text = part.text.strip()

                                # Detect language from transcribed text
                                detected_language = "unknown"
                                if LANGDETECT_AVAILABLE and text:
                                    try:
                                        detected_language = detect(text)
                                        logger.debug(
                                            f"[{session_id}] Detected language: {detected_language}"
                                        )
                                    except LangDetectException as e:
                                        logger.debug(
                                            f"[{session_id}] Language detection failed: {e}"
                                        )
                                        detected_language = "unknown"

                                transcription_data = {
                                    "text": text,
                                    "session_id": session_id,
                                    "language": detected_language,
                                    "is_final": is_complete,  # Flag to indicate if this is final or partial
                                }

                                logger.info(
                                    f"[{session_id}] Transcription ({detected_language}, {'final' if is_complete else 'partial'}): {text}"
                                )
                                await self.sio.emit(
                                    "transcription-data", transcription_data, room=session_id
                                )
                            else:
                                logger.debug(
                                    f"[{session_id}] Received model turn but no text in part"
                                )
                    else:
                        logger.debug(f"[{session_id}] Received non-transcription response")

                    # Handle setup complete
                    if response.setup_complete:
                        logger.debug(f"[{session_id}] Gemini session setup complete")

                except Exception as e:
                    error_str = str(e).lower()
                    # Check if it's a deadline/timeout error - these are recoverable
                    if "deadline" in error_str or "timeout" in error_str:
                        logger.warning(
                            f"[{session_id}] Gemini connection timeout, marking for reconnect"
                        )
                        self.gemini_connected = False
                        break
                    else:
                        logger.error(f"[{session_id}] Error in receiver loop: {e}", exc_info=True)
                        self.gemini_connected = False
                        break

        except Exception as e:
            if self.gemini_session:  # Only log error if session was active
                logger.error(f"Gemini receiver error: {e}", exc_info=True)
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
            logger.info(f"[{session_id}] Deadline timeout detected, will reconnect automatically")
            return  # Don't send error to UI for timeouts
        elif "network" in error_str or "connection" in error_str:
            error_type = "network_error"
            error_message = "Network error connecting to Gemini API."
            error_details = "Could not connect to Google's servers. Check your internet connection."
        else:
            error_type = "unknown_error"
            error_message = f"Transcription error: {str(error)[:100]}"
            error_details = str(error)

        # Emit error to frontend
        await self.sio.emit(
            "transcription-error",
            {
                "session_id": session_id,
                "error_type": error_type,
                "message": error_message,
                "details": error_details,
                "timestamp": __import__("datetime").datetime.now().isoformat(),
            },
            room=session_id,
        )

        logger.warning(f"Sent transcription error to UI: {error_type} - {error_message}")

    async def _connect_to_gemini(self, session_id: str, language: str):
        """
        Connect to Gemini Live API and enter the async context.

        Args:
            session_id: Session ID for routing results
            language: Language code (used for system instructions)
        """
        try:
            logger.info("Connecting to Gemini Live API...")

            # Initialize client
            self.gemini_client = genai.Client(api_key=self.gemini_api_key)

            # Create session config with language hint
            system_instruction = (
                f"Transcribe the audio to text. Audio language: {language}."
                if language != "auto"
                else "Transcribe the audio to text."
            )

            config = {
                "response_modalities": ["TEXT"],  # We only want text transcription
                "system_instruction": system_instruction,
            }

            # Type check: ensure client is not None
            if self.gemini_client is None:
                raise RuntimeError("Gemini client not initialized")

            # Connect to Live API (enter context manager)
            session_context = self.gemini_client.aio.live.connect(
                model="models/gemini-2.0-flash-exp", config=config
            )

            # Enter the async context manager
            self.gemini_session = await session_context.__aenter__()
            self.gemini_session_context = session_context  # Store for cleanup
            self.gemini_connected = True
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

    async def _transcribe_audio(self, session_id: str, audio_data: np.ndarray, language: str):
        """
        Send audio to Gemini for transcription.

        Args:
            session_id: Session ID for routing results
            audio_data: Audio samples as numpy array (44.1kHz float32)
            language: Language code (used for system instructions)
        """
        try:
            # Check if Gemini is available
            if not GEMINI_AVAILABLE:
                logger.debug("google-genai package not installed, skipping transcription")
                return

            # Check if API key is configured
            if not self.gemini_api_key:
                logger.debug(
                    f"Gemini API key not configured (current value: '{self.gemini_api_key}'), skipping transcription"
                )
                return

            logger.debug(
                f"Using Gemini API key: {self.gemini_api_key[:10]}...{self.gemini_api_key[-4:] if len(self.gemini_api_key) > 14 else ''}"
            )

            # Connect to Gemini if not connected
            logger.debug(
                f"Connection status: connected={self.gemini_connected}, session={self.gemini_session is not None}"
            )
            if not self.gemini_connected or self.gemini_session is None:
                logger.info(f"Initiating connection to Gemini for session {session_id}")
                await self._connect_to_gemini(session_id, language)
            else:
                logger.debug("Already connected to Gemini, reusing session")

            # Type check: ensure session is not None
            if self.gemini_session is None:
                raise RuntimeError("Gemini session not established")

            # Convert audio to Gemini format (16kHz 16-bit PCM)
            audio_pcm = self._convert_to_gemini_format(audio_data)
            audio_b64 = base64.b64encode(audio_pcm).decode("utf-8")

            # Send audio to Gemini (API will wrap media_chunks in realtime_input)
            await self.gemini_session.send(
                input={"media_chunks": [{"data": audio_b64, "mime_type": "audio/pcm"}]}
            )

            duration = len(audio_data) / self.input_sample_rate
            logger.debug(f"Sent {duration:.1f}s audio to Gemini API (session: {session_id})")

        except Exception as e:
            logger.error(f"Transcription send error for session {session_id}: {e}", exc_info=True)
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
