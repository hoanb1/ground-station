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
logger = logging.getLogger('demod-fm')


class ModulationMode(Enum):
    """Supported modulation modes"""
    WFM = "wfm"  # Wideband FM (broadcast radio)
    NFM = "nfm"  # Narrowband FM (two-way radio)


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


class FMDemodulator:
    """
    Flexible streaming demodulator supporting WFM and NFM
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

        # Performance tracking
        self.chunk_times: List[float] = []
        self.chunk_count = 0

        # Initialize PyCSdr modules
        self._init_pycsdr_modules()

        logger.info(f"Flexible Demodulator initialized:")
        logger.info(f"  Mode: {config.modulation.value.upper()}")
        logger.info(f"  Target: {config.target_frequency / 1e6:.3f} MHz")
        logger.info(f"  Bandwidth: {config.bandwidth / 1e3:.1f} kHz")
        logger.info(f"  Input rate: {self.input_rate:,} Hz")
        logger.info(f"  Intermediate rate: {self.intermediate_rate:,} Hz")
        logger.info(f"  Audio rate: {self.audio_rate:,} Hz")
        logger.info(f"  Frequency offset: {self.freq_offset / 1e3:.1f} kHz")

    def _calculate_processing_rates(self):
        """Calculate intermediate processing rates based on bandwidth and mode"""
        if self.config.modulation == ModulationMode.WFM:
            # WFM needs wider bandwidth, typically 200kHz
            self.target_bandwidth = max(self.config.bandwidth, 200000)
            # Intermediate rate should be at least 2x bandwidth
            self.intermediate_rate = max(self.target_bandwidth * 2.5, 480000)
        else:  # NFM
            # NFM uses narrower bandwidth, typically 12.5-25kHz
            self.target_bandwidth = max(self.config.bandwidth, 25000)
            # Lower intermediate rate for NFM
            self.intermediate_rate = max(self.target_bandwidth * 4, 200000)

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

            if self.config.modulation == ModulationMode.WFM:
                self.demod_module = modules.FmDemod()
            else:  # NFM
                self.demod_module = modules.FmDemod()

            self.dc_block_module = modules.DcBlock()
            self.agc_module = modules.Agc(types.Format.FLOAT)

            logger.info("✓ PyCSdr modules initialized successfully")

        except Exception as e:
            logger.info(f"PyCSdr module initialization warning: {e}")

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

            # 3. Demodulation (WFM or NFM)
            audio = self._demodulate(decimated1)

            # 4. Second decimation to audio rate
            decimated2 = self._second_decimation(audio)

            # 5. Audio processing
            audio_clean = self._dc_block(decimated2)
            audio_final = self._agc(audio_clean)

            # 6. Apply mode-specific processing
            if self.config.modulation == ModulationMode.WFM:
                audio_final = self._wfm_deemphasis(audio_final)
            else:  # NFM
                audio_final = self._nfm_processing(audio_final)

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
                    'freq_offset_khz': self.freq_offset / 1e3
                }
            )

        except Exception as e:
            logger.info(f"Chunk processing error: {e}")
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
        # Simple brick-wall filter in frequency domain
        if len(iq_samples) < 64:  # Too short for FFT filtering
            return iq_samples

        # FFT-based filtering
        fft_data = np.fft.fft(iq_samples)
        freqs = np.fft.fftfreq(len(iq_samples), 1.0 / self.input_rate)

        # Create filter mask
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
        """FM demodulation (same for WFM and NFM)"""
        if len(iq_samples) < 2:
            return np.array([0.0], dtype=np.float32)

        # Cross-product FM demodulation
        real = iq_samples.real
        imag = iq_samples.imag

        cross = real[:-1] * imag[1:] - imag[:-1] * real[1:]
        power = real[:-1] ** 2 + imag[:-1] ** 2
        power = np.where(power < 1e-12, 1e-12, power)

        fm_out = cross / power

        # Scale based on sample rate and modulation
        if self.config.modulation == ModulationMode.WFM:
            # WFM has wider deviation, scale accordingly
            audio = fm_out * self.intermediate_rate / (2 * np.pi)
        else:  # NFM
            # NFM has narrower deviation
            audio = fm_out * self.intermediate_rate / (2 * np.pi) * 0.5

        return np.concatenate([[0.0], audio])

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
            if self.config.modulation == ModulationMode.WFM:
                target_level = 0.2  # Lower level for WFM
                max_gain = 5.0
            else:  # NFM
                target_level = 0.3  # Higher level for NFM
                max_gain = 10.0

            gain = min(target_level / max_amp, max_gain)
            return audio * gain
        return audio

    def _wfm_deemphasis(self, audio: np.ndarray) -> np.ndarray:
        """Apply de-emphasis filter for WFM (75μs time constant)"""
        if len(audio) <= 1:
            return audio

        # Simple 1-pole de-emphasis filter
        tau = 75e-6  # 75 microseconds
        alpha = 1.0 / (1.0 + self.audio_rate * tau)

        # Apply filter
        filtered = np.zeros_like(audio)
        filtered[0] = audio[0]
        for i in range(1, len(audio)):
            filtered[i] = alpha * audio[i] + (1 - alpha) * filtered[i-1]

        return filtered

    def _nfm_processing(self, audio: np.ndarray) -> np.ndarray:
        """Additional processing for NFM"""
        # NFM typically doesn't need de-emphasis, but may need noise reduction
        # Simple noise gate
        if len(audio) == 0:
            return audio

        # Simple noise gate - silence very quiet parts
        noise_threshold = 0.01
        mask = np.abs(audio) > noise_threshold
        return audio * mask

    def _empty_audio_chunk(self, chunk_id: Optional[int]) -> AudioChunk:
        """Create an empty audio chunk for error cases"""
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
            'modulation': self.config.modulation.value
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
            'second_decimation': self.second_decimation
        }


# Example usage and testing
def main():
    """Demo of flexible demodulator"""
    logger.info("Flexible Demodulator Demo")
    logger.info("=" * 50)

    # Test WFM (broadcast radio)
    logger.info("Testing WFM (Broadcast Radio)")
    wfm_config = DemodulatorConfig(
        center_frequency=100.0e6,      # 100 MHz center
        target_frequency=100.1e6,      # 100.1 MHz station
        bandwidth=200e3,               # 200 kHz bandwidth
        modulation=ModulationMode.WFM,
        input_rate=2048000             # 2.048 MSPS from SDR
    )

    wfm_demod = FMDemodulator(wfm_config)
    logger.info(f"Status: {wfm_demod.get_status()}")

    # Test NFM (two-way radio)
    logger.info("Testing NFM (Two-way Radio)")
    nfm_config = DemodulatorConfig(
        center_frequency=460.0e6,      # 460 MHz center
        target_frequency=460.125e6,    # 460.125 MHz channel
        bandwidth=12.5e3,              # 12.5 kHz bandwidth
        modulation=ModulationMode.NFM,
        input_rate=2048000             # 2.048 MSPS from SDR
    )

    nfm_demod = FMDemodulator(nfm_config)
    logger.info(f"Status: {nfm_demod.get_status()}")

    # Test frequency changes
    logger.info("Testing Dynamic Frequency Changes")
    wfm_demod.tune_to_frequency(100.3e6)  # Change to 100.3 MHz
    nfm_demod.tune_to_frequency(460.175e6)  # Change to 460.175 MHz

    logger.info("Demo complete! Demodulator ready for use.")


if __name__ == "__main__":
    main()