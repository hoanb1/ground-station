import asyncio
import numpy as np
import socketio
import rtlsdr
import logging
from functools import partial
from typing import Dict, List, Optional, Any
from scipy import interpolate
from waterfall import active_sdr_clients, rtlsdr_devices

# configure new logger
logger = logging.getLogger('sdr-data-process')

# Map window function names to numpy functions
window_functions = {
    'hanning': np.hanning,
    'hamming': np.hamming,
    'blackman': np.blackman,
    'kaiser': lambda n: np.kaiser(n, beta=8.6),  # Beta chosen for good sidelobe suppression
    'bartlett': np.bartlett
}


def calculate_samples_per_scan(sample_rate):
    """
    Calculate the number of samples required per scan based on the provided sample rate.

    This function determines the number of samples to be processed in each scan
    depending on the given sample rate. The function adjusts the base sample value
    (32 KB) relative to predefined thresholds for the sample rate. Lower sample
    rates result in fewer samples per scan, optimizing the processing accordingly.

    :param sample_rate: The sample rate in Hz that determines how many samples
        need to be processed per scan.
    :type sample_rate: float
    :return: The calculated number of samples to be used per scan, modified
        relative to the sample rate.
    :rtype: int
    """
    # Default value for high sample rates
    base_samples = 32 * 1024
    if sample_rate < 1e6:  # Less than 1 MHz
        return base_samples // 4
    elif sample_rate < 2e6:  # Less than 2 MHz
        return base_samples // 2
    else:
        return base_samples


async def process_rtlsdr_data(sio: socketio.AsyncServer, device_id: int, client_id: str):
    """
    Processes real-time SDR (software-defined radio) data for a connected client.
    The function performs signal processing on the raw samples received from the
    SDR device, applies window functions, calculates FFT spectrum, and emits the
    processed FFT data back to the client. It operates asynchronously to handle
    real-time streaming and data processing.

    :param sio: AsyncServer instance used for Socket.IO communication.
    :type sio: socketio.AsyncServer
    :param device_id: Identifier for the specific SDR device being used.
    :type device_id: int
    :param client_id: Identifier for the client connected to process the SDR data.
    :type client_id: str
    :return: None
    :rtype: None

    :raises Exception: If any error occurs during SDR data streaming or processing.
    """
    logger.info(f"Processing RTLSDR data for client {client_id}")
    try:
        while client_id in active_sdr_clients and device_id in rtlsdr_devices:
            client = active_sdr_clients[client_id]
            sdr = rtlsdr_devices[device_id]

            # Read samples
            #read_func = partial(sdr.read_samples, NUM_SAMPLES_PER_SCAN)
            #samples = await asyncio.to_thread(read_func)

            num_samples = calculate_samples_per_scan(sdr.sample_rate)
            samples = sdr.read_samples(num_samples)

            # remove DC spike
            samples = remove_dc_offset(samples)

            # Apply window function to reduce spectral leakage
            fft_size = client['fft_size']
            fft_window = client['fft_window']

            # Increase virtual resolution 4x
            fft_size = fft_size * 4

            # Select window function based on client preference, fallback to hanning if invalid
            window_func = window_functions.get(fft_window.lower(), np.hanning)
            window = window_func(fft_size)

            # Calculate FFT for multiple segments and average them
            #num_segments = len(samples) // fft_size
            #fft_result = np.zeros(actual_fft_size)

            # Calculate FFT for overlapping segments (50% overlap)
            num_segments = (len(samples) - fft_size // 2) // (fft_size // 2)
            fft_result = np.zeros(fft_size)

            for i in range(num_segments):
                # Start with 50% overlap
                start_idx = i * (fft_size // 2)
                segment = samples[start_idx:start_idx + fft_size]

                #segment = samples[i * fft_size:(i + 1) * fft_size]
                windowed_segment = segment * window

                # Perform FFT directly without zero padding
                fft_segment = np.fft.fft(windowed_segment)

                # Shift DC to center
                fft_segment = np.fft.fftshift(fft_segment)

                # Convert to dB
                #power = 10 * np.log10(np.abs(fft_segment) ** 2 + 1e-10)
                #fft_result += power

                # Proper power normalization with window correction
                N = len(fft_segment)
                window_correction = 1.0  # Depends on window type used
                power = 10 * np.log10((np.abs(fft_segment) ** 2) / (N * window_correction) + 1e-10)
                fft_result += power

            fft_result /= num_segments  # Average the segments

            # Send FFT data to the client
            await sio.emit('sdr-fft-data', fft_result.tolist(), room=client_id)
            logger.debug(f"FFT data sent to client {client_id}")

            # Brief pause to prevent overwhelming the network
            await asyncio.sleep(0.01)

    except Exception as e:
        logger.error(f"Error processing RTLSDR data: {str(e)}")
        logger.exception(e)
        await sio.emit('sdr-error', {'message': f"RTLSDR error: {str(e)}"}, room=client_id)

    finally:
        # Clean up if the loop exits
        if client_id in active_sdr_clients and active_sdr_clients[client_id].get('task'):
            active_sdr_clients[client_id]['task'] = None


def remove_dc_offset(samples):
    """
    Remove DC offset by subtracting the mean

    Args:
        samples: Complex samples

    Returns:
        Samples with DC offset removed
    """
    # Calculate the mean of the complex samples
    mean_i = np.mean(np.real(samples))
    mean_q = np.mean(np.imag(samples))

    # Subtract the mean
    samples_no_dc = samples - (mean_i + 1j*mean_q)

    return samples_no_dc
