import logging
import logging.config
import numpy as np
import SoapySDR
from SoapySDR import SOAPY_SDR_RX, SOAPY_SDR_CF32, SOAPY_SDR_TX
import yaml
import os

"""
Example input:

{'id': 'faf61065-2f90-43e4-a541-e89c28ddb37e', 'name': 'LimeSDR Mini [USB 2.0] 1D393786C41058',
 'serial': '1D393786C41058', 'host': None, 'port': None, 'type': 'soapysdrlocal', 'driver': 'lime',
 'frequency_range': {'min': 24, 'max': 1800}, 'added': '2025-05-08T20:04:54.432736+00:00',
 'updated': '2025-05-08T20:04:54.432761+00:00'}

"""


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

    reply: dict[str, bool | dict | str | None | list] = {'success': None, 'data': None, 'error': None, 'log': []}

    rates = []
    gains = []
    has_agc = False
    antennas = {'rx': [], 'tx': []}
    frequency_ranges = {}

    reply['log'].append(f"INFO: Connecting to local SoapySDR device with details: {sdr_details}")

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
            reply['log'].append(f"WARNING: Could not get sample rates: {e}")

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

        # Debug step value
        has_step = hasattr(gain_range, 'step')

        step = gain_range.step() if has_step else 1.0

        # Ensure the step is positive and non-zero
        if step <= 0.001:
            step = 1.0

        max_iterations = 100
        iteration = 0

        current = min_gain

        # Calculate gain range with steps
        while current <= max_gain and iteration < max_iterations:
            gains.append(float(current))
            current += step
            iteration += 1

        # Check if automatic gain control is supported
        try:
            has_agc = sdr.hasGainMode(SOAPY_SDR_RX, channel)

        except Exception as e:
            reply['log'].append("WARNING: Could not determine if automatic gain control is supported")
            # Note: original had commented out logger.exception(e)

        # Get information about antennas
        try:
            # Get RX antennas
            antennas['rx'] = sdr.listAntennas(SOAPY_SDR_RX, channel)
            reply['log'].append(f"INFO: RX Antennas: {antennas['rx']}")

            # Get TX antennas if available
            try:
                antennas['tx'] = sdr.listAntennas(SOAPY_SDR_TX, channel)
                reply['log'].append(f"INFO: TX Antennas: {antennas['tx']}")
            except Exception as e:
                reply['log'].append(f"WARNING: Could not get TX antennas: {e}")
                # This is not critical as we might only be interested in RX

        except Exception as e:
            reply['log'].append(f"WARNING: Could not get antenna information: {e}")
            # Note: original had commented out logger.exception(e)

        # Get frequency range information
        try:
            # Get a frequency range for RX (receiving)
            rx_freq_ranges = sdr.getFrequencyRange(SOAPY_SDR_RX, channel)
            min_freq_rx = min([r.minimum() for r in rx_freq_ranges]) / 1e6  # Convert to MHz
            max_freq_rx = max([r.maximum() for r in rx_freq_ranges]) / 1e6  # Convert to MHz
            frequency_ranges['rx'] = {'min': min_freq_rx, 'max': max_freq_rx}

            # Try to get a frequency range for TX (transmitting) if available
            try:
                tx_freq_ranges = sdr.getFrequencyRange(SOAPY_SDR_TX, channel)
                min_freq_tx = min([r.minimum() for r in tx_freq_ranges]) / 1e6  # Convert to MHz
                max_freq_tx = max([r.maximum() for r in tx_freq_ranges]) / 1e6  # Convert to MHz
                frequency_ranges['tx'] = {'min': min_freq_tx, 'max': max_freq_tx}
            except Exception as e:
                reply['log'].append(f"INFO: Could not get TX frequency range: {e}")
                # This is not critical as we might only be interested in RX

        except Exception as e:
            reply['log'].append(f"WARNING: Could not get frequency range information: {e}")

        reply['success'] = True

    except Exception as e:
        # Note: original had commented out error and exception logging,
        # but I'm adding to log list for completeness
        reply['log'].append(f"ERROR: Error connecting to local SoapySDR device: {str(e)}")
        reply['success'] = False
        reply['error'] = str(e)

    finally:
        reply['data'] = {
            'rates': sorted(rates),
            'gains': gains,
            'has_soapy_agc': has_agc,
            'antennas': antennas,
            'frequency_ranges': frequency_ranges
        }

    return reply