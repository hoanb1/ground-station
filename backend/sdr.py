import asyncio
import numpy as np
import socketio
import rtlsdr
import logging
from functools import partial
from typing import Dict, List, Optional, Any
from scipy import interpolate

# configure new logger
logger = logging.getLogger('sdr-data-process')

# Store active RTLSDR devices and client connections
rtlsdr_devices: Dict[int, rtlsdr.RtlSdr] = {}
active_sdr_clients: Dict[str, Dict[str, Any]] = {}

# FFT processing parameters
WINDOW_FUNCTION = np.hanning

# Number of samples per scan for FFT
NUM_SAMPLES_PER_SCAN = 16 * 1024


def add_sdr_session(sid, device_id=None, center_frequency=None, sample_rate=None, gain=None, fft_size=1024):
    active_sdr_clients[sid] = {
        'device_id': device_id,
        'center_frequency': center_frequency,
        'sample_rate': sample_rate,
        'gain': gain,
        'fft_size': fft_size,
        'task': None,
    }


def cleanup_sdr_session(sid):
    # Clean up client resources
    if sid in active_sdr_clients:
        client = active_sdr_clients[sid]
        device_id = client.get('device_id')

        # Cancel any running processing task
        if client.get('task'):
            client['task'].cancel()
            client['task'] = None

        # Close and release the RTLSDR device if it was exclusively used by this client
        if device_id is not None and device_id in rtlsdr_devices:
            # Check if no other clients are using this device
            other_users = [cid for cid, c in active_sdr_clients.items()
                           if cid != sid and c.get('device_id') == device_id]

            if not other_users:
                try:
                    rtlsdr_devices[device_id].close()
                    del rtlsdr_devices[device_id]
                    logger.info(f"Released RTLSDR device {device_id}")
                except Exception as e:
                    logger.error(f"Error closing RTLSDR device: {str(e)}")
                    logger.exception(e)

        # Remove client from active clients
        del active_sdr_clients[sid]

    else:
        logger.warning(f"Client {sid} not found in active clients while cleaning up")


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

            #samples = apply_iq_correction(samples, gain_balance=1.02, phase_balance=0.01)

            # Apply window function to reduce spectral leakage
            fft_size = client['fft_size']

            # Increase virtual resolution 4x
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

                # Shift DC to center
                fft_segment = np.fft.fftshift(fft_segment)

                # Convert to dB
                power = 10 * np.log10(np.abs(fft_segment) ** 2 + 1e-10)
                fft_result += power

                fft_result = interpolate_dc_spike(fft_result)

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


def apply_iq_correction(samples, gain_balance=1.0, phase_balance=0.0):
    """
    Apply IQ balance correction to the complex samples.

    Args:
        samples: Complex IQ samples
        gain_balance: Ratio of I gain to Q gain
        phase_balance: Phase offset between I and Q in radians

    Returns:
        Corrected complex samples
    """
    i = np.real(samples)
    q = np.imag(samples)

    # Apply gain and phase correction
    i_corrected = i
    q_corrected = q * gain_balance

    # Phase correction
    i_out = i_corrected * np.cos(phase_balance) - q_corrected * np.sin(phase_balance)
    q_out = i_corrected * np.sin(phase_balance) + q_corrected * np.cos(phase_balance)

    return i_out + 1j * q_out


def interpolate_dc_spike(spectrum, width=5):
    """
    Interpolate over the DC spike

    Args:
        spectrum: FFT spectrum (shifted so DC is in center)
        width: Width of DC spike to remove (in bins)

    Returns:
        Cleaned spectrum
    """
    center = len(spectrum) // 2
    x = np.arange(len(spectrum))

    # Create mask for bins to interpolate
    mask = np.ones(len(spectrum), dtype=bool)
    mask[center-width:center+width+1] = False

    # Create an interpolation function using only non-DC bins
    f = interpolate.interp1d(x[mask], spectrum[mask],
                             kind='linear',
                             bounds_error=False,
                             fill_value='extrapolate')

    # Create new spectrum with interpolated values
    cleaned = spectrum.copy()
    cleaned[center-width:center+width+1] = f(x[center-width:center+width+1])

    return cleaned
