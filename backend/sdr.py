import asyncio
import numpy as np
import socketio
import rtlsdr
from functools import partial
from typing import Dict, List, Optional, Any
from logger import logger


# Store active RTLSDR devices and client connections
rtlsdr_devices: Dict[int, rtlsdr.RtlSdr] = {}
active_clients: Dict[str, Dict[str, Any]] = {}


# FFT processing parameters
WINDOW_FUNCTION = np.hanning
NUM_SAMPLES_PER_SCAN = 1024 * 1024  # Number of samples per scan for FFT


async def process_rtlsdr_data(sio: socketio.AsyncServer, device_id: int, client_id: str):
    """Process RTLSDR data and send FFT results to client"""
    try:
        while client_id in active_clients and device_id in rtlsdr_devices:
            client = active_clients[client_id]
            sdr = rtlsdr_devices[device_id]

            # Configure SDR parameters
            #sdr.center_freq = center_freq
            #sdr.sample_rate = sample_rate
            #sdr.gain = gain

            # Read samples
            samples = sdr.read_samples(NUM_SAMPLES_PER_SCAN)

            # Apply window function to reduce spectral leakage
            fft_size = client['fft_size']
            actual_fft_size = fft_size * 1  # Increase virtual resolution 4x
            window = WINDOW_FUNCTION(fft_size)

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

                # Zero pad to increase virtual resolution
                padded_segment = np.zeros(actual_fft_size, dtype=complex)
                padded_segment[:fft_size] = windowed_segment

                fft_segment = np.fft.fft(padded_segment)
                fft_segment = np.fft.fftshift(fft_segment)  # Shift DC to center
                power = 10 * np.log10(np.abs(fft_segment) ** 2 + 1e-10)  # Convert to dB
                fft_result += power

            fft_result /= num_segments  # Average the segments

            # Send FFT data to client
            await sio.emit('sdr-fft-data', fft_result.tolist(), room=client_id)

            # Brief pause to prevent overwhelming the network
            await asyncio.sleep(0.2)

    except Exception as e:
        logger.error(f"Error processing RTLSDR data: {str(e)}")
        logger.exception(e)
        await sio.emit('sdr-error', {'message': f"RTLSDR error: {str(e)}"}, room=client_id)

    finally:
        # Clean up if the loop exits
        if client_id in active_clients and active_clients[client_id].get('task'):
            active_clients[client_id]['task'] = None

