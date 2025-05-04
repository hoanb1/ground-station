import logging
import logging.config
import numpy as np
import SoapySDR
from SoapySDR import SOAPY_SDR_RX, SOAPY_SDR_CF32
import yaml
import os

# Load logger configuration
with open(os.path.join(os.path.dirname(__file__), '../logconfig.yaml'), 'r') as f:
    config = yaml.safe_load(f)
    logging.config.dictConfig(config)

logger = logging.getLogger('soapysdr-probe')



def get_soapy_sdr_parameters(sdr_details):
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
    """
    rates = []
    gains = []
    has_agc = False

    logger.info(f"Connecting to SoapySDR device with details: {sdr_details}")

    try:
        # Build the device args string for connecting to the remote SoapySDR server
        hostname = sdr_details.get('host', '127.0.0.1')
        port = sdr_details.get('port', 55132)
        driver = sdr_details.get('driver', '')
        serial_number = sdr_details.get('serial', '')

        # Format the device args for remote connection
        device_args = f"remote=tcp://{hostname}:{port},remote:driver={driver}"

        # Add the serial number if provided
        if serial_number:
            device_args += f",serial={serial_number}"

        # Create the device instance
        sdr = SoapySDR.Device(device_args)

        # Get channel (default to 0)
        channel = sdr_details.get('channel', 0)

        # Get sample rates
        try:
            rates = sdr.listSampleRates(SOAPY_SDR_RX, channel)
            if not rates:
                raise Exception()
        except Exception as e:
            logger.warning(f"Could not get sample rates: {e}")

            # Fall back to generating rates from ranges
            sample_rate_ranges = sdr.getSampleRateRange(SOAPY_SDR_RX, channel)
            rates = set()

            for rate_range in sample_rate_ranges:
                min_val = rate_range.minimum()
                max_val = rate_range.maximum()
                step = rate_range.step() if hasattr(rate_range, 'step') else (max_val - min_val) / 10

                if step > 0:
                    current = min_val
                    while current <= max_val:
                        rates.add(int(current))
                        current += step
            rates = sorted(list(rates))

        # Get gain values
        gain_range = sdr.getGainRange(SOAPY_SDR_RX, channel)
        min_gain = gain_range.minimum()
        max_gain = gain_range.maximum()
        step = gain_range.step() if hasattr(gain_range, 'step') else 1.0

        current = min_gain
        while current <= max_gain:
            gains.append(float(current))
            current += step

        # Check if automatic gain control is supported
        try:
            has_agc = sdr.hasGainMode(SOAPY_SDR_RX, channel)

        except Exception as e:
            logger.warning("Could not determine if automatic gain control is supported")
            logger.exception(e)

    except Exception as e:
        logger.error(f"Error connecting to SoapySDR device: {str(e)}")
        logger.exception(e)
        raise

    finally:
        return {
            'rates': sorted(rates),
            'gains': gains,
            'has_agc': has_agc
        }
