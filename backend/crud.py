import json
import uuid
import traceback
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


def fetch_user(session: Session, user_id: uuid.UUID) -> dict:
    """
    Fetch a single user by their UUID and return a dictionary with the result.
    """
    try:
        user = session.query(Users).filter(Users.id == user_id).first()
        return {"success": True, "data": user, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


def add_user(session: Session, email: str, password: str, fullname: str) -> dict:
    """
    Create and add a new user, returning a dictionary with the result.
    """
    try:
        new_user = Users(
            id=uuid.uuid4(),
            email=email,
            password=password,
            fullname=fullname,
            added=datetime.now(UTC),
            updated=datetime.now(UTC)
        )
        session.add(new_user)
        session.commit()
        return {"success": True, "data": new_user, "error": None}
    except Exception as e:
        session.rollback()  # Roll back in case of error
        return {"success": False, "error": str(e)}


def edit_user(session: Session, user_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing user by updating provided fields and return a dictionary with the result.
    """
    try:
        user = session.query(Users).filter(Users.id == user_id).first()
        if not user:
            return {"success": False, "error": f"User with id {user_id} not found."}

        # Update provided attributes
        for key, value in kwargs.items():
            if hasattr(user, key):
                setattr(user, key, value)
        # Automatically update the timestamp
        user.updated = datetime.now()
        session.commit()
        return {"success": True, "data": user, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def delete_user(session: Session, user_id: uuid.UUID) -> dict:
    """
    Delete a user by their UUID and return a dictionary with the result.
    """
    try:
        user = session.query(Users).filter(Users.id == user_id).first()
        if not user:
            return {"success": False, "error": f"User with id {user_id} not found."}

        session.delete(user)
        session.commit()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def fetch_preference(session: Session, preference_id: uuid.UUID) -> dict:
    """
    Fetch a single preference by its UUID.
    """
    try:
        preference = session.query(Preferences).filter(Preferences.id == preference_id).first()
        return {"success": True, "data": preference, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


def add_preference(session: Session, userid: uuid.UUID, name: str, value: str) -> dict:
    """
    Create and add a new preference record.
    """
    try:
        new_preference = Preferences(
            id=uuid.uuid4(),
            userid=userid,
            name=name,
            value=value,
            added=datetime.now(UTC),
            updated=datetime.now(UTC)  # Assuming updated is set at creation time
        )
        session.add(new_preference)
        session.commit()
        return {"success": True, "data": new_preference, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def edit_preference(session: Session, preference_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing preference record by updating provided fields.
    """
    try:
        preference = session.query(Preferences).filter(Preferences.id == preference_id).first()
        if not preference:
            return {"success": False, "error": f"Preference with id {preference_id} not found."}

        # Update only attributes that exist on the model
        for key, value in kwargs.items():
            if hasattr(preference, key):
                setattr(preference, key, value)

        # Update the timestamp
        preference.updated = datetime.now(UTC)
        session.commit()
        return {"success": True, "data": preference, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def delete_preference(session: Session, preference_id: uuid.UUID) -> dict:
    """
    Delete a preference record by its UUID.
    """
    try:
        preference = session.query(Preferences).filter(Preferences.id == preference_id).first()
        if not preference:
            return {"success": False, "error": f"Preference with id {preference_id} not found."}

        session.delete(preference)
        session.commit()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}




def fetch_location(session: Session, location_id: uuid.UUID) -> dict:
    """
    Fetch a single location by its UUID.
    """
    try:
        location = session.query(Locations).filter(Locations.id == location_id).first()
        return {"success": True, "data": location, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


def add_location(session: Session, userid: uuid.UUID, name: str, lat: str, lon: str) -> dict:
    """
    Create and add a new location record.
    """
    try:
        new_location = Locations(
            id=uuid.uuid4(),
            userid=userid,
            name=name,
            lat=lat,
            lon=lon,
            added=datetime.now(UTC),
            updated=datetime.now(UTC)  # Setting updated timestamp at creation time
        )
        session.add(new_location)
        session.commit()
        return {"success": True, "data": new_location, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def edit_location(session: Session, location_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing location record by updating provided fields.
    """
    try:
        location = session.query(Locations).filter(Locations.id == location_id).first()
        if not location:
            return {"success": False, "error": f"Location with id {location_id} not found."}

        # Update only attributes present in the model
        for key, value in kwargs.items():
            if hasattr(location, key):
                setattr(location, key, value)

        # Update the updated timestamp
        location.updated = datetime.now(UTC)
        session.commit()
        return {"success": True, "data": location, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def delete_location(session: Session, location_id: uuid.UUID) -> dict:
    """
    Delete a location record by its UUID.
    """
    try:
        location = session.query(Locations).filter(Locations.id == location_id).first()
        if not location:
            return {"success": False, "error": f"Location with id {location_id} not found."}

        session.delete(location)
        session.commit()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}




def fetch_rotator(session: Session, rotator_id: uuid.UUID) -> dict:
    """
    Fetch a single rotator by its UUID.
    """
    try:
        rotator = session.query(Rotators).filter(Rotators.id == rotator_id).first()
        return {"success": True, "data": rotator, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


def add_rotator(
        session: Session,
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
        new_rotator = Rotators(
            id=uuid.uuid4(),
            name=name,
            host=host,
            port=port,
            minaz=minaz,
            maxaz=maxaz,
            minel=minel,
            maxel=maxel,
            aztype=aztype,
            azendstop=azendstop,
            added=datetime.now(UTC),
            updated=datetime.now(UTC)
        )
        session.add(new_rotator)
        session.commit()
        return {"success": True, "data": new_rotator, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def edit_rotator(session: Session, rotator_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing rotator record by updating provided fields.
    """
    try:
        rotator = session.query(Rotators).filter(Rotators.id == rotator_id).first()
        if not rotator:
            return {"success": False, "error": f"Rotator with id {rotator_id} not found."}

        for key, value in kwargs.items():
            if hasattr(rotator, key):
                setattr(rotator, key, value)

        # Update the updated timestamp
        rotator.updated = datetime.now(UTC)
        session.commit()
        return {"success": True, "data": rotator, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def delete_rotator(session: Session, rotator_id: uuid.UUID) -> dict:
    """
    Delete a rotator record by its UUID.
    """
    try:
        rotator = session.query(Rotators).filter(Rotators.id == rotator_id).first()
        if not rotator:
            return {"success": False, "error": f"Rotator with id {rotator_id} not found."}

        session.delete(rotator)
        session.commit()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}



def fetch_rig(session: Session, rig_id: uuid.UUID) -> dict:
    """
    Fetch a single rig by its UUID.
    """
    try:
        rig = session.query(Rigs).filter(Rigs.id == rig_id).first()
        return {"success": True, "data": rig, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


def add_rig(
        session: Session,
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
        new_rig = Rigs(
            id=uuid.uuid4(),
            name=name,
            host=host,
            port=port,
            radiotype=radiotype,
            pttstatus=pttstatus,
            vfotype=vfotype,
            lodown=lodown,
            loup=loup,
            added=datetime.now(UTC),
            updated=datetime.now(UTC)
        )
        session.add(new_rig)
        session.commit()
        return {"success": True, "data": new_rig, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def edit_rig(session: Session, rig_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing rig record by updating provided fields.
    """
    try:
        rig = session.query(Rigs).filter(Rigs.id == rig_id).first()
        if not rig:
            return {"success": False, "error": f"Rig with id {rig_id} not found."}

        # Update only attributes present in the model
        for key, value in kwargs.items():
            if hasattr(rig, key):
                setattr(rig, key, value)

        # Update the updated timestamp
        rig.updated = datetime.now(UTC)
        session.commit()
        return {"success": True, "data": rig, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def delete_rig(session: Session, rig_id: uuid.UUID) -> dict:
    """
    Delete a rig record by its UUID.
    """
    try:
        rig = session.query(Rigs).filter(Rigs.id == rig_id).first()
        if not rig:
            return {"success": False, "error": f"Rig with id {rig_id} not found."}

        session.delete(rig)
        session.commit()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def fetch_satellites(session: Session, satellite_id: Optional[uuid.UUID] = None) -> dict:
    """
    Fetch satellite records.

    If 'satellite_id' is provided, return a single satellite record.
    Otherwise, return all satellite records.
    """
    try:
        if satellite_id is None:
            satellites = session.query(Satellites).all()
            return {"success": True, "data": satellites, "error": None}
        else:
            satellite = session.query(Satellites).filter(Satellites.id == satellite_id).first()
            return {"success": True, "data": satellite, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


def add_satellite(
        session: Session,
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
        new_satellite = Satellites(
            id=uuid.uuid4(),
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
            added=datetime.now(UTC),
            updated=datetime.now(UTC)
        )
        session.add(new_satellite)
        session.commit()
        return {"success": True, "data": new_satellite, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def edit_satellite(session: Session, satellite_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing satellite record by updating provided fields.
    """
    try:
        satellite = session.query(Satellites).filter(Satellites.id == satellite_id).first()
        if not satellite:
            return {"success": False, "error": f"Satellite with id {satellite_id} not found."}

        # Update attributes that exist on the model based on provided kwargs
        for key, value in kwargs.items():
            if hasattr(satellite, key):
                setattr(satellite, key, value)

        # Update the updated timestamp
        satellite.updated = datetime.now(UTC)
        session.commit()
        return {"success": True, "data": satellite, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def delete_satellite(session: Session, satellite_id: uuid.UUID) -> dict:
    """
    Delete a satellite record by its UUID.
    """
    try:
        satellite = session.query(Satellites).filter(Satellites.id == satellite_id).first()
        if not satellite:
            return {"success": False, "error": f"Satellite with id {satellite_id} not found."}

        session.delete(satellite)
        session.commit()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}

def fetch_transmitter(session: Session, transmitter_id: uuid.UUID) -> dict:
    """
    Fetch a single transmitter record by its UUID.
    """
    try:
        transmitter = session.query(Transmitters).filter(Transmitters.id == transmitter_id).first()
        return {"success": True, "data": transmitter, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


def add_transmitter(
        session: Session,
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
        new_transmitter = Transmitters(
            id=uuid.uuid4(),
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
            citation=citation,
            service=service,
            iaru_coordination=iaru_coordination,
            iaru_coordination_url=iaru_coordination_url,
            itu_notification=itu_notification,
            frequency_violation=frequency_violation,
            unconfirmed=unconfirmed,
            added=datetime.now(UTC),
            updated=datetime.now(UTC)
        )
        session.add(new_transmitter)
        session.commit()
        return {"success": True, "data": new_transmitter, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def edit_transmitter(session: Session, transmitter_id: uuid.UUID, **kwargs) -> dict:
    """
    Edit an existing transmitter record by updating provided fields.
    """
    try:
        transmitter = session.query(Transmitters).filter(Transmitters.id == transmitter_id).first()
        if not transmitter:
            return {"success": False, "error": f"Transmitter with id {transmitter_id} not found."}

        # Update only attributes that exist on the model
        for key, value in kwargs.items():
            if hasattr(transmitter, key):
                setattr(transmitter, key, value)

        # Update the updated timestamp
        transmitter.updated = datetime.now(UTC)
        session.commit()
        return {"success": True, "data": transmitter, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def delete_transmitter(session: Session, transmitter_id: uuid.UUID) -> dict:
    """
    Delete a transmitter record by its UUID.
    """
    try:
        transmitter = session.query(Transmitters).filter(Transmitters.id == transmitter_id).first()
        if not transmitter:
            return {"success": False, "error": f"Transmitter with id {transmitter_id} not found."}

        session.delete(transmitter)
        session.commit()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        session.rollback()
        return {"success": False, "error": str(e)}


def fetch_satellite_tle_source(session: Session, satellite_tle_source_id: int = None):
    """
    Retrieve satellite TLE source records. If an ID is provided, fetch the specific record, otherwise return all sources.
    """
    try:
        if satellite_tle_source_id is None:
            sources = session.query(SatelliteTLESources).all()
            sources = json.loads(json.dumps(sources, default=serialize_object))
            return {"success": True, "data": sources}

        source = session.query(SatelliteTLESources) \
            .filter(SatelliteTLESources.id == satellite_tle_source_id) \
            .first()

        if source:
            return {"success": True, "data": source}

        return {"success": False, "error": "Satellite TLE source not found"}
    except Exception as e:
        logger.error(f"Error fetching satellite TLE source: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


def add_satellite_tle_source(session: Session, payload: dict):
    """
    Create a new satellite TLE source record with the provided payload and return a result object.
    """
    try:
        new_source = SatelliteTLESources(**payload)
        session.add(new_source)
        session.commit()
        session.refresh(new_source)
        return {"success": True, "data": new_source}
    except Exception as e:
        session.rollback()
        logger.error(f"Error adding satellite TLE source: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


def edit_satellite_tle_source(session: Session, satellite_tle_source_id: str, payload: dict):
    """
    Update an existing satellite TLE source record with new values provided in payload.
    Returns a result object containing the updated record or an error message.
    """
    try:
        del payload['added']
        del payload['updated']
        del payload['id']
        satellite_tle_source_id = uuid.UUID(satellite_tle_source_id)

        source = session.query(SatelliteTLESources) \
            .filter(SatelliteTLESources.id == satellite_tle_source_id) \
            .first()
        if not source:
            return {"success": False, "error": "Satellite TLE source not found"}

        for key, value in payload.items():
            if hasattr(source, key):
                setattr(source, key, value)

        session.commit()
        session.refresh(source)
        return {"success": True, "data": source}
    except Exception as e:
        session.rollback()
        logger.error(f"Error editing satellite TLE source: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


def delete_satellite_tle_sources(session: Session, satellite_tle_source_ids: list[str] | dict):
    """
    Deletes multiple satellite TLE source records using their IDs.

    Parameters:
      session: SQLAlchemy session instance.
      satellite_tle_source_ids: List of satellite TLE source IDs to delete.

    Returns:
      A dictionary indicating success or failure and a message containing the deleted IDs and those not found.
    """
    try:
        satellite_tle_source_ids = convert_strings_to_uuids(satellite_tle_source_ids)

        # Fetch sources that match the provided IDs
        sources = session.query(SatelliteTLESources) \
            .filter(SatelliteTLESources.id.in_(satellite_tle_source_ids)) \
            .all()

        # Determine which IDs were found
        found_ids = [source.id for source in sources]
        not_found_ids = [sat_id for sat_id in satellite_tle_source_ids if sat_id not in found_ids]

        if not sources:
            return {"success": False, "error": "None of the Satellite TLE sources were found."}

        # delete each found source
        for source in sources:
            session.delete(source)

        session.commit()

        message = f"Satellite TLE source(s) with IDs {found_ids} deleted."
        if not_found_ids:
            message += f" The following IDs were not found: {not_found_ids}."
        return {"success": True, "data": message}

    except Exception as e:
        session.rollback()
        logger.error(f"Error deleting satellite TLE sources: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


def fetch_satellite_group(session: Session, satellite_group_id: Optional[uuid.UUID] = None) -> dict:
    """
    Fetch satellite group records.

    If satellite_group_id is provided, returns one satellite group record.
    Otherwise, returns all satellite group records.
    """
    try:

        if satellite_group_id is None:
            groups = session.query(SatelliteGroups).all()
            groups = [serialize_object(group) for group in groups]  # Serialize all groups
            return {"success": True, "data": groups, "error": None}
        else:
            group = session.query(SatelliteGroups).filter(SatelliteGroups.id == satellite_group_id).first()
            group = serialize_object(group) if group else None  # Serialize single group if found
            return {"success": True, "data": group, "error": None}
    except Exception as e:
        logger.error(f"Error fetching satellite groups: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "data": None, "error": str(e)}


def add_satellite_group(session: Session, data: dict) -> dict:
    """
    Add a new satellite group record.
    """
    try:
        group = SatelliteGroups(**data)
        session.add(group)
        session.commit()
        return {"success": True, "data": group, "error": None}
    except Exception as e:
        session.rollback()
        logger.error(f"Error adding satellite groups: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "data": None, "error": str(e)}


def edit_satellite_group(session: Session, satellite_group_id: str, data: dict) -> dict:
    """
    Edit an existing satellite group record.
    """
    try:
        del data['id']
        satellite_group_id = uuid.UUID(satellite_group_id)
        group = session.query(SatelliteGroups).filter(SatelliteGroups.id == satellite_group_id).first()
        if not group:
            return {"success": False, "data": None, "error": "Satellite group not found."}
        for key, value in data.items():
            setattr(group, key, value)
        session.commit()
        return {"success": True, "data": group, "error": None}
    except Exception as e:
        session.rollback()
        logger.error(f"Error editing satellite groups: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "data": None, "error": str(e)}


def delete_satellite_group(session: Session, satellite_group_ids: list[str] | dict) -> dict:
    """
    Delete a satellite group record.
    """
    try:
        satellite_group_ids = convert_strings_to_uuids(satellite_group_ids)
        groups = session.query(SatelliteGroups).filter(SatelliteGroups.id.in_(satellite_group_ids)).all()
        logger.info(groups)

        if not groups:
            return {"success": False, "data": None, "error": "Satellite group not found."}

        # delete each found group
        for group in groups:
            session.delete(group)

        session.commit()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        session.rollback()
        logger.error(f"Error deleting satellite groups: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "data": None, "error": str(e)}
