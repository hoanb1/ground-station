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


# Define base class conditionally
if GNURADIO_AVAILABLE and gr is not None:
    _BPSKFlowgraphBase = gr.top_block
else:
    _BPSKFlowgraphBase = object


class BPSKFlowgraph(_BPSKFlowgraphBase):  # type: ignore[misc,valid-type]
    """
    Continuous BPSK flowgraph using gr-satellites components

    Uses tested gr-satellites bpsk_demodulator and ax25_deframer components.
    Runs continuously to maintain stateful blocks (FLL, Costas, clock recovery, etc.)
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
        self.differential = differential

        # Accumulate samples in a buffer
        self.sample_buffer = np.array([], dtype=np.complex64)
        self.sample_lock = threading.Lock()

        logger.info(
            f"BPSK flowgraph initialized: "
            f"{baudrate} baud, {sample_rate} sps, differential={differential}"
        )

    def process_samples(self, samples):
        """
        Process IQ samples through the flowgraph

        Accumulates samples in a buffer and processes them periodically
        to maintain state continuity while avoiding repeated start/stop cycles.

        Args:
            samples: numpy array of complex64 samples
        """
        with self.sample_lock:
            self.sample_buffer = np.concatenate([self.sample_buffer, samples])

            # Process when we have enough samples (e.g., 0.5 seconds worth)
            min_process_samples = int(self.sample_rate * 0.5)

            if len(self.sample_buffer) >= min_process_samples:
                # Process the accumulated samples
                self._process_buffer()

    def _process_buffer(self):
        """Process accumulated samples through the flowgraph"""
        if len(self.sample_buffer) == 0:
            return

        try:
            # Create a NEW flowgraph for each batch to avoid connection conflicts
            # This is necessary because hierarchical blocks can't be easily disconnected
            import argparse

            from satellites.components.deframers.ax25_deframer import ax25_deframer
            from satellites.components.demodulators.bpsk_demodulator import bpsk_demodulator

            # Create a temporary top_block
            tb = gr.top_block("BPSK Batch Processor")

            # Create vector source with accumulated samples
            source = blocks.vector_source_c(self.sample_buffer.tolist(), repeat=False)

            # Create fresh instances of demodulator and deframer
            options = argparse.Namespace(
                rrc_alpha=0.35,
                fll_bw=25,
                clk_bw=0.06,
                clk_limit=0.004,
                costas_bw=50,
                f_offset=0,
                disable_fll=False,
                manchester_block_size=32,
            )

            demod = bpsk_demodulator(
                baudrate=self.baudrate,
                samp_rate=self.sample_rate,
                iq=True,
                f_offset=0,
                differential=self.differential,
                manchester=False,
                options=options,
            )

            deframer = ax25_deframer(g3ruh_scrambler=True, options=options)

            # Create message handler for this batch
            msg_handler = BPSKMessageHandler(self.callback)

            # Build flowgraph
            tb.connect(source, demod, deframer)
            tb.msg_connect((deframer, "out"), (msg_handler, "in"))

            # Run the flowgraph
            tb.start()
            tb.wait()

            # Keep a small tail of samples for continuity
            # This helps maintain state across processing runs
            tail_samples = int(self.sample_rate * 0.1)  # 100ms tail
            if len(self.sample_buffer) > tail_samples:
                self.sample_buffer = self.sample_buffer[-tail_samples:]
            else:
                self.sample_buffer = np.array([], dtype=np.complex64)

        except Exception as e:
            logger.error(f"Error processing buffer: {e}")
            import traceback

            traceback.print_exc()
            # Clear buffer on error to avoid repeated failures
            self.sample_buffer = np.array([], dtype=np.complex64)

    def flush_buffer(self):
        """Process any remaining samples in the buffer"""
        with self.sample_lock:
            if len(self.sample_buffer) > 0:
                logger.info(f"Flushing {len(self.sample_buffer)} remaining samples")
                self._process_buffer()

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
        """Main thread loop - processes IQ samples continuously"""
        logger.info(f"BPSK decoder started for {self.session_id}")
        self._send_status_update(DecoderStatus.LISTENING)

        chunks_received = 0
        flowgraph_started = False

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

                        # Initialize flowgraph
                        self.flowgraph = BPSKFlowgraph(
                            sample_rate=self.sample_rate,
                            callback=self._on_packet_decoded,
                            baudrate=self.baudrate,
                            differential=self.differential,
                            packet_size=self.packet_size,
                        )
                        flowgraph_started = True
                        logger.info("BPSK flowgraph initialized - ready to decode")

                    # Step 1: Frequency translation to VFO center
                    offset_freq = vfo_center - sdr_center
                    translated = self._frequency_translate(
                        samples, offset_freq, self.sdr_sample_rate
                    )

                    # Step 2: Decimate to target sample rate
                    decimation = int(self.sdr_sample_rate / self.sample_rate)
                    if decimation < 1:
                        decimation = 1
                    decimated = self._decimate_iq(translated, decimation)

                    # Process samples through flowgraph
                    if flowgraph_started and self.flowgraph is not None:
                        self.flowgraph.process_samples(decimated)

                    # Send periodic status updates
                    if chunks_received % 50 == 0:
                        self._send_status_update(
                            DecoderStatus.DECODING,
                            {
                                "packets_decoded": self.packet_count,
                            },
                        )

                    chunks_received += 1
                    if chunks_received % 100 == 0:
                        logger.debug(
                            f"Received {chunks_received} chunks, "
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
            # Flush any remaining samples
            if flowgraph_started and self.flowgraph:
                logger.info("Flushing remaining samples from BPSK flowgraph")
                try:
                    self.flowgraph.flush_buffer()
                except Exception as e:
                    logger.error(f"Error flushing buffer: {e}")

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
