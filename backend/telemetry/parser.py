#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generic Telemetry Parser with Pluggable Architecture

Main parser that handles AX.25 framing and delegates payload parsing
to satellite-specific parsers when available.
"""

import logging

from .ax25_parser import AX25Parser
from .payload_analyzers import PayloadAnalyzer

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
        """Initialize parser with registry for satellite-specific parsers"""
        self.ax25_parser = AX25Parser()
        self.payload_parsers = {}  # Registry: callsign_pattern -> parser
        logger.debug("Telemetry parser initialized")

    def register_payload_parser(self, identifier, parser):
        """
        Register a satellite-specific payload parser

        Args:
            identifier: Satellite identifier (callsign pattern or name)
            parser: Parser object with parse(payload_bytes) method
        """
        self.payload_parsers[identifier] = parser
        logger.info(f"Registered payload parser for: {identifier}")

    def parse(self, packet_bytes, parser_hint=None):
        """
        Parse telemetry packet with generic + pluggable approach

        Args:
            packet_bytes: Raw packet bytes (without HDLC flags 0x7E)
            parser_hint: Optional hint for which payload parser to use

        Returns:
            dict with parsed telemetry:
            {
                'parser': 'ax25',
                'frame': { AX.25 header data },
                'telemetry': { payload data },
                'raw': { original bytes }
            }
        """
        result = {
            "parser": "ax25",
            "success": False,
        }

        # Step 1: Parse AX.25 frame (always)
        ax25_result = self.ax25_parser.parse(packet_bytes)

        if not ax25_result.get("success"):
            result["error"] = ax25_result.get("error", "AX.25 parsing failed")
            return result

        result["frame"] = {
            "destination": ax25_result["destination"],
            "source": ax25_result["source"],
            "control": ax25_result["control"],
            "pid": ax25_result["pid"],
            "repeaters": ax25_result.get("repeaters"),
        }

        # Step 2: Try to apply payload parser
        payload = ax25_result["payload"]
        payload_parser = self._select_payload_parser(ax25_result["source"], parser_hint)

        if payload_parser:
            try:
                telemetry_data = payload_parser.parse(payload)
                result["telemetry"] = telemetry_data
                result["parser"] = f"ax25+{payload_parser.__class__.__name__}"
            except Exception as e:
                logger.warning(f"Payload parser failed: {e}, falling back to hex")
                result["telemetry"] = self._fallback_telemetry(payload)
        else:
            # No specific parser, use generic hex representation
            result["telemetry"] = self._fallback_telemetry(payload)

        result["success"] = True
        result["raw"] = {
            "packet_hex": packet_bytes.hex(),
            "payload_hex": payload.hex(),
            "payload_length": len(payload),
        }

        return result

    def _select_payload_parser(self, source_callsign, hint=None):
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
        base_callsign = source_callsign.split("-")[0]  # TVL2-6-1 -> TVL2
        if base_callsign in self.payload_parsers:
            return self.payload_parsers[base_callsign]

        return None

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
