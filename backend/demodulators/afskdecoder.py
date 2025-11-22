# Ground Station - AFSK Decoder using GNU Radio
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
# AFSK decoder implementation based on gr-satellites by Daniel Estevez
# https://github.com/daniestevez/gr-satellites
# Copyright 2019 Daniel Estevez <daniel@destevez.net>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# AFSK (Audio Frequency Shift Keying) decoder for satellite packet radio.
# Uses FM audio as input (chained after FM demodulator).
#
# ARCHITECTURE NOTES:
# ==================
# 1. TWO-STAGE DEMODULATION (FM audio input):
#    - Stage 1: FM demodulation (IQ → audio) - handled by FMDemodulator
#    - Stage 2: AFSK demodulation (audio → data) - handled by this decoder
#    - Audio queue connects the two stages (same as SSTV decoder)
#
# 2. AFSK SIGNAL CHAIN:
#    - FM-demodulated audio input (from FMDemodulator)
#    - Frequency translation (shift af_carrier to baseband)
#    - Low-pass filter (Carson's bandwidth)
#    - FSK demodulation (quadrature demod)
#    - Clock recovery
#    - Binary slicer, NRZI decode, G3RUH descrambler, HDLC deframing
#
# 3. COMMON PARAMETERS:
#    - Baudrate: 1200 bps (Bell 202 APRS), 9600 bps (G3RUH)
#    - AF carrier: 1700 Hz (APRS), 1200 Hz (packet radio)
#    - Deviation: ±500 Hz (1200 baud), ±2400 Hz (9600 baud)
#    - Audio sample rate: 44100 Hz (from FMDemodulator)
#
# 4. TYPICAL USE CASES:
#    - APRS (Automatic Packet Reporting System): 1200 baud Bell 202
#    - VHF/UHF packet radio: 1200/9600 baud AX.25
#    - Amateur radio satellites with FM transponders

import argparse
import base64
import gc
import json
import logging
import os
import queue
import threading
import time
from enum import Enum
from typing import Any, Dict

import numpy as np

from telemetry.parser import TelemetryParser
from vfos.state import VFOManager

# Try to import satellite config service
try:
    from satconfig.config import SatelliteConfigService

    SATCONFIG_AVAILABLE = True
except ImportError:
    SATCONFIG_AVAILABLE = False

logger = logging.getLogger("afskdecoder")

# Try to import GNU Radio
GNURADIO_AVAILABLE = False

try:
    from gnuradio import blocks, gr

    GNURADIO_AVAILABLE = True
    logger.info("GNU Radio available - AFSK decoder enabled")
except ImportError as e:
    logger.warning(f"GNU Radio not available: {e}")
    logger.warning("AFSK decoder will not be functional")


class DecoderStatus(Enum):
    """Decoder status values."""

    IDLE = "idle"
    LISTENING = "listening"
    DETECTING = "detecting"
    DECODING = "decoding"
    COMPLETED = "completed"
    ERROR = "error"


class AFSKMessageHandler(gr.basic_block):
    """Message handler to receive PDU messages from HDLC deframer"""

    def __init__(self, callback):
        gr.basic_block.__init__(self, name="afsk_message_handler", in_sig=None, out_sig=None)
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
    _AFSKFlowgraphBase = gr.top_block
else:
    _AFSKFlowgraphBase = object


class AFSKFlowgraph(_AFSKFlowgraphBase):  # type: ignore[misc,valid-type]
    """
    AFSK flowgraph using gr-satellites AFSK demodulator components

    Based on gr-satellites afsk_demodulator and ax25_deframer.
    """

    def __init__(
        self,
        sample_rate,
        callback,
        status_callback=None,
        baudrate=1200,
        af_carrier=1700,
        deviation=500,
        use_agc=True,
        dc_block=True,
        clk_bw=0.06,
        clk_limit=0.004,
        batch_interval=5.0,
        framing="ax25",  # 'ax25' (default for AFSK)
    ):
        """
        Initialize AFSK decoder flowgraph using gr-satellites AFSK demodulator

        Args:
            sample_rate: Audio sample rate (Hz) - typically 44100
            callback: Function to call when packet is decoded
            status_callback: Function to call for status updates (status, info)
            baudrate: Symbol rate / baud rate (symbols/sec) - 1200 or 9600 typical
            af_carrier: Audio frequency carrier in Hz (1700 for APRS, 1200 for packet)
            deviation: Deviation in Hz (negative inverts sidebands)
            use_agc: Use automatic gain control
            dc_block: Use DC blocker
            clk_bw: Clock recovery bandwidth (relative to baudrate)
            clk_limit: Clock recovery limit (relative to baudrate)
            batch_interval: Batch processing interval in seconds (default: 5.0)
            framing: Framing protocol - 'ax25' (G3RUH, default for AFSK)
        """
        if not GNURADIO_AVAILABLE:
            raise RuntimeError("GNU Radio not available - AFSK decoder cannot be initialized")

        super().__init__("AFSK Decoder")

        self.sample_rate = sample_rate
        self.baudrate = baudrate
        self.af_carrier = af_carrier
        self.callback = callback
        self.status_callback = status_callback
        self.deviation = deviation
        self.batch_interval = batch_interval
        self.use_agc = use_agc
        self.dc_block = dc_block
        self.clk_bw = clk_bw
        self.clk_limit = clk_limit
        self.framing = framing

        # Accumulate samples in a buffer
        self.sample_buffer = np.array([], dtype=np.float32)
        self.sample_lock = threading.Lock()
        self.current_mode = "decoding"  # Track current mode

        logger.info(
            f"AFSK flowgraph initialized: "
            f"{baudrate} baud, {sample_rate} sps, af_carrier={af_carrier} Hz, "
            f"deviation={deviation} Hz, framing={framing}, batch_interval={batch_interval}s"
        )

    def process_samples(self, samples):
        """
        Process audio samples through the flowgraph

        Accumulates samples in a buffer and processes them periodically.

        Args:
            samples: numpy array of float32 audio samples
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

            logger.info(f"Processing batch: {buffer_size} samples ({self.batch_interval}s)")
            self._process_buffer()

    def _process_buffer(self):
        """Process accumulated samples through the flowgraph"""
        # Copy buffer outside the lock to allow incoming samples to continue
        with self.sample_lock:
            if len(self.sample_buffer) == 0:
                return
            samples_to_process = self.sample_buffer.copy()
            # Clear the buffer completely - no tail overlap to avoid duplicate decodes
            self.sample_buffer = np.array([], dtype=np.float32)

        tb = None
        try:
            # Create a NEW flowgraph for each batch to avoid connection conflicts
            # This is necessary because hierarchical blocks can't be easily disconnected

            # Import gr-satellites components
            from satellites.components.demodulators.afsk_demodulator import afsk_demodulator

            # Create a temporary top_block
            tb = gr.top_block("AFSK Batch Processor")

            # Create vector source with accumulated samples (float, not complex)
            source = blocks.vector_source_f(samples_to_process.tolist(), repeat=False)

            # Create options namespace for gr-satellites components
            options = argparse.Namespace(
                clk_bw=self.clk_bw,
                clk_limit=self.clk_limit,
                deviation=self.deviation,
                use_agc=self.use_agc,
                disable_dc_block=not self.dc_block,
            )

            # Create AFSK demodulator
            # iq=False because we're feeding real audio samples (already FM demodulated)
            logger.info(
                f"Creating AFSK demodulator: baudrate={self.baudrate}, "
                f"samp_rate={self.sample_rate}, af_carrier={self.af_carrier}, "
                f"deviation={self.deviation}"
            )
            demod = afsk_demodulator(
                baudrate=self.baudrate,
                samp_rate=self.sample_rate,
                iq=False,  # Audio input (real), not IQ
                af_carrier=self.af_carrier,
                deviation=self.deviation,
                dump_path=None,
                options=options,
            )

            # Create AX.25 deframer (AFSK typically uses AX.25)
            from satellites.components.deframers.ax25_deframer import ax25_deframer

            deframer = ax25_deframer(g3ruh_scrambler=True, options=options)
            logger.info("Using AX.25 deframer (G3RUH descrambler)")

            # Create message handler for this batch
            msg_handler = AFSKMessageHandler(self.callback)

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
                self.sample_buffer = np.array([], dtype=np.float32)
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
        with self.sample_lock:
            if len(self.sample_buffer) > 0:
                logger.info(f"Flushing {len(self.sample_buffer)} remaining samples")
                should_process = True
        # CRITICAL: Call _process_buffer() OUTSIDE the lock to avoid blocking the entire app.
        # _process_buffer() runs GNU Radio flowgraph synchronously (tb.wait()) and sleeps 100ms,
        # which would freeze all threads trying to acquire sample_lock if called inside the lock.
        if should_process:
            self._process_buffer()


class AFSKDecoder(threading.Thread):
    """Real-time AFSK decoder using GNU Radio - consumes FM audio"""

    def __init__(
        self,
        audio_queue,
        data_queue,
        session_id,
        output_dir="data/decoded",
        vfo=None,
        satellite=None,  # Satellite dict from database (contains norad_id, name, etc.)
        transmitter=None,  # Complete transmitter dict with all parameters
        baudrate=1200,  # Fallback if not in transmitter dict (1200 for APRS, 9600 for G3RUH)
        af_carrier=1700,  # Audio frequency carrier in Hz (1700 for APRS)
        deviation=500,  # AFSK deviation in Hz (500 for 1200 baud, 2400 for 9600 baud)
        batch_interval=5.0,  # Batch processing interval in seconds
    ):
        if not GNURADIO_AVAILABLE:
            logger.error("GNU Radio not available - AFSK decoder cannot be initialized")
            raise RuntimeError("GNU Radio not available")

        super().__init__(daemon=True, name=f"AFSKDecoder-{session_id}")
        self.audio_queue = audio_queue
        self.data_queue = data_queue
        self.session_id = session_id
        self.audio_sample_rate = 44100  # Standard audio rate from FMDemodulator
        self.running = True
        self.output_dir = output_dir
        self.vfo = vfo
        self.vfo_manager = VFOManager()
        self.packet_count = 0
        logger.info("AFSKDecoder initialized: packet_count set to 0")

        # Initialize telemetry parser
        self.telemetry_parser = TelemetryParser()
        logger.info("Telemetry parser initialized for AFSK decoder")

        # Store satellite and transmitter dicts
        self.satellite = satellite or {}
        self.transmitter = transmitter or {}

        # Extract satellite info
        self.norad_id = self.satellite.get("norad_id")
        self.satellite_name = self.satellite.get("name", "Unknown")

        # Extract AFSK parameters from transmitter dict or use defaults
        self.baudrate = self.transmitter.get("baud", baudrate)
        self.af_carrier = af_carrier  # TODO: Could be in transmitter dict
        self.deviation = self.transmitter.get("deviation", deviation)
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
                if "deviation" in sat_params:
                    self.deviation = sat_params["deviation"]
                if "framing" in sat_params:
                    self.framing = sat_params["framing"]
                self.config_source = sat_params["source"]

                logger.info(f"Loaded config for {self.satellite_name} (NORAD {self.norad_id}):")
                logger.info(f"  Baudrate: {self.baudrate}")
                logger.info(f"  Deviation: {self.deviation} Hz")
                logger.info(f"  Framing: {self.framing}")
                logger.info(f"  Source: {self.config_source}")

            except Exception as e:
                logger.error(f"Failed to load satellite config for NORAD {self.norad_id}: {e}")
                logger.info("Falling back to manual configuration")
                # Fall through to manual config below
                self.norad_id = None  # Mark as manual config

        # Store transmitter downlink frequency for reference
        self.transmitter_downlink_freq = self.transmitter.get("downlink_low")
        if not self.transmitter_downlink_freq:
            logger.warning("Transmitter downlink_low not available in transmitter dict")

        # Store additional transmitter info
        self.transmitter_description = self.transmitter.get("description", "Unknown")
        self.transmitter_mode = self.transmitter.get("mode", "AFSK")

        # Detect framing protocol if not already set by config service
        # Priority: Check description first, then mode field, default to AX.25
        # AFSK is almost always AX.25 (amateur radio packet)
        if not hasattr(self, "framing") or self.framing is None:
            transmitter_mode = self.transmitter.get("mode", "AFSK").upper()
            transmitter_desc = self.transmitter.get("description", "").upper()

            # Check description first for all framing types
            if "G3RUH" in transmitter_desc:
                # G3RUH scrambler implies AX.25 framing
                self.framing = "ax25"
            elif "APRS" in transmitter_desc:
                # APRS uses AX.25
                self.framing = "ax25"
            elif "AX.25" in transmitter_desc or "AX25" in transmitter_desc:
                self.framing = "ax25"
            # If nothing in description, check mode field
            elif "AX.25" in transmitter_mode or "AX25" in transmitter_mode:
                self.framing = "ax25"
            else:
                # Default to AX.25 if nothing found (AFSK is typically AX.25)
                self.framing = "ax25"

            logger.info(f"Detected framing from transmitter metadata: {self.framing}")

        logger.info("AFSK decoder configuration:")
        logger.info(f"  NORAD ID: {self.norad_id or 'N/A (manual config)'}")
        logger.info(f"  Baudrate: {self.baudrate}")
        logger.info(f"  AF Carrier: {self.af_carrier} Hz")
        logger.info(f"  Deviation: {self.deviation} Hz")
        logger.info(f"  Framing: {self.framing}")
        logger.info(f"  Config source: {self.config_source}")

        os.makedirs(self.output_dir, exist_ok=True)

        # GNU Radio flowgraph (will be initialized when we start processing)
        self.flowgraph = None

        # Performance monitoring stats
        self.stats: Dict[str, Any] = {
            "audio_chunks_in": 0,
            "samples_in": 0,
            "data_messages_out": 0,
            "queue_timeouts": 0,
            "packets_decoded": 0,
            "last_activity": None,
            "errors": 0,
        }
        self.stats_lock = threading.Lock()

        logger.info(f"AFSK decoder initialized for session {session_id}, VFO {vfo}")
        if self.transmitter:
            logger.info(f"Transmitter: {self.transmitter_description} ({self.transmitter_mode})")
        logger.info(
            f"AFSK parameters: {self.baudrate} baud, af_carrier={self.af_carrier} Hz, deviation={self.deviation} Hz"
        )

    def _get_vfo_state(self):
        """Get VFO state for this decoder."""
        if self.vfo is not None:
            return self.vfo_manager.get_vfo_state(self.session_id, self.vfo)
        return None

    def _on_packet_decoded(self, payload, callsigns=None):
        """Callback when GNU Radio decodes an AFSK packet"""
        try:
            logger.info(
                f"_on_packet_decoded CALLED: payload_len={len(payload)}, callsigns={callsigns}, "
                f"current_count={self.packet_count}"
            )

            # Only count packets with valid callsigns
            if not callsigns or not callsigns.get("from") or not callsigns.get("to"):
                logger.debug("Packet rejected: no valid callsigns found")
                return

            self.packet_count += 1
            logger.info(f"_on_packet_decoded: INCREMENTING counter to {self.packet_count}")
            with self.stats_lock:
                self.stats["packets_decoded"] = self.packet_count

            logger.info(f"AFSK transmission decoded: {len(payload)} bytes")
            logger.info(f"  Callsigns: {callsigns.get('to')} <- {callsigns.get('from')}")

            # Remove HDLC flags for hex display (if present)
            packet_data = payload
            if len(packet_data) > 0 and packet_data[0] == 0x7E:
                packet_data = packet_data[1:]
            if len(packet_data) > 0 and packet_data[-1] == 0x7E:
                packet_data = packet_data[:-1]
            logger.info(f"  First 20 bytes: {packet_data[:20].hex()}")

            # Parse telemetry using generic parser
            telemetry_result = self.telemetry_parser.parse(packet_data)
            if telemetry_result.get("success"):
                logger.info(f"Telemetry parsed: {telemetry_result.get('parser', 'unknown')}")

            # Save to file
            decode_timestamp = time.time()
            timestamp_str = time.strftime("%Y%m%d_%H%M%S")
            # Use microseconds to ensure unique filenames for rapid consecutive decodes
            timestamp_us = int((decode_timestamp % 1) * 1000000)
            filename = f"afsk_{self.baudrate}baud_{timestamp_str}_{timestamp_us:06d}.bin"
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
                    "type": "afsk",
                    "session_id": self.session_id,
                    "baudrate": self.baudrate,
                    "af_carrier": self.af_carrier,
                    "deviation": self.deviation,
                    "batch_interval": self.batch_interval,
                },
                "signal": {
                    "frequency_hz": vfo_state.center_freq if vfo_state else None,
                    "frequency_mhz": vfo_state.center_freq / 1e6 if vfo_state else None,
                    "audio_sample_rate_hz": self.audio_sample_rate,
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
                    "af_carrier_hz": self.af_carrier,
                    "deviation_hz": self.deviation,
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
                "decoder_type": "afsk",
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
                    "parameters": f"{self.baudrate}baud, {self.af_carrier}Hz carrier, {abs(self.deviation)}Hz dev",
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
            "af_carrier_hz": self.af_carrier,
            "deviation_hz": self.deviation,
            "framing": self.framing,
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
            "decoder_type": "afsk",
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
            "decoder_type": "afsk",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "stats": {
                "packets_decoded": self.packet_count,
                "baudrate": self.baudrate,
                "af_carrier": self.af_carrier,
                "deviation": self.deviation,
            },
        }
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            pass

    def run(self):
        """Main thread loop - processes audio samples continuously"""
        logger.info(f"AFSK decoder started for {self.session_id}")
        self._send_status_update(DecoderStatus.LISTENING)

        chunks_received = 0
        flowgraph_started = False

        try:
            # Initialize flowgraph
            self.flowgraph = AFSKFlowgraph(
                sample_rate=self.audio_sample_rate,
                callback=self._on_packet_decoded,
                status_callback=self._on_flowgraph_status,
                baudrate=self.baudrate,
                af_carrier=self.af_carrier,
                deviation=self.deviation,
                use_agc=True,
                dc_block=True,
                batch_interval=self.batch_interval,
                framing=self.framing,
            )
            flowgraph_started = True
            logger.info("AFSK flowgraph initialized - ready to decode")

            while self.running:
                # Read audio samples from audio_queue
                try:
                    audio_message = self.audio_queue.get(timeout=0.1)

                    # Update stats
                    with self.stats_lock:
                        self.stats["audio_chunks_in"] += 1
                        self.stats["last_activity"] = time.time()

                    # Extract audio samples from message
                    samples = audio_message.get("samples")

                    if samples is None or len(samples) == 0:
                        continue

                    # Update sample count
                    with self.stats_lock:
                        self.stats["samples_in"] += len(samples)

                    # Process samples through flowgraph
                    if flowgraph_started and self.flowgraph is not None:
                        self.flowgraph.process_samples(samples)

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
            logger.error(f"AFSK decoder error: {e}")
            logger.exception(e)
            with self.stats_lock:
                self.stats["errors"] += 1
            self._send_status_update(DecoderStatus.ERROR)
        except KeyboardInterrupt:
            pass
        finally:
            # Flush any remaining samples
            if flowgraph_started and self.flowgraph:
                logger.info("Flushing remaining samples from AFSK flowgraph")
                try:
                    self.flowgraph.flush_buffer()
                except Exception as e:
                    logger.error(f"Error flushing buffer: {e}")

        logger.info(f"AFSK decoder stopped for {self.session_id}")

    def stop(self):
        """Stop the decoder thread"""
        self.running = False

        # Send final status update
        msg = {
            "type": "decoder-status",
            "status": "closed",
            "decoder_type": "afsk",
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


# Export all necessary components
__all__ = [
    "GNURADIO_AVAILABLE",
    "DecoderStatus",
    "AFSKFlowgraph",
    "AFSKMessageHandler",
    "AFSKDecoder",
]
