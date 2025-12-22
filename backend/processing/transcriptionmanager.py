# Copyright (c) 2025 Efstratios Goudelis
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

import logging
import threading
import time
from typing import Optional


class TranscriptionManager:
    """
    Manager for per-VFO transcription consumers.

    Each VFO can have its own transcription consumer with independent:
    - Gemini API connection
    - Language settings
    - Translation settings
    - Audio queue subscription
    """

    def __init__(self, processes, sio, event_loop):
        """
        Initialize the transcription manager.

        Args:
            processes: Reference to the main processes dictionary from ProcessManager
            sio: Socket.IO server instance for emitting to frontend
            event_loop: Asyncio event loop
        """
        self.logger = logging.getLogger("transcription-manager")
        self.processes = processes
        self.sio = sio
        self.event_loop = event_loop
        self.gemini_api_key = None  # Will be set when first consumer starts

        # Race condition prevention (similar to decoder manager)
        self._start_locks = {}  # Per (sdr_id, session_id, vfo_number) locks
        self._start_in_progress = {}  # Track starts in progress
        self._last_start_ts = {}  # Timestamp of last start

    def set_gemini_api_key(self, api_key: str):
        """
        Update the Gemini API key for all future transcription consumers.

        Args:
            api_key: Google Gemini API key
        """
        self.gemini_api_key = api_key
        self.logger.info("Gemini API key updated for transcription manager")

    def start_transcription(
        self,
        sdr_id: str,
        session_id: str,
        vfo_number: int,
        language: str = "auto",
        translate_to: str = "none",
    ):
        """
        Start a transcription consumer for a specific VFO.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier (client session ID)
            vfo_number: VFO number (1-4)
            language: Source language code (e.g., "en", "es", "auto")
            translate_to: Target language code for translation (e.g., "en", "none")

        Returns:
            bool: True if started successfully, False otherwise
        """
        # Import here to avoid circular dependencies
        from audio.transcriptionconsumer import TranscriptionConsumer

        if sdr_id not in self.processes:
            self.logger.warning(f"No SDR process found for device {sdr_id}")
            return False

        if not self.gemini_api_key:
            self.logger.warning("No Gemini API key configured, cannot start transcription")
            return False

        process_info = self.processes[sdr_id]

        # Find per-VFO audio broadcaster created by the demodulator
        # Each demodulator now creates its own AudioBroadcaster regardless of whether it has a decoder
        broadcasters = process_info.get("broadcasters", {})
        audio_broadcaster = None

        # Look for broadcaster by key pattern: audio_{session_id}_vfo{vfo_number}
        broadcaster_key = f"audio_{session_id}_vfo{vfo_number}"
        audio_broadcaster = broadcasters.get(broadcaster_key)

        if not audio_broadcaster:
            self.logger.warning(
                f"No audio broadcaster found for session {session_id} VFO {vfo_number}. "
                f"Transcription requires an active demodulator."
            )
            return False

        # Initialize transcription_consumers storage if it doesn't exist
        if "transcription_consumers" not in process_info:
            process_info["transcription_consumers"] = {}

        if session_id not in process_info["transcription_consumers"]:
            process_info["transcription_consumers"][session_id] = {}

        consumer_storage = process_info["transcription_consumers"][session_id]

        # Race condition prevention: Use a lock per (sdr_id, session_id, vfo_number)
        lock_key = (sdr_id, session_id, vfo_number)
        lock = self._start_locks.get(lock_key)
        if lock is None:
            lock = threading.Lock()
            self._start_locks[lock_key] = lock

        with lock:
            # Debounce: Check if a start is already in progress or happened recently
            key = (sdr_id, session_id, vfo_number)
            now_ms = int(time.time() * 1000)
            in_progress = bool(self._start_in_progress.get(key, False))
            last_ts = int(self._last_start_ts.get(key, 0))

            # If a start is in progress, reject
            if in_progress:
                self.logger.info(
                    f"Transcription start already in progress for {session_id} VFO {vfo_number}, skipping duplicate request"
                )
                return False

            # If a start happened within last 1000ms, debounce
            if now_ms - last_ts < 1000:
                self.logger.info(
                    f"Transcription start requested too soon after last start for {session_id} VFO {vfo_number}, debouncing"
                )
                return False

            # Mark start in progress
            self._start_in_progress[key] = True

            try:
                # Check if transcription consumer already exists for this VFO
                if vfo_number in consumer_storage:
                    existing = consumer_storage[vfo_number]
                    if existing["instance"].is_alive():
                        # Check if settings changed - if so, restart the consumer
                        settings_changed = (
                            existing.get("language") != language
                            or existing.get("translate_to") != translate_to
                        )
                        if settings_changed:
                            self.logger.info(
                                f"Transcription settings changed for session {session_id} VFO {vfo_number}, "
                                f"restarting consumer (old: language={existing.get('language')}, "
                                f"translate_to={existing.get('translate_to')} -> "
                                f"new: language={language}, translate_to={translate_to})"
                            )
                            # Stop the existing consumer
                            self._stop_consumer_entry(existing, session_id, vfo_number)
                            del consumer_storage[vfo_number]
                            # Continue to start new consumer with updated settings
                        else:
                            self.logger.debug(
                                f"Transcription consumer already running for session {session_id} VFO {vfo_number} "
                                f"with same settings"
                            )
                            return True
                    else:
                        # Clean up dead consumer
                        self.logger.info(
                            f"Cleaning up dead transcription consumer for session {session_id} VFO {vfo_number}"
                        )
                        self._cleanup_consumer(existing)
                        del consumer_storage[vfo_number]

                # Subscribe to the audio broadcaster
                subscription_key = f"transcription:{session_id}_vfo{vfo_number}"
                transcription_queue = audio_broadcaster.subscribe(subscription_key, maxsize=50)

                # Create and start the transcription consumer
                try:
                    transcription_consumer = TranscriptionConsumer(
                        transcription_queue=transcription_queue,
                        sio=self.sio,
                        loop=self.event_loop,
                        gemini_api_key=self.gemini_api_key,
                        session_id=session_id,
                        vfo_number=vfo_number,
                        language=language,
                        translate_to=translate_to,
                    )
                    transcription_consumer.start()

                    # Store the consumer info
                    consumer_storage[vfo_number] = {
                        "instance": transcription_consumer,
                        "subscription_key": subscription_key,
                        "audio_broadcaster": audio_broadcaster,
                        "language": language,
                        "translate_to": translate_to,
                    }

                    self.logger.info(
                        f"Started transcription consumer for session {session_id} VFO {vfo_number} "
                        f"(language={language}, translate_to={translate_to})"
                    )

                    # Update timestamp
                    self._last_start_ts[key] = now_ms
                    return True

                except Exception as e:
                    self.logger.error(f"Failed to start transcription consumer: {e}", exc_info=True)
                    # Clean up subscription if consumer creation failed
                    if audio_broadcaster:
                        audio_broadcaster.unsubscribe(subscription_key)
                    return False
            finally:
                # Clear in-progress flag
                self._start_in_progress[key] = False

    def stop_transcription(self, sdr_id: str, session_id: str, vfo_number: Optional[int] = None):
        """
        Stop transcription consumer(s) for a session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier
            vfo_number: VFO number (1-4). If None, stops all transcription consumers for session

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        if sdr_id not in self.processes:
            return False

        process_info = self.processes[sdr_id]
        transcription_consumers = process_info.get("transcription_consumers", {})

        if session_id not in transcription_consumers:
            return False

        try:
            consumer_storage = transcription_consumers[session_id]

            if vfo_number is not None:
                # Stop specific VFO
                if vfo_number not in consumer_storage:
                    self.logger.warning(
                        f"No transcription consumer found for session {session_id} VFO {vfo_number}"
                    )
                    return False

                consumer_entry = consumer_storage[vfo_number]
                self._stop_consumer_entry(consumer_entry, session_id, vfo_number)
                del consumer_storage[vfo_number]

                # Clean up empty session dict
                if not consumer_storage:
                    del transcription_consumers[session_id]

                return True
            else:
                # Stop all VFOs for this session
                stopped_count = 0
                for vfo_num in list(consumer_storage.keys()):
                    consumer_entry = consumer_storage[vfo_num]
                    self._stop_consumer_entry(consumer_entry, session_id, vfo_num)
                    stopped_count += 1

                del transcription_consumers[session_id]
                self.logger.info(
                    f"Stopped {stopped_count} transcription consumer(s) for session {session_id}"
                )
                return True

        except Exception as e:
            self.logger.error(f"Error stopping transcription consumer: {e}", exc_info=True)
            return False

    def _stop_consumer_entry(self, consumer_entry: dict, session_id: str, vfo_number: int):
        """
        Stop a single transcription consumer entry.

        Args:
            consumer_entry: Consumer entry dict with instance, subscription_key, etc.
            session_id: Session identifier
            vfo_number: VFO number
        """
        consumer = consumer_entry["instance"]
        subscription_key = consumer_entry["subscription_key"]
        audio_broadcaster = consumer_entry.get("audio_broadcaster")

        # Stop the consumer thread (non-blocking)
        consumer.stop()
        # Don't join - let it stop asynchronously to avoid blocking

        # Unsubscribe from audio broadcaster
        if audio_broadcaster:
            try:
                audio_broadcaster.unsubscribe(subscription_key)
            except Exception as e:
                self.logger.warning(f"Failed to unsubscribe from audio broadcaster: {e}")

        self.logger.info(
            f"Stopped transcription consumer for session {session_id} VFO {vfo_number}"
        )

    def _cleanup_consumer(self, consumer_entry: dict):
        """
        Clean up a consumer entry (for dead/stale consumers).

        Args:
            consumer_entry: Consumer entry dict
        """
        try:
            consumer = consumer_entry["instance"]
            if consumer.is_alive():
                consumer.stop()
                # Don't join - let it stop asynchronously

            subscription_key = consumer_entry.get("subscription_key")
            audio_broadcaster = consumer_entry.get("audio_broadcaster")
            if audio_broadcaster and subscription_key:
                audio_broadcaster.unsubscribe(subscription_key)
        except Exception as e:
            self.logger.warning(f"Error during consumer cleanup: {e}")

    def get_active_transcription_consumer(self, sdr_id: str, session_id: str, vfo_number: int):
        """
        Get the active transcription consumer for a session/VFO.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier
            vfo_number: VFO number (1-4)

        Returns:
            TranscriptionConsumer instance or None
        """
        if sdr_id not in self.processes:
            return None

        process_info = self.processes[sdr_id]
        transcription_consumers = process_info.get("transcription_consumers", {})

        if session_id not in transcription_consumers:
            return None

        consumer_storage = transcription_consumers[session_id]
        if vfo_number not in consumer_storage:
            return None

        return consumer_storage[vfo_number].get("instance")

    def stop_all_for_session(self, session_id: str):
        """
        Stop all transcription consumers for a session across all SDRs.

        Args:
            session_id: Session identifier
        """
        for sdr_id in list(self.processes.keys()):
            self.stop_transcription(sdr_id, session_id)
