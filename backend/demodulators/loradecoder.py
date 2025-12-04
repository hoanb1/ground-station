# Ground Station - LoRa Decoder using GNU Radio gr-lora_sdr
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
# LoRa decoder using GNU Radio gr-lora_sdr blocks for proper LoRa PHY decoding.
# This decoder receives raw IQ samples directly from the SDR process (via iq_queue).

import logging
import os
import queue
import time
from enum import Enum
from typing import Any, Dict

import numpy as np
import pmt
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
from scipy import signal  # noqa: E402

from demodulators.basedecoderprocess import BaseDecoderProcess  # noqa: E402
from telemetry.parser import TelemetryParser  # noqa: E402

logger = logging.getLogger("loradecoder")

# Try to import gr-lora_sdr (optional module)
LORA_SDR_AVAILABLE = False
try:
    from gnuradio import lora_sdr

    LORA_SDR_AVAILABLE = True
    logger.info("gr-lora_sdr available - LoRa decoder enabled")
except ImportError as e:
    logger.warning(f"gr-lora_sdr not available: {e}")
    logger.warning("LoRa decoder will not be functional")


class DecoderStatus(Enum):
    """Decoder status values."""

    IDLE = "idle"
    LISTENING = "listening"
    DETECTING = "detecting"
    DECODING = "decoding"
    COMPLETED = "completed"
    ERROR = "error"


class LoRaMessageSink(gr.sync_block):
    """Custom GNU Radio sink block to receive decoded LoRa messages"""

    def __init__(
        self,
        callback,
        shm_monitor_interval=10,  # Check SHM every 60 seconds
        shm_restart_threshold=1000,  # Restart when segments exceed this
    ):
        gr.sync_block.__init__(self, name="lora_message_sink", in_sig=None, out_sig=None)
        self.callback = callback
        self.message_port_register_in(gr.pmt.intern("in"))
        self.set_msg_handler(gr.pmt.intern("in"), self.handle_msg)

    def handle_msg(self, msg):
        """Handle incoming LoRa message"""
        try:
            # The crc_verif block sends payload as a string PMT containing raw bytes
            if gr.pmt.is_symbol(msg) or gr.pmt.is_string(msg):
                # Extract raw bytes from PMT
                # Problem: C++ sends std::string with raw bytes, Python's symbol_to_string() validates UTF-8
                # Solution: Serialize PMT and extract raw bytes from serialized format
                try:
                    # Method 1: Try to serialize the PMT to get raw bytes
                    # PMT serialization format includes the data without UTF-8 validation
                    serialized = pmt.serialize_str(msg)

                    # Debug: log the serialized format to understand the structure
                    logger.debug(
                        f"Serialized PMT length: {len(serialized)}, first 10 bytes: {serialized[:10].hex()}"
                    )

                    # Parse PMT serialization format
                    # Common formats observed:
                    # Type 0x02 (symbol): 1 byte type + 2 bytes length (big-endian) + data
                    # Type 0x70-0x73: 1 byte type + 4 bytes length + data

                    if len(serialized) < 3:
                        raise ValueError(f"Serialized PMT too short: {len(serialized)} bytes")

                    type_tag = serialized[0]

                    if type_tag == 0x02:
                        # Symbol with 2-byte length header
                        if len(serialized) < 3:
                            raise ValueError("Invalid symbol format - too short")
                        length = int.from_bytes(serialized[1:3], byteorder="big")
                        payload = serialized[3 : 3 + length]
                        logger.info(f"LoRa packet decoded: {len(payload)} bytes - {payload!r}")
                        self.callback(payload)
                    elif type_tag in [0x70, 0x71, 0x72, 0x73]:
                        # Symbol with 4-byte length header
                        if len(serialized) < 5:
                            raise ValueError("Invalid symbol format - too short")
                        length = int.from_bytes(serialized[1:5], byteorder="big")
                        payload = serialized[5 : 5 + length]
                        logger.info(f"LoRa packet decoded: {len(payload)} bytes - {payload!r}")
                        self.callback(payload)
                    else:
                        raise ValueError(f"Unknown PMT type tag: 0x{type_tag:02x}")

                except Exception as e:
                    logger.debug(f"Failed to extract using serialize_str: {e}")
                    # Method 2: Try alternative PMT types
                    try:
                        # Try blob extraction
                        if gr.pmt.is_blob(msg):
                            payload = bytes(gr.pmt.blob_data(msg))
                            logger.info(f"LoRa packet decoded: {len(payload)} bytes - {payload!r}")
                            self.callback(payload)
                        # Try u8vector extraction
                        elif gr.pmt.is_u8vector(msg):
                            payload = bytes(gr.pmt.u8vector_elements(msg))
                            logger.info(f"LoRa packet decoded: {len(payload)} bytes - {payload!r}")
                            self.callback(payload)
                        # Try pair (header + payload)
                        elif gr.pmt.is_pair(msg):
                            car = gr.pmt.car(msg)
                            cdr = gr.pmt.cdr(msg)

                            # Try to extract payload from cdr
                            if gr.pmt.is_u8vector(cdr):
                                payload = bytes(gr.pmt.u8vector_elements(cdr))
                                logger.info(
                                    f"LoRa packet decoded: {len(payload)} bytes - {payload!r}"
                                )
                                self.callback(payload)
                            else:
                                logger.debug("Cannot extract payload from pair cdr")
                                return
                        else:
                            logger.warning(
                                f"Unable to extract payload - PMT type cannot be decoded. Serialized (first 50 bytes): {serialized[:50].hex() if 'serialized' in locals() else 'N/A'}"
                            )
                            return
                    except Exception as e2:
                        logger.error(f"Could not extract data from PMT: {e2}")
                        import traceback

                        logger.debug(traceback.format_exc())
                        return
            elif gr.pmt.is_pair(msg):
                # Check if this is a pair with header metadata
                meta = gr.pmt.car(msg)
                data = gr.pmt.cdr(msg)

                if gr.pmt.is_dict(meta):
                    # Extract header info from metadata
                    try:
                        pay_len = gr.pmt.to_long(
                            gr.pmt.dict_ref(meta, gr.pmt.intern("pay_len"), gr.pmt.from_long(0))
                        )
                        has_crc = gr.pmt.to_bool(
                            gr.pmt.dict_ref(meta, gr.pmt.intern("crc"), gr.pmt.PMT_F)
                        )
                        cr = gr.pmt.to_long(
                            gr.pmt.dict_ref(meta, gr.pmt.intern("cr"), gr.pmt.from_long(0))
                        )
                        logger.info(
                            f"LoRa valid header detected: payload_len={pay_len} bytes, CRC={has_crc}, coding_rate=4/{cr+4}"
                        )
                    except Exception:
                        pass

                # Check if data part is payload
                if gr.pmt.is_u8vector(data):
                    payload = bytes(gr.pmt.u8vector_elements(data))
                    logger.info(f"LoRa packet decoded: {len(payload)} bytes - {payload[:50]!r}")
                    self.callback(payload)
                elif gr.pmt.is_symbol(data) or gr.pmt.is_string(data):
                    payload_str = gr.pmt.symbol_to_string(data)
                    payload = payload_str.encode("latin-1")
                    logger.info(f"LoRa packet decoded: {len(payload)} bytes - {payload!r}")
                    self.callback(payload)
            elif gr.pmt.is_u8vector(msg):
                # Direct u8vector (no metadata)
                payload = bytes(gr.pmt.u8vector_elements(msg))
                logger.info(f"LoRa packet decoded: {len(payload)} bytes - {payload[:50]!r}")
                self.callback(payload)
            else:
                logger.debug(f"Unhandled PMT message type: {gr.pmt.write_string(msg)}")
        except Exception as e:
            logger.error(f"Error handling LoRa message: {e}")
            import traceback

            traceback.print_exc()


class LoRaFlowgraph(gr.top_block):
    """GNU Radio flowgraph for LoRa decoding using gr-lora_sdr blocks with batch processing"""

    def __init__(
        self,
        samples,
        sample_rate,
        center_freq,
        callback,
        sf=7,
        bw=125000,
        cr=1,
        has_crc=True,
        impl_head=False,
        sync_word=None,
        preamble_len=8,
        fldro=False,
    ):
        """
        Initialize LoRa decoder flowgraph for batch processing

        Args:
            samples: Complex sample array to process (numpy array)
            sample_rate: Input sample rate (Hz)
            center_freq: Center frequency (Hz)
            callback: Function to call when packet is decoded
            sf: Spreading factor (7-12)
            bw: Bandwidth (125000, 250000, or 500000)
            cr: Coding rate (1-4, corresponding to 4/5 through 4/8)
            has_crc: Whether packets have CRC
            impl_head: Implicit header mode
            preamble_len: Preamble length (default: 8)
            fldro: Low Data Rate Optimization (default: False)
        """
        if not LORA_SDR_AVAILABLE:
            raise RuntimeError("gr-lora_sdr not available - LoRa decoder cannot be initialized")

        super().__init__("LoRa Decoder")

        self.sample_rate = sample_rate
        self.center_freq = center_freq
        self.callback = callback
        self.soft_decoding = False  # Match gr-lora_sdr examples

        # Use GNU Radio's built-in vector source (handles backpressure correctly)
        # repeat=False means it will output all samples once and then signal done
        self.vector_source = blocks.vector_source_c(samples.tolist(), repeat=False)
        self.num_samples = len(samples)  # Store for timing calculation

        # Set sync word: empty list [] for auto-detection, or specific value like [0x12]
        if sync_word is None:
            sync_word = []  # Auto-detect all sync words (empty list = accept all)
        elif isinstance(sync_word, int):
            sync_word = [sync_word]  # Convert single int to list

        # LoRa receiver chain (as per gr-lora_sdr examples)
        # 1. Frame synchronization
        self.frame_sync = lora_sdr.frame_sync(
            center_freq=int(center_freq),
            bandwidth=int(bw),
            sf=int(sf),
            impl_head=impl_head,
            sync_word=sync_word,
            os_factor=int(sample_rate / bw),  # Oversampling factor
            preamble_len=preamble_len,
        )

        # 2. FFT demodulation
        self.fft_demod = lora_sdr.fft_demod(
            soft_decoding=self.soft_decoding,
            max_log_approx=True,
        )

        # 3. Gray mapping
        self.gray_mapping = lora_sdr.gray_mapping(self.soft_decoding)

        # 4. Deinterleaving
        self.deinterleaver = lora_sdr.deinterleaver(self.soft_decoding)

        # 5. Hamming decoder
        self.hamming_dec = lora_sdr.hamming_dec(self.soft_decoding)

        # 6. Header decoder
        # Parameters: (impl_head, cr, pay_len, has_crc, ldro, print_header)
        self.header_decoder = lora_sdr.header_decoder(
            impl_head,  # impl_head: use implicit header mode
            int(cr),  # cr: coding rate
            255,  # pay_len: maximum payload length
            has_crc,  # has_crc: payload has CRC
            fldro,  # ldro: low data rate optimization
            False,  # print_header: disable C++ stdout (we log in Python)
        )

        # 7. Dewhitening
        self.dewhitening = lora_sdr.dewhitening()

        # 8. CRC verification
        # Parameters: (print_rx_msg, output_crc_check)
        # print_rx_msg: 0=NONE, 1=ASCII, 2=HEX - MUST be non-zero to publish messages!
        # output_crc_check: True=only output valid CRC packets, False=output all
        self.crc_verif = lora_sdr.crc_verif(
            0,  # print_rx_msg: 0=NONE (disable C++ stdout, we handle logging in Python)
            False,  # output_crc_check: False=output all packets regardless of CRC
        )

        # Message sink to receive decoded packets
        self.msg_sink = LoRaMessageSink(self._on_packet_decoded)

        # File sink to capture stream output (for debugging)
        import tempfile

        self.temp_file = tempfile.NamedTemporaryFile(delete=False)
        self.file_sink = blocks.file_sink(gr.sizeof_char, self.temp_file.name)
        self.file_sink.set_unbuffered(True)

        # Connect the receiver chain (stream connections)
        self.connect((self.vector_source, 0), (self.frame_sync, 0))
        self.connect((self.frame_sync, 0), (self.fft_demod, 0))
        self.connect((self.fft_demod, 0), (self.gray_mapping, 0))
        self.connect((self.gray_mapping, 0), (self.deinterleaver, 0))
        self.connect((self.deinterleaver, 0), (self.hamming_dec, 0))
        self.connect((self.hamming_dec, 0), (self.header_decoder, 0))
        self.connect((self.header_decoder, 0), (self.dewhitening, 0))
        self.connect((self.dewhitening, 0), (self.crc_verif, 0))
        self.connect((self.crc_verif, 0), (self.file_sink, 0))

        # Connect message ports
        # CRITICAL: header_decoder must send frame_info back to frame_sync!
        # This feedback tells frame_sync the header parameters for payload processing
        self.msg_connect((self.header_decoder, "frame_info"), (self.frame_sync, "frame_info"))

        # Connect crc_verif output messages to our handler
        self.msg_connect((self.crc_verif, "msg"), (self.msg_sink, "in"))

    def process_batch(self):
        """
        Process the batch of samples using start/stop with intelligent timeout.
        Waits for VectorSource to finish or timeout after 3 seconds of processing.
        """
        try:
            # Start the flowgraph in a separate thread
            self.start()

            # Wait for processing to complete
            # For 2.5M samples at 500kS/s = 5 seconds of signal data
            # Real-time processing should take ~5s, add small margin
            processing_time = self.num_samples / self.sample_rate  # Signal duration in seconds
            wait_time = processing_time + 0.5  # Add 500ms margin for processing overhead
            time.sleep(wait_time)

            # Stop the flowgraph
            self.stop()
            self.wait()

            # Give message thread time to deliver any pending messages
            time.sleep(0.1)  # 100ms is sufficient for message delivery

            # Batch processing complete (debug logging removed for cleaner output)
        except Exception as e:
            logger.error(f"Error during flowgraph processing: {e}")
            import traceback

            traceback.print_exc()

    def _on_packet_decoded(self, payload):
        """Called when a LoRa packet is successfully decoded"""
        if self.callback:
            self.callback(payload)


class LoRaDecoder(BaseDecoderProcess):
    """Real-time LoRa decoder using GNU Radio gr-lora_sdr"""

    def __init__(
        self,
        iq_queue,
        data_queue,
        session_id,
        config,  # Pre-resolved DecoderConfig from DecoderConfigService (contains all params + metadata)
        output_dir="data/decoded",
        vfo=None,
        shm_monitor_interval=10,  # Check SHM every 60 seconds
        shm_restart_threshold=1000,  # Restart when segments exceed this
    ):
        if not LORA_SDR_AVAILABLE:
            logger.error("gr-lora_sdr not available - LoRa decoder cannot be initialized")
            raise RuntimeError("gr-lora_sdr not available")

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

        # LoRa-specific attributes
        self.sample_rate = None  # VFO bandwidth sample rate (after decimation)
        self.sdr_sample_rate = None  # Full SDR sample rate
        self.sdr_center_freq = None  # SDR center frequency
        self.decimation_filter = None  # Filter for decimation

        # Signal power measurement (from BaseDecoder)
        self.power_measurements = []
        self.max_power_history = 100
        self.current_power_dbfs = None

        logger.debug(
            f"LoRaDecoder initialized: packet_count=0, SHM threshold={shm_restart_threshold}"
        )

        # Extract LoRa parameters from config with standard defaults for testing
        self.sf = config.sf if config.sf is not None else 7  # Default: SF7
        self.bw = config.bw if config.bw is not None else 125000  # Default: 125 kHz
        self.cr = config.cr if config.cr is not None else 1  # Default: CR 4/5
        # sync_word: Default to match TX example (converts to network ID)
        self.sync_word = config.sync_word if config.sync_word is not None else [8, 16]
        # TinyGS compatibility parameters
        self.preamble_len = (
            config.preamble_len if config.preamble_len is not None else 8
        )  # Default: 8
        self.fldro = config.fldro if config.fldro is not None else False  # Default: False

        # Cached VFO state (populated from IQ messages)
        self.cached_vfo_state = None

        # Track when we complete a decode to reset status on next churn
        self.just_completed_decode = False

        # BaseDecoder required metadata attributes
        self.baudrate = config.baudrate  # Not really used for LoRa, but required by BaseDecoder
        self.framing = "lora"  # LoRa uses its own framing (preamble + header + payload + CRC)
        self.config_source = config.config_source
        self.satellite = config.satellite or {}
        self.transmitter = config.transmitter or {}
        self.norad_id = self.satellite.get("norad_id")
        self.satellite_name = self.satellite.get("name", "")
        self.transmitter_description = self.transmitter.get("description", "")
        self.transmitter_mode = (config.transmitter or {}).get("mode") or "LoRa"
        self.transmitter_downlink_freq = self.transmitter.get("downlink_low")

        # Log debug if downlink frequency not available (not a warning - expected for manual VFO mode)
        if not self.transmitter_downlink_freq:
            logger.debug("Transmitter downlink frequency not available in config (manual VFO mode)")
            logger.debug(f"Config metadata: {config.to_dict()}")

        # Build smart parameter summary - only show non-None optional params
        param_parts = []
        if self.sf is not None:
            param_parts.append(f"SF{self.sf}")
        else:
            param_parts.append("SF=auto")

        if self.bw is not None:
            param_parts.append(f"BW{self.bw/1000:.0f}kHz")
        else:
            param_parts.append("BW=auto")

        if self.cr is not None:
            param_parts.append(f"CR4/{self.cr+4}")
        else:
            param_parts.append("CR=auto")

        if self.sync_word:
            if isinstance(self.sync_word, list):
                sync_hex = "[" + ",".join(f"0x{b:02X}" for b in self.sync_word) + "]"
            else:
                sync_hex = f"0x{self.sync_word:X}"
            param_parts.append(f"sync={sync_hex}")

        params_str = ", ".join(param_parts)

        # Build satellite info (compact format)
        sat_info = f"{self.satellite_name}" if self.satellite_name else "Unknown"
        if self.norad_id:
            sat_info += f" (NORAD {self.norad_id})"

        # Build transmitter info (compact format)
        tx_info = (
            f"TX: {self.transmitter_description}" if self.transmitter_description else "TX: Unknown"
        )
        if self.transmitter_downlink_freq:
            tx_info += f" @ {self.transmitter_downlink_freq/1e6:.3f}MHz"

        # Single consolidated initialization log with all relevant parameters
        logger.info(
            f"LoRa decoder initialized: session={session_id}, VFO {vfo} | {sat_info} | {tx_info} | {params_str} | "
            f"src: {self.config_source}"
        )

        os.makedirs(self.output_dir, exist_ok=True)

        # GNU Radio flowgraph (will be initialized when we know sample rate)
        self.flowgraph = None

    def _get_decoder_type_for_init(self) -> str:
        """Return decoder type for process naming."""
        return "LoRa"

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
        """
        Callback when GNU Radio decodes a LoRa packet.
        Delegates to BaseDecoder's implementation for comprehensive metadata handling.
        """
        # Call BaseDecoder's _on_packet_decoded which handles:
        # - Packet validation
        # - Counting and stats
        # - Telemetry parsing
        # - File saving (binary + JSON metadata)
        # - UI message construction and sending
        # Note: BaseDecoder will log "LORA transmission decoded" which we suppress by not duplicating here
        BaseDecoderProcess._on_packet_decoded(self, payload, callsigns=None)

        # Send status update (LoRa-specific) - no log needed, already logged above
        self._send_status_update(
            DecoderStatus.COMPLETED,
            {"packet_number": self.packet_count, "packet_length": len(payload)},
        )

        # Mark that we just completed a decode so we can reset to LISTENING on next churn
        self.just_completed_decode = True

    def _send_status_update(self, status, info=None):
        """Send status update to UI"""
        # Build decoder configuration info (like other decoders)
        config_info = {
            "spreading_factor": self.sf,
            "bandwidth_hz": self.bw,
            "bandwidth_khz": self.bw / 1000 if self.bw else None,
            "coding_rate": f"4/{self.cr + 4}" if self.cr is not None else None,
            "sync_word": self.sync_word,
            "preamble_len": self.preamble_len,
            "fldro": self.fldro,
            "framing": self.framing,
            "transmitter": self.transmitter_description,
            "transmitter_mode": self.transmitter_mode,
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
            "decoder_type": "lora",
            "decoder_id": self.decoder_id,
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "info": config_info,
        }
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            logger.warning("Data queue full, dropping status update")

    def _send_stats_update(self):
        """Send statistics update to UI and performance monitor"""
        # UI-friendly stats
        ui_stats = {
            "packets_decoded": self.packet_count,
            "spreading_factor": self.sf,  # LoRa uses self.sf, not self.spreading_factor
            "coding_rate": self.cr,  # LoRa uses self.cr, not self.coding_rate
            "bandwidth": self.bw,  # LoRa uses self.bw, not self.bandwidth
        }

        # Full performance stats for monitoring (thread-safe copy)
        with self.stats_lock:
            perf_stats = self.stats.copy()

        msg = {
            "type": "decoder-stats",
            "decoder_type": "lora",
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
        """Main thread loop"""
        # Set process name for visibility in system monitoring tools
        if HAS_SETPROCTITLE:
            setproctitle.setproctitle(f"Ground Station - LoRa Decoder (VFO {self.vfo})")

        # Initialize components in subprocess (CRITICAL!)
        self.telemetry_parser = TelemetryParser()

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
        samples_buffer = np.array([], dtype=np.complex64)
        last_stats_time = time.time()  # Track time for periodic stats updates
        # Buffer enough samples for gr-lora_sdr processing
        # frame_sync needs at least 8200 samples, plus margin for packet length
        # For SF7/125kHz, a packet is ~50-150ms, for SF11/250kHz it can be 200-500ms
        process_interval = 3.0  # Process every 3 seconds (fast response)

        # Flow rate tracking
        last_process_time = time.time()
        # last_process_samples = 0
        buffer_duration = process_interval + 1.0  # Buffer 1s extra for packet boundaries

        # CPU and memory monitoring
        process = psutil.Process()
        last_cpu_check = time.time()
        cpu_check_interval = 0.5  # Update CPU usage every 0.5 seconds

        # Track parameters to avoid unnecessary flowgraph recreation
        current_params = None  # Track (sf, bw, cr) to detect parameter changes

        try:
            while self.running.value == 1:
                # Update CPU and memory usage periodically
                current_time = time.time()
                if current_time - last_cpu_check >= cpu_check_interval:
                    try:
                        cpu_percent = process.cpu_percent()
                        mem_info = process.memory_info()
                        memory_mb = mem_info.rss / (1024 * 1024)
                        memory_percent = process.memory_percent()

                        with self.stats_lock:
                            self.stats["cpu_percent"] = cpu_percent
                            self.stats["memory_mb"] = memory_mb
                            self.stats["memory_percent"] = memory_percent
                        last_cpu_check = current_time
                    except Exception as e:
                        logger.debug(f"Error updating CPU/memory usage: {e}")

                # Read IQ samples from iq_queue
                try:
                    iq_message = self.iq_queue.get(timeout=0.05)  # 50ms timeout

                    # If we just completed a decode, reset status to LISTENING
                    if self.just_completed_decode:
                        self._send_status_update(DecoderStatus.LISTENING)
                        self.just_completed_decode = False

                    # Extract IQ samples and metadata from message
                    samples = iq_message.get("samples")
                    sdr_center = iq_message.get("center_freq")
                    sdr_rate = iq_message.get("sample_rate")

                    if samples is None or len(samples) == 0:
                        continue

                    # Get VFO parameters from IQ message (added by IQBroadcaster)
                    vfo_states = iq_message.get("vfo_states", {})
                    vfo_state_dict = vfo_states.get(self.vfo)

                    if not vfo_state_dict or not vfo_state_dict.get("active", False):
                        continue  # VFO not active, skip

                    # Cache VFO state for metadata purposes
                    self.cached_vfo_state = vfo_state_dict

                    vfo_center = vfo_state_dict.get("center_freq", 0)
                    vfo_bandwidth = vfo_state_dict.get("bandwidth", 10000)

                    # Initialize on first message
                    if self.sdr_sample_rate is None:
                        self.sdr_sample_rate = sdr_rate
                        self.sdr_center_freq = sdr_center

                        # Calculate decimation factor for 4x oversampling of LoRa bandwidth
                        # gr-lora_sdr works best with 4x oversampling
                        # Use a reasonable default bandwidth for initial setup if not specified
                        default_bw = self.bw if self.bw is not None else 250000
                        target_sample_rate = default_bw * 4  # 4x oversampling
                        decimation = int(self.sdr_sample_rate / target_sample_rate)
                        if decimation < 1:
                            decimation = 1
                        self.sample_rate = self.sdr_sample_rate / decimation

                        # Design decimation filter
                        self.decimation_filter = self._design_decimation_filter(
                            decimation, vfo_bandwidth, self.sdr_sample_rate
                        )

                        if self.bw is not None:
                            logger.info(
                                f"LoRa decoder: BW: {self.bw/1e3:.0f}kHz, target rate: {target_sample_rate/1e6:.2f}MS/s (4x oversample), "
                                f"SDR rate: {self.sdr_sample_rate/1e6:.2f} MS/s, VFO BW: {vfo_bandwidth/1e3:.0f} kHz, "
                                f"decimation: {decimation}, output rate: {self.sample_rate/1e6:.2f} MS/s, "
                                f"VFO center: {vfo_center/1e6:.3f} MHz, SDR center: {sdr_center/1e6:.3f} MHz"
                            )
                        else:
                            logger.info(
                                f"LoRa decoder: Using default BW {default_bw/1e3:.0f}kHz for initialization, "
                                f"target rate: {target_sample_rate/1e6:.2f}MS/s (4x oversample), "
                                f"SDR rate: {self.sdr_sample_rate/1e6:.2f} MS/s, VFO BW: {vfo_bandwidth/1e3:.0f} kHz, "
                                f"decimation: {decimation}, output rate: {self.sample_rate/1e6:.2f} MS/s"
                            )

                        # Calculate buffer sizes
                        buffer_samples = int(self.sample_rate * buffer_duration)
                        process_samples = int(self.sample_rate * process_interval)
                        logger.info(
                            f"Will buffer {buffer_samples} samples ({buffer_duration}s) "
                            f"and process every {process_samples} samples ({process_interval}s)"
                        )

                    # Step 1: Frequency translation to VFO center
                    offset_freq = vfo_center - sdr_center
                    translated = self._frequency_translate(
                        samples, offset_freq, self.sdr_sample_rate
                    )

                    # Measure signal power AFTER frequency translation, BEFORE decimation
                    # This gives the most accurate raw signal strength
                    power_dbfs = self._measure_signal_power(translated)
                    self._update_power_measurement(power_dbfs)

                    # Step 2: Decimate to VFO bandwidth
                    decimation = int(self.sdr_sample_rate / vfo_bandwidth)
                    if decimation < 1:
                        decimation = 1
                    decimated = self._decimate_iq(translated, decimation)

                    # Add to buffer
                    samples_buffer = np.concatenate([samples_buffer, decimated])

                    # Update stats
                    with self.stats_lock:
                        self.stats["iq_chunks_in"] += 1
                        self.stats["samples_in"] += len(samples)
                        self.stats["last_activity"] = time.time()

                    # Process when we have enough samples
                    if len(samples_buffer) >= process_samples:
                        # Calculate flow rate
                        current_time = time.time()
                        time_elapsed = current_time - last_process_time
                        samples_count = len(samples_buffer)
                        flow_rate_sps = samples_count / time_elapsed if time_elapsed > 0 else 0

                        # Log batch processing stats (consistent with FSK/BPSK decoders)
                        # Build comprehensive LoRa parameter string
                        sf_str = f"SF{self.sf}" if self.sf is not None else "SF=auto"
                        bw_str = f"BW{self.bw/1000:.0f}kHz" if self.bw is not None else "BW=auto"
                        cr_str = f"CR4/{self.cr+4}" if self.cr is not None else "CR=auto"

                        # Format sync word for compact display
                        if self.sync_word:
                            if isinstance(self.sync_word, list):
                                sync_str = f"sync=[{','.join(f'{b:02X}' for b in self.sync_word)}]"
                            else:
                                sync_str = f"sync={self.sync_word:02X}"
                        else:
                            sync_str = "sync=auto"

                        ldro_str = "LDRO" if self.fldro else ""
                        extra_params = f"pre={self.preamble_len}, {sync_str}"
                        if ldro_str:
                            extra_params += f", {ldro_str}"

                        logger.info(
                            f"Batch: {len(samples_buffer)} samp ({time_elapsed:.1f}s, {flow_rate_sps/1e3:.1f}kS/s) | "
                            f"LoRa: {sf_str}, {bw_str}, {cr_str}, {extra_params} | "
                            f"VFO: {vfo_center:.0f}Hz, BW={vfo_bandwidth:.0f}Hz"
                        )

                        # Update tracking for next batch
                        last_process_time = current_time
                        # last_process_samples = samples_count

                        # Auto-detection logic: try multiple parameters if not specified
                        # If parameters are locked in (either from config or found), only try those
                        if self.packet_count > 0:
                            # After first successful decode, lock to those params
                            sfs_to_try = [self.sf]
                            crs_to_try = [self.cr]
                            bws_to_try = [self.bw]
                        elif self.sf is not None and self.bw is not None and self.cr is not None:
                            # All params specified in config
                            sfs_to_try = [self.sf]
                            crs_to_try = [self.cr]
                            bws_to_try = [self.bw]
                        else:
                            # Auto-detect: try most common params only (SF7, BW125k, CR1)
                            sfs_to_try = [self.sf] if self.sf is not None else [7]
                            crs_to_try = [self.cr] if self.cr is not None else [1]
                            bws_to_try = [self.bw] if self.bw is not None else [125000]

                            if (
                                chunks_received % 30 == 0
                            ):  # Every 30 batches (~90s), log what we're trying
                                logger.info(
                                    f"Auto-detection: trying SF{sfs_to_try[0]}, BW{bws_to_try[0]/1000:.0f}kHz, CR4/{crs_to_try[0]+4}"
                                )

                        # Determine parameters to use
                        sf = sfs_to_try[0]
                        bw = bws_to_try[0]
                        cr = crs_to_try[0]
                        impl_head = False
                        params = (sf, bw, cr, impl_head)

                        # Log parameter changes
                        if current_params is not None and current_params != params:
                            logger.info(
                                f"Parameters changed to SF{sf}, BW{bw/1000:.0f}kHz, CR4/{cr+4}"
                            )
                        current_params = params

                        # Create new flowgraph for this batch
                        flowgraph = LoRaFlowgraph(
                            samples=samples_buffer,
                            sample_rate=self.sample_rate,
                            center_freq=vfo_center,
                            callback=self._on_packet_decoded,
                            sf=sf,
                            bw=bw,
                            cr=cr,
                            sync_word=self.sync_word,
                            impl_head=impl_head,
                            preamble_len=self.preamble_len,
                            fldro=self.fldro,
                        )

                        # Process batch - this blocks until completion, ensuring message delivery
                        flowgraph.process_batch()

                        # Clean up flowgraph
                        del flowgraph

                        # If we decoded a packet, lock in the parameters
                        if self.packet_count > 0:
                            if sf != self.sf or cr != self.cr or bw != self.bw:
                                logger.info(
                                    f"Auto-detected working parameters! SF{sf}, BW{bw/1000:.0f}kHz, CR4/{cr+4}, impl_head={impl_head}"
                                )
                                self.sf = sf
                                self.bw = bw
                                self.cr = cr

                        # Keep overlap for packet boundaries
                        # SF7 packet is ~50-150ms, SF11 can be 200-500ms, so 0.5s is safe
                        if self.sample_rate is not None:
                            overlap_samples = int(self.sample_rate * 0.5)  # 500ms overlap
                            if len(samples_buffer) > overlap_samples:
                                samples_buffer = samples_buffer[-overlap_samples:]
                            else:
                                samples_buffer = np.array([], dtype=np.complex64)
                        else:
                            samples_buffer = np.array([], dtype=np.complex64)

                    chunks_received += 1

                    # Monitor shared memory every 100 chunks
                    if chunks_received % 100 == 0:
                        self._monitor_shared_memory()

                except queue.Empty:
                    pass

                # Send stats periodically based on time (every 1 second) regardless of chunk rate
                current_time = time.time()
                if current_time - last_stats_time >= 1.0:
                    self._send_stats_update()
                    last_stats_time = current_time

        except Exception as e:
            logger.error(f"LoRa decoder error: {e}")
            logger.exception(e)
            self._send_status_update(DecoderStatus.ERROR)
        except KeyboardInterrupt:
            pass
        finally:
            # No persistent flowgraph to clean up - each batch creates/destroys its own
            pass

        logger.info(
            f"LoRa decoder process stopped for {self.session_id}. "
            f"Final SHM segments: {self.get_shm_segment_count()}"
        )

        # stop() method removed - now in BaseDecoderProcess

        # Send final status update
        msg = {
            "type": "decoder-status",
            "status": "closed",
            "decoder_type": "lora",
            "decoder_id": self.decoder_id,
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
        }
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            pass

    # BaseDecoder abstract methods implementation

    def _get_decoder_type(self) -> str:
        """Return decoder type string."""
        return "lora"

    def _get_decoder_specific_metadata(self) -> dict:
        """Return LoRa-specific metadata."""
        return {
            "spreading_factor": self.sf,
            "bandwidth_hz": self.bw,
            "bandwidth_khz": self.bw / 1000 if self.bw else None,
            "coding_rate": f"4/{self.cr + 4}" if self.cr is not None else None,
            "sync_word": self.sync_word,
            "preamble_len": self.preamble_len,
            "fldro": self.fldro,
        }

    def _get_filename_params(self) -> str:
        """Return string for filename parameters."""
        sf_str = f"SF{self.sf}" if self.sf else "SFauto"
        bw_str = f"BW{self.bw//1000}kHz" if self.bw else "BWauto"
        return f"{sf_str}_{bw_str}"

    def _get_parameters_string(self) -> str:
        """Return human-readable parameters string for UI."""
        parts = []
        if self.sf is not None:
            parts.append(f"SF{self.sf}")
        else:
            parts.append("SF:auto")

        if self.bw is not None:
            parts.append(f"BW{self.bw//1000}kHz")
        else:
            parts.append("BW:auto")

        if self.cr is not None:
            parts.append(f"CR4/{self.cr+4}")
        else:
            parts.append("CR:auto")

        return ", ".join(parts)

    def _get_demodulator_params_metadata(self) -> dict:
        """Return demodulator parameters metadata."""
        return {
            "spreading_factor": self.sf,
            "bandwidth_hz": self.bw,
            "coding_rate": self.cr,
            "coding_rate_string": f"4/{self.cr + 4}" if self.cr is not None else None,
            "sync_word": self.sync_word,
            "preamble_len": self.preamble_len,
            "fldro": self.fldro,
        }

    def _get_vfo_state(self):
        """Get cached VFO state for metadata purposes."""
        # Create a simple namespace object from cached dict for backward compatibility
        if self.cached_vfo_state:
            from types import SimpleNamespace

            return SimpleNamespace(**self.cached_vfo_state)
        return None

    def _get_payload_protocol(self) -> str:
        """Return payload protocol for LoRa."""
        return "lora"

    def _get_decoder_config_metadata(self) -> dict:
        """Return comprehensive LoRa decoder configuration metadata."""
        # Format sync word for display
        if self.sync_word:
            if isinstance(self.sync_word, list):
                sync_word_display = "[" + ",".join(f"0x{b:02X}" for b in self.sync_word) + "]"
            else:
                sync_word_display = f"0x{self.sync_word:02X}"
        else:
            sync_word_display = None

        return {
            "source": self.config_source,
            "framing": "lora",
            "payload_protocol": "lora",
            "modulation": "LoRa",
            "spreading_factor": self.sf,
            "bandwidth_hz": self.bw,
            "bandwidth_khz": self.bw / 1000 if self.bw else None,
            "coding_rate": self.cr,
            "coding_rate_string": f"4/{self.cr + 4}" if self.cr is not None else None,
            "sync_word": self.sync_word,
            "sync_word_display": sync_word_display,
            "preamble_length": self.preamble_len,
            "low_data_rate_optimization": self.fldro,
            "has_crc": True,  # Always true for our configuration
            "implicit_header": False,  # Always false for our configuration
        }
