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

"""VFO updates for satellite tracking - refactored to UI-only management."""

import logging

logger = logging.getLogger("vfo-state")


async def handle_vfo_updates_for_tracking(sockio, tracking_data):
    """
    Placeholder function for backward compatibility.

    VFO management is now handled entirely in the UI.
    The UI receives doppler-corrected frequencies via rigData.transmitters
    and manages VFO locking and frequency tracking on the client side.

    Args:
        sockio: Socket.IO server instance (unused)
        tracking_data: Dictionary containing rig_data and tracking_state (unused)
    """
    # No longer manages VFO state - all VFO logic is now UI-only
    pass
