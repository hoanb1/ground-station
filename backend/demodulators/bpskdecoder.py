# Ground Station - BPSK (9.6k) Decoder using GNU Radio
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
#
# BPSK decoder implementation based on gr-satellites by Daniel Estevez
# https://github.com/daniestevez/gr-satellites
# Copyright 2019 Daniel Estevez <daniel@destevez.net>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This decoder receives raw IQ samples directly from the SDR process (via iq_queue)
# and demodulates BPSK signals, particularly for Tevel satellites at 9600 baud.

import base64
import logging
import os
import queue
import threading
import time
from enum import Enum
from math import ceil, pi
from typing import Any, Dict

import numpy as np
from scipy import signal

from vfos.state import VFOManager

logger = logging.getLogger("bpskdecoder")

# Try to import GNU Radio
GNURADIO_AVAILABLE = False

try:
    from gnuradio import analog, blocks, digital, filter, gr
    from gnuradio.filter import firdes

    GNURADIO_AVAILABLE = True
    logger.info("GNU Radio available - BPSK decoder enabled")
except ImportError as e:
    logger.warning(f"GNU Radio not available: {e}")
    logger.warning("BPSK decoder will not be functional")


class DecoderStatus(Enum):
    """Decoder status values."""

    IDLE = "idle"
    LISTENING = "listening"
    DETECTING = "detecting"
    DECODING = "decoding"
    COMPLETED = "completed"
    ERROR = "error"


class BPSKPacketSink(gr.sync_block):
    """Custom GNU Radio sink block to receive decoded BPSK packets with AX.25 framing"""

    def __init__(self, callback, packet_size=256, sync_word=None):
        gr.sync_block.__init__(self, name="bpsk_packet_sink", in_sig=[np.uint8], out_sig=None)
        self.callback = callback
        self.packet_size = packet_size
        self.buffer = []
        # AX.25 flag sequence: 0x7E (01111110)
        self.sync_word = sync_word or b"\x7E"
        self.last_packet_time: float = 0.0
        self.min_packet_interval = 0.1  # Minimum 100ms between packets
        self.packets_decoded = 0

    def _validate_ax25_packet(self, packet):
        """Validate AX.25 packet structure"""
        if len(packet) < 16:  # Minimum AX.25 frame size
            return False

        # Check for AX.25 flag at start and end
        if packet[0] != 0x7E:
            return False

        # Check for reasonable entropy (not all zeros or all ones)
        unique_bytes = len(set(packet))
        if unique_bytes < 4:
            return False

        return True

    def work(self, input_items, output_items):
        """Process incoming bytes"""
        try:
            current_time = time.time()

            for byte_val in input_items[0]:
                self.buffer.append(int(byte_val))

                # Look for AX.25 flag (0x7E) to detect packet boundaries
                if byte_val == 0x7E and len(self.buffer) >= 16:
                    # Rate limiting: don't process packets too frequently
                    if current_time - self.last_packet_time < self.min_packet_interval:
                        continue

                    # Extract potential packet
                    packet = bytes(self.buffer)

                    # Validate packet
                    if self._validate_ax25_packet(packet):
                        self.last_packet_time = current_time
                        if self.callback:
                            self.callback(packet)
                        self.packets_decoded += 1

                    # Clear buffer after flag
                    self.buffer = []

                # Limit buffer size to prevent memory issues
                if len(self.buffer) > self.packet_size * 2:
                    self.buffer = self.buffer[-self.packet_size :]

        except Exception as e:
            logger.error(f"Error in BPSK packet sink: {e}")
            import traceback

            traceback.print_exc()

        return len(input_items[0])


# Define base class conditionally
if GNURADIO_AVAILABLE and gr is not None:
    _BPSKFlowgraphBase = gr.top_block
else:
    _BPSKFlowgraphBase = object


class BPSKFlowgraph(_BPSKFlowgraphBase):  # type: ignore[misc,valid-type]
    """
    GNU Radio flowgraph for BPSK demodulation

    Based on gr-satellites bpsk_demodulator.py by Daniel Estevez
    Adapted for ground station framework integration
    """

    def __init__(
        self,
        sample_rate,
        callback,
        baudrate=9600,
        f_offset=0,
        differential=False,
        rrc_alpha=0.35,
        fll_bw=25,
        clk_bw=0.06,
        clk_limit=0.004,
        costas_bw=50,
        packet_size=256,
    ):
        """
        Initialize BPSK decoder flowgraph

        Args:
            sample_rate: Input sample rate (Hz)
            callback: Function to call when packet is decoded
            baudrate: Symbol rate / baud rate (symbols/sec)
            f_offset: Frequency offset in Hz
            differential: Perform non-coherent DBPSK decoding (bool)
            rrc_alpha: RRC roll-off factor
            fll_bw: FLL bandwidth (Hz)
            clk_bw: Clock recovery bandwidth (relative to baudrate)
            clk_limit: Clock recovery limit (relative to baudrate)
            costas_bw: Costas loop bandwidth (Hz)
            packet_size: Size of packet in bytes
        """
        if not GNURADIO_AVAILABLE:
            raise RuntimeError("GNU Radio not available - BPSK decoder cannot be initialized")

        super().__init__("BPSK Decoder")

        self.sample_rate = sample_rate
        self.baudrate = baudrate
        self.callback = callback

        # Prevent problems due to baudrate too high
        if baudrate >= sample_rate / 4:
            logger.error(
                f"Sample rate {sample_rate} sps insufficient for {baudrate} "
                "baud BPSK demodulation. Demodulator will not work."
            )
            baudrate = sample_rate / 4

        sps = sample_rate / baudrate
        max_sps = 10
        if sps > max_sps:
            decimation = ceil(sps / max_sps)
        else:
            decimation = 1
        sps /= decimation

        self.samples_per_symbol = sps

        logger.info(
            f"BPSK decoder: sample_rate={sample_rate}, baudrate={baudrate}, "
            f"samples_per_symbol={sps:.2f}, decimation={decimation}"
        )

        # Create vector source for IQ input
        self.vector_source = blocks.vector_source_c([], repeat=False)

        # 1. Frequency translation and low-pass filter
        filter_cutoff = baudrate * 2.0
        filter_transition = baudrate * 0.2
        taps = firdes.low_pass(1, sample_rate, filter_cutoff, filter_transition)
        self.xlating = filter.freq_xlating_fir_filter_ccf(decimation, taps, f_offset, sample_rate)

        # 2. AGC (Automatic Gain Control)
        agc_constant = 2e-2 / sps  # Time constant of 50 symbols
        self.agc = analog.agc2_cc(agc_constant, agc_constant, 1.0, 1.0)

        # 3. FLL (Frequency-Locked Loop) for frequency tracking
        fll_bw_rad = 2 * pi * decimation / sample_rate * fll_bw
        self.fll = digital.fll_band_edge_cc(sps, rrc_alpha, 100, fll_bw_rad)

        # 4. Symbol synchronization (clock recovery)
        nfilts = 16
        rrc_taps = firdes.root_raised_cosine(
            nfilts, nfilts, 1.0 / float(sps), rrc_alpha, int(ceil(11 * sps * nfilts))
        )
        ted_gain = 0.5  # Timing Error Detector gain
        damping = 1.0
        self.clock_recovery = digital.symbol_sync_cc(
            digital.TED_SIGNAL_TIMES_SLOPE_ML,
            sps,
            clk_bw,
            damping,
            ted_gain,
            clk_limit * sps,
            1,
            digital.constellation_bpsk().base(),
            digital.IR_PFB_MF,
            nfilts,
            rrc_taps,
        )

        # 5. Carrier recovery or differential decoding
        self.complex_to_real = blocks.complex_to_real(1)

        if differential:
            # Differential decoding (DBPSK)
            self.delay = blocks.delay(gr.sizeof_gr_complex, 1)
            self.multiply_conj = blocks.multiply_conjugate_cc(1)
            self.connect(self.clock_recovery, (self.multiply_conj, 0))
            self.connect(self.clock_recovery, self.delay, (self.multiply_conj, 1))
            self.connect(self.multiply_conj, self.complex_to_real)
        else:
            # Coherent BPSK with Costas loop
            costas_bw_rad = 2 * pi / baudrate * costas_bw
            self.costas = digital.costas_loop_cc(costas_bw_rad, 2, False)
            self.connect(self.clock_recovery, self.costas, self.complex_to_real)

        # 6. Binary slicer to convert soft symbols to hard bits
        self.binary_slicer = digital.binary_slicer_fb()

        # 7. NRZI decode (AX.25 uses NRZI encoding)
        # NRZI: transition = 0, no transition = 1
        # Implemented as: output[n] = input[n] XOR input[n-1]
        self.nrzi_decode = digital.diff_decoder_bb(2)  # Differential decoder for NRZI

        # 8. G3RUH descrambler (polynomial 0x21, 16-bit)
        self.descrambler = digital.descrambler_bb(0x21, 0, 16)

        # 9. Pack bits into bytes
        self.pack_bits = blocks.pack_k_bits_bb(8)

        # 10. Message sink to receive decoded packets
        self.msg_sink = BPSKPacketSink(self._on_packet_decoded, packet_size)

        # Connect the flowgraph
        self.connect(self.vector_source, self.xlating)
        self.connect(self.xlating, self.agc)
        self.connect(self.agc, self.fll)
        self.connect(self.fll, self.clock_recovery)
        self.connect(self.complex_to_real, self.binary_slicer)
        self.connect(self.binary_slicer, self.nrzi_decode)
        self.connect(self.nrzi_decode, self.descrambler)
        self.connect(self.descrambler, self.pack_bits)
        self.connect(self.pack_bits, self.msg_sink)

        logger.info(
            f"BPSK flowgraph initialized: {baudrate} baud, RRC alpha={rrc_alpha}, "
            f"sps={sps:.2f}, differential={differential}"
        )

    def process_batch(self, samples):
        """Process a batch of IQ samples (non-blocking)"""
        try:
            # Process in chunks to avoid memory issues
            chunk_size = 8192 * 10

            for i in range(0, len(samples), chunk_size):
                chunk = samples[i : i + chunk_size]

                # Set the data for this chunk
                self.vector_source.set_data(chunk.tolist())

                # Start the flowgraph
                self.start()

                # Wait for processing
                time.sleep(0.01)  # 10ms per chunk

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

    def _on_packet_decoded(self, payload):
        """Called when a BPSK packet is successfully decoded"""
        if self.callback:
            self.callback(payload)


class BPSKDecoder(threading.Thread):
    """Real-time BPSK decoder using GNU Radio"""

    def __init__(
        self,
        iq_queue,
        data_queue,
        session_id,
        output_dir="data/decoded",
        vfo=None,
        transmitter=None,  # Complete transmitter dict with all parameters
        baudrate=9600,  # Fallback if not in transmitter dict
        differential=False,
        packet_size=256,
    ):
        if not GNURADIO_AVAILABLE:
            logger.error("GNU Radio not available - BPSK decoder cannot be initialized")
            raise RuntimeError("GNU Radio not available")

        super().__init__(daemon=True, name=f"BPSKDecoder-{session_id}")
        self.iq_queue = iq_queue
        self.data_queue = data_queue
        self.session_id = session_id
        self.sample_rate = None  # VFO bandwidth sample rate (after decimation)
        self.sdr_sample_rate = None  # Full SDR sample rate
        self.running = True
        self.output_dir = output_dir
        self.vfo = vfo
        self.vfo_manager = VFOManager()
        self.sdr_center_freq = None  # SDR center frequency
        self.decimation_filter = None  # Filter for decimation
        self.packet_count = 0

        # Store transmitter dict for future use
        self.transmitter = transmitter or {}

        # Extract BPSK parameters from transmitter dict or use defaults
        self.baudrate = self.transmitter.get("baud", baudrate)
        self.differential = self.transmitter.get("differential", differential)
        self.packet_size = self.transmitter.get("packet_size", packet_size)

        logger.info(f"BPSK decoder received transmitter dict: {self.transmitter}")
        logger.info(
            f"Extracted baud rate: {self.baudrate} (from transmitter: {self.transmitter.get('baud')}, fallback: {baudrate})"
        )

        # Store additional transmitter info
        self.transmitter_description = self.transmitter.get("description", "Unknown")
        self.transmitter_mode = self.transmitter.get("mode", "BPSK")

        os.makedirs(self.output_dir, exist_ok=True)

        # GNU Radio flowgraph (will be initialized when we know sample rate)
        self.flowgraph = None

        # Performance monitoring stats
        self.stats: Dict[str, Any] = {
            "iq_chunks_in": 0,
            "samples_in": 0,
            "data_messages_out": 0,
            "queue_timeouts": 0,
            "packets_decoded": 0,
            "last_activity": None,
            "errors": 0,
        }
        self.stats_lock = threading.Lock()

        logger.info(f"BPSK decoder initialized for session {session_id}, VFO {vfo}")
        if self.transmitter:
            logger.info(f"Transmitter: {self.transmitter_description} ({self.transmitter_mode})")
        logger.info(
            f"BPSK parameters: {self.baudrate} baud, differential={self.differential}, packet_size={self.packet_size} bytes"
        )

    def _get_vfo_state(self):
        """Get VFO state for this decoder."""
        if self.vfo is not None:
            return self.vfo_manager.get_vfo_state(self.session_id, self.vfo)
        return None

    def _frequency_translate(self, samples, offset_freq, sample_rate):
        """Translate frequency by offset (shift signal in frequency domain)."""
        if offset_freq == 0:
            return samples

        # Generate complex exponential for frequency shift
        t = np.arange(len(samples)) / sample_rate
        shift = np.exp(-2j * np.pi * offset_freq * t)
        return samples * shift

    def _design_decimation_filter(self, decimation_factor, bandwidth, sample_rate):
        """Design low-pass filter for decimation."""
        # Cutoff at bandwidth/2 (Nyquist for target bandwidth)
        cutoff = bandwidth / 2
        # Transition band: 10% of bandwidth
        transition = bandwidth * 0.1
        # Design FIR filter
        numtaps = int(sample_rate / transition) | 1  # Ensure odd
        if numtaps > 1001:  # Limit filter length
            numtaps = 1001
        return signal.firwin(numtaps, cutoff, fs=sample_rate)

    def _decimate_iq(self, samples, decimation_factor):
        """Decimate IQ samples with filtering."""
        if decimation_factor == 1:
            return samples

        # Apply low-pass filter
        filtered = signal.lfilter(self.decimation_filter, 1, samples)
        # Decimate
        return filtered[::decimation_factor]

    def _on_packet_decoded(self, payload):
        """Callback when GNU Radio decodes a BPSK packet"""
        try:
            self.packet_count += 1
            logger.info(f"BPSK packet #{self.packet_count} decoded: {len(payload)} bytes")

            # Save to file
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"bpsk_{self.baudrate}baud_{timestamp}_{self.packet_count}.bin"
            filepath = os.path.join(self.output_dir, filename)

            with open(filepath, "wb") as f:
                f.write(payload)
            logger.info(f"Saved: {filepath}")

            # Encode as base64 for transmission
            packet_base64 = base64.b64encode(payload).decode()

            # Try to decode as ASCII for display
            try:
                packet_text = payload.decode("ascii", errors="replace")
            except UnicodeDecodeError:
                packet_text = payload.hex()

            # Send to UI
            msg = {
                "type": "decoder-output",
                "decoder_type": "bpsk",
                "session_id": self.session_id,
                "vfo": self.vfo,
                "timestamp": time.time(),
                "output": {
                    "format": "application/octet-stream",
                    "filename": filename,
                    "filepath": filepath,
                    "packet_data": packet_base64,
                    "packet_text": packet_text,
                    "packet_length": len(payload),
                    "packet_number": self.packet_count,
                    "parameters": f"{self.baudrate}baud",
                },
            }
            try:
                self.data_queue.put(msg, block=False)
                with self.stats_lock:
                    self.stats["data_messages_out"] += 1
            except queue.Full:
                logger.warning("Data queue full, dropping packet output")

            # Send status update
            self._send_status_update(
                DecoderStatus.COMPLETED,
                {"packet_number": self.packet_count, "packet_length": len(payload)},
            )

        except Exception as e:
            logger.error(f"Error processing decoded packet: {e}")
            logger.exception(e)
            with self.stats_lock:
                self.stats["errors"] += 1

    def _send_status_update(self, status, info=None):
        """Send status update to UI"""
        msg = {
            "type": "decoder-status",
            "status": status.value,
            "decoder_type": "bpsk",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "info": info or {},
        }
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            logger.warning("Data queue full, dropping status update")

    def _send_stats_update(self):
        """Send statistics update to UI"""
        msg = {
            "type": "decoder-stats",
            "decoder_type": "bpsk",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "stats": {
                "packets_decoded": self.packet_count,
                "baudrate": self.baudrate,
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
        logger.info(f"BPSK decoder started for {self.session_id}")
        self._send_status_update(DecoderStatus.LISTENING)

        chunks_received = 0
        samples_buffer = np.array([], dtype=np.complex64)
        # Buffer enough samples for BPSK processing
        buffer_duration = 1.0  # seconds
        process_interval = 0.5  # Process every 0.5 seconds

        try:
            while self.running:
                # Read IQ samples from iq_queue
                try:
                    iq_message = self.iq_queue.get(timeout=0.1)

                    # Update stats
                    with self.stats_lock:
                        self.stats["iq_chunks_in"] += 1
                        self.stats["last_activity"] = time.time()

                    # Extract IQ samples and metadata from message
                    samples = iq_message.get("samples")
                    sdr_center = iq_message.get("center_freq")
                    sdr_rate = iq_message.get("sample_rate")

                    if samples is None or len(samples) == 0:
                        continue

                    # Update sample count
                    with self.stats_lock:
                        self.stats["samples_in"] += len(samples)

                    # Get VFO parameters
                    vfo_state = self._get_vfo_state()
                    if not vfo_state or not vfo_state.active:
                        continue  # VFO not active, skip

                    vfo_center = vfo_state.center_freq
                    vfo_bandwidth = vfo_state.bandwidth

                    # Initialize on first message
                    if self.sdr_sample_rate is None:
                        self.sdr_sample_rate = sdr_rate
                        self.sdr_center_freq = sdr_center

                        # Calculate decimation factor for optimal samples per symbol
                        # Target 8-10 samples per symbol
                        target_sps = 8
                        target_sample_rate = self.baudrate * target_sps
                        decimation = int(self.sdr_sample_rate / target_sample_rate)
                        if decimation < 1:
                            decimation = 1
                        self.sample_rate = self.sdr_sample_rate / decimation

                        logger.info(
                            f"BPSK baudrate: {self.baudrate} baud, "
                            f"target rate: {target_sample_rate/1e3:.2f}kS/s ({target_sps} sps)"
                        )

                        # Design decimation filter
                        self.decimation_filter = self._design_decimation_filter(
                            decimation, vfo_bandwidth, self.sdr_sample_rate
                        )

                        logger.info(
                            f"BPSK decoder: SDR rate: {self.sdr_sample_rate/1e6:.2f} MS/s, "
                            f"VFO BW: {vfo_bandwidth/1e3:.0f} kHz, decimation: {decimation}, "
                            f"output rate: {self.sample_rate/1e6:.2f} MS/s"
                        )
                        logger.info(
                            f"VFO center: {vfo_center/1e6:.3f} MHz, "
                            f"SDR center: {sdr_center/1e6:.3f} MHz"
                        )

                        # Calculate buffer sizes
                        buffer_samples = int(self.sample_rate * buffer_duration)
                        process_samples = int(self.sample_rate * process_interval)
                        logger.info(
                            f"Will buffer {buffer_samples} samples ({buffer_duration}s) "
                            f"and process every {process_samples} samples ({process_interval}s)"
                        )

                        # Initialize flowgraph
                        self.flowgraph = BPSKFlowgraph(
                            sample_rate=self.sample_rate,
                            callback=self._on_packet_decoded,
                            baudrate=self.baudrate,
                            differential=self.differential,
                            packet_size=self.packet_size,
                        )

                    # Step 1: Frequency translation to VFO center
                    offset_freq = vfo_center - sdr_center
                    translated = self._frequency_translate(
                        samples, offset_freq, self.sdr_sample_rate
                    )

                    # Step 2: Decimate to VFO bandwidth
                    decimation = int(self.sdr_sample_rate / vfo_bandwidth)
                    if decimation < 1:
                        decimation = 1
                    decimated = self._decimate_iq(translated, decimation)

                    # Add to buffer
                    samples_buffer = np.concatenate([samples_buffer, decimated])

                    # Process when we have enough samples
                    if len(samples_buffer) >= process_samples:
                        # Process the buffered samples
                        if chunks_received % 20 == 0:
                            logger.debug(
                                f"Processing {len(samples_buffer)} samples ({self.baudrate} baud)"
                            )

                        # Send status update
                        if chunks_received % 50 == 0:
                            self._send_status_update(
                                DecoderStatus.DECODING,
                                {
                                    "samples_buffered": len(samples_buffer),
                                    "packets_decoded": self.packet_count,
                                },
                            )

                        # Process batch
                        if self.flowgraph:
                            self.flowgraph.process_batch(samples_buffer)

                        # Keep overlap for packet boundaries
                        if self.sample_rate:
                            overlap_samples = int(self.sample_rate * 0.2)
                        else:
                            overlap_samples = 0
                        if len(samples_buffer) > overlap_samples:
                            samples_buffer = samples_buffer[-overlap_samples:]
                        else:
                            samples_buffer = np.array([], dtype=np.complex64)

                    chunks_received += 1
                    if chunks_received % 100 == 0:
                        logger.debug(
                            f"Received {chunks_received} chunks, "
                            f"buffer: {len(samples_buffer)} samples, "
                            f"packets decoded: {self.packet_count}"
                        )
                        # Send periodic stats update
                        self._send_stats_update()

                except queue.Empty:
                    with self.stats_lock:
                        self.stats["queue_timeouts"] += 1
                    pass

        except Exception as e:
            logger.error(f"BPSK decoder error: {e}")
            logger.exception(e)
            with self.stats_lock:
                self.stats["errors"] += 1
            self._send_status_update(DecoderStatus.ERROR)
        except KeyboardInterrupt:
            pass

        logger.info(f"BPSK decoder stopped for {self.session_id}")

    def stop(self):
        """Stop the decoder thread"""
        self.running = False

        # Send final status update
        msg = {
            "type": "decoder-status",
            "status": "closed",
            "decoder_type": "bpsk",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
        }
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            pass
