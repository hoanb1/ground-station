# flake8: noqa
# pylint: skip-file
# type: ignore

import logging
import math
import time
from collections import deque

import numpy as np

# Configure logging for the worker process
logger = logging.getLogger("uhd-worker")

try:
    import uhd
except ImportError:
    uhd = None
    logging.warning("UHD library not found. UHD functionality will not be available.")


def uhd_worker_process(
    config_queue, data_queue, stop_event, iq_queue_fft=None, iq_queue_demod=None
):
    """
    Worker process for UHD operations.

    This function runs in a separate process to avoid segmentation faults.
    It receives configuration through a queue, streams IQ data to separate queues,
    and sends status/error messages through data_queue.

    Args:
        config_queue: Queue for receiving configuration from the main process
        data_queue: Queue for sending processed data back to the main process
        stop_event: Event to signal the process to stop
        iq_queue_fft: Queue for streaming raw IQ samples to FFT processor
        iq_queue_demod: Queue for streaming raw IQ samples to demodulators
    """

    if uhd is None:
        error_msg = "UHD library not available. Cannot start UHD worker."
        logger.error(error_msg)
        data_queue.put(
            {"type": "error", "client_id": None, "message": error_msg, "timestamp": time.time()}
        )
        data_queue.put(
            {
                "type": "terminated",
                "client_id": None,
                "message": error_msg,
                "timestamp": time.time(),
            }
        )

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
        sdr_id = config.get("sdr_id")
        serial_number = config.get("serial_number")
        client_id = config.get("client_id")
        fft_size = config.get("fft_size", 16384)
        fft_window = config.get("fft_window", "hanning")

        # FFT averaging configuration (passed to IQ consumers)
        fft_averaging = config.get("fft_averaging", 8)

        # FFT overlap (passed to IQ consumers)
        fft_overlap = config.get("fft_overlap", False)

        # Track whether we have IQ consumers
        has_iq_consumers = iq_queue_fft is not None or iq_queue_demod is not None

        # Sample accumulation mode: 'accumulate', 'zero-pad', or 'drop'
        insufficient_samples_mode = config.get("insufficient_samples_mode", "drop")

        # Connect to the UHD device
        logger.info(f"Connecting to UHD device with serial: {serial_number}...")

        # A confusing issue exists when selecting an SDR with serial=XXXXXX, some times it does
        # not work inside docker containers, the method below is a workaround to fix this issue,
        # it will look up all devices, lookup the one we want based on the serial and then use every
        # other attribute to construct the device args string.

        if serial_number:
            logger.info(f"Looking for device with serial: {serial_number}")

            # Discover all USRP devices (no type filter)
            discovered_devices = uhd.find("")
            logger.info(f"Found {len(discovered_devices)} USRP device(s)")

            # Find the device matching the serial
            device_args = None
            for dev in discovered_devices:
                dev_string = dev.to_string()
                logger.info(f"Discovered: {dev_string}")

                # Parse to check serial
                if f"serial={serial_number}" in dev_string:
                    # Use the discovery string but remove the serial key to avoid lookup failure
                    # Keep other identifiers like type, name, product, addr (for network devices)
                    parts = dev_string.split(",")
                    filtered_parts = [p for p in parts if not p.startswith("serial=")]
                    device_args = ",".join(filtered_parts)
                    logger.info(f"Matched device, using args: {device_args}")
                    break

            if not device_args:
                raise Exception(f"Device with serial {serial_number} not found")
        else:
            device_args = ""
            logger.info(f"No serial specified, will connect to first available device")

        # Create UHD device
        UHD = uhd.usrp.MultiUSRP(device_args)

        # Get device info
        device_info = UHD.get_pp_string()
        logger.info(f"Connected to UHD: {device_info}")

        # Configure the device
        channel = config.get("channel", 0)
        antenna = config.get("antenna", "RX2")

        # Set antenna
        UHD.set_rx_antenna(antenna, channel)

        # Configure basic parameters
        center_freq = config.get("center_freq", 100e6)
        sample_rate = config.get("sample_rate", 2.048e6)
        gain = config.get("gain", 25.0)
        # Add support for offset frequency (downconverter)
        offset_freq = config.get("offset_freq", 0.0)

        UHD.set_rx_rate(sample_rate, channel)

        # Apply offset frequency if specified
        if offset_freq != 0.0:
            # Create a tune request with offset
            tune_request = uhd.types.TuneRequest(center_freq + offset_freq)
            tune_request.rf_freq = center_freq + offset_freq
            tune_request.dsp_freq = -offset_freq  # Compensate with DSP frequency
            UHD.set_rx_freq(tune_request, channel)
            logger.info(f"Applied offset frequency: {offset_freq} Hz")
        else:
            UHD.set_rx_freq(uhd.types.TuneRequest(center_freq), channel)

        UHD.set_rx_gain(gain, channel)

        # Allow time for the UHD to settle
        time.sleep(0.01)

        # Verify actual settings
        actual_rate = UHD.get_rx_rate(channel)
        actual_freq = UHD.get_rx_freq(channel)
        actual_gain = UHD.get_rx_gain(channel)

        logger.info(
            f"UHD configured: sample_rate={actual_rate}, center_freq={actual_freq}, gain={actual_gain}, offset_freq={offset_freq}"
        )

        # Setup streaming with smaller buffer sizes to prevent overflow
        stream_args = uhd.usrp.StreamArgs("fc32", "sc16")
        stream_args.channels = [channel]
        # Set smaller buffer sizes to reduce latency and prevent overflow
        stream_args.args = uhd.types.DeviceAddr("num_recv_frames=128,recv_frame_size=4096")
        streamer = UHD.get_rx_stream(stream_args)

        # Calculate the number of samples based on sample rate
        num_samples = calculate_samples_per_scan(actual_rate, fft_size)

        # Create receive buffer
        recv_buffer = np.zeros((1, num_samples), dtype=np.complex64)

        # Initialize sample accumulation buffer
        accumulated_samples = deque()
        max_accumulation_size = fft_size * 4  # Prevent excessive memory usage

        # Start streaming
        stream_cmd = uhd.types.StreamCMD(uhd.types.StreamMode.start_cont)
        stream_cmd.stream_now = True
        streamer.issue_stream_cmd(stream_cmd)

        # if we reached here, we can set the UI to streaming
        data_queue.put(
            {
                "type": "streamingstart",
                "client_id": client_id,
                "message": None,
                "timestamp": time.time(),
            }
        )

        # Main processing loop
        while not stop_event.is_set():
            # Check for new configuration without blocking
            try:
                if not config_queue.empty():
                    new_config = config_queue.get_nowait()

                    if "sample_rate" in new_config:
                        if actual_rate != new_config["sample_rate"]:
                            # Stop streaming before changing sample rate - fix stream mode
                            stream_cmd = uhd.types.StreamCMD(uhd.types.StreamMode.stop_cont)
                            streamer.issue_stream_cmd(stream_cmd)

                            UHD.set_rx_rate(new_config["sample_rate"], channel)
                            actual_rate = UHD.get_rx_rate(channel)

                            # Calculate a new number of samples
                            num_samples = calculate_samples_per_scan(actual_rate, fft_size)
                            recv_buffer = np.zeros((1, num_samples), dtype=np.complex64)

                            # Clear accumulated samples when sample rate changes
                            accumulated_samples.clear()

                            # Restart streaming
                            stream_cmd = uhd.types.StreamCMD(uhd.types.StreamMode.start_cont)
                            stream_cmd.stream_now = True
                            streamer.issue_stream_cmd(stream_cmd)

                            logger.info(f"Updated sample rate: {actual_rate}")

                    if "center_freq" in new_config:
                        if actual_freq != new_config["center_freq"]:
                            # Stop streaming to flush buffers
                            stream_cmd = uhd.types.StreamCMD(uhd.types.StreamMode.stop_cont)
                            streamer.issue_stream_cmd(stream_cmd)

                            # Update center frequency
                            center_freq = new_config["center_freq"]

                            # Set new frequency with current offset
                            if offset_freq != 0.0:
                                # Create tune request with offset
                                tune_request = uhd.types.TuneRequest(center_freq + offset_freq)
                                tune_request.rf_freq = center_freq + offset_freq
                                tune_request.dsp_freq = (
                                    -offset_freq
                                )  # Compensate with DSP frequency
                                UHD.set_rx_freq(tune_request, channel)
                            else:
                                UHD.set_rx_freq(uhd.types.TuneRequest(center_freq), channel)

                            actual_freq = UHD.get_rx_freq(channel)

                            # Clear accumulated samples to prevent mixing old/new frequency data
                            accumulated_samples.clear()

                            # Restart streaming
                            stream_cmd = uhd.types.StreamCMD(uhd.types.StreamMode.start_cont)
                            stream_cmd.stream_now = True
                            streamer.issue_stream_cmd(stream_cmd)

                            logger.info(f"Updated center frequency: {actual_freq}")

                    if "offset_freq" in new_config:
                        if offset_freq != new_config["offset_freq"]:
                            # Stop streaming to flush buffers
                            stream_cmd = uhd.types.StreamCMD(uhd.types.StreamMode.stop_cont)
                            streamer.issue_stream_cmd(stream_cmd)

                            # Update offset frequency
                            offset_freq = new_config["offset_freq"]

                            # Set frequency with new offset
                            if offset_freq != 0.0:
                                # Create tune request with offset
                                tune_request = uhd.types.TuneRequest(center_freq + offset_freq)
                                tune_request.rf_freq = center_freq + offset_freq
                                tune_request.dsp_freq = (
                                    -offset_freq
                                )  # Compensate with DSP frequency
                                UHD.set_rx_freq(tune_request, channel)
                                logger.info(f"Updated offset frequency: {offset_freq}")
                            else:
                                UHD.set_rx_freq(uhd.types.TuneRequest(center_freq), channel)
                                logger.info(f"Disabled offset frequency")

                            actual_freq = UHD.get_rx_freq(channel)

                            # Clear accumulated samples to prevent mixing old/new frequency data
                            accumulated_samples.clear()

                            # Restart streaming
                            stream_cmd = uhd.types.StreamCMD(uhd.types.StreamMode.start_cont)
                            stream_cmd.stream_now = True
                            streamer.issue_stream_cmd(stream_cmd)

                    if "gain" in new_config:
                        if actual_gain != new_config["gain"]:
                            UHD.set_rx_gain(new_config["gain"], channel)
                            actual_gain = UHD.get_rx_gain(channel)
                            logger.info(f"Updated gain: {actual_gain}")

                    if "fft_size" in new_config:
                        if old_config.get("fft_size", 0) != new_config["fft_size"]:
                            fft_size = new_config["fft_size"]
                            max_accumulation_size = fft_size * 4

                            # Clear accumulated samples when FFT size changes
                            accumulated_samples.clear()

                            # Update num_samples when FFT size changes
                            num_samples = calculate_samples_per_scan(actual_rate, fft_size)

                            # Create receive buffer
                            recv_buffer = np.zeros((1, num_samples), dtype=np.complex64)

                            logger.info(f"Updated FFT size: {fft_size}")

                    if "fft_window" in new_config:
                        if old_config.get("fft_window", None) != new_config["fft_window"]:
                            fft_window = new_config["fft_window"]
                            logger.info(f"Updated FFT window: {fft_window}")

                    if "fft_averaging" in new_config:
                        if old_config.get("fft_averaging", 4) != new_config["fft_averaging"]:
                            fft_averaging = new_config["fft_averaging"]
                            # FFT averaging is now handled by FFT processor
                            logger.info(f"Updated FFT averaging: {fft_averaging}")

                    if "fft_overlap" in new_config:
                        if old_config.get("fft_overlap", True) != new_config["fft_overlap"]:
                            fft_overlap = new_config["fft_overlap"]
                            logger.info(f"Updated FFT overlap: {fft_overlap}")

                    if "antenna" in new_config:
                        if old_config.get("antenna", None) != new_config["antenna"]:
                            UHD.set_rx_antenna(new_config["antenna"], channel)
                            logger.info(f"Updated antenna: {new_config['antenna']}")

                    if "insufficient_samples_mode" in new_config:
                        if (
                            old_config.get("insufficient_samples_mode", None)
                            != new_config["insufficient_samples_mode"]
                        ):
                            insufficient_samples_mode = new_config["insufficient_samples_mode"]
                            # Clear accumulated samples when mode changes to avoid mixed behavior
                            accumulated_samples.clear()
                            logger.info(
                                f"Updated insufficient samples mode: {insufficient_samples_mode}"
                            )

                    old_config = new_config

            except Exception as e:
                error_msg = f"Error processing configuration: {str(e)}"
                logger.error(error_msg)
                logger.exception(e)

                # Send error back to the main process
                if data_queue:
                    data_queue.put(
                        {
                            "type": "error",
                            "client_id": client_id,
                            "message": error_msg,
                            "timestamp": time.time(),
                        }
                    )

            try:
                # Read samples from UHD with a shorter timeout
                metadata = uhd.types.RXMetadata()
                num_rx_samples = streamer.recv(recv_buffer, metadata, 0.05)

                if metadata.error_code != uhd.types.RXMetadataErrorCode.none:
                    if metadata.error_code == uhd.types.RXMetadataErrorCode.overflow:
                        logger.warning("Receiver overflow - skipping frame")
                        # Skip this frame and continue to prevent accumulation
                        continue
                    else:
                        logger.warning(f"Receiver error: {metadata.strerror()} - skipping frame")
                        continue

                # Skip very small reads
                if num_rx_samples < 256:
                    continue

                # Get the samples from the buffer
                new_samples = recv_buffer[0][:num_rx_samples].copy()

                # Handle samples based on mode
                if insufficient_samples_mode == "accumulate":
                    # Add new samples to the accumulation buffer
                    accumulated_samples.extend(new_samples)

                    # Prevent excessive memory usage
                    while len(accumulated_samples) > max_accumulation_size:
                        accumulated_samples.popleft()

                    # Check if we have enough samples for processing
                    if len(accumulated_samples) >= fft_size:
                        # Extract samples for processing
                        samples_array = np.array(list(accumulated_samples))

                        # Use samples for FFT processing
                        samples = samples_array[: len(samples_array)]

                        # Keep overlap for the next iteration (50% overlap)
                        overlap_size = min(fft_size // 2, len(accumulated_samples) // 2)

                        # Remove processed samples but keep overlap
                        samples_to_remove = len(accumulated_samples) - overlap_size
                        for _ in range(samples_to_remove):
                            if accumulated_samples:
                                accumulated_samples.popleft()

                        logger.debug(
                            f"Processing {len(samples)} accumulated samples, keeping "
                            f"{len(accumulated_samples)} for overlap"
                        )
                    else:
                        # Not enough samples yet, continue accumulating
                        logger.debug(f"Accumulating samples: {len(accumulated_samples)}/{fft_size}")
                        continue

                elif insufficient_samples_mode == "drop":
                    if num_rx_samples < fft_size:
                        logger.debug(
                            f"Dropping frame: received {num_rx_samples} samples, need {fft_size}"
                        )
                        continue
                    samples = new_samples

                elif insufficient_samples_mode == "zero-pad":
                    if num_rx_samples < fft_size:
                        # Pad with zeros to reach FFT size
                        logger.debug(
                            f"Zero-padding frame: received {num_rx_samples} samples, padding to {fft_size}"
                        )
                        padded_samples = np.zeros(fft_size, dtype=np.complex64)
                        padded_samples[:num_rx_samples] = new_samples
                        samples = padded_samples
                    else:
                        samples = new_samples

                else:
                    logger.warning(
                        f"Unknown insufficient_samples_mode: {insufficient_samples_mode}, defaulting to 'accumulate'"
                    )
                    # Fall back to accumulate mode
                    accumulated_samples.extend(new_samples)
                    if len(accumulated_samples) >= fft_size:
                        samples = np.array(list(accumulated_samples)[:fft_size])
                        # Clear processed samples
                        for _ in range(fft_size // 2):
                            if accumulated_samples:
                                accumulated_samples.popleft()
                    else:
                        continue

                # Stream IQ data to consumers (FFT processor, demodulators, etc.)
                # Broadcast to both queues so FFT and demodulation can work independently
                if has_iq_consumers:
                    try:
                        # Prepare IQ message with metadata
                        timestamp = time.time()

                        # Broadcast to FFT queue (for waterfall display)
                        if iq_queue_fft is not None:
                            try:
                                if not iq_queue_fft.full():
                                    iq_message = {
                                        "samples": samples.copy(),
                                        "center_freq": actual_freq,
                                        "sample_rate": actual_rate,
                                        "timestamp": timestamp,
                                        "config": {
                                            "fft_size": fft_size,
                                            "fft_window": fft_window,
                                            "fft_averaging": fft_averaging,
                                            "fft_overlap": fft_overlap,
                                        },
                                    }
                                    iq_queue_fft.put_nowait(iq_message)
                            except Exception as e:
                                pass  # Drop if can't queue

                        # Broadcast to demodulation queue
                        if iq_queue_demod is not None:
                            try:
                                if not iq_queue_demod.full():
                                    # Make a copy for demod queue
                                    demod_message = {
                                        "samples": samples.copy(),
                                        "center_freq": actual_freq,
                                        "sample_rate": actual_rate,
                                        "timestamp": timestamp,
                                    }
                                    iq_queue_demod.put_nowait(demod_message)
                            except Exception as e:
                                pass  # Drop if can't queue

                    except Exception as e:
                        logger.debug(f"Could not queue IQ data: {str(e)}")

            except Exception as e:
                logger.error(f"Error processing SDR data: {str(e)}")
                logger.exception(e)

                # Send error back to the main process
                data_queue.put(
                    {
                        "type": "error",
                        "client_id": client_id,
                        "message": str(e),
                        "timestamp": time.time(),
                    }
                )

                # Short pause before retrying
                time.sleep(0.1)  # Reduced from 1 second

    except Exception as e:
        error_msg = f"Error in UHD worker process: {str(e)}"
        logger.error(error_msg)
        logger.exception(e)

        # Send error back to the main process
        data_queue.put(
            {
                "type": "error",
                "client_id": client_id,
                "message": error_msg,
                "timestamp": time.time(),
            }
        )

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

        # Send termination signal
        data_queue.put(
            {
                "type": "terminated",
                "client_id": client_id,
                "sdr_id": sdr_id,
                "timestamp": time.time(),
            }
        )

        logger.info("UHD worker process terminated")


# Target blocks per second for constant rate streaming
TARGET_BLOCKS_PER_SEC = 15


def calculate_samples_per_scan(sample_rate, fft_size):
    """Calculate number of samples per scan for constant block rate streaming."""
    if fft_size is None:
        fft_size = 16384

    # Calculate block size for constant rate
    # At 1 MHz: 1,000,000 / 10 = 100,000 samples (100ms per block)
    # At 8 MHz: 8,000,000 / 10 = 800,000 samples (100ms per block)
    num_samples = int(sample_rate / TARGET_BLOCKS_PER_SEC)

    # Round up to next power of 2 for efficient FFT processing
    num_samples = 2 ** int(np.ceil(np.log2(num_samples)))

    # Ensure minimum block size (use fft_size as floor)
    num_samples = max(num_samples, fft_size)

    # Cap at reasonable maximum (1M samples)
    num_samples = min(num_samples, 1048576)

    return num_samples
