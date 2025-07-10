# Copyright (c) 2024 Efstratios Goudelis
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


import numpy as np
import time
import logging
import math
from workers.common import window_functions

# Configure logging for the worker process
logger = logging.getLogger('uhd-worker')

try:
    import uhd
except ImportError:
    uhd = None
    logging.warning("UHD library not found. UHD functionality will not be available.")


def uhd_worker_process(config_queue, data_queue, stop_event):
    """
    Worker process for UHD operations.

    This function runs in a separate process to avoid segmentation faults.
    It receives configuration through a queue, processes SDR data, and
    sends the FFT results back through another queue.

    Args:
        config_queue: Queue for receiving configuration from the main process
        data_queue: Queue for sending processed data back to the main process
        stop_event: Event to signal the process to stop
    """

    if uhd is None:
        error_msg = "UHD library not available. Cannot start UHD worker."
        logger.error(error_msg)
        data_queue.put({
            'type': 'error',
            'client_id': None,
            'message': error_msg,
            'timestamp': time.time()
        })
        data_queue.put({
            'type': 'terminated',
            'client_id': None,
            'message': error_msg,
            'timestamp': time.time()
        })

        return

    # Default configuration
    UHD = None
    sdr_id = None
    client_id = None
    streamer = None

    logger.info(f"UHD worker process started for SDR {sdr_id} for client {client_id}")

    try:
        # Wait for initial configuration
        logger.info(f"Waiting for initial configuration for SDR {sdr_id} for client {client_id}...")
        config = config_queue.get()
        logger.info(f"Initial configuration: {config}")
        new_config = config
        old_config = config

        # Configure the SDR device
        sdr_id = config.get('sdr_id')
        client_id = config.get('client_id')
        fft_size = config.get('fft_size', 16384)
        fft_window = config.get('fft_window', 'hanning')

        # Insufficient samples handling mode: 'zero-pad' or 'drop' (skip frame)
        insufficient_samples_mode = config.get('insufficient_samples_mode', 'drop')

        # Connect to the UHD device
        device_args = config.get('device_args', '')
        logger.info(f"Connecting to UHD with args: {device_args}...")

        # Create UHD device
        UHD = uhd.usrp.MultiUSRP(device_args)

        # Get device info
        device_info = UHD.get_pp_string()
        logger.info(f"Connected to UHD: {device_info}")

        # Configure the device
        channel = config.get('channel', 0)
        antenna = config.get('antenna', 'RX2')

        # Set antenna
        UHD.set_rx_antenna(antenna, channel)

        # Configure basic parameters
        center_freq = config.get('center_freq', 100e6)
        sample_rate = config.get('sample_rate', 2.048e6)
        gain = config.get('gain', 25.0)

        UHD.set_rx_rate(sample_rate, channel)
        UHD.set_rx_freq(uhd.types.TuneRequest(center_freq), channel)
        UHD.set_rx_gain(gain, channel)

        # Allow time for the UHD to settle
        time.sleep(0.01)

        # Verify actual settings
        actual_rate = UHD.get_rx_rate(channel)
        actual_freq = UHD.get_rx_freq(channel)
        actual_gain = UHD.get_rx_gain(channel)

        logger.info(f"UHD configured: sample_rate={actual_rate}, center_freq={actual_freq}, gain={actual_gain}")

        # Setup streaming with smaller buffer sizes to prevent overflow
        stream_args = uhd.usrp.StreamArgs("fc32", "sc16")
        stream_args.channels = [channel]
        # Set smaller buffer sizes to reduce latency and prevent overflow
        stream_args.args = uhd.types.DeviceAddr("num_recv_frames=128,recv_frame_size=4096")
        streamer = UHD.get_rx_stream(stream_args)

        # Calculate the number of samples based on sample rate
        num_samples = calculate_samples_per_scan(actual_rate)

        # Create receive buffer
        recv_buffer = np.zeros((1, num_samples), dtype=np.complex64)

        # Start streaming
        stream_cmd = uhd.types.StreamCMD(uhd.types.StreamMode.start_cont)
        stream_cmd.stream_now = True
        streamer.issue_stream_cmd(stream_cmd)

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

                    if 'sample_rate' in new_config:
                        if actual_rate != new_config['sample_rate']:
                            # Stop streaming before changing sample rate - fix stream mode
                            stream_cmd = uhd.types.StreamCMD(uhd.types.StreamMode.stop_cont)
                            streamer.issue_stream_cmd(stream_cmd)

                            UHD.set_rx_rate(new_config['sample_rate'], channel)
                            actual_rate = UHD.get_rx_rate(channel)

                            # Calculate a new number of samples
                            num_samples = calculate_samples_per_scan(actual_rate)
                            recv_buffer = np.zeros((1, num_samples), dtype=np.complex64)

                            # Restart streaming
                            stream_cmd = uhd.types.StreamCMD(uhd.types.StreamMode.start_cont)
                            stream_cmd.stream_now = True
                            streamer.issue_stream_cmd(stream_cmd)

                            logger.info(f"Updated sample rate: {actual_rate}")

                    if 'center_freq' in new_config:
                        if actual_freq != new_config['center_freq']:
                            UHD.set_rx_freq(uhd.types.TuneRequest(new_config['center_freq']), channel)
                            actual_freq = UHD.get_rx_freq(channel)
                            logger.info(f"Updated center frequency: {actual_freq}")

                    if 'gain' in new_config:
                        if actual_gain != new_config['gain']:
                            UHD.set_rx_gain(new_config['gain'], channel)
                            actual_gain = UHD.get_rx_gain(channel)
                            logger.info(f"Updated gain: {actual_gain}")

                    if 'fft_size' in new_config:
                        if old_config.get('fft_size', 0) != new_config['fft_size']:
                            fft_size = new_config['fft_size']
                            logger.info(f"Updated FFT size: {fft_size}")

                    if 'fft_window' in new_config:
                        if old_config.get('fft_window', None) != new_config['fft_window']:
                            fft_window = new_config['fft_window']
                            logger.info(f"Updated FFT window: {fft_window}")

                    if 'antenna' in new_config:
                        if old_config.get('antenna', None) != new_config['antenna']:
                            UHD.set_rx_antenna(new_config['antenna'], channel)
                            logger.info(f"Updated antenna: {new_config['antenna']}")

                    if 'insufficient_samples_mode' in new_config:
                        if old_config.get('insufficient_samples_mode', None) != new_config['insufficient_samples_mode']:
                            insufficient_samples_mode = new_config['insufficient_samples_mode']
                            logger.info(f"Updated insufficient samples mode: {insufficient_samples_mode}")

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
                # Read samples from UHD with a shorter timeout
                metadata = uhd.types.RXMetadata()
                num_rx_samples = streamer.recv(recv_buffer, metadata, 0.05)

                logger.info(f"Received {num_rx_samples} samples")

                if metadata.error_code != uhd.types.RXMetadataErrorCode.none:
                    if metadata.error_code == uhd.types.RXMetadataErrorCode.overflow:
                        logger.warning("Receiver overflow - skipping frame")
                        # Skip this frame and continue to prevent accumulation
                        continue
                    else:
                        logger.warning(f"Receiver error: {metadata.strerror()}")
                        continue

                # Handle partial reads - process what we have
                if num_rx_samples < num_samples:
                    # For now, process what we have if it's at least minimum size
                    if num_rx_samples < 1024:  # Skip very small reads
                        continue

                    # Use the samples we got
                    samples = recv_buffer[0][:num_rx_samples]

                    # Handle insufficient samples based on mode
                    if num_rx_samples < fft_size:
                        if insufficient_samples_mode == 'drop':
                            logger.debug(f"Dropping frame: received {num_rx_samples} samples, need {fft_size}")
                            continue
                        elif insufficient_samples_mode == 'zero-pad':
                            # Pad with zeros to reach FFT size
                            logger.debug(f"Zero-padding frame: received {num_rx_samples} samples, padding to {fft_size}")
                            padded_samples = np.zeros(fft_size, dtype=np.complex64)
                            padded_samples[:num_rx_samples] = samples
                            samples = padded_samples
                            actual_fft_size = fft_size
                        else:
                            logger.warning(f"Unknown insufficient_samples_mode: {insufficient_samples_mode}, defaulting to 'zero-pad'")
                            # Default to zero-pad behavior
                            padded_samples = np.zeros(fft_size, dtype=np.complex64)
                            padded_samples[:num_rx_samples] = samples
                            samples = padded_samples
                            actual_fft_size = fft_size
                    else:
                        actual_fft_size = fft_size
                else:
                    # Get the samples from the buffer
                    samples = recv_buffer[0][:num_rx_samples]
                    actual_fft_size = fft_size

                # Apply window function
                window_func = window_functions.get(fft_window.lower(), np.hanning)
                window = window_func(actual_fft_size)

                # Calculate FFT with 50% overlap - handle variable sizes
                num_segments = max(1, (len(samples) - actual_fft_size // 2) // (actual_fft_size // 2))

                fft_result = np.zeros(actual_fft_size)

                for i in range(num_segments):
                    start_idx = i * (actual_fft_size // 2)
                    end_idx = start_idx + actual_fft_size

                    if end_idx > len(samples):
                        break

                    segment = samples[start_idx:end_idx]
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

                # Minimal sleep to maintain data flow
                time.sleep(0.001)  # Reduced from 0.01

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

                # Short pause before retrying
                time.sleep(0.1)  # Reduced from 1 second

    except Exception as e:
        error_msg = f"Error in UHD worker process: {str(e)}"
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
        # Sleep for 1 second to allow the main process to read the data queue messages
        time.sleep(1)

        # Clean up resources
        logger.info(f"Cleaning up resources for SDR {sdr_id}...")
        if streamer:
            try:
                # Stop streaming - fix stream mode consistency
                stream_cmd = uhd.types.StreamCMD(uhd.types.StreamMode.stop_cont)
                streamer.issue_stream_cmd(stream_cmd)
                logger.info("UHD streaming stopped")
            except Exception as e:
                logger.error(f"Error stopping UHD streaming: {str(e)}")

        if UHD:
            try:
                # UHD cleanup is handled automatically by the destructor
                logger.info(f"UHD device with id {sdr_id} closed")
            except Exception as e:
                logger.error(f"Error closing UHD device with id {sdr_id}: {str(e)}")

        # Send termination signal
        data_queue.put({
            'type': 'terminated',
            'client_id': client_id,
            'sdr_id': sdr_id,
            'timestamp': time.time()
        })

        logger.info("UHD worker process terminated")


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
    target_fft_rate = 15

    # Calculate time needed per FFT in seconds
    time_per_fft = 1.0 / target_fft_rate

    # Calculate samples needed at this sample rate
    samples_needed = int(sample_rate * time_per_fft)

    # Alternative rounding approach (to the closest power of 2)
    power_exp = math.log2(samples_needed)
    power_of_2 = 2 ** round(power_exp)

    # Handle edge cases - set minimum and maximum sample counts
    min_samples = 512  # Minimum reasonable FFT size
    max_samples = 8192  # Further reduced to prevent overflows

    samples = max(min(power_of_2, max_samples), min_samples)

    logger.info(f"Sample rate: {sample_rate/1e6:.3f} MHz, samples: {samples}, "
                f"expected FFT duration: {samples/sample_rate:.3f} sec")

    return samples