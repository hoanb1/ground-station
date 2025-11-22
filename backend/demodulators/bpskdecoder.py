# Ground Station - BPSK Decoder using GNU Radio
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
# and demodulates BPSK signals with AX.25 or DOKA (CCSDS) framing.
#
# ARCHITECTURE NOTES (2025-11-19):
# ================================
# 1. SIGNAL-CENTERED FREQUENCY TRANSLATION (CRITICAL):
#    - MUST translate to the actual signal frequency from transmitter config, NOT VFO center
#    - offset_freq = signal_frequency - sdr_center_frequency
#    - This centers the signal at baseband (0 Hz) regardless of VFO drift
#    - Allows decoding off-center signals in recordings and multiple simultaneous signals
#
# 2. BATCHED PROCESSING WITH FRESH FLOWGRAPHS:
#    - Processes samples in configurable batches (default 3 seconds via batch_interval parameter)
#    - Creates a NEW gr.top_block for each batch to avoid GNU Radio 3.10 reconnection issues
#    - Hierarchical blocks (bpsk_demodulator, ax25_deframer) cannot be reconnected
#    - Aggressive cleanup in finally block prevents shared memory exhaustion
#    - Processing happens outside the lock: samples continue accumulating while batch processes
#    - UI receives "decoding" status for both accumulation and batch processing phases
#
# 3. SIGNAL PROCESSING CHAIN:
#    - Frequency translation (signal to baseband)
#    - Decimation to target sample rate (78125 Hz for 9600 baud)
#    - FLL (Frequency Lock Loop) - 250 Hz bandwidth for tracking residual offset
#    - AGC (Automatic Gain Control)
#    - Symbol sync with matched RRC filter
#    - Costas loop - 100 Hz bandwidth for carrier phase recovery
#    - Binary slicer, NRZI decode, G3RUH descrambler, HDLC deframing
#
# 4. KEY PARAMETERS:
#    - Batch interval: 3 seconds default (configurable, balance between latency and signal lock time)
#    - FLL bandwidth: 250 Hz (handles frequency drift and residual offset)
#    - Costas bandwidth: 100 Hz (carrier phase tracking)
#    - Sample rate: Automatically calculated based on baudrate (typically 8x oversampling)
#
# 5. FEATURES:
#    - Supports AX.25 (G3RUH) and DOKA (CCSDS) framing
#    - Handles VFO drift and off-center signals in IQ recordings
#    - Extracts and reports AX.25 callsigns to UI
#    - Automatic framing detection from satellite configuration

import base64
import json
import logging
import os
import queue
import threading
import time
from enum import Enum
from typing import Any, Dict

import numpy as np
from scipy import signal

from telemetry.parser import TelemetryParser
from vfos.state import VFOManager

# Try to import satellite config service
try:
    from satconfig.config import SatelliteConfigService

    SATCONFIG_AVAILABLE = True
except ImportError:
    SATCONFIG_AVAILABLE = False

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
                callsigns = None
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
                        callsigns = {
                            "from": f"{src_call}-{src_ssid}",
                            "to": f"{dest_call}-{dest_ssid}",
                        }
                        logger.info(
                            f"  Callsigns: {dest_call}-{dest_ssid} <- {src_call}-{src_ssid}"
                        )
                        logger.info(f"  First 20 bytes: {packet_data[:20].hex()}")
                except Exception as parse_err:
                    logger.debug(f"Could not parse callsigns: {parse_err}")

                # Add HDLC flags for compatibility
                packet_with_flags = bytes([0x7E]) + packet_data + bytes([0x7E])

                if self.callback:
                    self.callback(packet_with_flags, callsigns)
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
        status_callback=None,
        baudrate=9600,
        f_offset=0,
        differential=False,
        rrc_alpha=0.35,
        fll_bw=25,
        clk_bw=0.06,
        clk_limit=0.004,
        costas_bw=50,
        packet_size=256,
        batch_interval=5.0,
        framing="ax25",  # Framing protocol: 'ax25' or 'doka'
    ):
        """
        Initialize BPSK decoder flowgraph using gr-satellites components

        Args:
            sample_rate: Input sample rate (Hz)
            callback: Function to call when packet is decoded
            status_callback: Function to call for status updates (status, info)
            baudrate: Symbol rate / baud rate (symbols/sec)
            f_offset: Frequency offset in Hz
            differential: Perform non-coherent DBPSK decoding (bool)
            rrc_alpha: RRC roll-off factor
            fll_bw: FLL bandwidth (Hz)
            clk_bw: Clock recovery bandwidth (relative to baudrate)
            clk_limit: Clock recovery limit (relative to baudrate)
            costas_bw: Costas loop bandwidth (Hz)
            packet_size: Size of packet in bytes (unused, kept for compatibility)
            batch_interval: Batch processing interval in seconds (default: 3.0)
            framing: Framing protocol - 'ax25' (G3RUH) or 'doka' (CCSDS)
        """
        if not GNURADIO_AVAILABLE:
            raise RuntimeError("GNU Radio not available - BPSK decoder cannot be initialized")

        super().__init__("BPSK Decoder")

        self.sample_rate = sample_rate
        self.baudrate = baudrate
        self.callback = callback
        self.status_callback = status_callback
        self.differential = differential
        self.batch_interval = batch_interval
        self.framing = framing  # Store framing protocol

        # Accumulate samples in a buffer
        self.sample_buffer = np.array([], dtype=np.complex64)
        self.sample_lock = threading.Lock()
        self.current_mode = "decoding"  # Track current mode

        logger.info(
            f"BPSK flowgraph initialized: "
            f"{baudrate} baud, {sample_rate} sps, differential={differential}, "
            f"framing={framing}, batch_interval={batch_interval}s"
        )

    def process_samples(self, samples):
        """
        Process IQ samples through the flowgraph

        Accumulates samples in a buffer and processes them periodically
        to maintain state continuity while avoiding repeated start/stop cycles.

        Args:
            samples: numpy array of complex64 samples
        """
        should_process = False
        buffer_size = 0
        with self.sample_lock:
            self.sample_buffer = np.concatenate([self.sample_buffer, samples])
            buffer_size = len(self.sample_buffer)

            # Process when we have enough samples (batch_interval seconds worth)
            # Balance between decode latency and signal lock time
            min_process_samples = int(self.sample_rate * self.batch_interval)

            if buffer_size >= min_process_samples:
                should_process = True
            elif self.current_mode != "decoding":
                # Transition back to decoding mode (accumulating samples)
                self.current_mode = "decoding"
                if self.status_callback:
                    self.status_callback(DecoderStatus.DECODING, {"buffer_samples": buffer_size})

        # Process outside the lock so incoming samples don't block
        if should_process:
            # Transition to decoding mode (processing batch)
            with self.sample_lock:
                self.current_mode = "decoding"
            if self.status_callback:
                self.status_callback(DecoderStatus.DECODING, {"buffer_samples": buffer_size})

            logger.info(f"Processing batch: {buffer_size} samples ({self.batch_interval}s)")
            self._process_buffer()

    def _process_buffer(self):
        """Process accumulated samples through the flowgraph"""
        # Copy buffer outside the lock to allow incoming samples to continue
        with self.sample_lock:
            if len(self.sample_buffer) == 0:
                return
            samples_to_process = self.sample_buffer.copy()
            # Keep a small tail for continuity while processing
            tail_samples = int(self.sample_rate * 0.1)  # 100ms tail
            if len(self.sample_buffer) > tail_samples:
                self.sample_buffer = self.sample_buffer[-tail_samples:]
            else:
                self.sample_buffer = np.array([], dtype=np.complex64)

        tb = None
        try:
            # Create a NEW flowgraph for each batch to avoid connection conflicts
            # This is necessary because hierarchical blocks can't be easily disconnected
            import argparse

            from satellites.components.deframers.ax25_deframer import ax25_deframer
            from satellites.components.demodulators.bpsk_demodulator import bpsk_demodulator

            # Create a temporary top_block
            tb = gr.top_block("BPSK Batch Processor")

            # Create vector source with accumulated samples
            source = blocks.vector_source_c(samples_to_process.tolist(), repeat=False)

            # Create fresh instances of demodulator and deframer
            # Use MUCH wider FLL bandwidth to handle VFO drift/offset
            # Standard 25 Hz is too narrow for real-world VFO drift
            options = argparse.Namespace(
                rrc_alpha=0.35,
                fll_bw=250,  # Increased from 25 Hz to 250 Hz for better tracking
                clk_bw=0.06,
                clk_limit=0.004,
                costas_bw=100,  # Increased from 50 Hz to 100 Hz
                f_offset=0,
                disable_fll=False,
                manchester_block_size=32,
                syncword_threshold=4,  # Allow 4 bit errors in syncword (CCSDS default)
            )

            # Create BPSK demodulator
            # The FLL (Frequency Lock Loop) handles any residual frequency offset
            # after our frequency translation, so we set f_offset=0 and let it auto-track
            demod = bpsk_demodulator(
                baudrate=self.baudrate,
                samp_rate=self.sample_rate,
                iq=True,
                f_offset=0,  # Let FLL auto-track with 250 Hz bandwidth
                differential=self.differential,
                manchester=False,
                options=options,
            )

            # Select deframer based on detected framing protocol
            if self.framing == "doka":
                # DOKA uses CCSDS-style framing with Reed-Solomon FEC
                logger.info("Using CCSDS RS deframer for DOKA signal")
                from satellites.components.deframers.ccsds_rs_deframer import ccsds_rs_deframer

                # DOKA uses standard CCSDS frame parameters
                # 223 bytes data + 32 bytes RS parity = 255 byte total frame (standard CCSDS)
                deframer = ccsds_rs_deframer(
                    frame_size=223,  # Standard CCSDS Reed-Solomon frame size
                    precoding=None,
                    rs_en=True,
                    rs_basis="dual",
                    rs_interleaving=1,
                    scrambler="CCSDS",
                    syncword_threshold=None,
                    options=options,
                )
            else:  # ax25 (default)
                # Standard AX.25 with G3RUH scrambler
                logger.info("Using AX.25 deframer with G3RUH scrambler")
                deframer = ax25_deframer(g3ruh_scrambler=True, options=options)

            # Create message handler for this batch
            msg_handler = BPSKMessageHandler(self.callback)

            # Build flowgraph
            tb.connect(source, demod, deframer)
            tb.msg_connect((deframer, "out"), (msg_handler, "in"))

            # Run the flowgraph
            tb.start()
            tb.wait()

            # Explicitly stop
            try:
                tb.stop()
            except Exception:
                pass

        except Exception as e:
            logger.error(f"Error processing buffer: {e}")
            import traceback

            traceback.print_exc()
            # Clear buffer on error to avoid repeated failures
            with self.sample_lock:
                self.sample_buffer = np.array([], dtype=np.complex64)
        finally:
            # Explicit cleanup to prevent shared memory leaks
            if "tb" in locals() and tb is not None:
                try:
                    # Ensure flowgraph is stopped
                    tb.stop()
                    tb.wait()
                except Exception:
                    pass

                # Disconnect all blocks
                try:
                    tb.disconnect_all()
                except Exception:
                    pass

                # Delete references to allow garbage collection
                try:
                    del msg_handler
                    del deframer
                    del demod
                    del source
                except Exception:
                    pass

                # Delete the top_block to release resources
                del tb

            # Force garbage collection to clean up GNU Radio objects
            # and release shared memory segments
            import gc

            gc.collect()

            # Longer delay to allow system to clean up shared memory
            # GNU Radio 3.10+ has issues with rapid flowgraph creation/destruction
            time.sleep(0.1)

    def flush_buffer(self):
        """Process any remaining samples in the buffer"""
        should_process = False
        with self.sample_lock:
            if len(self.sample_buffer) > 0:
                logger.info(f"Flushing {len(self.sample_buffer)} remaining samples")
                should_process = True
        # CRITICAL: Call _process_buffer() OUTSIDE the lock to avoid blocking the entire app.
        # _process_buffer() runs GNU Radio flowgraph synchronously (tb.wait()) and sleeps 100ms,
        # which would freeze all threads trying to acquire sample_lock if called inside the lock.
        if should_process:
            self._process_buffer()

    def _is_doka_signal(self):
        """
        Check if this is a DOKA signal based on framing configuration.

        Returns:
            bool: True if this is a DOKA signal
        """
        return hasattr(self, "framing") and self.framing == "doka"

    def _on_packet_decoded(self, payload, callsigns=None):
        """Called when a BPSK packet is successfully decoded"""
        if self.callback:
            self.callback(payload, callsigns)


class BPSKDecoder(threading.Thread):
    """Real-time BPSK decoder using GNU Radio"""

    def __init__(
        self,
        iq_queue,
        data_queue,
        session_id,
        output_dir="data/decoded",
        vfo=None,
        satellite=None,  # Satellite dict from database (contains norad_id, name, etc.)
        transmitter=None,  # Complete transmitter dict with all parameters
        baudrate=9600,  # Fallback if not in transmitter dict
        differential=False,
        packet_size=256,
        batch_interval=5.0,  # Batch processing interval in seconds (increased to reduce mem usage)
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

        # Initialize telemetry parser
        self.telemetry_parser = TelemetryParser()
        logger.info("Telemetry parser initialized for BPSK decoder")

        # Store satellite and transmitter dicts
        self.satellite = satellite or {}
        self.transmitter = transmitter or {}

        # Extract satellite info
        self.norad_id = self.satellite.get("norad_id")
        self.satellite_name = self.satellite.get("name", "Unknown")

        # Extract BPSK parameters from transmitter dict or use defaults
        self.baudrate = self.transmitter.get("baud", baudrate)
        self.differential = self.transmitter.get("differential", differential)
        self.packet_size = self.transmitter.get("packet_size", packet_size)
        self.batch_interval = batch_interval

        # Load satellite-specific configuration if satellite dict provided
        self.config_source = "manual"  # Track where config came from
        if self.norad_id and SATCONFIG_AVAILABLE:
            try:
                config_service = SatelliteConfigService()
                sat_params = config_service.get_decoder_parameters(
                    norad_id=self.norad_id,
                    baudrate=self.baudrate,
                    frequency=self.transmitter.get("downlink_low"),
                )

                # Apply satellite-specific configuration
                if "framing" in sat_params:
                    self.framing = sat_params["framing"]
                if "differential" in sat_params:
                    self.differential = sat_params["differential"]
                self.config_source = sat_params["source"]

                logger.info(f"Loaded config for {self.satellite_name} (NORAD {self.norad_id}):")
                logger.info(f"  Baudrate: {self.baudrate}")
                logger.info(f"  Framing: {self.framing}")
                logger.info(f"  Differential: {self.differential}")
                logger.info(f"  Source: {self.config_source}")

            except Exception as e:
                logger.error(f"Failed to load satellite config for NORAD {self.norad_id}: {e}")
                logger.info("Falling back to manual configuration")
                # Fall through to manual config below
                self.norad_id = None  # Mark as manual config

        # Store transmitter downlink frequency for reference/fallback only
        # The actual signal frequency will be determined from VFO state during decoding
        # to track Doppler shifts in real-time
        self.transmitter_downlink_freq = self.transmitter.get("downlink_low")
        if not self.transmitter_downlink_freq:
            logger.warning("Transmitter downlink_low not available in transmitter dict")

        # Store additional transmitter info
        self.transmitter_description = self.transmitter.get("description", "Unknown")
        self.transmitter_mode = self.transmitter.get("mode", "BPSK")

        # Detect framing protocol from transmitter metadata
        # This overrides smart defaults but respects explicit satellite configs from gr-satellites
        # Priority: Check description first, then mode field, default to AX.25
        if not hasattr(self, "config_source") or self.config_source in ["manual", "smart_default"]:
            transmitter_mode = self.transmitter.get("mode", "BPSK").upper()
            transmitter_desc = self.transmitter.get("description", "").upper()

            detected_framing = None

            # Check description first for all framing types
            if "DOKA" in transmitter_desc or "CCSDS" in transmitter_desc:
                detected_framing = "doka"
            elif "G3RUH" in transmitter_desc:
                # G3RUH scrambler implies AX.25 framing
                detected_framing = "ax25"
            elif "AX.25" in transmitter_desc or "AX25" in transmitter_desc:
                detected_framing = "ax25"
            # If nothing in description, check mode field
            elif "DOKA" in transmitter_mode:
                detected_framing = "doka"
            elif "AX.25" in transmitter_mode or "AX25" in transmitter_mode:
                detected_framing = "ax25"
            else:
                # Default to AX.25 if nothing found
                detected_framing = "ax25"

            # Apply detected framing if we found something
            if detected_framing:
                # If we had a smart default that differs, override it
                if hasattr(self, "framing") and self.framing != detected_framing:
                    logger.info(
                        f"Overriding {self.config_source} framing '{self.framing}' "
                        f"with transmitter metadata framing '{detected_framing}'"
                    )
                self.framing = detected_framing
                logger.info(f"Detected framing from transmitter metadata: {self.framing}")
        elif hasattr(self, "framing"):
            # Explicit satellite config from gr-satellites database - respect it
            logger.info(f"Using framing from {self.config_source}: {self.framing}")

        logger.info("BPSK decoder configuration:")
        logger.info(f"  NORAD ID: {self.norad_id or 'N/A (manual config)'}")
        logger.info(f"  Baudrate: {self.baudrate}")
        logger.info(f"  Framing: {self.framing}")
        logger.info(f"  Differential: {self.differential}")
        logger.info(f"  Config source: {self.config_source}")

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

    def _is_doka_signal(self):
        """
        Check if this is a DOKA signal based on framing configuration.

        Returns:
            bool: True if this is a DOKA signal
        """
        return hasattr(self, "framing") and self.framing == "doka"

    def _on_packet_decoded(self, payload, callsigns=None):
        """Callback when GNU Radio decodes a BPSK packet"""
        try:
            self.packet_count += 1
            with self.stats_lock:
                self.stats["packets_decoded"] = self.packet_count
            logger.info(f"BPSK packet #{self.packet_count} decoded: {len(payload)} bytes")

            # Parse telemetry using generic parser
            # Remove HDLC flags if present (0x7E at start/end)
            packet_data = payload
            if len(packet_data) > 0 and packet_data[0] == 0x7E:
                packet_data = packet_data[1:]
            if len(packet_data) > 0 and packet_data[-1] == 0x7E:
                packet_data = packet_data[:-1]

            telemetry_result = self.telemetry_parser.parse(packet_data)
            logger.info(f"Telemetry parsed: {telemetry_result.get('parser', 'unknown')}")

            # Save to file
            decode_timestamp = time.time()
            timestamp_str = time.strftime("%Y%m%d_%H%M%S")
            filename = f"bpsk_{self.baudrate}baud_{timestamp_str}_{self.packet_count}.bin"
            filepath = os.path.join(self.output_dir, filename)

            with open(filepath, "wb") as f:
                f.write(payload)
            logger.info(f"Saved: {filepath}")

            # Get current VFO state for metadata
            vfo_state = self._get_vfo_state()

            # Create comprehensive metadata
            metadata = {
                "packet": {
                    "number": self.packet_count,
                    "length_bytes": len(payload),
                    "timestamp": decode_timestamp,
                    "timestamp_iso": time.strftime(
                        "%Y-%m-%dT%H:%M:%S%z", time.localtime(decode_timestamp)
                    ),
                    "hex": payload.hex(),
                },
                "decoder": {
                    "type": "bpsk",
                    "session_id": self.session_id,
                    "baudrate": self.baudrate,
                    "differential": self.differential,
                    "packet_size": self.packet_size,
                    "batch_interval": self.batch_interval,
                },
                "signal": {
                    "frequency_hz": vfo_state.center_freq if vfo_state else None,
                    "frequency_mhz": vfo_state.center_freq / 1e6 if vfo_state else None,
                    "sample_rate_hz": self.sample_rate,
                    "sdr_sample_rate_hz": self.sdr_sample_rate,
                    "sdr_center_freq_hz": self.sdr_center_freq,
                    "sdr_center_freq_mhz": (
                        self.sdr_center_freq / 1e6 if self.sdr_center_freq else None
                    ),
                },
                "vfo": {
                    "id": self.vfo,
                    "center_freq_hz": vfo_state.center_freq if vfo_state else None,
                    "center_freq_mhz": vfo_state.center_freq / 1e6 if vfo_state else None,
                    "bandwidth_hz": vfo_state.bandwidth if vfo_state else None,
                    "bandwidth_khz": vfo_state.bandwidth / 1e3 if vfo_state else None,
                    "active": vfo_state.active if vfo_state else None,
                },
                "satellite": (
                    {
                        "norad_id": self.norad_id,
                        "name": self.satellite_name,
                        "full_info": self.satellite,
                    }
                    if self.norad_id
                    else None
                ),
                "transmitter": {
                    "description": self.transmitter_description,
                    "mode": self.transmitter_mode,
                    "full_config": self.transmitter,
                },
                "decoder_config": {
                    "source": self.config_source,
                    "framing": self.framing,
                },
                "demodulator_parameters": {
                    "fll_bandwidth_hz": 250,
                    "costas_bandwidth_hz": 100,
                    "rrc_alpha": 0.35,
                    "clock_recovery_bandwidth": 0.06,
                    "clock_recovery_limit": 0.004,
                },
                "file": {
                    "binary": filename,
                    "binary_path": filepath,
                },
            }

            # Add callsigns if available
            if callsigns:
                metadata["ax25"] = {
                    "from_callsign": callsigns.get("from"),
                    "to_callsign": callsigns.get("to"),
                }

            # Add parsed telemetry data
            metadata["telemetry"] = telemetry_result

            # Save metadata JSON
            metadata_filename = filename.replace(".bin", ".json")
            metadata_filepath = os.path.join(self.output_dir, metadata_filename)
            with open(metadata_filepath, "w") as f:
                json.dump(metadata, f, indent=2)
            logger.info(f"Saved metadata: {metadata_filepath}")

            # Encode as base64 for transmission
            packet_base64 = base64.b64encode(payload).decode()

            # Send to UI
            msg = {
                "type": "decoder-output",
                "decoder_type": "bpsk",
                "session_id": self.session_id,
                "vfo": self.vfo,
                "timestamp": decode_timestamp,
                "output": {
                    "format": "application/octet-stream",
                    "filename": filename,
                    "filepath": filepath,
                    "metadata_filename": metadata_filename,
                    "metadata_filepath": metadata_filepath,
                    "packet_data": packet_base64,
                    "packet_length": len(payload),
                    "packet_number": self.packet_count,
                    "parameters": f"{self.baudrate}baud",
                },
            }

            # Add callsigns if available
            if callsigns:
                msg["output"]["callsigns"] = callsigns

            # Add satellite info to UI message
            if self.norad_id:
                msg["output"]["satellite"] = {
                    "norad_id": self.norad_id,
                    "name": self.satellite_name,
                }

            # Add parsed telemetry to UI message
            if telemetry_result.get("success"):
                msg["output"]["telemetry"] = {
                    "parser": telemetry_result.get("parser"),
                    "frame": telemetry_result.get("frame"),
                    "data": telemetry_result.get("telemetry"),
                }
            try:
                self.data_queue.put(msg, block=False)
                with self.stats_lock:
                    self.stats["data_messages_out"] += 1
            except queue.Full:
                logger.warning("Data queue full, dropping packet output")

            # Don't send status update for individual packet decodes
            # The decoder stays in DECODING status continuously

        except Exception as e:
            logger.error(f"Error processing decoded packet: {e}")
            logger.exception(e)
            with self.stats_lock:
                self.stats["errors"] += 1

    def _on_flowgraph_status(self, status, info=None):
        """Callback when flowgraph status changes"""
        self._send_status_update(status, info)

    def _send_status_update(self, status, info=None):
        """Send status update to UI"""
        # Build decoder configuration info
        config_info = {
            "baudrate": self.baudrate,
            "differential": self.differential,
            "framing": self.framing,  # Use detected framing protocol directly
            "transmitter": self.transmitter_description,
            "transmitter_mode": self.transmitter_mode,
            "transmitter_downlink_mhz": (
                round(self.transmitter_downlink_freq / 1e6, 3)
                if self.transmitter_downlink_freq
                else None
            ),
        }

        # Merge with any additional info passed in
        if info:
            config_info.update(info)

        msg = {
            "type": "decoder-status",
            "status": status.value,
            "decoder_type": "bpsk",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "info": config_info,
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
                        # Note: We don't pass f_offset here since each batch creates new flowgraph
                        self.flowgraph = BPSKFlowgraph(
                            sample_rate=self.sample_rate,
                            callback=self._on_packet_decoded,
                            status_callback=self._on_flowgraph_status,
                            baudrate=self.baudrate,
                            differential=self.differential,
                            packet_size=self.packet_size,
                            batch_interval=self.batch_interval,
                            framing=self.framing,  # Pass framing protocol
                        )
                        flowgraph_started = True
                        logger.info(
                            f"BPSK flowgraph initialized - ready to decode (VFO @ {vfo_center/1e6:.3f} MHz)"
                        )

                    # Step 1: Frequency translation to put SIGNAL at baseband center
                    # CRITICAL: Use current VFO center frequency (where user/Doppler correction has tuned)
                    # This tracks Doppler shifts in real-time during satellite passes
                    # VFO state is read on every IQ chunk (~100ms), providing continuous Doppler tracking
                    offset_freq = vfo_center - sdr_center
                    if chunks_received == 0:
                        logger.info(
                            f"Translating signal from VFO center {vfo_center/1e6:.3f} MHz to baseband"
                        )
                        logger.info(f"Frequency translation: offset = {offset_freq/1e3:.1f} kHz")
                        if self.transmitter_downlink_freq:
                            logger.info(
                                f"Transmitter downlink freq (reference): {self.transmitter_downlink_freq/1e6:.3f} MHz"
                            )
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
