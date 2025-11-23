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
from gnuradio import blocks, gr
from scipy import signal

from vfos.state import VFOManager

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

    def __init__(self, callback):
        gr.sync_block.__init__(self, name="lora_message_sink", in_sig=None, out_sig=None)
        self.callback = callback
        self.message_port_register_in(gr.pmt.intern("in"))
        self.set_msg_handler(gr.pmt.intern("in"), self.handle_msg)

    def handle_msg(self, msg):
        """Handle incoming LoRa message"""
        try:
            logger.info(f"LoRaMessageSink received message: type={type(msg)}")

            # Extract message data
            if gr.pmt.is_pair(msg):
                # meta = gr.pmt.car(msg)  # Metadata not currently used
                data = gr.pmt.cdr(msg)

                # Convert PMT to bytes
                if gr.pmt.is_u8vector(data):
                    payload = bytes(gr.pmt.u8vector_elements(data))
                    logger.info(f"LoRa packet decoded: {len(payload)} bytes")
                    self.callback(payload)
                else:
                    logger.warning(f"Message data is not u8vector: {type(data)}")
            else:
                logger.warning(f"Message is not a pair: {msg}")
        except Exception as e:
            logger.error(f"Error handling LoRa message: {e}")
            import traceback

            traceback.print_exc()


class LoRaFlowgraph(gr.top_block):
    """GNU Radio flowgraph for LoRa decoding using gr-lora_sdr blocks"""

    def __init__(
        self,
        sample_rate,
        center_freq,
        callback,
        sf=7,
        bw=125000,
        cr=1,
        has_crc=True,
        impl_head=False,
        sync_word=None,
    ):
        """
        Initialize LoRa decoder flowgraph

        Args:
            sample_rate: Input sample rate (Hz)
            center_freq: Center frequency (Hz)
            callback: Function to call when packet is decoded
            sf: Spreading factor (7-12)
            bw: Bandwidth (125000, 250000, or 500000)
            cr: Coding rate (1-4, corresponding to 4/5 through 4/8)
            has_crc: Whether packets have CRC
            impl_head: Implicit header mode
        """
        if not LORA_SDR_AVAILABLE:
            raise RuntimeError("gr-lora_sdr not available - LoRa decoder cannot be initialized")

        super().__init__("LoRa Decoder")

        self.sample_rate = sample_rate
        self.center_freq = center_freq
        self.callback = callback
        self.soft_decoding = True

        # Create vector source - we'll create new flowgraphs for each batch
        # This is the most reliable approach for batch processing
        self.vector_source = blocks.vector_source_c([], repeat=False)

        # Set sync word: [0, 0] for auto-detection, or specific value
        if sync_word is None:
            sync_word = [0, 0]  # Auto-detect and print all sync words

        # LoRa receiver chain (as per gr-lora_sdr examples)
        # 1. Frame synchronization
        self.frame_sync = lora_sdr.frame_sync(
            center_freq=int(center_freq),
            bandwidth=int(bw),
            sf=int(sf),
            impl_head=impl_head,
            sync_word=sync_word,
            os_factor=int(sample_rate / bw),  # Oversampling factor
            preamble_len=8,  # Standard preamble length
        )

        logger.debug(f"LoRa frame_sync configured with sync_word={sync_word} (0,0=auto-detect)")

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
        self.header_decoder = lora_sdr.header_decoder(
            impl_head=impl_head,
            print_header=True,
            cr=int(cr),
            pay_len=255,  # Maximum payload
            has_crc=has_crc,
            ldro=False,  # Low data rate optimization
        )

        # 7. Dewhitening
        self.dewhitening = lora_sdr.dewhitening()

        # 8. CRC verification
        self.crc_verif = lora_sdr.crc_verif(
            1,  # output_crc_ok (1 = output valid packets only)
            False,  # print_rx_err
        )

        # Message sink to receive decoded packets
        self.msg_sink = LoRaMessageSink(self._on_packet_decoded)

        # Connect the receiver chain
        self.connect((self.vector_source, 0), (self.frame_sync, 0))
        self.connect((self.frame_sync, 0), (self.fft_demod, 0))
        self.connect((self.fft_demod, 0), (self.gray_mapping, 0))
        self.connect((self.gray_mapping, 0), (self.deinterleaver, 0))
        self.connect((self.deinterleaver, 0), (self.hamming_dec, 0))
        self.connect((self.hamming_dec, 0), (self.header_decoder, 0))
        self.connect((self.header_decoder, 0), (self.dewhitening, 0))
        self.connect((self.dewhitening, 0), (self.crc_verif, 0))

        # Connect message port from CRC verif to our message sink
        self.msg_connect((self.crc_verif, "msg"), (self.msg_sink, "in"))

        logger.debug(f"LoRa flowgraph initialized: SF{sf}, BW{bw/1000:.0f}kHz, CR4/{cr+4}")

    def process_batch(self, samples):
        """Process a batch of samples (non-blocking)"""
        try:
            # Chunk large sample sets to avoid vector_source limitations
            # GNU Radio's vector_source has internal buffer limits
            chunk_size = 8192 * 100  # Process in chunks of ~800k samples

            for i in range(0, len(samples), chunk_size):
                chunk = samples[i : i + chunk_size]

                # Set the data for this chunk
                self.vector_source.set_data(chunk.tolist())

                # Start the flowgraph
                self.start()

                # Wait for processing with very short timeout
                time.sleep(0.1)  # 100ms per chunk

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
        sf=11,  # Meshtastic LONG_FAST default
        bw=250000,  # Meshtastic LONG_FAST default
        cr=1,  # Coding rate 4/5 - will auto-detect
        sync_word=None,  # Auto-detect by default
    ):
        if not LORA_SDR_AVAILABLE:
            logger.error("gr-lora_sdr not available - LoRa decoder cannot be initialized")
            raise RuntimeError("gr-lora_sdr not available")

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
        # sync_word: None = auto-detect [0, 0], or specific like [0x12]
        self.sync_word = sync_word if sync_word is not None else [0, 0]

        os.makedirs(self.output_dir, exist_ok=True)

        # GNU Radio flowgraph (will be initialized when we know sample rate)
        self.flowgraph = None

        logger.info(f"LoRa decoder initialized for session {session_id}, VFO {vfo}")
        logger.info(
            f"LoRa parameters: SF{sf}, BW{bw/1000:.0f}kHz, CR4/{cr+4}, sync_word={self.sync_word}"
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
        logger.info(f"LoRa decoder started for {self.session_id}")
        self._send_status_update(DecoderStatus.LISTENING)

        chunks_received = 0
        samples_buffer = np.array([], dtype=np.complex64)
        # Buffer enough samples for gr-lora_sdr processing
        # frame_sync needs at least 8200 samples, plus margin for packet length
        # For SF11/250kHz, a packet can be 200-500ms
        buffer_duration = 2.0  # seconds - longer buffer for larger SF
        process_interval = 1.0  # Process every 1 second (more samples per batch)

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

                        # Calculate decimation factor for 4x oversampling of LoRa bandwidth
                        # gr-lora_sdr works best with 4x oversampling
                        target_sample_rate = self.bw * 4  # 4x oversampling
                        decimation = int(self.sdr_sample_rate / target_sample_rate)
                        if decimation < 1:
                            decimation = 1
                        self.sample_rate = self.sdr_sample_rate / decimation

                        # Design decimation filter
                        self.decimation_filter = self._design_decimation_filter(
                            decimation, vfo_bandwidth, self.sdr_sample_rate
                        )

                        logger.info(
                            f"LoRa decoder: BW: {self.bw/1e3:.0f}kHz, target rate: {target_sample_rate/1e6:.2f}MS/s (4x oversample), "
                            f"SDR rate: {self.sdr_sample_rate/1e6:.2f} MS/s, VFO BW: {vfo_bandwidth/1e3:.0f} kHz, "
                            f"decimation: {decimation}, output rate: {self.sample_rate/1e6:.2f} MS/s, "
                            f"VFO center: {vfo_center/1e6:.3f} MHz, SDR center: {sdr_center/1e6:.3f} MHz"
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

                    # Step 2: Decimate to VFO bandwidth
                    decimation = int(self.sdr_sample_rate / vfo_bandwidth)
                    if decimation < 1:
                        decimation = 1
                    decimated = self._decimate_iq(translated, decimation)

                    # Add to buffer
                    samples_buffer = np.concatenate([samples_buffer, decimated])

                    # Process when we have enough samples
                    if len(samples_buffer) >= process_samples:
                        # Process the buffered samples (only log every 20th time to reduce spam)
                        if chunks_received % 20 == 0:
                            logger.debug(
                                f"Processing {len(samples_buffer)} samples (SF{self.sf}, BW{self.bw/1000:.0f}kHz)"
                            )

                        # Try multiple spreading factors if we haven't decoded anything yet
                        # This helps with auto-detection
                        sfs_to_try = [self.sf]  # Start with configured SF
                        if self.packet_count == 0 and chunks_received % 10 == 0:
                            # Every 10 chunks (~5s), also try other common SFs
                            sfs_to_try = [7, 8, 9, 10, 11, 12]
                            logger.info(f"No packets decoded yet, trying all SFs: {sfs_to_try}")

                        for sf in sfs_to_try:
                            # Try different coding rates too
                            crs_to_try = [self.cr]  # Start with configured CR
                            if self.packet_count == 0 and len(sfs_to_try) > 1:
                                # Try all common CRs
                                crs_to_try = [1, 2, 3, 4]  # 4/5, 4/6, 4/7, 4/8

                            for cr in crs_to_try:
                                # Try both explicit and implicit header modes
                                impl_head_modes = [False]  # Start with explicit (standard)
                                if self.packet_count == 0 and len(sfs_to_try) > 1:
                                    # If trying multiple SFs, also try implicit header
                                    impl_head_modes = [False, True]

                                for impl_head in impl_head_modes:
                                    # Create a new flowgraph for this batch
                                    flowgraph = LoRaFlowgraph(
                                        sample_rate=self.sample_rate,
                                        center_freq=vfo_center,
                                        callback=self._on_packet_decoded,
                                        sf=sf,
                                        bw=self.bw,
                                        cr=cr,
                                        sync_word=self.sync_word,
                                        impl_head=impl_head,
                                    )

                                    # Process batch (blocking)
                                    flowgraph.process_batch(samples_buffer)

                                    # Cleanup
                                    del flowgraph

                                    # If we decoded a packet, update our parameters
                                    if self.packet_count > 0:
                                        if sf != self.sf or cr != self.cr:
                                            logger.info(
                                                f"Found working parameters! SF{sf}, CR4/{cr+4}, impl_head={impl_head}"
                                            )
                                            self.sf = sf
                                            self.cr = cr
                                        break

                                if self.packet_count > 0:
                                    break  # Exit impl_head loop

                            if self.packet_count > 0:
                                break  # Exit SF loop if we decoded something

                        # Keep overlap for packet boundaries (last 0.5s)
                        if self.sample_rate is not None:
                            overlap_samples = int(self.sample_rate * 0.5)
                            if len(samples_buffer) > overlap_samples:
                                samples_buffer = samples_buffer[-overlap_samples:]
                            else:
                                samples_buffer = np.array([], dtype=np.complex64)
                        else:
                            samples_buffer = np.array([], dtype=np.complex64)

                    chunks_received += 1
                    if chunks_received % 100 == 0:
                        pass  # Periodic stats update without logging

                except queue.Empty:
                    pass

        except Exception as e:
            logger.error(f"LoRa decoder error: {e}")
            logger.exception(e)
            self._send_status_update(DecoderStatus.ERROR)
        except KeyboardInterrupt:
            pass

        logger.info(f"LoRa decoder stopped for {self.session_id}")

    def stop(self):
        """Stop the decoder thread"""
        self.running = False

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
