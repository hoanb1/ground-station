# Ground Station - AM Demodulator
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
import threading
import time
from typing import Optional, Tuple

import numpy as np
from scipy import signal

from vfos.state import VFOManager

logger = logging.getLogger("am-demodulator")


class AMDemodulator(threading.Thread):
    """
    AM (Amplitude Modulation) demodulator that consumes IQ data and produces audio samples.

    This demodulator:
    1. Reads IQ samples from iq_queue (a subscriber queue from IQBroadcaster)
    2. Translates frequency based on VFO center frequency
    3. Decimates to appropriate bandwidth
    4. Demodulates AM using envelope detection (magnitude)
    5. Applies DC blocking filter
    6. Applies audio filtering
    7. Resamples to 44.1kHz audio
    8. Puts audio in audio_queue

    Note: Multiple demodulators can run simultaneously, each with its own
    subscriber queue from the IQBroadcaster. This allows multiple VFOs to
    process the same IQ samples without gaps.
    """

    def __init__(self, iq_queue, audio_queue, session_id):
        super().__init__(daemon=True, name=f"AMDemodulator-{session_id}")
        self.iq_queue = iq_queue
        self.audio_queue = audio_queue
        self.session_id = session_id
        self.running = True
        self.vfo_manager = VFOManager()

        # Audio output parameters
        self.audio_sample_rate = 44100  # 44.1 kHz audio output
        self.target_chunk_size = 4096  # Balanced chunks for low latency playback (~93ms)

        # Audio buffer to accumulate samples
        self.audio_buffer = np.array([], dtype=np.float32)

        # Squelch state (for hysteresis)
        self.squelch_open = False  # Track if squelch is open (signal present)

        # Processing state
        self.sdr_sample_rate = None
        self.current_center_freq = None
        self.current_bandwidth = None

        # Filters (will be initialized when we know sample rates)
        self.decimation_filter: Optional[Tuple[np.ndarray, int]] = None
        self.audio_filter: Optional[np.ndarray] = None
        self.dc_blocker: Optional[Tuple[np.ndarray, np.ndarray]] = None

    def _get_active_vfo(self):
        """Get the currently active and selected VFO for this session."""
        vfo_state = self.vfo_manager.get_selected_vfo(self.session_id)
        if vfo_state and vfo_state.active and vfo_state.selected:
            return vfo_state
        return None

    def _resize_filter_state(self, old_state, b_coeffs, initial_value, a_coeffs=None):
        """
        Resize filter state vector when filter coefficients change.

        This prevents clicks by smoothly transitioning filter states instead of
        resetting to None when bandwidth changes.

        Args:
            old_state: Previous filter state (or None)
            b_coeffs: New numerator coefficients
            initial_value: Value to use for initialization if needed
            a_coeffs: Denominator coefficients (for IIR filters)

        Returns:
            Resized filter state appropriate for the new filter
        """
        if a_coeffs is None:
            # FIR filter: state length is len(b) - 1
            new_len = len(b_coeffs) - 1
        else:
            # IIR filter: state length is max(len(b), len(a)) - 1
            new_len = max(len(b_coeffs), len(a_coeffs)) - 1

        if old_state is None or len(old_state) == 0:
            # No previous state, initialize fresh
            if a_coeffs is None:
                return signal.lfilter_zi(b_coeffs, 1) * initial_value
            else:
                return signal.lfilter_zi(b_coeffs, a_coeffs) * initial_value

        old_len = len(old_state)

        if old_len == new_len:
            # Same size, keep the state as-is
            return old_state
        elif new_len > old_len:
            # Need more state - pad with zeros or the last value
            # Use the last state value to avoid discontinuities
            pad_value = old_state[-1] if old_len > 0 else 0
            padding = np.full(new_len - old_len, pad_value)
            return np.concatenate([old_state, padding])
        else:
            # Need less state - truncate
            return old_state[:new_len]

    def _design_decimation_filter(self, sdr_rate, bandwidth):
        """Design a decimation filter to reduce sample rate to appropriate level for AM processing."""
        # For AM, bandwidth can range from 5-10 kHz (broadcast) to 22 kHz (hi-fi)
        # Target intermediate rate: ~48 kHz, but increase if needed for higher bandwidths
        min_required_rate = bandwidth * 2.5  # Nyquist + some margin
        target_rate = max(48e3, min_required_rate)

        decimation = int(sdr_rate / target_rate)
        decimation = max(1, decimation)  # At least 1

        # Design low-pass filter for the bandwidth
        # For AM (double sideband), we need to pass both sidebands around DC
        # So the filter cutoff should be the full bandwidth, not bandwidth/2
        cutoff = min(bandwidth, 22000)
        cutoff = max(cutoff, 2500)  # At least 2.5 kHz for minimum AM fidelity

        nyquist = sdr_rate / 2.0
        normalized_cutoff = cutoff / nyquist

        # Ensure cutoff is valid
        normalized_cutoff = min(0.45, max(0.01, normalized_cutoff))

        # Design FIR filter with good selectivity
        transition_width = 0.2 * bandwidth
        transition_width = max(transition_width, 500)  # At least 500 Hz transition for AM
        numtaps = int(3.3 * sdr_rate / transition_width)
        numtaps = max(51, min(1001, numtaps))
        numtaps = numtaps + 1 if numtaps % 2 == 0 else numtaps  # Ensure odd

        filter_taps = signal.firwin(numtaps, normalized_cutoff, window="blackman")

        return filter_taps, decimation

    def _design_audio_filter(self, intermediate_rate, vfo_bandwidth):
        """Design audio low-pass filter based on VFO bandwidth.

        For AM, the audio bandwidth can range from broadcast (5 kHz)
        to hi-fi/data (up to 22 kHz).
        """
        # AM audio cutoff - use the full requested bandwidth
        # After envelope detection, AM produces audio at baseband
        # For double-sideband AM, the bandwidth parameter represents the full RF bandwidth
        # The audio bandwidth is half of that (one sideband)
        cutoff = min(vfo_bandwidth / 2.0, 22000)  # Hz - AM audio is half the RF bandwidth
        cutoff = max(cutoff, 1000)  # At least 1 kHz for minimum fidelity

        nyquist = intermediate_rate / 2.0
        normalized_cutoff = cutoff / nyquist

        # Ensure normalized cutoff is valid (0 < f < 1)
        normalized_cutoff = min(0.45, max(0.01, normalized_cutoff))

        numtaps = 101
        filter_taps = signal.firwin(numtaps, normalized_cutoff, window="hamming")

        return filter_taps

    def _design_dc_blocker(self, sample_rate):
        """Design a DC blocking high-pass filter.

        This removes the DC component that results from envelope detection.
        """
        # High-pass filter with cutoff at ~50 Hz
        cutoff = 50  # Hz
        nyquist = sample_rate / 2.0
        normalized_cutoff = cutoff / nyquist

        # Ensure cutoff is valid
        normalized_cutoff = min(0.45, max(0.01, normalized_cutoff))

        # Use a simple first-order high-pass IIR filter
        b, a = signal.butter(1, normalized_cutoff, btype="high")

        return (b, a)

    def _frequency_translate(self, samples, offset_freq, sample_rate):
        """Translate frequency by offset (shift signal in frequency domain)."""
        if offset_freq == 0:
            return samples

        # Generate complex exponential for frequency shift
        t = np.arange(len(samples)) / sample_rate
        shift = np.exp(-2j * np.pi * offset_freq * t)
        return samples * shift

    def _am_demodulate(self, samples):
        """
        Demodulate AM using envelope detection.

        The envelope is simply the magnitude of the complex signal.
        """
        # Calculate magnitude (envelope)
        demodulated = np.abs(samples)

        return demodulated

    def run(self):
        """Main demodulator loop."""
        logger.info(f"AM demodulator started for session {self.session_id}")

        # State for filter applications
        decimation_state = None
        audio_filter_state = None
        dc_blocker_state = None

        while self.running:
            try:
                # Check if there's an active VFO
                vfo_state = self._get_active_vfo()
                if not vfo_state:
                    time.sleep(0.1)
                    continue

                # Check if modulation is AM
                if vfo_state.modulation.lower() != "am":
                    time.sleep(0.1)
                    continue

                # Get IQ data from queue
                if self.iq_queue.empty():
                    time.sleep(0.01)
                    continue

                iq_message = self.iq_queue.get(timeout=0.1)

                # Extract samples and metadata
                samples = iq_message.get("samples")
                sdr_center_freq = iq_message.get("center_freq")
                sdr_sample_rate = iq_message.get("sample_rate")

                if samples is None or len(samples) == 0:
                    continue

                # Check if we need to reinitialize filters
                if (
                    self.sdr_sample_rate != sdr_sample_rate
                    or self.current_bandwidth != vfo_state.bandwidth
                    or self.decimation_filter is None
                ):
                    self.sdr_sample_rate = sdr_sample_rate
                    self.current_bandwidth = vfo_state.bandwidth

                    # Design filters
                    filter_taps, decimation = self._design_decimation_filter(
                        sdr_sample_rate, vfo_state.bandwidth
                    )
                    self.decimation_filter = (filter_taps, decimation)

                    intermediate_rate = sdr_sample_rate / decimation
                    self.audio_filter = self._design_audio_filter(
                        intermediate_rate, vfo_state.bandwidth
                    )
                    self.dc_blocker = self._design_dc_blocker(intermediate_rate)

                    # Smooth filter state transitions
                    initial_value = samples[0] if len(samples) > 0 else 0
                    decimation_state = self._resize_filter_state(
                        decimation_state, filter_taps, initial_value
                    )
                    audio_filter_state = self._resize_filter_state(
                        audio_filter_state, self.audio_filter, 0
                    )
                    b, a = self.dc_blocker  # type: ignore[misc]
                    dc_blocker_state = self._resize_filter_state(dc_blocker_state, b, 0, a)

                    logger.info(
                        f"Filters initialized: SDR rate={sdr_sample_rate/1e6:.2f} MHz, "
                        f"decimation={decimation}, intermediate={intermediate_rate/1e3:.1f} kHz"
                    )

                # Step 1: Frequency translation (tune to VFO frequency)
                if vfo_state.center_freq == 0:
                    logger.debug("VFO frequency not set, skipping frame")
                    continue

                offset_freq = vfo_state.center_freq - sdr_center_freq
                if abs(offset_freq) > sdr_sample_rate / 2:
                    logger.debug(
                        f"VFO frequency {vfo_state.center_freq} Hz is outside SDR bandwidth "
                        f"(SDR center: {sdr_center_freq} Hz, rate: {sdr_sample_rate} Hz)"
                    )
                    continue

                translated = self._frequency_translate(samples, offset_freq, sdr_sample_rate)

                # Step 2: Decimate and filter to bandwidth
                filter_taps, decimation = self.decimation_filter

                if decimation_state is None:
                    # Initialize filter state on first run
                    decimation_state = signal.lfilter_zi(filter_taps, 1) * translated[0]

                filtered, decimation_state = signal.lfilter(
                    filter_taps, 1, translated, zi=decimation_state
                )
                decimated = filtered[::decimation]

                # Measure RF signal power for squelch AFTER filtering
                signal_power = np.mean(np.abs(filtered) ** 2)
                rf_power_db_raw = 10 * np.log10(signal_power + 1e-10)

                # Calibration offset (similar to FM demodulator)
                calibration_offset_db = 21.0
                rf_power_db = rf_power_db_raw + calibration_offset_db

                intermediate_rate = sdr_sample_rate / decimation

                # Step 3: AM demodulation (envelope detection)
                demodulated = self._am_demodulate(decimated)

                # Step 4: DC blocking
                b, a = self.dc_blocker  # type: ignore[misc]

                if dc_blocker_state is None:
                    # Initialize filter state on first run
                    dc_blocker_state = signal.lfilter_zi(b, a) * demodulated[0]

                dc_blocked, dc_blocker_state = signal.lfilter(
                    b, a, demodulated, zi=dc_blocker_state
                )

                # Step 5: Audio filtering
                if audio_filter_state is None:
                    # Initialize filter state on first run
                    audio_filter_state = signal.lfilter_zi(self.audio_filter, 1) * dc_blocked[0]

                audio_filtered, audio_filter_state = signal.lfilter(
                    self.audio_filter, 1, dc_blocked, zi=audio_filter_state
                )

                # Step 6: Resample to audio rate (44.1 kHz)
                num_output_samples = int(
                    len(audio_filtered) * self.audio_sample_rate / intermediate_rate
                )
                if num_output_samples > 0:
                    audio = signal.resample(audio_filtered, num_output_samples)

                    # Normalize and soft clipping
                    max_val = np.max(np.abs(audio)) + 1e-10
                    audio = audio / max_val * 0.5  # Scale to 50% to leave headroom
                    audio = np.clip(audio, -0.95, 0.95)

                    # Apply squelch based on RF signal strength
                    squelch_threshold_db = vfo_state.squelch
                    squelch_hysteresis_db = 3  # 3 dB hysteresis

                    # Apply squelch with hysteresis
                    if self.squelch_open:
                        # Squelch is open - close if RF power drops below threshold
                        if rf_power_db < (squelch_threshold_db - squelch_hysteresis_db):
                            self.squelch_open = False
                            audio = np.zeros_like(audio)  # Mute
                    else:
                        # Squelch is closed - open if RF power rises above threshold
                        if rf_power_db > (squelch_threshold_db + squelch_hysteresis_db):
                            self.squelch_open = True
                            # Let audio through
                        else:
                            audio = np.zeros_like(audio)  # Keep muted

                    # Convert to float32
                    audio = audio.astype(np.float32)

                    # Buffer audio samples to create consistent chunk sizes
                    self.audio_buffer = np.concatenate([self.audio_buffer, audio])

                    # Send chunks of target size when buffer is full enough
                    while len(self.audio_buffer) >= self.target_chunk_size:
                        # Extract a chunk
                        chunk = self.audio_buffer[: self.target_chunk_size]
                        self.audio_buffer = self.audio_buffer[self.target_chunk_size :]

                        # Put audio chunk in queue with session_id
                        try:
                            self.audio_queue.put(
                                {"session_id": self.session_id, "audio": chunk}, timeout=0.5
                            )
                        except Exception as e:
                            logger.warning(f"Could not queue audio: {str(e)}")

            except Exception as e:
                if self.running:
                    logger.error(f"Error in AM demodulator: {str(e)}")
                    logger.exception(e)
                time.sleep(0.1)

        logger.info(f"AM demodulator stopped for session {self.session_id}")

    def stop(self):
        """Stop the demodulator thread."""
        self.running = False
