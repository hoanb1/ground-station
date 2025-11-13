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

try:
    from gnuradio import blocks, gr, lora_sdr

    GNURADIO_AVAILABLE = True
except ImportError:
    GNURADIO_AVAILABLE = False
    gr = None
    blocks = None
    lora_sdr = None

logger = logging.getLogger("loradecoder")


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

    def __init__(self, callback):
        gr.sync_block.__init__(self, name="lora_message_sink", in_sig=None, out_sig=None)
        self.callback = callback
        self.message_port_register_in(gr.pmt.intern("in"))
        self.set_msg_handler(gr.pmt.intern("in"), self.handle_msg)

    def handle_msg(self, msg):
        """Handle incoming LoRa message"""
        try:
            # Extract message data
            if gr.pmt.is_pair(msg):
                # meta = gr.pmt.car(msg)  # Metadata not currently used
                data = gr.pmt.cdr(msg)

                # Convert PMT to bytes
                if gr.pmt.is_u8vector(data):
                    payload = bytes(gr.pmt.u8vector_elements(data))
                    self.callback(payload)
        except Exception as e:
            logger.error(f"Error handling LoRa message: {e}")


class LoRaFlowgraph(gr.top_block):
    """GNU Radio flowgraph for LoRa decoding"""

    def __init__(self, sample_rate, callback, sf=7, bw=125000, cr=1, has_crc=True, impl_head=False):
        """
        Initialize LoRa decoder flowgraph

        Args:
            sample_rate: Input sample rate (Hz)
            callback: Function to call when packet is decoded
            sf: Spreading factor (7-12)
            bw: Bandwidth (125000, 250000, or 500000)
            cr: Coding rate (1-4, corresponding to 4/5 through 4/8)
            has_crc: Whether packets have CRC
            impl_head: Implicit header mode
        """
        gr.top_block.__init__(self, "LoRa Decoder")

        self.sample_rate = sample_rate
        self.callback = callback

        # Create vector source that we'll push samples into
        self.vector_source = blocks.vector_source_c([], repeat=False)

        # LoRa receiver chain
        self.lora_receiver = lora_sdr.lora_sdr_receiver(
            samp_rate=int(sample_rate),
            bw=int(bw),
            sf=int(sf),
            impl_head=impl_head,
            cr=int(cr),
            pay_len=255,
            has_crc=has_crc,
            print_rx=[True, True],  # Enable debug output
        )

        # Message sink to receive decoded packets
        self.msg_sink = LoRaMessageSink(self._on_packet_decoded)

        # Connect blocks
        self.connect((self.vector_source, 0), (self.lora_receiver, 0))
        self.msg_port_connect((self.lora_receiver, "frames"), (self.msg_sink, "in"))

        logger.info(f"LoRa flowgraph initialized: SF{sf}, BW{bw/1000:.0f}kHz, CR4/{cr+4}")

    def push_samples(self, samples):
        """Push new IQ samples into the flowgraph"""
        try:
            # Convert to list for vector source
            sample_list = samples.tolist()
            self.vector_source.set_data(sample_list)
        except Exception as e:
            logger.error(f"Error pushing samples: {e}")

    def _on_packet_decoded(self, payload):
        """Called when a LoRa packet is successfully decoded"""
        if self.callback:
            self.callback(payload)


class LoRaDecoder(threading.Thread):
    """Real-time LoRa decoder using GNU Radio gr-lora_sdr"""

    def __init__(
        self,
        iq_queue,
        data_queue,
        session_id,
        output_dir="data/decoded",
        vfo=None,
        sf=7,
        bw=125000,
        cr=1,
    ):
        super().__init__(daemon=True, name=f"LoRaDecoder-{session_id}")
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

        # LoRa parameters
        self.sf = sf
        self.bw = bw
        self.cr = cr

        os.makedirs(self.output_dir, exist_ok=True)

        # Check if GNU Radio is available
        if not GNURADIO_AVAILABLE:
            logger.error("GNU Radio is not available! Install gr-lora_sdr to use LoRa decoder.")
            self.running = False
            return

        # GNU Radio flowgraph (will be initialized when we know sample rate)
        self.flowgraph = None

        logger.info(f"LoRa decoder initialized for session {session_id}, VFO {vfo}")

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
        """Callback when GNU Radio decodes a LoRa packet"""
        try:
            self.packet_count += 1
            logger.info(f"LoRa packet #{self.packet_count} decoded: {len(payload)} bytes")

            # Save to file
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"lora_SF{self.sf}_BW{self.bw//1000}kHz_{timestamp}_{self.packet_count}.bin"
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
                "decoder_type": "lora",
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
                    "parameters": f"SF{self.sf}_BW{self.bw//1000}kHz_CR4/{self.cr+4}",
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
            "decoder_type": "lora",
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
        if not GNURADIO_AVAILABLE:
            logger.error("Cannot start LoRa decoder: GNU Radio not available")
            return

        logger.info(f"LoRa decoder started for {self.session_id}")
        self._send_status_update(DecoderStatus.LISTENING)

        chunks_received = 0
        samples_buffer = np.array([], dtype=np.complex64)
        batch_size = 8192  # Process samples in batches

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

                        # Calculate decimation factor
                        decimation = int(self.sdr_sample_rate / vfo_bandwidth)
                        if decimation < 1:
                            decimation = 1
                        self.sample_rate = self.sdr_sample_rate / decimation

                        # Design decimation filter
                        self.decimation_filter = self._design_decimation_filter(
                            decimation, vfo_bandwidth, self.sdr_sample_rate
                        )

                        # Initialize GNU Radio flowgraph
                        self.flowgraph = LoRaFlowgraph(
                            sample_rate=self.sample_rate,
                            callback=self._on_packet_decoded,
                            sf=self.sf,
                            bw=self.bw,
                            cr=self.cr,
                        )
                        self.flowgraph.start()

                        logger.info(
                            f"LoRa decoder: SDR rate: {self.sdr_sample_rate/1e6:.2f} MS/s, "
                            f"VFO BW: {vfo_bandwidth/1e3:.0f} kHz, decimation: {decimation}, "
                            f"output rate: {self.sample_rate/1e6:.2f} MS/s"
                        )
                        logger.info(
                            f"VFO center: {vfo_center/1e6:.3f} MHz, SDR center: {sdr_center/1e6:.3f} MHz"
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

                    # Process in batches
                    while len(samples_buffer) >= batch_size and self.flowgraph is not None:
                        batch = samples_buffer[:batch_size]
                        samples_buffer = samples_buffer[batch_size:]

                        # Push samples into GNU Radio flowgraph
                        self.flowgraph.push_samples(batch)

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
            logger.error(f"LoRa decoder error: {e}")
            logger.exception(e)
            self._send_status_update(DecoderStatus.ERROR)
        finally:
            if self.flowgraph:
                self.flowgraph.stop()
                self.flowgraph.wait()

        logger.info(f"LoRa decoder stopped for {self.session_id}")

    def stop(self):
        """Stop the decoder thread"""
        self.running = False
        if self.flowgraph:
            try:
                self.flowgraph.stop()
                self.flowgraph.wait()
            except Exception:
                pass

        # Send final status update
        msg = {
            "type": "decoder-status",
            "status": "closed",
            "decoder_type": "lora",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
        }
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            pass
