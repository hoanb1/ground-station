# Copyright (c) 2025 Efstratios Goudelis
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

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger("satdump-parser")


@dataclass
class SatDumpStatus:
    """Current status of SatDump processing."""

    state: (
        str  # 'starting', 'demodulating', 'locked', 'decoding', 'generating_products', 'complete'
    )
    sync_status: str  # 'nosync', 'locked', 'lost'
    snr_db: Optional[float] = None
    frame_count: int = 0
    symbol_count: int = 0
    processing_time: float = 0.0
    vcid_frames: Dict[int, int] = field(default_factory=dict)
    rs_errors_corrected: int = 0
    image_lines: Dict[int, int] = field(default_factory=dict)
    current_product: Optional[str] = None
    products_generated: list = field(default_factory=list)


class SatDumpOutputParser:
    """
    Real-time parser for SatDump output messages.
    Extracts progress, status, and product information from stdout/stderr.
    """

    # Regex patterns for parsing SatDump output
    PATTERNS = {
        # Progress/SNR/Deframer status (new SatDump format)
        # Example: "Progress 50.5%, SNR : 12.5dB, Peak SNR: 15.2dB"
        # Example: "Progress inf%, Deframer : NOSYNC, Frames : 0"
        "progress_snr": re.compile(
            r"Progress\s+([\d.]+|inf)%.*?SNR\s*:\s*([\d.]+|nan)dB.*?(?:Peak SNR:\s*([\d.]+)dB)?",
            re.IGNORECASE,
        ),
        "progress_deframer": re.compile(
            r"Progress\s+([\d.]+|inf)%.*?Deframer\s*:\s*(\w+)(?:.*?Frames\s*:\s*(\d+))?",
            re.IGNORECASE,
        ),
        # Demodulator status (old format, keep for compatibility)
        "symbols": re.compile(
            r"\[.*Demodulator\]\s+Symbols:\s+(\d+)\s+\(([\d.]+)\s*s\)", re.IGNORECASE
        ),
        "nosync": re.compile(r"\[.*Demodulator\].*Nosync", re.IGNORECASE),
        "locked": re.compile(r"\[.*Demodulator\].*Locked.*SNR:\s+([\d.]+)\s*dB", re.IGNORECASE),
        "lost": re.compile(r"\[.*Demodulator\].*Lost", re.IGNORECASE),
        # Decoder status
        "frame": re.compile(r"\[.*Decoder\].*Got frame\s+(\d+)", re.IGNORECASE),
        "frame_sync": re.compile(r"\[.*Decoder\].*Frame sync:\s+([\d.]+)%", re.IGNORECASE),
        "vcid": re.compile(r"\[.*Decoder\].*VCID\s+(\d+):\s+(\d+)\s+frames", re.IGNORECASE),
        "rs_errors": re.compile(
            r"\[.*Decoder\].*Reed-Solomon errors corrected:\s+(\d+)", re.IGNORECASE
        ),
        # Image processing
        "apid": re.compile(r"\[.*Decoder\].*Processing APID\s+(\d+)", re.IGNORECASE),
        "image_lines": re.compile(r"\[.*Decoder\].*Image lines:\s+(\d+)", re.IGNORECASE),
        # Product generation
        "generating": re.compile(r"\[Products\].*Generating\s+(.+?)\.\.\.", re.IGNORECASE),
        "saved": re.compile(r"\[Products\].*Saved:\s+(.+)", re.IGNORECASE),
        "projection": re.compile(r"\[Products\].*Applying\s+(.+?)\s+projection", re.IGNORECASE),
        # General (both old [ERROR] format and new (E) format)
        "info": re.compile(r"(?:\[INFO\]|\(I\))\s+(.+)", re.IGNORECASE),
        "error": re.compile(r"(?:\[ERROR\]|\(E\))\s+(.+)", re.IGNORECASE),
        "critical": re.compile(r"\(C\)\s+(.+)", re.IGNORECASE),
        "warning": re.compile(r"(?:\[WARNING\]|\(W\))\s+(.+)", re.IGNORECASE),
        "debug": re.compile(r"\(D\)\s+(.+)", re.IGNORECASE),
    }

    def __init__(self, status_callback: Optional[Callable] = None):
        """
        Initialize parser.

        Args:
            status_callback: Function to call with status updates (update_dict)
        """
        self.status = SatDumpStatus(state="starting", sync_status="nosync")
        self.status_callback = status_callback

        # Message counters for logging
        self.message_counts = {"total": 0, "parsed": 0, "unknown": 0}

    def parse_line(self, line: str) -> Optional[Dict[str, Any]]:
        """
        Parse a single line of SatDump output.

        Args:
            line: Output line from SatDump

        Returns:
            Dict with parsed information, or None if line not recognized
        """
        line = line.strip()
        if not line:
            return None

        self.message_counts["total"] += 1
        update = None

        # Parse new SatDump progress/status format (check these first)
        if match := self.PATTERNS["progress_snr"].search(line):
            # Progress with SNR (e.g., "Progress 50%, SNR : 12.5dB, Peak SNR: 15.2dB")
            progress_str = match.group(1)
            snr_str = match.group(2)
            peak_snr_str = match.group(3) if match.group(3) else None

            # Sanitize progress (inf or huge numbers -> 0)
            if progress_str == "inf" or (
                progress_str.replace(".", "").isdigit() and float(progress_str) > 100
            ):
                progress = 0.0
            else:
                progress = float(progress_str)

            # Sanitize SNR (nan -> None)
            snr = None if snr_str == "nan" else float(snr_str)
            peak_snr = float(peak_snr_str) if peak_snr_str else None

            if snr is not None:
                self.status.snr_db = snr

            update = {
                "type": "progress_snr",
                "progress": progress,
                "snr_db": snr,
                "peak_snr_db": peak_snr,
            }

            # Update sync status based on SNR
            if snr and snr > 0:
                if self.status.sync_status != "locked":
                    self.status.sync_status = "locked"
                    self.status.state = "decoding"
                    logger.info(f"🔒 SatDump locked! SNR: {snr:.1f} dB")

        elif match := self.PATTERNS["progress_deframer"].search(line):
            # Progress with deframer status (e.g., "Progress inf%, Deframer : NOSYNC" or with "Frames : 0")
            progress_str = match.group(1)
            deframer_status = match.group(2).upper()
            frames_str = match.group(3)
            frames = int(frames_str) if frames_str else None

            # Sanitize progress
            if progress_str == "inf" or (
                progress_str.replace(".", "").isdigit() and float(progress_str) > 100
            ):
                progress = 0.0
            else:
                progress = float(progress_str)

            # Update sync status
            if deframer_status == "NOSYNC":
                self.status.sync_status = "nosync"
            elif deframer_status in ["SYNCED", "LOCKED", "SYNCING"]:
                self.status.sync_status = "locked"
                self.status.state = "decoding"

            if frames is not None:
                self.status.frame_count = frames

            update = {
                "type": "progress_deframer",
                "progress": progress,
                "deframer_status": deframer_status,
                "sync_status": self.status.sync_status,
            }
            if frames is not None:
                update["frames"] = frames

        # Parse old demodulator status format (for compatibility)
        elif match := self.PATTERNS["symbols"].search(line):
            symbols = int(match.group(1))
            proc_time = float(match.group(2))
            self.status.symbol_count = symbols
            self.status.processing_time = proc_time
            self.status.state = "demodulating"
            update = {
                "type": "symbols",
                "symbols": symbols,
                "time": proc_time,
                "symbol_rate": symbols / proc_time if proc_time > 0 else 0,
            }

        elif self.PATTERNS["nosync"].search(line):
            self.status.sync_status = "nosync"
            update = {"type": "sync_status", "status": "nosync"}

        elif match := self.PATTERNS["locked"].search(line):
            snr = float(match.group(1))
            self.status.sync_status = "locked"
            self.status.snr_db = snr
            self.status.state = "decoding"
            update = {"type": "sync_status", "status": "locked", "snr_db": snr}
            logger.info(f"🔒 SatDump locked! SNR: {snr:.1f} dB")

        elif self.PATTERNS["lost"].search(line):
            self.status.sync_status = "lost"
            update = {"type": "sync_status", "status": "lost"}
            logger.warning("⚠️  SatDump lost sync")

        # Parse decoder status
        elif match := self.PATTERNS["frame"].search(line):
            frame_num = int(match.group(1))
            self.status.frame_count = frame_num
            update = {"type": "frame", "frame_number": frame_num}

            # Log every 10th frame
            if frame_num % 10 == 0:
                logger.info(f"📡 Decoded {frame_num} frames")

        elif match := self.PATTERNS["frame_sync"].search(line):
            sync_pct = float(match.group(1))
            update = {"type": "frame_sync", "sync_percent": sync_pct}

        elif match := self.PATTERNS["vcid"].search(line):
            vcid = int(match.group(1))
            frames = int(match.group(2))
            self.status.vcid_frames[vcid] = frames
            update = {"type": "vcid", "vcid": vcid, "frames": frames}

        elif match := self.PATTERNS["rs_errors"].search(line):
            errors = int(match.group(1))
            self.status.rs_errors_corrected += errors
            update = {
                "type": "reed_solomon",
                "errors_corrected": errors,
                "total_errors": self.status.rs_errors_corrected,
            }

        # Parse image processing
        elif match := self.PATTERNS["apid"].search(line):
            apid = int(match.group(1))
            update = {"type": "apid", "apid": apid}
            logger.info(f"🖼️  Processing APID {apid}")

        elif match := self.PATTERNS["image_lines"].search(line):
            lines = int(match.group(1))
            # Track lines per APID (simplified - uses last APID seen)
            self.status.image_lines[0] = lines
            update = {"type": "image_lines", "lines": lines}

            # Log every 50 lines
            if lines % 50 == 0:
                logger.info(f"📷 Image lines: {lines}")

        # Parse product generation
        elif match := self.PATTERNS["generating"].search(line):
            product = match.group(1)
            self.status.current_product = product
            self.status.state = "generating_products"
            update = {"type": "product_start", "product": product}
            logger.info(f"🎨 Generating: {product}")

        elif match := self.PATTERNS["saved"].search(line):
            filename = match.group(1)
            self.status.products_generated.append(filename)
            update = {
                "type": "product_complete",
                "filename": filename,
                "total_products": len(self.status.products_generated),
            }
            logger.info(f"✅ Saved: {filename}")

        elif match := self.PATTERNS["projection"].search(line):
            proj_type = match.group(1)
            update = {"type": "projection", "projection_type": proj_type}
            logger.info(f"🗺️  Applying {proj_type} projection")

        # General messages
        elif match := self.PATTERNS["critical"].search(line):
            message = match.group(1)
            update = {"type": "critical", "message": message}
            logger.error(f"SatDump CRITICAL: {message}")

        elif match := self.PATTERNS["error"].search(line):
            message = match.group(1)
            update = {"type": "error", "message": message}
            logger.error(f"SatDump ERROR: {message}")

        elif match := self.PATTERNS["warning"].search(line):
            message = match.group(1)
            update = {"type": "warning", "message": message}
            logger.warning(f"SatDump WARNING: {message}")

        elif match := self.PATTERNS["info"].search(line):
            message = match.group(1)
            update = {"type": "info", "message": message}
            logger.debug(f"SatDump INFO: {message}")

        elif match := self.PATTERNS["debug"].search(line):
            message = match.group(1)
            update = {"type": "debug", "message": message}
            logger.debug(f"SatDump DEBUG: {message}")

        else:
            # Unknown message format
            self.message_counts["unknown"] += 1
            logger.debug(f"Unparsed SatDump output: {line}")
            return None

        # Track parsed messages
        if update:
            self.message_counts["parsed"] += 1
            update["timestamp"] = datetime.now().isoformat()
            update["status"] = self.get_status_dict()

            # Call status callback if provided
            if self.status_callback:
                self.status_callback(update)

        return update

    def get_status_dict(self) -> Dict[str, Any]:
        """Get current status as dictionary."""
        return {
            "state": self.status.state,
            "sync_status": self.status.sync_status,
            "snr_db": self.status.snr_db,
            "frame_count": self.status.frame_count,
            "symbol_count": self.status.symbol_count,
            "processing_time": self.status.processing_time,
            "vcid_frames": self.status.vcid_frames.copy(),
            "rs_errors_corrected": self.status.rs_errors_corrected,
            "image_lines": self.status.image_lines.copy(),
            "current_product": self.status.current_product,
            "products_generated": self.status.products_generated.copy(),
        }

    def get_statistics(self) -> Dict[str, Any]:
        """Get parser statistics."""
        total = self.message_counts["total"]
        parsed = self.message_counts["parsed"]
        parse_rate = (parsed / total * 100) if total > 0 else 0

        return {
            "total_messages": total,
            "parsed_messages": parsed,
            "unknown_messages": self.message_counts["unknown"],
            "parse_rate_percent": parse_rate,
        }


__all__ = ["SatDumpOutputParser", "SatDumpStatus"]
