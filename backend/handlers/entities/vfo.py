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

from sqlalchemy import select

from crud.preferences import fetch_all_preferences
from db import AsyncSessionLocal
from db.models import Transmitters
from demodulators.gmskdecoder import GMSKDecoder
from demodulators.loradecoder import LoRaDecoder
from demodulators.morsedecoder import MorseDecoder
from demodulators.sstvdecoder import SSTVDecoder
from handlers.entities.sdr import handle_vfo_demodulator_state
from processing.processmanager import process_manager
from server.startup import audio_queue
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
    vfo_id = data.get("vfoNumber", 0)

    # Get old VFO state BEFORE update to detect changes
    old_vfo_state = vfomanager.get_vfo_state(sid, vfo_id) if vfo_id > 0 else None
    old_locked_transmitter_id = old_vfo_state.locked_transmitter_id if old_vfo_state else None

    vfomanager.update_vfo_state(
        session_id=sid,
        vfo_id=vfo_id,
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
        locked_transmitter_id=data.get("locked_transmitter_id"),
    )

    # Start/stop demodulator based on VFO state (after update)
    if vfo_id > 0:  # Valid VFO (not deselect-all case)
        vfo_state = vfomanager.get_vfo_state(sid, vfo_id)

        # Handle demodulator state changes ONLY if active state or mode was changed in the update
        # This prevents VFO updates (like selecting a different VFO) from starting/stopping demodulators
        # However, skip demodulator management if the VFO is using a raw IQ decoder (GMSK, LoRa)
        # as these decoders handle demodulation internally
        if "active" in data or "mode" in data:
            # Check if decoder needs raw IQ (GMSK, LoRa don't need audio demodulator)
            raw_iq_decoders = {"gmsk", "lora"}
            if vfo_state.decoder not in raw_iq_decoders:
                handle_vfo_demodulator_state(vfo_state, sid, logger)
            else:
                logger.debug(
                    f"Skipping demodulator for VFO {vfo_id} - decoder {vfo_state.decoder} works on raw IQ"
                )

        # Handle decoder state changes ONLY if decoder field was provided in the update
        # This prevents VFO updates (like selecting a different VFO) from stopping decoders on other VFOs
        if "decoder" in data:
            await handle_vfo_decoder_state(vfo_state, sid, logger)

        # Handle locked_transmitter_id changes - restart decoder to pick up new transmitter settings
        # Only restart if the VALUE actually changed (not just present in update)
        if "locked_transmitter_id" in data and vfo_state.decoder != "none":
            new_locked_transmitter_id = data.get("locked_transmitter_id")
            if old_locked_transmitter_id != new_locked_transmitter_id:
                logger.info(
                    f"Locked transmitter changed for VFO {vfo_id} (from {old_locked_transmitter_id} to {new_locked_transmitter_id}) "
                    f"with active decoder {vfo_state.decoder} - restarting decoder"
                )
                await handle_vfo_decoder_state(vfo_state, sid, logger)

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


async def handle_vfo_decoder_state(vfo_state, session_id, logger):
    """
    Start or stop decoder for a specific VFO based on its decoder setting.

    Note: Currently only ONE decoder can run per session. If a VFO has a decoder,
    it takes over the session's decoder slot.

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

    vfo_number = vfo_state.vfo_number
    requested_decoder = vfo_state.decoder

    # Map decoder names to classes
    decoder_map = {
        "sstv": SSTVDecoder,
        "lora": LoRaDecoder,
        "morse": MorseDecoder,  # Morse code decoder (uses internal SSB/CW demodulator)
        "gmsk": GMSKDecoder,  # GMSK decoder with USP FEC
        # Add more decoders as they're implemented:
        # "afsk": AFSKDecoder,
        # "rtty": RTTYDecoder,
        # "psk31": PSK31Decoder,
    }

    # Get current decoder state
    current_decoder = process_manager.get_active_decoder(sdr_id, session_id)
    current_decoder_vfo = None
    if current_decoder:
        # Check which VFO owns the current decoder
        process_info = process_manager.processes.get(sdr_id)
        if process_info:
            decoder_entry = process_info.get("decoders", {}).get(session_id)
            if isinstance(decoder_entry, dict):
                current_decoder_vfo = decoder_entry.get("vfo_number")

    # Check if VFO is active
    if not vfo_state.active:
        # VFO is not active - if this VFO owns the decoder, stop it
        if current_decoder and current_decoder_vfo == vfo_number:
            process_manager.stop_decoder(sdr_id, session_id)
            logger.info(f"Stopped decoder for session {session_id} VFO {vfo_number} (VFO inactive)")
        return

    # If decoder is "none" or not in map, stop decoder only if THIS VFO owns it
    if requested_decoder == "none" or requested_decoder not in decoder_map:
        if current_decoder and current_decoder_vfo == vfo_number:
            process_manager.stop_decoder(sdr_id, session_id)
            logger.info(f"Stopped decoder for session {session_id} VFO {vfo_number}")
        return

    # This VFO wants a decoder
    decoder_class = decoder_map[requested_decoder]

    # Check if the same decoder is already running for this VFO
    if (
        current_decoder
        and isinstance(current_decoder, decoder_class)
        and current_decoder_vfo == vfo_number
    ):
        # Same decoder already running for this VFO, do nothing
        logger.debug(
            f"Decoder {requested_decoder} already running for session {session_id} VFO {vfo_number}"
        )
        return

    # If another VFO's decoder is running, we need to stop it first (only one decoder per session)
    if current_decoder:
        logger.info(
            f"Stopping decoder from VFO {current_decoder_vfo} to start decoder for VFO {vfo_number}"
        )
        process_manager.stop_decoder(sdr_id, session_id)

    # Start new decoder for this VFO
    try:
        process_info = process_manager.processes.get(sdr_id)
        if not process_info:
            logger.error(f"No SDR process found for {sdr_id}")
            return

        data_queue = process_info["data_queue"]

        # Prepare decoder kwargs
        decoder_kwargs = {
            "sdr_id": sdr_id,
            "session_id": session_id,
            "decoder_class": decoder_class,
            "data_queue": data_queue,
            "audio_out_queue": audio_queue,  # Pass audio queue for UI streaming of demodulated audio
            "output_dir": "data/decoded",
            "vfo_center_freq": vfo_state.center_freq,  # Pass VFO frequency for internal FM demod
            "vfo": vfo_state.vfo_number,  # Pass VFO number for status updates
        }

        # For GMSK decoder, pass transmitter dict if available
        if decoder_class == GMSKDecoder:
            transmitter_info = None

            # If VFO is locked to a transmitter, query it from the database
            if vfo_state.locked_transmitter_id:
                async with AsyncSessionLocal() as db_session:
                    result = await db_session.execute(
                        select(Transmitters).where(
                            Transmitters.id == vfo_state.locked_transmitter_id
                        )
                    )
                    transmitter_record = result.scalar_one_or_none()

                    if transmitter_record:
                        # Convert transmitter record to dict
                        transmitter_info = {
                            "id": transmitter_record.id,
                            "description": transmitter_record.description,
                            "mode": transmitter_record.mode,
                            "baud": transmitter_record.baud,
                            "downlink_low": transmitter_record.downlink_low,
                            "downlink_high": transmitter_record.downlink_high,
                            "center_frequency": vfo_state.center_freq,
                            "bandwidth": vfo_state.bandwidth,
                        }
                        logger.info(
                            f"GMSK decoder using locked transmitter: {transmitter_record.description} "
                            f"(baud: {transmitter_record.baud})"
                        )
                    else:
                        logger.warning(
                            f"Locked transmitter ID {vfo_state.locked_transmitter_id} not found in database"
                        )

            # If no transmitter locked or not found, create a default placeholder
            if not transmitter_info:
                transmitter_info = {
                    "description": f"VFO {vfo_number} Signal",
                    "mode": "GMSK",
                    "center_frequency": vfo_state.center_freq,
                    "bandwidth": vfo_state.bandwidth,
                }
                logger.warning(
                    f"No locked transmitter for GMSK decoder on VFO {vfo_number} - using default settings. "
                    f"Lock a transmitter to use its baud rate."
                )

            decoder_kwargs["transmitter"] = transmitter_info

        success = process_manager.start_decoder(**decoder_kwargs)

        if success:
            logger.info(
                f"Started {requested_decoder} decoder for session {session_id} VFO {vfo_number}"
            )
        else:
            logger.error(
                f"Failed to start {requested_decoder} decoder for session {session_id} VFO {vfo_number}"
            )

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
