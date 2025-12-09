#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generic Telemetry Parser with Pluggable Architecture (protocol-agnostic)

Now supports multiple link-layer protocols via hints and light auto-detection:
- AX.25 (existing)
- CSP (e.g., AX100)
- CCSDS TM Space Packets (e.g., DOKA)

It delegates payload parsing to satellite/service specific parsers when available.

Comprehensive overview: signal paths, deframers, protocols, and payload parsing
==========================================================================

Legend:
- [RF]     modulation on the air
- [DEMOD]  GNU Radio demodulator (IQ/AF to soft symbols/bytes)
- [DEFR]   GNU Radio deframer/FEC chain (gr-satellites component)
- [PDU]    Higher-layer packet bytes emitted from GNU Radio
- [TP]     This TelemetryParser


FSK-family paths (FSK/GFSK/GMSK) → shared demodulator
-----------------------------------------------------

   [RF]  FSK | GFSK | GMSK
       ↓
   [DEMOD] satellites.components.demodulators.fsk_demodulator (soft symbols)
       ↓
   [DEFR] per framing (selected in backend/demodulators/fskdecoder.py):
       - AX.25      → satellites.components.deframers.ax25_deframer (G3RUH)
       - USP        → satellites.components.deframers.usp_deframer (PLS + Vit + RS + AX.25 crop)
       - GEOSCAN    → satellites.components.deframers.geoscan_deframer (fixed-size frames)
       - DOKA       → satellites.components.deframers.ccsds_concatenated_deframer (CCSDS TM)
       - AX100 ASM  → satellites.components.deframers.ax100_deframer(mode='ASM', scrambler='CCSDS')
       - AX100 RS   → satellites.components.deframers.ax100_deframer(mode='RS')
       ↓
   [PDU] bytes delivered to BaseDecoder → TelemetryParser with protocol_hint:
       - framing ax25/usp     → protocol_hint = 'ax25' (AX.25 header present)
       - framing doka         → protocol_hint = 'ccsds' (CCSDS primary header)
       - framing ax100_*      → protocol_hint = 'csp'   (CSP header)
       - framing geoscan      → protocol_hint = 'proprietary' (no standard header)


BPSK (typical CCSDS concatenated) path
--------------------------------------

   [RF]  BPSK (sometimes QPSK)
       ↓
   [DEMOD] satellites.components.demodulators.bpsk_demodulator (soft symbols)
       ↓
   [DEFR] satellites.components.deframers.ccsds_concatenated_deframer (DOKA/CCSDS)
       ↓
   [PDU] CCSDS TM Space Packet bytes → TelemetryParser with protocol_hint = 'ccsds'


TelemetryParser responsibilities (this module)
----------------------------------------------

1) Protocol choice
   - Prefer `protocol_hint` from the decoder when provided
   - Otherwise, attempt light auto-detection via `_is_ax25`, `_is_csp`, `_is_ccsds`

2) Header parsing
   - AX.25  → parse to extract src/dst callsigns, control, pid, payload
   - CSP    → parse 32-bit header (best-effort v1/v2) to get ports, flags, payload
   - CCSDS  → parse 6-byte primary header to get APID, seq, length, payload
   - Unknown/proprietary → no header parse; payload analyzed generically

3) Payload parsing (optional, pluggable)
   - Registry supports keys by protocol/satellite/service:
       ('ax25', '<CALL>' or None, None)
       ('csp',  '<satellite>' or None, <dport> or None)
       ('ccsds','<satellite>' or None, <apid>  or None)
     Backward-compatible simple keys still work for AX.25 (e.g. 'ISS' or 'TEVEL').

4) Result
   - Always returns a dict with `success`, `parser`, and `raw` fields
   - For AX.25: `frame` contains header fields; `telemetry` contains payload decode or analysis
   - For CSP/CCSDS: `headers` contains parsed header dicts; `telemetry` contains payload decode or analysis

Notes and common expectations
-----------------------------

- USP framing: output PDUs are AX.25 frames (link layer is USP, network layer is AX.25)
- DOKA: describes CCSDS concatenated coding; commonly used with BPSK, but can be carried over FSK-family too
- AX100: outputs CSP frames (AX100 ASM+Golay or RS modes handled by deframer)
- GEOSCAN: fixed-length frames without standard higher-layer headers; falls back to generic payload analysis
"""

import logging
from typing import Any, Dict, Optional, Tuple

from .ax25parser import AX25Parser
from .ccsdsparser import CCSDSParser
from .cspparser import CSPParser
from .payloadanalyzers import PayloadAnalyzer

logger = logging.getLogger("telemetry.parser")


class TelemetryParser:
    """
    Generic telemetry parser with pluggable satellite-specific parsers

    Architecture:
    1. Parse AX.25 frame (always)
    2. Try to apply payload parser (if registered)
    3. Return structured data or fallback to hex dump
    """

    def __init__(self):
        """Initialize parser with registry for satellite-specific parsers

        Registry keys (protocol-aware):
          - ('ax25', 'CALL' or None, None)
          - ('csp', sat_hint or None, dport or None)
          - ('ccsds', sat_hint or None, apid or None)

        Backward compatibility: string keys (callsign base) for AX.25 still work.
        """
        self.ax25_parser = AX25Parser()
        self.csp_parser = CSPParser()
        self.ccsds_parser = CCSDSParser()
        self.payload_parsers: Dict[Any, Any] = {}  # protocol-aware registry
        logger.debug("Telemetry parser initialized (protocol-agnostic)")

    def register_payload_parser(self, identifier, parser):
        """
        Register a satellite-specific payload parser

        Args:
            identifier: Satellite identifier (callsign pattern or name)
            parser: Parser object with parse(payload_bytes) method
        """
        self.payload_parsers[identifier] = parser
        logger.info(f"Registered payload parser for: {identifier}")

    def parse(
        self,
        packet_bytes: bytes,
        protocol_hint: Optional[str] = None,
        sat_hint: Optional[str] = None,
        service_hint: Optional[int] = None,
        parser_hint: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Parse telemetry packet with generic + pluggable approach

        Args:
            packet_bytes: Raw packet bytes (without HDLC flags 0x7E)
            protocol_hint: Optional protocol hint ('ax25','csp','ccsds')
            sat_hint: Optional satellite identifier/name
            service_hint: Optional service id (CSP dport or CCSDS APID)
            parser_hint: Optional legacy payload parser hint

        Returns:
            dict with parsed telemetry:
            {
                'parser': 'ax25',
                'frame': { AX.25 header data },
                'telemetry': { payload data },
                'raw': { original bytes }
            }
        """
        result: Dict[str, Any] = {"parser": None, "success": False}

        # Choose protocol
        protocol = None
        if protocol_hint in ("ax25", "csp", "ccsds"):
            protocol = protocol_hint
        else:
            # Auto-detect in simple order
            if self._is_ax25(packet_bytes):
                protocol = "ax25"
            elif self._is_csp(packet_bytes):
                protocol = "csp"
            elif self._is_ccsds(packet_bytes):
                protocol = "ccsds"
            else:
                protocol = "unknown"

        result["protocol"] = protocol

        if protocol == "ax25":
            ax25_result = self.ax25_parser.parse(packet_bytes)
            if not ax25_result.get("success"):
                result["error"] = ax25_result.get("error", "AX.25 parsing failed")
                return result
            result["parser"] = "ax25"
            result["frame"] = {
                "destination": ax25_result["destination"],
                "source": ax25_result["source"],
                "control": ax25_result["control"],
                "pid": ax25_result["pid"],
                "repeaters": ax25_result.get("repeaters"),
            }
            payload = ax25_result["payload"]
            payload_parser = self._select_payload_parser_ax25(ax25_result["source"], parser_hint)
            if payload_parser:
                try:
                    telemetry_data = payload_parser.parse(payload)
                    result["telemetry"] = telemetry_data
                    result["parser"] = f"ax25+{payload_parser.__class__.__name__}"
                except Exception as e:
                    logger.warning(f"Payload parser failed: {e}, falling back to hex")
                    result["telemetry"] = self._fallback_telemetry(payload)
            else:
                result["telemetry"] = self._fallback_telemetry(payload)
            result["success"] = True
            result["raw"] = {
                "packet_hex": packet_bytes.hex(),
                "payload_hex": payload.hex(),
                "payload_length": len(payload),
            }
            return result

        if protocol == "csp":
            csp = self.csp_parser.parse(packet_bytes)
            if not csp.get("success"):
                result["error"] = csp.get("error", "CSP parsing failed")
                # Fallback to raw payload analyzer
                result["telemetry"] = self._fallback_telemetry(packet_bytes)
                return result
            result["parser"] = "csp"
            result["headers"] = {"csp": csp["headers"]}
            payload = csp["payload"]
            # Try payload parser by protocol/sat/service (dport)
            payload_parser = self._select_payload_parser_protocol(
                protocol="csp",
                sat_hint=sat_hint,
                service_id=csp["headers"].get("dport"),
                legacy_hint=parser_hint,
            )
            if payload_parser:
                try:
                    data = payload_parser.parse(payload)
                    result["telemetry"] = data
                    result["parser"] = f"csp+{payload_parser.__class__.__name__}"
                except Exception as e:
                    logger.warning(f"CSP payload parser failed: {e}, falling back to hex")
                    result["telemetry"] = self._fallback_telemetry(payload)
            else:
                result["telemetry"] = self._fallback_telemetry(payload)
            result["success"] = True
            result["raw"] = {
                "packet_hex": packet_bytes.hex(),
                "payload_hex": payload.hex(),
                "payload_length": len(payload),
            }
            return result

        if protocol == "ccsds":
            ccsds = self.ccsds_parser.parse(packet_bytes)
            if not ccsds.get("success"):
                result["error"] = ccsds.get("error", "CCSDS parsing failed")
                result["telemetry"] = self._fallback_telemetry(packet_bytes)
                return result
            result["parser"] = "ccsds"
            result["headers"] = {"ccsds_primary": ccsds["primary_header"]}
            payload = ccsds["payload"]
            payload_parser = self._select_payload_parser_protocol(
                protocol="ccsds",
                sat_hint=sat_hint,
                service_id=ccsds["primary_header"].get("apid"),
                legacy_hint=parser_hint,
            )
            if payload_parser:
                try:
                    data = payload_parser.parse(payload)
                    result["telemetry"] = data
                    result["parser"] = f"ccsds+{payload_parser.__class__.__name__}"
                except Exception as e:
                    logger.warning(f"CCSDS payload parser failed: {e}, falling back to hex")
                    result["telemetry"] = self._fallback_telemetry(payload)
            else:
                result["telemetry"] = self._fallback_telemetry(payload)
            result["success"] = True
            result["raw"] = {
                "packet_hex": packet_bytes.hex(),
                "payload_hex": payload.hex(),
                "payload_length": len(payload),
            }
            return result

        # Unknown protocol -> raw analysis only
        result["parser"] = "raw"
        result["telemetry"] = self._fallback_telemetry(packet_bytes)
        result["success"] = True
        result["raw"] = {
            "packet_hex": packet_bytes.hex(),
            "payload_hex": packet_bytes.hex(),
            "payload_length": len(packet_bytes),
        }
        return result

    def _select_payload_parser_ax25(self, source_callsign: str, hint: Optional[Any] = None):
        """
        Select appropriate payload parser based on callsign or hint

        Args:
            source_callsign: Source callsign from AX.25 header
            hint: Optional parser hint

        Returns:
            Parser object or None
        """
        # Try hint first
        if hint and hint in self.payload_parsers:
            return self.payload_parsers[hint]

        # Try exact match on callsign
        if source_callsign in self.payload_parsers:
            return self.payload_parsers[source_callsign]

        # Try pattern matching (e.g., TVL2-* for TEVEL satellites)
        base_callsign = source_callsign.split("-")[0]
        if base_callsign in self.payload_parsers:
            return self.payload_parsers[base_callsign]

        return None

    def _select_payload_parser_protocol(
        self,
        protocol: str,
        sat_hint: Optional[str],
        service_id: Optional[int],
        legacy_hint: Optional[Any] = None,
    ):
        # Highest specificity: (protocol, sat_hint, service_id)
        key: Tuple[Any, Any, Any]
        if sat_hint is not None and service_id is not None:
            key = (protocol, sat_hint, service_id)
            if key in self.payload_parsers:
                return self.payload_parsers[key]
        # Next: (protocol, sat_hint, None)
        if sat_hint is not None:
            key = (protocol, sat_hint, None)
            if key in self.payload_parsers:
                return self.payload_parsers[key]
        # Next: (protocol, None, service_id)
        if service_id is not None:
            key = (protocol, None, service_id)
            if key in self.payload_parsers:
                return self.payload_parsers[key]
        # Legacy direct hint
        if legacy_hint and legacy_hint in self.payload_parsers:
            return self.payload_parsers[legacy_hint]
        return None

    def _is_ax25(self, packet: bytes) -> bool:
        # Very light heuristic: minimum addresses + control(0x03) and pid(0xF0) common
        return len(packet) >= 16 and packet[14] in (0x03, 0x13)  # control near typical position

    def _is_csp(self, packet: bytes) -> bool:
        # CSP v2: first 4 bytes header; length field lower 6 bits; sanity check payload length
        if len(packet) < 4:
            return False
        # No strong magic; just accept as possible CSP when total length is reasonable
        return True if len(packet) >= 4 else False

    def _is_ccsds(self, packet: bytes) -> bool:
        # CCSDS primary header is 6 bytes; version bits are 0b000 in most TM packets
        if len(packet) < 6:
            return False
        version = (packet[0] & 0xE0) >> 5
        return version == 0

    def _fallback_telemetry(self, payload):
        """
        Generate generic telemetry representation for unknown formats
        Uses PayloadAnalyzer for multiple interpretation views

        Args:
            payload: Raw payload bytes

        Returns:
            dict with generic representation and analysis
        """
        telemetry = {
            "format": "raw",
            "hex": payload.hex(),
            "length": len(payload),
            "ascii": self._try_ascii(payload),
        }

        # Use PayloadAnalyzer for multiple views
        analysis = PayloadAnalyzer.analyze(payload)
        telemetry["analysis"] = analysis

        return telemetry

    def _try_ascii(self, payload):
        """Try to decode payload as ASCII, replacing invalid chars"""
        try:
            return payload.decode("ascii", errors="replace")
        except Exception:
            return None
