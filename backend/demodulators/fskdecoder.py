# Ground Station - FSK-Family Decoder using GNU Radio
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
# FSK-family decoder implementation (FSK, GFSK, GMSK) based on gr-satellites by Daniel Estevez
# https://github.com/daniestevez/gr-satellites
# Copyright 2019 Daniel Estevez <daniel@destevez.net>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This decoder receives raw IQ samples directly from the SDR process (via iq_queue)
# and demodulates FSK-family signals (FSK, GFSK, GMSK) using gr-satellites FSK demodulator.
#
# NOTE: FSK, GFSK, and GMSK all use the same demodulator - the differences are in pulse
# shaping (rectangular for FSK, Gaussian for GFSK/GMSK), which the demodulator handles
# automatically via adaptive timing recovery and matched filters.
#
# ARCHITECTURE NOTES:
# ==================
# 1. SIGNAL-CENTERED FREQUENCY TRANSLATION (same as BPSK decoder):
#    - MUST translate to the actual signal frequency from transmitter config, NOT VFO center
#    - offset_freq = signal_frequency - sdr_center_frequency
#    - This centers the signal at baseband (0 Hz) regardless of VFO drift
#
# 2. BATCHED PROCESSING WITH FRESH FLOWGRAPHS (same as BPSK decoder):
#    - Processes samples in configurable batches (default 5.0 seconds via batch_interval parameter)
#    - Creates a NEW gr.top_block for each batch to avoid GNU Radio 3.10 reconnection issues
#    - Aggressive cleanup in finally block prevents shared memory exhaustion
#
# 3. SIGNAL PROCESSING CHAIN (based on gr-satellites FSK demodulator):
#    - Frequency translation (signal to baseband)
#    - Decimation to target sample rate
#    - FM demodulation (quadrature demod) for IQ input
#    - Low-pass filter to Carson's bandwidth
#    - Square pulse filter (moving average)
#    - DC blocker
#    - AGC (Automatic Gain Control)
#    - Clock recovery using Gardner TED
#    - Binary slicer, NRZI decode, G3RUH descrambler, HDLC deframing
#
# 4. KEY PARAMETERS:
#    - Batch interval: 5 seconds default (configurable)
#    - Clock recovery bandwidth: 0.06 (relative to baudrate)
#    - Clock recovery limit: 0.004 (relative to baudrate)
#    - Deviation: 5000 Hz default (negative inverts sidebands)
#    - Sample rate: Matches VFO bandwidth

import argparse
import gc
import logging
import multiprocessing
import os
import queue
import time
from enum import Enum
from typing import Any, Dict

import numpy as np
import psutil

# Add setproctitle import for process naming
try:
    import setproctitle

    HAS_SETPROCTITLE = True
except ImportError:
    HAS_SETPROCTITLE = False

# Configure GNU Radio to use mmap-based buffers instead of shmget
# This prevents shared memory segment exhaustion
os.environ.setdefault("GR_BUFFER_TYPE", "vmcirc_mmap_tmpfile")

from gnuradio import blocks, gr  # noqa: E402
from satellites.components.deframers.ax25_deframer import ax25_deframer  # noqa: E402
from satellites.components.deframers.ccsds_concatenated_deframer import (  # noqa: E402
    ccsds_concatenated_deframer,
)
from satellites.components.deframers.geoscan_deframer import geoscan_deframer  # noqa: E402
from satellites.components.deframers.usp_deframer import usp_deframer  # noqa: E402
from satellites.components.demodulators.fsk_demodulator import fsk_demodulator  # noqa: E402
from scipy import signal  # noqa: E402

from demodulators.basedecoderprocess import BaseDecoderProcess  # noqa: E402
from telemetry.parser import TelemetryParser  # noqa: E402
from vfos.state import VFOManager  # noqa: E402


class DecoderStatus(Enum):
    """Decoder status values."""

    IDLE = "idle"
    LISTENING = "listening"
    DETECTING = "detecting"
    DECODING = "decoding"
    COMPLETED = "completed"
    ERROR = "error"


class FSKMessageHandler(gr.basic_block):
    """Message handler to receive PDU messages from HDLC deframer"""

    def __init__(self, callback, logger=None):
        gr.basic_block.__init__(self, name="fsk_message_handler", in_sig=None, out_sig=None)
        self.callback = callback
        self.logger = logger or logging.getLogger("fskdecoder")
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
                # Parse AX.25 callsigns
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
                except Exception as parse_err:
                    self.logger.debug(f"Could not parse callsigns: {parse_err}")

                # Add HDLC flags for compatibility
                packet_with_flags = bytes([0x7E]) + packet_data + bytes([0x7E])

                if self.callback:
                    self.callback(packet_with_flags, callsigns)
            else:
                self.logger.warning(f"Unexpected packet data type: {type(packet_data)}")

        except Exception as e:
            self.logger.error(f"Error handling message: {e}")
            import traceback

            traceback.print_exc()


class FSKFlowgraph(gr.top_block):
    """
    FSK-family flowgraph using gr-satellites FSK demodulator components

    Handles FSK, GFSK, and GMSK modulations using the same demodulator.
    Based on gr-satellites fsk_demodulator with support for multiple framing protocols.
    """

    def __init__(
        self,
        sample_rate,
        callback,
        status_callback=None,
        baudrate=9600,
        deviation=5000,
        use_agc=True,
        dc_block=True,
        clk_bw=0.06,
        clk_limit=0.004,
        batch_interval=5.0,
        framing="ax25",  # 'ax25', 'usp', 'geoscan', 'doka'
        modulation_subtype="FSK",  # 'FSK', 'GFSK', or 'GMSK' (metadata only)
        logger=None,
    ):
        """
        Initialize FSK-family decoder flowgraph using gr-satellites FSK demodulator

        Args:
            sample_rate: Input sample rate (Hz)
            callback: Function to call when packet is decoded
            status_callback: Function to call for status updates (status, info)
            baudrate: Symbol rate / baud rate (symbols/sec)
            deviation: Deviation in Hz (negative inverts sidebands)
            use_agc: Use automatic gain control
            dc_block: Use DC blocker
            clk_bw: Clock recovery bandwidth (relative to baudrate)
            clk_limit: Clock recovery limit (relative to baudrate)
            batch_interval: Batch processing interval in seconds (default: 5.0)
            framing: Framing protocol - 'ax25' (G3RUH), 'usp' (USP FEC), 'geoscan', 'doka'
            modulation_subtype: 'FSK', 'GFSK', or 'GMSK' (metadata only, for logging)
            logger: Logger instance to use for logging
        """
        super().__init__("FSK Decoder")

        self.sample_rate = sample_rate
        self.baudrate = baudrate
        self.callback = callback
        self.status_callback = status_callback
        self.deviation = deviation
        self.batch_interval = batch_interval
        self.use_agc = use_agc
        self.dc_block = dc_block
        self.clk_bw = clk_bw
        self.clk_limit = clk_limit
        self.framing = framing
        self.modulation_subtype = modulation_subtype
        self.logger = logger or logging.getLogger("fskdecoder")

        # Accumulate samples in a buffer
        self.sample_buffer = np.array([], dtype=np.complex64)
        self.sample_lock = multiprocessing.Lock()
        self.current_mode = "decoding"  # Track current mode

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

            self._process_buffer()

    def _process_buffer(self):
        """Process accumulated samples through the flowgraph"""
        # Copy buffer outside the lock to allow incoming samples to continue
        with self.sample_lock:
            if len(self.sample_buffer) == 0:
                return
            samples_to_process = self.sample_buffer.copy()
            # Clear the buffer completely - no tail overlap to avoid duplicate decodes
            self.sample_buffer = np.array([], dtype=np.complex64)

        tb = None
        try:
            # Create a NEW flowgraph for each batch to avoid connection conflicts
            # This is necessary because hierarchical blocks can't be easily disconnected

            # Create a temporary top_block
            tb = gr.top_block("FSK Batch Processor")

            # Create vector source with accumulated samples
            source = blocks.vector_source_c(samples_to_process.tolist(), repeat=False)

            # Create options namespace for gr-satellites components
            options = argparse.Namespace(
                clk_bw=self.clk_bw,
                clk_limit=self.clk_limit,
                deviation=self.deviation,
                use_agc=self.use_agc,
                disable_dc_block=not self.dc_block,
                syncword_threshold=13,  # For USP deframer
            )

            # Create FSK demodulator (GMSK is a type of FSK with Gaussian pulse shaping)
            # iq=True because we're feeding complex IQ samples
            demod = fsk_demodulator(
                baudrate=self.baudrate,
                samp_rate=self.sample_rate,
                iq=True,
                deviation=self.deviation,
                subaudio=False,
                dc_block=self.dc_block,
                dump_path=None,
                options=options,
            )

            # Create appropriate deframer based on framing protocol
            if self.framing == "geoscan":
                # GEOSCAN uses 66 or 74 byte frames (varies by satellite)
                # Default to 66 (most common), will need satellite-specific config for others
                frame_size = 66
                deframer = geoscan_deframer(
                    frame_size=frame_size,
                    syncword_threshold=4,  # Standard GEOSCAN default
                    options=options,
                )
                frame_info = f"GEOSCAN(sz={frame_size},PN9,CC11xx)"
            elif self.framing == "usp":
                # Increase syncword threshold for low SNR (allow more bit errors)
                # Default is 13, trying 20 for weak signals
                syncword_thresh = 20
                deframer = usp_deframer(syncword_threshold=syncword_thresh, options=options)
                frame_info = f"USP(sw_th={syncword_thresh},Vit+RS)"
            elif self.framing == "doka":
                # DOKA/CCSDS concatenated frames (used by some Russian satellites)
                deframer = ccsds_concatenated_deframer(options=options)
                frame_info = "DOKA(CCSDS)"
            else:  # default to ax25
                deframer = ax25_deframer(g3ruh_scrambler=True, options=options)
                frame_info = "AX25(G3RUH)"

            self.logger.info(
                f"Batch: {len(samples_to_process)} samp ({self.batch_interval}s) | "
                f"FSK: {self.baudrate}bd, {self.sample_rate:.0f}sps, dev={self.deviation} | "
                f"Frame: {frame_info}"
            )
            # Create message handler for this batch
            msg_handler = FSKMessageHandler(self.callback, logger=self.logger)

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
            self.logger.error(f"Error processing buffer: {e}")
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
            gc.collect()

            # Longer delay to allow system to clean up shared memory
            # GNU Radio 3.10+ has issues with rapid flowgraph creation/destruction
            time.sleep(0.1)

    def flush_buffer(self):
        """Process any remaining samples in the buffer"""
        should_process = False
        buffer_size = 0
        with self.sample_lock:
            if len(self.sample_buffer) > 0:
                buffer_size = len(self.sample_buffer)
                should_process = True
        # CRITICAL: Call _process_buffer() OUTSIDE the lock to avoid blocking the entire app.
        # _process_buffer() runs GNU Radio flowgraph synchronously (tb.wait()) and sleeps 100ms,
        # which would freeze all threads trying to acquire sample_lock if called inside the lock.
        if should_process:
            self.logger.info(
                f"Flushing {buffer_size} remaining samples from FSK flowgraph ({self.modulation_subtype})"
            )
            self._process_buffer()


class FSKDecoder(BaseDecoderProcess):
    """Real-time FSK-family decoder using GNU Radio (multiprocessing-based)

    Handles FSK, GFSK, and GMSK modulations using gr-satellites fsk_demodulator.
    All three modulation types use the same demodulator - pulse shaping differences
    (rectangular vs Gaussian) are handled automatically by the timing recovery.

    Runs as a separate process to isolate GNU Radio shared memory segments.
    Monitors SHM usage and signals restart when threshold exceeded.
    """

    def __init__(
        self,
        iq_queue,
        data_queue,
        session_id,
        config,  # Pre-resolved DecoderConfig from DecoderConfigService (contains all params + metadata)
        output_dir="data/decoded",
        vfo=None,
        batch_interval=5.0,  # Batch processing interval in seconds
        modulation_subtype="FSK",  # 'FSK', 'GFSK', or 'GMSK' (metadata only)
        shm_monitor_interval=10,  # Check SHM every 10 seconds
        shm_restart_threshold=1000,  # Restart when segments exceed this
    ):
        # Initialize base process (handles multiprocessing setup)
        super().__init__(
            iq_queue=iq_queue,
            data_queue=data_queue,
            session_id=session_id,
            config=config,
            output_dir=output_dir,
            vfo=vfo,
            shm_monitor_interval=shm_monitor_interval,
            shm_restart_threshold=shm_restart_threshold,
        )

        # FSK-specific attributes
        self.sample_rate = None  # VFO bandwidth sample rate (after decimation)
        self.sdr_sample_rate = None  # Full SDR sample rate
        self.sdr_center_freq = None  # SDR center frequency
        self.decimation_filter = None  # Filter for decimation
        self.modulation_subtype = modulation_subtype  # FSK, GFSK, or GMSK
        self.batch_interval = batch_interval

        # Initialize logger with modulation subtype for proper identification
        self.logger = logging.getLogger(f"{modulation_subtype.lower()}decoder")

        # Note: packet_count, stats, stats_lock already initialized by BaseDecoderProcess
        self.logger.debug(
            f"FSKDecoder initialized ({modulation_subtype}): packet_count=0, "
            f"SHM threshold={shm_restart_threshold}, monitor interval={shm_monitor_interval}s"
        )

        # Extract all parameters from resolved config (including metadata)
        self.baudrate = config.baudrate
        self.framing = config.framing
        self.config_source = config.config_source

        # Deviation: Use config value or smart default based on baudrate
        # FSK demodulator REQUIRES a deviation value (cannot be None)
        if config.deviation is not None:
            self.deviation = config.deviation
        else:
            # Smart defaults based on baudrate (common FSK/GMSK practices)
            if self.baudrate <= 1200:
                self.deviation = 600  # Low baudrate: narrow deviation
            elif self.baudrate <= 2400:
                self.deviation = 1200  # 2400 baud
            elif self.baudrate <= 4800:
                self.deviation = 2400  # 4800 baud
            elif self.baudrate <= 9600:
                self.deviation = 5000  # 9600 baud (most common)
            else:
                self.deviation = int(self.baudrate * 0.5)  # High baudrate: ~50% of baudrate
            self.logger.warning(
                f"Deviation not specified in config, using smart default: {self.deviation} Hz "
                f"(baudrate={self.baudrate})"
            )

        # Extract satellite and transmitter metadata from config
        self.satellite = config.satellite or {}
        self.transmitter = config.transmitter or {}

        # Extract commonly used fields for convenience
        self.norad_id = self.satellite.get("norad_id")
        self.satellite_name = self.satellite.get("name") or "Unknown"
        self.transmitter_description = self.transmitter.get("description") or "Unknown"
        self.transmitter_mode = self.transmitter.get("mode") or "GMSK"
        self.transmitter_downlink_freq = self.transmitter.get("downlink_low")

        # Log debug if downlink frequency not available (not a warning - expected for manual VFO mode)
        if not self.transmitter_downlink_freq:
            self.logger.debug(
                "Transmitter downlink frequency not available in config (manual VFO mode)"
            )
            self.logger.debug(f"Config metadata: {config.to_dict()}")

        # Build smart parameter summary - only show non-None optional params
        param_parts = [
            f"{self.baudrate}bd",
            f"dev={self.deviation}Hz",
            f"{self.framing.upper()}",
        ]

        # Add optional parameters only if they're set
        if config.af_carrier is not None:
            param_parts.append(f"af_carrier={config.af_carrier}Hz")
        if config.differential:
            param_parts.append("differential")
        if config.packet_size is not None:
            param_parts.append(f"pkt_sz={config.packet_size}")

        params_str = ", ".join(param_parts)

        # Build satellite info (compact format)
        sat_info = f"{self.satellite_name}"
        if self.norad_id:
            sat_info += f" (NORAD {self.norad_id})"

        # Build transmitter info (compact format)
        tx_info = f"TX: {self.transmitter_description}"
        if self.transmitter_downlink_freq:
            tx_info += f" @ {self.transmitter_downlink_freq/1e6:.3f}MHz"

        # Single consolidated initialization log with all relevant parameters
        self.logger.info(
            f"FSK decoder initialized ({self.modulation_subtype}): "
            f"session={session_id}, VFO {vfo} | {sat_info} | {tx_info} | {params_str} | "
            f"batch={self.batch_interval}s | src: {self.config_source}"
        )

        os.makedirs(self.output_dir, exist_ok=True)

        # GNU Radio flowgraph (will be initialized when we know sample rate)
        self.flowgraph = None

        # Signal power measurement (from BaseDecoder)
        self.power_measurements = []
        self.max_power_history = 100
        self.current_power_dbfs = None

    def _get_decoder_type_for_init(self) -> str:
        """Return decoder type for process naming."""
        return "FSK"

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

    def _should_accept_packet(self, payload, callsigns):
        """FSK-family decoders require valid callsigns"""
        if not callsigns or not callsigns.get("from") or not callsigns.get("to"):
            self.logger.debug("Packet rejected: no valid callsigns found")
            return False
        return True

    def _get_decoder_type(self):
        """Return decoder type string based on modulation subtype"""
        return self.modulation_subtype.lower()

    def _get_decoder_specific_metadata(self):
        """Return FSK-specific metadata"""
        return {
            "modulation_subtype": self.modulation_subtype,
            "deviation": self.deviation,
            "batch_interval": self.batch_interval,
        }

    def _get_filename_params(self):
        """Return filename parameters"""
        return f"{self.baudrate}baud"

    def _get_parameters_string(self):
        """Return human-readable parameters string"""
        return f"{self.baudrate}baud, {abs(self.deviation)}Hz dev"

    def _get_demodulator_params_metadata(self):
        """Return FSK demodulator parameters"""
        return {
            "modulation_subtype": self.modulation_subtype,
            "deviation_hz": self.deviation,
            "clock_recovery_bandwidth": 0.06,
            "clock_recovery_limit": 0.004,
        }

    def _get_payload_protocol(self):
        """FSK uses AX.25 for ax25/usp framing, proprietary otherwise"""
        if self.framing in ["ax25", "usp"]:
            return "ax25"
        return "proprietary"

    def _on_flowgraph_status(self, status, info=None):
        """Callback when flowgraph status changes"""
        self._send_status_update(status, info)

    def _send_status_update(self, status, info=None):
        """Send status update to UI"""
        # Build decoder configuration info
        config_info = {
            "baudrate": self.baudrate,
            "deviation_hz": self.deviation,
            "framing": self.framing,  # "ax25" or "usp"
            "transmitter": self.transmitter_description,
            "transmitter_mode": self.modulation_subtype,  # Use actual modulation (GFSK/GMSK/FSK)
            "transmitter_downlink_mhz": (
                round(self.transmitter_downlink_freq / 1e6, 3)
                if self.transmitter_downlink_freq
                else None
            ),
        }

        # Add power measurements if available
        config_info.update(self._get_power_statistics())

        # Merge with any additional info passed in
        if info:
            config_info.update(info)

        msg = {
            "type": "decoder-status",
            "status": status.value,
            "decoder_type": self.modulation_subtype.lower(),
            "modulation_subtype": self.modulation_subtype,
            "decoder_id": self.decoder_id,
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
            self.logger.warning("Data queue full, dropping status update")

    def _send_stats_update(self):
        """Send statistics update to UI and performance monitor"""
        # UI-friendly stats
        ui_stats = {
            "packets_decoded": self.packet_count,
            "baudrate": self.baudrate,
            "deviation": self.deviation,
        }
        ui_stats.update(self._get_power_statistics())

        # Full performance stats for monitoring (thread-safe copy)
        with self.stats_lock:
            perf_stats = self.stats.copy()

        msg = {
            "type": "decoder-stats",
            "decoder_type": self.modulation_subtype.lower(),
            "modulation_subtype": self.modulation_subtype,
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "stats": ui_stats,  # UI-friendly stats
            "perf_stats": perf_stats,  # Full performance stats for PerformanceMonitor
        }
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            pass

    def run(self):
        """Main process loop - processes IQ samples continuously"""
        # Set process name for visibility in system monitoring tools
        if HAS_SETPROCTITLE:
            setproctitle.setproctitle(
                f"Ground Station - {self.modulation_subtype} Decoder (VFO {self.vfo})"
            )

        # Initialize components in the subprocess
        self.telemetry_parser = TelemetryParser()
        self.vfo_manager = VFOManager()

        # Initialize stats in subprocess
        self.stats: Dict[str, Any] = {
            "iq_chunks_in": 0,
            "samples_in": 0,
            "data_messages_out": 0,
            "queue_timeouts": 0,
            "packets_decoded": 0,
            "last_activity": None,
            "errors": 0,
            "cpu_percent": 0.0,
            "memory_mb": 0.0,
            "memory_percent": 0.0,
        }

        self._send_status_update(DecoderStatus.LISTENING)

        chunks_received = 0
        flowgraph_started = False
        last_stats_time = time.time()  # Track time for periodic stats updates

        # CPU and memory monitoring
        process = psutil.Process()
        last_cpu_check = time.time()
        cpu_check_interval = 0.5  # Update CPU usage every 0.5 seconds

        try:
            while self.running.value == 1:  # Changed from self.running
                # Update CPU and memory usage periodically
                current_time = time.time()
                if current_time - last_cpu_check >= cpu_check_interval:
                    try:
                        cpu_percent = process.cpu_percent()
                        mem_info = process.memory_info()
                        memory_mb = mem_info.rss / (1024 * 1024)  # Convert bytes to MB
                        memory_percent = process.memory_percent()

                        with self.stats_lock:
                            self.stats["cpu_percent"] = cpu_percent
                            self.stats["memory_mb"] = memory_mb
                            self.stats["memory_percent"] = memory_percent
                        last_cpu_check = current_time
                    except Exception as e:
                        self.logger.debug(f"Error updating CPU/memory usage: {e}")

                # Read IQ samples from iq_queue
                try:
                    iq_message = self.iq_queue.get(timeout=0.05)  # 50ms timeout

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

                        # Design decimation filter
                        self.decimation_filter = self._design_decimation_filter(
                            decimation, vfo_bandwidth, self.sdr_sample_rate
                        )

                        # Calculate offset frequency for logging
                        offset_freq_init = vfo_center - sdr_center

                        # Initialize flowgraph (before consolidated log to avoid duplicate messages)
                        self.flowgraph = FSKFlowgraph(
                            sample_rate=self.sample_rate,
                            callback=self._on_packet_decoded,
                            status_callback=self._on_flowgraph_status,
                            baudrate=self.baudrate,
                            deviation=self.deviation,
                            use_agc=True,
                            dc_block=True,
                            batch_interval=self.batch_interval,
                            framing=self.framing,
                            modulation_subtype=self.modulation_subtype,
                            logger=self.logger,
                        )
                        flowgraph_started = True

                        # Consolidated initialization log (replaces "FSK decoder process started", "FSK init", and FSKFlowgraph init logs)
                        tx_info = (
                            f", TX={self.transmitter_downlink_freq/1e6:.3f}MHz"
                            if self.transmitter_downlink_freq
                            else ""
                        )
                        self.logger.info(
                            f"FSK decoder started ({self.modulation_subtype}): session={self.session_id} | "
                            f"{self.baudrate}bd, {target_sample_rate/1e3:.2f}kS/s ({target_sps}sps), dev={self.deviation}Hz, {self.framing.upper()} | "
                            f"SDR={self.sdr_sample_rate/1e6:.2f}MS/s@{sdr_center/1e6:.3f}MHz, "
                            f"VFO={vfo_center/1e6:.3f}MHz (ofs={offset_freq_init/1e3:.1f}kHz, BW={vfo_bandwidth/1e3:.0f}kHz, dec={decimation}) | "
                            f"batch={self.batch_interval}s{tx_info}"
                        )

                    # Step 1: Frequency translation to put SIGNAL at baseband center
                    # CRITICAL: Use current VFO center frequency (where user/Doppler correction has tuned)
                    # This tracks Doppler shifts in real-time during satellite passes
                    # VFO state is read on every IQ chunk (~100ms), providing continuous Doppler tracking
                    offset_freq = vfo_center - sdr_center
                    translated = self._frequency_translate(
                        samples, offset_freq, self.sdr_sample_rate
                    )

                    # Measure signal power AFTER frequency translation, BEFORE decimation/AGC
                    # This gives the most accurate raw signal strength
                    power_dbfs = self._measure_signal_power(translated)
                    self._update_power_measurement(power_dbfs)

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

                    # Monitor shared memory every 100 chunks
                    if chunks_received % 100 == 0:
                        self._monitor_shared_memory()

                except queue.Empty:
                    with self.stats_lock:
                        self.stats["queue_timeouts"] += 1

                # Send stats periodically based on time (every 1 second) regardless of chunk rate
                current_time = time.time()
                if current_time - last_stats_time >= 1.0:
                    self._send_stats_update()
                    last_stats_time = current_time

        except Exception as e:
            self.logger.error(f"FSK decoder error: {e}")
            self.logger.exception(e)
            with self.stats_lock:
                self.stats["errors"] += 1
            self._send_status_update(DecoderStatus.ERROR)
        except KeyboardInterrupt:
            pass
        finally:
            # Flush any remaining samples
            if flowgraph_started and self.flowgraph:
                try:
                    self.flowgraph.flush_buffer()
                except Exception as e:
                    self.logger.error(f"Error flushing buffer: {e}")

        self.logger.info(
            f"FSK decoder process ({self.modulation_subtype}) stopped for {self.session_id}. "
            f"Final SHM segments: {self.get_shm_segment_count()}"
        )

        # Send final status with restart flag if applicable
        final_status = "restart_requested" if self.should_restart() else "closed"
        msg = {
            "type": "decoder-status",
            "status": final_status,
            "decoder_type": self.modulation_subtype.lower(),
            "modulation_subtype": self.modulation_subtype,
            "decoder_id": self.decoder_id,
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "shm_segments": self.get_shm_segment_count(),
            "restart_requested": self.should_restart(),
        }
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            pass
