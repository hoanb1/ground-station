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
from typing import Any, Dict

import numpy as np
from scipy import signal

from vfos.state import VFOManager

logger = logging.getLogger("bpskdecoder")

# Try to import GNU Radio
GNURADIO_AVAILABLE = False

try:
    from gnuradio import blocks, gr

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


class BPSKMessageHandler(gr.basic_block):
    """Message handler to receive PDU messages from HDLC deframer"""

    def __init__(self, callback):
        gr.basic_block.__init__(self, name="bpsk_message_handler", in_sig=None, out_sig=None)
        self.callback = callback
        self.message_port_register_in(gr.pmt.intern("in"))
        self.set_msg_handler(gr.pmt.intern("in"), self.handle_msg)
        self.packets_decoded = 0

    def handle_msg(self, msg):
        """Handle incoming PDU messages from HDLC deframer"""
        try:
            # Extract packet data from PDU
            if gr.pmt.is_pair(msg):
                packet_data = gr.pmt.to_python(gr.pmt.cdr(msg))
            else:
                packet_data = gr.pmt.to_python(msg)

            # Convert numpy array to bytes
            if isinstance(packet_data, np.ndarray):
                packet_data = bytes(packet_data)

            if isinstance(packet_data, bytes):
                self.packets_decoded += 1
                logger.info(
                    f"BPSK decoded packet #{self.packets_decoded}: {len(packet_data)} bytes"
                )

                # Parse and log AX.25 callsigns
                try:
                    if len(packet_data) >= 14:
                        dest_call = "".join(
                            chr((packet_data[i] >> 1) & 0x7F) for i in range(6)
                        ).strip()
                        dest_ssid = (packet_data[6] >> 1) & 0x0F
                        src_call = "".join(
                            chr((packet_data[i] >> 1) & 0x7F) for i in range(7, 13)
                        ).strip()
                        src_ssid = (packet_data[13] >> 1) & 0x0F
                        logger.info(
                            f"  Callsigns: {dest_call}-{dest_ssid} <- {src_call}-{src_ssid}"
                        )
                        logger.info(f"  First 20 bytes: {packet_data[:20].hex()}")
                except Exception as parse_err:
                    logger.debug(f"Could not parse callsigns: {parse_err}")

                # Add HDLC flags for compatibility
                packet_with_flags = bytes([0x7E]) + packet_data + bytes([0x7E])

                if self.callback:
                    self.callback(packet_with_flags)
            else:
                logger.warning(f"Unexpected packet data type: {type(packet_data)}")

        except Exception as e:
            logger.error(f"Error handling message: {e}")
            import traceback

            traceback.print_exc()


class BPSKPacketSink(gr.sync_block):
    """
    Custom GNU Radio sink block to receive decoded BPSK packets with AX.25 framing

    This sink expects bytes that have already been:
    1. NRZI decoded
    2. G3RUH descrambled
    3. Ready for HDLC framing detection
    """

    def __init__(self, callback, packet_size=256):
        gr.sync_block.__init__(self, name="bpsk_packet_sink", in_sig=[np.uint8], out_sig=None)
        self.callback = callback
        self.packet_size = packet_size
        self.buffer = []
        # AX.25 HDLC flag sequence: 0x7E (01111110)
        self.HDLC_FLAG = 0x7E
        self.last_packet_time: float = 0.0
        self.min_packet_interval = 0.05  # Minimum 50ms between packets
        self.packets_decoded = 0
        self.in_frame = False
        self.frame_buffer = []

    def _parse_ax25_callsign(self, data, offset):
        """Parse AX.25 callsign (6 bytes + SSID byte)"""
        if offset + 7 > len(data):
            return None, offset

        callsign = ""
        for i in range(6):
            char = (data[offset + i] >> 1) & 0x7F
            if 32 <= char <= 126:
                callsign += chr(char)
        callsign = callsign.strip()

        ssid = (data[offset + 6] >> 1) & 0x0F
        if ssid > 0:
            callsign += f"-{ssid}"

        return callsign, offset + 7

    def _validate_ax25_frame(self, frame):
        """Validate AX.25 frame structure with strict checks to avoid false positives"""
        # Minimum size check
        if len(frame) < 16:  # Minimum: dest(7) + src(7) + ctrl(1) + pid(1)
            logger.debug(f"Frame too short: {len(frame)} bytes")
            return False

        # Maximum reasonable size (typical satellite frames are < 300 bytes)
        if len(frame) > 512:
            logger.debug(f"Frame too long: {len(frame)} bytes")
            return False

        # Validate callsign bytes BEFORE parsing
        # AX.25 callsign bytes must be in valid range when shifted
        # Valid chars: A-Z (0x41-0x5A), 0-9 (0x30-0x39), space (0x20)
        # When left-shifted: 0x82-0xB4, 0x60-0x72, 0x40
        for i in range(14):  # dest (7 bytes) + src (7 bytes)
            if i % 7 == 6:
                # SSID byte - skip for now
                continue
            byte_val = frame[i]
            char = (byte_val >> 1) & 0x7F
            # Must be uppercase letter, digit, or space
            if not ((0x41 <= char <= 0x5A) or (0x30 <= char <= 0x39) or char == 0x20):
                logger.debug(
                    f"Invalid callsign byte at offset {i}: 0x{byte_val:02x} (char: 0x{char:02x})"
                )
                return False

        # Try to parse destination and source
        dest, offset = self._parse_ax25_callsign(frame, 0)
        if not dest or len(dest) < 3:
            return False

        src, offset = self._parse_ax25_callsign(frame, 7)
        if not src or len(src) < 3:
            return False

        # Strict callsign validation
        for callsign in [dest.split("-")[0], src.split("-")[0]]:
            if not callsign:
                return False

            # Callsign must be 3-6 characters
            if len(callsign) < 3 or len(callsign) > 6:
                return False

            # Must contain at least one letter and one digit (typical amateur radio format)
            has_letter = any(c.isalpha() for c in callsign)
            has_digit = any(c.isdigit() for c in callsign)
            if not (has_letter and has_digit):
                return False

            # All characters must be alphanumeric or space
            if not all(c.isalnum() or c.isspace() for c in callsign):
                return False

            # Check for reasonable amateur radio callsign patterns
            # First character is usually a letter or digit
            if not callsign[0].isalnum():
                return False

        # Check for reasonable entropy in the frame (not all zeros or repeated patterns)
        unique_bytes = len(set(frame))
        if unique_bytes < 10:  # At least 10 different byte values
            return False

        # Check for excessive repetition (noise often has repeated patterns)
        max_run = 1
        current_run = 1
        for i in range(1, len(frame)):
            if frame[i] == frame[i - 1]:
                current_run += 1
                max_run = max(max_run, current_run)
            else:
                current_run = 1

        if max_run > 20:  # More than 20 identical bytes in a row is suspicious
            return False

        return True

    def work(self, input_items, output_items):
        """Process incoming bytes and extract HDLC frames"""
        try:
            current_time = time.time()

            for byte_val in input_items[0]:
                byte_val = int(byte_val)

                if byte_val == self.HDLC_FLAG:
                    if self.in_frame and len(self.frame_buffer) >= 16:
                        # End of frame - process it
                        if current_time - self.last_packet_time >= self.min_packet_interval:
                            frame = bytes(self.frame_buffer)
                            logger.info(
                                f"BPSK found potential frame: {len(frame)} bytes, first 20 bytes: {frame[:20].hex()}"
                            )

                            # Try to parse callsigns to see what we're getting
                            try:
                                dest, _ = self._parse_ax25_callsign(frame, 0)
                                src, _ = self._parse_ax25_callsign(frame, 7)
                                logger.info(f"Parsed callsigns: dest='{dest}', src='{src}'")
                            except Exception:
                                pass

                            # TEMPORARILY: Output frame without validation to see what we get
                            packet = bytes([self.HDLC_FLAG]) + frame + bytes([self.HDLC_FLAG])
                            self.last_packet_time = current_time
                            if self.callback:
                                self.callback(packet)
                            self.packets_decoded += 1
                            logger.info(
                                f"BPSK output frame #{self.packets_decoded}: {len(frame)} bytes"
                            )

                        # Reset for next frame
                        self.frame_buffer = []
                        self.in_frame = True  # Next flag starts new frame
                    else:
                        # Start of new frame
                        self.in_frame = True
                        self.frame_buffer = []
                else:
                    # Data byte - add to frame if we're inside one
                    if self.in_frame:
                        self.frame_buffer.append(byte_val)

                        # Limit frame size to prevent memory issues
                        if len(self.frame_buffer) > self.packet_size * 2:
                            # Frame too long, reset
                            self.in_frame = False
                            self.frame_buffer = []

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
    Simplified BPSK flowgraph using gr-satellites components directly

    Uses tested gr-satellites bpsk_demodulator and ax25_deframer components
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
        Initialize BPSK decoder flowgraph using gr-satellites components

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
            packet_size: Size of packet in bytes (unused, kept for compatibility)
        """
        if not GNURADIO_AVAILABLE:
            raise RuntimeError("GNU Radio not available - BPSK decoder cannot be initialized")

        super().__init__("BPSK Decoder")

        self.sample_rate = sample_rate
        self.baudrate = baudrate
        self.callback = callback

        # Create vector source for IQ input
        self.vector_source = blocks.vector_source_c([], repeat=False)

        # Create options namespace for gr-satellites components
        import argparse

        options = argparse.Namespace(
            rrc_alpha=rrc_alpha,
            fll_bw=fll_bw,
            clk_bw=clk_bw,
            clk_limit=clk_limit,
            costas_bw=costas_bw,
            f_offset=f_offset,
            disable_fll=False,
            manchester_block_size=32,
        )

        # Use gr-satellites BPSK demodulator (outputs soft symbols)
        from satellites.components.demodulators.bpsk_demodulator import bpsk_demodulator

        self.demodulator = bpsk_demodulator(
            baudrate=baudrate,
            samp_rate=sample_rate,
            iq=True,
            f_offset=f_offset,
            differential=differential,
            manchester=False,
            options=options,
        )

        # Use gr-satellites AX.25 deframer (takes soft symbols, outputs PDUs)
        from satellites.components.deframers.ax25_deframer import ax25_deframer

        self.deframer = ax25_deframer(g3ruh_scrambler=True, options=options)

        # Message handler for decoded packets
        self.msg_handler = BPSKMessageHandler(self._on_packet_decoded)

        # Connect flowgraph: vector_source -> demodulator -> deframer -> msg_handler
        self.connect(self.vector_source, self.demodulator, self.deframer)
        self.msg_connect((self.deframer, "out"), (self.msg_handler, "in"))

        logger.info(
            f"BPSK flowgraph initialized using gr-satellites components: "
            f"{baudrate} baud, {sample_rate} sps, differential={differential}"
        )

    def process_batch(self, samples):
        """Process a batch of IQ samples - processes all samples in one continuous run"""
        try:
            # Set all the data at once to maintain state continuity
            # This is critical for NRZI, descrambler, and HDLC deframer state
            self.vector_source.set_data(samples.tolist())

            # Start the flowgraph once
            self.start()

            # Wait for all samples to be processed
            # Calculate processing time based on sample rate and number of samples
            processing_time = len(samples) / self.sample_rate
            # Add extra time for processing overhead
            time.sleep(processing_time + 0.5)

            # Stop the flowgraph
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

                    # Add to buffer - accumulate ALL samples for continuous processing
                    samples_buffer = np.concatenate([samples_buffer, decimated])

                    # Send status updates but don't process yet
                    if chunks_received % 50 == 0:
                        self._send_status_update(
                            DecoderStatus.DECODING,
                            {
                                "samples_buffered": len(samples_buffer),
                                "packets_decoded": self.packet_count,
                            },
                        )

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
        finally:
            # Process all accumulated samples at the end in one continuous run
            if len(samples_buffer) > 0 and self.flowgraph:
                logger.info(f"Processing final batch of {len(samples_buffer)} samples")
                try:
                    self.flowgraph.process_batch(samples_buffer)
                except Exception as e:
                    logger.error(f"Error processing final batch: {e}")

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
