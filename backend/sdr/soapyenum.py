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


import json
import logging
from enum import Enum
from typing import Any, Dict, List, Optional

import SoapySDR

# Configure logging
logger = logging.getLogger("soapysdr-usbenum")

# Check for frequency range or not
check_freq_range = True


class SoapySDRDirection(Enum):
    """Enumeration for SoapySDR direction types"""

    RX = SoapySDR.SOAPY_SDR_RX
    TX = SoapySDR.SOAPY_SDR_TX


class SoapySDRFormat(Enum):
    """Enumeration for SoapySDR format types"""

    CS8 = SoapySDR.SOAPY_SDR_CS8
    CS16 = SoapySDR.SOAPY_SDR_CS16
    CF32 = SoapySDR.SOAPY_SDR_CF32
    CF64 = SoapySDR.SOAPY_SDR_CF64


class SoapySDRDriverType(Enum):
    """Known SoapySDR driver types for USB devices"""

    RTLSDR = "rtlsdr"
    HACKRF = "hackrf"
    AIRSPY = "airspy"
    BLADERF = "bladerf"
    SDRPLAY = "sdrplay"
    LIME = "lime"
    UHD = "uhd"
    UNKNOWN = "unknown"


def probe_available_usb_sdrs() -> str:
    """
    List and return information about all USB-connected SoapySDR devices.
    Probes each device for supported frequency ranges.

    Returns:
        JSON string containing:
            - success: Boolean indicating success
            - data: List of device dictionaries with:
                - driver: The SDR driver name
                - label: Human-readable device label
                - serial: Device serial number if available
                - is_usb: Boolean indicating if device is USB-connected
                - manufacturer: Device manufacturer if available
                - product: Product name if available
                - frequency_ranges: Dictionary of supported frequency ranges per direction
                - other device-specific attributes
            - error: Error message if any
            - log: List of log messages
    """

    log_messages: List[str] = []
    usb_devices: List[Dict[str, Any]] = []
    success: Optional[bool] = None
    error: Optional[str] = None

    log_messages.append("Enumerating available USB-connected SoapySDR devices")

    try:
        # Enumerate all available devices
        all_devices = SoapySDR.Device.enumerate()
        log_messages.append(f"Found {len(all_devices)} SoapySDR devices in total")
        log_messages.append(str(all_devices))

        for device_info in all_devices:
            device_dict = dict(device_info)

            # Check if this is a USB device
            # Most USB SDRs will have 'usb' in their driver name, serial, or path
            is_usb_device = False
            driver = device_dict.get("driver", "")

            # Common USB SDR drivers
            usb_drivers = [
                driver.value
                for driver in SoapySDRDriverType
                if driver != SoapySDRDriverType.UNKNOWN
            ]

            if any(driver.lower() == d.lower() for d in usb_drivers):
                is_usb_device = True

            # Check for USB in other fields if not already identified
            if not is_usb_device:
                for key, value in device_dict.items():
                    if isinstance(value, str) and (
                        "usb" in value.lower() or "bus" in value.lower()
                    ):
                        is_usb_device = True
                        break

            if is_usb_device:
                # Create a device entry with essential information
                device_entry = {
                    "driver": driver,
                    "label": device_dict.get("label", f"{driver} device"),
                    "serial": device_dict.get("serial", "Unknown"),
                    "is_usb": True,
                    "frequency_ranges": {},
                }

                # Add other useful information if available
                for key in ["manufacturer", "product", "deviceId", "tuner", "name"]:
                    if key in device_dict:
                        device_entry[key] = device_dict[key]

                log_messages.append(f"Found USB SDR device: {device_entry['label']}")

                if check_freq_range:
                    # Probe device for frequency ranges
                    try:
                        # Make a device instance to query its capabilities
                        simple_args = {"driver": device_dict["driver"]}
                        if "serial" in device_dict:
                            simple_args["serial"] = device_dict["serial"]

                        sdr = SoapySDR.Device(simple_args)

                        # Get frequency ranges for all available channels (both RX and TX)
                        frequency_ranges: Dict[str, Any] = {}

                        # Check RX capabilities
                        try:
                            num_rx_channels = sdr.getNumChannels(SoapySDRDirection.RX.value)
                            if num_rx_channels > 0:
                                frequency_ranges["rx"] = []
                                for channel in range(num_rx_channels):
                                    # Get the frequency range for this channel
                                    ranges = sdr.getFrequencyRange(
                                        SoapySDRDirection.RX.value, channel
                                    )
                                    parsed_ranges = []
                                    for freq_range in ranges:
                                        # Convert range to dict with min, max and step values
                                        parsed_ranges.append(
                                            {
                                                "min": freq_range.minimum(),
                                                "max": freq_range.maximum(),
                                                "step": freq_range.step(),
                                            }
                                        )
                                    frequency_ranges["rx"].append(parsed_ranges)

                        except Exception as e:
                            log_messages.append(
                                f"Warning: Error probing RX frequency range: {str(e)}"
                            )

                        # Check TX capabilities
                        try:
                            num_tx_channels = sdr.getNumChannels(SoapySDRDirection.TX.value)
                            if num_tx_channels > 0:
                                frequency_ranges["tx"] = []
                                for channel in range(num_tx_channels):
                                    # Get the frequency range for this channel
                                    ranges = sdr.getFrequencyRange(
                                        SoapySDRDirection.TX.value, channel
                                    )
                                    parsed_ranges = []
                                    for freq_range in ranges:
                                        # Convert range to dict with min, max and step values
                                        parsed_ranges.append(
                                            {
                                                "min": freq_range.minimum(),
                                                "max": freq_range.maximum(),
                                                "step": freq_range.step(),
                                            }
                                        )
                                    frequency_ranges["tx"].append(parsed_ranges)

                        except Exception as e:
                            log_messages.append(
                                f"Warning: Error probing TX frequency range: {str(e)}"
                            )

                        # Add frequency range information to device entry
                        device_entry["frequency_ranges"] = frequency_ranges

                        # Close the device
                        sdr.close()

                    except Exception as e:
                        log_messages.append(f"Warning: Error probing device capabilities: {str(e)}")
                        device_entry["frequency_ranges"] = {"error": str(e)}

                usb_devices.append(device_entry)

        success = True

    except Exception as e:
        log_messages.append(f"Error: Error enumerating SoapySDR devices: {str(e)}")
        log_messages.append(f"Exception: {str(e)}")
        success = False
        error = str(e)

    reply: Dict[str, Any] = {
        "success": success,
        "data": usb_devices,
        "error": error,
        "log": log_messages,
    }

    return json.dumps(reply)
