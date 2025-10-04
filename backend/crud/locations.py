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

import uuid
import traceback
from typing import Optional, Union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update, delete
from datetime import datetime, UTC
from db.models import Locations
from common.common import logger, serialize_object


async def fetch_location(session: AsyncSession, location_id: Union[uuid.UUID, str]) -> dict:
    """
    Fetch a single location by its UUID or its string representation.
    """
    try:
        if isinstance(location_id, str):
            location_id = uuid.UUID(location_id)

        stmt = select(Locations).filter(Locations.id == location_id)
        result = await session.execute(stmt)
        location = result.scalar_one_or_none()
        location = serialize_object(location)
        return {"success": True, "data": location, "error": None}

    except Exception as e:
        logger.error(f"Error fetching a location: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_location_for_userid(
    session: AsyncSession, user_id: Optional[uuid.UUID | str | None] = None
) -> dict:
    """
    Fetch a single location by its UUID or all locations for a given user_id.
    """
    try:
        if user_id is None:
            stmt = select(Locations).filter(Locations.userid == None)
        else:
            if isinstance(user_id, str):
                user_id = uuid.UUID(user_id)
            stmt = select(Locations).filter(Locations.id == user_id)

        result = await session.execute(stmt)
        locations = result.scalars().all() if user_id else result.scalar_one_or_none()
        locations = serialize_object(locations)
        return {"success": True, "data": locations, "error": None}

    except Exception as e:
        logger.error(f"Error fetching a location for user id: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_location(session: AsyncSession, data: dict) -> dict:
    """
    Create and add a new location record.
    """
    try:
        new_id = uuid.uuid4()
        now = datetime.now(UTC)
        data["id"] = new_id
        data["added"] = now
        data["updated"] = now

        # Convert userid to UUID if it's a string
        if "userid" in data and data["userid"] is not None:
            if isinstance(data["userid"], str):
                data["userid"] = uuid.UUID(data["userid"])

        stmt = insert(Locations).values(**data).returning(Locations)

        result = await session.execute(stmt)
        await session.commit()
        new_location = result.scalar_one()
        new_location = serialize_object(new_location)
        return {"success": True, "data": new_location, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding a location: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_location(session: AsyncSession, data: dict) -> dict:
    """
    Edit an existing location record by updating provided fields.
    """
    try:
        # Extract location_id from data
        location_id = data.pop("id", None)
        if not location_id:
            raise Exception("id is required.")

        if data.get("added", None) is not None:
            del data["added"]
        if data.get("updated", None) is not None:
            del data["updated"]

        # Convert to UUID if it's a string
        if isinstance(location_id, str):
            location_id = uuid.UUID(location_id)

        # Ensure the location exists first
        stmt = select(Locations).filter(Locations.id == location_id)
        result = await session.execute(stmt)
        location = result.scalar_one_or_none()
        if not location:
            return {"success": False, "error": f"Location with id {location_id} not found."}

        upd_stmt = (
            update(Locations).where(Locations.id == location_id).values(**data).returning(Locations)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_location = upd_result.scalar_one_or_none()
        updated_location = serialize_object(updated_location)
        return {"success": True, "data": updated_location, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing a location: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_location(session: AsyncSession, location_id: Union[uuid.UUID, str]) -> dict:
    """
    Delete a location record by its UUID.
    """
    try:
        # Convert to UUID if it's a string
        if isinstance(location_id, str):
            location_id = uuid.UUID(location_id)

        stmt = delete(Locations).where(Locations.id == location_id).returning(Locations)
        result = await session.execute(stmt)
        deleted = result.scalar_one_or_none()
        if not deleted:
            return {"success": False, "error": f"Location with id {location_id} not found."}
        await session.commit()
        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting a location: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}
