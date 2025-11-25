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
import logging.config
import os
from typing import Any, Dict, List, Optional, Set, TypedDict

import SoapySDR
import yaml
from SoapySDR import SOAPY_SDR_RX, SOAPY_SDR_TX

# Load logger configuration
with open(os.path.join(os.path.dirname(__file__), "../logconfig.yaml"), "r") as f:
    config = yaml.safe_load(f)
    logging.config.dictConfig(config)

logger = logging.getLogger("soapyremote-probe")


class AntennaInfo(TypedDict):
    rx: List[str]
    tx: List[str]


class FrequencyRange(TypedDict):
    min: float
    max: float


class ClockInfo(TypedDict):
    ref_locked: Optional[str]
    clock_source: Optional[str]
    available_sensors: List[str]
    available_settings: Dict[str, Dict[str, Optional[str]]]


class SDRData(TypedDict):
    rates: List[float]
    gains: List[float]
    has_soapy_agc: bool
    antennas: AntennaInfo
    frequency_ranges: Dict[str, FrequencyRange]
    clock_info: ClockInfo
    temperature: Dict[str, str]


class ProbeReply(TypedDict):
    success: Optional[bool]
    data: Optional[SDRData]
    error: Optional[str]
    log: List[str]


def probe_remote_soapy_sdr(sdr_details: Dict[str, Any]) -> ProbeReply:
    """
    Connect to a SoapySDR server and retrieve valid sample rates and gain values for a given SDR device.

    Args:
        sdr_details: Dictionary containing SDR connection details with the following keys:
            - host: Remote server hostname
            - port: Remote server port
            - driver: SDR driver name
            - serial: SDR serial number (optional)

    Returns:
        Dictionary containing:
            - rates: List of sample rates in Hz supported by the device
            - gains: List of valid gain values in dB
            - has_agc: Boolean indicating if automatic gain control is supported
            - antennas: Dictionary of available antennas for RX and TX
            - clock_info: Information about reference clock status and source
    """

    reply: ProbeReply = {
        "success": None,
        "data": None,
        "error": None,
        "log": [],
    }

    rates: List[float] = []
    gains: List[float] = []
    has_agc: bool = False
    antennas: AntennaInfo = {"rx": [], "tx": []}
    frequency_ranges: Dict[str, FrequencyRange] = {}
    clock_info: ClockInfo = {
        "ref_locked": None,
        "clock_source": None,
        "available_sensors": [],
        "available_settings": {},
    }
    temp_info: Dict[str, str] = {}

    try:
        # Build the device args string for connecting to the remote SoapySDR server
        hostname = sdr_details.get("host", "127.0.0.1")
        port = sdr_details.get("port", 55132)
        driver = sdr_details.get("driver", "")
        serial_number = sdr_details.get("serial", "")
        device_name = sdr_details.get("name", "Unknown")

        # Format the device args for remote connection
        device_args = f"remote=tcp://{hostname}:{port},remote:driver={driver}"

        # Add the serial number if provided
        if serial_number:
            device_args += f",serial={serial_number}"

        # device_args += ",clock_source=external"

        # Create the device instance
        sdr = SoapySDR.Device(device_args)

        # Extract device model from sdr string representation (e.g., "b200:B210")
        sdr_str = str(sdr)
        device_model = sdr_str.split(":")[1] if ":" in sdr_str else sdr_str

        reply["log"].append(
            f"INFO: Connected to {device_name} ({device_model}) at {hostname}:{port}"
        )

        # Get channel (default to 0)
        channel = sdr_details.get("channel", 0)

        # Get sample rates
        try:
            rates = sdr.listSampleRates(SOAPY_SDR_RX, channel)
            if not rates:
                raise Exception()

        except Exception as e:
            reply["log"].append(f"WARNING: Could not get sample rates: {e}")

            # Fall back to generating rates from ranges
            sample_rate_ranges = sdr.getSampleRateRange(SOAPY_SDR_RX, channel)
            rates_set: Set[int] = set()

            for rate_range in sample_rate_ranges:
                min_val = rate_range.minimum()
                max_val = rate_range.maximum()
                step = (
                    rate_range.step() if hasattr(rate_range, "step") else (max_val - min_val) / 10
                )

                if step > 0:
                    current = min_val
                    while current <= max_val:
                        rates_set.add(int(current))
                        current += step
            rates = [float(r) for r in sorted(list(rates_set))]

        # Get gain values
        gain_range = sdr.getGainRange(SOAPY_SDR_RX, channel)
        min_gain = gain_range.minimum()
        max_gain = gain_range.maximum()
        step = gain_range.step() if hasattr(gain_range, "step") else 1.0

        # Ensure step is a positive value to prevent infinite loops
        if step <= 0.0001:  # Threshold for considering a step too small
            step = 1.0  # Default to 1.0 dB steps
            reply["log"].append(
                "WARNING: Gain step is zero or too small, defaulting to 1.0 dB steps"
            )

        max_iterations = 100
        iteration = 0

        # Calculate gain range with steps
        current = min_gain
        while current <= max_gain and iteration < max_iterations:
            gains.append(float(current))
            current += step
            iteration += 1

        if iteration >= max_iterations:
            reply["log"].append(
                f"WARNING: Reached maximum iterations ({max_iterations}) when calculating gain values. Check gain range."
            )

        # Check if automatic gain control is supported
        try:
            has_agc = sdr.hasGainMode(SOAPY_SDR_RX, channel)
        except Exception as e:
            reply["log"].append(
                "WARNING: Could not determine if automatic gain control is supported"
            )
            reply["log"].append(f"EXCEPTION: {str(e)}\n{e.__class__.__name__}: {str(e)}")

        # Get information about antennas
        try:
            # Get RX antennas
            antennas["rx"] = sdr.listAntennas(SOAPY_SDR_RX, channel)

            # Get TX antennas if available
            try:
                antennas["tx"] = sdr.listAntennas(SOAPY_SDR_TX, channel)
            except Exception as e:
                reply["log"].append(f"WARNING: Could not get TX antennas: {e}")
                # This is not critical as we might only be interested in RX

            # Consolidate antenna info
            ant_info = f"RX:{','.join(antennas['rx'])}"
            if antennas["tx"]:
                ant_info += f" TX:{','.join(antennas['tx'])}"
            reply["log"].append(f"INFO: Antennas: {ant_info}")
        except Exception as e:
            reply["log"].append(f"WARNING: Could not get antenna information: {e}")
            reply["log"].append(f"EXCEPTION: {str(e)}\n{e.__class__.__name__}: {str(e)}")

        # Get frequency range information
        try:
            # Get the frequency range for RX (receiving)
            rx_freq_ranges = sdr.getFrequencyRange(SOAPY_SDR_RX, channel)
            min_freq_rx = min([r.minimum() for r in rx_freq_ranges]) / 1e6  # Convert to MHz
            max_freq_rx = max([r.maximum() for r in rx_freq_ranges]) / 1e6  # Convert to MHz
            frequency_ranges["rx"] = {"min": min_freq_rx, "max": max_freq_rx}

            # Try to get a frequency range for TX (transmitting) if available
            freq_info = f"RX:{min_freq_rx:.0f}-{max_freq_rx:.0f}MHz"
            try:
                tx_freq_ranges = sdr.getFrequencyRange(SOAPY_SDR_TX, channel)
                min_freq_tx = min([r.minimum() for r in tx_freq_ranges]) / 1e6  # Convert to MHz
                max_freq_tx = max([r.maximum() for r in tx_freq_ranges]) / 1e6  # Convert to MHz
                frequency_ranges["tx"] = {"min": min_freq_tx, "max": max_freq_tx}
                freq_info += f" TX:{min_freq_tx:.0f}-{max_freq_tx:.0f}MHz"
            except Exception:
                pass  # TX not critical

            reply["log"].append(f"INFO: Frequency range: {freq_info}")

        except Exception as e:
            reply["log"].append(f"WARNING: Could not get frequency range information: {e}")

        # Get a list of available sensors
        sensors: List[str] = []
        try:
            sensors = sdr.listSensors()
            clock_info["available_sensors"] = sensors
        except Exception as e:
            reply["log"].append(f"INFO: Could not list sensors: {e}")

        # Check reference clock status and source
        clock_status_parts = []
        try:
            # Check if the device has a ref_locked sensor
            if "ref_locked" in sensors:
                try:
                    ref_locked = sdr.readSensor("ref_locked")
                    clock_info["ref_locked"] = ref_locked
                    clock_status_parts.append(f"ref_lock={ref_locked}")
                except Exception as e:
                    reply["log"].append(f"WARNING: Error reading ref_locked sensor: {e}")

            # Check if the device has a clock_source sensor
            if "clock_source" in sensors:
                try:
                    clock_source = sdr.readSensor("clock_source")
                    clock_info["clock_source"] = clock_source
                    clock_status_parts.append(f"clk_src={clock_source}")
                except Exception:
                    pass

            # Try to get clock source from device settings
            try:
                clock_source = sdr.readSetting("clock_source")
                if clock_info["clock_source"] is None:  # Only set if not already set from sensor
                    clock_info["clock_source"] = clock_source
                    clock_status_parts.append(f"clk_src={clock_source}")
            except Exception:
                pass

            # Try to get available settings
            try:
                settings = sdr.getSettingInfo()
                for setting in settings:
                    if "clock" in setting.key.lower() or "ref" in setting.key.lower():
                        clock_info["available_settings"][setting.key] = {
                            "description": setting.description,
                            "value": (
                                sdr.readSetting(setting.key)
                                if hasattr(sdr, "readSetting")
                                else None
                            ),
                        }
            except Exception:
                pass

            # Only log if we have clock status info
            if clock_status_parts:
                reply["log"].append(f"INFO: Clock: {', '.join(clock_status_parts)}")

        except Exception as e:
            reply["log"].append(f"WARNING: Could not get reference clock information: {e}")

        # Probe for temperature info
        try:
            # Check if the device has a RFIC_TEMP sensor
            if "RFIC_TEMP" in sensors:
                try:
                    rfic_temp = sdr.readSensor("RFIC_TEMP")
                    temp_info["rfic_temp"] = rfic_temp
                    reply["log"].append(f"INFO: RFIC temperature: {rfic_temp}")
                except Exception as e:
                    reply["log"].append(f"WARNING: Error reading RFIC_TEMP sensor: {e}")

            # Check if the device has a lms7_temp sensor (for LimeSDR devices)
            if "lms7_temp" in sensors:
                try:
                    lms7_temp = sdr.readSensor("lms7_temp")
                    temp_info["lms7_temp"] = lms7_temp
                    reply["log"].append(f"INFO: LMS7 temperature: {lms7_temp}")
                except Exception as e:
                    reply["log"].append(f"WARNING: Error reading lms7_temp sensor: {e}")
        except Exception as e:
            reply["log"].append(f"WARNING: Could not get temperature information: {e}")

        reply["success"] = True

    except Exception as e:
        reply["log"].append(f"ERROR: Error connecting to SoapySDR device: {str(e)}")
        reply["log"].append(f"EXCEPTION: {str(e)}\n{e.__class__.__name__}: {str(e)}")
        reply["success"] = False
        reply["error"] = str(e)

    finally:
        reply["data"] = {
            "rates": sorted(rates),
            "gains": gains,
            "has_soapy_agc": has_agc,
            "antennas": antennas,
            "frequency_ranges": frequency_ranges,
            "clock_info": clock_info,
            "temperature": temp_info,
        }

    return reply
