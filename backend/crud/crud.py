# Copyright (c) 2024 Efstratios Goudelis
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
import string
import traceback
import random
import bcrypt
from typing import Union
from pydantic.v1 import UUID4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update, delete, String
from common.common import *
from datetime import datetime, UTC

from common.utils import convert_strings_to_uuids
from db.models import Users
from db.models import Locations, SatelliteTrackingState, Cameras, SDRs
from db.models import Preferences
from db.models import Rotators
from db.models import Rigs
from db.models import Satellites
from db.models import Transmitters
from db.models import SatelliteTLESources
from db.models import SatelliteGroups
from common.common import logger
from common.common import serialize_object
from typing import Optional


async def fetch_users(session: AsyncSession, user_id: Optional[Union[uuid.UUID, str]] = None,
                      include_password: bool = False) -> dict:
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
        assert status in ['active', 'inactive'], "Status must be active or inactive."

        # Use Python's bcrypt library to hash the password
        salt = bcrypt.gensalt()
        password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

        new_id = uuid.uuid4()
        now = datetime.now(UTC)

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

        del data['id']
        if data.get('updated', None) is not None:
            del data['updated']
        if data.get('added', None) is not None:
            del data['added']

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
        data["updated"] = datetime.now(UTC)
        upd_stmt = (
            update(Users)
            .where(Users.id == user_id)
            .values(**data)
            .returning(Users)
        )
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


async def delete_user(session: AsyncSession, user_ids: Union[list[uuid.UUID], list[str], dict]) -> dict:
    """
    Delete multiple users by their UUIDs.
    """
    try:
        # Convert any string UUIDs in the list to UUID objects
        user_ids = [uuid.UUID(user_id) if isinstance(user_id, str) else user_id for user_id in user_ids]
        stmt = (
            delete(Users)
            .where(Users.id.in_(user_ids))
            .returning(Users)
        )
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


async def fetch_preference(session: AsyncSession, preference_id: uuid.UUID) -> dict:
    """
    Fetch a single preference by its UUID.
    """
    try:
        stmt = select(Preferences).filter(Preferences.id == preference_id)
        result = await session.execute(stmt)
        preference = result.scalar_one_or_none()
        preference = serialize_object(preference)
        return {"success": True, "data": preference, "error": None}

    except Exception as e:
        logger.error(f"Error fetching a preference users: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_preference_for_userid(session: AsyncSession, user_id: Optional[uuid.UUID] = None) -> dict:
    """
    Fetch all preferences for a given user ID or all preferences if user_id is None.
    If a preference does not exist for a key in the defaults, use the default value.
    """

    defaults = {
        'timezone': 'Europe/Athens',
        'language': 'en_US',
        'theme': 'dark',
        'stadia_maps_api_key': "",
        'openweather_api_key': "",
    }

    try:
        stmt = select(Preferences)
        if user_id is not None:
            stmt = stmt.filter(Preferences.userid == user_id)
        else:
            stmt = stmt.filter(Preferences.userid == None)

        result = await session.execute(stmt)
        preferences = result.scalars().all()
        preferences_dict = {pref.name: pref.value for pref in preferences}

        # Combine defaults with existing preferences
        combined_preferences = [
            {"id": preferences_dict.get("id", None), "name": key, "value": preferences_dict.get(key, value)} for key, value in defaults.items()
        ]

        combined_preferences = serialize_object(combined_preferences)
        return {"success": True, "data": combined_preferences, "error": None}

    except Exception as e:
        logger.error(f"Error fetching preferences for user: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_preference(session: AsyncSession, data: dict) -> dict:
    """
    Create and add a new preference record.
    """
    try:
        new_id = uuid.uuid4()
        now = datetime.now(UTC)
        stmt = (
            insert(Preferences)
            .values(
                id=new_id,
                userid=data["userid"],
                name=data["name"],
                value=data["value"],
                added=now,
                updated=now
            )
            .returning(Preferences)
        )
        result = await session.execute(stmt)
        await session.commit()
        new_preference = result.scalar_one()
        new_preference = serialize_object(new_preference)
        return {"success": True, "data": new_preference, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding a preference: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_preference(session: AsyncSession, data: dict) -> dict:
    """
    Edit an existing preference record by updating provided fields.
    """
    try:
        # extract preference_id from data
        preference_id = data.pop("id", None)
        if not preference_id:
            raise ValueError("Preference id cannot be empty.")

        if isinstance(preference_id, str):
            preference_id = uuid.UUID(preference_id)

        # Confirm the preference exists first
        stmt = select(Preferences).filter(Preferences.id == preference_id)
        result = await session.execute(stmt)
        preference = result.scalar_one_or_none()
        if not preference:
            return {"success": False, "error": f"Preference with id {preference_id} not found."}

        # Update the timestamp
        data["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Preferences)
            .where(Preferences.id == preference_id)
            .values(**data)
            .returning(Preferences)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_preference = upd_result.scalar_one_or_none()
        updated_preference = serialize_object(updated_preference)
        return {"success": True, "data": updated_preference, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing a preference: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def set_preferences(session: AsyncSession, preferences: list[dict]) -> dict:
    """
    Edit or upsert preference records for provided fields.
    """
    try:
        updated_preferences = []

        for data in preferences:
            preference_id = data.pop("id", None)
            if preference_id:
                if isinstance(preference_id, str):
                    preference_id = uuid.UUID(preference_id)

                # Confirm the preference exists
                stmt = select(Preferences).filter(Preferences.id == preference_id)
                result = await session.execute(stmt)
                preference = result.scalar_one_or_none()

                if preference:
                    # Update existing preference
                    del data['added']
                    data["updated"] = datetime.now(UTC)
                    upd_stmt = (
                        update(Preferences)
                        .where(Preferences.id == preference_id)
                        .values(**data)
                        .returning(Preferences)
                    )
                    upd_result = await session.execute(upd_stmt)
                    updated_preferences.append(upd_result.scalar_one_or_none())

                else:
                    # Insert a new preference (upsert case)
                    new_id = uuid.uuid4()
                    now = datetime.now(UTC)
                    data["id"] = preference_id
                    data["added"] = now
                    data["updated"] = now
                    stmt = (
                        insert(Preferences)
                        .values(**data)
                        .returning(Preferences)
                    )
                    result = await session.execute(stmt)
                    updated_preferences.append(result.scalar_one())

            else:
                # Insert a new preference if no ID is provided
                new_id = uuid.uuid4()
                now = datetime.now(UTC)
                data["id"] = new_id
                data["added"] = now
                data["updated"] = now
                stmt = (
                    insert(Preferences)
                    .values(**data)
                    .returning(Preferences)
                )
                result = await session.execute(stmt)
                updated_preferences.append(result.scalar_one())

        await session.commit()
        updated_preferences = serialize_object(updated_preferences)
        return {"success": True, "data": updated_preferences, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error setting multiple preferences: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_preference(session: AsyncSession, preference_id: Union[uuid.UUID, str]) -> dict:
    """
    Delete a preference record by its UUID.
    """
    try:
        stmt = (
            delete(Preferences)
            .where(Preferences.id == preference_id)
            .returning(Preferences)
        )
        result = await session.execute(stmt)
        deleted = result.scalar_one_or_none()
        if not deleted:
            return {"success": False, "error": f"Preference with id {preference_id} not found."}
        await session.commit()
        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting a preference: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


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


async def fetch_location_for_userid(session: AsyncSession, user_id: Optional[uuid.UUID | str | None] = None) -> dict:
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

        stmt = (
            insert(Locations)
            .values(**data)
            .returning(Locations)
        )

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

        if data.get('added', None) is not None:
            del data['added']
        if data.get('updated', None) is not None:
            del data['updated']

        location_id = uuid.UUID(location_id)

        # Ensure the location exists first
        stmt = select(Locations).filter(Locations.id == location_id)
        result = await session.execute(stmt)
        location = result.scalar_one_or_none()
        if not location:
            return {"success": False, "error": f"Location with id {location_id} not found."}

        upd_stmt = (
            update(Locations)
            .where(Locations.id == location_id)
            .values(**data)
            .returning(Locations)
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


async def delete_location(session: AsyncSession, location_id: uuid.UUID | dict) -> dict:
    """
    Delete a location record by its UUID.
    """
    try:
        stmt = (
            delete(Locations)
            .where(Locations.id == location_id)
            .returning(Locations)
        )
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


async def fetch_rotators(session: AsyncSession, rotator_id: Optional[Union[uuid.UUID, str]] = None) -> dict:
    """
    Fetch a single rotator by its UUID or all rotators if UUID is not provided.
    """
    try:
        if rotator_id is not None:
            if isinstance(rotator_id, str):
                rotator_id = uuid.UUID(rotator_id)

            stmt = select(Rotators).filter(Rotators.id == rotator_id)
            result = await session.execute(stmt)
            rotators = result.scalar_one_or_none()
        else:
            stmt = select(Rotators)
            result = await session.execute(stmt)
            rotators = result.scalars().all()

        rotators = serialize_object(rotators)
        return {"success": True, "data": rotators, "error": None}

    except Exception as e:
        logger.error(f"Error fetching rotators: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_rotator(session: AsyncSession, data: dict) -> dict:
    """
    Create and add a new rotator record.
    """
    try:
        new_id = uuid.uuid4()
        now = datetime.now(UTC)
        stmt = (
            insert(Rotators)
            .values(
                id=new_id,
                name=data["name"],
                host=data["host"],
                port=data["port"],
                minaz=data["minaz"],
                maxaz=data["maxaz"],
                minel=data["minel"],
                maxel=data["maxel"],
                aztype=data["aztype"],
                azendstop=data["azendstop"],
                added=now,
                updated=now
            )
            .returning(Rotators)
        )
        result = await session.execute(stmt)
        await session.commit()
        new_rotator = result.scalar_one()
        new_rotator = serialize_object(new_rotator)
        return {"success": True, "data": new_rotator, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding rotator: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_rotator(session: AsyncSession, data: dict) -> dict:
    """
    Edit an existing rotator record by updating provided fields.
    """
    try:
        # Extract rotator_id from data
        rotator_id = data.pop('id', None)
        rotator_id = uuid.UUID(rotator_id)

        if not rotator_id:
            raise Exception("id is required.")

        del data["updated"]
        del data["added"]

        # Confirm the rotator exists
        stmt = select(Rotators).filter(Rotators.id == rotator_id)
        result = await session.execute(stmt)
        rotator = result.scalar_one_or_none()
        if not rotator:
            return {"success": False, "error": f"Rotator with id {rotator_id} not found."}

        # Add updated timestamp
        data["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Rotators)
            .where(Rotators.id == rotator_id)
            .values(**data)
            .returning(Rotators)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_rotator = upd_result.scalar_one_or_none()
        updated_rotator = serialize_object(updated_rotator)
        return {"success": True, "data": updated_rotator, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing rotator: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_rotators(session: AsyncSession, rotator_ids: list[Union[str, uuid.UUID]] | dict) -> dict:
    """
    Delete multiple rotator records by their UUIDs or string representations of UUIDs.
    """
    try:
        rotator_ids = [uuid.UUID(rotator_id) if isinstance(rotator_id, str) else rotator_id for rotator_id in
                       rotator_ids]

        stmt = (
            delete(Rotators)
            .where(Rotators.id.in_(rotator_ids))
            .returning(Rotators)
        )
        result = await session.execute(stmt)
        deleted = result.scalars().all()
        if not deleted:
            return {"success": False, "error": "No rotators with the provided IDs were found."}
        await session.commit()
        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting rotators: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_rigs(session: AsyncSession, rig_id: Optional[Union[uuid.UUID | str | None]] = None) -> dict:
    """
    Fetch a single rig by its UUID or all rigs if UUID is not provided.
    """
    try:
        if rig_id == "none":
            return {"success": False, "data": None, "error": "'none' was given as rig_id"}

        if rig_id is None:
            stmt = select(Rigs)
        else:
            if isinstance(rig_id, str):
                rig_id = uuid.UUID(rig_id)
            stmt = select(Rigs).filter(Rigs.id == rig_id)
        result = await session.execute(stmt)
        rigs = result.scalars().all() if rig_id is None else result.scalar_one_or_none()
        rigs = serialize_object(rigs)
        return {"success": True, "data": rigs, "error": None}

    except Exception as e:
        logger.error(f"Error fetching rigs: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

async def add_rig(session: AsyncSession, data: dict) -> dict:
    """
    Create and add a new rig record.
    """
    try:
        assert data.get("name", "") != "", "name is required"
        assert data.get("host", "") != "", "host is required"
        assert data.get("port", "") != "", "port is required"
        assert data.get("radiotype", "") != "", "radiotype is required"
        assert data.get("pttstatus", "") != "", "pttstatus is required"
        assert data.get("vfotype", "") != "", "vfotype is required"
        assert data.get("lodown", "") != "", "lodown is required"
        assert data.get("loup", "") != "", "loup is required"

        new_id = uuid.uuid4()
        now = datetime.now(UTC)
        stmt = (
            insert(Rigs)
            .values(
                id=new_id,
                name=data['name'],
                host=data['host'],
                port=data['port'],
                radiotype=data['radiotype'],
                pttstatus=data['pttstatus'],
                vfotype=data['vfotype'],
                lodown=data['lodown'],
                loup=data['loup'],
                added=now,
                updated=now
            )
            .returning(Rigs)
        )
        result = await session.execute(stmt)
        await session.commit()
        new_rig = result.scalar_one()
        new_rig = serialize_object(new_rig)
        return {"success": True, "data": new_rig, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding rigs: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_rig(session: AsyncSession, data: dict) -> dict:
    """
    Edit an existing rig record by updating provided fields.
    """
    try:
        rig_id = data.get("id", None)
        if isinstance(rig_id, str):
            rig_id = uuid.UUID(rig_id)

        del data['added']
        del data['updated']
        del data['id']

        # Optionally check if the record exists
        stmt = select(Rigs).filter(Rigs.id == rig_id)
        result = await session.execute(stmt)
        rig = result.scalar_one_or_none()

        if not rig:
            return {"success": False, "error": f"Rig with id {rig_id} not found."}

        # Update the updated timestamp.
        data["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Rigs)
            .where(Rigs.id == rig_id)
            .values(**data)
            .returning(Rigs)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_rig = upd_result.scalar_one_or_none()
        updated_rig = serialize_object(updated_rig)
        return {"success": True, "data": updated_rig, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing rig: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_rig(session: AsyncSession, rig_ids: Union[list[uuid.UUID], list[str], dict]) -> dict:
    """
    Delete multiple rig records by their UUIDs or string representations of UUIDs.
    """
    try:
        if isinstance(rig_ids, dict):
            rig_ids = rig_ids.get("ids", [])
        rig_ids = [uuid.UUID(rig_id) if isinstance(rig_id, str) else rig_id for rig_id in rig_ids]

        stmt = (
            delete(Rigs)
            .where(Rigs.id.in_(rig_ids))
            .returning(Rigs)
        )
        result = await session.execute(stmt)
        deleted = result.scalars().all()
        if not deleted:
            return {"success": False, "error": "No rigs with the provided IDs were found."}
        await session.commit()
        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting rigs: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_system_satellite_group_by_identifier(session: AsyncSession, group_identifier: str) -> dict:
    """
    Fetch a satellite group with type='system' by its 'group_identifier'.
    """

    try:
        # Add a filter for the 'type' column
        stmt = (
            select(SatelliteGroups)
            .filter(
                SatelliteGroups.identifier == group_identifier,
                SatelliteGroups.type == "system",
                )
        )
        result = await session.execute(stmt)
        group = result.scalar_one_or_none()

        if not group:
            return {"success": False, "error": "Satellite group (type=system) not found"}

        group = serialize_object(group)
        return {"success": True, "data": group, "error": None}

    except Exception as e:
        logger.error(f"Error fetching satellite group by identifier: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_satellites_for_group_id(session: AsyncSession, group_id: str | UUID4) -> dict:
    """
    Fetch satellite records for the given group id along with their transmitters

    If 'satellite_id' is provided, return a single satellite record.
    Otherwise, return all satellite records with their associated transmitters.
    """
    try:
        assert group_id is not None, "group_id is required"

        if isinstance(group_id, str):
            group_id = uuid.UUID(group_id)

        group = await fetch_satellite_group(session, group_id)

        satellite_ids = group['data']['satellite_ids']

        # Fetch satellites
        stmt = select(Satellites).filter(Satellites.norad_id.in_(satellite_ids))
        result = await session.execute(stmt)
        satellites = result.scalars().all()
        satellites = serialize_object(satellites)

        # Fetch transmitters for each satellite
        for satellite in satellites:
            stmt = select(Transmitters).filter(Transmitters.norad_cat_id == satellite['norad_id'])
            result = await session.execute(stmt)
            transmitters = result.scalars().all()
            satellite['transmitters'] = serialize_object(transmitters)

        return {"success": True, "data": satellites, "error": None}

    except Exception as e:
        logger.error(f"Error fetching satellite(s): {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def search_satellites(session: AsyncSession, keyword: str | int | None) -> dict:
    """
    Fetch satellite records.

    If 'keyword' is provided, return a list of satellite records that have a matching norad_id
    or part of it, or a name or part of it. Otherwise, return all satellite records.
    """
    try:
        if keyword is None:
            stmt = select(Satellites)
        else:
            keyword = str(keyword)
            keyword = f"%{keyword}%"
            stmt = select(Satellites).filter(
                Satellites.norad_id.cast(String).ilike(keyword) |
                Satellites.name.ilike(keyword) |
                Satellites.name_other.ilike(keyword) |
                Satellites.alternative_name.ilike(keyword)
            )
        result = await session.execute(stmt)
        satellites = result.scalars().all()
        satellites = serialize_object(satellites)
        return {"success": True, "data": satellites, "error": None}

    except Exception as e:
        logger.error(f"Error fetching satellite(s): {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

async def fetch_satellites(session: AsyncSession, norad_id: Union[str, int, list[int], None]) -> dict:
    """
    Fetch satellite records.

    If 'satellite_id' is provided as a single value, return the corresponding satellite record.
    If 'satellite_id' is a list, return all matching satellite records.
    Otherwise, return all satellite records.
    """
    try:
        if norad_id is None:
            # return all
            stmt = select(Satellites)
            result = await session.execute(stmt)
            satellites = result.scalars().all()

        elif isinstance(norad_id, list):
            # return all in list
            stmt = select(Satellites).filter(Satellites.norad_id.in_(norad_id))
            result = await session.execute(stmt)
            satellites = result.scalars().all()

        else:
            # return only the one
            stmt = select(Satellites).filter(Satellites.norad_id == norad_id)
            result = await session.execute(stmt)
            satellite = result.scalar_one_or_none()
            satellites = [satellite] if satellite else []

        satellites = serialize_object(satellites)
        return {"success": True, "data": satellites, "error": None}

    except Exception as e:
        logger.error(f"Error fetching satellite(s): {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_satellite(session: AsyncSession, data: dict) -> dict:
    """
    Create and add a new satellite record.
    """
    try:
        # Validate required fields
        required_fields = ['name', 'sat_id', 'norad_id', 'status', 'is_frequency_violator']
        for field in required_fields:
            if field not in data:
                raise ValueError(f"Missing required field: {field}")

        now = datetime.now(UTC)
        data['added'] = now
        data['updated'] = now

        stmt = (
            insert(Satellites)
            .values(**data)
            .returning(Satellites)
        )
        result = await session.execute(stmt)
        await session.commit()
        new_satellite = result.scalar_one()
        new_satellite = serialize_object(new_satellite)
        return {"success": True, "data": new_satellite, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding satellite: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_satellite(session: AsyncSession, satellite_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing satellite record by updating provided fields.
    """
    try:
        # Check if the satellite exists
        stmt = select(Satellites).filter(Satellites.norad_id == satellite_id)
        result = await session.execute(stmt)
        satellite = result.scalar_one_or_none()
        if not satellite:
            return {"success": False, "error": f"Satellite with id {satellite_id} not found."}

        # Set the updated timestamp
        kwargs["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Satellites)
            .where(Satellites.norad_id == satellite_id)
            .values(**kwargs)
            .returning(Satellites)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_satellite = upd_result.scalar_one_or_none()
        updated_satellite = serialize_object(updated_satellite)
        return {"success": True, "data": updated_satellite, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing satellite {satellite_id}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_satellite(session: AsyncSession, satellite_id: Union[uuid.UUID, str]) -> dict:
    """
    Delete a satellite record by its UUID.
    First deletes all associated transmitters due to foreign key constraint.
    """
    try:
        if isinstance(satellite_id, str):
            satellite_id = uuid.UUID(satellite_id)

        # First, delete all transmitters associated with this satellite
        transmitters_stmt = delete(Transmitters).where(Transmitters.norad_cat_id == satellite_id)
        await session.execute(transmitters_stmt)

        # Then delete the satellite
        satellite_stmt = (
            delete(Satellites)
            .where(Satellites.norad_id == satellite_id)
            .returning(Satellites)
        )
        result = await session.execute(satellite_stmt)
        deleted = result.scalar_one_or_none()

        if not deleted:
            return {"success": False, "error": f"Satellite with id {satellite_id} not found."}

        await session.commit()
        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting satellite {satellite_id}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_transmitters_for_satellite(session: AsyncSession, norad_id: int) -> dict:
    """
    Fetch all transmitter records associated with the given satellite NORAD id.
    """
    try:
        stmt = select(Transmitters).filter(Transmitters.norad_cat_id == norad_id)
        result = await session.execute(stmt)
        transmitters = result.scalars().all()
        transmitters = serialize_object(transmitters)
        return {"success": True, "data": transmitters, "error": None}

    except Exception as e:
        logger.error(f"Error fetching transmitters for satellite {norad_id}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_transmitter(session: AsyncSession, transmitter_id: Union[uuid.UUID, str]) -> dict:
    """
    Fetch a single transmitter record by its UUID or string representation.
    """
    try:
        # Since transmitter.id is a string, convert UUID to string if needed
        if isinstance(transmitter_id, uuid.UUID):
            transmitter_id = str(transmitter_id)

        stmt = select(Transmitters).filter(Transmitters.id == transmitter_id)
        result = await session.execute(stmt)
        transmitter = result.scalar_one_or_none()
        transmitter = serialize_object(transmitter)
        return {"success": True, "data": transmitter, "error": None}

    except Exception as e:
        logger.error(f"Error fetching transmitters by transmitter id {transmitter_id}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_transmitter(session: AsyncSession, data: dict) -> dict:
    """
    Create and add a new transmitter record.
    """
    try:
        new_id = uuid.uuid4()
        now = datetime.now(UTC)
        data["id"] = str(new_id)
        data["added"] = now
        data["updated"] = now

        # rename some fields
        data["norad_cat_id"] = data.pop("satelliteId")
        data["uplink_low"] = None if data.pop("uplinkLow") == '-' else data.pop("uplinkLow")
        data["uplink_high"] = None if data.pop("uplinkHigh") == '-' else data.pop("uplinkHigh")
        data["downlink_low"] = None if data.pop("downlinkLow") == '-' else data.pop("downlinkLow")
        data["downlink_high"] = None if data.pop("downlinkHigh") == '-' else data.pop("downlinkHigh")
        data["uplink_drift"] = None if data.pop("uplinkDrift") == '-' else data.pop("uplinkDrift")
        data["downlink_drift"] = None if data.pop("downlinkDrift") == '-' else data.pop("downlinkDrift")
        data["uplink_mode"] = data.pop("uplinkMode")

        stmt = (
            insert(Transmitters)
            .values(**data)
            .returning(Transmitters)
        )

        result = await session.execute(stmt)
        await session.commit()
        new_transmitter = result.scalar_one()
        new_transmitter = serialize_object(new_transmitter)
        return {"success": True, "data": new_transmitter, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding transmitter: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_transmitter(session: AsyncSession, data: dict) -> dict:
    """
    Edit an existing transmitter record by updating provided fields.
    """
    try:
        transmitter_id = data.pop('id')

        data.pop('added', None)
        data.pop('updated', None)

        # rename some fields
        data["norad_cat_id"] = data.pop("satelliteId")
        data["uplink_low"] = None if data.pop("uplinkLow") == '-' else data.pop("uplinkLow")
        data["uplink_high"] = None if data.pop("uplinkHigh") == '-' else data.pop("uplinkHigh")
        data["downlink_low"] = None if data.pop("downlinkLow") == '-' else data.pop("downlinkLow")
        data["downlink_high"] = None if data.pop("downlinkHigh") == '-' else data.pop("downlinkHigh")
        data["uplink_drift"] = None if data.pop("uplinkDrift") == '-' else data.pop("uplinkDrift")
        data["downlink_drift"] = None if data.pop("downlinkDrift") == '-' else data.pop("downlinkDrift")
        data["uplink_mode"] = data.pop("uplinkMode")

        # Ensure the record exists first
        stmt = select(Transmitters).filter(Transmitters.id == transmitter_id)
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()
        if not existing:
            return {"success": False, "error": f"Transmitter with id {transmitter_id} not found."}

        # Add updated timestamp
        data["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Transmitters)
            .where(Transmitters.id == transmitter_id)
            .values(**data)
            .returning(Transmitters)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_transmitter = upd_result.scalar_one_or_none()
        updated_transmitter = serialize_object(updated_transmitter)
        return {"success": True, "data": updated_transmitter, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing transmitter: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_transmitter(session: AsyncSession, transmitter_id: Union[uuid.UUID, str]) -> dict:
    """
    Delete a transmitter record by its UUID or string representation of UUID.
    """
    try:
        logger.info(transmitter_id)

        del_stmt = (
            delete(Transmitters)
            .where(Transmitters.id == transmitter_id)
            .returning(Transmitters)
        )
        result = await session.execute(del_stmt)
        deleted = result.scalar_one_or_none()
        if not deleted:
            return {"success": False, "error": f"Transmitter with id {transmitter_id} not found."}
        await session.commit()
        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting transmitter: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_satellite_tle_source(session: AsyncSession, satellite_tle_source_id: Optional[int] = None) -> dict:
    """
    Retrieve satellite TLE source records.
    If an ID is provided, fetch the specific record; otherwise, return all sources.
    """
    try:
        if satellite_tle_source_id is None:
            result = await session.execute(select(SatelliteTLESources))
            sources = result.scalars().all()
            sources = json.loads(json.dumps(sources, default=serialize_object))
            sources = serialize_object(sources)
            return {"success": True, "data": sources}

        else:
            result = await session.execute(
                select(SatelliteTLESources).filter(SatelliteTLESources.id == satellite_tle_source_id)
            )
            source = result.scalars().first()
            if source:
                source = serialize_object(source)
                return {"success": True, "data": source}

            return {"success": False, "error": "Satellite TLE source not found"}

    except Exception as e:
        logger.error(f"Error fetching satellite TLE source: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_satellite_tle_source(session: AsyncSession, payload: dict) -> dict:
    """
    Create a new satellite TLE source record with the provided payload.
    """
    try:
        assert payload['name']
        assert payload['url']

        # Generate random identifier string
        payload['identifier'] = ''.join(random.choices(string.ascii_letters, k=16))

        if payload.get('added', None) is not None:
            del payload['added']

        if payload.get('updated', None) is not None:
            del payload['updated']

        new_source = SatelliteTLESources(**payload)
        session.add(new_source)
        await session.commit()
        await session.refresh(new_source)
        new_source = serialize_object(new_source)
        return {"success": True, "data": new_source}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding satellite TLE source: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_satellite_tle_source(session: AsyncSession, satellite_tle_source_id: str, payload: dict) -> dict:
    """
    Update an existing satellite TLE source record with new values provided in payload.
    Returns a result object containing the updated record or an error message.
    """
    try:
        payload.pop('added', None)
        payload.pop('updated', None)
        payload.pop('id', None)
        source_id = uuid.UUID(satellite_tle_source_id)

        result = await session.execute(
            select(SatelliteTLESources).filter(SatelliteTLESources.id == source_id)
        )
        source = result.scalars().first()
        if not source:
            return {"success": False, "error": "Satellite TLE source not found"}

        for key, value in payload.items():
            if hasattr(source, key):
                setattr(source, key, value)

        await session.commit()
        await session.refresh(source)
        source = serialize_object(source)
        return {"success": True, "data": source}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing satellite TLE source: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_satellite_tle_sources(session: AsyncSession, satellite_tle_source_ids: Union[list[str], dict]) -> dict:
    """
    Deletes multiple satellite TLE source records using their IDs.
    Before deleting each TLE source, it finds the corresponding satellite group,
    deletes all transmitters and satellites that came from this TLE source, then deletes the group.
    """
    try:
        assert isinstance(satellite_tle_source_ids, list), "TLE source list must be a list"

        satellite_tle_source_ids = convert_strings_to_uuids(satellite_tle_source_ids)

        # Start a transaction
        async with session.begin():
            # Fetch sources that match the provided IDs
            result = await session.execute(
                select(SatelliteTLESources).filter(SatelliteTLESources.id.in_(satellite_tle_source_ids))
            )
            sources = result.scalars().all()

            # Determine which IDs were found
            found_ids = [source.id for source in sources]
            not_found_ids = [sat_id for sat_id in satellite_tle_source_ids if sat_id not in found_ids]

            if not sources:
                return {"success": False, "error": "None of the Satellite TLE sources were found."}

            deletion_summary = []

            for source in sources:
                source_identifier = source.identifier
                source_name = source.name

                # Find the corresponding satellite group by identifier
                group_result = await session.execute(
                    select(SatelliteGroups).filter(SatelliteGroups.identifier == source_identifier)
                )
                satellite_group = group_result.scalar_one_or_none()

                satellites_deleted = 0
                transmitters_deleted = 0
                group_deleted = False

                if satellite_group:
                    # Get the list of satellite NORAD IDs from the group
                    satellite_norad_ids = satellite_group.satellite_ids or []

                    if satellite_norad_ids:
                        # First, delete all transmitters associated with these satellites
                        # to avoid foreign key constraint violations
                        transmitters_result = await session.execute(
                            select(Transmitters).filter(Transmitters.norad_cat_id.in_(satellite_norad_ids))
                        )
                        transmitters_to_delete = transmitters_result.scalars().all()

                        for transmitter in transmitters_to_delete:
                            await session.delete(transmitter)
                            transmitters_deleted += 1

                        # Now delete all satellites that came from this TLE source
                        satellites_result = await session.execute(
                            select(Satellites).filter(Satellites.norad_id.in_(satellite_norad_ids))
                        )
                        satellites_to_delete = satellites_result.scalars().all()

                        for satellite in satellites_to_delete:
                            await session.delete(satellite)
                            satellites_deleted += 1

                    # Delete the satellite group
                    await session.delete(satellite_group)
                    group_deleted = True

                # Finally, delete the TLE source record
                await session.delete(source)

                deletion_summary.append({
                    "source_id": str(source.id),
                    "source_name": source_name,
                    "source_identifier": source_identifier,
                    "transmitters_deleted": transmitters_deleted,
                    "satellites_deleted": satellites_deleted,
                    "group_deleted": group_deleted
                })

        # Construct a success message
        total_transmitters_deleted = sum(item["transmitters_deleted"] for item in deletion_summary)
        total_satellites_deleted = sum(item["satellites_deleted"] for item in deletion_summary)
        total_groups_deleted = sum(1 for item in deletion_summary if item["group_deleted"])

        message = f"Successfully deleted {len(found_ids)} TLE source(s), {total_transmitters_deleted} transmitter(s), {total_satellites_deleted} satellite(s), and {total_groups_deleted} satellite group(s)."

        if not_found_ids:
            message += f" The following TLE source IDs were not found: {not_found_ids}."

        return {
            "success": True,
            "data": message,
            "deletion_summary": deletion_summary
        }

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting satellite TLE sources: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_satellite_group(session: AsyncSession, group_id: Optional[Union[str, uuid.UUID]] = None,
                                group_type: Optional[str] = None) -> dict:
    """
    Fetch satellite group records.

    If 'group_id' is provided, returns one satellite group record
    (optionally filtering by 'group_type' if given).
    Otherwise, returns all satellite group records (optionally filtered by 'group_type').
    """

    try:
        # if no group_id is given, return all groups (possibly filtered by group_type)
        if group_id is None:
            if group_type is not None:
                stmt = select(SatelliteGroups).where(SatelliteGroups.type == group_type)
            else:
                stmt = select(SatelliteGroups)

            result = await session.execute(stmt)
            groups = result.scalars().all()
            groups = [serialize_object(g) for g in groups]
            return {"success": True, "data": groups, "error": None}

        else:
            if isinstance(group_id, str):
                group_id = uuid.UUID(group_id)

            stmt = select(SatelliteGroups).where(SatelliteGroups.id == group_id)
            if group_type is not None:
                stmt = stmt.where(SatelliteGroups.type == group_type)

            result = await session.execute(stmt)
            group = result.scalars().first()

            group = serialize_object(group) if group else None
            return {"success": True, "data": group, "error": None}

    except Exception as e:
        logger.error(f"Error fetching satellite groups: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "data": None, "error": str(e)}


async def add_satellite_group(session: AsyncSession, data: dict) -> dict:
    """
    Add a new satellite group record.
    """
    try:
        assert "name" in data, "Name is required."

        group = SatelliteGroups(**data)
        session.add(group)
        await session.commit()
        group = serialize_object(group)
        return {"success": True, "data": group, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding satellite groups: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "data": None, "error": str(e)}


async def edit_satellite_group(session: AsyncSession, satellite_group_id: str, data: dict) -> dict:
    """
    Edit an existing satellite group record.
    """
    try:
        # Remove 'id' from data if it exists
        data.pop("id", None)
        satellite_group_uuid = uuid.UUID(satellite_group_id)

        result = await session.execute(
            select(SatelliteGroups).filter(SatelliteGroups.id == satellite_group_uuid)
        )
        group = result.scalars().first()

        if not group:
            return {"success": False, "data": None, "error": "Satellite group not found."}

        for key, value in data.items():
            setattr(group, key, value)

        await session.commit()
        group = serialize_object(group)
        return {"success": True, "data": group, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing satellite groups: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "data": None, "error": str(e)}


async def delete_satellite_group(session: AsyncSession, satellite_group_ids: Union[list[str], dict]) -> dict:
    """
    Delete satellite group record(s).
    """
    try:
        satellite_group_ids = convert_strings_to_uuids(satellite_group_ids)
        result = await session.execute(
            select(SatelliteGroups).filter(SatelliteGroups.id.in_(satellite_group_ids))
        )
        groups = result.scalars().all()

        if not groups:
            return {"success": False, "data": None, "error": "Satellite group not found."}

        for group in groups:
            await session.delete(group)

        await session.commit()
        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting satellite groups: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "data": None, "error": str(e)}


async def set_tracking_state(session: AsyncSession, data: dict) -> dict:
    """
    Upserts a record in the satellite_tracking_state table
    based on the provided data dictionary via SQLAlchemy's merge operation.
    """

    """
    name: 
    "satellite-tracking"
    
    value:
    {
        "norad_id": 53109, 
        "rotator_state": "connected", 
        "rig_state": "disconnected",
        "group_id": "c23d5955-ec14-4c91-8a19-935243cb2a9f", 
        "rotator_id": "7f714673-e661-4bc4-98e4-ac7620097aa7",
        "rig_id": "c7aa9cb8-360c-4976-928c-c836bf93af1a", 
        "transmitter_id": "C4SzpxhvuwzpKRVRQTbAWR"
    }
    """

    try:
        # Basic validation for all operations
        assert data.get('name', None) is not None, "name is required when setting tracking state"
        assert data.get('value', None) is not None, "value is required when setting tracking state"
        value = data.get('value', {})

        now = datetime.now(UTC)
        data["updated"] = now

        existing_record = await session.execute(
            select(SatelliteTrackingState).where(SatelliteTrackingState.name == data['name'])
        )
        existing_record = existing_record.scalar_one_or_none()

        if existing_record:
            # Merge the new value JSON with the existing value JSON
            if hasattr(existing_record, 'value') and existing_record.value:
                # Create a copy of the existing value to avoid modifying it directly
                merged_value = existing_record.value.copy() if isinstance(existing_record.value, dict) else {}
                # Update with the new values
                merged_value.update(data['value'])
                # Replace the incoming value with the merged one
                data['value'] = merged_value

            # Update other fields
            for key, value in data.items():
                setattr(existing_record, key, value)
            new_record = existing_record

        else:
            # Full validation only for new records
            assert value.get('norad_id', None), "norad_id is required when creating new tracking state"
            assert value.get('group_id', None), "group_id is required when creating new tracking state"
            assert value.get('rotator_state', None) is not None, "rotator_state is required when creating new tracking state"
            assert value.get('rig_state', None) is not None, "rig_state is required when creating new tracking state"
            assert value.get('rig_id') is not None, "rig_id is required when creating new tracking state"
            assert value.get('rotator_id', None) is not None, "rotator_id is required when creating new tracking state"

            new_record = SatelliteTrackingState(**data)

        await session.merge(new_record)
        await session.commit()
        new_record = serialize_object(new_record)
        return {"success": True, "data": new_record, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error storing satellite tracking state: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def get_tracking_state(session: AsyncSession, name: str) -> dict:
    """
    Fetches a SatelliteTrackingState row based on the provided key (name).
    Returns a dictionary with the data or an error message if not found.
    """

    reply: dict[str, object] = {"success": None, "data": None, "error": None}
    
    try:
        assert name is not None, "name is required when fetching tracking state"

        stmt = select(SatelliteTrackingState).filter(SatelliteTrackingState.name == name)
        result = await session.execute(stmt)
        tracking_state = result.scalar_one_or_none()

        if not tracking_state:
            return {"success": False, "data": None, "error": f"Tracking state with name '{name}' not found."}

        tracking_state = serialize_object(tracking_state)
        reply["success"] = True
        reply["data"] = tracking_state

    except Exception as e:
        logger.error(f"Error fetching satellite tracking state for key '{name}': {e}")
        logger.error(traceback.format_exc())
        reply["success"] = False
        reply["error"] = str(e)

    finally:
        pass

    return reply


async def fetch_cameras(session: AsyncSession, camera_id: Optional[Union[uuid.UUID, str]] = None) -> dict:
    """
    Fetch a single camera by its UUID or all cameras if UUID is not provided.
    """
    try:
        if camera_id is not None:
            if isinstance(camera_id, str):
                camera_id = uuid.UUID(camera_id)

            stmt = select(Cameras).filter(Cameras.id == camera_id)
            result = await session.execute(stmt)
            cameras = result.scalar_one_or_none()
        else:
            stmt = select(Cameras)
            result = await session.execute(stmt)
            cameras = result.scalars().all()

        cameras = serialize_object(cameras)
        return {"success": True, "data": cameras, "error": None}

    except Exception as e:
        logger.error(f"Error fetching cameras: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_camera(session: AsyncSession, data: dict) -> dict:
    """
    Create and add a new camera record.
    """
    try:
        new_id = uuid.uuid4()
        now = datetime.now(UTC)
        stmt = (
            insert(Cameras)
            .values(
                id=new_id,
                name=data["name"],
                url=data.get("url", ""),
                type=data.get("type", "webrtc"),
                added=now,
                updated=now
            )
            .returning(Cameras)
        )
        result = await session.execute(stmt)
        await session.commit()
        new_camera = result.scalar_one()
        new_camera = serialize_object(new_camera)
        return {"success": True, "data": new_camera, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding camera: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_camera(session: AsyncSession, data: dict) -> dict:
    """
    Edit an existing camera record by updating provided fields.
    """
    try:
        # Extract camera_id from data
        camera_id = data.pop('id', None)
        camera_id = uuid.UUID(camera_id)

        if not camera_id:
            raise Exception("id is required.")

        del data["updated"]
        del data["added"]

        # Confirm the camera exists
        stmt = select(Cameras).filter(Cameras.id == camera_id)
        result = await session.execute(stmt)
        camera = result.scalar_one_or_none()
        if not camera:
            return {"success": False, "error": f"Camera with id {camera_id} not found."}

        # Add updated timestamp
        data["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Cameras)
            .where(Cameras.id == camera_id)
            .values(**data)
            .returning(Cameras)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_camera = upd_result.scalar_one_or_none()
        updated_camera = serialize_object(updated_camera)
        return {"success": True, "data": updated_camera, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing camera: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_cameras(session: AsyncSession, camera_ids: list[Union[str, uuid.UUID]] | dict) -> dict:
    """
    Delete multiple camera records by their UUIDs or string representations of UUIDs.
    """
    try:
        camera_ids = [uuid.UUID(camera_id) if isinstance(camera_id, str) else camera_id for camera_id in
                      camera_ids]

        stmt = (
            delete(Cameras)
            .where(Cameras.id.in_(camera_ids))
            .returning(Cameras)
        )
        result = await session.execute(stmt)
        deleted = result.scalars().all()
        if not deleted:
            return {"success": False, "error": "No cameras with the provided IDs were found."}
        await session.commit()
        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting cameras: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def set_map_settings(session: AsyncSession, data: dict ) -> dict:
    """
    Updates satellite tracking state or inserts new settings into the database.

    This function handles updating settings for satellite tracking by name. If a
    record with the given name exists, it will update the existing record. Otherwise,
    it will insert a new record with the provided data. The updated/created record
    is serialized and returned alongside the success status. In case of errors,
    a failure status and error message are returned, and the transaction is rolled back.

    :param session:
        An AsyncSession instance for handling database operations.
    :param data:
        A dictionary containing the satellite tracking settings to set. The keys
        must include 'name' and 'value'. Additional keys will be used to update
        or insert the record.
    :return:
        A dictionary containing the success status, serialized record data if
        successful, and error information in case of failure.
    """
    try:
        assert data.get('name', None) is not None, "name is required when setting map settings"
        assert data.get('value', None) is not None, "value is required when setting map settings"

        now = datetime.now(UTC)
        data["updated"] = now

        existing_record = await session.execute(
            select(SatelliteTrackingState).where(SatelliteTrackingState.name == data['name'])
        )
        existing_record = existing_record.scalar_one_or_none()

        if existing_record:
            for key, value in data.items():
                setattr(existing_record, key, value)
            new_record = existing_record
        else:
            new_record = SatelliteTrackingState(**data)

        await session.merge(new_record)
        await session.commit()
        new_record = serialize_object(new_record)
        return {"success": True, "data": new_record, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error storing satellite tracking state: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def get_map_settings(session: AsyncSession, name: str) -> dict:
    """
    Retrieve map settings for the given name.

    This asynchronous function queries the database to fetch the map
    settings related to satellite tracking state. If data is successfully
    retrieved, it returns the settings in a structured format. If no data is
    found, an empty dictionary is provided. In case of an error during
    execution, the function logs the error and returns a failure response.

    :param session: Database session instance to execute queries
    :param name: The name identifier related to the map settings
    :return: A dictionary containing either the map settings 'data'
        or an empty dictionary and a 'success' status indicating
        the operation's outcome
    """
    try:
        # Query map settings from the database using the provided name
        map_settings = await session.execute(
            select(SatelliteTrackingState).where(SatelliteTrackingState.name == name)
        )
        map_settings_row = map_settings.scalars().first()

        if map_settings_row:
            map_settings_row = serialize_object(map_settings_row)
            return {'success': True, 'data': map_settings_row}
        else:
            return {'success': True, 'data': {}}

    except Exception as e:
        logger.error(f"Error retrieving map settings: {str(e)}")
        logger.exception(e)
        return {'success': False, 'data': {}, 'error': str(e)}


async def fetch_sdrs(session: AsyncSession) -> dict:
    """
    Fetches a list of SDRs from the database asynchronously and serializes their data.

    This function executes a database query to retrieve all SDRs in a sorted order.
    The SDR data is then serialized into a list of Python objects. If an error occurs
    during the process, it logs the issue and returns an error response.

    :param session: Async database session used to execute the query.
    :type session: AsyncSession
    :return: A dictionary containing the success status, serialized SDRs data if
        successful, and any error messages if applicable.
    :rtype: dict
    """

    try:
        stmt = select(SDRs).order_by(SDRs.name)
        result = await session.execute(stmt)
        sdrs = result.scalars().all()
        sdrs_list = [serialize_object(sdr) for sdr in sdrs]
        return {"success": True, "data": sdrs_list, "error": None}

    except Exception as e:
        logger.error(f"Error fetching SDRs: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_sdr(session: AsyncSession, sdr_id: Optional[Union[uuid.UUID, str]] = None) -> dict:
    """
    Fetches an SDR record from the database by its unique identifier
    and serializes it into a dictionary format. If the `sdr_id` is provided as a string, it is automatically
    converted into a UUID type. If no sdr_id is provided, returns all SDRs. The method handles potential
    exceptions by logging detailed error messages and returning an error response.

    :param session: The asynchronous database session used for executing queries.
    :type session: AsyncSession
    :param sdr_id: The unique identifier of the SDR record, either as a UUID or a string. If None, returns all SDRs.
    :type sdr_id: Optional[Union[uuid.UUID, str]]
    :return: A dictionary containing the result of the operation. Includes a boolean `success` key,
             a `data` key with the serialized SDR record(s) if successful, and an `error` key with an error
             message if any exception occurred.
    :rtype: dict
    """
    try:
        if sdr_id == "none":
            return {"success": False, "data": None, "error": "'none' was given as sdr_id"}

        if sdr_id is None:
            stmt = select(SDRs)
            result = await session.execute(stmt)
            sdr = result.scalars().all()
        else:
            # Convert string sdr_id to UUID if necessary
            if isinstance(sdr_id, str):
                sdr_id = uuid.UUID(sdr_id)

            stmt = select(SDRs).filter(SDRs.id == sdr_id)
            result = await session.execute(stmt)
            sdr = result.scalar_one_or_none()

        sdr = serialize_object(sdr)
        return {"success": True, "data": sdr, "error": None}

    except Exception as e:
        logger.error(f"Error fetching SDR by id {sdr_id}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_sdr(session: AsyncSession, data: dict) -> dict:
    """
    Adds a Software-Defined Radio (SDR) to the database.

    This function creates and adds a new SDR record to the database session. It validates the
    mandatory fields defined in the ``required_fields`` list and ensures that all necessary
    attributes are provided before creating the SDR object. In case of any error during the
    process, the session is rolled back, and the error is logged and returned.

    :param session: Database session to manage the transaction asynchronously.
    :type session: AsyncSession
    :param data: Dictionary containing the SDR data to be stored. The dictionary
        must include required fields based on type - name and serial for USB type,
        name, host, and port for TCP type.
    :type data: dict
    :return: A dictionary with the operation's success status, either the serialized SDR
        data upon success or an error message upon failure.
    :rtype: dict
    """
    try:
        # Name is always required
        if 'name' not in data or data['name'] is None:
            raise AssertionError("Field 'name' is required")

        # Check type-specific required fields
        sdr_type = data.get('type')
        if sdr_type:
            if sdr_type.lower() in ['rtlsdrusbv3', 'rtlsdrusbv4']:
                if 'serial' not in data or data['serial'] is None:
                    raise AssertionError("Field 'serial' is required for USB type SDRs")

            elif sdr_type.lower() in ['rtlsdrtcpv3', 'rtlsdrtcpv4']:
                if 'host' not in data or data['host'] is None:
                    raise AssertionError("Field 'host' is required for TCP type SDRs")
                if 'port' not in data or data['port'] is None:
                    raise AssertionError("Field 'port' is required for TCP type SDRs")

        new_sdr = SDRs(
            **{key: value for key, value in data.items() if hasattr(SDRs, key)}
        )

        session.add(new_sdr)
        await session.commit()

        # Return the newly created SDR
        return {"success": True, "data": serialize_object(new_sdr), "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding SDR: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_sdr(session: AsyncSession, data: dict) -> dict:
    """
    Edits an existing SDR (System Data Record) in the database. The function retrieves
    the SDR identified by the provided `sdr_id`, updates its fields dynamically according
    to the key-value pairs provided in `sdr_data`, and commits the changes to the database.

    :param session: Async database session to be used for querying and updating the SDR.
    :type session: AsyncSession
    :param data: Dictionary containing the fields and their new values to update in
        the SDR, including the sdr_id. Only fields present in the dictionary and explicitly
        part of the SDR object will be updated.
    :type data: dict
    :return: A dictionary containing the success status, the updated SDR data if successful,
        and an error message if applicable. Keys:
        - "success" (bool): Indicates if the operation was successful.
        - "data" (dict or None): Serialized updated SDR data if the operation was successful.
        - "error" (str or None): Error description if the operation failed.
    :rtype: dict
    """
    try:
        # Get sdr_id from data and convert to UUID if necessary
        sdr_id = data.pop('id')
        if isinstance(sdr_id, str):
            sdr_id = uuid.UUID(sdr_id)

        data.pop("updated", None)
        data.pop("added", None)

        # Get the existing SDR
        stmt = select(SDRs).filter(SDRs.id == sdr_id)
        result = await session.execute(stmt)
        sdr = result.scalar_one_or_none()

        if not sdr:
            return {"success": False, "error": f"SDR with id {sdr_id} not found"}

        # Update fields dynamically from the input data
        for key, value in data.items():
            if hasattr(sdr, key) and value is not None:
                setattr(sdr, key, value)

        sdr.updated = datetime.now(UTC)

        await session.commit()

        # Return the updated SDR
        return {"success": True, "data": serialize_object(sdr), "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing SDR {data}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_sdrs(session: AsyncSession, sdr_ids: list[Union[str, uuid.UUID]]) -> dict:
    """
    Deletes SDRs (Signal Detection Records) from the database based on the provided IDs.

    This function will attempt to convert any string-based IDs into UUIDs, verify the existence
    of the specified SDRs, and then delete them. If any error occurs during the process,
    the operation will roll back the transaction and log the error.

    :param session: An instance of AsyncSession for database transactions.
    :type session: AsyncSession
    :param sdr_ids: A list of SDR IDs, which can be a mix of strings or UUIDs,
        representing the records to be deleted.
    :type sdr_ids: list[Union[str, uuid.UUID]]
    :return: A dictionary containing the success status, any error messages,
        and additional data (if applicable).
    :rtype: dict
    """
    try:
        # Convert string IDs to UUIDs
        sdr_ids = [uuid.UUID(sdr_id) if isinstance(sdr_id, str) else sdr_id for sdr_id in sdr_ids]

        # Check if the SDRs exist
        stmt = select(SDRs).filter(SDRs.id.in_(sdr_ids))
        result = await session.execute(stmt)
        sdrs = result.scalars().all()

        if not sdrs:
            return {"success": False, "error": "No SDRs with the provided IDs were found"}

        # Delete the SDRs
        stmt = delete(SDRs).where(SDRs.id.in_(sdr_ids))
        await session.execute(stmt)
        await session.commit()

        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting SDRs {sdr_ids}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

