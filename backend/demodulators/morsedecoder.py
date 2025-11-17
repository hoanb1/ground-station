# Ground Station - Morse Code Decoder
# Developed by Claude (Anthropic AI) for the Ground Station project
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
import os
import queue
import threading
import time
import warnings
from collections import deque
from enum import Enum
from typing import Any, Dict, Optional

import numpy as np
import sklearn.cluster
from scipy.signal import butter, sosfilt

from vfos.state import VFOManager

logger = logging.getLogger("morsedecoder")


class DecoderStatus(Enum):
    """Decoder status values."""

    IDLE = "idle"
    LISTENING = "listening"
    DECODING = "decoding"
    ERROR = "error"


class MorseDecoder(threading.Thread):
    """Real-time Morse code decoder thread"""

    # International Morse Code table
    MORSE_CODE = {
        ".-": "A",
        "-...": "B",
        "-.-.": "C",
        "-..": "D",
        ".": "E",
        "..-.": "F",
        "--.": "G",
        "....": "H",
        "..": "I",
        ".---": "J",
        "-.-": "K",
        ".-..": "L",
        "--": "M",
        "-.": "N",
        "---": "O",
        ".--.": "P",
        "--.-": "Q",
        ".-.": "R",
        "...": "S",
        "-": "T",
        "..-": "U",
        "...-": "V",
        ".--": "W",
        "-..-": "X",
        "-.--": "Y",
        "--..": "Z",
        "-----": "0",
        ".----": "1",
        "..---": "2",
        "...--": "3",
        "....-": "4",
        ".....": "5",
        "-....": "6",
        "--...": "7",
        "---..": "8",
        "----.": "9",
        "..--..": "?",
        ".-.-.-": ".",
        "--..--": ",",
        "-.-.--": "!",
        "-..-.": "/",
        "-.--.": "(",
        "-.--.-": ")",
        ".-...": "&",
        "---...": ":",
        "-.-.-.": ";",
        "-...-": "=",
        ".-.-.": "+",
        "-....-": "-",
        "..--.-": "_",
        ".-..-.": '"',
        "...-..-": "$",
        ".--.-.": "@",
    }

    def __init__(
        self,
        audio_queue,
        data_queue,
        session_id,
        sample_rate=44100,
        output_dir="data/decoded",
        vfo=None,
        target_freq=800,  # Default CW tone frequency (Hz) - common for HF transceivers
        bandwidth=500,  # Bandwidth for tone detection (Hz) - wider for better HF capture
    ):
        super().__init__(daemon=True, name=f"MorseDecoder-{session_id}")
        self.audio_queue = audio_queue
        self.data_queue = data_queue
        self.session_id = session_id
        self.sample_rate = sample_rate
        self.running = True
        self.output_dir = output_dir
        self.vfo = vfo
        self.vfo_manager = VFOManager()  # Access VFO state for squelch/volume
        self.target_freq = target_freq
        self.bandwidth = bandwidth
        self.auto_tune = True  # Automatically detect tone frequency

        # Signal processing parameters
        self.audio_buffer: deque = deque(maxlen=int(sample_rate * 0.1))  # 100ms buffer
        self.envelope_buffer: deque = deque(maxlen=int(sample_rate * 0.5))  # 500ms envelope buffer
        self.last_auto_tune: float = 0.0  # Last time we auto-tuned

        # Timing state
        self.tone_state = False  # Current tone on/off state
        self.last_state_change = time.time()
        self.tone_start: Optional[float] = None
        self.silence_start: Optional[float] = None
        self.initial_state_detected = False  # Track if we've detected the initial signal state

        # Debouncing for noise rejection (require N consecutive detections)
        self.tone_confirm_count = 0  # Consecutive tone detections
        self.silence_confirm_count = 0  # Consecutive silence detections
        self.debounce_threshold = 2  # Require 2 consecutive detections to change state (was 3)

        # Morse decoding state
        self.current_symbol = []  # Current morse sequence (dots/dashes)
        self.decoded_text = ""  # Accumulated decoded text (limited to last N chars)
        self.character_count = 0
        self.max_decoded_length = 300  # Keep only last 300 characters (UI displays last 30)
        self.last_output_time: float = 0  # Last time we sent an output update
        self.output_update_interval = 0.5  # Send updates every 0.5 seconds max

        # Adaptive timing parameters (auto WPM detection)
        self.dot_length: Optional[float] = None  # Will be auto-detected
        self.wpm: Optional[int] = None  # Words per minute
        self.dot_history: deque = deque(maxlen=20)  # Recent dot lengths for averaging
        self.dash_history: deque = deque(maxlen=20)  # Recent dash lengths for averaging
        self.tone_durations: deque = deque(maxlen=100)  # All tone durations for better analysis
        self.silence_durations: deque = deque(
            maxlen=100
        )  # All silence durations for space classification

        # K-Means clustering cache (updated periodically, not every sample)
        self.kmeans_threshold: Optional[float] = None  # Cached threshold from K-Means
        self.last_kmeans_update: float = 0.0  # Last time we ran K-Means
        self.kmeans_update_interval: float = 2.0  # Re-run K-Means every 2 seconds

        # Status
        self.status = DecoderStatus.IDLE
        self.last_update_time = time.time()
        self.signal_strength: float = 0.0

        # Create output directory
        os.makedirs(self.output_dir, exist_ok=True)

        # Performance monitoring stats
        self.stats: Dict[str, Any] = {
            "audio_chunks_in": 0,
            "audio_samples_in": 0,
            "data_messages_out": 0,
            "queue_timeouts": 0,
            "last_activity": None,
            "errors": 0,
        }
        self.stats_lock = threading.Lock()

        # Design bandpass filter for CW tone extraction
        self._design_bandpass_filter()

        logger.info(
            f"Morse decoder initialized for session {session_id}, VFO {vfo}, "
            f"target freq: {target_freq}Hz, bandwidth: {bandwidth}Hz, "
            f"filter range: {target_freq - bandwidth/2:.0f}-{target_freq + bandwidth/2:.0f}Hz"
        )

    def _design_bandpass_filter(self):
        """Design a bandpass filter for CW tone extraction"""
        # Bandpass filter around target frequency
        low = (self.target_freq - self.bandwidth / 2) / (self.sample_rate / 2)
        high = (self.target_freq + self.bandwidth / 2) / (self.sample_rate / 2)

        # Ensure frequencies are in valid range (0, 1)
        low = max(0.001, min(0.999, low))
        high = max(0.001, min(0.999, high))

        if low >= high:
            # Fallback to safe values if invalid
            low = 0.1
            high = 0.3

        self.sos = butter(4, [low, high], btype="band", output="sos")
        logger.debug(
            f"Designed bandpass filter: {low*self.sample_rate/2:.1f}-{high*self.sample_rate/2:.1f}Hz"
        )

    def _auto_detect_tone_frequency(self, signal):
        """Automatically detect the CW tone frequency using FFT"""
        # Only update every 5 seconds to avoid constant retuning
        current_time = time.time()
        if current_time - self.last_auto_tune < 5.0:
            return

        # Perform FFT to find peak frequency
        if len(signal) < 2048:
            return

        # Use a window to reduce spectral leakage
        window = np.hanning(len(signal))
        windowed = signal * window

        # FFT
        fft = np.fft.rfft(windowed)
        freqs = np.fft.rfftfreq(len(windowed), 1.0 / self.sample_rate)
        magnitudes = np.abs(fft)

        # Look for peak in reasonable CW range (300Hz - 3000Hz)
        cw_range_mask = (freqs >= 300) & (freqs <= 3000)
        cw_freqs = freqs[cw_range_mask]
        cw_mags = magnitudes[cw_range_mask]

        if len(cw_mags) == 0:
            return

        # Find peak
        peak_idx = np.argmax(cw_mags)
        detected_freq = cw_freqs[peak_idx]
        peak_strength = cw_mags[peak_idx]

        # Only retune if peak is strong and different enough
        if peak_strength > np.mean(cw_mags) * 3:  # Peak is 3x average
            freq_diff = abs(detected_freq - self.target_freq)
            if freq_diff > 50:  # More than 50Hz off
                logger.info(
                    f">>> AUTO-TUNE: Detected CW tone at {detected_freq:.0f}Hz (was {self.target_freq:.0f}Hz), retuning filter"
                )
                self.target_freq = detected_freq
                self._design_bandpass_filter()
                self.last_auto_tune = current_time
                # Send params update to UI with new frequency
                self._send_params_update()

    def _process_audio(self, audio_chunk):
        """Process incoming audio and extract envelope"""
        # Add to buffer
        if isinstance(audio_chunk, np.ndarray):
            self.audio_buffer.extend(audio_chunk.flatten())
        else:
            self.audio_buffer.extend(np.array(audio_chunk, dtype=np.float32).flatten())

        # Need enough samples to process
        if len(self.audio_buffer) < 512:
            return

        # Convert to numpy array
        signal = np.array(list(self.audio_buffer), dtype=np.float32)

        # Auto-detect tone frequency if enabled
        if self.auto_tune and len(signal) >= 2048:
            self._auto_detect_tone_frequency(signal)

        # Apply bandpass filter
        filtered = sosfilt(self.sos, signal)

        # Envelope detection using RMS with Hann window (better frequency response)
        # Square the signal for power calculation
        squared = np.power(filtered, 2)

        # Create Hann window with integral=1 for weighted average
        window_size = int(self.sample_rate * 0.005)  # 5ms window
        if len(squared) >= window_size:
            window = np.hanning(window_size)
            window = window / np.sum(window)
            # Convolve and take square root for RMS
            envelope = np.sqrt(np.convolve(squared, window, mode="valid"))
            current_level = np.mean(envelope[-window_size:])
        else:
            envelope = np.sqrt(squared)
            current_level = np.mean(envelope)

        # Update signal strength (for UI)
        self.signal_strength = float(current_level)

        # Store envelope for threshold calculation
        self.envelope_buffer.extend(envelope)

        return current_level

    def _detect_tone(self, current_level):
        """Detect if CW tone is present using adaptive threshold with hysteresis"""
        if len(self.envelope_buffer) < 100:
            return False

        # Calculate adaptive threshold using percentile method
        envelope_array = np.array(list(self.envelope_buffer))

        # Use median absolute deviation for more robust threshold
        median = np.median(envelope_array)
        mad = np.median(np.abs(envelope_array - median))

        # Threshold is median + MAD multiplier
        # The debouncing logic handles noise rejection, so we can use moderate threshold
        if mad > 0:
            threshold = median + 3 * mad  # Moderate sensitivity
        else:
            # Fallback if MAD is zero
            threshold = np.percentile(envelope_array, 75)

        # Add hysteresis: higher threshold to turn on, lower to turn off
        if self.tone_state:
            # Already in tone state - use lower threshold to turn off
            return current_level > (threshold * 0.6)
        else:
            # Not in tone state - use threshold to turn on
            return current_level > threshold

    def _update_timing_kmeans(self):
        """Update K-Means clustering threshold (called periodically, not every sample)"""
        if len(self.tone_durations) < 5:
            return

        durations = np.array(list(self.tone_durations))
        # Log the range of durations we're clustering
        logger.info(
            f">>> K-Means input: {len(durations)} tones, range {durations.min()*1000:.0f}-{durations.max()*1000:.0f}ms, unique values: {len(set(durations))}"
        )

        n_clusters = min(2, len(set(durations)))
        column_vec = durations.reshape(-1, 1)

        # Suppress ConvergenceWarning
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            clustering = sklearn.cluster.KMeans(n_clusters=n_clusters, random_state=0).fit(
                column_vec
            )

        distinct_clusters = len(set(clustering.labels_))

        if distinct_clusters == 1:
            # Single cluster - check if we have a reliable dot_length
            if self.dot_length and len(self.dot_history) >= 3:
                # Use 2x dot length as threshold (between dot and dash)
                self.kmeans_threshold = 2.0 * self.dot_length
                threshold_ms = self.kmeans_threshold * 1000 if self.kmeans_threshold else 0
                logger.info(
                    f">>> K-Means: Single cluster, using 2x dot_length: {threshold_ms:.0f}ms"
                )
            else:
                # Use 20 WPM fallback (90ms threshold)
                self.kmeans_threshold = 0.09
                logger.info(">>> K-Means: Single cluster, using 20 WPM fallback: 90ms")
        else:
            # Two clusters - calculate threshold as midpoint between centers
            centers = np.sort(clustering.cluster_centers_.flatten())
            self.kmeans_threshold = (centers[0] + centers[1]) / 2
            threshold_ms = self.kmeans_threshold * 1000 if self.kmeans_threshold else 0
            logger.info(
                f">>> K-Means: Two clusters found - dots: {centers[0]*1000:.0f}ms, dashes: {centers[1]*1000:.0f}ms, threshold: {threshold_ms:.0f}ms"
            )

    def _update_timing(self, duration, is_tone):
        """Update timing estimates based on observed durations"""
        if is_tone:
            # Store all tone durations
            self.tone_durations.append(duration)

            # Need at least 5 samples for classification
            if len(self.tone_durations) < 5:
                if self.dot_length is None:
                    self.dot_length = duration
                    self._calculate_wpm()
                return

            # Update K-Means threshold periodically (not every sample)
            current_time = time.time()
            if (
                self.kmeans_threshold is None
                or current_time - self.last_kmeans_update > self.kmeans_update_interval
            ):
                self._update_timing_kmeans()
                self.last_kmeans_update = current_time

            # Classify using cached threshold
            if self.kmeans_threshold:
                is_dot = duration < self.kmeans_threshold
            else:
                # Fallback if no threshold yet
                is_dot = duration < 0.09

            # Update history and timing
            if is_dot:
                self.dot_history.append(duration)
                if len(self.dot_history) > 0:
                    self.dot_length = np.mean(list(self.dot_history))
                    self._calculate_wpm()
            else:
                self.dash_history.append(duration)

    def _calculate_wpm(self):
        """Calculate WPM from dot length"""
        if self.dot_length and self.dot_length > 0:
            # Standard: dot length in seconds = 1.2 / WPM
            self.wpm = int(1.2 / self.dot_length)
            # Clamp to reasonable range
            self.wpm = max(5, min(50, self.wpm))

    def _classify_silence(self, silence_duration):
        """Classify silence duration using K-Means clustering into intra-char, char, or word gaps

        Returns:
            str: 'intra' for intra-character space, 'char' for character space, 'word' for word space
        """
        # Store silence duration
        self.silence_durations.append(silence_duration)

        # Always use threshold-based classification for real-time performance
        # K-Means is too slow for real-time processing
        if self.dot_length:
            # Use thresholds based on standard morse timing
            if silence_duration > 5.5 * self.dot_length:
                return "word"
            elif silence_duration > 2.5 * self.dot_length:
                return "char"
        return "intra"

    def _decode_symbol(self):
        """Decode current morse symbol to character"""
        if not self.current_symbol:
            logger.info(">>> Decode called with empty symbol buffer")
            return None

        morse_str = "".join(self.current_symbol)
        char = self.MORSE_CODE.get(morse_str)

        if not char:
            dot_len_str = f"{self.dot_length:.3f}s" if self.dot_length else "N/A"
            logger.info(
                f">>> UNKNOWN morse sequence: '{morse_str}' (WPM: {self.wpm}, dot_len: {dot_len_str})"
            )
            char = "?"  # Unknown character
        else:
            logger.info(f">>> DECODED '{morse_str}' → '{char}' ✓")

        return char

    def _process_tone_change(self, tone_present, current_time):
        """Process state changes in CW tone with edge case handling"""
        # Handle edge case: signal starts with tone ON
        if not self.initial_state_detected:
            self.initial_state_detected = True
            if tone_present:
                # Signal started with tone ON - mark the start
                self.tone_state = True
                self.tone_start = current_time
                logger.info(f">>> Initial state: Tone ON at {current_time:.3f}s")
                return
            else:
                # Signal started with tone OFF (normal case)
                self.tone_state = False
                self.silence_start = current_time
                logger.info(f">>> Initial state: Tone OFF at {current_time:.3f}s")
                return

        if tone_present and not self.tone_state:
            # Tone started
            self.tone_state = True
            self.tone_start = current_time
            self.tone_confirm_count = 0  # Reset counters after state change
            self.silence_confirm_count = 0
            logger.info(f">>> Tone ON at {current_time:.3f}s")

            # If we were in silence, classify the gap using K-Means
            if self.silence_start:
                silence_duration = current_time - self.silence_start
                dot_len_ms = f"{self.dot_length*1000:.0f}ms" if self.dot_length else "N/A"
                logger.info(
                    f">>> Gap detected: {silence_duration*1000:.0f}ms (dot_len: {dot_len_ms})"
                )
                logger.info(
                    f">>> Current symbol buffer: {self.current_symbol} ({''.join(self.current_symbol)})"
                )

                # Classify silence using K-Means clustering
                gap_type = self._classify_silence(silence_duration)

                if gap_type == "word":
                    # Word gap - decode current symbol and add space
                    logger.info(f">>> WORD GAP detected ({silence_duration*1000:.0f}ms)")
                    if self.current_symbol:
                        char = self._decode_symbol()
                        if char:
                            self._add_character(char)
                        self.current_symbol = []
                    self._add_character(" ")

                elif gap_type == "char":
                    # Character gap - decode current symbol
                    logger.info(f">>> CHAR GAP detected ({silence_duration*1000:.0f}ms)")
                    if self.current_symbol:
                        char = self._decode_symbol()
                        if char:
                            self._add_character(char)
                        self.current_symbol = []
                else:
                    logger.info(
                        f">>> ELEMENT GAP detected ({silence_duration*1000:.0f}ms) - within character"
                    )

                self.silence_start = None

        elif not tone_present and self.tone_state:
            # Tone ended
            self.tone_state = False
            self.silence_start = current_time
            self.tone_confirm_count = 0  # Reset counters after state change
            self.silence_confirm_count = 0
            logger.info(f">>> Tone OFF at {current_time:.3f}s")

            # Measure tone duration
            if self.tone_start:
                tone_duration = current_time - self.tone_start
                logger.info(f">>> Tone duration: {tone_duration*1000:.0f}ms")

                # Ignore very short tones (< 80ms) - likely glitches/noise/switching artifacts
                # At 15 WPM, a dot is ~80ms, at 20 WPM a dot is ~60ms
                # Increased threshold for better HF noise rejection
                if tone_duration < 0.080:
                    logger.info(
                        f">>> GLITCH FILTERED: {tone_duration*1000:.0f}ms (< 80ms threshold)"
                    )
                    # Don't process this tone at all - just reset to start of tone
                    self.tone_state = True
                    self.tone_start = current_time  # Reset tone start to now
                    self.silence_start = None
                    return

                # Update timing estimates (uses cached K-Means threshold)
                self._update_timing(tone_duration, is_tone=True)

                # Validate timing consistency - reject if tone duration is too long
                # Maximum valid dash at 5 WPM is ~720ms (3x 240ms dot)
                # Anything longer is likely noise or carrier, not morse
                if tone_duration > 0.720:
                    logger.info(
                        f">>> INVALID TIMING: {tone_duration*1000:.0f}ms (> 720ms max) - likely carrier/noise, not morse"
                    )
                    # Don't add to symbol buffer - this is not valid morse
                    self.tone_start = None
                    return

                # Classify as dot or dash using cached K-Means threshold
                if self.kmeans_threshold:
                    # Use K-Means threshold (updated periodically)
                    if tone_duration < self.kmeans_threshold:
                        self.current_symbol.append(".")
                        logger.info(
                            f">>> DOT detected: {tone_duration*1000:.0f}ms (K-Means threshold: {self.kmeans_threshold*1000:.0f}ms)"
                        )
                    else:
                        self.current_symbol.append("-")
                        logger.info(
                            f">>> DASH detected: {tone_duration*1000:.0f}ms (K-Means threshold: {self.kmeans_threshold*1000:.0f}ms)"
                        )
                elif self.dot_length:
                    # Fallback to simple threshold
                    threshold = 1.8 * self.dot_length
                    if tone_duration > threshold:
                        self.current_symbol.append("-")
                        logger.info(
                            f">>> DASH detected: {tone_duration*1000:.0f}ms (threshold: {threshold*1000:.0f}ms)"
                        )
                    else:
                        self.current_symbol.append(".")
                        logger.info(
                            f">>> DOT detected: {tone_duration*1000:.0f}ms (threshold: {threshold*1000:.0f}ms)"
                        )
                else:
                    # No timing reference yet, assume dot
                    self.current_symbol.append(".")
                    logger.info(f">>> DOT (initial, no reference): {tone_duration*1000:.0f}ms")

                logger.info(
                    f">>> Symbol buffer now: {self.current_symbol} ({''.join(self.current_symbol)})"
                )
                self.tone_start = None

    def _send_status_update(self, status):
        """Send status update to UI"""
        msg = {
            "type": "decoder-status",
            "status": status.value,
            "decoder_type": "morse",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
        }
        logger.info(f"Sending status update: {status.value}")
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            logger.warning("Data queue full, dropping status update")

    def _send_params_update(self):
        """Send current decoder parameters to UI"""
        msg = {
            "type": "decoder-params",
            "decoder_type": "morse",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "params": {
                "wpm": self.wpm,
                "tone_frequency": self.target_freq,
                "signal_strength": self.signal_strength,
                "dot_length_ms": int(self.dot_length * 1000) if self.dot_length else None,
            },
        }
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            logger.warning("Data queue full, dropping params update")

    def _add_character(self, char):
        """Add a character to decoded text and trim if needed"""
        logger.info(f">>> ADDING CHARACTER: '{char}' (repr: {repr(char)})")
        self.decoded_text += char
        logger.info(
            f">>> Decoded text now: '{self.decoded_text}' (length: {len(self.decoded_text)})"
        )

        # Trim to last N characters if exceeded
        if len(self.decoded_text) > self.max_decoded_length:
            old_text = self.decoded_text
            self.decoded_text = self.decoded_text[-self.max_decoded_length :]
            logger.info(
                f">>> Trimmed decoded text from {len(old_text)} to {len(self.decoded_text)} chars"
            )

        if char != " ":
            self.character_count += 1

    def _send_decoded_output(self):
        """Send decoded text output to UI (rate-limited)"""
        current_time = time.time()

        # Rate limit: only send updates every N seconds
        if current_time - self.last_output_time < self.output_update_interval:
            return

        self.last_output_time = current_time

        msg = {
            "type": "decoder-output",
            "decoder_type": "morse",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": current_time,
            "output": {
                "text": self.decoded_text,
                "character_count": self.character_count,
                "wpm": self.wpm,
            },
        }
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            logger.warning("Data queue full, dropping decoded output")

    def _send_stats_update(self):
        """Send statistics update to UI"""
        msg = {
            "type": "decoder-stats",
            "decoder_type": "morse",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "stats": {
                "character_count": self.character_count,
                "wpm": self.wpm,
                "signal_strength": self.signal_strength,
            },
        }
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            pass

    def run(self):
        """Main thread loop"""
        logger.info(f"Morse decoder started for {self.session_id}")
        self._send_status_update(DecoderStatus.LISTENING)

        try:
            while self.running:

                # Get audio from queue
                try:
                    audio_chunk = self.audio_queue.get(timeout=0.1)

                    # Update stats
                    with self.stats_lock:
                        self.stats["audio_chunks_in"] += 1
                        self.stats["last_activity"] = time.time()

                    # Extract audio from dict wrapper if needed
                    if isinstance(audio_chunk, dict):
                        if "audio" in audio_chunk:
                            audio_chunk = audio_chunk["audio"]
                        else:
                            continue

                    # Ensure audio_chunk is a proper array
                    if isinstance(audio_chunk, (int, float)):
                        audio_chunk = np.array([audio_chunk], dtype=np.float32)
                    elif not isinstance(audio_chunk, np.ndarray):
                        audio_chunk = np.array(audio_chunk, dtype=np.float32)
                    elif audio_chunk.ndim == 0:
                        audio_chunk = audio_chunk.reshape(1)

                    # Update sample count
                    with self.stats_lock:
                        self.stats["audio_samples_in"] += len(audio_chunk)

                    # Process audio and get current level
                    current_level = self._process_audio(audio_chunk)

                    if current_level is not None:
                        # Detect tone presence
                        tone_present_raw = self._detect_tone(current_level)
                        current_time = time.time()

                        # Debounce: require multiple consecutive detections before changing state
                        if tone_present_raw:
                            self.tone_confirm_count += 1
                            self.silence_confirm_count = 0
                        else:
                            self.silence_confirm_count += 1
                            self.tone_confirm_count = 0

                        # Determine actual tone state after debouncing
                        if (
                            not self.tone_state
                            and self.tone_confirm_count >= self.debounce_threshold
                        ):
                            tone_present = True  # Confirmed tone
                        elif (
                            self.tone_state
                            and self.silence_confirm_count >= self.debounce_threshold
                        ):
                            tone_present = False  # Confirmed silence
                        else:
                            tone_present = self.tone_state  # Keep current state

                        # Process state changes (only if state actually changed)
                        if tone_present != self.tone_state or not self.initial_state_detected:
                            self._process_tone_change(tone_present, current_time)

                        # Update status
                        if self.status == DecoderStatus.LISTENING and tone_present:
                            self.status = DecoderStatus.DECODING
                            self._send_status_update(DecoderStatus.DECODING)
                        elif self.status == DecoderStatus.DECODING and not tone_present:
                            # Check if we've been silent for a while
                            if self.silence_start and (current_time - self.silence_start) > 2.0:
                                # Back to listening after 2 seconds of silence
                                if self.current_symbol:
                                    # Decode any pending symbol
                                    char = self._decode_symbol()
                                    if char:
                                        self._add_character(char)
                                    self.current_symbol = []
                                self.status = DecoderStatus.LISTENING
                                self._send_status_update(DecoderStatus.LISTENING)

                        # Send periodic updates (every 1 second)
                        if current_time - self.last_update_time > 1.0:
                            if self.wpm:
                                self._send_params_update()
                            self._send_stats_update()
                            self._send_decoded_output()  # Send decoded text update
                            self.last_update_time = current_time

                except queue.Empty:
                    with self.stats_lock:
                        self.stats["queue_timeouts"] += 1
                    # Check for long silence timeout
                    current_time = time.time()
                    if (
                        self.silence_start
                        and (current_time - self.silence_start) > 5.0
                        and self.current_symbol
                    ):
                        # Decode pending symbol after long silence
                        char = self._decode_symbol()
                        if char:
                            self._add_character(char)
                        self.current_symbol = []
                    continue

        except Exception as e:
            logger.error(f"Morse decoder error: {e}")
            logger.exception(e)
            with self.stats_lock:
                self.stats["errors"] += 1
            self._send_status_update(DecoderStatus.ERROR)

        logger.info(f"Morse decoder stopped for {self.session_id}")

    def stop(self):
        """Stop the decoder"""
        self.running = False

        # Save decoded text to file if any
        if self.decoded_text.strip():
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"cw_{timestamp}.txt"
            filepath = os.path.join(self.output_dir, filename)
            with open(filepath, "w") as f:
                f.write(self.decoded_text)
            logger.info(f"Saved decoded CW text: {filepath}")

        # Send final status update
        msg = {
            "type": "decoder-status",
            "status": "closed",
            "decoder_type": "morse",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
        }
        logger.info("Sending final status update: closed")
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            logger.warning("Data queue full, dropping final status update")
