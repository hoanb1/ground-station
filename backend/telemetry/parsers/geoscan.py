#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GEOSCAN Telemetry Parser

Parses GEOSCAN beacon payloads (post-deframe, post-PN9, post-CRC) into
engineering units such as voltages and temperatures.

Notes:
- GEOSCAN beacons are fixed-length (commonly 66 or 74 bytes).
- Field layouts differ between satellites; use the PDF/repo tables to
  populate the layouts below. The structure here supports easy updates
  without code changes.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, cast

from ..payloadanalyzers import PayloadAnalyzer


@dataclass(frozen=True)
class Field:
    name: str
    offset: int
    ftype: str  # 'u8','i8','u16','i16','u32','i32'
    scale: float = 1.0
    bias: float = 0.0
    unit: Optional[str] = None


def _decode_int(payload: bytes, offset: int, ftype: str) -> int:
    # All known GEOSCAN payloads are little-endian
    fmt_map = {
        "u8": "<B",
        "i8": "<b",
        "u16": "<H",
        "i16": "<h",
        "u32": "<I",
        "i32": "<i",
    }
    fmt = fmt_map.get(ftype)
    if not fmt:
        raise ValueError(f"Unsupported field type: {ftype}")
    size = struct.calcsize(fmt)
    if offset + size > len(payload):
        raise ValueError(f"Field '{ftype}' at {offset} out of range for payload len {len(payload)}")
    return cast(int, struct.unpack(fmt, payload[offset : offset + size])[0])


class GeoscanParser:
    """
    Layout-driven parser for GEOSCAN payloads.

    Populate LAYOUTS with the official field tables (from the PDF and/or
    the two reference repos). Currently includes placeholders; decoding
    will fall back to generic analysis until layouts are filled in.
    """

    # Layouts can be keyed by (frame_size) or (satellite_name_lower)
    # Use precise per-satellite overrides when available.
    LAYOUTS: Dict[Any, List[Field]] = {
        # Example (placeholders commented out; to be filled from PDF):
        # 66: [
        #     Field(name="vbat_v", offset=0x00, ftype="u16", scale=0.001, unit="V"),
        #     Field(name="eps_temp_c", offset=0x02, ftype="i16", scale=0.1, unit="°C"),
        # ],
        # 74: [
        #     Field(name="vbat_v", offset=0x00, ftype="u16", scale=0.001, unit="V"),
        #     Field(name="board_temp_c", offset=0x02, ftype="i16", scale=0.1, unit="°C"),
        # ],
    }

    def parse(
        self,
        payload: bytes,
        sat_name: Optional[str] = None,
        norad: Optional[int] = None,
        frame_size: Optional[int] = None,
    ) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "format": "geoscan",
            "length": len(payload),
        }

        # Choose layout priority: exact satellite match → frame_size → none
        layout: Optional[List[Field]] = None
        if sat_name:
            key = (sat_name or "").strip().lower()
            layout = self.LAYOUTS.get(key)
        if layout is None and frame_size is not None:
            layout = self.LAYOUTS.get(frame_size)

        if not layout:
            # No layout yet: provide helpful analysis and extract heuristic candidates
            result["warning"] = (
                "GEOSCAN payload layout not defined; showing generic analysis and heuristic "
                "candidates for voltages and temperatures. Populate LAYOUTS for exact values."
            )
            result["analysis"] = PayloadAnalyzer.analyze(payload)
            # Heuristic extraction: look for plausible millivolts and deci-degC in little-endian u16/i16
            candidates: Dict[str, Any] = {"voltages_v": [], "temperatures_c": []}
            # Voltages: u16 in [2500, 25000] mV → report V
            for i in range(0, max(0, len(payload) - 1), 2):
                try:
                    raw_u16 = struct.unpack_from("<H", payload, i)[0]
                    if 2500 <= raw_u16 <= 25000:
                        v = round(raw_u16 / 1000.0, 3)
                        candidates["voltages_v"].append(
                            {"offset": i, "value": v, "raw_mV": raw_u16}
                        )
                except Exception:
                    pass
            # Temperatures: i16 in [-400, 1250] deci-degrees → report °C
            for i in range(0, max(0, len(payload) - 1), 2):
                try:
                    raw_i16 = struct.unpack_from("<h", payload, i)[0]
                    if -400 <= raw_i16 <= 1250:
                        t = round(raw_i16 / 10.0, 1)
                        candidates["temperatures_c"].append(
                            {"offset": i, "value": t, "raw_deciC": raw_i16}
                        )
                except Exception:
                    pass

            # Deduplicate by offset and keep up to a reasonable number to avoid UI clutter
            def _dedup(items: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
                seen = set()
                out: List[Dict[str, Any]] = []
                for it in items:
                    off = it.get("offset")
                    if off in seen:
                        continue
                    seen.add(off)
                    out.append(it)
                    if len(out) >= limit:
                        break
                return out

            candidates["voltages_v"] = _dedup(candidates["voltages_v"], limit=12)
            candidates["temperatures_c"] = _dedup(candidates["temperatures_c"], limit=12)
            result["candidates"] = candidates
            return result

        decoded: Dict[str, Any] = {}
        raw: Dict[str, int] = {}
        for field in layout:
            try:
                ival = _decode_int(payload, field.offset, field.ftype)
                value = ival * field.scale + field.bias
                # Round reasonable engineering values
                if field.unit in ("V", "A"):
                    value = round(value, 3)
                elif field.unit in ("°C", "C"):
                    value = round(value, 1)
                elif field.scale != 1.0 or field.bias != 0.0:
                    value = round(value, 3)
                decoded[field.name] = {"value": value, "unit": field.unit}
                raw[field.name + "_raw"] = ival
            except Exception as e:
                decoded[field.name] = {"error": str(e)}

        result["values"] = decoded
        result["raw_fields"] = raw
        return result
