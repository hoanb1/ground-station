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

import traceback
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from common.common import logger, serialize_object
from db.models import ScheduledObservations
from observations.constants import STATUS_SCHEDULED


def _transform_to_db_format(data: dict) -> dict:
    """Transform handler format to database format."""
    # Extract hardware IDs and convert to UUID
    sdr_id = data.get("sdr", {}).get("id") if data.get("sdr") else None
    if sdr_id and isinstance(sdr_id, str):
        sdr_id = uuid.UUID(sdr_id)

    rotator_id = data.get("rotator", {}).get("id") if data.get("rotator") else None
    if rotator_id and isinstance(rotator_id, str):
        rotator_id = uuid.UUID(rotator_id)

    rig_id = data.get("rig", {}).get("id") if data.get("rig") else None
    if rig_id and isinstance(rig_id, str):
        rig_id = uuid.UUID(rig_id)

    # Extract satellite info
    satellite = data.get("satellite", {})
    norad_id = satellite.get("norad_id")

    # Extract pass timing
    pass_data = data.get("pass", {})
    event_start = pass_data.get("event_start")
    event_end = pass_data.get("event_end")

    # Build grouped JSON configs
    satellite_config = {
        "name": satellite.get("name"),
        "group_id": satellite.get("group_id"),
    }

    pass_config = {
        "peak_altitude": pass_data.get("peak_altitude"),
    }

    hardware_config = {
        "sdr": data.get("sdr", {}),
        "rotator": data.get("rotator", {}),
        "rig": data.get("rig", {}),
        "transmitter": data.get("transmitter", {}),
    }

    return {
        "id": data.get("id"),
        "name": data.get("name"),
        "enabled": data.get("enabled", True),
        "status": data.get("status", STATUS_SCHEDULED),
        "norad_id": norad_id,
        "event_start": (
            datetime.fromisoformat(event_start.replace("Z", "+00:00")) if event_start else None
        ),
        "event_end": (
            datetime.fromisoformat(event_end.replace("Z", "+00:00")) if event_end else None
        ),
        "sdr_id": sdr_id,
        "rotator_id": rotator_id,
        "rig_id": rig_id,
        "satellite_config": satellite_config,
        "pass_config": pass_config,
        "hardware_config": hardware_config,
        "tasks": data.get("tasks", []),
        "created_at": (
            datetime.fromisoformat(data["created_at"].replace("Z", "+00:00"))
            if "created_at" in data
            else datetime.now(timezone.utc)
        ),
        "updated_at": (
            datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00"))
            if "updated_at" in data
            else datetime.now(timezone.utc)
        ),
    }


def _transform_from_db_format(db_obj: dict) -> dict:
    """Transform database format back to handler format."""
    hardware_config = db_obj.get("hardware_config", {})
    satellite_config = db_obj.get("satellite_config", {})
    pass_config = db_obj.get("pass_config", {})

    # Handle datetime fields - they may already be strings after serialize_object
    event_start = db_obj.get("event_start")
    if event_start and hasattr(event_start, "isoformat"):
        event_start = event_start.isoformat()

    event_end = db_obj.get("event_end")
    if event_end and hasattr(event_end, "isoformat"):
        event_end = event_end.isoformat()

    created_at = db_obj.get("created_at")
    if created_at and hasattr(created_at, "isoformat"):
        created_at = created_at.isoformat()

    updated_at = db_obj.get("updated_at")
    if updated_at and hasattr(updated_at, "isoformat"):
        updated_at = updated_at.isoformat()

    return {
        "id": db_obj.get("id"),
        "name": db_obj.get("name"),
        "enabled": db_obj.get("enabled"),
        "status": db_obj.get("status"),
        "satellite": {
            "norad_id": db_obj.get("norad_id"),
            "name": satellite_config.get("name"),
            "group_id": satellite_config.get("group_id"),
        },
        "pass": {
            "event_start": event_start,
            "event_end": event_end,
            "peak_altitude": pass_config.get("peak_altitude"),
        },
        "sdr": hardware_config.get("sdr", {}),
        "rotator": hardware_config.get("rotator", {}),
        "rig": hardware_config.get("rig", {}),
        "transmitter": hardware_config.get("transmitter", {}),
        "tasks": db_obj.get("tasks", []),
        "created_at": created_at,
        "updated_at": updated_at,
    }


async def fetch_scheduled_observations(
    session: AsyncSession, observation_id: Optional[str] = None
) -> dict:
    """
    Fetch a single observation by ID or all observations if ID is not provided.
    """
    try:
        if observation_id is not None:
            stmt = select(ScheduledObservations).filter(ScheduledObservations.id == observation_id)
            result = await session.execute(stmt)
            observation = result.scalar_one_or_none()
            if observation:
                observation = serialize_object(observation)
                observation = _transform_from_db_format(observation)
        else:
            stmt = select(ScheduledObservations).order_by(ScheduledObservations.event_start)
            result = await session.execute(stmt)
            observations = result.scalars().all()
            observation = [_transform_from_db_format(serialize_object(obs)) for obs in observations]

        return {"success": True, "data": observation, "error": None}

    except Exception as e:
        logger.error(f"Error fetching scheduled observations: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_observations_by_time_range(
    session: AsyncSession, start_time: datetime, end_time: datetime
) -> dict:
    """
    Fetch observations within a specific time range.
    """
    try:
        stmt = (
            select(ScheduledObservations)
            .filter(ScheduledObservations.event_start >= start_time)
            .filter(ScheduledObservations.event_start <= end_time)
            .order_by(ScheduledObservations.event_start)
        )
        result = await session.execute(stmt)
        observations = result.scalars().all()
        observations = [_transform_from_db_format(serialize_object(obs)) for obs in observations]

        return {"success": True, "data": observations, "error": None}

    except Exception as e:
        logger.error(f"Error fetching observations by time range: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_observations_by_satellite(session: AsyncSession, norad_id: int) -> dict:
    """
    Fetch all observations for a specific satellite.
    """
    try:
        stmt = (
            select(ScheduledObservations)
            .filter(ScheduledObservations.norad_id == norad_id)
            .order_by(ScheduledObservations.event_start)
        )
        result = await session.execute(stmt)
        observations = result.scalars().all()
        observations = [_transform_from_db_format(serialize_object(obs)) for obs in observations]

        return {"success": True, "data": observations, "error": None}

    except Exception as e:
        logger.error(f"Error fetching observations by satellite: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_observations_by_status(session: AsyncSession, status: str) -> dict:
    """
    Fetch all observations with a specific status.
    """
    try:
        stmt = (
            select(ScheduledObservations)
            .filter(ScheduledObservations.status == status)
            .order_by(ScheduledObservations.event_start)
        )
        result = await session.execute(stmt)
        observations = result.scalars().all()
        observations = [_transform_from_db_format(serialize_object(obs)) for obs in observations]

        return {"success": True, "data": observations, "error": None}

    except Exception as e:
        logger.error(f"Error fetching observations by status: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_scheduled_observation(session: AsyncSession, data: dict) -> dict:
    """
    Create and add a new scheduled observation record.
    """
    try:
        db_data = _transform_to_db_format(data)

        stmt = insert(ScheduledObservations).values(**db_data).returning(ScheduledObservations)
        result = await session.execute(stmt)
        await session.commit()

        new_observation = result.scalar_one()
        new_observation = serialize_object(new_observation)
        new_observation = _transform_from_db_format(new_observation)

        return {"success": True, "data": new_observation, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding scheduled observation: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_scheduled_observation(session: AsyncSession, data: dict) -> dict:
    """
    Edit an existing scheduled observation record.
    """
    try:
        observation_id = data.get("id")
        if not observation_id:
            return {"success": False, "error": "Observation ID is required"}

        db_data = _transform_to_db_format(data)
        # Remove id from update data
        db_data.pop("id", None)
        # Always update the timestamp
        db_data["updated_at"] = datetime.now(timezone.utc)

        stmt = (
            update(ScheduledObservations)
            .where(ScheduledObservations.id == observation_id)
            .values(**db_data)
            .returning(ScheduledObservations)
        )
        result = await session.execute(stmt)
        await session.commit()

        updated_observation = result.scalar_one_or_none()
        if not updated_observation:
            return {"success": False, "error": f"Observation not found: {observation_id}"}

        updated_observation = serialize_object(updated_observation)
        updated_observation = _transform_from_db_format(updated_observation)

        return {"success": True, "data": updated_observation, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing scheduled observation: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def update_scheduled_observation_status(
    session: AsyncSession, observation_id: str, status: str, error_message: Optional[str] = None
) -> dict:
    """
    Update only the status of a scheduled observation (used by executor).
    This is a lightweight update that doesn't require all observation fields.
    """
    try:
        if not observation_id:
            return {"success": False, "error": "Observation ID is required"}

        update_data = {
            "status": status,
            "updated_at": datetime.now(timezone.utc),
        }

        if error_message:
            # Store error message in a way that makes sense for your schema
            # You might need to add an error_message field or store in metadata
            pass

        stmt = (
            update(ScheduledObservations)
            .where(ScheduledObservations.id == observation_id)
            .values(**update_data)
        )
        await session.execute(stmt)
        await session.commit()

        return {"success": True, "data": {"id": observation_id, "status": status}, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error updating observation status: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_scheduled_observations(session: AsyncSession, ids: List[str]) -> dict:
    """
    Delete one or more scheduled observation records.
    """
    try:
        stmt = delete(ScheduledObservations).where(ScheduledObservations.id.in_(ids))
        result = await session.execute(stmt)
        await session.commit()

        deleted_count = result.rowcount
        return {"success": True, "data": {"deleted": deleted_count}, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting scheduled observations: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}
