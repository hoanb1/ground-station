import logging
from dataclasses import dataclass
from typing import Dict, Optional

# Configure logging for the worker process
logger = logging.getLogger('vfo-state')

# How many VFOs
VFO_NUMBER = 4

@dataclass
class VFOState:
    center_freq: int = 0
    bandwidth: int = 0
    modulation: str = "AM"
    active: bool = False
    selected: bool = False


class VFOManager:
    _instance = None
    _vfo_states: Dict[int, VFOState] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VFOManager, cls).__new__(cls)
            # Initialize VFO_NUMBER VFOs with default values
            for i in range(VFO_NUMBER):
                cls._instance._vfo_states[i + 1] = VFOState()
        return cls._instance

    def get_vfo_state(self, vfo_id: int) -> Optional[VFOState]:
        return self._vfo_states.get(vfo_id)

    def update_vfo_state(self, vfo_id: int, center_freq: int = None,
                         bandwidth: int = None, modulation: str = None,
                         active: bool = False, selected: bool = False) -> None:
        if vfo_id not in self._vfo_states:
            return

        vfo_state = self._vfo_states[vfo_id]

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

        # check if selected
        if selected is not None:
            # if a VFO was selected, then also set it to active = true
            if selected:
                vfo_state.active = True

            # since a VFO is now selected set the other VFOs to not selected
            for _vfo_id in self._vfo_states:
                self._vfo_states[_vfo_id].selected = False

            vfo_state.selected = selected

        #logger.info(f"vfo states: {self._vfo_states}")

    def get_all_vfo_states(self) -> Dict[int, VFOState]:
        return self._vfo_states.copy()
