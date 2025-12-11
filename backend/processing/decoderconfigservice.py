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
from typing import Dict, Optional

from processing.decoderconfig import DecoderConfig
from satconfig.config import SatelliteConfigService

logger = logging.getLogger("decoderconfigservice")


class DecoderConfigService:
    """
    Centralized service for resolving decoder configurations.

    Consolidates parameter resolution logic that was previously duplicated
    across GMSK, BPSK, AFSK, and GFSK decoders.

    Resolution priority (highest to lowest):
    1. Manual overrides (passed via overrides parameter)
    2. Satellite-specific configuration (gr-satellites database via SatelliteConfigService)
    3. Transmitter metadata detection (SatNOGS DB description/mode fields)
    4. Smart defaults (based on decoder type and baudrate)
    5. Fallback defaults (conservative values that work for most cases)

    Usage:
        config_service = DecoderConfigService()
        config = config_service.get_config(
            decoder_type='fsk',  # or 'gmsk', 'gfsk'
            satellite={'norad_id': 12345, 'name': 'MySat-1'},
            transmitter={'baud': 9600, 'deviation': 5000, 'description': 'FSK G3RUH'},
            overrides={'framing': 'ax25'}  # Optional manual overrides
        )
        # Pass config to decoder
        decoder = FSKDecoder(..., config=config, modulation_subtype="FSK")
    """

    def __init__(self):
        self.logger = logging.getLogger("decoderconfigservice")
        self.satconfig_service = SatelliteConfigService()

    def get_config(
        self,
        decoder_type: str,
        satellite: Optional[Dict] = None,
        transmitter: Optional[Dict] = None,
        overrides: Optional[Dict] = None,
        vfo_freq: Optional[float] = None,
    ) -> DecoderConfig:
        """
        Resolve decoder configuration from multiple sources.

        Args:
            decoder_type: Decoder type ('gmsk', 'bpsk', 'afsk', 'gfsk', 'weather')
            satellite: Satellite dict with 'norad_id', 'name', etc.
            transmitter: Transmitter dict with 'baud', 'deviation', 'mode', 'description', etc.
            overrides: Manual parameter overrides (highest priority)
            vfo_freq: VFO center frequency in Hz (for pipeline detection)

        Returns:
            DecoderConfig: Resolved configuration with all parameters determined

        Examples:
            # Satellite with gr-satellites config
            config = service.get_config('gmsk', satellite={'norad_id': 99999}, transmitter={...})
            # Result: Uses satellite-specific config from gr-satellites DB

            # Unknown satellite with metadata
            config = service.get_config('gmsk', transmitter={'description': 'GMSK USP'})
            # Result: Detects USP framing from description, uses smart defaults

            # Manual configuration
            config = service.get_config('gmsk', overrides={'baudrate': 9600, 'framing': 'ax25'})
            # Result: Uses manual overrides with fallback defaults
        """
        satellite = satellite or {}
        transmitter = transmitter or {}
        overrides = overrides or {}

        norad_id = satellite.get("norad_id")
        baudrate = self._resolve_baudrate(transmitter, overrides)
        downlink_freq = transmitter.get("downlink_low")

        # Weather satellite decoder (SatDump)
        if decoder_type == "weather":
            return self._get_weather_config(
                satellite, transmitter, overrides, vfo_freq or downlink_freq
            )

        # Try satellite-specific configuration first (highest priority after overrides)
        if norad_id and self.satconfig_service and not overrides:
            try:
                sat_params = self.satconfig_service.get_decoder_parameters(
                    norad_id=norad_id,
                    baudrate=baudrate,
                    frequency=downlink_freq,
                )
                self.logger.info(
                    f"Loaded satellite config for NORAD {norad_id}: {sat_params['source']}"
                )
                return self._build_config_from_satellite(
                    decoder_type, sat_params, satellite, transmitter, baudrate
                )
            except Exception as e:
                self.logger.warning(f"Failed to load satellite config for NORAD {norad_id}: {e}")
                self.logger.info("Falling back to metadata detection")

        # Detect from transmitter metadata (second priority)
        detected_config = self._detect_from_metadata(decoder_type, transmitter, baudrate)

        # Apply manual overrides (highest priority)
        if overrides:
            detected_config = self._apply_overrides(detected_config, overrides)

        # Populate satellite and transmitter metadata as complete dicts
        detected_config.satellite = satellite if satellite else None
        detected_config.transmitter = transmitter if transmitter else None

        self.logger.debug(f"Resolved {decoder_type.upper()} config: {detected_config.to_dict()}")
        return detected_config

    def _resolve_baudrate(self, transmitter: Dict, overrides: Dict) -> int:
        """Extract baudrate from transmitter or overrides"""
        if "baudrate" in overrides:
            baudrate = overrides["baudrate"]
            if isinstance(baudrate, int):
                return baudrate
            try:
                return int(baudrate)
            except (ValueError, TypeError):
                self.logger.warning(f"Invalid baudrate in overrides: {baudrate}, using default")
                return self._get_default_baudrate(transmitter.get("mode", ""))

        baud = transmitter.get("baud")
        if baud is not None:
            # Handle invalid baud values (like "-", empty string, etc.)
            if isinstance(baud, int):
                return baud
            try:
                return int(baud)
            except (ValueError, TypeError):
                self.logger.warning(f"Invalid baud value in transmitter: '{baud}', using default")
                return self._get_default_baudrate(transmitter.get("mode", ""))

        return self._get_default_baudrate(transmitter.get("mode", ""))

    def _get_default_baudrate(self, mode: str) -> int:
        """Get default baudrate based on mode"""
        mode_upper = mode.upper()

        # Weather satellite modes (baudrate not typically used)
        if any(m in mode_upper for m in ["APT", "LRPT", "HRPT", "HRIT", "LRIT", "GGAK", "GMDSS"]):
            return 0  # Weather modes don't use traditional baudrate

        # Digital packet modes
        if "AFSK" in mode_upper:
            return 1200  # APRS default
        elif "BPSK" in mode_upper or "GMSK" in mode_upper or "GFSK" in mode_upper:
            return 9600  # Common for digital modes

        return 9600  # Generic fallback

    def _build_config_from_satellite(
        self, decoder_type: str, sat_params: Dict, satellite: Dict, transmitter: Dict, baudrate: int
    ) -> DecoderConfig:
        """Build configuration from satellite-specific parameters"""
        # If this is a "smart_default" (satellite not found in gr-satellites),
        # detect framing from transmitter metadata instead of using default
        if sat_params.get("source") == "smart_default":
            mode = transmitter.get("mode", "")
            description = transmitter.get("description", "")
            framing = self._detect_framing(mode, description)
            # Detect deviation from transmitter metadata
            deviation = self._detect_deviation(decoder_type, transmitter, baudrate)
            self.logger.info(
                f"Satellite not in gr-satellites: using transmitter metadata "
                f"(framing='{framing}', deviation={deviation})"
            )
            # Use transmitter_metadata as source since we're detecting from transmitter
            config_source = "transmitter_metadata" if (mode or description) else "smart_default"
        else:
            # Use framing and deviation from gr-satellites database
            framing = sat_params.get("framing", "ax25")
            deviation = sat_params.get("deviation")
            config_source = sat_params.get("source", "satellite_config")

        config = DecoderConfig(
            baudrate=baudrate,
            framing=framing,
            config_source=config_source,
            deviation=deviation,
            differential=sat_params.get("differential", False),
        )

        # Framing-specific parameters
        config.framing_params = {}
        if framing == "geoscan":
            # Prefer explicit YAML frame size if present; default to 66 otherwise
            frame_size = sat_params.get("frame_size")
            if frame_size is None:
                frame_size = 66
            config.framing_params["frame_size"] = frame_size

        # Add decoder-specific parameters
        if decoder_type == "afsk":
            config.af_carrier = transmitter.get("af_carrier", 1700)  # APRS default

        # Populate satellite and transmitter metadata as complete dicts
        config.satellite = satellite if satellite else None
        config.transmitter = transmitter if transmitter else None

        return config

    def _detect_from_metadata(
        self, decoder_type: str, transmitter: Dict, baudrate: int
    ) -> DecoderConfig:
        """Detect configuration from transmitter metadata (mode, description fields)"""
        mode = transmitter.get("mode", "").upper()
        description = transmitter.get("description", "").upper()

        # Detect framing protocol
        framing = self._detect_framing(mode, description)

        # Detect deviation (FSK modes)
        deviation = self._detect_deviation(decoder_type, transmitter, baudrate)

        # Detect differential mode (BPSK)
        differential = "DBPSK" in mode or "DBPSK" in description

        config = DecoderConfig(
            baudrate=baudrate,
            framing=framing,
            config_source="transmitter_metadata" if (mode or description) else "smart_default",
            deviation=deviation,
            differential=differential,
        )

        # Default framing params for certain framings when detected from metadata
        config.framing_params = {}
        if framing == "geoscan":
            # Default GEOSCAN frame size if unknown
            config.framing_params["frame_size"] = 66

        # Add decoder-specific parameters
        if decoder_type == "afsk":
            config.af_carrier = self._detect_af_carrier(description, baudrate)

        return config

    def _detect_framing(self, mode: str, description: str) -> str:
        """
        Detect framing protocol from mode and description fields.

        Priority: Description field first (more detailed), then mode field.
        """
        # Convert to uppercase for case-insensitive matching
        mode_upper = mode.upper()
        description_upper = description.upper()

        # Check description first (more reliable)
        if "GEOSCAN" in description_upper:
            return "geoscan"
        elif "USP" in description_upper:
            return "usp"
        elif "DOKA" in description_upper or "CCSDS" in description_upper:
            return "doka"
        elif "G3RUH" in description_upper or "APRS" in description_upper:
            return "ax25"
        elif "AX.25" in description_upper or "AX25" in description_upper:
            return "ax25"

        # Check mode field
        if "GEOSCAN" in mode_upper:
            return "geoscan"
        elif "USP" in mode_upper:
            return "usp"
        elif "DOKA" in mode_upper:
            return "doka"
        elif "AX.25" in mode_upper or "AX25" in mode_upper:
            return "ax25"

        # Default to AX.25 (most common for amateur satellites)
        return "ax25"

    def _detect_deviation(
        self, decoder_type: str, transmitter: Dict, baudrate: int
    ) -> Optional[int]:
        """Detect frequency deviation for FSK modes"""
        # Explicit deviation in transmitter dict (highest priority)
        if "deviation" in transmitter:
            deviation = transmitter["deviation"]
            if deviation is not None:
                return int(deviation)
            return None

        # Smart defaults based on decoder type and baudrate
        if decoder_type == "afsk":
            return 500 if baudrate == 1200 else 2400  # Bell 202 or G3RUH
        elif decoder_type in ["fsk", "gmsk", "gfsk"]:
            # FSK-family decoders REQUIRE deviation (cannot be None)
            # Return smart defaults based on baudrate
            if baudrate <= 1200:
                return 600  # Low baudrate: narrow deviation
            elif baudrate <= 2400:
                return 1200  # 2400 baud
            elif baudrate <= 4800:
                return 2400  # 4800 baud
            elif baudrate <= 9600:
                return 5000  # 9600 baud (most common)
            else:
                return int(baudrate * 0.5)  # High baudrate: ~50% of baudrate
        elif decoder_type == "bpsk":
            return None  # BPSK doesn't use deviation

        return None

    def _detect_af_carrier(self, description: str, baudrate: int) -> int:
        """Detect audio frequency carrier for AFSK"""
        if "APRS" in description:
            return 1700  # Bell 202 APRS
        elif baudrate == 1200:
            return 1700  # Likely Bell 202
        else:
            return 1200  # Generic packet radio

    def _apply_overrides(self, config: DecoderConfig, overrides: Dict) -> DecoderConfig:
        """Apply manual overrides to configuration"""
        if "baudrate" in overrides:
            config.baudrate = overrides["baudrate"]
        if "framing" in overrides:
            config.framing = overrides["framing"]
        if "deviation" in overrides:
            config.deviation = overrides["deviation"]
        if "af_carrier" in overrides:
            config.af_carrier = overrides["af_carrier"]
        if "differential" in overrides:
            config.differential = overrides["differential"]

        # LoRa-specific overrides
        if "sf" in overrides:
            config.sf = overrides["sf"]
        if "bw" in overrides:
            config.bw = overrides["bw"]
        if "cr" in overrides:
            config.cr = overrides["cr"]
        if "sync_word" in overrides:
            config.sync_word = overrides["sync_word"]
        if "preamble_len" in overrides:
            config.preamble_len = overrides["preamble_len"]
        if "fldro" in overrides:
            config.fldro = overrides["fldro"]

        # Framing-specific overrides
        if "framing_params" in overrides and isinstance(overrides["framing_params"], dict):
            # Merge with existing
            if not config.framing_params:
                config.framing_params = {}
            config.framing_params.update(overrides["framing_params"])

        config.config_source = "manual"
        return config

    def _get_weather_config(
        self, satellite: Dict, transmitter: Dict, overrides: Dict, frequency: Optional[float]
    ) -> DecoderConfig:
        """
        Get configuration for weather satellite decoder (SatDump).

        Auto-detects SatDump pipeline based on transmitter mode and frequency.
        """
        mode = transmitter.get("mode", "").upper()
        norad_id = satellite.get("norad_id")
        baudrate = transmitter.get("baud", 0)

        # Detect pipeline and target sample rate
        pipeline, target_sample_rate = self._detect_weather_pipeline(
            mode, frequency, norad_id, baudrate
        )

        config = DecoderConfig(
            baudrate=baudrate if baudrate else 0,  # Weather sats may not have baudrate
            framing="weather",  # Special framing type for weather sats
            config_source="weather_satellite",
            pipeline=pipeline,
            target_sample_rate=target_sample_rate,
        )

        # Apply overrides
        if overrides:
            if "pipeline" in overrides:
                config.pipeline = overrides["pipeline"]
            if "target_sample_rate" in overrides:
                config.target_sample_rate = overrides["target_sample_rate"]
            config.config_source = "manual"

        # Populate metadata
        config.satellite = satellite
        config.transmitter = transmitter

        self.logger.debug(
            f"Resolved weather satellite config: pipeline={config.pipeline}, "
            f"sample_rate={config.target_sample_rate}Hz"
        )

        return config

    def _detect_weather_pipeline(
        self, mode: str, frequency: Optional[float], norad_id: Optional[int], baudrate: int
    ) -> tuple:
        """
        Detect SatDump pipeline and target sample rate from transmitter metadata.

        Priority:
        1. Explicit mode string matching (APT, LRPT, HRPT, HRIT, LRIT, GGAK, etc.)
        2. Frequency range + NORAD ID combination
        3. NORAD ID alone (for satellites with multiple modes)
        4. Frequency range alone
        5. Fallback to common default

        Returns:
            tuple: (pipeline_name, target_sample_rate)
        """
        if not frequency:
            frequency = 0

        mode_upper = mode.upper() if mode else ""

        # Log detection inputs for debugging
        self.logger.info(
            f"Weather pipeline detection: mode='{mode}', freq={frequency/1e6 if frequency else 0:.3f}MHz, "
            f"NORAD={norad_id}, baud={baudrate}"
        )

        # === Mode-based detection (highest priority) ===

        # APT (NOAA analog)
        if "APT" in mode_upper:
            return ("noaa_apt", 48000)

        # LRPT (Meteor digital)
        if "LRPT" in mode_upper:
            # Distinguish between LRPT (72k) and older 80k by baudrate
            if baudrate and baudrate >= 80000:
                self.logger.info(f"Detected LRPT 80k (baudrate={baudrate})")
            return ("meteor_m2-x_lrpt", 288000)

        # GGAK (Elektro-L/Arktika-M geostationary)
        if "GGAK" in mode_upper or "GMDSS" in mode_upper:
            # Distinguish between Elektro-L and Arktika-M by NORAD ID
            if norad_id in [47719, 58584]:  # Arktika-M 1, M2
                self.logger.info("Detected Arktika-M GGAK/GMDSS mode")
                return ("arktika_ggak", 3000000)
            else:
                self.logger.info("Detected Elektro-L GGAK/GMDSS mode")
                return ("elektro_ggak", 3000000)

        # HRPT (high-resolution picture transmission)
        if "HRPT" in mode_upper or "AHRPT" in mode_upper:
            # Distinguish by NORAD or default to NOAA
            if norad_id in [40069, 44387, 57166]:  # Meteor-M N2, N2-2, N2-3
                return ("meteor_hrpt", 3000000)
            elif norad_id in [38771, 43689]:  # MetOp-B, C
                return ("metop_ahrpt", 3000000)
            elif norad_id in [27431, 33463, 39260]:  # FengYun-3A, 3B, 3C
                return ("fengyun3_ahrpt", 2800000)
            else:
                return ("noaa_hrpt", 2500000)

        # HRIT/LRIT (geostationary high/low-rate)
        if "HRIT" in mode_upper:
            if norad_id in [41866, 51850]:  # GOES-16, 18
                return ("goes_hrit", 2000000)
            elif norad_id in [37344, 43050, 49683]:  # Elektro-L N2, N3, N4
                return ("elektro_hrit", 2500000)
            elif norad_id in [41882, 45680]:  # FengYun-4A, 4B
                return ("fengyun4_hrit", 2000000)
            elif norad_id in [40267, 41836]:  # Himawari-8, 9
                return ("himawari_hrit", 2000000)
            elif norad_id in [28912, 38552, 40732]:  # Meteosat-9, 10, 11
                return ("meteosat_msg_hrit", 1000000)
            else:
                return ("goes_hrit", 2000000)

        if "LRIT" in mode_upper:
            if norad_id in [37344, 43050, 49683]:  # Elektro-L
                return ("elektro_lrit", 1000000)
            elif norad_id in [41882, 45680]:  # FengYun-4
                return ("fengyun4_lrit", 1000000)
            else:
                return ("goes_lrit", 1000000)

        # === Frequency + NORAD based detection ===

        # HRPT (high-resolution) - detect by frequency range
        if 1690e6 <= frequency <= 1710e6:
            # NOAA HRPT
            if norad_id in [25338, 28654, 33591]:  # NOAA-15, 18, 19
                return ("noaa_hrpt", 2500000)
            # Meteor HRPT
            elif norad_id in [40069, 44387, 57166]:  # Meteor-M N2, N2-2, N2-3
                return ("meteor_m2-x_hrpt", 3000000)
            # MetOp AHRPT
            elif norad_id in [38771, 43689]:  # MetOp-B, C
                return ("metop_ahrpt", 3000000)
            # FengYun AHRPT
            elif norad_id in [27431, 33463, 39260]:  # FengYun-3A, 3B, 3C
                return ("fengyun3_ahrpt", 2800000)
            # Generic HRPT fallback
            return ("noaa_hrpt", 2500000)

        # HRIT/LRIT (geostationary) - detect by frequency range
        if 1680e6 <= frequency <= 1700e6:
            # GOES HRIT
            if norad_id in [41866, 51850]:  # GOES-16, 18
                return ("goes_hrit", 2000000)
            # Elektro-L
            elif norad_id in [37344, 43050, 49683]:  # Elektro-L N2, N3, N4
                # Detect LRIT vs HRIT by frequency
                if 1690e6 <= frequency <= 1692e6:
                    return ("elektro_lrit", 1000000)
                else:
                    return ("elektro_hrit", 2500000)
            # FengYun-4
            elif norad_id in [41882, 45680]:  # FengYun-4A, 4B
                # Assume HRIT (higher rate)
                return ("fengyun4_hrit", 2000000)
            # Himawari
            elif norad_id in [40267, 41836]:  # Himawari-8, 9
                return ("himawari_hrit", 2000000)
            # Meteosat MSG
            elif norad_id in [28912, 38552, 40732]:  # Meteosat-9, 10, 11
                return ("meteosat_msg_hrit", 1000000)
            # Generic HRIT fallback
            return ("goes_hrit", 2000000)

        # S-band (GAC, dumps)
        if 2200e6 <= frequency <= 2300e6:
            if norad_id in [25338, 28654, 33591]:  # NOAA GAC
                return ("noaa_gac", 4000000)

        # X-band (high-rate dumps) - 7-8 GHz
        if 7000e6 <= frequency <= 8200e6:
            # JPSS
            if norad_id in [43013, 54234]:  # NOAA-20, 21 (JPSS)
                return ("jpss_jpssplus", 15000000)
            # MetOp X-band
            elif norad_id in [38771, 43689]:
                return ("metop_xband", 15000000)
            # FengYun-3 X-band
            elif norad_id in [39260, 43010, 44885]:  # FY-3C, 3D, 3E
                return ("fengyun3_x_dump", 15000000)

        # Fallback: Try NORAD-only detection as last resort
        if norad_id:
            # Elektro-L (if not caught by mode)
            if norad_id in [37344, 43050, 49683]:
                self.logger.warning(
                    f"Detected Elektro-L by NORAD={norad_id} but mode='{mode}' not recognized. "
                    f"Defaulting to GGAK."
                )
                return ("elektro_ggak", 3000000)
            # GOES (if not caught by frequency)
            if norad_id in [41866, 51850]:
                self.logger.warning(f"Detected GOES by NORAD={norad_id}, defaulting to HRIT")
                return ("goes_hrit", 2000000)
            # Meteosat
            if norad_id in [28912, 38552, 40732]:
                self.logger.warning(f"Detected Meteosat by NORAD={norad_id}, defaulting to HRIT")
                return ("meteosat_msg_hrit", 1000000)

        # Final fallback to APT (most common/easiest)
        self.logger.warning(
            f"Could not detect weather pipeline for mode='{mode}', freq={frequency/1e6 if frequency else 0:.3f}MHz, "
            f"NORAD={norad_id}. Falling back to NOAA APT."
        )
        return ("noaa_apt", 48000)


# Singleton instance for convenience
decoder_config_service = DecoderConfigService()
