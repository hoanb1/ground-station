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
from typing import Optional, Tuple

import numpy as np
from scipy import signal

from vfos.state import VFOManager

logger = logging.getLogger("fm-demodulator")


class FMDemodulator(threading.Thread):
    """
    FM demodulator that consumes IQ data and produces audio samples.

    This demodulator:
    1. Reads IQ samples from iq_queue
    2. Translates frequency based on VFO center frequency
    3. Decimates to appropriate bandwidth
    4. Demodulates FM using phase differentiation
    5. Applies de-emphasis filter
    6. Resamples to 44.1kHz audio
    7. Puts audio in audio_queue
    """

    def __init__(self, iq_queue, audio_queue, session_id):
        super().__init__(daemon=True, name=f"FMDemodulator-{session_id}")
        self.iq_queue = iq_queue
        self.audio_queue = audio_queue
        self.session_id = session_id
        self.running = True
        self.vfo_manager = VFOManager()

        # Audio output parameters
        self.audio_sample_rate = 44100  # 44.1 kHz audio output
        self.target_chunk_size = 8192  # Large chunks for smooth continuous playback (~186ms)

        # Audio buffer to accumulate samples
        self.audio_buffer = np.array([], dtype=np.float32)

        # Squelch state (for hysteresis)
        self.squelch_open = False  # Track if squelch is open (signal present)

        # Processing state
        self.last_sample = 0 + 0j
        self.sdr_sample_rate = None
        self.current_center_freq = None
        self.current_bandwidth = None

        # Filters (will be initialized when we know sample rates)
        self.decimation_filter: Optional[Tuple[np.ndarray, int]] = None
        self.audio_filter: Optional[np.ndarray] = None
        self.deemphasis_filter: Optional[Tuple[np.ndarray, np.ndarray]] = None

        # De-emphasis time constant (75 microseconds for US, 50 for EU)
        self.deemphasis_tau = 75e-6

    def _get_active_vfo(self):
        """Get the currently active and selected VFO for this session."""
        vfo_state = self.vfo_manager.get_selected_vfo(self.session_id)
        if vfo_state and vfo_state.active and vfo_state.selected:
            return vfo_state
        return None

    def _design_decimation_filter(self, sdr_rate, bandwidth):
        """Design a decimation filter to reduce sample rate to ~200 kHz for FM processing."""
        # Calculate decimation factor to get to ~200 kHz intermediate rate
        target_rate = 200e3
        decimation = int(sdr_rate / target_rate)
        decimation = max(1, decimation)  # At least 1

        # Design low-pass filter for the bandwidth
        cutoff = bandwidth / 2.0
        nyquist = sdr_rate / 2.0
        normalized_cutoff = cutoff / nyquist

        # Ensure cutoff is valid
        normalized_cutoff = min(0.45, max(0.01, normalized_cutoff))

        # Design FIR filter with sharper rolloff
        # Use more taps for narrower bandwidths to get better selectivity
        # Transition width: aim for ~20% of bandwidth
        transition_width = 0.2 * bandwidth
        numtaps = int(3.3 * sdr_rate / transition_width)  # Kaiser window formula approximation
        numtaps = max(51, min(1001, numtaps))  # Clamp between 51 and 1001 taps
        numtaps = numtaps + 1 if numtaps % 2 == 0 else numtaps  # Ensure odd

        filter_taps = signal.firwin(numtaps, normalized_cutoff, window="blackman")

        return filter_taps, decimation

    def _design_audio_filter(self, intermediate_rate, vfo_bandwidth):
        """Design audio low-pass filter based on VFO bandwidth.

        For FM, the audio bandwidth is derived from the RF bandwidth:
        - Narrow FM (< 25 kHz): ~3-5 kHz audio (voice)
        - Medium FM (25-100 kHz): scaled proportionally
        - Wide FM (> 100 kHz): ~15 kHz audio (broadcast/music)
        """
        # Calculate audio cutoff based on VFO bandwidth
        # Use a reasonable fraction of the RF bandwidth for audio
        if vfo_bandwidth < 25e3:
            # Narrowband FM: limit to voice bandwidth
            cutoff = min(3e3, vfo_bandwidth * 0.3)
        elif vfo_bandwidth < 100e3:
            # Medium bandwidth: scale proportionally
            cutoff = vfo_bandwidth * 0.15
        else:
            # Wideband FM: allow up to 15 kHz for music
            cutoff = min(15e3, vfo_bandwidth * 0.15)

        nyquist = intermediate_rate / 2.0
        normalized_cutoff = min(0.45, cutoff / nyquist)

        numtaps = 101
        filter_taps = signal.firwin(numtaps, normalized_cutoff, window="hamming")

        return filter_taps

    def _design_deemphasis_filter(self, sample_rate):
        """Design de-emphasis filter for FM broadcast."""
        # De-emphasis filter: H(s) = 1 / (1 + s * tau)
        # Bilinear transform to digital filter
        tau = self.deemphasis_tau
        omega = 1.0 / tau
        b, a = signal.bilinear([1], [1 / omega, 1], sample_rate)
        return (b, a)

    def _frequency_translate(self, samples, offset_freq, sample_rate):
        """Translate frequency by offset (shift signal in frequency domain)."""
        if offset_freq == 0:
            return samples

        # Generate complex exponential for frequency shift
        t = np.arange(len(samples)) / sample_rate
        shift = np.exp(-2j * np.pi * offset_freq * t)
        return samples * shift

    def _fm_demodulate(self, samples):
        """
        Demodulate FM using phase differentiation.

        The instantaneous frequency is the derivative of the phase.
        For complex samples: angle(s[n] * conj(s[n-1]))
        """
        # Compute phase difference
        diff = samples[1:] * np.conj(samples[:-1])
        demodulated = np.angle(diff)

        # Prepend last sample state for continuity
        if self.last_sample is not None:
            first_diff = samples[0] * np.conj(self.last_sample)
            demodulated = np.concatenate(([np.angle(first_diff)], demodulated))
        else:
            demodulated = np.concatenate(([0], demodulated))

        # Save last sample for next iteration
        self.last_sample = samples[-1]

        return demodulated

    def run(self):
        """Main demodulator loop."""
        logger.info(f"FM demodulator started for session {self.session_id}")

        # State for filter applications
        decimation_state = None
        audio_filter_state = None
        deemph_state = None

        while self.running:
            try:
                # Check if there's an active VFO
                vfo_state = self._get_active_vfo()
                if not vfo_state:
                    time.sleep(0.1)
                    continue

                # Check if modulation is FM
                if vfo_state.modulation.lower() != "fm":
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
                    self.deemphasis_filter = self._design_deemphasis_filter(intermediate_rate)

                    # Reset filter states
                    decimation_state = None
                    audio_filter_state = None
                    deemph_state = None

                    logger.info(
                        f"Filters initialized: SDR rate={sdr_sample_rate/1e6:.2f} MHz, "
                        f"decimation={decimation}, intermediate={intermediate_rate/1e3:.1f} kHz"
                    )

                # Step 1: Frequency translation (tune to VFO frequency)
                # Skip if VFO frequency is not set (0 or invalid)
                if vfo_state.center_freq == 0:
                    logger.debug("VFO frequency not set, skipping frame")
                    continue

                offset_freq = vfo_state.center_freq - sdr_center_freq
                if abs(offset_freq) > sdr_sample_rate / 2:
                    logger.warning(
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

                # Measure RF signal power for squelch (after filtering to VFO bandwidth)
                # Calculate mean signal power in dB
                rf_power = np.mean(np.abs(filtered) ** 2) + 1e-10
                rf_power_db = 10 * np.log10(rf_power)

                # Debug: log RF power and squelch threshold occasionally
                import random

                if random.random() < 0.02:  # Log 2% of the time
                    logger.info(
                        f"VFO: {vfo_state.center_freq/1e6:.3f} MHz, "
                        f"RF power: {rf_power_db:.1f} dB, Squelch: {vfo_state.squelch} dB, "
                        f"Squelch open: {self.squelch_open}"
                    )

                intermediate_rate = sdr_sample_rate / decimation

                # Step 3: FM demodulation
                demodulated = self._fm_demodulate(decimated)

                # Step 4: Audio filtering
                if audio_filter_state is None:
                    # Initialize filter state on first run
                    audio_filter_state = signal.lfilter_zi(self.audio_filter, 1) * demodulated[0]

                audio_filtered, audio_filter_state = signal.lfilter(
                    self.audio_filter, 1, demodulated, zi=audio_filter_state
                )

                # Step 5: De-emphasis
                b, a = self.deemphasis_filter  # type: ignore[misc]

                if deemph_state is None:
                    # Initialize filter state on first run
                    deemph_state = signal.lfilter_zi(b, a) * audio_filtered[0]

                deemphasized, deemph_state = signal.lfilter(b, a, audio_filtered, zi=deemph_state)

                # Step 6: Resample to audio rate (44.1 kHz)
                num_output_samples = int(
                    len(deemphasized) * self.audio_sample_rate / intermediate_rate
                )
                if num_output_samples > 0:
                    audio = signal.resample(deemphasized, num_output_samples)

                    # Soft clipping instead of normalization (preserves relative levels)
                    # Only clip values that exceed [-1, 1] range
                    audio = np.clip(audio, -0.95, 0.95)

                    # NOTE: Volume is applied by WebAudioConsumer, not here
                    # This allows per-session volume control

                    # Apply squelch based on RF signal strength (measured earlier)
                    squelch_threshold_db = vfo_state.squelch  # e.g., -150 dB
                    squelch_hysteresis_db = 3  # 3 dB hysteresis to prevent flutter

                    # Apply squelch with hysteresis
                    if self.squelch_open:
                        # Squelch is open - close if RF power drops below (threshold - hysteresis)
                        if rf_power_db < (squelch_threshold_db - squelch_hysteresis_db):
                            self.squelch_open = False
                            audio = np.zeros_like(audio)  # Mute
                    else:
                        # Squelch is closed - open if RF power rises above (threshold + hysteresis)
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

                        # Put audio chunk in queue
                        try:
                            # Use timeout to avoid blocking forever if consumer stops
                            self.audio_queue.put(chunk, timeout=0.5)
                        except Exception as e:
                            logger.warning(f"Could not queue audio: {str(e)}")

            except Exception as e:
                if self.running:
                    logger.error(f"Error in FM demodulator: {str(e)}")
                    logger.exception(e)
                time.sleep(0.1)

        logger.info(f"FM demodulator stopped for session {self.session_id}")

    def stop(self):
        """Stop the demodulator thread."""
        self.running = False
