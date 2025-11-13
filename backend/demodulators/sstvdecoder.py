# Ground Station - SSTV Decoder
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
# Based on reference SSTV decoder implementation from:
# https://github.com/colaclanth/sstv
# Adapted for threaded real-time decoding with audio queue input.

import base64
import io
import logging
import os
import queue
import threading
import time
from enum import Enum

import numpy as np
from PIL import Image
from scipy.signal.windows import hann

logger = logging.getLogger("sstvdecoder")


class DecoderStatus(Enum):
    """Decoder status values."""

    IDLE = "idle"
    LISTENING = "listening"
    CAPTURING = "capturing"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"


class SSTVMode(Enum):
    """SSTV mode definitions matching reference decoder spec.py"""

    SCOTTIE_S1 = {
        "vis_code": 60,
        "name": "Scottie 1",
        "width": 320,
        "height": 256,
        "sync_pulse": 0.009,
        "sync_porch": 0.0015,
        "sep_pulse": 0.0015,
        "scan_time": 0.138240,
        "pixel_time": 0.138240 / 320,
        "chan_count": 3,
        "chan_sync": 2,
        "color_mode": "GBR",
        "window_factor": 3.82,
    }

    # Wraase SC2-180 mode (VIS 55) - similar to Scottie
    WRAASE_SC2_180 = {
        "vis_code": 55,
        "name": "Wraase SC2-180",
        "width": 320,
        "height": 256,
        "sync_pulse": 0.009,
        "sync_porch": 0.0015,
        "sep_pulse": 0.0015,
        "scan_time": 0.235,
        "pixel_time": 0.235 / 320,
        "chan_count": 3,
        "chan_sync": 2,
        "color_mode": "GBR",
        "window_factor": 3.82,
    }

    SCOTTIE_S2 = {
        "vis_code": 56,
        "name": "Scottie 2",
        "width": 320,
        "height": 256,
        "sync_pulse": 0.009,
        "sync_porch": 0.0015,
        "sep_pulse": 0.0015,
        "scan_time": 0.088064,
        "pixel_time": 0.088064 / 320,
        "chan_count": 3,
        "chan_sync": 2,
        "color_mode": "GBR",
        "window_factor": 3.82,
    }

    SCOTTIE_DX = {
        "vis_code": 76,
        "name": "Scottie DX",
        "width": 320,
        "height": 256,
        "sync_pulse": 0.009,
        "sync_porch": 0.0015,
        "sep_pulse": 0.0015,
        "scan_time": 0.345600,
        "pixel_time": 0.345600 / 320,
        "chan_count": 3,
        "chan_sync": 2,
        "color_mode": "GBR",
        "window_factor": 3.82,
    }

    MARTIN_M1 = {
        "vis_code": 44,
        "name": "Martin 1",
        "width": 320,
        "height": 256,
        "sync_pulse": 0.004862,
        "sync_porch": 0.000572,
        "sep_pulse": 0.000572,
        "scan_time": 0.146432,
        "pixel_time": 0.146432 / 320,
        "chan_count": 3,
        "chan_sync": 0,  # Martin syncs on Green
        "color_mode": "GBR",
        "window_factor": 3.82,
    }

    MARTIN_M2 = {
        "vis_code": 40,
        "name": "Martin 2",
        "width": 320,
        "height": 256,
        "sync_pulse": 0.004862,
        "sync_porch": 0.000572,
        "sep_pulse": 0.000572,
        "scan_time": 0.073216,
        "pixel_time": 0.073216 / 320,
        "chan_count": 3,
        "chan_sync": 0,  # Martin syncs on Green
        "color_mode": "GBR",
        "window_factor": 3.82,
    }

    ROBOT_36 = {
        "vis_code": 8,
        "name": "Robot 36",
        "width": 320,
        "height": 240,
        "sync_pulse": 0.009,
        "sync_porch": 0.003,
        "sep_pulse": 0.004500,
        "scan_time": 0.088,
        "pixel_time": 0.088 / 320,
        "chan_count": 3,
        "chan_sync": 0,  # Robot syncs on first channel (Y)
        "color_mode": "YUV",
        "window_factor": 3.82,
    }


# VIS code constants
VIS_BIT_SIZE = 0.030
BREAK_OFFSET = 0.300
LEADER_OFFSET = 0.010 + BREAK_OFFSET
VIS_START_OFFSET = 0.300 + LEADER_OFFSET
HDR_SIZE = 0.030 + VIS_START_OFFSET
HDR_WINDOW_SIZE = 0.010


def calc_lum(freq):
    """Converts SSTV pixel frequency range into 0-255 luminance byte"""
    lum = int(round((freq - 1500) / 3.1372549))
    return min(max(lum, 0), 255)


class SSTVDecoder(threading.Thread):
    """Real-time SSTV decoder thread"""

    def __init__(
        self,
        audio_queue,
        data_queue,
        session_id,
        sample_rate=44100,
        output_dir="data/decoded",
        vfo=None,
    ):
        super().__init__(daemon=True, name=f"SSTVDecoder-{session_id}")
        self.audio_queue = audio_queue
        self.data_queue = data_queue
        self.session_id = session_id
        self.sample_rate = sample_rate
        self.running = True
        self.output_dir = output_dir
        self.audio_buffer = np.array([], dtype=np.float32)
        self.mode = None
        self.status = DecoderStatus.IDLE
        self.vfo = vfo
        os.makedirs(self.output_dir, exist_ok=True)
        logger.info(f"SSTV decoder initialized for session {session_id}, VFO {vfo}")

    def _barycentric_peak_interp(self, bins, x):
        """Interpolate between frequency bins"""
        y1 = bins[x] if x <= 0 else bins[x - 1]
        y3 = bins[x] if x + 1 >= len(bins) else bins[x + 1]
        denom = y3 + bins[x] + y1
        if denom == 0:
            return 0
        return (y3 - y1) / denom + x

    def _peak_fft_freq(self, data):
        """Find peak frequency using FFT"""
        windowed_data = data * hann(len(data))
        fft = np.abs(np.fft.rfft(windowed_data))
        x = np.argmax(fft)
        peak = self._barycentric_peak_interp(fft, x)
        return peak * self.sample_rate / len(windowed_data)

    def _find_header(self):
        """Find SSTV calibration header"""
        header_size = round(HDR_SIZE * self.sample_rate)
        window_size = round(HDR_WINDOW_SIZE * self.sample_rate)

        leader_1_search = window_size
        break_sample = round(BREAK_OFFSET * self.sample_rate)
        break_search = break_sample + window_size
        leader_2_sample = round(LEADER_OFFSET * self.sample_rate)
        leader_2_search = leader_2_sample + window_size
        vis_start_sample = round(VIS_START_OFFSET * self.sample_rate)
        vis_start_search = vis_start_sample + window_size

        jump_size = round(0.002 * self.sample_rate)

        for current_sample in range(0, len(self.audio_buffer) - header_size, jump_size):
            search_end = current_sample + header_size
            search_area = self.audio_buffer[current_sample:search_end]

            leader_1_area = search_area[0:leader_1_search]
            break_area = search_area[break_sample:break_search]
            leader_2_area = search_area[leader_2_sample:leader_2_search]
            vis_start_area = search_area[vis_start_sample:vis_start_search]

            # Stricter frequency checks to reduce false positives
            if (
                abs(self._peak_fft_freq(leader_1_area) - 1900) < 25
                and abs(self._peak_fft_freq(break_area) - 1200) < 25
                and abs(self._peak_fft_freq(leader_2_area) - 1900) < 25
                and abs(self._peak_fft_freq(vis_start_area) - 1200) < 25
            ):
                return current_sample + header_size
        return None

    def _decode_vis(self, vis_start):
        """Decode VIS code"""
        bit_size = round(VIS_BIT_SIZE * self.sample_rate)
        vis_bits = []
        vis_freqs = []

        for bit_idx in range(8):
            bit_offset = vis_start + bit_idx * bit_size
            section = self.audio_buffer[bit_offset : bit_offset + bit_size]
            freq = self._peak_fft_freq(section)
            vis_freqs.append(freq)
            # 1100Hz = logic 1, 1300Hz = logic 0
            # Use 1200Hz as threshold
            vis_bits.append(int(freq < 1200))

        parity = sum(vis_bits) % 2 == 0
        if not parity:
            logger.warning(f"VIS parity error, bits: {vis_bits}")
            # Don't fail on parity - sometimes works anyway
            # return None

        # Decode VIS value (bits 0-6, bit 7 is parity)
        vis_value = 0
        for bit in vis_bits[6::-1]:  # Bits 0-6 in reverse order
            vis_value = (vis_value << 1) | bit

        for mode in SSTVMode:
            if mode.value["vis_code"] == vis_value:
                mode_spec = mode.value
                logger.info(f"Detected: {mode_spec['name']} (VIS: {vis_value})")

                # Send VIS detection info to UI
                self._send_vis_detected(vis_value, mode_spec)
                return mode

        logger.error(f"Unsupported VIS: {vis_value}")
        return None

    def _align_sync(self, align_start, start_of_sync=True):
        """Find sync pulse position"""
        if self.mode is None:
            return None
        sync_window = round(self.mode.value["sync_pulse"] * 1.4 * self.sample_rate)
        align_stop = len(self.audio_buffer) - sync_window

        if align_stop <= align_start:
            return None

        current_sample = align_start
        for current_sample in range(align_start, align_stop):
            section_end = current_sample + sync_window
            search_section = self.audio_buffer[current_sample:section_end]
            if self._peak_fft_freq(search_section) > 1350:
                break

        end_sync = current_sample + (sync_window // 2)

        if start_of_sync:
            return end_sync - round(self.mode.value["sync_pulse"] * self.sample_rate)
        else:
            return end_sync

    def _decode_image_data(self, image_start):
        """Decode image data"""
        if self.mode is None:
            return None
        mode = self.mode.value
        pixel_time = mode["pixel_time"]
        window_factor = mode["window_factor"]
        centre_window_time = (pixel_time * window_factor) / 2
        pixel_window = round(centre_window_time * 2 * self.sample_rate)

        height = mode["height"]
        width = mode["width"]
        channels = mode["chan_count"]
        chan_sync = mode["chan_sync"]

        image_data = [[[0 for i in range(width)] for j in range(channels)] for k in range(height)]

        seq_start = image_start

        # Channel offsets for Scottie
        sync_pulse = mode["sync_pulse"]
        sync_porch = mode["sync_porch"]
        sep_pulse = mode["sep_pulse"]
        scan_time = mode["scan_time"]
        chan_time = sep_pulse + scan_time

        chan_offsets = [
            sync_pulse + sync_porch + chan_time,  # Green (0)
            sync_pulse + sync_porch + 2 * chan_time,  # Blue (1)
            sync_pulse + sync_porch,  # Red (2)
        ]

        for line in range(height):
            # Send progress updates every 5 lines
            if line % 5 == 0:
                self._send_progress_update(line, height, mode["name"])

            for chan in range(channels):
                if chan == chan_sync:
                    # Skip to next line's sync (except for very first sync)
                    if line > 0:
                        line_time = sync_pulse + channels * chan_time
                        seq_start += round(line_time * self.sample_rate)

                    # Always align to sync pulse for every line
                    seq_start = self._align_sync(seq_start)
                    if seq_start is None:
                        logger.info(f"End of audio at line {line}")
                        return image_data

                for px in range(width):
                    chan_offset = chan_offsets[chan]
                    px_pos = round(
                        seq_start
                        + (chan_offset + px * pixel_time - centre_window_time) * self.sample_rate
                    )
                    px_end = px_pos + pixel_window

                    if px_end >= len(self.audio_buffer):
                        logger.info(f"End of audio at line {line}")
                        return image_data

                    pixel_area = self.audio_buffer[px_pos:px_end]
                    freq = self._peak_fft_freq(pixel_area)
                    image_data[line][chan][px] = calc_lum(freq)

        return image_data

    def _draw_image(self, image_data):
        """Render final image"""
        if self.mode is None or image_data is None:
            return None
        mode = self.mode.value
        width = mode["width"]
        height = mode["height"]

        image = Image.new("RGB", (width, height))
        pixel_data = image.load()

        for y in range(height):
            for x in range(width):
                # GBR to RGB
                pixel = (
                    image_data[y][2][x],  # R
                    image_data[y][0][x],  # G
                    image_data[y][1][x],
                )  # B
                pixel_data[x, y] = pixel

        return image

    def _send_status_update(self, status, mode_name=None):
        msg = {
            "type": "decoder-status",
            "status": status.value,
            "mode": mode_name,
            "decoder_type": "sstv",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
        }
        # Set progress to null when returning to listening mode
        if status == DecoderStatus.LISTENING:
            msg["progress"] = None
        logger.info(f"Sending status update: {status.value} (mode: {mode_name})")
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            logger.warning("Data queue full, dropping status update")

    def _send_vis_detected(self, vis_code, mode_spec):
        """Send VIS code detection info to UI"""
        msg = {
            "type": "decoder-vis-detected",
            "decoder_type": "sstv",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "vis_code": vis_code,
            "mode": mode_spec["name"],
            "width": mode_spec["width"],
            "height": mode_spec["height"],
            "scan_time": mode_spec["scan_time"],
        }
        logger.info(f"Sending VIS detection: {mode_spec['name']} (code {vis_code})")
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            logger.warning("Data queue full, dropping VIS detection")

    def _send_progress_update(self, current_line, total_lines, mode_name):
        progress = int((current_line / total_lines) * 100)
        msg = {
            "type": "decoder-progress",
            "progress": progress,
            "current_line": current_line,
            "total_lines": total_lines,
            "mode": mode_name,
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
        }
        logger.info(f"Sending progress update: {progress}% (line {current_line}/{total_lines})")
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            logger.warning("Data queue full, dropping progress update")

    def _send_completed_image(self, image, mode_name):
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"sstv_{mode_name.replace(' ', '_')}_{timestamp}.png"
        filepath = os.path.join(self.output_dir, filename)
        image.save(filepath)
        logger.info(f"Saved: {filepath}")

        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        img_base64 = base64.b64encode(buffer.getvalue()).decode()

        msg = {
            "type": "decoder-output",
            "decoder_type": "sstv",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "output": {
                "format": "image/png",
                "filename": filename,
                "filepath": filepath,
                "image_data": img_base64,
                "mode": mode_name,
                "width": image.width,
                "height": image.height,
            },
        }
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            pass

    def run(self):
        """Main thread loop"""
        logger.info(f"SSTV decoder started for {self.session_id}")
        self._send_status_update(DecoderStatus.LISTENING)

        min_buffer_size = int(self.sample_rate * 1.0)

        # Debug counter
        audio_chunks_received = 0

        processing = False

        try:
            while self.running:
                # Skip audio consumption during processing phase
                if not processing:
                    try:
                        audio_chunk = self.audio_queue.get(timeout=0.1)

                        # Extract audio from dict wrapper if needed
                        if isinstance(audio_chunk, dict):
                            if "audio" in audio_chunk:
                                audio_chunk = audio_chunk["audio"]
                            else:
                                continue

                        # Ensure audio_chunk is a proper 1D array
                        if isinstance(audio_chunk, (int, float)):
                            audio_chunk = np.array([audio_chunk], dtype=np.float32)
                        elif not isinstance(audio_chunk, np.ndarray):
                            audio_chunk = np.array(audio_chunk, dtype=np.float32)
                        elif audio_chunk.ndim == 0:
                            audio_chunk = audio_chunk.reshape(1)

                        self.audio_buffer = np.concatenate([self.audio_buffer, audio_chunk])

                        audio_chunks_received += 1
                        if audio_chunks_received % 500 == 0:
                            logger.debug(
                                f"Received {audio_chunks_received} audio chunks, buffer: {len(self.audio_buffer)} samples"
                            )

                    except queue.Empty:
                        pass

                if len(self.audio_buffer) < min_buffer_size:
                    continue

                # Debug: log buffer status
                if not hasattr(self, "_last_log_time"):
                    self._last_log_time = 0.0
                current_time = time.time()
                if current_time - self._last_log_time > 2.0:
                    if self.mode is None:
                        logger.debug(
                            f"Buffer: {len(self.audio_buffer)} samples ({len(self.audio_buffer)/self.sample_rate:.1f}s), searching for header..."
                        )
                    else:
                        logger.debug(
                            f"Buffer: {len(self.audio_buffer)} samples ({len(self.audio_buffer)/self.sample_rate:.1f}s), waiting for full image..."
                        )
                    self._last_log_time = current_time

                if self.mode is None:
                    header_end = self._find_header()
                    if header_end is None:
                        max_buffer = int(self.sample_rate * 2.0)
                        if len(self.audio_buffer) > max_buffer:
                            self.audio_buffer = self.audio_buffer[-max_buffer:]
                        continue

                    vis_end = header_end + round(VIS_BIT_SIZE * 9 * self.sample_rate)
                    if vis_end > len(self.audio_buffer):
                        continue

                    logger.info("Found SSTV header, decoding VIS...")
                    self.mode = self._decode_vis(header_end)
                    if self.mode is None:
                        self.audio_buffer = self.audio_buffer[vis_end:]
                        continue

                    # Enter CAPTURING phase
                    self._send_status_update(DecoderStatus.CAPTURING, self.mode.value["name"])

                    # Send initial 0% progress
                    mode_spec = self.mode.value
                    self._send_progress_update(0, mode_spec["height"], mode_spec["name"])

                    # Store decode start position
                    self.decode_start_pos = vis_end
                    self.header_found_time = time.time()

                # Mode detected, wait for enough audio to decode image
                if self.mode is not None:
                    mode_spec = self.mode.value

                    # Calculate required buffer size (image duration + margin)
                    # Scottie 2: ~71s, add 5s margin
                    image_duration = mode_spec["height"] * mode_spec["sync_pulse"]
                    image_duration += (
                        mode_spec["height"]
                        * mode_spec["chan_count"]
                        * (mode_spec["sep_pulse"] + mode_spec["scan_time"])
                    )
                    required_samples = round((image_duration + 5.0) * self.sample_rate)

                    if len(self.audio_buffer) - self.decode_start_pos < required_samples:
                        # Check if we've been waiting too long (signal might have ended)
                        if time.time() - self.header_found_time > image_duration + 10.0:
                            logger.warning("Timeout waiting for full image data, decoding partial")
                        else:
                            continue

                    # Enter PROCESSING phase
                    self._send_status_update(DecoderStatus.PROCESSING, mode_spec["name"])
                    processing = True

                    # Now decode the image
                    logger.info(f"Starting image decode, buffer: {len(self.audio_buffer)} samples")
                    image_data = self._decode_image_data(self.decode_start_pos)
                    image = self._draw_image(image_data)

                    self._send_progress_update(
                        mode_spec["height"], mode_spec["height"], mode_spec["name"]
                    )
                    self._send_completed_image(image, mode_spec["name"])

                    # Return to LISTENING for next transmission
                    self.mode = None
                    self.audio_buffer = np.array([], dtype=np.float32)
                    processing = False
                    self._send_status_update(DecoderStatus.LISTENING)

        except Exception as e:
            logger.error(f"SSTV decoder error: {e}")
            logger.exception(e)
            self._send_status_update(DecoderStatus.ERROR)

        logger.info(f"SSTV decoder stopped for {self.session_id}")

    def stop(self):
        self.running = False
        # Send final status update indicating decoder is closing
        msg = {
            "type": "decoder-status",
            "status": "closed",
            "mode": None,
            "decoder_type": "sstv",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "progress": None,
        }
        logger.info("Sending final status update: closed")
        try:
            self.data_queue.put(msg, block=False)
        except queue.Full:
            logger.warning("Data queue full, dropping final status update")
