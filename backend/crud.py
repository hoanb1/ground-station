import json
import uuid
import traceback
from datetime import datetime, timezone
from typing import Optional, Union

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update, delete
from utils import convert_strings_to_uuids
from models import (
    SatelliteGroups,
    serialize_object,
)
from app import logger
from utils import *
from datetime import datetime, UTC
from sqlalchemy.orm import Session
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
from sqlalchemy.orm import Session


async def fetch_user(session: AsyncSession, user_id: uuid.UUID) -> dict:
    """
    Fetch a single user by their UUID.
    """
    try:
        stmt = select(Users).filter(Users.id == user_id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        return {"success": True, "data": user, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def add_user(session: AsyncSession, email: str, password: str, fullname: str) -> dict:
    """
    Create and add a new user.
    """
    try:
        new_id = uuid.uuid4()
        now = datetime.now(UTC)
        stmt = (
            insert(Users)
            .values(
                id=new_id,
                email=email,
                password=password,
                fullname=fullname,
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


async def edit_user(session: AsyncSession, user_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing user by updating provided fields.
    """
    try:
        # Check if the user exists
        stmt = select(Users).filter(Users.id == user_id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            return {"success": False, "error": f"User with id {user_id} not found."}

        # Update provided fields; also update the timestamp
        kwargs["updated"] = datetime.now(UTC)
        upd_stmt = (
            update(Users)
            .where(Users.id == user_id)
            .values(**kwargs)
            .returning(Users)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_user = upd_result.scalar_one_or_none()
        return {"success": True, "data": updated_user, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def delete_user(session: AsyncSession, user_id: uuid.UUID) -> dict:
    """
    Delete a user by their UUID.
    """
    try:
        stmt = (
            delete(Users)
            .where(Users.id == user_id)
            .returning(Users)
        )
        result = await session.execute(stmt)
        deleted_user = result.scalar_one_or_none()
        if not deleted_user:
            return {"success": False, "error": f"User with id {user_id} not found."}
        await session.commit()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        await session.rollback()
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


async def fetch_location(session: AsyncSession, location_id: uuid.UUID) -> dict:
    """
    Fetch a single location by its UUID.
    """
    try:
        stmt = select(Locations).filter(Locations.id == location_id)
        result = await session.execute(stmt)
        location = result.scalar_one_or_none()
        return {"success": True, "data": location, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def add_location(session: AsyncSession, userid: uuid.UUID, name: str, lat: str, lon: str) -> dict:
    """
    Create and add a new location record.
    """
    try:
        new_id = uuid.uuid4()
        now = datetime.now(UTC)
        stmt = (
            insert(Locations)
            .values(
                id=new_id,
                userid=userid,
                name=name,
                lat=lat,
                lon=lon,
                added=now,
                updated=now
            )
            .returning(Locations)
        )
        result = await session.execute(stmt)
        await session.commit()
        new_location = result.scalar_one()
        return {"success": True, "data": new_location, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def edit_location(session: AsyncSession, location_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing location record by updating provided fields.
    """
    try:
        # Ensure the location exists first
        stmt = select(Locations).filter(Locations.id == location_id)
        result = await session.execute(stmt)
        location = result.scalar_one_or_none()
        if not location:
            return {"success": False, "error": f"Location with id {location_id} not found."}

        # Update the updated timestamp
        kwargs["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Locations)
            .where(Locations.id == location_id)
            .values(**kwargs)
            .returning(Locations)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_location = upd_result.scalar_one_or_none()
        return {"success": True, "data": updated_location, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def delete_location(session: AsyncSession, location_id: uuid.UUID) -> dict:
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
        return {"success": False, "error": str(e)}


async def fetch_rotator(session: AsyncSession, rotator_id: uuid.UUID) -> dict:
    """
    Fetch a single rotator by its UUID.
    """
    try:
        stmt = select(Rotators).filter(Rotators.id == rotator_id)
        result = await session.execute(stmt)
        rotator = result.scalar_one_or_none()
        return {"success": True, "data": rotator, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def add_rotator(
        session: AsyncSession,
        name: str,
        host: str,
        port: int,
        minaz: int,
        maxaz: int,
        minel: int,
        maxel: int,
        aztype: int,
        azendstop: int
) -> dict:
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
                name=name,
                host=host,
                port=port,
                minaz=minaz,
                maxaz=maxaz,
                minel=minel,
                maxel=maxel,
                aztype=aztype,
                azendstop=azendstop,
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
        return {"success": False, "error": str(e)}


async def edit_rotator(session: AsyncSession, rotator_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing rotator record by updating provided fields.
    """
    try:
        # Confirm the rotator exists
        stmt = select(Rotators).filter(Rotators.id == rotator_id)
        result = await session.execute(stmt)
        rotator = result.scalar_one_or_none()
        if not rotator:
            return {"success": False, "error": f"Rotator with id {rotator_id} not found."}

        kwargs["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Rotators)
            .where(Rotators.id == rotator_id)
            .values(**kwargs)
            .returning(Rotators)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_rotator = upd_result.scalar_one_or_none()
        return {"success": True, "data": updated_rotator, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def delete_rotator(session: AsyncSession, rotator_id: uuid.UUID) -> dict:
    """
    Delete a rotator record by its UUID.
    """
    try:
        stmt = (
            delete(Rotators)
            .where(Rotators.id == rotator_id)
            .returning(Rotators)
        )
        result = await session.execute(stmt)
        deleted = result.scalar_one_or_none()
        if not deleted:
            return {"success": False, "error": f"Rotator with id {rotator_id} not found."}
        await session.commit()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def fetch_rig(session: AsyncSession, rig_id: uuid.UUID) -> dict:
    """
    Fetch a single rig by its UUID.
    """
    try:
        stmt = select(Rigs).filter(Rigs.id == rig_id)
        result = await session.execute(stmt)
        rig = result.scalar_one_or_none()
        return {"success": True, "data": rig, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def add_rig(
        session: AsyncSession,
        name: str,
        host: str,
        port: int,
        radiotype: str,
        pttstatus: int,
        vfotype: int,
        lodown: int,
        loup: int
) -> dict:
    """
    Create and add a new rig record.
    """
    try:
        new_id = uuid.uuid4()
        now = datetime.now(UTC)
        stmt = (
            insert(Rigs)
            .values(
                id=new_id,
                name=name,
                host=host,
                port=port,
                radiotype=radiotype,
                pttstatus=pttstatus,
                vfotype=vfotype,
                lodown=lodown,
                loup=loup,
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
        return {"success": False, "error": str(e)}


async def edit_rig(session: AsyncSession, rig_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing rig record by updating provided fields.
    """
    try:
        # Optionally check if the record exists
        stmt = select(Rigs).filter(Rigs.id == rig_id)
        result = await session.execute(stmt)
        rig = result.scalar_one_or_none()
        if not rig:
            return {"success": False, "error": f"Rig with id {rig_id} not found."}

        # Update the updated timestamp.
        kwargs["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Rigs)
            .where(Rigs.id == rig_id)
            .values(**kwargs)
            .returning(Rigs)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_rig = upd_result.scalar_one_or_none()
        return {"success": True, "data": updated_rig, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def delete_rig(session: AsyncSession, rig_id: uuid.UUID) -> dict:
    """
    Delete a rig record by its UUID.
    """
    try:
        stmt = (
            delete(Rigs)
            .where(Rigs.id == rig_id)
            .returning(Rigs)
        )
        result = await session.execute(stmt)
        deleted = result.scalar_one_or_none()
        if not deleted:
            return {"success": False, "error": f"Rig with id {rig_id} not found."}
        await session.commit()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def fetch_satellites(session: AsyncSession, satellite_id: uuid.UUID = None) -> dict:
    """
    Fetch satellite records.

    If 'satellite_id' is provided, return a single satellite record.
    Otherwise, return all satellite records.
    """
    try:
        if satellite_id is None:
            stmt = select(Satellites)
            result = await session.execute(stmt)
            satellites = result.scalars().all()
            return {"success": True, "data": satellites, "error": None}
        else:
            stmt = select(Satellites).filter(Satellites.id == satellite_id)
            result = await session.execute(stmt)
            satellite = result.scalar_one_or_none()
            return {"success": True, "data": satellite, "error": None}
    except Exception as e:
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
                id=new_id,
                name=name,
                name_other=name_other,
                alternative_name=alternative_name,
                image=image,
                sat_id=sat_id,
                norad_id=norad_id,
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
        return {"success": False, "error": str(e)}


async def edit_satellite(session: AsyncSession, satellite_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing satellite record by updating provided fields.
    """
    try:
        # Check if the satellite exists
        stmt = select(Satellites).filter(Satellites.id == satellite_id)
        result = await session.execute(stmt)
        satellite = result.scalar_one_or_none()
        if not satellite:
            return {"success": False, "error": f"Satellite with id {satellite_id} not found."}

        # Set the updated timestamp
        kwargs["updated"] = datetime.now(UTC)

        upd_stmt = (
            update(Satellites)
            .where(Satellites.id == satellite_id)
            .values(**kwargs)
            .returning(Satellites)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_satellite = upd_result.scalar_one_or_none()
        return {"success": True, "data": updated_satellite, "error": None}
    except Exception as e:
        await session.rollback()
        return {"success": False, "error": str(e)}


async def delete_satellite(session: AsyncSession, satellite_id: uuid.UUID) -> dict:
    """
    Delete a satellite record by its UUID.
    """
    try:
        stmt = (
            delete(Satellites)
            .where(Satellites.id == satellite_id)
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


async def fetch_satellite_tle_source(
        session: AsyncSession, satellite_tle_source_id: Optional[int] = None
) -> dict:
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


async def add_satellite_tle_source(
        session: AsyncSession, payload: dict
) -> dict:
    """
    Create a new satellite TLE source record with the provided payload.
    """
    try:
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


async def fetch_satellite_group(
        session: AsyncSession, satellite_group_id: Optional[uuid.UUID] = None
) -> dict:
    """
    Fetch satellite group records.

    If satellite_group_id is provided, returns one satellite group record.
    Otherwise, returns all satellite group records.
    """
    try:
        if satellite_group_id is None:
            result = await session.execute(select(SatelliteGroups))
            groups = result.scalars().all()
            groups = [serialize_object(group) for group in groups]  # Serialize all groups
            return {"success": True, "data": groups, "error": None}
        else:
            result = await session.execute(
                select(SatelliteGroups).filter(SatelliteGroups.id == satellite_group_id)
            )
            group = result.scalars().first()
            group = serialize_object(group) if group else None  # Serialize single group if found
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


async def delete_satellite_group(
        session: AsyncSession, satellite_group_ids: Union[list[str], dict]
) -> dict:
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
