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

"""VFO (Virtual Frequency Oscillator) handlers."""

from typing import Any, Dict, Optional, Union

from crud.preferences import fetch_all_preferences
from db import AsyncSessionLocal
from demodulators.sstvdecoder import SSTVDecoder
from handlers.entities.sdr import handle_vfo_demodulator_state
from sdr.sdrprocessmanager import sdr_process_manager
from session.tracker import session_tracker
from vfos.state import VFOManager


async def update_vfo_parameters(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, dict, str]]:
    """
    Update VFO parameters and manage demodulator state.

    Args:
        sio: Socket.IO server instance
        data: VFO parameters including vfoNumber, frequency, bandwidth, mode, etc.
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status
    """
    logger.debug(f"Updating VFO parameters, data: {data}")

    if not data:
        return {"success": False, "error": "No data provided"}

    vfomanager = VFOManager()
    vfomanager.update_vfo_state(
        session_id=sid,
        vfo_id=data.get("vfoNumber", 0),
        center_freq=int(data["frequency"]) if "frequency" in data else None,
        bandwidth=int(data["bandwidth"]) if "bandwidth" in data else None,
        modulation=data.get("mode") if "mode" in data else None,
        active=data.get("active"),
        selected=data.get("selected"),
        volume=data.get("volume"),
        squelch=data.get("squelch"),
        transcription_enabled=data.get("transcriptionEnabled"),
        transcription_model=data.get("transcriptionModel"),
        transcription_language=data.get("transcriptionLanguage"),
        decoder=data.get("decoder"),
    )

    # Start/stop demodulator based on VFO state (after update)
    vfo_id = data.get("vfoNumber", 0)
    if vfo_id > 0:  # Valid VFO (not deselect-all case)
        vfo_state = vfomanager.get_vfo_state(sid, vfo_id)
        handle_vfo_demodulator_state(vfo_state, sid, logger)

        # Handle decoder state changes
        handle_vfo_decoder_state(vfo_state, sid, logger)

    return {"success": True, "data": {}}


async def toggle_transcription(
    sio: Any, data: Optional[Dict], logger: Any, sid: str
) -> Dict[str, Union[bool, dict, str]]:
    """
    Toggle transcription for a specific VFO.

    Args:
        sio: Socket.IO server instance
        data: {vfoNumber: int, enabled: bool, model?: str, language?: str}
        logger: Logger instance
        sid: Socket.IO session ID

    Returns:
        Dictionary with success status and updated VFO state
    """
    logger.debug(f"Toggling transcription, data: {data}")

    if not data or "vfoNumber" not in data:
        return {"success": False, "error": "vfoNumber is required"}

    vfo_number = data.get("vfoNumber")
    enabled = data.get("enabled", False)

    # Fetch DeBabel URL from preferences and update transcription consumer
    if enabled:
        try:
            async with AsyncSessionLocal() as dbsession:
                prefs_result = await fetch_all_preferences(dbsession)
                if prefs_result["success"]:
                    preferences = prefs_result["data"]
                    debabel_url = next(
                        (p["value"] for p in preferences if p["name"] == "debabel_url"), ""
                    )
                    if debabel_url:
                        from server.shutdown import transcription_consumer

                        if transcription_consumer:
                            transcription_consumer.update_debabel_url(debabel_url)
                            logger.debug(
                                f"Updated transcription consumer with DeBabel URL: {debabel_url}"
                            )
                    else:
                        logger.warning("DeBabel URL not configured in preferences")
                        return {"success": False, "error": "DeBabel URL not configured"}
        except Exception as e:
            logger.error(f"Error fetching DeBabel URL: {e}")
            return {"success": False, "error": f"Failed to fetch DeBabel configuration: {str(e)}"}

    vfomanager = VFOManager()
    vfomanager.update_vfo_state(
        session_id=sid,
        vfo_id=vfo_number,
        transcription_enabled=enabled,
        transcription_model=data.get("model"),
        transcription_language=data.get("language"),
    )

    # Get updated state
    vfo_state = vfomanager.get_vfo_state(sid, vfo_number)

    logger.info(
        f"Transcription {'enabled' if enabled else 'disabled'} for VFO {vfo_number} (session: {sid})"
    )

    return {
        "success": True,
        "data": {
            "vfoNumber": vfo_number,
            "transcriptionEnabled": vfo_state.transcription_enabled if vfo_state else False,
            "transcriptionModel": vfo_state.transcription_model if vfo_state else "small.en",
            "transcriptionLanguage": vfo_state.transcription_language if vfo_state else "en",
        },
    }


def handle_vfo_decoder_state(vfo_state, session_id, logger):
    """
    Start or stop decoder based on VFO decoder setting.

    Args:
        vfo_state: VFO state object
        session_id: Session identifier
        logger: Logger instance
    """
    if not vfo_state:
        return

    # Get SDR ID from SessionTracker
    sdr_id = session_tracker.get_session_sdr(session_id)
    if not sdr_id:
        logger.warning(f"No SDR found for session {session_id}")
        return

    # Check if VFO is active
    if not vfo_state.active:
        # VFO is not active, stop any decoder
        sdr_process_manager.stop_decoder(sdr_id, session_id)
        logger.info(f"Stopped decoder for session {session_id} (VFO inactive)")
        return

    # Get current decoder state
    current_decoder = sdr_process_manager.get_active_decoder(sdr_id, session_id)
    requested_decoder = vfo_state.decoder

    # Map decoder names to classes
    decoder_map = {
        "sstv": SSTVDecoder,
        # Add more decoders as they're implemented:
        # "afsk": AFSKDecoder,
        # "rtty": RTTYDecoder,
        # "psk31": PSK31Decoder,
    }

    # If decoder is "none" or not in map, stop any running decoder
    if requested_decoder == "none" or requested_decoder not in decoder_map:
        if current_decoder:
            sdr_process_manager.stop_decoder(sdr_id, session_id)
            logger.info(f"Stopped decoder for session {session_id}")
        return

    # Check if we need to change decoder
    decoder_class = decoder_map[requested_decoder]

    if current_decoder and isinstance(current_decoder, decoder_class):
        # Same decoder already running, do nothing
        logger.debug(f"Decoder {requested_decoder} already running for session {session_id}")
        return

    # Stop old decoder if running
    if current_decoder:
        sdr_process_manager.stop_decoder(sdr_id, session_id)
        logger.info(f"Stopped old decoder for session {session_id}")

    # Start new decoder
    try:
        process_info = sdr_process_manager.processes.get(sdr_id)
        if not process_info:
            logger.error(f"No SDR process found for {sdr_id}")
            return

        data_queue = process_info["data_queue"]

        success = sdr_process_manager.start_decoder(
            sdr_id=sdr_id,
            session_id=session_id,
            decoder_class=decoder_class,
            data_queue=data_queue,
            output_dir="data/decoded",
            vfo_center_freq=vfo_state.center_freq,  # Pass VFO frequency for internal FM demod
        )

        if success:
            logger.info(f"Started {requested_decoder} decoder for session {session_id}")
        else:
            logger.error(f"Failed to start {requested_decoder} decoder for session {session_id}")

    except Exception as e:
        logger.error(f"Error starting decoder: {e}")
        logger.exception(e)


def register_handlers(registry):
    """Register VFO handlers with the command registry."""
    registry.register_batch(
        {
            "update-vfo-parameters": (update_vfo_parameters, "data_submission"),
            "toggle-transcription": (toggle_transcription, "data_submission"),
        }
    )
