import threading
import queue
import time
import numpy as np
import logging
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass
from fmdemodulator import FMDemodulator, DemodulatorConfig, ModulationMode, AudioChunk
from manager import StreamingDemodulatorManager


# Configure logging
logger = logging.getLogger('demod-bridge')


# Integration bridge with VFO support
class SDRVFODemodulatorBridge:
    """Bridge between SDR worker and VFO-aware streaming demodulator"""

    def __init__(self, sdr_center_freq: float, sdr_sample_rate: int):
        self.streaming_demod = StreamingDemodulatorManager(sdr_center_freq, sdr_sample_rate)

        # Web audio buffers for each VFO
        self.web_audio_buffers: Dict[int, queue.Queue] = {}
        for vfo_id in range(1, 5):
            self.web_audio_buffers[vfo_id] = queue.Queue(maxsize=50)
            # Add audio callback for each VFO
            self.streaming_demod.add_audio_callback(vfo_id, self._handle_audio_chunk)

    def start(self):
        """Start the complete system"""
        logger.info("Starting SDR-VFO-Demodulator bridge")
        self.streaming_demod.start_streaming()
        logger.info("Bridge started - ready for samples and VFO control")

    def stop(self):
        """Stop the complete system"""
        logger.info("Stopping SDR-VFO-Demodulator bridge")
        self.streaming_demod.stop_streaming()

    def _handle_audio_chunk(self, vfo_id: int, audio_chunk: AudioChunk):
        """Handle processed audio for web streaming"""
        web_chunk = self.streaming_demod.demodulators[vfo_id].to_web_audio(audio_chunk)
        web_chunk['vfo_id'] = vfo_id  # Add VFO identifier

        try:
            self.web_audio_buffers[vfo_id].put(web_chunk, block=False)
        except queue.Full:
            # Drop old audio if buffer is full
            try:
                self.web_audio_buffers[vfo_id].get_nowait()
                self.web_audio_buffers[vfo_id].put(web_chunk, block=False)
            except queue.Empty:
                pass

    def get_web_audio(self, vfo_id: int) -> Optional[Dict]:
        """Get audio chunk for specific VFO web streaming"""
        if vfo_id not in self.web_audio_buffers:
            return None

        try:
            return self.web_audio_buffers[vfo_id].get_nowait()
        except queue.Empty:
            return None

    def get_all_web_audio(self) -> Dict[int, Optional[Dict]]:
        """Get audio chunks for all VFOs"""
        return {vfo_id: self.get_web_audio(vfo_id) for vfo_id in range(1, 5)}

    # === Integration with your SDR worker ===
    def on_sdr_samples(self, iq_samples: np.ndarray):
        """
        Call this from your SDR worker when samples arrive
        This is the key integration point!
        """
        success = self.streaming_demod.feed_samples(iq_samples)
        if not success:
            logger.info(f"Dropped {len(iq_samples)} samples - can't keep up")

    def get_status(self) -> Dict:
        """Get complete system status"""
        return self.streaming_demod.get_status()

