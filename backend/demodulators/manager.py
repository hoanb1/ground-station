import threading
import queue
import time
import logging
import numpy as np
from typing import Optional, Dict, Any, Callable, List, Union
from dataclasses import dataclass
from fmdemodulator import FMDemodulator, DemodulatorConfig as FMConfig, ModulationMode as FMMode, AudioChunk
from amdemodulator import AMDemodulator, DemodulatorConfig as AMConfig, ModulationMode as AMMode
from vfos.state import VFOManager, VFOState

# Configure logging
logger = logging.getLogger('demod-manager')

# Type aliases for demodulators
DemodulatorType = Union[FMDemodulator, AMDemodulator]


class StreamingDemodulatorManager:
    """
    Manages streaming from SDR to FM/AM demodulators using VFOManager for control
    Thread-safe and optimized for continuous operation
    """

    def __init__(self, sdr_center_freq: float, sdr_sample_rate: int,
                 max_sample_queue_size: int = 10,
                 max_audio_queue_size: int = 20):

        # VFO Manager integration
        self.vfo_manager = VFOManager()

        # SDR configuration
        self.sdr_center_freq = sdr_center_freq
        self.sdr_sample_rate = sdr_sample_rate

        # Active demodulators for each VFO (can be FM or AM)
        self.demodulators: Dict[int, DemodulatorType] = {}
        self.last_vfo_states: Dict[int, VFOState] = {}

        # Thread-safe queues
        self.sample_queue = queue.Queue(maxsize=max_sample_queue_size)
        self.audio_queues: Dict[int, queue.Queue] = {}  # Per-VFO audio queues

        # Threading control
        self.running = False
        self.demod_thread = None

        # Performance tracking
        self.stats = {
            'samples_processed': 0,
            'samples_dropped': 0,
            'audio_chunks_produced': 0,
            'vfo_updates': 0,
            'last_update': time.time()
        }

        # Callbacks for audio output (per VFO)
        self.audio_callbacks: Dict[int, List[Callable[[int, AudioChunk], None]]] = {}

        # Initialize VFO audio queues and callbacks
        for vfo_id in range(1, 5):  # VFO 1-4
            self.audio_queues[vfo_id] = queue.Queue(maxsize=max_audio_queue_size)
            self.audio_callbacks[vfo_id] = []

        logger.info(f"StreamingDemodulatorManager initialized")
        logger.info(f"  SDR Center: {sdr_center_freq/1e6:.3f} MHz")
        logger.info(f"  SDR Rate: {sdr_sample_rate:,} Hz")
        logger.info(f"  Sample queue size: {max_sample_queue_size}")
        logger.info(f"  Audio queue size: {max_audio_queue_size}")

    def add_audio_callback(self, vfo_id: int, callback: Callable[[int, AudioChunk], None]):
        """Add callback for processed audio chunks from specific VFO"""
        if vfo_id in self.audio_callbacks:
            self.audio_callbacks[vfo_id].append(callback)

    def start_streaming(self):
        """Start the streaming thread"""
        if self.running:
            logger.info("Streaming already running")
            return

        self.running = True

        # Start demodulator thread
        self.demod_thread = threading.Thread(
            target=self._demodulator_worker,
            name="DemodulatorWorker",
            daemon=True
        )
        self.demod_thread.start()

        logger.info("Streaming started")

    def stop_streaming(self):
        """Stop streaming thread gracefully"""
        if not self.running:
            return

        logger.info("Stopping streaming...")
        self.running = False

        # Wait for the thread to finish
        if self.demod_thread and self.demod_thread.is_alive():
            self.demod_thread.join(timeout=2.0)

        logger.info("Streaming stopped")

    def feed_samples(self, iq_samples: np.ndarray) -> bool:
        """
        Feed IQ samples from SDR worker (called by SDR thread)
        Returns True if samples were queued, False if dropped
        """
        try:
            # Non-blocking put - drop samples if queue is full
            self.sample_queue.put(iq_samples, block=False)
            self.stats['samples_processed'] += len(iq_samples)
            return True

        except queue.Full:
            # Drop samples if we can't keep up
            self.stats['samples_dropped'] += len(iq_samples)
            return False

    def get_audio_chunk(self, vfo_id: int, timeout: float = 0.1) -> Optional[AudioChunk]:
        """Get processed audio chunk for specific VFO"""
        if vfo_id not in self.audio_queues:
            return None

        try:
            return self.audio_queues[vfo_id].get(timeout=timeout)
        except queue.Empty:
            return None

    def get_status(self) -> Dict:
        """Get current status and statistics"""
        # Get VFO states
        vfo_states = self.vfo_manager.get_all_vfo_states()

        # Get demodulator performance stats
        demod_stats = {}
        demod_types = {}
        for vfo_id, demod in self.demodulators.items():
            demod_stats[vfo_id] = demod.get_performance_stats()
            demod_types[vfo_id] = type(demod).__name__

        return {
            'running': self.running,
            'sdr_center_freq': self.sdr_center_freq,
            'sdr_sample_rate': self.sdr_sample_rate,
            'active_demodulators': list(self.demodulators.keys()),
            'demodulator_types': demod_types,
            'vfo_states': {vfo_id: {
                'center_freq': state.center_freq,
                'bandwidth': state.bandwidth,
                'modulation': state.modulation,
                'active': state.active,
                'selected': state.selected
            } for vfo_id, state in vfo_states.items()},
            'demodulator_performance': demod_stats,
            'queues': {
                'samples_pending': self.sample_queue.qsize(),
                'audio_pending': {vfo_id: q.qsize() for vfo_id, q in self.audio_queues.items()}
            },
            'statistics': self.stats.copy()
        }

    def _check_vfo_updates(self):
        """Check for VFO state changes and update demodulators accordingly"""
        current_states = self.vfo_manager.get_all_vfo_states()

        for vfo_id, current_state in current_states.items():
            last_state = self.last_vfo_states.get(vfo_id)

            # Check if VFO state changed
            if (last_state is None or
                    current_state.center_freq != last_state.center_freq or
                    current_state.bandwidth != last_state.bandwidth or
                    current_state.modulation != last_state.modulation or
                    current_state.active != last_state.active):

                self._update_vfo_demodulator(vfo_id, current_state, last_state)
                self.stats['vfo_updates'] += 1

            # Update last known state
            self.last_vfo_states[vfo_id] = VFOState(
                center_freq=current_state.center_freq,
                bandwidth=current_state.bandwidth,
                modulation=current_state.modulation,
                active=current_state.active,
                selected=current_state.selected
            )

    def _determine_demodulator_type(self, modulation: str) -> str:
        """Determine if we need FM or AM demodulator based on modulation"""
        modulation_upper = modulation.upper()

        # FM family
        if modulation_upper in ["WFM", "NFM", "FM"]:
            return "FM"

        # AM family
        elif modulation_upper in ["AM", "USB", "LSB", "DSB"]:
            return "AM"

        # Default to FM for unknown modes
        else:
            logger.warning(f"Unknown modulation mode: {modulation}, defaulting to FM")
            return "FM"

    def _create_demodulator(self, vfo_id: int, current_state: VFOState) -> Optional[DemodulatorType]:
        """Create appropriate demodulator (FM or AM) based on modulation mode"""
        demod_type = self._determine_demodulator_type(current_state.modulation)

        if demod_type == "FM":
            return self._create_fm_demodulator(vfo_id, current_state)
        else:  # AM
            return self._create_am_demodulator(vfo_id, current_state)

    def _create_fm_demodulator(self, vfo_id: int, current_state: VFOState) -> Optional[FMDemodulator]:
        """Create FM demodulator"""
        try:
            # Map modulation string to FM enum
            if current_state.modulation.upper() == "WFM":
                modulation = FMMode.WFM
                default_bandwidth = 200000  # 200 kHz for WFM
            elif current_state.modulation.upper() in ["NFM", "FM"]:
                modulation = FMMode.NFM
                default_bandwidth = 25000   # 25 kHz for NFM
            else:
                modulation = FMMode.NFM
                default_bandwidth = 25000

            config = FMConfig(
                center_frequency=self.sdr_center_freq,
                target_frequency=current_state.center_freq,
                bandwidth=current_state.bandwidth or default_bandwidth,
                modulation=modulation,
                input_rate=self.sdr_sample_rate
            )

            demodulator = FMDemodulator(config)
            logger.info(f"Created FM demodulator for VFO {vfo_id}: {current_state.center_freq/1e6:.3f} MHz ({modulation.value.upper()})")
            return demodulator

        except Exception as e:
            logger.error(f"Failed to create FM demodulator for VFO {vfo_id}: {e}")
            return None

    def _create_am_demodulator(self, vfo_id: int, current_state: VFOState) -> Optional[AMDemodulator]:
        """Create AM demodulator"""
        try:
            # Map modulation string to AM enum
            modulation_upper = current_state.modulation.upper()

            if modulation_upper == "AM":
                modulation = AMMode.AM
                default_bandwidth = 10000   # 10 kHz for AM
            elif modulation_upper == "USB":
                modulation = AMMode.USB
                default_bandwidth = 3000    # 3 kHz for USB
            elif modulation_upper == "LSB":
                modulation = AMMode.LSB
                default_bandwidth = 3000    # 3 kHz for LSB
            elif modulation_upper == "DSB":
                modulation = AMMode.DSB
                default_bandwidth = 6000    # 6 kHz for DSB
            else:
                modulation = AMMode.AM
                default_bandwidth = 10000

            config = AMConfig(
                center_frequency=self.sdr_center_freq,
                target_frequency=current_state.center_freq,
                bandwidth=current_state.bandwidth or default_bandwidth,
                modulation=modulation,
                input_rate=self.sdr_sample_rate
            )

            demodulator = AMDemodulator(config)
            logger.info(f"Created AM demodulator for VFO {vfo_id}: {current_state.center_freq/1e6:.3f} MHz ({modulation.value.upper()})")
            return demodulator

        except Exception as e:
            logger.error(f"Failed to create AM demodulator for VFO {vfo_id}: {e}")
            return None

    def _update_vfo_demodulator(self, vfo_id: int, current_state: VFOState, last_state: Optional[VFOState]):
        """Update or create demodulator for VFO"""

        # If VFO is now inactive, remove the demodulator
        if not current_state.active:
            if vfo_id in self.demodulators:
                logger.info(f"Deactivating VFO {vfo_id}")
                del self.demodulators[vfo_id]
            return

        # If VFO is active but has an invalid frequency, skip
        if current_state.center_freq == 0:
            return

        # Check if we need to change the demodulator type
        current_demod_type = self._determine_demodulator_type(current_state.modulation)
        existing_demod = self.demodulators.get(vfo_id)

        # Determine what type of demodulator we currently have
        if existing_demod:
            if isinstance(existing_demod, FMDemodulator):
                existing_demod_type = "FM"
            elif isinstance(existing_demod, AMDemodulator):
                existing_demod_type = "AM"
            else:
                existing_demod_type = "UNKNOWN"
        else:
            existing_demod_type = None

        # If the modulation family changed, we need to recreate the demodulator
        if existing_demod_type != current_demod_type:
            logger.info(f"VFO {vfo_id} changing demodulator type: {existing_demod_type} → {current_demod_type}")

            # Remove old demodulator
            if vfo_id in self.demodulators:
                del self.demodulators[vfo_id]

            # Create new demodulator
            new_demodulator = self._create_demodulator(vfo_id, current_state)
            if new_demodulator:
                self.demodulators[vfo_id] = new_demodulator
            return

        # If no demodulator exists, create one
        if vfo_id not in self.demodulators:
            new_demodulator = self._create_demodulator(vfo_id, current_state)
            if new_demodulator:
                self.demodulators[vfo_id] = new_demodulator
            return

        # Update existing demodulator parameters
        demod = self.demodulators[vfo_id]

        # Check what changed and update accordingly
        if last_state is None or current_state.center_freq != last_state.center_freq:
            demod.tune_to_frequency(current_state.center_freq)
            logger.info(f"VFO {vfo_id} tuned to {current_state.center_freq/1e6:.3f} MHz")

        if last_state is None or current_state.bandwidth != last_state.bandwidth:
            bandwidth = current_state.bandwidth or self._get_default_bandwidth(current_state.modulation)
            demod.set_bandwidth(bandwidth)
            logger.info(f"VFO {vfo_id} bandwidth set to {bandwidth/1e3:.1f} kHz")

        if last_state is None or current_state.modulation != last_state.modulation:
            # Map to appropriate enum
            if isinstance(demod, FMDemodulator):
                if current_state.modulation.upper() == "WFM":
                    demod.set_modulation_mode(FMMode.WFM)
                else:
                    demod.set_modulation_mode(FMMode.NFM)
            elif isinstance(demod, AMDemodulator):
                modulation_map = {
                    "AM": AMMode.AM,
                    "USB": AMMode.USB,
                    "LSB": AMMode.LSB,
                    "DSB": AMMode.DSB
                }
                am_mode = modulation_map.get(current_state.modulation.upper(), AMMode.AM)
                demod.set_modulation_mode(am_mode)

            logger.info(f"VFO {vfo_id} mode set to {current_state.modulation.upper()}")

    def _get_default_bandwidth(self, modulation: str) -> int:
        """Get default bandwidth for modulation mode"""
        modulation_upper = modulation.upper()

        if modulation_upper == "WFM":
            return 200000  # 200 kHz
        elif modulation_upper in ["NFM", "FM"]:
            return 25000   # 25 kHz
        elif modulation_upper == "AM":
            return 10000   # 10 kHz
        elif modulation_upper in ["USB", "LSB"]:
            return 3000    # 3 kHz
        elif modulation_upper == "DSB":
            return 6000    # 6 kHz
        else:
            return 25000   # Default

    def _demodulator_worker(self):
        """Main demodulation worker thread"""
        logger.info("Demodulator worker started")
        chunk_id = 0

        while self.running:
            try:
                # Check for VFO updates (read from VFOManager)
                self._check_vfo_updates()

                # Get IQ samples with timeout
                iq_samples = self.sample_queue.get(timeout=0.1)

                if iq_samples is None:  # Shutdown signal
                    break

                # Process samples for each active VFO
                for vfo_id, demodulator in self.demodulators.items():
                    try:
                        # Process samples
                        audio_chunk = demodulator.process_chunk(iq_samples, chunk_id)

                        # Queue audio output
                        try:
                            self.audio_queues[vfo_id].put(audio_chunk, block=False)
                            self.stats['audio_chunks_produced'] += 1

                            # Call callbacks for this VFO
                            for callback in self.audio_callbacks[vfo_id]:
                                try:
                                    callback(vfo_id, audio_chunk)
                                except Exception as e:
                                    logger.warning(f"Audio callback error for VFO {vfo_id}: {e}")

                        except queue.Full:
                            # Drop audio if output queue is full
                            pass

                    except Exception as e:
                        logger.error(f"Demodulator error for VFO {vfo_id}: {e}")

                chunk_id += 1

                # Mark sample processing complete
                self.sample_queue.task_done()

            except queue.Empty:
                continue  # Timeout - check VFO updates and continue
            except Exception as e:
                logger.error(f"Demodulator worker error: {e}")
                time.sleep(0.01)  # Brief pause before retry

        logger.info("Demodulator worker stopped")
