import json
import traceback
import bcrypt
from typing import Union
from pydantic.v1 import UUID4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update, delete
from utils import *
from datetime import datetime, UTC
from models import Users
from models import Locations
from models import Preferences
from models import Rotators
from models import Rigs
from models import Satellites
from models import Transmitters
from models import SatelliteTLESources
from models import SatelliteGroups
from app import logger
from models import serialize_object
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

        # hash the password
        if data.get("password", "") != "":
            logger.info("Hashing password for user: %s", user_id)
            password = data.pop("password")
            salt = bcrypt.gensalt()
            password_hash = bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")
            data["password"] = password_hash

    # Check if the user exists
        stmt = select(Users).filter(Users.id == user_id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            return {"success": False, "error": f"User with id {user_id} not found."}

        # Update provided fields; also update the timestamp
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
        return {"success": True, "data": preference, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def add_preference(session: AsyncSession, userid: uuid.UUID, name: str, value: str) -> dict:
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
                userid=userid,
                name=name,
                value=value,
                added=now,
                updated=now
            )
            .returning(Preferences)
        )
        result = await session.execute(stmt)
        await session.commit()
        new_preference = result.scalar_one()
        return {"success": True, "data": new_preference, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def edit_preference(session: AsyncSession, preference_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing preference record by updating provided fields.
    """
    try:
        # Confirm the preference exists first
        stmt = select(Preferences).filter(Preferences.id == preference_id)
        result = await session.execute(stmt)
        preference = result.scalar_one_or_none()
        if not preference:
            return {"success": False, "error": f"Preference with id {preference_id} not found."}

        # Update the timestamp
        kwargs["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Preferences)
            .where(Preferences.id == preference_id)
            .values(**kwargs)
            .returning(Preferences)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_preference = upd_result.scalar_one_or_none()
        return {"success": True, "data": updated_preference, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def delete_preference(session: AsyncSession, preference_id: uuid.UUID) -> dict:
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
        stmt = (
            insert(Locations)
            .values(**data)
            .returning(Locations)
        )
        result = await session.execute(stmt)
        await session.commit()
        new_location = result.scalar_one()
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

        location_id = uuid.UUID(location_id)

        # Ensure the location exists first
        stmt = select(Locations).filter(Locations.id == location_id)
        result = await session.execute(stmt)
        location = result.scalar_one_or_none()
        if not location:
            return {"success": False, "error": f"Location with id {location_id} not found."}

        # Update the updated timestamp
        data["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Locations)
            .where(Locations.id == location_id)
            .values(**data)
            .returning(Locations)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_location = upd_result.scalar_one_or_none()
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
        if rig_id is None:
            stmt = select(Rigs)
        else:
            stmt = select(Rigs).filter(Rigs.id == rig_id)
        result = await session.execute(stmt)
        rigs = result.scalars().all() if rig_id is None else result.scalar_one_or_none()
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

        return {"success": True, "data": group, "error": None}

    except Exception as e:
        logger.error(f"Error fetching satellite group by identifier: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_satellites_for_group_id(session: AsyncSession, group_id: str | UUID4) -> dict:
    """
    Fetch satellite records for the given group id

    If 'satellite_id' is provided, return a single satellite record.
    Otherwise, return all satellite records.
    """
    try:
        if isinstance(group_id, str):
            group_id = uuid.UUID(group_id)

        group = await fetch_satellite_group(session, group_id)
        if group.get('data', {}).get('satellite_ids') is not None:
            group['data']['satellite_ids'] = json.loads(group['data']['satellite_ids'])
        else:
            group['data']['satellite_ids'] = []

        satellite_ids = group['data']['satellite_ids']
        stmt = select(Satellites).filter(Satellites.norad_id.in_(satellite_ids))
        result = await session.execute(stmt)
        satellites = result.scalars().all()

        return {"success": True, "data": satellites, "error": None}

    except Exception as e:
        logger.error(f"Error fetching satellite(s): {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_satellites(session: AsyncSession, satellite_id: str | None) -> dict:
    """
    Fetch satellite records.

    If 'satellite_id' is provided, return a single satellite record.
    Otherwise, return all satellite records.
    If 'with_transmitters' is True, also fetch and attach any
    associated transmitters for each satellite.
    """
    try:
        if satellite_id is None:
            stmt = select(Satellites)
            result = await session.execute(stmt)
            satellites = result.scalars().all()
        else:
            stmt = select(Satellites).filter(Satellites.norad_id == satellite_id)
            result = await session.execute(stmt)
            satellite = result.scalar_one_or_none()
            satellites = [satellite] if satellite else []

        return {"success": True, "data": satellites, "error": None}

    except Exception as e:
        logger.error(f"Error fetching satellite(s): {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_satellite(
        session: AsyncSession,
        name: str,
        sat_id: str,
        norad_id: int,
        status: str,
        is_frequency_violator: bool,
        name_other: str = None,
        alternative_name: str = None,
        image: str = None,
        tle1: str = None,
        tle2: str = None,
        decayed: datetime = None,
        launched: datetime = None,
        deployed: datetime = None,
        website: str = None,
        operator: str = None,
        countries: str = None,
        citation: str = None,
        associated_satellites: str = None
) -> dict:
    """
    Create and add a new satellite record.
    """
    try:
        new_id = uuid.uuid4()
        now = datetime.now(UTC)
        stmt = (
            insert(Satellites)
            .values(
                norad_id=norad_id,
                name=name,
                name_other=name_other,
                alternative_name=alternative_name,
                image=image,
                sat_id=sat_id,
                tle1=tle1,
                tle2=tle2,
                status=status,
                decayed=decayed,
                launched=launched,
                deployed=deployed,
                website=website,
                operator=operator,
                countries=countries,
                citation=citation,
                is_frequency_violator=is_frequency_violator,
                associated_satellites=associated_satellites,
                added=now,
                updated=now
            )
            .returning(Satellites)
        )
        result = await session.execute(stmt)
        await session.commit()
        new_satellite = result.scalar_one()
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
        return {"success": True, "data": updated_satellite, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing satellite {satellite_id}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_satellite(session: AsyncSession, satellite_id: uuid.UUID) -> dict:
    """
    Delete a satellite record by its UUID.
    """
    try:
        stmt = (
            delete(Satellites)
            .where(Satellites.norad_id == satellite_id)
            .returning(Satellites)
        )
        result = await session.execute(stmt)
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
        return {"success": True, "data": transmitters, "error": None}

    except Exception as e:
        logger.error(f"Error fetching transmitters for satellite {norad_id}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_transmitter(session: AsyncSession, transmitter_id: uuid.UUID) -> dict:
    """
    Fetch a single transmitter record by its UUID.
    """
    try:
        stmt = select(Transmitters).filter(Transmitters.id == transmitter_id)
        result = await session.execute(stmt)
        transmitter = result.scalar_one_or_none()
        return {"success": True, "data": transmitter, "error": None}

    except Exception as e:
        return {"success": False, "error": str(e)}


async def add_transmitter(
        session: AsyncSession,
        description: str,
        alive: bool,
        type: str,
        uplink_low: int,
        uplink_high: int,
        uplink_drift: int,
        downlink_low: int,
        downlink_high: int,
        downlink_drift: int,
        mode: str,
        mode_id: int,
        uplink_mode: str,
        invert: bool,
        baud: int,
        sat_id: str,
        norad_cat_id: int,
        norad_follow_id: int,
        status: str,
        service: str,
        citation: str = None,
        iaru_coordination: str = None,
        iaru_coordination_url: str = None,
        itu_notification=None,
        frequency_violation: bool = False,
        unconfirmed: bool = False
) -> dict:
    """
    Create and add a new transmitter record.
    """
    try:
        new_id = uuid.uuid4()
        now = datetime.now(UTC)
        stmt = insert(Transmitters).values(
            id=new_id,
            description=description,
            alive=alive,
            type=type,
            uplink_low=uplink_low,
            uplink_high=uplink_high,
            uplink_drift=uplink_drift,
            downlink_low=downlink_low,
            downlink_high=downlink_high,
            downlink_drift=downlink_drift,
            mode=mode,
            mode_id=mode_id,
            uplink_mode=uplink_mode,
            invert=invert,
            baud=baud,
            sat_id=sat_id,
            norad_cat_id=norad_cat_id,
            norad_follow_id=norad_follow_id,
            status=status,
            service=service,
            citation=citation,
            iaru_coordination=iaru_coordination,
            iaru_coordination_url=iaru_coordination_url,
            itu_notification=itu_notification,
            frequency_violation=frequency_violation,
            unconfirmed=unconfirmed,
            added=now,
            updated=now
        ).returning(Transmitters)

        result = await session.execute(stmt)
        await session.commit()
        new_transmitter = result.scalar_one()
        return {"success": True, "data": new_transmitter, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def edit_transmitter(session: AsyncSession, transmitter_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing transmitter record by updating provided fields.
    """
    try:
        # Optionally ensure the record exists first:
        stmt = select(Transmitters).filter(Transmitters.id == transmitter_id)
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()
        if not existing:
            return {"success": False, "error": f"Transmitter with id {transmitter_id} not found."}

        # Ensure the updated timestamp is set.
        kwargs["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Transmitters)
            .where(Transmitters.id == transmitter_id)
            .values(**kwargs)
            .returning(Transmitters)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_transmitter = upd_result.scalar_one_or_none()
        return {"success": True, "data": updated_transmitter, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def delete_transmitter(session: AsyncSession, transmitter_id: uuid.UUID) -> dict:
    """
    Delete a transmitter record by its UUID.
    """
    try:
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
            return {"success": True, "data": sources}
        else:
            result = await session.execute(
                select(SatelliteTLESources).filter(SatelliteTLESources.id == satellite_tle_source_id)
            )
            source = result.scalars().first()
            if source:
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
        assert payload['identifier']

        new_source = SatelliteTLESources(**payload)
        session.add(new_source)
        await session.commit()
        await session.refresh(new_source)
        return {"success": True, "data": new_source}
    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding satellite TLE source: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_satellite_tle_source(
        session: AsyncSession, satellite_tle_source_id: str, payload: dict
) -> dict:
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
        return {"success": True, "data": source}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing satellite TLE source: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_satellite_tle_sources(
        session: AsyncSession, satellite_tle_source_ids: Union[list[str], dict]
) -> dict:
    """
    Deletes multiple satellite TLE source records using their IDs.
    """
    try:
        satellite_tle_source_ids = convert_strings_to_uuids(satellite_tle_source_ids)

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

        for source in sources:
            await session.delete(source)

        await session.commit()

        message = f"Satellite TLE source(s) with IDs {found_ids} deleted."
        if not_found_ids:
            message += f" The following IDs were not found: {not_found_ids}."

        return {"success": True, "data": message}
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
        # 1. If no group_id is given, return all groups (possibly filtered by group_type).
        if group_id is None:
            if group_type is not None:
                stmt = select(SatelliteGroups).where(SatelliteGroups.type == group_type)
            else:
                stmt = select(SatelliteGroups)

            result = await session.execute(stmt)
            groups = result.scalars().all()
            groups = [serialize_object(g) for g in groups]
            return {"success": True, "data": groups, "error": None}

        # 2. group_id is provided, we return a single group (optionally filtered by group_type).
        #    Convert group_id from string to UUID if needed.
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
        return {"success": True, "data": serialize_object(group), "error": None}
    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding satellite groups: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "data": None, "error": str(e)}


async def edit_satellite_group(
        session: AsyncSession, satellite_group_id: str, data: dict
) -> dict:
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
        return {"success": True, "data": serialize_object(group), "error": None}
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
