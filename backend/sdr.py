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

# Number of samples per scan for FFT
NUM_SAMPLES_PER_SCAN = 32 * 1024


async def process_rtlsdr_data(sio: socketio.AsyncServer, device_id: int, client_id: str):
    """Process RTLSDR data and send FFT results to the client"""
    logger.info(f"Processing RTLSDR data for client {client_id}")
    try:
        while client_id in active_sdr_clients and device_id in rtlsdr_devices:
            client = active_sdr_clients[client_id]
            sdr = rtlsdr_devices[device_id]

            # Read samples
            read_func = partial(sdr.read_samples, NUM_SAMPLES_PER_SCAN)
            samples = await asyncio.to_thread(read_func)
            #samples = sdr.read_samples(NUM_SAMPLES_PER_SCAN)

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
