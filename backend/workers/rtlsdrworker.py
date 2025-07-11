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


import multiprocessing
import json
import numpy as np
import rtlsdr
import time
import logging
import math
from functools import partial
from workers.rtlsdrtcpclient import RtlSdrTcpClient
from workers.common import window_functions, FFTAverager


# Configure logging for the worker process
logger = logging.getLogger('rtlsdr-worker')

def rtlsdr_worker_process(config_queue, data_queue, stop_event):
    """
    Worker process for RTL-SDR operations.

    This function runs in a separate process to avoid segmentation faults.
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

    logger.info(f"RTL-SDR worker process started for SDR {sdr_id} for client {client_id}")

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

        # FFT averaging configuration
        fft_averaging = config.get('fft_averaging', 6)

        # Connect to the RTL-SDR device
        if config.get('connection_type') == 'tcp':
            hostname = config.get('hostname', '127.0.0.1')
            port = config.get('port', 1234)
            logger.info(f"Connecting to RTL-SDR TCP server at {hostname}:{port}...")
            sdr = RtlSdrTcpClient(hostname=hostname, port=port)
            sdr.connect()

        else:
            serial_number = config.get('serial_number', 0)
            logger.info(f"Connecting to RTL-SDR with serial number {serial_number} over USB...")
            sdr = rtlsdr.RtlSdr(serial_number=serial_number)

        # Configure the device
        offset_freq = config.get('offset_freq', 0)
        sdr.center_freq = config.get('center_freq', 100e6) + offset_freq
        sdr.sample_rate = config.get('sample_rate', 2.048e6)
        sdr.gain = config.get('gain', 25.4)

        logger.info(f"RTL-SDR configured: sample_rate={sdr.sample_rate}, center_freq={sdr.center_freq}, gain={sdr.gain}")

        # Calculate the number of samples based on sample rate
        num_samples = calculate_samples_per_scan(sdr.sample_rate, fft_size)

        # Initialize FFT averager
        fft_averager = FFTAverager(logger, averaging_factor=fft_averaging)

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
                        if sdr.sample_rate != new_config['sample_rate']:
                            sdr.sample_rate = new_config['sample_rate']

                            # Calculate the number of samples based on sample rate
                            num_samples = calculate_samples_per_scan(sdr.sample_rate, fft_size)

                            logger.info(f"Updated sample rate: {sdr.sample_rate}")

                    if 'center_freq' in new_config:
                        if sdr.center_freq != new_config['center_freq']:
                            sdr.center_freq = new_config['center_freq'] + offset_freq
                            logger.info(f"Updated center frequency: {sdr.center_freq}")

                    if 'fft_size' in new_config:
                        if old_config.get('fft_size', 0) != new_config['fft_size']:
                            fft_size = new_config['fft_size']
                            logger.info(f"Updated FFT size: {fft_size}")

                    if 'fft_window' in new_config:
                        if old_config.get('fft_window', None) != new_config['fft_window']:
                            fft_window = new_config['fft_window']
                            logger.info(f"Updated FFT window: {fft_window}")

                    if 'fft_averaging' in new_config:
                        if old_config.get('fft_averaging', 4) != new_config['fft_averaging']:
                            fft_averaging = new_config['fft_averaging']
                            fft_averager.update_averaging_factor(fft_averaging)
                            logger.info(f"Updated FFT averaging: {fft_averaging}")

                    if 'bias_t' in new_config:
                        if old_config.get('bias_t', None) != new_config['bias_t']:
                            sdr.set_bias_tee(new_config['bias_t'])
                            logger.info(f"Updated bias-T: {new_config['bias_t']}")

                    if 'rtl_agc' in new_config:
                        if old_config.get('rtl_agc', None) != new_config['rtl_agc']:
                            sdr.set_agc_mode(new_config['rtl_agc'])
                            logger.info(f"Updated RTL AGC: {new_config['rtl_agc']}")

                    if 'tuner_agc' in new_config:
                        if old_config.get('tuner_agc', None) != new_config['tuner_agc']:
                            sdr.set_manual_gain_enabled(not new_config['tuner_agc']) # Tuner AGC
                            logger.info(f"Updated tuner AGC: {new_config['tuner_agc']}")

                        if not new_config['tuner_agc']:
                            sdr.gain = new_config['gain']

                    if 'offset_freq' in new_config:
                        if old_config.get('offset_freq', 0) != new_config['offset_freq']:
                            offset_freq = new_config['offset_freq']
                            sdr.center_freq = new_config['center_freq'] + offset_freq
                            logger.info(f"Updated offset frequency: {offset_freq}")

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

                # Read samples
                samples = sdr.read_samples(num_samples)

                # Remove DC offset
                samples = remove_dc_offset(samples)

                # Optionally increase virtual resolution
                actual_fft_size = fft_size * 1

                # Apply window function
                window_func = window_functions.get(fft_window.lower(), np.hanning)
                window = window_func(actual_fft_size)

                # Calculate FFT with 50% overlap
                num_segments = (len(samples) - actual_fft_size // 2) // (actual_fft_size // 2)
                if num_segments <= 0:
                    logger.warning(f"Not enough samples for FFT: {len(samples)} < {actual_fft_size}")
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

                # Add FFT to averager and send only when ready
                averaged_fft = fft_averager.add_fft(fft_result)
                if averaged_fft is not None:
                    # Send the averaged result back to the main process
                    data_queue.put({
                        'type': 'fft_data',
                        'client_id': client_id,
                        'data': averaged_fft.tobytes(),
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
        error_msg = f"Connection refused to RTL-SDR TCP server at {hostname}:{port}: {str(e)}"
        logger.error(error_msg)
        logger.exception(e)

        # Send error back to the main process
        data_queue.put({
            'type': 'error',
            'client_id': client_id,
            'message': error_msg,
            'timestamp': time.time()
        })

    except json.decoder.JSONDecodeError as e:
        error_msg = f"Invalid response from RTL-SDR TCP server at {hostname}:{port}: {str(e)}"
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
        error_msg = f"Error in RTL-SDR worker process: {str(e)}"
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
        if sdr:
            try:
                sdr.close()
                logger.info(f"RTL-SDR device with id {sdr_id} closed")
            except Exception as e:
                logger.error(f"Error closing RTL-SDR device with id {sdr_id}: {str(e)}")

        # Send termination signal
        data_queue.put({
            'type': 'terminated',
            'client_id': client_id,
            'sdr_id': sdr_id,
            'timestamp': time.time()
        })

        logger.info("RTL-SDR worker process terminated")


def calculate_samples_per_scan(sample_rate, fft_size):
    if fft_size is None:
        fft_size = 8192

    return fft_size


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