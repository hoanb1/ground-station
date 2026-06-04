# Copyright (c) 2026 Efstratios Goudelis
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

import logging

from skyfield.api import load

logger = logging.getLogger(__name__)

# Create a single global timescale object to avoid reloading files
# and wasting CPU on every single tracking loop tick.
# Using builtin=True avoids disk/network access.
try:
    ts = load.timescale(builtin=True)
except Exception as e:
    logger.error(f"Failed to load skyfield timescale with builtin=True: {e}")
    try:
        ts = load.timescale()
    except Exception as ex:
        logger.critical(f"Failed to initialize Skyfield timescale: {ex}")
        ts = None
