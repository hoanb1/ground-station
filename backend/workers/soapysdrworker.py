import multiprocessing
import json
import numpy as np
import time
import logging
import math
from functools import partial
import SoapySDR
from SoapySDR import SOAPY_SDR_RX, SOAPY_SDR_CF32
from .common import window_functions


# Configure logging for the worker process
logger = logging.getLogger('soapysdr-worker')


def soapysdr_worker_process(config_queue, data_queue, stop_event):
    """
    Worker process for SoapySDR operations.

    This function runs in a separate process to handle remote SoapySDR devices.
    It receives configuration through a queue, processes SDR data, and
    sends the FFT results back through another queue.

    Args:
        config_queue: Queue for receiving configuration from the main process
        data_queue: Queue for sending processed data back to the main process
        stop_event: Event to signal the process to stop
    """

    # Default configuration
    sdr = None
    sdr_id = None
    client_id = None
    rx_stream = None
    mtu = 0
    config = {}

    logger.info(f"SoapySDR worker process started for SDR {sdr_id} for client {client_id}")

    try:
        # Wait for initial configuration
        logger.info(f"Waiting for initial configuration for SDR {sdr_id} for client {client_id}...")
        config = config_queue.get()

        logger.info(f"Initial configuration: {config}")
        new_config = config
        old_config = config

        # Configure the SoapySDR device
        sdr_id = config.get('sdr_id')
        client_id = config.get('client_id')
        fft_size = config.get('fft_size', 16384)
        fft_window = config.get('fft_window', 'hanning')
        connection_type = config.get('connection_type', '')
        driver = config.get('driver', '')
        serial_number = config.get('serial_number', '')

        if connection_type == 'soapysdrremote':
            # Connect to remote SoapySDR server
            hostname = config.get('hostname', '127.0.0.1')
            port = config.get('port', 55132)

            # The format should be 'remote:host=HOSTNAME:port=PORT,driver=DRIVER,serial=SERIAL'
            device_args = f"remote=tcp://{hostname}:{port},remote:driver={driver}"

            # Add a serial number if provided
            if serial_number:
                device_args += f",serial={serial_number}"
        else:
            # Local device - use driver and serial directly
            device_args = f"driver={driver}"
            if serial_number:
                device_args += f",serial={serial_number}"

        logger.info(f"Connecting to SoapySDR device with args: {device_args}")

        # Create the device instance
        try:

            # Attempt to connect to the specified device
            sdr = SoapySDR.Device(device_args)

            # Get device info
            device_driver = sdr.getDriverKey()
            hardware = sdr.getHardwareKey()
            logger.info(f"Connected to {device_driver} ({hardware})")

            # Query supported sample rates
            channel = config.get('channel', 0)
            supported_rates = get_supported_sample_rates(sdr, channel)
            logger.debug(f"Supported sample rate ranges: {supported_rates}")

            # Add some extra sample rates to the list
            extra_sample_rates = []
            usable_rates = []

            for rate in extra_sample_rates:
                for rate_range in supported_rates:
                    if 'minimum' in rate_range and 'maximum' in rate_range:
                        if rate_range['minimum'] <= rate <= rate_range['maximum']:
                            usable_rates.append(rate)
                            break

            logger.info(f"Usable sample rates: {[rate/1e6 for rate in usable_rates]} MHz")

            # Now choose a sample rate that is supported
            sample_rate = config.get('sample_rate', 2.048e6)
            if usable_rates and sample_rate not in usable_rates:
                # Find the closest supported rate
                closest_rate = min(usable_rates, key=lambda x: abs(x - sample_rate))
                logger.info(f"Requested sample rate {sample_rate/1e6} MHz is not supported. Using closest rate: {closest_rate/1e6} MHz")
                sample_rate = closest_rate

            # Set sample rate
            sdr.setSampleRate(SOAPY_SDR_RX, channel, sample_rate)
            actual_sample_rate = sdr.getSampleRate(SOAPY_SDR_RX, channel)
            logger.debug(f"Sample rate set to {actual_sample_rate/1e6} MHz")

            # Number of samples required for each iteration
            num_samples = calculate_samples_per_scan(actual_sample_rate)

        except Exception as e:
            error_msg = f"Error connecting to SoapySDR device: {str(e)}"
            logger.error(error_msg)
            logger.exception(e)
            raise

        # Configure the device
        center_freq = config.get('center_freq', 100e6)
        sample_rate = config.get('sample_rate', 2.048e6)
        gain = config.get('gain', 25.4)
        antenna = config.get('antenna', '')
        channel = config.get('channel', 0)

        # Set sample rate
        sdr.setSampleRate(SOAPY_SDR_RX, channel, sample_rate)
        actual_sample_rate = sdr.getSampleRate(SOAPY_SDR_RX, channel)
        logger.info(f"Sample rate set to {actual_sample_rate/1e6} MHz")

        # Set center frequency
        sdr.setFrequency(SOAPY_SDR_RX, channel, center_freq)
        actual_freq = sdr.getFrequency(SOAPY_SDR_RX, channel)
        logger.info(f"Center frequency set to {actual_freq/1e6} MHz")

        # Set gain
        if config.get('gain_mode', 'manual') == 'automatic':
            sdr.setGainMode(SOAPY_SDR_RX, channel, True)
            logger.info(f"Automatic gain control enabled")

        else:
            sdr.setGainMode(SOAPY_SDR_RX, channel, False)
            sdr.setGain(SOAPY_SDR_RX, channel, gain)
            actual_gain = sdr.getGain(SOAPY_SDR_RX, channel)
            logger.info(f"Gain set to {actual_gain} dB")

        # Set antenna if specified
        if antenna:
            sdr.setAntenna(SOAPY_SDR_RX, channel, antenna)
            selected_antenna = sdr.getAntenna(SOAPY_SDR_RX, channel)
            logger.info(f"Antenna set to {selected_antenna}")

        # Set up the streaming
        rx_stream = sdr.setupStream(SOAPY_SDR_RX, SOAPY_SDR_CF32)

        # Now check MTU - after setupStream but before activateStream
        try:
            mtu = sdr.getStreamMTU(rx_stream)
            logger.debug(f"Stream MTU: {mtu}")
        except Exception as e:
            logger.warning(f"Could not get stream MTU: {e}")

        # Activate the stream
        sdr.activateStream(rx_stream)
        logger.debug("SoapySDR stream activated")

        # if we reached here, we can set the UI to streaming
        data_queue.put({
            'type': 'streamingstart',
            'client_id': client_id,
            'message': None,
            'timestamp': time.time()
        })

        # Main processing loop
        while not stop_event.is_set():
            # Check for new configuration without blocking
            try:
                if not config_queue.empty():
                    new_config = config_queue.get_nowait()
                    channel = new_config.get('channel', channel)

                    if 'sample_rate' in new_config:
                        if actual_sample_rate != new_config['sample_rate']:
                            # Deactivate stream before changing sample rate
                            sdr.deactivateStream(rx_stream)
                            sdr.closeStream(rx_stream)

                            sdr.setSampleRate(SOAPY_SDR_RX, channel, new_config['sample_rate'])
                            actual_sample_rate = sdr.getSampleRate(SOAPY_SDR_RX, channel)

                            # Setup stream again with a new sample rate
                            rx_stream = sdr.setupStream(SOAPY_SDR_RX, SOAPY_SDR_CF32)
                            sdr.activateStream(rx_stream)

                            # Number of samples required for each iteration
                            num_samples = calculate_samples_per_scan(actual_sample_rate)

                            logger.info(f"Updated sample rate: {actual_sample_rate}")

                    if 'center_freq' in new_config:
                        if actual_freq != new_config['center_freq']:
                            sdr.setFrequency(SOAPY_SDR_RX, channel, new_config['center_freq'])
                            actual_freq = sdr.getFrequency(SOAPY_SDR_RX, channel)
                            logger.info(f"Updated center frequency: {actual_freq}")

                    if 'fft_size' in new_config:
                        if old_config.get('fft_size', 0) != new_config['fft_size']:
                            fft_size = new_config['fft_size']
                            logger.info(f"Updated FFT size: {fft_size}")

                    if 'fft_window' in new_config:
                        if old_config.get('fft_window', None) != new_config['fft_window']:
                            fft_window = new_config['fft_window']
                            logger.info(f"Updated FFT window: {fft_window}")

                    if 'gain_mode' in new_config:
                        if old_config.get('gain_mode', 'manual') != new_config['gain_mode']:
                            if new_config['gain_mode'] == 'automatic':
                                sdr.setGainMode(SOAPY_SDR_RX, channel, True)
                                logger.info("Enabled automatic gain control")
                            else:
                                sdr.setGainMode(SOAPY_SDR_RX, channel, False)
                                if 'gain' in new_config:
                                    sdr.setGain(SOAPY_SDR_RX, channel, new_config['gain'])
                                    logger.info(f"Set manual gain to {new_config['gain']} dB")

                    if 'gain' in new_config and new_config.get('gain_mode', 'manual') == 'manual':
                        if old_config.get('gain', 0) != new_config['gain']:
                            sdr.setGain(SOAPY_SDR_RX, channel, new_config['gain'])
                            actual_gain = sdr.getGain(SOAPY_SDR_RX, channel)
                            logger.info(f"Updated gain: {actual_gain} dB")

                    if 'antenna' in new_config:
                        if old_config.get('antenna', '') != new_config['antenna']:
                            sdr.setAntenna(SOAPY_SDR_RX, channel, new_config['antenna'])
                            selected_antenna = sdr.getAntenna(SOAPY_SDR_RX, channel)
                            logger.info(f"Updated antenna: {selected_antenna}")

                    old_config = new_config

            except Exception as e:
                error_msg = f"Error processing configuration: {str(e)}"
                logger.error(error_msg)
                logger.exception(e)

                # Send error back to the main process
                if data_queue:
                    data_queue.put({
                        'type': 'error',
                        'client_id': client_id,
                        'message': error_msg,
                        'timestamp': time.time()
                    })
                
            try:

                # Use the MTU value to determine read size if available, otherwise use a sensible default
                read_size = mtu if mtu > 0 else 1024
                logger.debug(f"Using read_size of {read_size} samples (MTU: {mtu})")

                # Create a buffer for the individual reads
                buffer = np.zeros(read_size, dtype=np.complex64)

                # Create an accumulation buffer for collecting enough samples
                samples_buffer = np.zeros(num_samples, dtype=np.complex64)
                buffer_position = 0

                # Loop until we have enough samples or encounter an error
                while buffer_position < num_samples and not stop_event.is_set():
                    # Read samples from the device
                    sr = sdr.readStream(rx_stream, [buffer], len(buffer), timeoutUs=1000000)

                    if sr.ret > 0:
                        # We got samples - measure how many we actually received
                        samples_read = sr.ret
                        logger.debug(f"Read {samples_read}/{read_size} samples")

                        # Calculate how many samples we can still add to our buffer
                        samples_remaining = num_samples - buffer_position
                        samples_to_add = min(samples_read, samples_remaining)

                        # Add the samples to our accumulation buffer
                        samples_buffer[buffer_position:buffer_position + samples_to_add] = buffer[:samples_to_add]
                        buffer_position += samples_to_add

                        # Log progress
                        logger.debug(f"Accumulated {buffer_position}/{num_samples} samples")

                        # If we've filled our buffer, break out of the loop
                        if buffer_position >= num_samples:
                            break

                    else:
                        # Error or timeout
                        logger.warning(f"readStream returned {sr.ret} - this may indicate an error")
                        time.sleep(0.1)

                # Check if we have enough samples for processing
                if buffer_position < num_samples:
                    logger.warning(f"Not enough samples accumulated: {buffer_position}/{num_samples}")
                    time.sleep(0.1)
                    continue

                # We have enough samples to process
                samples = samples_buffer[:buffer_position]

                # Calculate the number of samples needed for the FFT
                actual_fft_size = fft_size * 1

                # Apply window function
                window_func = window_functions.get(fft_window.lower(), np.hanning)
                window = window_func(actual_fft_size)

                # Calculate FFT with 50% overlap
                num_segments = (len(samples) - actual_fft_size // 2) // (actual_fft_size // 2)
                if num_segments <= 0:
                    logger.warning(f"Not enough samples for FFT with overlap: {len(samples)} < {actual_fft_size}")
                    continue

                fft_result = np.zeros(actual_fft_size)

                for i in range(num_segments):
                    start_idx = i * (actual_fft_size // 2)
                    segment = samples[start_idx:start_idx + actual_fft_size]

                    windowed_segment = segment * window

                    # Perform FFT
                    fft_segment = np.fft.fft(windowed_segment)

                    # Shift DC to center
                    fft_segment = np.fft.fftshift(fft_segment)

                    # Proper power normalization
                    N = len(fft_segment)
                    window_correction = 1.0
                    power = 10 * np.log10((np.abs(fft_segment) ** 2) / (N * window_correction) + 1e-10)
                    fft_result += power

                # Average the segments
                if num_segments > 0:
                    fft_result /= num_segments

                # Convert to Float32 for efficiency in transmission
                fft_result = fft_result.astype(np.float32)

                # Send the result back to the main process
                data_queue.put({
                    'type': 'fft_data',
                    'client_id': client_id,
                    'data': fft_result.tobytes(),
                    'timestamp': time.time()
                })

                # Short sleep to prevent CPU hogging
                time.sleep(0.01)

            except Exception as e:
                logger.error(f"Error processing SDR data: {str(e)}")
                logger.exception(e)

                # Send error back to the main process
                data_queue.put({
                    'type': 'error',
                    'client_id': client_id,
                    'message': str(e),
                    'timestamp': time.time()
                })

                # Pause before retrying
                time.sleep(1)

    except ConnectionRefusedError as e:
        hostname = config.get('hostname', 'unknown')
        port = config.get('port', 'unknown')
        error_msg = f"Connection refused to SoapySDR remote server at {hostname}:{port}: {str(e)}"
        logger.error(error_msg)
        logger.exception(e)

        # Send error back to the main process
        data_queue.put({
            'type': 'error',
            'client_id': client_id,
            'message': error_msg,
            'timestamp': time.time()
        })

    except Exception as e:
        error_msg = f"Error in SoapySDR worker process: {str(e)}"
        logger.error(error_msg)
        logger.exception(e)

        # Send error back to the main process
        data_queue.put({
            'type': 'error',
            'client_id': client_id,
            'message': error_msg,
            'timestamp': time.time()
        })

    finally:
        # Sleep for 0.5 second to allow the main process to read the data queue messages
        time.sleep(0.5)

        # Clean up resources
        logger.info(f"Cleaning up resources for SDR {sdr_id}...")
        if rx_stream and sdr:
            try:
                sdr.deactivateStream(rx_stream)
                sdr.closeStream(rx_stream)
                logger.info(f"SoapySDR stream closed")
            except Exception as e:
                logger.error(f"Error closing SoapySDR stream: {str(e)}")

        # Send termination signal
        data_queue.put({
            'type': 'terminated',
            'client_id': client_id,
            'sdr_id': sdr_id,
            'timestamp': time.time()
        })

        logger.info("SoapySDR worker process terminated")


def calculate_samples_per_scan(sample_rate):
    """
    Calculate samples needed to maintain a constant FFT production rate
    regardless of sample rate.

    Args:
        sample_rate (float): The sample rate of the SDR in Hz

    Returns:
        int: Number of samples to collect (rounded to power of 2)
    """
    # Define your target FFT production rate (FFTs per second)
    target_fft_rate = 10  # Adjust this value as needed

    # Calculate time needed per FFT in seconds
    time_per_fft = 1.0 / target_fft_rate

    # Calculate samples needed at this sample rate
    samples_needed = int(sample_rate * time_per_fft)

    # Round to the nearest power of 2 for efficient FFT processing
    power_of_2 = 2 ** math.floor(math.log2(samples_needed))

    # Handle edge cases - set minimum and maximum sample counts
    min_samples = 1024  # Minimum reasonable FFT size
    max_samples = 1024 * 1024  # Maximum to prevent memory issues

    samples = max(min(power_of_2, max_samples), min_samples)

    logger.info(f"Sample rate: {sample_rate/1e6:.3f} MHz, samples: {samples}, "
                f"expected FFT duration: {samples/sample_rate:.3f} sec")

    return samples


def remove_dc_offset(samples):
    """
    Remove DC offset by subtracting the mean
    """
    # Calculate the mean of the complex samples
    mean_i = np.mean(np.real(samples))
    mean_q = np.mean(np.imag(samples))

    # Subtract the mean
    samples_no_dc = samples - (mean_i + 1j*mean_q)

    return samples_no_dc


def get_supported_sample_rates(sdr, channel=0):
    """
    Retrieve the supported sample rates from the SoapySDR device.

    Args:
        sdr: SoapySDR device instance
        channel: Channel number (default: 0)

    Returns:
        List of dictionaries with minimum and maximum sample rates for each range
    """
    try:
        sample_rate_ranges = sdr.getSampleRateRange(SOAPY_SDR_RX, channel)
        supported_rates = []

        for rate_range in sample_rate_ranges:
            # Call the methods to get the actual values
            min_val = rate_range.minimum()
            max_val = rate_range.maximum()
            step_val = rate_range.step() if hasattr(rate_range, 'step') else 0

            supported_rates.append({
                'minimum': min_val,
                'maximum': max_val,
                'step': step_val
            })

        return supported_rates
    except Exception as e:
        return [{'error': str(e)}]



def list_available_devices(hostname, port):
    """
    List all available SoapySDR devices on the remote server.

    Args:
        hostname: Remote server hostname
        port: Remote server port

    Returns:
        List of available devices
    """
    try:
        # Connect to the remote server only
        remote_args = f"remote:host={hostname}:port={port}"

        # Use SoapySDR.Device.enumerate to get available devices
        available_devices = SoapySDR.Device.enumerate(remote_args)
        return available_devices
    except Exception as e:
        return [{'error': str(e)}]