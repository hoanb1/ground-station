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

import crud
from db import AsyncSessionLocal
from session.tracker import session_tracker
from vfos.state import VFOManager

logger = logging.getLogger("vfo-state")


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

        # Check if we should auto-activate VFO (only when transitioning to tracking)
        rig_state = tracking_state.get("rig_state")

        # When tracking stops, unlock all VFOs for sessions tracking this rig
        if rig_state != "tracking":
            # Get all sessions tracking this SDR with a VFO selected
            sessions_with_vfos = session_tracker.get_sessions_with_vfo_for_rig(rig_id)

            if sessions_with_vfos:
                vfo_manager = VFOManager()
                for session_id, vfo_id in sessions_with_vfos.items():
                    try:
                        # Unlock all VFOs (1-4) for this session
                        for vfo_num in range(1, 5):
                            vfo_manager.update_vfo_state(
                                session_id=session_id,
                                vfo_id=vfo_num,
                                locked=False,
                            )
                        await vfo_manager.emit_vfo_states(sockio, session_id)
                        logger.debug(
                            f"Unlocked all VFOs for session {session_id} (tracking stopped)"
                        )
                    except Exception as e:
                        logger.error(f"Error unlocking VFOs for session {session_id}: {e}")

            # Clear initialization state so when tracking restarts, VFOs get re-initialized
            session_tracker.clear_vfo_initialization_state()
            # Return early - no need to process tracking updates when not tracking
            return

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

                # Normalize digital modes to FM for VFO demodulation
                # Digital modes (FSK/AFSK/PSK/BPSK/QPSK/GMSK) are transmitted over FM carriers
                mode_normalized = transmitter_mode.lower() if transmitter_mode else None
                if mode_normalized in [
                    "fsk",
                    "afsk",
                    "psk",
                    "bpsk",
                    "qpsk",
                    "gmsk",
                    "gmsk usp",
                    "fmn",
                ]:
                    mode_normalized = "fm"
                    logger.debug(
                        f"Digital mode {transmitter_mode} mapped to FM for VFO demodulation"
                    )

                # Use the doppler-corrected frequency directly
                # The VFO visualization handles bandwidth positioning based on mode
                final_freq = observed_freq

                # Check if this session's VFO has been initialized for this tracking session
                is_first_tracking_update = (
                    rig_state == "tracking"
                    and not session_tracker.is_vfo_initialized(session_id, vfo_number)
                )

                if is_first_tracking_update:
                    session_tracker.mark_vfo_initialized(session_id, vfo_number)

                # Update VFO state
                # Only set active=True and modulation on first tracking update for this session
                # Otherwise, only update frequency to preserve user's manual settings
                if is_first_tracking_update:
                    # Transitioning to tracking - set frequency, activate VFO, set modulation, and lock
                    update_params = {
                        "session_id": session_id,
                        "vfo_id": vfo_number,
                        "center_freq": int(final_freq),
                        "active": True,
                        "locked": True,
                    }
                    if mode_normalized:
                        update_params["modulation"] = mode_normalized.upper()
                    vfo_manager.update_vfo_state(**update_params)
                    # Emit full VFO states on first update to set initial mode/active state
                    await vfo_manager.emit_vfo_states(sockio, session_id)
                else:
                    # Already tracking - only update frequency, preserve user's modulation/active state
                    update_params = {
                        "session_id": session_id,
                        "vfo_id": vfo_number,
                        "center_freq": int(final_freq),
                        "locked": True,
                    }
                    vfo_manager.update_vfo_state(**update_params)
                    # Emit only frequency update to avoid overwriting user's bandwidth/mode changes
                    await vfo_manager.emit_vfo_frequency_update(sockio, session_id, vfo_number)

                logger.debug(
                    f"Emitted VFO {vfo_id} update to session {session_id}: "
                    f"freq={final_freq:.0f} Hz, mode={mode_normalized or transmitter_mode}, "
                    f"bandwidth={vfo_bandwidth} Hz, doppler={doppler_shift:.0f} Hz, "
                    f"first_update={is_first_tracking_update}"
                )

            except Exception as e:
                logger.error(f"Error updating VFO for session {session_id}: {e}")

    except Exception as e:
        logger.error(f"Error in handle_vfo_updates_for_tracking: {e}")
        logger.exception(e)
