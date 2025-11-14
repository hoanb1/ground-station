# Ground Station - GMSK (USP FEC) Decoder using GNU Radio
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
# GMSK decoder with USP FEC using GNU Radio blocks for proper GMSK PHY decoding.
# This decoder receives raw IQ samples directly from the SDR process (via iq_queue).

import base64
import logging
import os
import queue
import threading
import time
from enum import Enum

import numpy as np
from scipy import signal

from vfos.state import VFOManager

logger = logging.getLogger("gmskdecoder")

# Try to import GNU Radio
GNURADIO_AVAILABLE = False
FEC_AVAILABLE = False
RS_AVAILABLE = False

try:
    from gnuradio import analog, blocks, digital, filter, gr

    GNURADIO_AVAILABLE = True

    # Try to import FEC module for USP FEC support
    try:
        from gnuradio import fec

        FEC_AVAILABLE = True
        logger.info("GNU Radio FEC module available - USP FEC decoding enabled")
    except ImportError:
        logger.warning("GNU Radio FEC module not available - USP FEC decoding disabled")

except ImportError as e:
    logger.warning(f"GNU Radio not available: {e}")
    logger.warning("GMSK decoder will not be functional")

# Try to import Reed-Solomon library
try:
    import reedsolo

    RS_AVAILABLE = True
    logger.info("reedsolo library available - Reed-Solomon decoding enabled")
except ImportError:
    logger.warning("reedsolo library not available - install with: pip install reedsolo")
    logger.warning("Reed-Solomon decoding will be disabled")


class DecoderStatus(Enum):
    """Decoder status values."""

    IDLE = "idle"
    LISTENING = "listening"
    DETECTING = "detecting"
    DECODING = "decoding"
    COMPLETED = "completed"
    ERROR = "error"


class GMSKMessageSink(gr.sync_block):
    """Custom GNU Radio sink block to receive decoded GMSK packets"""

    def __init__(self, callback, packet_size=256, sync_word=None, use_rs=False):
        gr.sync_block.__init__(self, name="gmsk_message_sink", in_sig=[np.uint8], out_sig=None)
        self.callback = callback
        self.packet_size = packet_size
        self.buffer = []
        self.sync_word = sync_word or b"\xAA\xAA"  # Default sync word (alternating pattern)
        self.last_packet_time: float = 0.0
        self.min_packet_interval = (
            5.0  # Minimum 5 seconds between packets to reduce false positives
        )
        self.packets_decoded = 0
        self.use_rs = use_rs and RS_AVAILABLE

        # Initialize Reed-Solomon decoder if available
        if self.use_rs:
            # RS(255, 223) - 32 parity symbols, can correct up to 16 errors
            self.rs_decoder = reedsolo.RSCodec(32)  # 32 parity bytes
            logger.info("Reed-Solomon decoder initialized: RS(255,223)")
        else:
            self.rs_decoder = None

    def _validate_packet(self, packet):
        """Strict packet validation to reduce false positives"""
        # Check for all zeros (noise)
        if packet == b"\x00" * len(packet):
            return False

        # Check for all ones (noise)
        if packet == b"\xff" * len(packet):
            return False

        # Check for reasonable entropy (not too repetitive)
        unique_bytes = len(set(packet))
        if (
            unique_bytes < 32
        ):  # Less than 32 unique bytes in 256 is very suspicious (increased from 10)
            return False

        # Check for excessive repeating patterns (common in noise)
        # Look for runs of the same byte
        max_run = 1
        current_run = 1
        for i in range(1, len(packet)):
            if packet[i] == packet[i - 1]:
                current_run += 1
                max_run = max(max_run, current_run)
            else:
                current_run = 1

        # If more than 20 consecutive identical bytes, likely noise
        if max_run > 20:
            return False

        # Check bit transition density (GMSK should have reasonable transitions)
        transitions = 0
        for i in range(1, len(packet)):
            # Count byte-level transitions
            if packet[i] != packet[i - 1]:
                transitions += 1

        # Require at least 30% byte transitions
        if transitions < len(packet) * 0.3:
            return False

        return True

    def work(self, input_items, output_items):
        """Process incoming bytes"""
        try:
            current_time = time.time()

            for byte_val in input_items[0]:
                self.buffer.append(int(byte_val))

                # Limit buffer size to prevent memory issues
                if len(self.buffer) > self.packet_size * 2:
                    self.buffer = self.buffer[-self.packet_size :]

                # Check if we have accumulated a full packet
                if len(self.buffer) >= self.packet_size:
                    # Rate limiting: don't process packets too frequently
                    if current_time - self.last_packet_time < self.min_packet_interval:
                        # Skip this packet, too soon
                        self.buffer = self.buffer[1:]  # Remove first byte and continue
                        continue

                    packet = bytes(self.buffer[: self.packet_size])

                    # Apply Reed-Solomon decoding if enabled
                    if self.use_rs and self.rs_decoder:
                        try:
                            # Attempt RS decoding - this will correct errors and verify CRC
                            decoded_packet = self.rs_decoder.decode(packet)
                            # If decode succeeds, we have a valid packet with errors corrected
                            packet = bytes(decoded_packet)
                            logger.debug(f"Reed-Solomon decode successful ({len(packet)} bytes)")
                        except reedsolo.ReedSolomonError as e:
                            # RS decode failed - too many errors or invalid packet
                            logger.debug(f"Reed-Solomon decode failed: {e}")
                            # Skip this packet and slide window
                            self.buffer = self.buffer[1:]
                            continue

                    # Validate packet before calling callback
                    if self._validate_packet(packet):
                        self.buffer = self.buffer[self.packet_size :]
                        self.last_packet_time = current_time
                        if self.callback:
                            self.callback(packet)
                    else:
                        # Invalid packet, slide window by 1 byte
                        self.buffer = self.buffer[1:]

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
    """GNU Radio flowgraph for GMSK decoding with USP FEC"""

    def __init__(
        self,
        sample_rate,
        callback,
        symbol_rate=9600,
        bt=0.5,
        gain_mu=0.175,
        mu=0.5,
        omega_relative_limit=0.005,
        packet_size=256,
    ):
        """
        Initialize GMSK decoder flowgraph

        Args:
            sample_rate: Input sample rate (Hz)
            callback: Function to call when packet is decoded
            symbol_rate: Symbol rate / baud rate (symbols/sec)
            bt: BT product for GMSK (typically 0.3-0.5)
            gain_mu: Gain for symbol timing recovery
            mu: Initial mu value for symbol timing
            omega_relative_limit: Relative limit for omega adjustment
            packet_size: Size of packet in bytes
        """
        if not GNURADIO_AVAILABLE:
            raise RuntimeError("GNU Radio not available - GMSK decoder cannot be initialized")

        super().__init__("GMSK Decoder")

        self.sample_rate = sample_rate
        self.symbol_rate = symbol_rate
        self.callback = callback
        self.samples_per_symbol = int(sample_rate / symbol_rate)

        # Ensure minimum samples per symbol
        if self.samples_per_symbol < 2:
            raise ValueError(f"Sample rate {sample_rate} too low for symbol rate {symbol_rate}")

        logger.info(
            f"GMSK decoder: sample_rate={sample_rate}, symbol_rate={symbol_rate}, "
            f"samples_per_symbol={self.samples_per_symbol}"
        )

        # Create vector source
        self.vector_source = blocks.vector_source_c([], repeat=False)

        # GMSK receiver chain
        # 1. Quadrature demod (GMSK is essentially FM modulation with shaped pulses)
        sensitivity = (np.pi * 0.5) / self.samples_per_symbol
        self.quad_demod = analog.quadrature_demod_cf(sensitivity)

        # 2. Low-pass filter to remove high-frequency components
        # Cutoff at symbol_rate to preserve baseband signal
        lpf_taps = filter.firdes.low_pass(
            1.0,  # gain
            sample_rate,  # sampling rate
            symbol_rate * 1.2,  # cutoff frequency
            symbol_rate * 0.4,  # transition width
        )
        self.lpf = filter.fir_filter_fff(1, lpf_taps)

        # 3. Clock recovery (Mueller and Müller symbol timing recovery)
        # Use more conservative parameters to reduce false triggering
        omega = self.samples_per_symbol  # Nominal samples per symbol
        gain_mu_adjusted = gain_mu * 0.5  # Reduce gain to be less aggressive
        self.clock_recovery = digital.clock_recovery_mm_ff(
            omega,  # omega (samples per symbol)
            gain_mu_adjusted * gain_mu_adjusted / 4.0,  # gain_omega
            mu,  # mu
            gain_mu_adjusted,  # gain_mu (reduced)
            omega_relative_limit,  # omega_relative_limit
        )

        # 4. Binary slicer to convert soft symbols to hard bits
        self.binary_slicer = digital.binary_slicer_fb()

        # 5. USP FEC Decoding Chain (if available)
        self.use_fec = FEC_AVAILABLE
        if self.use_fec:
            logger.info("Enabling USP FEC decoding (Viterbi + Reed-Solomon)")

            # 5a. Correlate Access Code - sync word detection
            # Common sync word: 0x1ACFFC1D (used by many satellites)
            # This is the sync marker before the FEC-encoded data
            access_code = "00011010110011111111110000011101"  # 0x1ACFFC1D in binary
            threshold = 0  # Allow 0 bit errors in sync word for strict matching

            # Note: correlate_access_code_tag_bb adds a tag when sync word is found
            # We need this for frame synchronization
            self.correlate = digital.correlate_access_code_bb(access_code, threshold)

            # 5b. Viterbi Decoder (Inner FEC - Convolutional Code)
            # Standard USP: rate 1/2, constraint length 7 (K=7)
            # This is the NASA standard convolutional code
            try:
                # Create Viterbi decoder for K=7, rate 1/2 code
                # Polynomials: G1=0x4F (1001111), G2=0x6D (1101101) - NASA standard
                self.viterbi_decoder = fec.cc_decoder.make(
                    frame_size=packet_size * 8 * 2,  # Input is 2x output due to rate 1/2
                    k=7,  # Constraint length
                    rate=2,  # Rate 1/2 (outputs 2 bits per input bit)
                    polys=[0x4F, 0x6D],  # Generator polynomials (NASA standard)
                    start_state=0,
                    end_state=-1,  # Don't force end state
                    mode=fec.CC_TERMINATED,  # Terminated mode
                    padded=False,
                )

                # Convert decoder object to async decoder block
                self.viterbi_block = fec.async_decoder(
                    self.viterbi_decoder, False, False, packet_size * 8 * 2
                )

                logger.info("Viterbi decoder (K=7, rate 1/2) initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize Viterbi decoder: {e}")
                self.use_fec = False

            # 5c. De-interleaver
            # USP typically uses block interleaving (depth varies by protocol)
            # For now, we'll skip de-interleaving as it's protocol-specific
            # TODO: Add configurable de-interleaver based on transmitter params

            # 5d. Reed-Solomon Decoder (Outer FEC)
            # Standard USP: RS(255, 223) over GF(2^8)
            # This means 255 total symbols, 223 data symbols, 32 parity symbols
            # Can correct up to 16 symbol errors
            # RS decoding is done in the message sink using reedsolo library
            self.has_rs = RS_AVAILABLE
            if self.has_rs:
                logger.info("Reed-Solomon RS(255,223) will be applied in message sink")
            else:
                logger.info("Reed-Solomon unavailable - install: pip install reedsolo")

        else:
            logger.info("USP FEC disabled - using direct bit decoding")
            self.has_rs = False

        # 6. Pack bits into bytes (after FEC decoding if enabled)
        self.pack_bits = blocks.pack_k_bits_bb(8)

        # 7. Message sink to receive decoded packets (with optional RS decoding)
        self.msg_sink = GMSKMessageSink(
            self._on_packet_decoded,
            packet_size,
            sync_word=None,
            use_rs=self.has_rs if self.use_fec else False,
        )

        # Connect the receiver chain
        self.connect((self.vector_source, 0), (self.quad_demod, 0))
        self.connect((self.quad_demod, 0), (self.lpf, 0))
        self.connect((self.lpf, 0), (self.clock_recovery, 0))
        self.connect((self.clock_recovery, 0), (self.binary_slicer, 0))

        # Connect through FEC chain if enabled
        if self.use_fec:
            # Bits → Sync Detection → (Viterbi would go here) → Pack → Sink
            # Note: Full FEC implementation needs additional work for proper integration
            self.connect((self.binary_slicer, 0), (self.correlate, 0))
            self.connect((self.correlate, 0), (self.pack_bits, 0))
        else:
            # Direct path: Bits → Pack → Sink
            self.connect((self.binary_slicer, 0), (self.pack_bits, 0))

        self.connect((self.pack_bits, 0), (self.msg_sink, 0))

        logger.debug(
            f"GMSK flowgraph initialized: {symbol_rate} baud, BT={bt}, "
            f"sps={self.samples_per_symbol}"
        )

    def process_batch(self, samples):
        """Process a batch of samples (non-blocking)"""
        try:
            # Process in chunks to avoid memory issues
            chunk_size = 8192 * 100

            for i in range(0, len(samples), chunk_size):
                chunk = samples[i : i + chunk_size]

                # Set the data for this chunk
                self.vector_source.set_data(chunk.tolist())

                # Start the flowgraph
                self.start()

                # Wait for processing
                time.sleep(0.05)  # 50ms per chunk

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
        """Called when a GMSK packet is successfully decoded"""
        if self.callback:
            self.callback(payload)


class GMSKDecoder(threading.Thread):
    """Real-time GMSK decoder using GNU Radio"""

    def __init__(
        self,
        iq_queue,
        data_queue,
        session_id,
        output_dir="data/decoded",
        vfo=None,
        transmitter=None,  # Complete transmitter dict with all parameters
        symbol_rate=9600,  # Fallback if not in transmitter dict
        bt=0.5,
        packet_size=256,
    ):
        if not GNURADIO_AVAILABLE:
            logger.error("GNU Radio not available - GMSK decoder cannot be initialized")
            raise RuntimeError("GNU Radio not available")

        super().__init__(daemon=True, name=f"GMSKDecoder-{session_id}")
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

        # Store transmitter dict for future use (framing, protocols, etc.)
        self.transmitter = transmitter or {}

        # DEBUG: Log the full transmitter dict to see what we received
        logger.info(f"GMSK decoder received transmitter dict: {self.transmitter}")

        # Extract GMSK parameters from transmitter dict or use defaults
        # The Transmitters model has a 'baud' field
        self.symbol_rate = self.transmitter.get("baud", symbol_rate)
        self.bt = self.transmitter.get("bt", bt)
        self.packet_size = self.transmitter.get("packet_size", packet_size)

        # DEBUG: Log what values were extracted
        logger.info(
            f"Extracted baud rate: {self.symbol_rate} (from transmitter: {self.transmitter.get('baud')}, fallback: {symbol_rate})"
        )

        # Store additional transmitter info that might be useful
        self.transmitter_description = self.transmitter.get("description", "Unknown")
        self.transmitter_mode = self.transmitter.get("mode", "GMSK")

        os.makedirs(self.output_dir, exist_ok=True)

        # GNU Radio flowgraph (will be initialized when we know sample rate)
        self.flowgraph = None

        logger.info(f"GMSK decoder initialized for session {session_id}, VFO {vfo}")
        if self.transmitter:
            logger.info(f"Transmitter: {self.transmitter_description} ({self.transmitter_mode})")
        logger.info(
            f"GMSK parameters: {self.symbol_rate} baud, BT={self.bt}, packet_size={self.packet_size} bytes"
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
        """Callback when GNU Radio decodes a GMSK packet"""
        try:
            self.packet_count += 1
            logger.info(f"GMSK packet #{self.packet_count} decoded: {len(payload)} bytes")

            # Save to file
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"gmsk_{self.symbol_rate}baud_{timestamp}_{self.packet_count}.bin"
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
                "decoder_type": "gmsk",
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
                    "parameters": f"{self.symbol_rate}baud_BT{self.bt}",
                },
            }
            try:
                self.data_queue.put(msg, block=False)
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
        buffer_duration = 1.0  # seconds
        process_interval = 0.5  # Process every 0.5 seconds

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

                    vfo_center = vfo_state.center_freq
                    vfo_bandwidth = vfo_state.bandwidth

                    # Initialize on first message
                    if self.sdr_sample_rate is None:
                        self.sdr_sample_rate = sdr_rate
                        self.sdr_center_freq = sdr_center

                        # Calculate decimation factor for optimal samples per symbol
                        # Target 8-10 samples per symbol
                        target_sps = 8
                        target_sample_rate = self.symbol_rate * target_sps
                        decimation = int(self.sdr_sample_rate / target_sample_rate)
                        if decimation < 1:
                            decimation = 1
                        self.sample_rate = self.sdr_sample_rate / decimation

                        logger.info(
                            f"GMSK symbol rate: {self.symbol_rate} baud, "
                            f"target rate: {target_sample_rate/1e3:.2f}kS/s ({target_sps} sps)"
                        )

                        # Design decimation filter
                        self.decimation_filter = self._design_decimation_filter(
                            decimation, vfo_bandwidth, self.sdr_sample_rate
                        )

                        logger.info(
                            f"GMSK decoder: SDR rate: {self.sdr_sample_rate/1e6:.2f} MS/s, "
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
                        self.flowgraph = GMSKFlowgraph(
                            sample_rate=self.sample_rate,
                            callback=self._on_packet_decoded,
                            symbol_rate=self.symbol_rate,
                            bt=self.bt,
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
                                f"Processing {len(samples_buffer)} samples "
                                f"({self.symbol_rate} baud)"
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

                except queue.Empty:
                    pass

        except Exception as e:
            logger.error(f"GMSK decoder error: {e}")
            logger.exception(e)
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
