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


"""
Session tracking module for managing active sessions and their state.
Tracks which sessions are streaming from which SDRs and which VFOs they have selected.
"""

import logging
from typing import Dict, Optional, Set

logger = logging.getLogger("session-tracker")


class SessionTracker:
    """
    Tracks active sessions and their streaming/VFO state.

    This singleton class maintains:
    - Which SDR each session is streaming from
    - Which VFO each session has selected for tracking
    - Which rig_vfo value each session has set
    """

    _instance: Optional["SessionTracker"] = None
    _initialized: bool

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SessionTracker, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._initialized = True

        # Map session_id -> sdr_id (which SDR this session is streaming from)
        self._session_sdr_map: Dict[str, str] = {}

        # Map session_id -> vfo_id (which VFO this session has selected, "1"-"4" or "none")
        self._session_vfo_map: Dict[str, str] = {}

        # Map session_id -> rig_id (which rig this session is tracking)
        self._session_rig_map: Dict[str, str] = {}

        logger.info("SessionTracker initialized")

    def register_session_streaming(self, session_id: str, sdr_id: str) -> None:
        """
        Register that a session is streaming from a specific SDR.

        Args:
            session_id: Socket.IO session ID
            sdr_id: SDR device ID
        """
        self._session_sdr_map[session_id] = sdr_id
        logger.debug(f"Registered session {session_id} streaming from SDR {sdr_id}")

    def unregister_session_streaming(self, session_id: str) -> None:
        """
        Unregister a session from streaming.

        Args:
            session_id: Socket.IO session ID
        """
        if session_id in self._session_sdr_map:
            sdr_id = self._session_sdr_map.pop(session_id)
            logger.debug(f"Unregistered session {session_id} from streaming SDR {sdr_id}")

    def set_session_vfo(self, session_id: str, vfo_id: str) -> None:
        """
        Set the VFO selection for a session.

        Args:
            session_id: Socket.IO session ID
            vfo_id: VFO number ("1", "2", "3", "4", or "none")
        """
        self._session_vfo_map[session_id] = vfo_id
        logger.debug(f"Set session {session_id} VFO to {vfo_id}")

    def set_session_rig(self, session_id: str, rig_id: str) -> None:
        """
        Set the rig that a session is tracking.

        Args:
            session_id: Socket.IO session ID
            rig_id: Rig/SDR device ID
        """
        self._session_rig_map[session_id] = rig_id
        logger.debug(f"Set session {session_id} tracking rig {rig_id}")

    def get_session_vfo(self, session_id: str) -> Optional[str]:
        """
        Get the VFO selection for a session.

        Args:
            session_id: Socket.IO session ID

        Returns:
            VFO number or None if not set
        """
        return self._session_vfo_map.get(session_id)

    def get_session_sdr(self, session_id: str) -> Optional[str]:
        """
        Get the SDR a session is streaming from.

        Args:
            session_id: Socket.IO session ID

        Returns:
            SDR ID or None if not streaming
        """
        return self._session_sdr_map.get(session_id)

    def get_session_rig(self, session_id: str) -> Optional[str]:
        """
        Get the rig a session is tracking.

        Args:
            session_id: Socket.IO session ID

        Returns:
            Rig ID or None if not tracking
        """
        return self._session_rig_map.get(session_id)

    def get_sessions_for_sdr(self, sdr_id: str) -> Set[str]:
        """
        Get all sessions streaming from a specific SDR.

        Args:
            sdr_id: SDR device ID

        Returns:
            Set of session IDs
        """
        return {session_id for session_id, sid in self._session_sdr_map.items() if sid == sdr_id}

    def get_sessions_with_vfo_for_rig(self, rig_id: str) -> Dict[str, str]:
        """
        Get all sessions that are tracking a specific rig and have a VFO selected.

        Args:
            rig_id: Rig/SDR device ID

        Returns:
            Dict mapping session_id -> vfo_id for sessions with VFOs selected
        """
        result = {}
        for session_id, rid in self._session_rig_map.items():
            if rid == rig_id:
                vfo_id = self._session_vfo_map.get(session_id)
                if vfo_id and vfo_id != "none":
                    result[session_id] = vfo_id
        return result

    def clear_session(self, session_id: str) -> None:
        """
        Clear all tracking data for a session (on disconnect).

        Args:
            session_id: Socket.IO session ID
        """
        self._session_sdr_map.pop(session_id, None)
        self._session_vfo_map.pop(session_id, None)
        self._session_rig_map.pop(session_id, None)
        logger.debug(f"Cleared all data for session {session_id}")

    def get_all_sessions(self) -> Set[str]:
        """
        Get all known session IDs.

        Returns:
            Set of all session IDs
        """
        all_sessions: Set[str] = set()
        all_sessions.update(self._session_sdr_map.keys())
        all_sessions.update(self._session_vfo_map.keys())
        all_sessions.update(self._session_rig_map.keys())
        return all_sessions


# Global singleton instance
session_tracker = SessionTracker()
