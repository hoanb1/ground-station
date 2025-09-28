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
import json
import random
import string
import traceback
from typing import Optional, Union
from pydantic.v1 import UUID4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update, delete, String
from datetime import datetime, UTC
from db.models import SatelliteTrackingState, Satellites, Transmitters, SatelliteTLESources, SatelliteGroups
from common.common import logger, serialize_object
from common.utils import convert_strings_to_uuids

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
    Each satellite will include information about which groups it belongs to.
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

        # For each satellite, find which groups it belongs to
        for satellite in satellites:
            norad_id = satellite['norad_id']

            # Get all groups and filter them in Python since JSON querying can be database-specific
            all_groups_stmt = select(SatelliteGroups)
            all_groups_result = await session.execute(all_groups_stmt)
            all_groups = all_groups_result.scalars().all()

            # Filter groups that contain this satellite's NORAD ID
            matching_groups = []
            for group in all_groups:
                if group.satellite_ids and norad_id in group.satellite_ids:
                    matching_groups.append(group)

            # Sort groups by number of member satellites (fewer first)
            matching_groups.sort(key=lambda g: len(g.satellite_ids) if g.satellite_ids else 0)

            # Add group information to the satellite
            satellite['groups'] = serialize_object(matching_groups) if matching_groups else []

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

        uplink_low_val = data.pop("uplinkLow")
        data["uplink_low"] = None if uplink_low_val == '-' else uplink_low_val

        uplink_high_val = data.pop("uplinkHigh")
        data["uplink_high"] = None if uplink_high_val == '-' else uplink_high_val

        downlink_low_val = data.pop("downlinkLow")
        data["downlink_low"] = None if downlink_low_val == '-' else downlink_low_val

        downlink_high_val = data.pop("downlinkHigh")
        data["downlink_high"] = None if downlink_high_val == '-' else downlink_high_val

        uplink_drift_val = data.pop("uplinkDrift")
        data["uplink_drift"] = None if uplink_drift_val == '-' else uplink_drift_val

        downlink_drift_val = data.pop("downlinkDrift")
        data["downlink_drift"] = None if downlink_drift_val == '-' else downlink_drift_val

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

        uplink_low_val = data.pop("uplinkLow")
        data["uplink_low"] = None if uplink_low_val == '-' else uplink_low_val

        uplink_high_val = data.pop("uplinkHigh")
        data["uplink_high"] = None if uplink_high_val == '-' else uplink_high_val

        downlink_low_val = data.pop("downlinkLow")
        data["downlink_low"] = None if downlink_low_val == '-' else downlink_low_val

        downlink_high_val = data.pop("downlinkHigh")
        data["downlink_high"] = None if downlink_high_val == '-' else downlink_high_val

        uplink_drift_val = data.pop("uplinkDrift")
        data["uplink_drift"] = None if uplink_drift_val == '-' else uplink_drift_val

        downlink_drift_val = data.pop("downlinkDrift")
        data["downlink_drift"] = None if downlink_drift_val == '-' else downlink_drift_val

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


