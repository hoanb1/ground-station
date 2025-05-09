import logging
import logging.config
import numpy as np
import SoapySDR
import yaml
import os

# Load logger configuration
with open(os.path.join(os.path.dirname(__file__), '../logconfig.yaml'), 'r') as f:
    config = yaml.safe_load(f)
    logging.config.dictConfig(config)

logger = logging.getLogger('soapyenum-probe')


def probe_available_usb_sdrs():
    """
    List and return information about all USB-connected SoapySDR devices.
    Probes each device for supported frequency ranges.

    Returns:
        List of dictionaries, each containing device information:
            - driver: The SDR driver name
            - label: Human-readable device label
            - serial: Device serial number if available
            - is_usb: Boolean indicating if device is USB-connected
            - manufacturer: Device manufacturer if available
            - product: Product name if available
            - frequency_ranges: Dictionary of supported frequency ranges per direction
            - other device-specific attributes
    """

    reply: dict[str, bool | dict | list | str | None] = {'success': None, 'data': None, 'error': None}

    logger.info("Enumerating available USB-connected SoapySDR devices")
    usb_devices = []

    try:
        # Enumerate all available devices
        all_devices = SoapySDR.Device.enumerate()
        logger.info(f"Found {len(all_devices)} SoapySDR devices in total")
        logger.info(all_devices)

        for device_info in all_devices:
            device_dict = dict(device_info)

            # Check if this is a USB device
            # Most USB SDRs will have 'usb' in their driver name, serial, or path
            is_usb_device = False
            driver = device_dict.get('driver', '')

            # Common USB SDR drivers
            usb_drivers = ['rtlsdr', 'hackrf', 'airspy', 'bladerf', 'sdrplay', 'lime', 'uhd']

            if any(driver.lower() == d.lower() for d in usb_drivers):
                is_usb_device = True

            # Check for USB in other fields if not already identified
            if not is_usb_device:
                for key, value in device_dict.items():
                    if isinstance(value, str) and ('usb' in value.lower() or 'bus' in value.lower()):
                        is_usb_device = True
                        break

            if is_usb_device:
                # Create a device entry with essential information
                device_entry = {
                    'driver': driver,
                    'label': device_dict.get('label', f"{driver} device"),
                    'serial': device_dict.get('serial', 'Unknown'),
                    'is_usb': True,
                    'frequency_ranges': {},
                }

                # Add other useful information if available
                for key in ['manufacturer', 'product', 'deviceId', 'tuner', 'name']:
                    if key in device_dict:
                        device_entry[key] = device_dict[key]

                logger.info(f"Found USB SDR device: {device_entry['label']}")

                # Probe device for frequency ranges
                try:
                    # Make a device instance to query its capabilities
                    sdr = SoapySDR.Device(device_dict)

                    # Get frequency ranges for all available channels (both RX and TX)
                    frequency_ranges = {}

                    # Check RX capabilities
                    try:
                        num_rx_channels = sdr.getNumChannels(SoapySDR.SOAPY_SDR_RX)
                        if num_rx_channels > 0:
                            frequency_ranges['rx'] = []
                            for channel in range(num_rx_channels):
                                # Get the frequency range for this channel
                                ranges = sdr.getFrequencyRange(SoapySDR.SOAPY_SDR_RX, channel)
                                parsed_ranges = []
                                for freq_range in ranges:
                                    # Convert range to dict with min, max and step values
                                    parsed_ranges.append({
                                        'min': freq_range.minimum(),
                                        'max': freq_range.maximum(),
                                        'step': freq_range.step()
                                    })
                                frequency_ranges['rx'].append(parsed_ranges)
                    except Exception as e:
                        logger.warning(f"Error probing RX frequency range: {str(e)}")

                    # Check TX capabilities
                    try:
                        num_tx_channels = sdr.getNumChannels(SoapySDR.SOAPY_SDR_TX)
                        if num_tx_channels > 0:
                            frequency_ranges['tx'] = []
                            for channel in range(num_tx_channels):
                                # Get the frequency range for this channel
                                ranges = sdr.getFrequencyRange(SoapySDR.SOAPY_SDR_TX, channel)
                                parsed_ranges = []
                                for freq_range in ranges:
                                    # Convert range to dict with min, max and step values
                                    parsed_ranges.append({
                                        'min': freq_range.minimum(),
                                        'max': freq_range.maximum(),
                                        'step': freq_range.step()
                                    })
                                frequency_ranges['tx'].append(parsed_ranges)
                    except Exception as e:
                        logger.warning(f"Error probing TX frequency range: {str(e)}")

                    # Add frequency range information to device entry
                    device_entry['frequency_ranges'] = frequency_ranges

                    # Close the device
                    sdr.close()

                except Exception as e:
                    logger.warning(f"Error probing device capabilities: {str(e)}")
                    device_entry['frequency_ranges'] = {'error': str(e)}

                usb_devices.append(device_entry)

    except Exception as e:
        logger.error(f"Error enumerating SoapySDR devices: {str(e)}")
        logger.exception(e)
        reply['success'] = False
        reply['error'] = str(e)

    finally:
        reply['success'] = True
        reply['data'] = usb_devices

    return reply