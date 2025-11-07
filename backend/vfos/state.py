import logging
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional

# Configure logging for the worker process
logger = logging.getLogger("vfo-state")

# How many VFOs
VFO_NUMBER = 4


@dataclass
class VFOState:
    vfo_number: int = 0
    center_freq: int = 0
    bandwidth: int = 10000
    modulation: str = "FM"
    active: bool = False
    selected: bool = False
    volume: int = 50
    squelch: int = -150
    locked: bool = False


class VFOManager:
    _instance = None
    _session_vfo_states: Dict[str, Dict[int, VFOState]] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VFOManager, cls).__new__(cls)
            cls._instance._session_vfo_states = {}
        return cls._instance

    def _ensure_session_vfos(self, session_id: str) -> None:
        """Ensure VFOs exist for the given session_id."""
        if session_id not in self._session_vfo_states:
            self._session_vfo_states[session_id] = {}
            # Initialize VFO_NUMBER VFOs with default values for this session
            for i in range(VFO_NUMBER):
                self._session_vfo_states[session_id][i + 1] = VFOState(vfo_number=i + 1)

    def get_all_session_ids(self) -> List[str]:
        """Returns a list of all session IDs currently in the VFOManager."""
        return list(self._session_vfo_states.keys())

    def get_vfo_state(self, session_id: str, vfo_id: int) -> Optional[VFOState]:
        self._ensure_session_vfos(session_id)
        return self._session_vfo_states[session_id].get(vfo_id)

    def update_vfo_state(
        self,
        session_id: str,
        vfo_id: int,
        center_freq: Optional[int] = None,
        bandwidth: Optional[int] = None,
        modulation: Optional[str] = None,
        active: Optional[bool] = None,
        selected: Optional[bool] = None,
        volume: Optional[int] = None,
        squelch: Optional[int] = None,
        locked: Optional[bool] = None,
    ) -> None:

        assert session_id is not None, "session_id is required"

        self._ensure_session_vfos(session_id)
        session_vfos = self._session_vfo_states[session_id]

        # Check if the user deselected all VFOs
        if vfo_id == 0 and selected is not None:
            # deselect all VFOs for this session
            for _vfo_id in session_vfos:
                session_vfos[_vfo_id].selected = False
            return

        if vfo_id not in session_vfos:
            return

        vfo_state = session_vfos[vfo_id]

        # update center frequency
        if center_freq is not None:
            vfo_state.center_freq = center_freq

        # update bandwidth
        if bandwidth is not None:
            vfo_state.bandwidth = bandwidth

        # update modulation
        if modulation is not None:
            vfo_state.modulation = modulation

        # check if active
        if active is not None:
            vfo_state.active = active

        # check volume
        if volume is not None:
            vfo_state.volume = volume

        # check squelch
        if squelch is not None:
            vfo_state.squelch = squelch

        # check if selected
        if selected is not None:
            # since a VFO is now selected set the other VFOs to not selected for this session
            for _vfo_id in session_vfos:
                session_vfos[_vfo_id].selected = False

            vfo_state.selected = selected

        # check locked
        if locked is not None:
            vfo_state.locked = locked

        # logger.info(f"vfo states for session {session_id}: {session_vfos}")

    def get_all_vfo_states(self, session_id: str) -> Dict[int, VFOState]:
        self._ensure_session_vfos(session_id)
        return self._session_vfo_states[session_id].copy()

    def get_selected_vfo(self, session_id: str) -> Optional[VFOState]:
        """Returns the currently selected VFO state or None if no VFO is selected."""
        self._ensure_session_vfos(session_id)
        session_vfos = self._session_vfo_states[session_id]

        for vfo_state in session_vfos.values():
            if vfo_state.selected:
                return vfo_state

        return None

    async def emit_vfo_states(self, sio, session_id: str) -> None:
        """Emit all VFO states for a specific session to that session's room."""
        self._ensure_session_vfos(session_id)
        session_vfos = self._session_vfo_states[session_id]

        # Convert VFO states to dictionaries for JSON serialization
        vfo_states_dict = {vfo_id: asdict(vfo_state) for vfo_id, vfo_state in session_vfos.items()}

        await sio.emit(
            "vfo-states",
            vfo_states_dict,
            room=session_id,
        )

    async def emit_vfo_frequency_update(self, sio, session_id: str, vfo_id: int) -> None:
        """Emit only frequency update for a specific VFO to avoid overwriting user's other settings."""
        self._ensure_session_vfos(session_id)
        vfo_state = self._session_vfo_states[session_id].get(vfo_id)

        if vfo_state:
            await sio.emit(
                "vfo-frequency-update",
                {
                    "vfo_id": vfo_id,
                    "frequency": vfo_state.center_freq,
                },
                room=session_id,
            )
