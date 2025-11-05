# Copyright (c) 2025 Efstratios Goudelis
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

from typing import Dict, Union

import crud
from db import AsyncSessionLocal
from handlers.filebrowser import emit_file_browser_state
from sdr.sdrprocessmanager import sdr_process_manager
from sdr.utils import active_sdr_clients, add_sdr_session, cleanup_sdr_session, get_sdr_session
from server.startup import audio_queue


async def sdr_data_request_routing(sio, cmd, data, logger, client_id):

    async with AsyncSessionLocal() as dbsession:
        reply: Dict[str, Union[bool, None, dict, list, str]] = {"success": False, "data": None}

        logger.info(f"SDR command received: {cmd}")

        if cmd == "configure-sdr":
            try:
                # SDR device id
                sdr_id = data.get("selectedSDRId", None)

                logger.info(f"Configuring SDR {sdr_id} for client {client_id}")

                # Handle hardcoded sigmfplayback SDR
                if sdr_id == "sigmf-playback":
                    sdr_device = {
                        "id": "sigmf-playback",
                        "name": "SigMF Playback",
                        "type": "sigmfplayback",
                        "driver": "sigmfplayback",
                        "serial": None,
                        "host": None,
                        "port": None,
                        "frequency_min": 0,
                        "frequency_max": 6000000000,
                    }
                else:
                    # Fetch SDR device details from database
                    sdr_device_reply = await crud.hardware.fetch_sdr(dbsession, sdr_id)
                    if not sdr_device_reply["success"] or not sdr_device_reply["data"]:
                        raise Exception(f"SDR device with id {sdr_id} not found in database")

                    sdr_device = sdr_device_reply["data"]
                sdr_serial = sdr_device.get("serial", 0)
                sdr_host = sdr_device.get("host", None)
                sdr_port = sdr_device.get("port", None)

                # Default to 100 MHz
                center_freq = data.get("centerFrequency", 100e6)

                # Validate center frequency against device limits
                frequency_range = sdr_device.get(
                    "frequency_range", {"min": float("-inf"), "max": float("inf")}
                )
                # Type check: ensure frequency_range is a dict
                if isinstance(frequency_range, dict):
                    freq_min = frequency_range.get("min", float("-inf"))
                    freq_max = frequency_range.get("max", float("inf"))
                    if isinstance(freq_min, (int, float)) and isinstance(freq_max, (int, float)):
                        if not (freq_min * 1e6 <= center_freq <= freq_max * 1e6):
                            raise Exception(
                                f"Center frequency {center_freq / 1e6:.2f} MHz is outside device limits "
                                f"({freq_min:.2f} MHz - {freq_max:.2f} MHz)"
                            )

                # Default to 2.048 MSPS
                sample_rate = data.get("sampleRate", 2.048e6)

                # Default to 20 dB gain
                gain = data.get("gain", 20)

                # Default FFT size
                fft_size = data.get("fftSize", 1024)

                # Enable/disable Bias-T
                bias_t = data.get("biasT", False)

                # Read tuner AGC setting
                tuner_agc = data.get("tunerAgc", False)

                # Read AGC mode
                rtl_agc = data.get("rtlAgc", False)

                # Read the FFT window
                fft_window = data.get("fftWindow", "hanning")

                # FFT Averaging
                fft_averaging = data.get("fftAveraging", 1)

                # Antenna port
                antenna = data.get("antenna", None)

                # Soapy AGC
                soapy_agc = data.get("soapyAgc", False)

                # Offset frequency for downconverters and upconverters
                offset_freq = data.get("offsetFrequency", 0)

                # Recording path for sigmfplayback
                recording_path = data.get("recordingPath", "")

                # SDR configuration dictionary
                sdr_config = {
                    "center_freq": center_freq,
                    "sample_rate": sample_rate,
                    "gain": gain,
                    "fft_size": fft_size,
                    "bias_t": bias_t,
                    "tuner_agc": tuner_agc,
                    "rtl_agc": rtl_agc,
                    "fft_window": fft_window,
                    "fft_averaging": fft_averaging,
                    "antenna": antenna,
                    "sdr_id": sdr_id,
                    "recording_path": recording_path,
                    "serial_number": sdr_serial,
                    "host": sdr_host,
                    "port": sdr_port,
                    "client_id": client_id,
                    "soapy_agc": soapy_agc,
                    "offset_freq": offset_freq,
                }

                # Create an SDR session entry in memory
                logger.info(f"Creating an SDR session for client {client_id}")
                add_sdr_session(client_id, sdr_config)

                # Check if other clients are already connected in the same room (SDR),
                # if so then send them an update
                if sdr_process_manager.processes.get(sdr_id, None) is not None:
                    other_clients = [
                        client
                        for client in sdr_process_manager.processes[sdr_id]["clients"]
                        if client != client_id
                    ]

                    # For every other client id, send an update
                    for other_client in other_clients:
                        await sio.emit("sdr-config", sdr_config, room=other_client)

                is_running = sdr_process_manager.is_sdr_process_running(sdr_id)
                if is_running:
                    logger.info(
                        f"Updating SDR configuration for client {client_id} with SDR id: {sdr_id}"
                    )
                    await sdr_process_manager.update_configuration(sdr_id, sdr_config)

                reply["success"] = True

            except Exception as e:
                logger.error(f"Error configuring SDR: {str(e)}")
                logger.exception(e)
                await sio.emit(
                    "sdr-config-error",
                    {"message": f"Failed to configure SDR: {str(e)}"},
                    room=client_id,
                )
                reply["success"] = False

        elif cmd == "start-streaming":

            try:
                # SDR device id
                sdr_id = data.get("selectedSDRId", None)

                # Handle hardcoded sigmfplayback SDR
                if sdr_id == "sigmf-playback":
                    sdr_device = {
                        "id": "sigmf-playback",
                        "name": "SigMF Playback",
                        "type": "sigmfplayback",
                        "driver": "sigmfplayback",
                        "serial": None,
                        "host": None,
                        "port": None,
                    }
                else:
                    # Fetch SDR device details from database
                    sdr_device_reply = await crud.hardware.fetch_sdr(dbsession, sdr_id)
                    if not sdr_device_reply["success"] or not sdr_device_reply["data"]:
                        raise Exception(f"SDR device with id {sdr_id} not found in database")

                    sdr_device = sdr_device_reply["data"]

                if client_id not in active_sdr_clients:
                    raise Exception(f"Client with id: {client_id} not registered")

                sdr_config = get_sdr_session(client_id)
                logger.info(f"Starting streaming SDR data for client {client_id}")

                # Start or join the SDR process
                process_sdr_id = await sdr_process_manager.start_sdr_process(
                    sdr_device, sdr_config, client_id
                )
                logger.info(
                    f"SDR process started for client {client_id} with process id: {process_sdr_id}"
                )

            except Exception as e:
                logger.error(f"Error starting SDR stream: {str(e)}")
                logger.exception(e)
                await sio.emit(
                    "sdr-error",
                    {"message": f"Failed to start SDR stream: {str(e)}"},
                    room=client_id,
                )
                reply["success"] = False

        elif cmd == "stop-streaming":

            try:
                # SDR device id
                sdr_id = data.get("selectedSDRId", None)

                # Handle hardcoded sigmfplayback SDR
                if sdr_id == "sigmf-playback":
                    sdr_device = {
                        "id": "sigmf-playback",
                        "name": "SigMF Playback",
                        "type": "sigmfplayback",
                    }
                else:
                    # Fetch SDR device details from database
                    sdr_device_reply = await crud.hardware.fetch_sdr(dbsession, sdr_id)
                    if not sdr_device_reply["success"] or not sdr_device_reply["data"]:
                        raise Exception(f"SDR device with id {sdr_id} not found in database")

                    sdr_device = sdr_device_reply["data"]

                get_sdr_session(client_id)

                if sdr_id:
                    # Stop or leave the SDR process
                    await sdr_process_manager.stop_sdr_process(sdr_id, client_id)

                if client_id not in active_sdr_clients:
                    logger.error(f"Client {client_id} not registered while stopping SDR stream")
                    reply["success"] = False

                # cleanup
                await cleanup_sdr_session(client_id)

                await sio.emit("sdr-status", {"streaming": False}, room=client_id)
                logger.info(f"Stopped streaming SDR data for client {client_id}")

            except Exception as e:
                logger.error(f"Error stopping SDR stream: {str(e)}")
                logger.exception(e)
                await sio.emit(
                    "sdr-error", {"message": f"Failed to stop SDR stream: {str(e)}"}, room=client_id
                )
                reply["success"] = False

        elif cmd == "start-recording":
            try:
                from server.recorder import start_recording

                sdr_id = data.get("selectedSDRId", None)
                recording_name = data.get("recordingName", "")
                target_satellite_norad_id = data.get("targetSatelliteNoradId", "")
                target_satellite_name = data.get("targetSatelliteName", "")

                result = start_recording(
                    sdr_id,
                    client_id,
                    recording_name,
                    target_satellite_norad_id,
                    target_satellite_name,
                )
                reply.update(result)

                # Emit file browser state update so all clients see the new recording
                if result.get("success"):
                    await emit_file_browser_state(
                        sio,
                        {
                            "action": "recording-started",
                            "recording_name": recording_name,
                        },
                        logger,
                    )

            except Exception as e:
                logger.error(f"Error starting recording: {str(e)}")
                logger.exception(e)
                await sio.emit(
                    "sdr-error",
                    {"message": f"Failed to start recording: {str(e)}"},
                    room=client_id,
                )
                reply["success"] = False
                reply["error"] = str(e)

        elif cmd == "stop-recording":
            try:
                from server.recorder import stop_recording

                sdr_id = data.get("selectedSDRId", None)
                waterfall_image = data.get("waterfallImage", None)

                if waterfall_image:
                    logger.info(
                        f"stop-recording command received with waterfall image, length: {len(waterfall_image)} characters"
                    )
                else:
                    logger.info("stop-recording command received without waterfall image")

                result = stop_recording(sdr_id, client_id, waterfall_image)
                reply.update(result)

                # Emit file browser state update so all clients see the completed recording
                if result.get("success"):
                    await emit_file_browser_state(
                        sio,
                        {
                            "action": "recording-stopped",
                            "recording_path": result.get("data", {}).get("recording_path"),
                        },
                        logger,
                    )

            except Exception as e:
                logger.error(f"Error stopping recording: {str(e)}")
                logger.exception(e)
                await sio.emit(
                    "sdr-error",
                    {"message": f"Failed to stop recording: {str(e)}"},
                    room=client_id,
                )
                reply["success"] = False
                reply["error"] = str(e)

        elif cmd == "save-waterfall-snapshot":
            try:
                from server.snapshots import save_waterfall_snapshot

                waterfall_image = data.get("waterfallImage", None)
                snapshot_name = data.get("snapshotName", "")

                result = save_waterfall_snapshot(waterfall_image, snapshot_name)

                if result["success"]:
                    reply["success"] = True
                    reply["data"] = {"snapshot_path": result["snapshot_path"]}

                    # Emit file browser state update so all clients see the new snapshot
                    await emit_file_browser_state(
                        sio,
                        {
                            "action": "snapshot-saved",
                            "snapshot_path": result["snapshot_path"],
                        },
                        logger,
                    )
                else:
                    raise Exception(result.get("error", "Unknown error"))

            except Exception as e:
                logger.error(f"Error saving waterfall snapshot: {str(e)}")
                await sio.emit(
                    "sdr-error",
                    {"message": f"Failed to save waterfall snapshot: {str(e)}"},
                    room=client_id,
                )
                reply["success"] = False
                reply["error"] = str(e)

        else:
            logger.error(f"Unknown SDR command: {cmd}")

    return reply


def start_demodulator_for_mode(mode, sdr_id, session_id, logger):
    """
    Start the appropriate demodulator based on modulation mode.

    Args:
        mode: Modulation mode (fm, am, usb, lsb)
        sdr_id: SDR device identifier
        session_id: Session identifier
        logger: Logger instance

    Returns:
        bool: True if demodulator was started, False otherwise
    """
    mode = mode.lower()

    if mode == "fm":
        from demodulators.fmdemodulator import FMDemodulator

        result = sdr_process_manager.start_demodulator(
            sdr_id, session_id, FMDemodulator, audio_queue
        )
        if result:
            logger.debug(f"FM demodulator ensured for session {session_id} on SDR {sdr_id}")
        return result

    elif mode in ["usb", "lsb"]:
        from demodulators.ssbdemodulator import SSBDemodulator

        result = sdr_process_manager.start_demodulator(
            sdr_id, session_id, SSBDemodulator, audio_queue, mode=mode
        )
        if result:
            logger.debug(
                f"SSB demodulator ({mode.upper()}) ensured for session {session_id} on SDR {sdr_id}"
            )
        return result

    elif mode == "am":
        from demodulators.amdemodulator import AMDemodulator

        result = sdr_process_manager.start_demodulator(
            sdr_id, session_id, AMDemodulator, audio_queue
        )
        if result:
            logger.debug(f"AM demodulator ensured for session {session_id} on SDR {sdr_id}")
        return result

    else:
        logger.warning(f"Unknown modulation mode: {mode}")
        return False


def handle_vfo_demodulator_state(vfo_state, session_id, logger):
    """
    Start or stop demodulator based on VFO active state.

    Args:
        vfo_state: VFO state object
        session_id: Session identifier
        logger: Logger instance
    """
    if not vfo_state:
        return

    sdr_id = sdr_process_manager.session_to_sdr.get(session_id)
    if not sdr_id:
        return

    if vfo_state.active:
        # VFO is active, start appropriate demodulator
        start_demodulator_for_mode(vfo_state.modulation, sdr_id, session_id, logger)
    else:
        # VFO is inactive, stop demodulator
        sdr_process_manager.stop_demodulator(sdr_id, session_id)
        logger.info(f"Stopped demodulator for session {session_id}")
