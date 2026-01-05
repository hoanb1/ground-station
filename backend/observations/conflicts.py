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

"""Conflict detection helpers for observation generation."""

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import ScheduledObservations
from observations.constants import PASS_OVERLAP_TOLERANCE_MINUTES


async def find_overlapping_observation(
    session: AsyncSession,
    norad_id: int,
    event_start: datetime,
    event_end: datetime,
    monitored_satellite_id: str,
) -> Optional[ScheduledObservations]:
    """
    Check if an observation already exists for the given pass window.

    Args:
        session: Database session
        norad_id: NORAD ID of the satellite
        event_start: Start time of the pass
        event_end: End time of the pass
        monitored_satellite_id: ID of the monitored satellite generating this observation

    Returns:
        Existing ScheduledObservations object if found, None otherwise
    """
    tolerance = timedelta(minutes=PASS_OVERLAP_TOLERANCE_MINUTES)

    # Expand the search window by tolerance
    search_start = event_start - tolerance
    search_end = event_end + tolerance

    stmt = select(ScheduledObservations).filter(
        and_(
            ScheduledObservations.norad_id == norad_id,
            ScheduledObservations.monitored_satellite_id == monitored_satellite_id,
            # Check for time window overlap
            ScheduledObservations.event_start <= search_end,
            ScheduledObservations.event_end >= search_start,
        )
    )

    result = await session.execute(stmt)
    return result.scalar_one_or_none()


def should_update_observation(existing_obs: ScheduledObservations) -> bool:
    """
    Determine if an existing observation should be updated/replaced.

    Args:
        existing_obs: Existing observation record

    Returns:
        True if the observation should be updated, False if it should be left alone
    """
    # Update failed or cancelled observations
    if existing_obs.status in ["cancelled", "failed"]:
        return True

    # Skip scheduled, running, or completed observations
    if existing_obs.status in ["scheduled", "running", "completed"]:
        return False

    # Default: don't update
    return False
