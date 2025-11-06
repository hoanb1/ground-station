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

"""VFO updates for satellite tracking with doppler correction."""

import logging

logger = logging.getLogger(__name__)


async def handle_vfo_updates_for_tracking(sockio, tracking_data):
    """
    Handle VFO updates when tracker sends doppler-corrected frequency data.

    For SDR rigs, emit VFO state updates to sessions that have VFOs selected.
    Applies frequency offset for USB/LSB/CW modes to center the signal in the VFO.

    Args:
        sockio: Socket.IO server instance for emitting updates
        tracking_data: Dictionary containing rig_data and tracking_state
    """
    try:
        import crud
        from db import AsyncSessionLocal
        from session.tracker import session_tracker
        from vfos.state import VFOManager

        rig_data = tracking_data.get("rig_data", {})
        tracking_state = tracking_data.get("tracking_state", {})

        # Get the rig being tracked
        rig_id = tracking_state.get("rig_id")
        if not rig_id or rig_id == "none":
            return

        # Get transmitter info for mode/modulation
        transmitter_id = tracking_state.get("transmitter_id")
        transmitter_mode = None

        async with AsyncSessionLocal() as dbsession:
            # Try to get as SDR
            sdr_reply = await crud.hardware.fetch_sdr(dbsession, sdr_id=rig_id)
            if not sdr_reply.get("success") or not sdr_reply.get("data"):
                # Not an SDR, probably a hardware rig - skip VFO updates
                return

            # Fetch transmitter to get mode (if available)
            if transmitter_id and transmitter_id != "none":
                tx_reply = await crud.transmitters.fetch_transmitter(
                    dbsession, transmitter_id=transmitter_id
                )
                if tx_reply.get("success") and tx_reply.get("data"):
                    transmitter_mode = tx_reply["data"].get("mode")

        # This is an SDR - get doppler-corrected frequency
        observed_freq = rig_data.get("observed_freq")
        doppler_shift = rig_data.get("doppler_shift", 0)

        if not observed_freq:
            return

        # Get all sessions tracking this SDR with a VFO selected
        sessions_with_vfos = session_tracker.get_sessions_with_vfo_for_rig(rig_id)

        if not sessions_with_vfos:
            logger.debug(f"No sessions with VFOs selected for SDR {rig_id}")
            return

        # Create a VFO manager instance to emit updates
        vfo_manager = VFOManager()

        # Check if we should auto-activate VFO (only when transitioning to tracking)
        rig_state = tracking_state.get("rig_state")
        should_activate = rig_state == "tracking"

        # Update and emit VFO states for each session
        for session_id, vfo_id in sessions_with_vfos.items():
            try:
                # Convert vfo_id to int
                vfo_number = int(vfo_id)

                # Get current VFO state to check existing bandwidth
                current_vfo = vfo_manager.get_vfo_state(session_id, vfo_number)
                vfo_bandwidth = (
                    current_vfo.bandwidth if current_vfo and current_vfo.bandwidth > 0 else 3000
                )

                # Calculate frequency offset for USB/LSB/CW modes
                # USB/CW: audio is above carrier, offset up by half bandwidth to center
                # LSB: audio is below carrier, offset down by half bandwidth to center
                frequency_offset: float = 0.0
                mode_normalized = transmitter_mode.lower() if transmitter_mode else None

                if mode_normalized in ["usb", "upper sideband", "cw"]:
                    frequency_offset = vfo_bandwidth / 2
                    logger.debug(
                        f"{mode_normalized.upper()} mode detected, applying +{frequency_offset:.0f} Hz offset"
                    )
                elif mode_normalized in ["lsb", "lower sideband"]:
                    frequency_offset = -vfo_bandwidth / 2
                    logger.debug(f"LSB mode detected, applying {frequency_offset:.0f} Hz offset")

                # Apply offset to doppler-corrected frequency
                final_freq = observed_freq + frequency_offset

                # Update VFO state with offset frequency
                # Only set active=True when rig_state is "tracking"
                # Otherwise, only update frequency and preserve user's active state
                # Also set modulation if available from transmitter
                if should_activate:
                    update_params = {
                        "session_id": session_id,
                        "vfo_id": vfo_number,
                        "center_freq": int(final_freq),
                        "active": True,
                    }
                    if transmitter_mode:
                        update_params["modulation"] = transmitter_mode.lower()
                    vfo_manager.update_vfo_state(**update_params)
                else:
                    # Only update frequency and modulation, don't touch active state
                    update_params = {
                        "session_id": session_id,
                        "vfo_id": vfo_number,
                        "center_freq": int(final_freq),
                    }
                    if transmitter_mode:
                        update_params["modulation"] = transmitter_mode.lower()
                    vfo_manager.update_vfo_state(**update_params)

                # Emit VFO states to this specific session
                await vfo_manager.emit_vfo_states(sockio, session_id)

                logger.debug(
                    f"Emitted VFO {vfo_id} update to session {session_id}: "
                    f"base_freq={observed_freq:.0f} Hz, offset={frequency_offset:.0f} Hz, "
                    f"final_freq={final_freq:.0f} Hz, mode={transmitter_mode}, "
                    f"bandwidth={vfo_bandwidth} Hz, doppler={doppler_shift:.0f} Hz, "
                    f"auto_activate={should_activate}"
                )

            except Exception as e:
                logger.error(f"Error updating VFO for session {session_id}: {e}")

    except Exception as e:
        logger.error(f"Error in handle_vfo_updates_for_tracking: {e}")
        logger.exception(e)
