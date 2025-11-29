# Ground Station - SatDump Weather Satellite Decoder
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
# Weather satellite decoder using SatDump
# Supports: NOAA APT/HRPT, Meteor LRPT/HRPT, MetOp, GOES, FengYun, and more
#
# ARCHITECTURE NOTES:
# ==================
# 1. SUBPROCESS MODEL:
#    - Decoder runs as separate process (like FSK decoder)
#    - SatDump runs as subprocess of decoder process
#    - IQ samples written continuously to named pipe (FIFO)
#    - SatDump reads from pipe and processes in real-time
#
# 2. REAL-TIME OUTPUT PARSING:
#    - Separate thread monitors SatDump stdout/stderr
#    - SatDumpOutputParser extracts status, progress, sync, frames, etc.
#    - Status updates sent to UI via data_queue (like FSK decoder)
#
# 3. FILE MONITORING:
#    - Separate thread watches output directory for new images
#    - When SatDump generates .png files, sends notifications to UI
#    - All files saved to backend/data/weather/ with session-based naming
#
# 4. SIGNAL PROCESSING:
#    - Frequency translation (like FSK decoder)
#    - Decimation to pipeline's target sample rate
#    - Continuous writing to named pipe (no batching needed)
#
# 5. CLEANUP:
#    - Named pipe removed on stop
#    - SatDump subprocess terminated gracefully
#    - All resources cleaned up in finally block

import gc
import logging
import queue
import subprocess
import threading
import time
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import psutil
from scipy import signal

# Add setproctitle import for process naming
try:
    import setproctitle

    HAS_SETPROCTITLE = True
except ImportError:
    HAS_SETPROCTITLE = False

from demodulators.basedecoderprocess import BaseDecoderProcess
from demodulators.satdumpparser import SatDumpOutputParser
from vfos.state import VFOManager

logger = logging.getLogger("satdumpweather")


class DecoderStatus(Enum):
    """Decoder status values."""

    IDLE = "idle"
    STARTING = "starting"
    LISTENING = "listening"
    LOCKED = "locked"
    DECODING = "decoding"
    GENERATING = "generating"
    COMPLETED = "completed"
    ERROR = "error"


class SatDumpWeatherDecoder(BaseDecoderProcess):
    """
    Real-time weather satellite decoder using SatDump.

    Supports all major weather satellites via SatDump pipelines:
    - NOAA APT (analog) / HRPT (digital high-res)
    - Meteor-M LRPT / HRPT
    - MetOp AHRPT
    - GOES HRIT
    - FengYun, Himawari, Elektro-L, and more

    Runs as separate process with SatDump as subprocess.
    Streams IQ samples via named pipe, parses real-time output.
    """

    def __init__(
        self,
        iq_queue,
        data_queue,
        session_id,
        config,  # Pre-resolved DecoderConfig with pipeline + target_sample_rate
        output_dir="data/weather",
        vfo=None,
        shm_monitor_interval=60,
        shm_restart_threshold=1000,
    ):
        # Initialize base process
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

        # Extract pipeline configuration
        self.pipeline = config.pipeline
        self.target_sample_rate = config.target_sample_rate

        if not self.pipeline or not self.target_sample_rate:
            raise ValueError(
                "Weather decoder requires 'pipeline' and 'target_sample_rate' in config"
            )

        # Sample rate handling (like FSK decoder)
        self.sample_rate = None  # VFO bandwidth sample rate (after decimation)
        self.sdr_sample_rate = None  # Full SDR sample rate
        self.sdr_center_freq = None  # SDR center frequency
        self.decimation_filter = None  # Filter for decimation

        # Extract satellite metadata
        self.satellite = config.satellite or {}
        self.transmitter = config.transmitter or {}
        self.norad_id = self.satellite.get("norad_id")
        self.satellite_name = self.satellite.get("name") or "Unknown"
        self.transmitter_mode = self.transmitter.get("mode") or "Unknown"
        self.transmitter_downlink_freq = self.transmitter.get("downlink_low")
        self.config_source = config.config_source

        # Output directory structure
        self.output_dir = Path(output_dir)
        self.session_output_dir = self.output_dir / f"{session_id}_{self.pipeline}"
        self.session_output_dir.mkdir(parents=True, exist_ok=True)

        # Named pipe for IQ streaming
        self.pipe_path = self.session_output_dir / f"iq_pipe_{session_id}.fifo"
        self.pipe_fd = None  # File descriptor for pipe

        # SatDump subprocess
        self.satdump_process: Optional[subprocess.Popen] = None
        self.satdump_parser: Optional[SatDumpOutputParser] = None

        # Monitoring threads
        self.output_monitor_thread: Optional[threading.Thread] = None
        self.stdout_monitor_thread: Optional[threading.Thread] = None

        # Track generated images
        self.images_generated = []
        self.known_files = set()

        # Stats (images instead of packets for weather decoder)
        self.image_count = 0

        # Single consolidated initialization log
        sat_info = f"{self.satellite_name}"
        if self.norad_id:
            sat_info += f" (NORAD {self.norad_id})"

        tx_info = f"TX: {self.transmitter_mode}"
        if self.transmitter_downlink_freq:
            tx_info += f" @ {self.transmitter_downlink_freq/1e6:.3f}MHz"

        logger.info(
            f"Weather decoder initialized: session={session_id}, VFO {vfo} | "
            f"{sat_info} | {tx_info} | pipeline={self.pipeline}, "
            f"target_rate={self.target_sample_rate/1e3:.0f}kS/s | src: {self.config_source}"
        )

    def _get_decoder_type_for_init(self) -> str:
        """Return decoder type for process naming."""
        return "Weather"

    def _get_vfo_state(self):
        """Get VFO state for this decoder."""
        if self.vfo is not None:
            return self.vfo_manager.get_vfo_state(self.session_id, self.vfo)
        return None

    def _get_pipeline_bandwidth(self) -> int:
        """Get the required capture bandwidth for the pipeline.

        Returns bandwidth in Hz that should be captured from the SDR.
        This is independent of VFO bandwidth - it's what the signal actually needs.
        """
        pipeline_lower = self.pipeline.lower()

        # APT (NOAA analog) - 40 kHz
        if "apt" in pipeline_lower and "noaa" in pipeline_lower:
            return 40000

        # LRPT (Meteor) - 150 kHz for 72k, 120 kHz for 80k
        if "lrpt" in pipeline_lower:
            return 150000

        # GGAK (Elektro-L, Arktika-M) - 100 kHz for 5 ksym/s BPSK
        if "ggak" in pipeline_lower or "arktika" in pipeline_lower or "elektro" in pipeline_lower:
            return 100000

        # HRPT (high-res polar) - 3 MHz
        if "hrpt" in pipeline_lower:
            return 3000000

        # HRIT/LRIT (geostationary image distribution)
        if "hrit" in pipeline_lower:
            return 2000000
        if "lrit" in pipeline_lower:
            return 1000000

        # Default: use target sample rate as bandwidth
        return int(self.target_sample_rate) if self.target_sample_rate else 0

    def _frequency_translate(self, samples, offset_freq, sample_rate):
        """Translate frequency by offset (shift signal in frequency domain)."""
        if offset_freq == 0:
            return samples

        # Generate complex exponential for frequency shift
        t = np.arange(len(samples)) / sample_rate
        shift = np.exp(-2j * np.pi * offset_freq * t)
        return samples * shift

    def _bandpass_filter(self, samples, bandwidth, sample_rate):
        """Apply bandpass filter to isolate signal within bandwidth.

        Args:
            samples: Complex IQ samples (already frequency-translated to baseband)
            bandwidth: Desired bandwidth in Hz
            sample_rate: Sample rate in Hz

        Returns:
            Filtered samples
        """
        if bandwidth >= sample_rate * 0.9:
            # No filtering needed if bandwidth is close to sample rate
            return samples

        # Design lowpass filter (signal is already at baseband after translation)
        cutoff = bandwidth / 2  # Half bandwidth (Nyquist)
        transition = bandwidth * 0.1  # 10% transition band

        # Calculate number of taps
        numtaps = int(sample_rate / transition) | 1  # Ensure odd
        if numtaps > 1001:
            numtaps = 1001

        # Design FIR lowpass filter
        fir = signal.firwin(numtaps, cutoff, fs=sample_rate)

        # Apply filter
        return signal.lfilter(fir, 1, samples)

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
        if decimation_factor == 1 or self.decimation_filter is None:
            return samples

        # Apply low-pass filter
        filtered = signal.lfilter(self.decimation_filter, 1, samples)
        # Decimate
        return filtered[::decimation_factor]

    def _start_satdump_process(self, actual_samplerate=None):
        """Start SatDump subprocess for real-time processing."""
        # SatDump baseband mode with stdin for continuous streaming
        # Using /dev/stdin allows continuous streaming without FIFO issues
        #
        # Important: --samplerate must match the ACTUAL sample rate we send to stdin
        # If we send SDR rate but tell SatDump a different rate, demodulation will fail
        samplerate_to_use = actual_samplerate if actual_samplerate else self.target_sample_rate

        cmd = [
            "satdump",
            self.pipeline,  # Pipeline name
            "baseband",  # Input level: raw IQ baseband
            "/dev/stdin",  # Input: stdin (we'll pipe data to it)
            str(self.session_output_dir),  # Output directory
            "--samplerate",
            str(int(samplerate_to_use)),  # ACTUAL rate we're sending
            "--baseband_format",
            "cf32",  # Complex float32 (interleaved I/Q)
            "--dc_block",  # Remove DC offset
        ]

        logger.info(f"Starting SatDump: {' '.join(cmd)}")

        try:
            self.satdump_process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,  # Binary mode for IQ samples
                stdout=subprocess.PIPE,  # Binary mode (we'll decode manually)
                stderr=subprocess.STDOUT,  # Merge stderr into stdout
                bufsize=0,  # Unbuffered
            )

            logger.info(f"SatDump process started (PID: {self.satdump_process.pid})")

        except FileNotFoundError:
            logger.error("SatDump binary not found! Install with: sudo apt install satdump")
            raise
        except Exception as e:
            logger.error(f"Failed to start SatDump: {e}")
            raise

    def _monitor_satdump_output(self):
        """Monitor SatDump stdout/stderr and parse in real-time."""
        if not self.satdump_process:
            return

        logger.info("Starting SatDump output monitoring...")

        while self.running.value == 1 and self.satdump_process.poll() is None:
            try:
                # Read stdout line by line (binary mode, decode to text)
                if self.satdump_process.stdout:
                    line_bytes = self.satdump_process.stdout.readline()
                    if line_bytes:
                        line = line_bytes.decode("utf-8", errors="ignore").strip()

                        # Parse the line
                        if self.satdump_parser:
                            parsed = self.satdump_parser.parse_line(line)

                            # If parsed successfully, send update to UI
                            if parsed:
                                self._send_parsed_update(parsed)

            except Exception as e:
                logger.debug(f"Error reading SatDump output: {e}")
                break

        # Log final statistics
        if self.satdump_parser:
            stats = self.satdump_parser.get_statistics()
            logger.info(f"SatDump parser stats: {stats}")

    def _send_parsed_update(self, parsed: Dict[str, Any]):
        """Send parsed SatDump update to UI via data queue."""

        # Send progress updates for progress_deframer and progress_snr
        if parsed["type"] in ["progress_deframer", "progress_snr"]:
            # Extract relevant info
            progress = parsed.get("progress", 0)
            sync_status = (
                parsed.get("sync_status") or parsed.get("deframer_status", "unknown").lower()
            )
            snr_db = parsed.get("snr_db")
            frames = parsed.get("frames", 0)

            msg = {
                "type": "decoder-progress",
                "decoder_type": "weather",
                "session_id": self.session_id,
                "vfo": self.vfo,
                "timestamp": time.time(),
                "progress": progress,
                "info": {
                    "sync_status": sync_status,
                    "snr_db": snr_db,
                    "frames": frames,
                    "deframer_status": parsed.get("deframer_status", "unknown"),
                },
            }

            try:
                self.data_queue.put(msg, block=False)
                with self.stats_lock:
                    self.stats["data_messages_out"] += 1
            except queue.Full:
                pass

        # Send status updates for sync changes and important events
        elif parsed["type"] in ["sync_status", "frame", "product_complete", "image_lines"]:
            msg = {
                "type": "decoder-status",
                "decoder_type": "weather",
                "decoder_id": self.decoder_id,
                "session_id": self.session_id,
                "vfo": self.vfo,
                "timestamp": time.time(),
                "status": parsed.get("status", "decoding"),
                "info": parsed,
            }

            try:
                self.data_queue.put(msg, block=False)
                with self.stats_lock:
                    self.stats["data_messages_out"] += 1
            except queue.Full:
                pass

    def _monitor_output_files(self):
        """Monitor output directory for generated images and products."""
        logger.info("Starting output file monitor...")

        while self.running.value == 1:
            try:
                # Check for new PNG files
                current_files = set(self.session_output_dir.glob("*.png"))
                new_files = current_files - self.known_files

                for file_path in new_files:
                    logger.info(f"New image generated: {file_path.name}")
                    self.image_count += 1
                    self.images_generated.append(str(file_path))

                    # Send notification to UI
                    self._send_image_notification(file_path)

                    self.known_files.add(file_path)

                time.sleep(2.0)  # Check every 2 seconds

            except Exception as e:
                logger.error(f"Error monitoring output files: {e}")

    def _send_image_notification(self, image_path: Path):
        """Send image generation notification to UI."""
        msg = {
            "type": "decoder-output",
            "decoder_type": "weather",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "output": {
                "format": "image/png",
                "filename": image_path.name,
                "filepath": str(image_path),
                "image_type": self._classify_image(image_path.name),
                "image_number": self.image_count,
            },
        }

        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
                self.stats["images_generated"] = self.image_count
        except queue.Full:
            logger.warning("Data queue full, dropping image notification")

    def _classify_image(self, filename: str) -> str:
        """Classify image type from filename."""
        filename_lower = filename.lower()

        # NOAA APT
        if "apt" in filename_lower:
            return "NOAA APT"

        # RGB composites
        if "rgb" in filename_lower or "221" in filename_lower or "321" in filename_lower:
            if "corrected" in filename_lower or "projected" in filename_lower:
                return "RGB Composite (Projected)"
            return "RGB Composite"

        # Individual channels
        if "channel" in filename_lower or "ch" in filename_lower:
            return "Individual Channel"

        # AVHRR
        if "avhrr" in filename_lower:
            return "AVHRR"

        # MSU-MR (Meteor)
        if "msu" in filename_lower:
            return "MSU-MR"

        # GOES
        if "goes" in filename_lower or "abi" in filename_lower:
            return "GOES ABI"

        return "Weather Satellite Image"

    def _send_status_update(self, status: DecoderStatus, info: Optional[Dict] = None):
        """Send status update to UI."""
        config_info = {
            "pipeline": self.pipeline,
            "target_sample_rate": self.target_sample_rate,
            "satellite": self.satellite_name,
            "transmitter": self.transmitter_mode,
            "transmitter_downlink_mhz": (
                round(self.transmitter_downlink_freq / 1e6, 3)
                if self.transmitter_downlink_freq
                else None
            ),
        }

        # Merge with any additional info
        if info:
            config_info.update(info)

        msg = {
            "type": "decoder-status",
            "status": status.value,
            "decoder_type": "weather",
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
            logger.warning("Data queue full, dropping status update")

    def _send_stats_update(self):
        """Send statistics update to UI."""
        ui_stats = {
            "images_generated": self.image_count,
            "pipeline": self.pipeline,
            "target_sample_rate": self.target_sample_rate,
        }

        # Full performance stats
        with self.stats_lock:
            perf_stats = self.stats.copy()

        msg = {
            "type": "decoder-stats",
            "decoder_type": "weather",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "stats": ui_stats,
            "perf_stats": perf_stats,
        }

        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            pass

    def run(self):
        """Main decoder process loop."""
        # Set process name
        if HAS_SETPROCTITLE:
            setproctitle.setproctitle(f"Ground Station - Weather Decoder (VFO {self.vfo})")

        # Initialize components in subprocess
        self.vfo_manager = VFOManager()

        # Initialize stats
        self.stats: Dict[str, Any] = {
            "iq_chunks_in": 0,
            "samples_in": 0,
            "data_messages_out": 0,
            "queue_timeouts": 0,
            "images_generated": 0,
            "last_activity": None,
            "errors": 0,
            "cpu_percent": 0.0,
            "memory_mb": 0.0,
            "memory_percent": 0.0,
        }

        self._send_status_update(DecoderStatus.STARTING)

        chunks_received = 0
        last_stats_time = time.time()

        # CPU and memory monitoring
        process = psutil.Process()
        last_cpu_check = time.time()
        cpu_check_interval = 0.5

        try:
            # Don't start SatDump yet - wait for first IQ chunk to get actual SDR sample rate
            logger.info("Waiting for first IQ chunk to determine SDR sample rate...")
            self._send_status_update(DecoderStatus.LISTENING)

            # Main IQ processing loop
            while self.running.value == 1:
                # Update CPU and memory usage
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
                        logger.debug(f"Error updating CPU/memory: {e}")

                # Read IQ samples from iq_queue
                try:
                    iq_message = self.iq_queue.get(timeout=0.05)

                    # Update stats
                    with self.stats_lock:
                        self.stats["iq_chunks_in"] += 1
                        self.stats["last_activity"] = time.time()

                    # Extract IQ samples and metadata
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
                        continue

                    vfo_center = vfo_state.center_freq
                    vfo_bandwidth = vfo_state.bandwidth

                    # Initialize on first message or if SDR sample rate changed
                    if self.sdr_sample_rate is None or sdr_rate != self.sdr_sample_rate:
                        rate_changed = self.sdr_sample_rate is not None

                        if rate_changed:
                            prev_rate = self.sdr_sample_rate if self.sdr_sample_rate else 0
                            logger.warning(
                                f"SDR sample rate changed from {prev_rate/1e6:.2f} MS/s "
                                f"to {sdr_rate/1e6:.2f} MS/s - restarting SatDump"
                            )
                            # Stop current SatDump process
                            if self.satdump_process:
                                try:
                                    self.satdump_process.terminate()
                                    self.satdump_process.wait(timeout=2.0)
                                except Exception:
                                    pass

                        self.sdr_sample_rate = sdr_rate
                        self.sdr_center_freq = sdr_center
                        self.sample_rate = sdr_rate  # Use actual SDR rate (no decimation)
                        self.decimation_filter = None  # No decimation needed

                        # Start SatDump with ACTUAL SDR sample rate
                        self._start_satdump_process(actual_samplerate=self.sdr_sample_rate)

                        # Initialize parser
                        self.satdump_parser = SatDumpOutputParser(
                            status_callback=lambda update: self._send_parsed_update(update)
                        )

                        # Start monitoring threads
                        self.stdout_monitor_thread = threading.Thread(
                            target=self._monitor_satdump_output, daemon=True
                        )
                        self.stdout_monitor_thread.start()

                        self.output_monitor_thread = threading.Thread(
                            target=self._monitor_output_files, daemon=True
                        )
                        self.output_monitor_thread.start()

                        offset_freq_init = vfo_center - sdr_center
                        pipeline_bw = self._get_pipeline_bandwidth()

                        # Log decoder configuration
                        tx_info = (
                            f", TX={self.transmitter_downlink_freq/1e6:.3f}MHz"
                            if self.transmitter_downlink_freq
                            else ""
                        )
                        logger.info(
                            f"Weather decoder started: session={self.session_id} | "
                            f"pipeline={self.pipeline}, SDR={self.sdr_sample_rate/1e6:.2f}MS/s | "
                            f"SDR@{sdr_center/1e6:.3f}MHz, VFO={vfo_center/1e6:.3f}MHz "
                            f"(ofs={offset_freq_init/1e3:.1f}kHz, VFO_BW={vfo_bandwidth/1e3:.0f}kHz, "
                            f"Pipeline_BW={pipeline_bw/1e3:.0f}kHz){tx_info}"
                        )
                        logger.info(
                            f"SatDump will resample from {self.sdr_sample_rate/1e6:.2f} MS/s internally"
                        )

                    # Frequency translation (shift VFO to baseband)
                    offset_freq = vfo_center - sdr_center
                    translated = self._frequency_translate(
                        samples, offset_freq, self.sdr_sample_rate
                    )

                    # Apply bandpass filter using pipeline bandwidth (not VFO bandwidth)
                    # This ensures we capture the full signal regardless of VFO setting
                    # NOTE: Filtering disabled for now - testing raw signal
                    # pipeline_bw = self._get_pipeline_bandwidth()
                    # filtered = self._bandpass_filter(translated, pipeline_bw, self.sdr_sample_rate)

                    # No decimation - pass SDR rate directly to SatDump
                    # SatDump handles internal resampling to match pipeline requirements

                    # Write to SatDump stdin (continuous streaming)
                    samples_cf32 = translated.astype(np.complex64)
                    try:
                        if self.satdump_process and self.satdump_process.stdin:
                            self.satdump_process.stdin.write(samples_cf32.tobytes())
                            self.satdump_process.stdin.flush()
                    except BrokenPipeError:
                        logger.error("SatDump process closed stdin")
                        break
                    except Exception as e:
                        logger.error(f"Error writing to stdin: {e}")
                        with self.stats_lock:
                            self.stats["errors"] += 1

                    chunks_received += 1

                    # Send periodic status updates
                    if chunks_received % 50 == 0:
                        self._send_status_update(
                            DecoderStatus.DECODING, {"images_generated": self.image_count}
                        )

                except queue.Empty:
                    with self.stats_lock:
                        self.stats["queue_timeouts"] += 1

                # Send stats periodically
                current_time = time.time()
                if current_time - last_stats_time >= 1.0:
                    self._send_stats_update()
                    last_stats_time = current_time

        except Exception as e:
            logger.error(f"Weather decoder error: {e}")
            logger.exception(e)
            with self.stats_lock:
                self.stats["errors"] += 1
            self._send_status_update(DecoderStatus.ERROR)
        except KeyboardInterrupt:
            pass
        finally:
            self._cleanup()

        logger.info(f"Weather decoder process stopped for {self.session_id}")

        # Send final status
        msg = {
            "type": "decoder-status",
            "status": "closed",
            "decoder_type": "weather",
            "decoder_id": self.decoder_id,
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
        }
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            pass

    def _cleanup(self):
        """Clean up resources."""
        logger.info("Cleaning up weather decoder...")

        # Stop monitoring threads
        self.running.value = 0

        # Close SatDump stdin to signal EOF
        if self.satdump_process and self.satdump_process.stdin:
            try:
                self.satdump_process.stdin.close()
                logger.info("Closed SatDump stdin")
            except Exception as e:
                logger.error(f"Error closing stdin: {e}")

        # Terminate SatDump process
        if self.satdump_process:
            try:
                self.satdump_process.terminate()
                self.satdump_process.wait(timeout=5.0)
                logger.info("SatDump process terminated")
            except subprocess.TimeoutExpired:
                self.satdump_process.kill()
                logger.warning("SatDump process killed (timeout)")
            except Exception as e:
                logger.error(f"Error terminating SatDump: {e}")

        # Force garbage collection
        gc.collect()


__all__ = ["SatDumpWeatherDecoder"]
