import logging
import logging.config
import numpy as np
import SoapySDR
from SoapySDR import SOAPY_SDR_RX, SOAPY_SDR_CF32, SOAPY_SDR_TX
import yaml
import os


# Load logger configuration
with open(os.path.join(os.path.dirname(__file__), '../logconfig.yaml'), 'r') as f:
    config = yaml.safe_load(f)
    logging.config.dictConfig(config)

logger = logging.getLogger('soapylocal-probe')


def probe_local_soapy_sdr(sdr_details):
    """
    Connect to a locally connected USB SoapySDR device and retrieve valid sample rates and gain values.

    Args:
        sdr_details: Dictionary containing SDR connection details with the following keys:
            - driver: SDR driver name (e.g., 'rtlsdr', 'hackrf', 'airspy', etc.)
            - serial: SDR serial number (optional)

    Returns:
        Dictionary containing:
            - rates: List of sample rates in Hz supported by the device
            - gains: List of valid gain values in dB
            - has_agc: Boolean indicating if automatic gain control is supported
            - antennas: Dictionary of available antennas for RX and TX
    """

    reply: dict[str, bool | dict | str | None] = {'success': None, 'data': None, 'error': None}

    rates = []
    gains = []
    has_agc = False
    antennas = {'rx': [], 'tx': []}

    logger.info(f"Connecting to local SoapySDR device with details: {sdr_details}")

    try:
        # Get device parameters
        driver = sdr_details.get('driver', '')
        serial_number = sdr_details.get('serial', '')

        # Format the device args for the local connection
        device_args = f"driver={driver}"

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
            #logger.exception(e)

        # Get information about antennas
        try:
            # Get RX antennas
            antennas['rx'] = sdr.listAntennas(SOAPY_SDR_RX, channel)
            logger.info(f"RX Antennas: {antennas['rx']}")

            # Get TX antennas if available
            try:
                antennas['tx'] = sdr.listAntennas(SOAPY_SDR_TX, channel)
                logger.info(f"TX Antennas: {antennas['tx']}")
            except Exception as e:
                logger.warning(f"Could not get TX antennas: {e}")
                # This is not critical as we might only be interested in RX

        except Exception as e:
            logger.warning(f"Could not get antenna information: {e}")
            #logger.exception(e)

        reply['success'] = True

    except Exception as e:
        #logger.error(f"Error connecting to local SoapySDR device: {str(e)}")
        #logger.exception(e)
        reply['success'] = False
        reply['error'] = str(e)

    finally:
        reply['data'] = {
            'rates': sorted(rates),
            'gains': gains,
            'has_soapy_agc': has_agc,
            'antennas': antennas
        }
        return reply

