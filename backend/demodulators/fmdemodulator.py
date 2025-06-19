
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
    Fixed streaming FM demodulator supporting WFM and NFM
    Handles wide IQ streams with proper phase continuity
    """

    def __init__(self, config: DemodulatorConfig):
        self.config = config
        self.input_rate = config.input_rate
        self.audio_rate = config.audio_rate

        # Calculate frequency offset from center
        self.freq_offset = config.target_frequency - config.center_frequency

        # Calculate decimation stages
        self._calculate_processing_rates()

        # **FIXED: Continuous phase tracking**
        self.phase_accumulator = 0.0
        self.phase_increment = -2 * np.pi * self.freq_offset / self.input_rate
        self.last_sample = 0.0 + 0.0j

        # Processing state - **FIXED: Reset-able state**
        self.dc_accumulator = 0.0
        self.dc_alpha = 0.001

        # Performance tracking
        self.chunk_times: List[float] = []
        self.chunk_count = 0

        # Initialize PyCSdr modules
        self._init_pycsdr_modules()

        logger.info(f"Fixed FM Demodulator initialized:")
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
            # WFM needs higher intermediate rate
            self.intermediate_rate = 240000
        else:  # NFM
            # NFM can use lower intermediate rate
            self.intermediate_rate = 96000

        # Calculate decimation factors
        self.first_decimation = max(1, self.input_rate // self.intermediate_rate)
        self.second_decimation = max(1, self.intermediate_rate // self.audio_rate)

        # Recalculate actual rates
        self.intermediate_rate = self.input_rate // self.first_decimation
        self.actual_audio_rate = self.intermediate_rate // self.second_decimation

    def _init_pycsdr_modules(self):
        """Initialize PyCSdr modules for validation"""
        try:
            # Test module chain
            self.shift_module = modules.Shift(0.0)
            self.demod_module = modules.FmDemod()
            self.dc_block_module = modules.DcBlock()
            self.agc_module = modules.Agc(types.Format.FLOAT)
            logger.info("✓ PyCSdr modules initialized successfully")
        except Exception as e:
            logger.info(f"PyCSdr module initialization warning: {e}")

    def reset_state(self):
        """Reset internal state to prevent drift - called by bridge"""
        self.dc_accumulator = 0.0
        self.phase_accumulator = 0.0
        self.last_sample = 0.0 + 0.0j
        logger.debug("FM demodulator state reset")

    def tune_to_frequency(self, new_target_freq: float):
        """Retune to a new frequency within the IQ stream"""
        old_freq = self.config.target_frequency
        self.config.target_frequency = new_target_freq
        self.freq_offset = new_target_freq - self.config.center_frequency

        # Update phase increment
        self.phase_increment = -2 * np.pi * self.freq_offset / self.input_rate

        logger.info(f"Retuned: {old_freq/1e6:.3f} MHz → {new_target_freq/1e6:.3f} MHz")
        logger.info(f"New offset: {self.freq_offset/1e3:.1f} kHz")

    def set_bandwidth(self, new_bandwidth: float):
        """Change demodulation bandwidth"""
        old_bw = self.config.bandwidth
        self.config.bandwidth = new_bandwidth
        self._calculate_processing_rates()
        logger.info(f"Bandwidth changed: {old_bw/1e3:.1f} kHz → {new_bandwidth/1e3:.1f} kHz")

    def set_modulation_mode(self, new_mode: ModulationMode):
        """Change modulation mode"""
        if new_mode != self.config.modulation:
            old_mode = self.config.modulation
            self.config.modulation = new_mode
            self._calculate_processing_rates()
            logger.info(f"Mode changed: {old_mode.value.upper()} → {new_mode.value.upper()}")

    def process_chunk(self, iq_samples: np.ndarray, chunk_id: Optional[int] = None) -> AudioChunk:
        """
        **FIXED** Process a chunk with proper phase continuity
        """
        start_time = time.time()

        if len(iq_samples) == 0:
            return self._empty_audio_chunk(chunk_id)

        try:
            # Ensure correct format
            if iq_samples.dtype != np.complex64:
                iq_samples = iq_samples.astype(np.complex64)

            # **FIXED** Processing pipeline with continuity
            # 1. Continuous frequency shift
            shifted = self._frequency_shift_continuous(iq_samples)

            # 2. Simple decimation with basic filtering
            decimated1 = self._decimate_with_filter(shifted, self.first_decimation)

            # 3. **FIXED** Phase-based FM demodulation
            audio = self._fm_demodulate_phase(decimated1)

            # 4. Second decimation
            decimated2 = self._decimate_with_filter(audio, self.second_decimation)

            # 5. Audio processing
            audio_clean = self._dc_block_simple(decimated2)
            audio_final = self._agc_simple(audio_clean)

            # 6. Mode-specific processing
            if self.config.modulation == ModulationMode.WFM:
                audio_final = self._wfm_deemphasis_simple(audio_final)
            else:  # NFM
                audio_final = self._nfm_processing_simple(audio_final)

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
            logger.error(f"Chunk processing error: {e}")
            return self._empty_audio_chunk(chunk_id)

    def _frequency_shift_continuous(self, iq_samples: np.ndarray) -> np.ndarray:
        """**FIXED** Frequency shift with continuous phase"""
        if abs(self.freq_offset) < 1.0:
            return iq_samples

        n_samples = len(iq_samples)

        # Generate continuous phase
        phases = np.arange(n_samples) * self.phase_increment + self.phase_accumulator

        # Update accumulator for next chunk
        self.phase_accumulator = (self.phase_accumulator + n_samples * self.phase_increment) % (2 * np.pi)

        # Apply shift
        shift_signal = np.exp(1j * phases)
        return iq_samples * shift_signal

    def _decimate_with_filter(self, signal, decimation):
        """**FIXED** Simple decimation with basic anti-aliasing"""
        if decimation <= 1:
            return signal

        # Simple moving average filter
        kernel_size = min(3, decimation)
        if kernel_size > 1 and len(signal) >= kernel_size:
            if np.iscomplexobj(signal):
                kernel = np.ones(kernel_size, dtype=np.complex64) / kernel_size
            else:
                kernel = np.ones(kernel_size, dtype=np.float32) / kernel_size

            filtered = np.convolve(signal, kernel, mode='same')
        else:
            filtered = signal

        return filtered[::decimation]

    def _fm_demodulate_phase(self, iq_samples: np.ndarray) -> np.ndarray:
        """**FIXED** FM demodulation using phase differences"""
        if len(iq_samples) < 2:
            return np.array([0.0], dtype=np.float32)

        # Add last sample for continuity
        extended_samples = np.concatenate([[self.last_sample], iq_samples])

        # Calculate instantaneous phase
        phases = np.angle(extended_samples)

        # Calculate phase differences (unwrapped)
        phase_diffs = np.diff(np.unwrap(phases))

        # Convert to audio
        if self.config.modulation == ModulationMode.WFM:
            # WFM scaling
            audio = phase_diffs * self.intermediate_rate / (2 * np.pi * 75000)
        else:  # NFM
            # NFM scaling
            audio = phase_diffs * self.intermediate_rate / (2 * np.pi * 5000)

        # Save last sample
        self.last_sample = iq_samples[-1]

        return audio.astype(np.float32)

    def _dc_block_simple(self, audio: np.ndarray) -> np.ndarray:
        """**FIXED** Simple DC blocking without drift"""
        if len(audio) == 0:
            return audio

        # Simple high-pass filter instead of accumulating DC
        if len(audio) > 1:
            # Simple difference filter: y[n] = x[n] - 0.95 * x[n-1]
            filtered = np.zeros_like(audio)
            filtered[0] = audio[0]
            for i in range(1, len(audio)):
                filtered[i] = audio[i] - 0.95 * audio[i-1]
            return filtered
        return audio

    def _agc_simple(self, audio: np.ndarray) -> np.ndarray:
        """**FIXED** Simple AGC without state accumulation"""
        if len(audio) == 0:
            return audio

        max_amp = np.max(np.abs(audio))
        if max_amp > 1e-6:
            if self.config.modulation == ModulationMode.WFM:
                target = 0.3
                max_gain = 8.0
            else:  # NFM
                target = 0.4
                max_gain = 12.0

            gain = min(target / max_amp, max_gain)
            return audio * gain
        return audio

    def _wfm_deemphasis_simple(self, audio: np.ndarray) -> np.ndarray:
        """**FIXED** Simple de-emphasis without state accumulation"""
        if len(audio) <= 1:
            return audio

        # Simple approximation of de-emphasis
        alpha = 0.95
        for i in range(1, len(audio)):
            audio[i] = audio[i] + alpha * (audio[i-1] - audio[i])

        return audio

    def _nfm_processing_simple(self, audio: np.ndarray) -> np.ndarray:
        """**FIXED** Simple NFM processing"""
        if len(audio) == 0:
            return audio

        # Simple noise gate
        noise_threshold = 0.005
        mask = np.abs(audio) > noise_threshold
        return audio * mask

    # Keep all the original methods for compatibility
    def _bandpass_filter(self, iq_samples: np.ndarray) -> np.ndarray:
        """Legacy method - now just returns input"""
        return iq_samples

    def _first_decimation(self, iq_samples: np.ndarray) -> np.ndarray:
        """Legacy method"""
        return self._decimate_with_filter(iq_samples, self.first_decimation)

    def _demodulate(self, iq_samples: np.ndarray) -> np.ndarray:
        """Legacy method"""
        return self._fm_demodulate_phase(iq_samples)

    def _second_decimation(self, audio: np.ndarray) -> np.ndarray:
        """Legacy method"""
        return self._decimate_with_filter(audio, self.second_decimation)

    def _dc_block(self, audio: np.ndarray) -> np.ndarray:
        """Legacy method"""
        return self._dc_block_simple(audio)

    def _agc(self, audio: np.ndarray) -> np.ndarray:
        """Legacy method"""
        return self._agc_simple(audio)

    def _wfm_deemphasis(self, audio: np.ndarray) -> np.ndarray:
        """Legacy method"""
        return self._wfm_deemphasis_simple(audio)

    def _nfm_processing(self, audio: np.ndarray) -> np.ndarray:
        """Legacy method"""
        return self._nfm_processing_simple(audio)

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
    """Demo of fixed FM demodulator"""
    logger.info("Fixed FM Demodulator Demo")
    logger.info("=" * 50)

    # Test WFM
    wfm_config = DemodulatorConfig(
        center_frequency=100.0e6,
        target_frequency=100.1e6,
        bandwidth=200e3,
        modulation=ModulationMode.WFM,
        input_rate=2048000
    )

    wfm_demod = FMDemodulator(wfm_config)
    logger.info(f"WFM Status: {wfm_demod.get_status()}")

    # Test NFM
    nfm_config = DemodulatorConfig(
        center_frequency=460.0e6,
        target_frequency=460.125e6,
        bandwidth=12.5e3,
        modulation=ModulationMode.NFM,
        input_rate=2048000
    )

    nfm_demod = FMDemodulator(nfm_config)
    logger.info(f"NFM Status: {nfm_demod.get_status()}")

    logger.info("Fixed FM Demodulator ready!")


if __name__ == "__main__":
    main()