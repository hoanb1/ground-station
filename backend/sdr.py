import asyncio
import numpy as np
import socketio
import rtlsdr
import logging
from functools import partial
from typing import Dict, List, Optional, Any

# configure new logger
logger = logging.getLogger('sdr-data-process')

# Store active RTLSDR devices and client connections
rtlsdr_devices: Dict[int, rtlsdr.RtlSdr] = {}
active_clients: Dict[str, Dict[str, Any]] = {}

# FFT processing parameters
WINDOW_FUNCTION = np.hanning
NUM_SAMPLES_PER_SCAN = 16 * 1024  # Number of samples per scan for FFT


async def process_rtlsdr_data(sio: socketio.AsyncServer, device_id: int, client_id: str):
    """Process RTLSDR data and send FFT results to the client"""
    logger.info(f"Processing RTLSDR data for client {client_id}")
    try:
        while client_id in active_clients and device_id in rtlsdr_devices:
            client = active_clients[client_id]
            sdr = rtlsdr_devices[device_id]

            # Configure SDR parameters
            #sdr.center_freq = center_freq
            #sdr.sample_rate = sample_rate
            #sdr.gain = gain

            # Read samples
            #read_func = partial(sdr.read_samples, NUM_SAMPLES_PER_SCAN)
            #samples = await asyncio.to_thread(read_func)
            samples = sdr.read_samples(NUM_SAMPLES_PER_SCAN)

            # Apply window function to reduce spectral leakage
            fft_size = client['fft_size']

            # Increase virtual resolution 4x (disabled for now)
            fft_size = fft_size * 4
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

                # Perform FFT directly without zero padding
                fft_segment = np.fft.fft(windowed_segment)
                fft_segment = np.fft.fftshift(fft_segment)  # Shift DC to center
                power = 10 * np.log10(np.abs(fft_segment) ** 2 + 1e-10)  # Convert to dB
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
        if client_id in active_clients and active_clients[client_id].get('task'):
            active_clients[client_id]['task'] = None

