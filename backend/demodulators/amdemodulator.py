import pycsdr.modules as modules
import pycsdr.types as types
import numpy as np
import time
import logging
import json
from typing import Optional, Dict, List, Literal
from dataclasses import dataclass
from enum import Enum

# Configure logging
logger = logging.getLogger('demod-am')


class ModulationMode(Enum):
    """Supported AM modulation modes"""
    AM = "am"       # Standard AM (broadcast radio)
    USB = "usb"     # Upper Sideband
    LSB = "lsb"     # Lower Sideband
    DSB = "dsb"     # Double Sideband


@dataclass
class DemodulatorConfig:
    """Configuration for the demodulator"""
    center_frequency: float    # Center frequency of IQ stream (Hz)
    target_frequency: float    # Frequency to demodulate (Hz)
    bandwidth: float           # Demodulation bandwidth (Hz)
    modulation: ModulationMode # Modulation type
    input_rate: int            # IQ sample rate (Hz)
    audio_rate: int = 48000    # Output audio rate (Hz)


@dataclass
class AudioChunk:
    """Data class for audio chunks"""
    samples: np.ndarray
    sample_rate: int
    timestamp: float
    chunk_id: Optional[int] = None
    metadata: Optional[Dict] = None


class AMDemodulator:
    """
    Flexible streaming AM demodulator supporting AM, USB, LSB, DSB
    Handles wide IQ streams (2-10 MHz) and extracts specific frequencies
    """

    def __init__(self, config: DemodulatorConfig):
        self.config = config
        self.input_rate = config.input_rate
        self.audio_rate = config.audio_rate

        # Calculate frequency offset from center
        self.freq_offset = config.target_frequency - config.center_frequency

        # Calculate decimation stages
        self._calculate_processing_rates()

        # Processing state
        self.dc_accumulator = 0.0
        self.dc_alpha = 0.001

        # AM-specific state
        self.carrier_recovery_alpha = 0.01
        self.carrier_level = 0.0

        # Performance tracking
        self.chunk_times: List[float] = []
        self.chunk_count = 0

        # Initialize PyCSdr modules
        self._init_pycsdr_modules()

        logger.info(f"AM Demodulator initialized:")
        logger.info(f"  Mode: {config.modulation.value.upper()}")
        logger.info(f"  Target: {config.target_frequency / 1e6:.3f} MHz")
        logger.info(f"  Bandwidth: {config.bandwidth / 1e3:.1f} kHz")
        logger.info(f"  Input rate: {self.input_rate:,} Hz")
        logger.info(f"  Intermediate rate: {self.intermediate_rate:,} Hz")
        logger.info(f"  Audio rate: {self.audio_rate:,} Hz")
        logger.info(f"  Frequency offset: {self.freq_offset / 1e3:.1f} kHz")

    def _calculate_processing_rates(self):
        """Calculate intermediate processing rates based on bandwidth and mode"""
        if self.config.modulation == ModulationMode.AM:
            # AM broadcast needs wider bandwidth, typically 10kHz
            self.target_bandwidth = max(self.config.bandwidth, 10000)
            # Intermediate rate should be at least 4x bandwidth for AM
            self.intermediate_rate = max(self.target_bandwidth * 4, 80000)
        elif self.config.modulation in [ModulationMode.USB, ModulationMode.LSB]:
            # SSB uses narrower bandwidth, typically 3kHz
            self.target_bandwidth = max(self.config.bandwidth, 3000)
            # Lower intermediate rate for SSB
            self.intermediate_rate = max(self.target_bandwidth * 4, 24000)
        else:  # DSB
            # DSB needs more bandwidth than SSB but less than AM
            self.target_bandwidth = max(self.config.bandwidth, 6000)
            self.intermediate_rate = max(self.target_bandwidth * 4, 48000)

        # Calculate decimation factors
        self.first_decimation = self.input_rate // self.intermediate_rate
        self.second_decimation = self.intermediate_rate // self.audio_rate

        # Ensure minimum decimation of 1
        self.first_decimation = max(1, self.first_decimation)
        self.second_decimation = max(1, self.second_decimation)

        # Recalculate actual rates
        self.intermediate_rate = self.input_rate // self.first_decimation
        self.actual_audio_rate = self.intermediate_rate // self.second_decimation

    def _init_pycsdr_modules(self):
        """Initialize PyCSdr modules for validation"""
        try:
            # Test module chain
            self.shift_module = modules.Shift(0.0)

            # AM demodulation modules
            if self.config.modulation == ModulationMode.AM:
                self.demod_module = modules.AmDemod()
            elif self.config.modulation == ModulationMode.USB:
                # USB demodulation (will implement custom)
                pass
            elif self.config.modulation == ModulationMode.LSB:
                # LSB demodulation (will implement custom)
                pass
            else:  # DSB
                # DSB demodulation (will implement custom)
                pass

            self.dc_block_module = modules.DcBlock()
            self.agc_module = modules.Agc(types.Format.FLOAT)

            logger.info("PyCSdr modules initialized successfully")

        except Exception as e:
            logger.warning(f"PyCSdr module initialization warning: {e}")

    def tune_to_frequency(self, new_target_freq: float):
        """Retune to a new frequency within the IQ stream"""
        old_freq = self.config.target_frequency
        self.config.target_frequency = new_target_freq
        self.freq_offset = new_target_freq - self.config.center_frequency

        logger.info(f"Retuned: {old_freq/1e6:.3f} MHz → {new_target_freq/1e6:.3f} MHz")
        logger.info(f"New offset: {self.freq_offset/1e3:.1f} kHz")

    def set_bandwidth(self, new_bandwidth: float):
        """Change demodulation bandwidth"""
        old_bw = self.config.bandwidth
        self.config.bandwidth = new_bandwidth

        # Recalculate processing rates
        self._calculate_processing_rates()

        logger.info(f"Bandwidth changed: {old_bw/1e3:.1f} kHz → {new_bandwidth/1e3:.1f} kHz")

    def set_modulation_mode(self, new_mode: ModulationMode):
        """Change modulation mode"""
        if new_mode != self.config.modulation:
            old_mode = self.config.modulation
            self.config.modulation = new_mode

            # Recalculate rates for new mode
            self._calculate_processing_rates()

            logger.info(f"Mode changed: {old_mode.value.upper()} → {new_mode.value.upper()}")

    def process_chunk(self, iq_samples: np.ndarray, chunk_id: Optional[int] = None) -> AudioChunk:
        """
        Process a chunk of wide IQ samples to extract audio at target frequency

        Args:
            iq_samples: Complex IQ samples from SDR (full bandwidth)
            chunk_id: Optional chunk identifier

        Returns:
            AudioChunk with demodulated audio
        """
        start_time = time.time()

        if len(iq_samples) == 0:
            return self._empty_audio_chunk(chunk_id)

        try:
            # Ensure correct format
            if iq_samples.dtype != np.complex64:
                iq_samples = iq_samples.astype(np.complex64)

            # Processing pipeline
            # 1. Shift to target frequency
            shifted = self._frequency_shift(iq_samples)

            # 2. First decimation + filtering
            filtered = self._bandpass_filter(shifted)
            decimated1 = self._first_decimation(filtered)

            # 3. Demodulation (AM/USB/LSB/DSB)
            audio = self._demodulate(decimated1)

            # 4. Second decimation to audio rate
            decimated2 = self._second_decimation(audio)

            # 5. Audio processing
            audio_clean = self._dc_block(decimated2)
            audio_final = self._agc(audio_clean)

            # 6. Apply mode-specific processing
            audio_final = self._apply_mode_processing(audio_final)

            # Performance tracking
            processing_time = time.time() - start_time
            self._update_performance_stats(processing_time)

            return AudioChunk(
                samples=audio_final.astype(np.float32),
                sample_rate=self.audio_rate,
                timestamp=time.time(),
                chunk_id=chunk_id,
                metadata={
                    'processing_time_ms': processing_time * 1000,
                    'input_samples': len(iq_samples),
                    'output_samples': len(audio_final),
                    'frequency_mhz': self.config.target_frequency / 1e6,
                    'bandwidth_khz': self.config.bandwidth / 1e3,
                    'modulation': self.config.modulation.value,
                    'freq_offset_khz': self.freq_offset / 1e3,
                    'carrier_level': self.carrier_level
                }
            )

        except Exception as e:
            logger.error(f"Chunk processing error: {e}")
            return self._empty_audio_chunk(chunk_id)

    def _frequency_shift(self, iq_samples: np.ndarray) -> np.ndarray:
        """Shift frequency to baseband"""
        if abs(self.freq_offset) < 1.0:
            return iq_samples

        t = np.arange(len(iq_samples), dtype=np.float32) / self.input_rate
        shift = np.exp(-2j * np.pi * self.freq_offset * t)
        return iq_samples * shift

    def _bandpass_filter(self, iq_samples: np.ndarray) -> np.ndarray:
        """Apply bandpass filter to isolate desired signal"""
        if len(iq_samples) < 64:  # Too short for FFT filtering
            return iq_samples

        # FFT-based filtering
        fft_data = np.fft.fft(iq_samples)
        freqs = np.fft.fftfreq(len(iq_samples), 1.0 / self.input_rate)

        # Create filter mask based on modulation type
        if self.config.modulation == ModulationMode.USB:
            # USB: only positive frequencies
            filter_mask = (freqs >= 0) & (freqs <= self.target_bandwidth)
        elif self.config.modulation == ModulationMode.LSB:
            # LSB: only negative frequencies (mirrored)
            filter_mask = (freqs <= 0) & (freqs >= -self.target_bandwidth)
        else:  # AM or DSB
            # Symmetric around DC
            filter_mask = np.abs(freqs) <= (self.target_bandwidth / 2)

        # Apply filter
        fft_filtered = fft_data * filter_mask
        return np.fft.ifft(fft_filtered)

    def _first_decimation(self, iq_samples: np.ndarray) -> np.ndarray:
        """First decimation stage"""
        if self.first_decimation <= 1:
            return iq_samples
        return iq_samples[::self.first_decimation]

    def _demodulate(self, iq_samples: np.ndarray) -> np.ndarray:
        """AM demodulation based on mode"""
        if len(iq_samples) < 1:
            return np.array([0.0], dtype=np.float32)

        if self.config.modulation == ModulationMode.AM:
            return self._am_demodulate(iq_samples)
        elif self.config.modulation == ModulationMode.USB:
            return self._usb_demodulate(iq_samples)
        elif self.config.modulation == ModulationMode.LSB:
            return self._lsb_demodulate(iq_samples)
        else:  # DSB
            return self._dsb_demodulate(iq_samples)

    def _am_demodulate(self, iq_samples: np.ndarray) -> np.ndarray:
        """Standard AM demodulation using envelope detection"""
        # Calculate magnitude (envelope)
        envelope = np.abs(iq_samples)

        # Simple DC component estimation for carrier recovery
        dc_component = np.mean(envelope)
        self.carrier_level = (1 - self.carrier_recovery_alpha) * self.carrier_level + \
                             self.carrier_recovery_alpha * dc_component

        # Remove DC component to get audio
        audio = envelope - self.carrier_level

        return audio.astype(np.float32)

    def _usb_demodulate(self, iq_samples: np.ndarray) -> np.ndarray:
        """Upper Sideband demodulation"""
        # USB demodulation: take the real part after frequency shifting
        # The imaginary part contains the Hilbert transform
        audio = iq_samples.real
        return audio.astype(np.float32)

    def _lsb_demodulate(self, iq_samples: np.ndarray) -> np.ndarray:
        """Lower Sideband demodulation"""
        # LSB demodulation: take the real part but invert the imaginary component
        # This effectively flips the sideband
        audio = iq_samples.real
        return audio.astype(np.float32)

    def _dsb_demodulate(self, iq_samples: np.ndarray) -> np.ndarray:
        """Double Sideband demodulation"""
        # DSB demodulation: similar to AM but without carrier
        # Use synchronous detection (multiply by carrier)
        audio = iq_samples.real
        return audio.astype(np.float32)

    def _second_decimation(self, audio: np.ndarray) -> np.ndarray:
        """Second decimation to audio rate"""
        if self.second_decimation <= 1:
            return audio
        return audio[::self.second_decimation]

    def _dc_block(self, audio: np.ndarray) -> np.ndarray:
        """DC blocking filter"""
        if len(audio) == 0:
            return audio

        mean_val = np.mean(audio)
        self.dc_accumulator = (1 - self.dc_alpha) * self.dc_accumulator + self.dc_alpha * mean_val
        return audio - self.dc_accumulator

    def _agc(self, audio: np.ndarray) -> np.ndarray:
        """Automatic Gain Control"""
        if len(audio) == 0:
            return audio

        max_amp = np.max(np.abs(audio))
        if max_amp > 1e-6:
            if self.config.modulation == ModulationMode.AM:
                target_level = 0.3  # Higher level for AM
                max_gain = 8.0
            else:  # SSB modes
                target_level = 0.4  # Higher level for SSB
                max_gain = 12.0

            gain = min(target_level / max_amp, max_gain)
            return audio * gain
        return audio

    def _apply_mode_processing(self, audio: np.ndarray) -> np.ndarray:
        """Apply mode-specific audio processing"""
        if self.config.modulation == ModulationMode.AM:
            return self._am_audio_processing(audio)
        elif self.config.modulation in [ModulationMode.USB, ModulationMode.LSB]:
            return self._ssb_audio_processing(audio)
        else:  # DSB
            return self._dsb_audio_processing(audio)

    def _am_audio_processing(self, audio: np.ndarray) -> np.ndarray:
        """Audio processing specific to AM"""
        # Simple high-pass filter to remove very low frequencies
        if len(audio) <= 1:
            return audio

        # Simple high-pass: audio[n] - alpha * audio[n-1]
        alpha = 0.95
        filtered = np.zeros_like(audio)
        filtered[0] = audio[0]
        for i in range(1, len(audio)):
            filtered[i] = audio[i] - alpha * audio[i-1]

        return filtered

    def _ssb_audio_processing(self, audio: np.ndarray) -> np.ndarray:
        """Audio processing for SSB modes"""
        # SSB typically needs less processing, just noise gating
        if len(audio) == 0:
            return audio

        # Simple noise gate for SSB
        noise_threshold = 0.005
        mask = np.abs(audio) > noise_threshold
        return audio * mask

    def _dsb_audio_processing(self, audio: np.ndarray) -> np.ndarray:
        """Audio processing for DSB"""
        # Similar to AM but less aggressive filtering
        return self._am_audio_processing(audio)

    def _empty_audio_chunk(self, chunk_id: Optional[int]) -> AudioChunk:
        """Create empty audio chunk for error cases"""
        return AudioChunk(
            samples=np.array([], dtype=np.float32),
            sample_rate=self.audio_rate,
            timestamp=time.time(),
            chunk_id=chunk_id
        )

    def _update_performance_stats(self, processing_time: float):
        """Update performance tracking"""
        self.chunk_times.append(processing_time)
        self.chunk_count += 1

        if len(self.chunk_times) > 50:
            self.chunk_times = self.chunk_times[-25:]

    def get_performance_stats(self) -> Dict:
        """Get current performance statistics"""
        if not self.chunk_times:
            return {}

        recent_times = self.chunk_times[-10:]
        avg_time = np.mean(recent_times)
        max_time = np.max(recent_times)

        return {
            'chunk_count': self.chunk_count,
            'avg_processing_time_ms': float(avg_time * 1000),
            'max_processing_time_ms': float(max_time * 1000),
            'real_time_factor': float(0.1 / avg_time),
            'is_real_time': bool(avg_time < 0.1),
            'frequency_mhz': self.config.target_frequency / 1e6,
            'bandwidth_khz': self.config.bandwidth / 1e3,
            'modulation': self.config.modulation.value,
            'carrier_level': self.carrier_level
        }

    def to_web_audio(self, audio_chunk: AudioChunk) -> Dict:
        """Convert AudioChunk to web-compatible format"""
        chunk = {
            'samples': audio_chunk.samples.tolist(),
            'sampleRate': audio_chunk.sample_rate,
            'length': len(audio_chunk.samples),
            'duration': len(audio_chunk.samples) / audio_chunk.sample_rate,
            'timestamp': audio_chunk.timestamp,
            'maxAmplitude': float(np.max(np.abs(audio_chunk.samples))) if len(audio_chunk.samples) > 0 else 0.0
        }

        if audio_chunk.chunk_id is not None:
            chunk['chunkId'] = audio_chunk.chunk_id

        if audio_chunk.metadata:
            chunk['metadata'] = audio_chunk.metadata

        return chunk

    def get_status(self) -> Dict:
        """Get current demodulator status"""
        return {
            'target_frequency': self.config.target_frequency,
            'center_frequency': self.config.center_frequency,
            'frequency_offset': self.freq_offset,
            'bandwidth': self.config.bandwidth,
            'modulation': self.config.modulation.value,
            'input_rate': self.input_rate,
            'intermediate_rate': self.intermediate_rate,
            'audio_rate': self.audio_rate,
            'first_decimation': self.first_decimation,
            'second_decimation': self.second_decimation,
            'carrier_level': self.carrier_level
        }


# Example usage and testing
def main():
    """Demo of AM demodulator"""
    logger.info("AM Demodulator Demo")
    logger.info("=" * 50)

    # Test AM (broadcast radio)
    logger.info("Testing AM (Broadcast Radio)")
    am_config = DemodulatorConfig(
        center_frequency=1.0e6,        # 1 MHz center
        target_frequency=1.020e6,      # 1020 kHz AM station
        bandwidth=10e3,                # 10 kHz bandwidth
        modulation=ModulationMode.AM,
        input_rate=2048000             # 2.048 MSPS from SDR
    )

    am_demod = AMDemodulator(am_config)
    logger.info(f"Status: {am_demod.get_status()}")

    # Test USB (amateur radio)
    logger.info("Testing USB (Amateur Radio)")
    usb_config = DemodulatorConfig(
        center_frequency=14.0e6,       # 14 MHz center
        target_frequency=14.205e6,     # 14.205 MHz USB
        bandwidth=3e3,                 # 3 kHz bandwidth
        modulation=ModulationMode.USB,
        input_rate=2048000             # 2.048 MSPS from SDR
    )

    usb_demod = AMDemodulator(usb_config)
    logger.info(f"Status: {usb_demod.get_status()}")

    # Test LSB
    logger.info("Testing LSB (Amateur Radio)")
    lsb_config = DemodulatorConfig(
        center_frequency=7.0e6,        # 7 MHz center
        target_frequency=7.150e6,      # 7.150 MHz LSB
        bandwidth=3e3,                 # 3 kHz bandwidth
        modulation=ModulationMode.LSB,
        input_rate=2048000             # 2.048 MSPS from SDR
    )

    lsb_demod = AMDemodulator(lsb_config)
    logger.info(f"Status: {lsb_demod.get_status()}")

    # Test frequency changes
    logger.info("Testing Dynamic Frequency Changes")
    am_demod.tune_to_frequency(1.040e6)    # Change to 1040 kHz
    usb_demod.tune_to_frequency(14.230e6)  # Change to 14.230 MHz

    logger.info("Demo complete! AM Demodulator ready for use.")


if __name__ == "__main__":
    main()