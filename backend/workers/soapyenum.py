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

    Returns:
        List of dictionaries, each containing device information:
            - driver: The SDR driver name
            - label: Human-readable device label
            - serial: Device serial number if available
            - is_usb: Boolean indicating if device is USB-connected
            - manufacturer: Device manufacturer if available
            - product: Product name if available
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
                    'is_usb': True
                }

                # Add other useful information if available
                for key in ['manufacturer', 'product', 'deviceId', 'tuner', 'name']:
                    if key in device_dict:
                        device_entry[key] = device_dict[key]

                logger.info(f"Found USB SDR device: {device_entry['label']}")
                usb_devices.append(device_entry)

        reply['success'] = True
        reply['data'] = usb_devices

    except Exception as e:
        logger.error(f"Error enumerating SoapySDR devices: {str(e)}")
        logger.exception(e)
        reply['success'] = False
        reply['error'] = str(e)

    finally:
        return reply