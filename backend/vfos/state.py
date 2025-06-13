import logging
from dataclasses import dataclass
from typing import Dict, Optional

# Configure logging for the worker process
logger = logging.getLogger('vfo-state')


@dataclass
class VFOState:
    center_freq: int = 0
    bandwidth: int = 0
    modulation: str = "AM"


class VFOManager:
    _instance = None
    _vfo_states: Dict[int, VFOState] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VFOManager, cls).__new__(cls)
            # Initialize 4 VFOs with default values
            for i in range(4):
                cls._instance._vfo_states[i + 1] = VFOState()
        return cls._instance

    def get_vfo_state(self, vfo_id: int) -> Optional[VFOState]:
        return self._vfo_states.get(vfo_id)

    def update_vfo_state(self, vfo_id: int, center_freq: int = None,
                         bandwidth: int = None, modulation: str = None) -> None:
        if vfo_id not in self._vfo_states:
            return

        vfo_state = self._vfo_states[vfo_id]
        if center_freq is not None:
            vfo_state.center_freq = center_freq
        if bandwidth is not None:
            vfo_state.bandwidth = bandwidth
        if modulation is not None:
            vfo_state.modulation = modulation

        #logger.info(f"vfo states: {self._vfo_states}")

    def get_all_vfo_states(self) -> Dict[int, VFOState]:
        return self._vfo_states.copy()
