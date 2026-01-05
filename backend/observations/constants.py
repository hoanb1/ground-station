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

"""Constants for the scheduler module."""

# Tolerance window for detecting overlapping passes (in minutes)
# When checking if an observation already exists for a pass, we consider
# observations within ±PASS_OVERLAP_TOLERANCE_MINUTES of the pass window
PASS_OVERLAP_TOLERANCE_MINUTES = 5

# Default auto-generation interval (in hours)
DEFAULT_AUTO_GENERATE_INTERVAL_HOURS = 12

# Preference key for auto-generation interval
AUTO_GENERATE_INTERVAL_PREFERENCE = "scheduler.auto_generate_interval_hours"
