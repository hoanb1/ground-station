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


from dataclasses import dataclass
from typing import Optional


@dataclass
class DecoderConfig:
    """
    Resolved decoder configuration with all parameters determined.

    This is the result of parameter resolution from multiple sources:
    - Satellite-specific configuration (gr-satellites database)
    - Transmitter metadata (SatNOGS DB)
    - Smart defaults based on modulation type
    - Manual overrides

    Used to:
    1. Pass pre-resolved parameters to decoders
    2. Compare configurations to detect parameter changes (for decoder restart logic)
    3. Provide single source of truth for decoder parameters
    """

    # Common parameters (all decoders)
    baudrate: int
    framing: str  # 'ax25', 'usp', 'geoscan', 'doka', etc.
    config_source: str  # 'satellite_config', 'smart_default', 'transmitter_metadata', 'manual'

    # FSK-specific parameters (GMSK, GFSK, AFSK)
    deviation: Optional[int] = None  # Frequency deviation in Hz

    # AFSK-specific parameters
    af_carrier: Optional[int] = None  # Audio frequency carrier in Hz (1700 for APRS)

    # BPSK-specific parameters
    differential: Optional[bool] = None  # DBPSK mode

    # Optional metadata
    packet_size: Optional[int] = None  # Expected packet size in bytes

    # Satellite metadata (for logging, file naming, telemetry parsing)
    satellite_norad_id: Optional[int] = None
    satellite_name: Optional[str] = None

    # Transmitter metadata (for logging, file naming, reference)
    transmitter_id: Optional[int] = None
    transmitter_description: Optional[str] = None
    transmitter_mode: Optional[str] = None
    transmitter_downlink_freq: Optional[float] = None

    def __eq__(self, other):
        """
        Compare configurations to detect parameter changes.

        Used by DecoderManager to determine if decoder needs to be restarted
        when configuration changes (e.g., different satellite selected).

        Returns:
            bool: True if configurations are identical
        """
        if not isinstance(other, DecoderConfig):
            return False

        return (
            self.baudrate == other.baudrate
            and self.framing == other.framing
            and self.deviation == other.deviation
            and self.af_carrier == other.af_carrier
            and self.differential == other.differential
        )

    def __hash__(self):
        """Allow DecoderConfig to be used as dict key"""
        return hash(
            (
                self.baudrate,
                self.framing,
                self.deviation,
                self.af_carrier,
                self.differential,
            )
        )

    def to_dict(self):
        """Convert to dictionary for logging/serialization"""
        return {
            "baudrate": self.baudrate,
            "framing": self.framing,
            "config_source": self.config_source,
            "deviation": self.deviation,
            "af_carrier": self.af_carrier,
            "differential": self.differential,
            "packet_size": self.packet_size,
            "satellite_norad_id": self.satellite_norad_id,
            "satellite_name": self.satellite_name,
            "transmitter_id": self.transmitter_id,
            "transmitter_description": self.transmitter_description,
            "transmitter_mode": self.transmitter_mode,
            "transmitter_downlink_freq": self.transmitter_downlink_freq,
        }
