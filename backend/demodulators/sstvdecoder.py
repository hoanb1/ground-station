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
import json
import logging
import os
import queue
import threading
import time
import uuid
from enum import Enum
from typing import Any, Dict

import numpy as np
from PIL import Image
from scipy.signal.windows import hann

from vfos.state import VFOManager

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
        "line_time": 0.009 + 3 * (0.0015 + 0.138240),
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
        "line_time": 0.009 + 3 * (0.0015 + 0.235),
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
        "line_time": 0.009 + 3 * (0.0015 + 0.088064),
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
        "line_time": 0.009 + 3 * (0.0015 + 0.345600),
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
        "line_time": 0.004862 + 0.000572 + 3 * (0.000572 + 0.146432),
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
        "line_time": 0.004862 + 0.000572 + 3 * (0.000572 + 0.073216),
    }

    ROBOT_36 = {
        "vis_code": 8,
        "name": "Robot 36",
        "width": 320,
        "height": 240,
        "sync_pulse": 0.009,
        "sync_porch": 0.003,
        "sep_pulse": 0.004500,
        "sep_porch": 0.001500,
        "scan_time": 0.088,
        "half_scan_time": 0.044,
        "pixel_time": 0.088 / 320,
        "chan_count": 2,
        "chan_sync": 0,  # Robot syncs on first channel (Y)
        "color_mode": "YUV",
        "window_factor": 7.70,
        # LINE_TIME = CHAN_OFFSETS[1] + HALF_SCAN_TIME
        # CHAN_OFFSETS[1] = SYNC_PULSE + SYNC_PORCH + CHAN_TIME + SEP_PORCH
        # CHAN_TIME = SEP_PULSE + SCAN_TIME
        "line_time": 0.009 + 0.003 + (0.004500 + 0.088) + 0.001500 + 0.044,
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
        config=None,  # Pre-resolved DecoderConfig (unused for SSTV, kept for compatibility)
        sample_rate=44100,
        output_dir="data/decoded",
        vfo=None,
    ):
        super().__init__(daemon=True, name=f"SSTVDecoder-{session_id}")

        # Generate unique decoder instance ID for tracking across restarts
        self.decoder_id = str(uuid.uuid4())

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
        self.vfo_manager = VFOManager()  # Access VFO state for squelch/volume
        os.makedirs(self.output_dir, exist_ok=True)

        # Performance monitoring stats
        self.stats: Dict[str, Any] = {
            "audio_chunks_in": 0,
            "audio_samples_in": 0,
            "data_messages_out": 0,
            "queue_timeouts": 0,
            "images_decoded": 0,
            "last_activity": None,
            "errors": 0,
        }
        self.stats_lock = threading.Lock()

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
        color_mode = mode.get("color_mode", "GBR")

        # Robot 36 uses half-resolution chrominance
        is_robot = color_mode == "YUV"
        uv_width = width // 2 if is_robot else width

        # Build image_data structure with proper dimensions for each channel
        if is_robot:
            # Robot 36: Y channel full width, UV channel half width
            image_data = [
                [[0 for i in range(width if j == 0 else uv_width)] for j in range(channels)]
                for k in range(height)
            ]
        else:
            # Martin/Scottie: all channels full width
            image_data = [
                [[0 for i in range(width)] for j in range(channels)] for k in range(height)
            ]

        seq_start = image_start

        # Scottie modes have an initial sync pulse before the image data
        # We need to align to the END of this first sync pulse
        if chan_sync == 2:  # Scottie modes
            seq_start = self._align_sync(image_start, start_of_sync=False)
            if seq_start is None:
                logger.error("Could not find first sync pulse after VIS code")
                seq_start = image_start

        sync_pulse = mode["sync_pulse"]
        sync_porch = mode["sync_porch"]
        sep_pulse = mode["sep_pulse"]
        scan_time = mode["scan_time"]
        chan_time = sep_pulse + scan_time

        # Channel offsets differ between Martin, Scottie, and Robot modes
        if is_robot:  # Robot 36: Y channel, then half-res UV
            # Robot 36 sequence: [Y(full), UV(half)] with sync before Y
            # After Y channel, there's a separator porch before UV
            half_scan_time = mode.get("half_scan_time", scan_time / 2)
            sep_porch = mode.get("sep_porch", 0.0015)
            chan_offsets = [
                sync_pulse + sync_porch,  # Y channel (0)
                sync_pulse + sync_porch + chan_time + sep_porch,  # UV channel (1)
            ]
            # Calculate pixel time for half-resolution UV channel
            uv_pixel_time = half_scan_time / uv_width
            uv_centre_window_time = (uv_pixel_time * window_factor) / 2
            uv_pixel_window = round(uv_centre_window_time * 2 * self.sample_rate)
        elif chan_sync == 0:  # Martin modes: sync on Green (channel 0)
            # Martin sequence: [Green, Blue, Red] with sync before Green
            chan_offsets = [
                sync_pulse + sync_porch,  # Green (0)
                sync_pulse + sync_porch + chan_time,  # Blue (1)
                sync_pulse + sync_porch + 2 * chan_time,  # Red (2)
            ]
        else:  # Scottie modes: sync on Red (channel 2)
            # Scottie sequence: [Green, Blue, Red] with sync before Red
            chan_offsets = [
                sync_pulse + sync_porch + chan_time,  # Green (0)
                sync_pulse + sync_porch + 2 * chan_time,  # Blue (1)
                sync_pulse + sync_porch,  # Red (2)
            ]

        for line in range(height):
            # Send progress updates every 5 lines
            if line % 5 == 0:
                self._send_progress_update(line, height, mode["name"])

            # For Scottie modes on line 0, we need to back up to before the Red channel
            # since sync happens on channel 2 (Red), but Green and Blue come first
            if chan_sync == 2 and line == 0:
                # Back up by the offset to the sync channel plus one scan time
                sync_offset = chan_offsets[chan_sync]
                seq_start -= round((sync_offset + scan_time) * self.sample_rate)

            for chan in range(channels):
                if chan == chan_sync:
                    # Advance to next line and realign to sync pulse
                    if line > 0 or chan > 0:
                        seq_start += round(mode["line_time"] * self.sample_rate)

                    # Align to start of sync pulse
                    seq_start = self._align_sync(seq_start, start_of_sync=True)
                    if seq_start is None:
                        logger.info(f"End of audio at line {line}")
                        return image_data

                # Use appropriate width and timing for this channel
                chan_width = uv_width if (is_robot and chan == 1) else width
                chan_pixel_time = uv_pixel_time if (is_robot and chan == 1) else pixel_time
                chan_centre_window = (
                    uv_centre_window_time if (is_robot and chan == 1) else centre_window_time
                )
                chan_pixel_window = uv_pixel_window if (is_robot and chan == 1) else pixel_window

                for px in range(chan_width):
                    chan_offset = chan_offsets[chan]
                    px_pos = round(
                        seq_start
                        + (chan_offset + px * chan_pixel_time - chan_centre_window)
                        * self.sample_rate
                    )
                    px_end = px_pos + chan_pixel_window

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
        color_mode = mode.get("color_mode", "GBR")

        image = Image.new("RGB", (width, height))
        pixel_data = image.load()

        for y in range(height):
            for x in range(width):
                if color_mode == "YUV":
                    # Robot 36 Y, R-Y, B-Y encoding
                    # Even lines: Y + R-Y chrominance (for Red)
                    # Odd lines: Y + B-Y chrominance (for Blue)
                    # Green is derived from both
                    y_val = image_data[y][0][x]

                    # Interpolate chrominance from half-resolution channel
                    uv_x = x // 2
                    chroma_val = (
                        image_data[y][1][uv_x]
                        if len(image_data[y]) > 1 and uv_x < len(image_data[y][1])
                        else 128
                    )

                    # Robot 36 alternates R-Y and B-Y on consecutive lines
                    # We need to interpolate missing chrominance from adjacent lines
                    if y % 2 == 0:  # Even line has R-Y
                        r_y = chroma_val - 128
                        # Get B-Y from next line (or previous if last line)
                        if (
                            y + 1 < height
                            and len(image_data[y + 1]) > 1
                            and uv_x < len(image_data[y + 1][1])
                        ):
                            b_y = image_data[y + 1][1][uv_x] - 128
                        elif (
                            y > 0
                            and len(image_data[y - 1]) > 1
                            and uv_x < len(image_data[y - 1][1])
                        ):
                            b_y = image_data[y - 1][1][uv_x] - 128
                        else:
                            b_y = 0
                    else:  # Odd line has B-Y
                        b_y = chroma_val - 128
                        # Get R-Y from previous line
                        if (
                            y > 0
                            and len(image_data[y - 1]) > 1
                            and uv_x < len(image_data[y - 1][1])
                        ):
                            r_y = image_data[y - 1][1][uv_x] - 128
                        elif (
                            y + 1 < height
                            and len(image_data[y + 1]) > 1
                            and uv_x < len(image_data[y + 1][1])
                        ):
                            r_y = image_data[y + 1][1][uv_x] - 128
                        else:
                            r_y = 0

                    # Convert Y, R-Y, B-Y to RGB
                    # Robot 36 uses scaled chrominance for more vibrant colors
                    # Standard conversion with typical SSTV gain factor
                    r = int(y_val + 1.6 * r_y)
                    b = int(y_val + 1.6 * b_y)
                    g = int(y_val - 0.51 * 1.6 * r_y - 0.19 * 1.6 * b_y)

                    # Clamp values
                    pixel = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
                else:
                    # GBR to RGB for Martin and Scottie modes
                    pixel = (
                        image_data[y][2][x],  # R
                        image_data[y][0][x],  # G
                        image_data[y][1][x],  # B
                    )
                pixel_data[x, y] = pixel

        return image

    def _send_status_update(self, status, mode_name=None):
        msg = {
            "type": "decoder-status",
            "decoder_id": self.decoder_id,
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
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
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
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            logger.warning("Data queue full, dropping VIS detection")

    def _send_progress_update(self, current_line, total_lines, mode_name):
        progress = int((current_line / total_lines) * 100)
        msg = {
            "type": "decoder-progress",
            "progress": progress,
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "info": {"current_line": current_line, "total_lines": total_lines, "mode": mode_name},
        }
        logger.info(f"Sending progress update: {progress}% (line {current_line}/{total_lines})")
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            logger.warning("Data queue full, dropping progress update")

    def _send_completed_image(self, image, mode_name):
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"sstv_{mode_name.replace(' ', '_')}_{timestamp}.png"
        filepath = os.path.join(self.output_dir, filename)
        image.save(filepath)
        logger.info(f"Saved: {filepath}")

        # Get VFO state for metadata
        vfo_state = None
        if self.vfo is not None:
            vfo_state = self.vfo_manager.get_vfo_state(self.session_id, self.vfo)

        # Build metadata
        decode_timestamp = time.time()
        metadata = {
            "image": {
                "filename": filename,
                "filepath": filepath,
                "format": "image/png",
                "width": image.width,
                "height": image.height,
                "mode": mode_name,
                "timestamp": decode_timestamp,
                "timestamp_iso": time.strftime(
                    "%Y-%m-%dT%H:%M:%S%z", time.localtime(decode_timestamp)
                ),
            },
            "decoder": {
                "type": "sstv",
                "session_id": self.session_id,
                "mode": mode_name,
            },
            "signal": {
                "frequency_hz": vfo_state.center_freq if vfo_state else None,
                "frequency_mhz": vfo_state.center_freq / 1e6 if vfo_state else None,
                "sample_rate_hz": self.sample_rate,
            },
            "vfo": {
                "id": self.vfo,
                "center_freq_hz": vfo_state.center_freq if vfo_state else None,
                "center_freq_mhz": vfo_state.center_freq / 1e6 if vfo_state else None,
                "bandwidth_hz": vfo_state.bandwidth if vfo_state else None,
                "bandwidth_khz": vfo_state.bandwidth / 1e3 if vfo_state else None,
                "active": vfo_state.active if vfo_state else None,
            },
        }

        # Save metadata JSON
        metadata_filename = filename.replace(".png", ".json")
        metadata_filepath = os.path.join(self.output_dir, metadata_filename)
        with open(metadata_filepath, "w") as f:
            json.dump(metadata, f, indent=2)
        logger.info(f"Saved metadata: {metadata_filepath}")

        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        img_base64 = base64.b64encode(buffer.getvalue()).decode()

        msg = {
            "type": "decoder-output",
            "decoder_type": "sstv",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": decode_timestamp,
            "output": {
                "format": "image/png",
                "filename": filename,
                "filepath": filepath,
                "metadata_filename": metadata_filename,
                "metadata_filepath": metadata_filepath,
                "image_data": img_base64,
                "mode": mode_name,
                "width": image.width,
                "height": image.height,
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
        logger.info(f"SSTV decoder started for {self.session_id}")
        self._send_status_update(DecoderStatus.LISTENING)

        min_buffer_size = int(self.sample_rate * 1.0)

        # Debug counter
        audio_chunks_received = 0

        processing = False
        # Separate buffer for audio received during processing (for next decode)
        next_decode_buffer = np.array([], dtype=np.float32)

        try:
            while self.running:

                # ALWAYS consume audio to prevent queue backup and chopped audio
                # During processing, store audio in next_decode_buffer for the next image
                try:
                    audio_chunk = self.audio_queue.get(timeout=0.1)

                    # Update stats
                    with self.stats_lock:
                        self.stats["audio_chunks_in"] += 1
                        self.stats["last_activity"] = time.time()

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

                    # Update sample count
                    with self.stats_lock:
                        self.stats["audio_samples_in"] += len(audio_chunk)

                    # If processing, buffer audio for next decode; otherwise add to main buffer
                    if processing:
                        next_decode_buffer = np.concatenate([next_decode_buffer, audio_chunk])
                        # Limit next_decode_buffer to prevent unbounded growth (keep last 5 seconds)
                        max_next_buffer = int(self.sample_rate * 5.0)
                        if len(next_decode_buffer) > max_next_buffer:
                            next_decode_buffer = next_decode_buffer[-max_next_buffer:]
                    else:
                        self.audio_buffer = np.concatenate([self.audio_buffer, audio_chunk])

                    audio_chunks_received += 1
                    if audio_chunks_received % 500 == 0:
                        logger.debug(
                            f"Received {audio_chunks_received} audio chunks, buffer: {len(self.audio_buffer)} samples"
                        )

                except queue.Empty:
                    with self.stats_lock:
                        self.stats["queue_timeouts"] += 1
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

                    # Update images decoded count
                    with self.stats_lock:
                        self.stats["images_decoded"] += 1

                    # Return to LISTENING for next transmission
                    self.mode = None
                    # Start next decode with audio that arrived during processing
                    self.audio_buffer = next_decode_buffer
                    next_decode_buffer = np.array([], dtype=np.float32)
                    processing = False
                    logger.info(
                        f"Finished processing, starting next decode with {len(self.audio_buffer)} buffered samples"
                    )
                    self._send_status_update(DecoderStatus.LISTENING)

        except Exception as e:
            logger.error(f"SSTV decoder error: {e}")
            logger.exception(e)
            with self.stats_lock:
                self.stats["errors"] += 1
            self._send_status_update(DecoderStatus.ERROR)

        logger.info(f"SSTV decoder stopped for {self.session_id}")

    def stop(self):
        self.running = False
        # Send final status update indicating decoder is closing
        msg = {
            "type": "decoder-status",
            "decoder_id": self.decoder_id,
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
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            logger.warning("Data queue full, dropping final status update")
