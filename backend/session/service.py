"""
SessionService façade centralizing session lifecycle operations.

Phase 2: route handlers through this service to make SessionTracker the
single source of truth for session presence/relationships while keeping
active_sdr_clients as the backing store for configuration.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, cast

from processing.utils import active_sdr_clients, add_sdr_session
from processing.utils import cleanup_sdr_session as utils_cleanup_sdr_session
from processing.utils import get_process_manager, get_sdr_session
from session.tracker import session_tracker


class SessionService:
    """
    A small façade to coordinate updates between SessionTracker,
    ProcessManager, and the configuration store (active_sdr_clients).
    """

    # -------------------- Query helpers --------------------
    def get_session_config(self, session_id: str) -> Optional[Dict[str, Any]]:
        # get_sdr_session is dynamically typed; cast to our declared return type
        return cast(Optional[Dict[str, Any]], get_sdr_session(session_id))

    def session_exists(self, session_id: str) -> bool:
        return session_id in active_sdr_clients

    def list_active_session_ids(self) -> List[str]:
        # Keys are session IDs (str), but the dict is dynamically typed
        return cast(List[str], list(active_sdr_clients.keys()))

    # -------------------- Lifecycle (write) APIs --------------------
    async def configure_sdr(
        self, session_id: str, sdr_device: Dict[str, Any], sdr_config: Dict[str, Any]
    ) -> None:
        """
        Register/update session configuration and tracker bindings.
        Does not start the SDR process; call start_streaming for that.
        """
        # Store/replace configuration
        add_sdr_session(session_id, sdr_config)

        # Update tracker relationship (session -> sdr)
        sdr_id = sdr_config.get("sdr_id")
        if sdr_id:
            session_tracker.register_session_streaming(session_id, sdr_id)

    async def start_streaming(self, session_id: str, sdr_device: Dict[str, Any]) -> Optional[str]:
        """Start or join the SDR worker process for the configured session."""
        cfg = self.get_session_config(session_id)
        if not cfg:
            return None
        sdr_id = cfg.get("sdr_id")
        pm = get_process_manager()
        # ProcessManager API may be untyped; cast result to Optional[str]
        started_id = cast(Optional[str], await pm.start_sdr_process(sdr_device, cfg, session_id))
        # Ensure tracker binding is set
        if sdr_id:
            session_tracker.register_session_streaming(session_id, sdr_id)
        return started_id

    async def stop_streaming(self, session_id: str, sdr_id: Optional[str]) -> None:
        """Stop/leave the SDR worker process for the session (if any)."""
        if not sdr_id:
            cfg = self.get_session_config(session_id)
            sdr_id = cfg.get("sdr_id") if cfg else None
        if sdr_id:
            pm = get_process_manager()
            await pm.stop_sdr_process(sdr_id, session_id)
            # Unregister streaming relationship from tracker, but keep the session alive
            session_tracker.unregister_session_streaming(session_id)

    async def select_vfo(self, session_id: str, vfo_number: Optional[int]) -> None:
        """Update the selected VFO in SessionTracker (normalized Optional[int])."""
        session_tracker.set_session_vfo_int(session_id, vfo_number)

    async def cleanup_session(self, session_id: str) -> None:
        """
        Cleanup all resources associated with the session:
        - Stop consumers/process if needed (delegated to utils)
        - Clear SessionTracker relationships
        - Remove configuration entry
        """
        # Delegate to existing idempotent cleanup function which also clears tracker
        await utils_cleanup_sdr_session(session_id)

    # -------------------- Read-only views --------------------
    def get_runtime_snapshot(self) -> Dict[str, dict]:
        pm = get_process_manager()
        # Tracker returns a mapping structure; cast to declared type for mypy
        return cast(Dict[str, dict], session_tracker.get_runtime_snapshot(pm))


# Singleton instance
session_service = SessionService()
