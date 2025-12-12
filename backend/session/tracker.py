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
from typing import Any, Dict, List, Optional, Set, TypedDict, cast

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

        # Map session_id -> vfo_number (normalized: 1-4 as int, or None if not selected)
        self._session_vfo_map: Dict[str, Optional[int]] = {}

        # Map session_id -> rig_id (which rig this session is tracking)
        self._session_rig_map: Dict[str, str] = {}

        # Track which session+VFO combos have been initialized for the current tracking session
        # Format: "session_id:vfo_number" -> True
        # Cleared when tracking stops to allow re-initialization on next tracking start
        self._vfo_initialized: Dict[str, bool] = {}

        # Map session_id -> ip address (set on Socket.IO connect)
        self._session_ip_map: Dict[str, str] = {}

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

    def set_session_ip(self, session_id: str, ip_address: Optional[str]) -> None:
        """
        Set the remote IP address associated with a session.

        Args:
            session_id: Socket.IO session ID
            ip_address: Remote address (may be None)
        """
        if ip_address:
            self._session_ip_map[session_id] = ip_address
            logger.debug(f"Set session {session_id} IP to {ip_address}")
        else:
            # If empty/None provided, clear any existing entry
            self._session_ip_map.pop(session_id, None)

    def get_session_ip(self, session_id: str) -> Optional[str]:
        """
        Get the remote IP address for a session if known.
        """
        return self._session_ip_map.get(session_id)

    def set_session_vfo(self, session_id: str, vfo_id: str) -> None:
        """
        Backward-compatible setter: accepts VFO as a string ("1"-"4" or "none")
        and stores it internally as Optional[int].

        Args:
            session_id: Socket.IO session ID
            vfo_id: VFO number ("1", "2", "3", "4", or "none")
        """
        vfo_number: Optional[int]
        if vfo_id == "none" or vfo_id is None:
            vfo_number = None
        else:
            try:
                vfo_number = int(vfo_id)
            except (TypeError, ValueError):
                vfo_number = None
        self._session_vfo_map[session_id] = vfo_number
        logger.debug(f"Set session {session_id} VFO to {vfo_number}")

    def set_session_vfo_int(self, session_id: str, vfo_number: Optional[int]) -> None:
        """
        Preferred setter: accepts VFO as Optional[int] (1-4 or None).

        Args:
            session_id: Socket.IO session ID
            vfo_number: VFO number (1-4) or None for no selection
        """
        if vfo_number is not None and vfo_number not in {1, 2, 3, 4}:
            raise ValueError("vfo_number must be in {1,2,3,4} or None")
        self._session_vfo_map[session_id] = vfo_number
        logger.debug(f"Set session {session_id} VFO (int) to {vfo_number}")

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
        Backward-compatible getter: returns VFO as string ("1"-"4") or "none".

        Args:
            session_id: Socket.IO session ID

        Returns:
            VFO string or None if unknown session
        """
        v = self._session_vfo_map.get(session_id, None)
        if v is None:
            # If the session exists but v is None, return "none" for legacy callers
            if session_id in self._session_vfo_map:
                return "none"
            return None
        return str(v)

    def get_session_vfo_int(self, session_id: str) -> Optional[int]:
        """
        Preferred getter: returns VFO as Optional[int] (1-4) or None.
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
        result: Dict[str, str] = {}
        for session_id, rid in self._session_rig_map.items():
            if rid == rig_id:
                vfo_number = self._session_vfo_map.get(session_id)
                if vfo_number is not None:
                    result[session_id] = str(vfo_number)
        return result

    def get_runtime_snapshot(self, process_manager) -> Dict[str, Any]:
        """
        Build a read-only snapshot of current sessions, their relationships, and
        runtime workloads by querying ProcessManager introspection APIs.

        Returns:
            Dict with keys "sessions" and "sdrs" providing a JSON-safe view.
        """

        # Typed views for mypy-safe mutation below
        class ConsumersEntry(TypedDict):
            clients: List[str]
            demodulators: Dict[str, Dict[int, Optional[str]]]
            recorders: Dict[str, Optional[str]]
            decoders: Dict[str, Dict[int, Optional[str]]]

        class SdrSnapshot(TypedDict):
            alive: bool
            clients: List[str]
            demodulators: Dict[str, Dict[int, Optional[str]]]
            recorders: Dict[str, Optional[str]]
            decoders: Dict[str, Dict[int, Optional[str]]]

        sessions: Dict[str, Dict[str, Any]] = {}
        for sid in self.get_all_sessions():
            sess_sdr_id = self.get_session_sdr(sid)
            rig_id = self.get_session_rig(sid)
            vfo_int = self.get_session_vfo_int(sid)
            ip_addr = self.get_session_ip(sid)
            sessions[sid] = {
                "sdr_id": sess_sdr_id,
                "rig_id": rig_id,
                "vfo": vfo_int,  # normalized int or None
                "ip": ip_addr,
            }

        # Query ProcessManager for process/consumer state
        sdrs: Dict[str, SdrSnapshot] = {}
        try:
            sdr_ids = process_manager.list_sdrs()
        except AttributeError:
            # Fallback in case introspection method is not available yet
            sdr_ids = list(getattr(process_manager, "processes", {}).keys())

        for raw_id in sdr_ids:
            # Be robust to untyped/None ids coming from process_manager
            if not isinstance(raw_id, str):
                continue
            dev_id = raw_id
            try:
                status = process_manager.get_sdr_status(dev_id)
            except AttributeError:
                status = {"alive": process_manager.is_sdr_process_running(dev_id)}

            sdrs[dev_id] = {
                "alive": bool(status.get("alive", False)),
                "clients": [],
                "demodulators": {},
                "recorders": {},
                "decoders": {},
            }

        all_consumers: Dict[str, ConsumersEntry] = {}
        try:
            all_consumers = cast(Dict[str, ConsumersEntry], process_manager.list_all_consumers())
        except AttributeError:
            # Last-resort fallback to raw structures for compatibility
            pm_procs = getattr(process_manager, "processes", {})
            for raw_sid, pinfo in pm_procs.items():
                # Skip non-string IDs defensively
                if not isinstance(raw_sid, str):
                    continue
                proc_sdr_id = raw_sid
                entry: ConsumersEntry = {
                    "clients": list(cast(List[str], pinfo.get("clients", []))),
                    "demodulators": {},
                    "recorders": {},
                    "decoders": {},
                }
                # Demodulators
                for sid, vfos in pinfo.get("demodulators", {}).items():
                    entry["demodulators"][sid] = {}
                    for vfo_num, vfo_entry in getattr(vfos, "items", lambda: [])():
                        inst = vfo_entry.get("instance")
                        # vfo_num is expected to be int; guard otherwise
                        if isinstance(vfo_num, int):
                            entry["demodulators"][sid][vfo_num] = (
                                type(inst).__name__ if inst else None
                            )
                # Recorders
                for sid, rec_entry in pinfo.get("recorders", {}).items():
                    inst = rec_entry.get("instance") if isinstance(rec_entry, dict) else rec_entry
                    entry["recorders"][sid] = type(inst).__name__ if inst else None
                # Decoders
                for sid, vfos in pinfo.get("decoders", {}).items():
                    entry["decoders"][sid] = {}
                    for vfo_num, vfo_entry in getattr(vfos, "items", lambda: [])():
                        inst = vfo_entry.get("instance")
                        if isinstance(vfo_num, int):
                            entry["decoders"][sid][vfo_num] = type(inst).__name__ if inst else None
                all_consumers[proc_sdr_id] = entry

        # Merge consumer info
        for raw_sid, data in all_consumers.items():
            # Ensure we only use string keys for sdrs mapping
            if not isinstance(raw_sid, str):
                continue
            merge_sdr_id = raw_sid
            if merge_sdr_id not in sdrs:
                sdrs[merge_sdr_id] = {
                    "alive": False,
                    "clients": [],
                    "demodulators": {},
                    "recorders": {},
                    "decoders": {},
                }
            sdrs[merge_sdr_id]["clients"] = data["clients"]
            sdrs[merge_sdr_id]["demodulators"] = data["demodulators"]
            sdrs[merge_sdr_id]["recorders"] = data["recorders"]
            sdrs[merge_sdr_id]["decoders"] = data["decoders"]

        return {"sessions": sessions, "sdrs": sdrs}

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

    def mark_vfo_initialized(self, session_id: str, vfo_number: int) -> None:
        """
        Mark a VFO as initialized for the current tracking session.

        Args:
            session_id: Socket.IO session ID
            vfo_number: VFO number (1-4)
        """
        key = f"{session_id}:{vfo_number}"
        self._vfo_initialized[key] = True
        logger.debug(f"Marked VFO {vfo_number} as initialized for session {session_id}")

    def is_vfo_initialized(self, session_id: str, vfo_number: int) -> bool:
        """
        Check if a VFO has been initialized for the current tracking session.

        Args:
            session_id: Socket.IO session ID
            vfo_number: VFO number (1-4)

        Returns:
            True if initialized, False otherwise
        """
        key = f"{session_id}:{vfo_number}"
        return self._vfo_initialized.get(key, False)

    def clear_vfo_initialization_state(self, rig_id: Optional[str] = None) -> None:
        """
        Clear VFO initialization state.

        Called when tracking stops to allow VFOs to be re-initialized
        on the next tracking session start.

        Args:
            rig_id: Optional rig ID to clear state for only sessions tracking that rig.
                   If None, clears state for all sessions.
        """
        if rig_id:
            # Only clear for sessions tracking this specific rig
            sessions_tracking_rig = [
                session_id for session_id, rid in self._session_rig_map.items() if rid == rig_id
            ]
            for session_id in sessions_tracking_rig:
                keys_to_remove = [
                    key for key in self._vfo_initialized.keys() if key.startswith(f"{session_id}:")
                ]
                for key in keys_to_remove:
                    del self._vfo_initialized[key]
            logger.debug(f"Cleared VFO initialization state for rig {rig_id}")
        else:
            self._vfo_initialized.clear()
            logger.debug("Cleared all VFO initialization state")


# Global singleton instance
session_tracker = SessionTracker()
