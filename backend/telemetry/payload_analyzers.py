#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Payload Analyzers - Multiple interpretation views for unknown telemetry formats

Provides different views of raw payload data to help reverse engineer formats.
"""

import struct
from typing import Any, Dict, List


class PayloadAnalyzer:
    """Analyze payload bytes with multiple interpretation strategies"""

    @staticmethod
    def analyze(payload: bytes) -> Dict[str, Any]:
        """
        Analyze payload with multiple interpretations

        Returns dict with different views:
        - hex_dump: Structured hex display
        - as_floats: Interpret as float32 sequence
        - as_uint16: Interpret as uint16 sequence
        - as_uint32: Interpret as uint32 sequence
        - probable_fields: Auto-detected field types
        """
        return {
            "hex_dump": PayloadAnalyzer.hex_dump(payload),
            "as_floats": PayloadAnalyzer.as_float32(payload),
            "as_uint16": PayloadAnalyzer.as_uint16(payload),
            "as_uint32": PayloadAnalyzer.as_uint32(payload),
            "probable_fields": PayloadAnalyzer.detect_fields(payload),
        }

    @staticmethod
    def hex_dump(payload: bytes, bytes_per_line: int = 16) -> List[Dict]:
        """
        Generate hex dump with ASCII

        Returns list of lines:
        [{'offset': 0, 'hex': '00 01 02...', 'ascii': '...'}]
        """
        lines = []
        for i in range(0, len(payload), bytes_per_line):
            chunk = payload[i : i + bytes_per_line]
            hex_str = " ".join(f"{b:02x}" for b in chunk)
            ascii_str = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
            lines.append({"offset": i, "hex": hex_str, "ascii": ascii_str})
        return lines

    @staticmethod
    def as_float32(payload: bytes) -> List[Dict]:
        """
        Interpret as little-endian float32 sequence

        Returns list of floats with offsets
        """
        floats = []
        for i in range(0, len(payload) - 3, 4):
            try:
                value = struct.unpack("<f", payload[i : i + 4])[0]
                # Check if it's a reasonable value (not NaN, not huge)
                if abs(value) < 1e6 and not (value != value):  # not NaN
                    floats.append(
                        {
                            "offset": i,
                            "value": round(value, 4),
                            "hex": payload[i : i + 4].hex(),
                            "type": "float32_le",
                        }
                    )
            except Exception:
                pass
        return floats

    @staticmethod
    def as_uint16(payload: bytes) -> List[Dict]:
        """Interpret as little-endian uint16 sequence"""
        values = []
        for i in range(0, len(payload) - 1, 2):
            try:
                value = struct.unpack("<H", payload[i : i + 2])[0]
                values.append(
                    {
                        "offset": i,
                        "value": value,
                        "hex": payload[i : i + 2].hex(),
                        "type": "uint16_le",
                    }
                )
            except Exception:
                pass
        return values

    @staticmethod
    def as_uint32(payload: bytes) -> List[Dict]:
        """Interpret as little-endian uint32 sequence"""
        values = []
        for i in range(0, len(payload) - 3, 4):
            try:
                value = struct.unpack("<I", payload[i : i + 4])[0]
                values.append(
                    {
                        "offset": i,
                        "value": value,
                        "hex": payload[i : i + 4].hex(),
                        "type": "uint32_le",
                    }
                )
            except Exception:
                pass
        return values

    @staticmethod
    def detect_fields(payload: bytes) -> List[Dict]:
        """
        Auto-detect probable field types based on value ranges

        Heuristics:
        - 0-10V range -> voltage
        - -50 to +100°C range -> temperature
        - 0-5A range -> current
        - Very large uint32 -> timestamp
        """
        probable = []

        # Check as floats
        for i in range(0, len(payload) - 3, 4):
            try:
                value = struct.unpack("<f", payload[i : i + 4])[0]
                if abs(value) < 1e6 and not (value != value):
                    field_type = None
                    if 0 < value < 10:
                        field_type = "voltage?"
                    elif -50 < value < 100:
                        field_type = "temperature?"
                    elif 0 < value < 5:
                        field_type = "current?"

                    if field_type:
                        probable.append(
                            {
                                "offset": i,
                                "value": round(value, 4),
                                "type": field_type,
                                "data_type": "float32_le",
                            }
                        )
            except Exception:
                pass

        # Check as uint32 for timestamps
        for i in range(0, len(payload) - 3, 4):
            try:
                value = struct.unpack("<I", payload[i : i + 4])[0]
                # Unix timestamp range (year 2000-2100)
                if 946684800 < value < 4102444800:
                    probable.append(
                        {
                            "offset": i,
                            "value": value,
                            "type": "timestamp?",
                            "data_type": "uint32_le",
                        }
                    )
            except Exception:
                pass

        return probable
