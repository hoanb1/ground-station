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
from typing import List, Optional, Union

import bcrypt
from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from common.common import logger, serialize_object
from db.models import Users


async def fetch_users(
    session: AsyncSession,
    user_id: Optional[Union[uuid.UUID, str]] = None,
    include_password: bool = False,
) -> dict:
    """
    Fetch a single user by their UUID or all users if no UUID is provided.
    Optionally include the password in the returned data.
    """
    try:
        if user_id:
            if isinstance(user_id, str):
                user_id = uuid.UUID(user_id)
            stmt = select(Users).filter(Users.id == user_id)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            if user and not include_password:
                user.password = None
            user = serialize_object(user)
            return {"success": True, "data": user, "error": None}

        else:
            stmt = select(Users)
            result = await session.execute(stmt)
            users = result.scalars().all()
            if not include_password:
                for user in users:
                    user.password = None

            users = serialize_object(users)
            return {"success": True, "data": users, "error": None}

    except Exception as e:
        logger.error(f"Error fetching users: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_user(session: AsyncSession, data: dict) -> dict:
    """
    Create and add a new user.
    """
    try:
        email = data.get("email")
        password = data.get("password")
        fullname = data.get("fullname")
        status = data.get("status")

        assert email, "Email cannot be empty."
        assert password, "Password cannot be empty."
        assert fullname, "Fullname cannot be empty."
        assert status in ["active", "inactive"], "Status must be active or inactive."

        # Use Python's bcrypt library to hash the password
        salt = bcrypt.gensalt()
        password_hash = bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

        new_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        stmt = (
            insert(Users)
            .values(
                id=new_id,
                email=email,
                password=password_hash,
                fullname=fullname,
                status=status,
                added=now,
                updated=now,
            )
            .returning(Users)
        )
        result = await session.execute(stmt)
        await session.commit()
        new_user = result.scalar_one()
        new_user = serialize_object(new_user)
        return {"success": True, "data": new_user, "error": None}

    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def edit_user(session: AsyncSession, data: dict) -> dict:
    """
    Edit an existing user by updating provided fields.
    """
    try:
        assert data.get("id"), "User id cannot be empty."

        # Extract user_id from data dict
        user_id = data.get("id")

        # Convert string UUID to UUID object if necessary
        if isinstance(user_id, str):
            user_id = uuid.UUID(user_id)

        del data["id"]
        if data.get("updated", None) is not None:
            del data["updated"]
        if data.get("added", None) is not None:
            del data["added"]

        # hash the password
        if data.get("password", "") != "":
            logger.info("Hashing password for user: %s", user_id)
            password = data.pop("password")
            salt = bcrypt.gensalt()
            password_hash = bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")
            data["password"] = password_hash

        # check if the user exists
        stmt = select(Users).filter(Users.id == user_id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            return {"success": False, "error": f"User with id {user_id} not found."}

        # update provided fields; also update the timestamp
        data["updated"] = datetime.now(timezone.utc)
        upd_stmt = update(Users).where(Users.id == user_id).values(**data).returning(Users)
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_user = upd_result.scalar_one_or_none()
        updated_user = serialize_object(updated_user)
        return {"success": True, "data": updated_user, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing user: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_user(
    session: AsyncSession, user_ids: Union[List[uuid.UUID], List[str], dict]
) -> dict:
    """
    Delete multiple users by their UUIDs.
    """
    try:
        # Convert any string UUIDs in the list to UUID objects
        user_ids = [
            uuid.UUID(user_id) if isinstance(user_id, str) else user_id for user_id in user_ids
        ]
        stmt = delete(Users).where(Users.id.in_(user_ids)).returning(Users)
        result = await session.execute(stmt)
        deleted_users = result.scalars().all()
        if not deleted_users:
            return {"success": False, "error": "No users found with the provided IDs."}
        await session.commit()
        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting users: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}
