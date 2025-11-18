# Ground Station - GMSK/FSK Decoder using GNU Radio
# Developed by Claude (Anthropic AI) for the Ground Station project
#
# GMSK/FSK demodulation logic based on gr-satellites by Daniel Estevez
# https://github.com/daniestevez/gr-satellites
# Copyright 2019 Daniel Estevez <daniel@destevez.net>
# SPDX-License-Identifier: GPL-3.0-or-later
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
#
# GMSK/FSK decoder with GNU Radio blocks for proper demodulation.
# This decoder receives raw IQ samples directly from the SDR process (via iq_queue).

import logging
import os
import queue
import threading
import time
from enum import Enum
from math import ceil, pi
from typing import Any, Dict, Optional, cast

import numpy as np
from gnuradio.filter import firdes

from vfos.state import VFOManager

logger = logging.getLogger("gmskdecoder")

# Try to import GNU Radio
GNURADIO_AVAILABLE = False

try:
    from gnuradio import analog, blocks, digital, filter, gr

    GNURADIO_AVAILABLE = True
    logger.info("GNU Radio available for GMSK/FSK decoding")

except ImportError as e:
    logger.warning(f"GNU Radio not available: {e}")
    logger.warning("GMSK decoder will not be functional")


class DecoderStatus(Enum):
    """Decoder status values."""

    IDLE = "idle"
    LISTENING = "listening"
    DETECTING = "detecting"
    DECODING = "decoding"
    COMPLETED = "completed"
    ERROR = "error"


class GMSKMessageSink(gr.sync_block):
    """Custom GNU Radio sink block to receive decoded GMSK symbols"""

    def __init__(self, callback):
        gr.sync_block.__init__(self, name="gmsk_message_sink", in_sig=[np.float32], out_sig=None)
        self.callback = callback
        self.buffer = []
        self.max_buffer_size = 10000  # Keep last 10k symbols

    def work(self, input_items, output_items):
        """Process incoming symbols"""
        try:
            for symbol in input_items[0]:
                self.buffer.append(float(symbol))

                # Limit buffer size
                if len(self.buffer) > self.max_buffer_size:
                    self.buffer = self.buffer[-self.max_buffer_size :]

            # Callback with symbols for further processing
            if self.callback and len(self.buffer) > 0:
                self.callback(np.array(self.buffer, dtype=np.float32))
                self.buffer = []  # Clear after callback

        except Exception as e:
            logger.error(f"Error in GMSK message sink: {e}")
            import traceback

            traceback.print_exc()

        return len(input_items[0])


# Define base class conditionally
if GNURADIO_AVAILABLE and gr is not None:
    _GMSKFlowgraphBase = gr.top_block
else:
    _GMSKFlowgraphBase = object


class GMSKFlowgraph(_GMSKFlowgraphBase):  # type: ignore[misc,valid-type]
    """
    GNU Radio flowgraph for GMSK/FSK demodulation

    Based on gr-satellites FSK demodulator by Daniel Estevez
    https://github.com/daniestevez/gr-satellites
    """

    def __init__(
        self,
        sample_rate,
        callback,
        baudrate=9600,
        deviation=5000,
        use_agc=True,
        dc_block=True,
        clk_bw=0.06,
        clk_limit=0.004,
    ):
        """
        Initialize GMSK/FSK demodulator flowgraph

        Args:
            sample_rate: Input sample rate (Hz)
            callback: Function to call with demodulated symbols
            baudrate: Baudrate in symbols per second
            deviation: Deviation in Hz (negative inverts sidebands)
            use_agc: Use automatic gain control
            dc_block: Use DC blocker
            clk_bw: Clock recovery bandwidth (relative to baudrate)
            clk_limit: Clock recovery limit (relative to baudrate)
        """
        if not GNURADIO_AVAILABLE:
            raise RuntimeError("GNU Radio not available - GMSK decoder cannot be initialized")

        super().__init__("GMSK/FSK Decoder")

        self.sample_rate = sample_rate
        self.baudrate = baudrate
        self.callback = callback

        # Prevent problems due to baudrate too high
        if baudrate >= sample_rate:
            logger.error(
                f"Sample rate {sample_rate} sps insufficient for {baudrate} "
                f"baud FSK demodulation. Demodulator will not work."
            )
            baudrate = sample_rate / 2

        logger.info(
            f"GMSK/FSK decoder: sample_rate={sample_rate}, baudrate={baudrate}, "
            f"deviation={deviation}"
        )

        # Create vector source for input samples (IQ)
        self.vector_source = blocks.vector_source_c([], repeat=False)

        # 1. Quadrature demodulation (FM demodulation)
        # GMSK is essentially FM modulation with Gaussian-shaped pulses
        carson_cutoff = abs(deviation) + baudrate / 2
        self.quad_demod = analog.quadrature_demod_cf(sample_rate / (2 * pi * deviation))

        # 2. Low-pass filter to Carson's bandwidth
        if carson_cutoff < sample_rate / 2:
            # Filter before demod if sample rate allows
            fir_taps = firdes.low_pass(1, sample_rate, carson_cutoff, 0.1 * carson_cutoff)
            self.demod_filter = filter.fir_filter_ccf(1, fir_taps)
            has_demod_filter = True
        else:
            # Sample rate is already narrower than Carson's bandwidth
            has_demod_filter = False

        # 3. Calculate samples per symbol and decimation
        sps = sample_rate / baudrate
        max_sps = 10
        if sps > max_sps:
            decimation = ceil(sps / max_sps)
        else:
            decimation = 1
        sps /= decimation

        logger.info(f"Samples per symbol: {sps:.2f} (after decimation: {decimation})")

        # 4. Square pulse filter (moving average filter)
        sqfilter_len = int(sample_rate / baudrate)
        taps = np.ones(sqfilter_len) / sqfilter_len
        self.lowpass = filter.fir_filter_fff(decimation, taps)

        # 5. DC blocker (optional)
        if dc_block:
            self.dcblock = filter.dc_blocker_ff(ceil(sps * 32), True)

        # 6. AGC (optional)
        if use_agc:
            # Time constant of 50 symbols
            agc_constant = 2e-2 / sps
            self.agc = analog.agc2_ff(agc_constant, agc_constant, 1.0, 1.0)

        # 7. Clock recovery using Gardner TED
        # "Empiric" formula for TED gain: 1.47 symbol^{-1}
        ted_gain = 1.47
        damping = 1.0
        self.clock_recovery = digital.symbol_sync_ff(
            digital.TED_GARDNER,
            sps,
            clk_bw,
            damping,
            ted_gain,
            clk_limit * sps,
            1,
            digital.constellation_bpsk().base(),
            digital.IR_PFB_NO_MF,
        )

        # 8. Message sink to receive demodulated symbols
        self.msg_sink = GMSKMessageSink(self._on_symbols_decoded)

        # Connect the flowgraph
        # Start with vector source
        if has_demod_filter:
            self.connect(self.vector_source, self.demod_filter, self.quad_demod)
        else:
            self.connect(self.vector_source, self.quad_demod)

        # Connect demod → lowpass
        self.connect(self.quad_demod, self.lowpass)

        # Connect lowpass → dcblock (if enabled) → agc (if enabled) → clock recovery
        if dc_block:
            self.connect(self.lowpass, self.dcblock)
            if use_agc:
                self.connect(self.dcblock, self.agc, self.clock_recovery)
            else:
                self.connect(self.dcblock, self.clock_recovery)
        else:
            if use_agc:
                self.connect(self.lowpass, self.agc, self.clock_recovery)
            else:
                self.connect(self.lowpass, self.clock_recovery)

        # Connect clock recovery → message sink
        self.connect(self.clock_recovery, self.msg_sink)

        logger.debug(f"GMSK/FSK flowgraph initialized: {baudrate} baud, deviation={deviation}")

    def process_batch(self, samples):
        """Process a batch of IQ samples"""
        try:
            # Set the input samples
            self.vector_source.set_data(samples.tolist())

            # Run the flowgraph
            self.start()
            time.sleep(0.01)  # Small delay for processing

            # Stop gracefully
            try:
                self.stop()
                self.wait()
            except Exception:
                pass

        except Exception as e:
            logger.error(f"Error processing batch: {e}")
            import traceback

            traceback.print_exc()

    def _on_symbols_decoded(self, symbols):
        """Called when symbols are demodulated"""
        if self.callback:
            self.callback(symbols)


class GMSKDecoder(threading.Thread):
    """Real-time GMSK/FSK decoder using GNU Radio"""

    def __init__(
        self,
        iq_queue,
        data_queue,
        session_id,
        output_dir="data/decoded",
        vfo=None,
        transmitter=None,  # Complete transmitter dict with all parameters
        symbol_rate=9600,  # Fallback if not in transmitter dict
        deviation=5000,  # FSK deviation in Hz
    ):
        if not GNURADIO_AVAILABLE:
            logger.error("GNU Radio not available - GMSK decoder cannot be initialized")
            raise RuntimeError("GNU Radio not available")

        super().__init__(daemon=True, name=f"GMSKDecoder-{session_id}")
        self.iq_queue = iq_queue
        self.data_queue = data_queue
        self.session_id = session_id
        self.sample_rate = None  # Processing sample rate (after initial setup)
        self.sdr_sample_rate = None  # Full SDR sample rate
        self.running = True
        self.output_dir = output_dir
        self.vfo = vfo
        self.vfo_manager = VFOManager()
        self.sdr_center_freq = None  # SDR center frequency
        self.symbol_count: int = 0
        self.last_activity: Optional[float] = None

        # Store transmitter dict for future use (framing, protocols, etc.)
        self.transmitter = transmitter or {}

        # Extract GMSK/FSK parameters from transmitter dict or use defaults
        self.baudrate = self.transmitter.get("baud", symbol_rate)
        self.deviation = self.transmitter.get("deviation", deviation)

        # Store additional transmitter info
        self.transmitter_description = self.transmitter.get("description", "Unknown")
        self.transmitter_mode = self.transmitter.get("mode", "GMSK")

        os.makedirs(self.output_dir, exist_ok=True)

        # GNU Radio flowgraph (will be initialized when we know sample rate)
        self.flowgraph = None

        # Stats tracking (thread-safe)
        self.stats: Dict[str, Any] = {
            "iq_chunks_in": 0,
            "samples_in": 0,
            "data_messages_out": 0,
            "symbols_decoded": 0,
            "last_activity": None,
            "errors": 0,
        }
        self.stats_lock = threading.Lock()

        logger.info(f"GMSK decoder initialized for session {session_id}, VFO {vfo}")
        if self.transmitter:
            logger.info(f"Transmitter: {self.transmitter_description} ({self.transmitter_mode})")
        logger.info(f"GMSK parameters: {self.baudrate} baud, deviation={self.deviation} Hz")

    def _get_vfo_state(self):
        """Get VFO state for this decoder."""
        if self.vfo is not None:
            return self.vfo_manager.get_vfo_state(self.session_id, self.vfo)
        return None

    def _on_symbols_decoded(self, symbols):
        """Callback when GNU Radio demodulates GMSK symbols"""
        try:
            if symbols is None or len(symbols) == 0:
                return

            self.symbol_count += len(symbols)
            current_time = time.time()
            self.last_activity = current_time

            # Update stats
            with self.stats_lock:
                symbols_decoded = cast(int, self.stats.get("symbols_decoded", 0))
                data_messages_out = cast(int, self.stats.get("data_messages_out", 0))
                self.stats["symbols_decoded"] = symbols_decoded + len(symbols)
                self.stats["last_activity"] = current_time
                self.stats["data_messages_out"] = data_messages_out + 1

            # Log periodically
            if self.symbol_count % 10000 == 0:
                logger.debug(f"GMSK decoder: {self.symbol_count} symbols decoded")

            # Save symbols to file for inspection
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"gmsk_{self.baudrate}baud_symbols_{timestamp}.bin"
            filepath = os.path.join(self.output_dir, filename)

            # Save as float32 binary
            symbols.astype(np.float32).tofile(filepath)

            # Send to UI (for now, just send symbol stats)
            msg = {
                "type": "decoder-output",
                "decoder_type": "gmsk",
                "session_id": self.session_id,
                "vfo": self.vfo,
                "timestamp": time.time(),
                "output": {
                    "format": "symbols",
                    "symbol_count": len(symbols),
                    "total_symbols": self.symbol_count,
                    "baudrate": self.baudrate,
                    "filepath": filepath,
                },
            }
            try:
                self.data_queue.put(msg, block=False)
            except queue.Full:
                logger.warning("Data queue full, dropping symbol output")

        except Exception as e:
            logger.error(f"Error processing decoded symbols: {e}")
            with self.stats_lock:
                errors = cast(int, self.stats.get("errors", 0))
                self.stats["errors"] = errors + 1
            import traceback

            traceback.print_exc()

    def _send_status_update(self, status, info=None):
        """Send status update to UI"""
        msg = {
            "type": "decoder-status",
            "status": status.value,
            "decoder_type": "gmsk",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "info": info or {},
        }
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            logger.warning("Data queue full, dropping status update")

    def run(self):
        """Main thread loop"""
        logger.info(f"GMSK decoder started for {self.session_id}")
        self._send_status_update(DecoderStatus.LISTENING)

        chunks_received = 0
        samples_buffer = np.array([], dtype=np.complex64)
        # Buffer enough samples for GMSK processing
        buffer_duration = 0.5  # Process every 0.5 seconds
        buffer_samples = 0  # Will be initialized when we know sample rate

        try:
            while self.running:
                # Read IQ samples from iq_queue
                try:
                    iq_message = self.iq_queue.get(timeout=0.1)

                    # Extract IQ samples and metadata from message
                    samples = iq_message.get("samples")
                    sdr_center = iq_message.get("center_freq")
                    sdr_rate = iq_message.get("sample_rate")

                    if samples is None or len(samples) == 0:
                        continue

                    # Get VFO parameters
                    vfo_state = self._get_vfo_state()
                    if not vfo_state or not vfo_state.active:
                        continue  # VFO not active, skip

                    vfo_bandwidth = vfo_state.bandwidth

                    # Update stats
                    with self.stats_lock:
                        iq_chunks_in = cast(int, self.stats.get("iq_chunks_in", 0))
                        samples_in = cast(int, self.stats.get("samples_in", 0))
                        self.stats["iq_chunks_in"] = iq_chunks_in + 1
                        self.stats["samples_in"] = samples_in + len(samples)

                    # Initialize on first message
                    if self.sdr_sample_rate is None:
                        self.sdr_sample_rate = sdr_rate
                        self.sdr_center_freq = sdr_center

                        # Use VFO bandwidth as sample rate for flowgraph
                        self.sample_rate = vfo_bandwidth

                        logger.info(
                            f"GMSK decoder: SDR rate: {self.sdr_sample_rate/1e6:.2f} MS/s, "
                            f"VFO BW: {vfo_bandwidth/1e3:.0f} kHz"
                        )
                        logger.info(
                            f"Baudrate: {self.baudrate} baud, deviation: {self.deviation} Hz"
                        )

                        # Calculate buffer size
                        buffer_samples = int(self.sample_rate * buffer_duration)
                        logger.info(f"Buffer size: {buffer_samples} samples ({buffer_duration}s)")

                        # Initialize flowgraph
                        self.flowgraph = GMSKFlowgraph(
                            sample_rate=self.sample_rate,
                            callback=self._on_symbols_decoded,
                            baudrate=self.baudrate,
                            deviation=self.deviation,
                            use_agc=True,
                            dc_block=True,
                        )

                    # Add to buffer (samples already decimated to VFO bandwidth by IQ broadcaster)
                    samples_buffer = np.concatenate([samples_buffer, samples])

                    # Process when we have enough samples
                    if len(samples_buffer) >= buffer_samples:
                        # Send status update
                        if chunks_received % 50 == 0:
                            self._send_status_update(
                                DecoderStatus.DECODING,
                                {
                                    "samples_buffered": len(samples_buffer),
                                    "symbols_decoded": self.symbol_count,
                                },
                            )

                        # Process batch
                        if self.flowgraph:
                            self.flowgraph.process_batch(samples_buffer)

                        # Clear buffer after processing
                        samples_buffer = np.array([], dtype=np.complex64)

                    chunks_received += 1
                    if chunks_received % 100 == 0:
                        logger.debug(
                            f"Received {chunks_received} chunks, "
                            f"buffer: {len(samples_buffer)} samples, "
                            f"symbols decoded: {self.symbol_count}"
                        )

                except queue.Empty:
                    pass

        except Exception as e:
            logger.error(f"GMSK decoder error: {e}")
            with self.stats_lock:
                errors = int(self.stats.get("errors", 0))
                self.stats["errors"] = errors + 1
            import traceback

            traceback.print_exc()
            self._send_status_update(DecoderStatus.ERROR)
        except KeyboardInterrupt:
            pass

        logger.info(f"GMSK decoder stopped for {self.session_id}")

    def stop(self):
        """Stop the decoder thread"""
        self.running = False

        # Send final status update
        msg = {
            "type": "decoder-status",
            "status": "closed",
            "decoder_type": "gmsk",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
        }
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            pass
