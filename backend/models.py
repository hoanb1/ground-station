import uuid
import json
from sqlalchemy import Table, MetaData
from datetime import datetime, UTC
from sqlalchemy.orm import DeclarativeMeta
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base

# Creates a base class for declarative models using SQLAlchemy.
Base = declarative_base()

# Creates a MetaData object that holds schema-level information such as tables, columns, and constraints.
metadata = MetaData()

# Assuming serialize_sqla_object has been defined as before:
def serialize_object(obj):
    from datetime import date, datetime
    from sqlalchemy.inspection import inspect

    serialized = {}
    for column in inspect(obj).mapper.column_attrs:
        value = getattr(obj, column.key)
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        elif isinstance(value, uuid.UUID):
            value = str(value)
        serialized[column.key] = value
    return serialized

class Satellites(Base):
    __tablename__ = 'satellites'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String, nullable=False)
    name_other = Column(String, nullable=True)
    alternative_name = Column(String, nullable=True)
    image = Column(String, nullable=True)
    sat_id = Column(String, nullable=False, primary_key=True, unique=True)
    norad_id = Column(Integer, primary_key=True, nullable=False, unique=True)
    tle1 = Column(String, nullable=True)
    tle2 = Column(String, nullable=True)
    status = Column(String, nullable=False)
    decayed = Column(DateTime, nullable=True)
    launched = Column(DateTime, nullable=True)
    deployed = Column(DateTime, nullable=True)
    website = Column(String, nullable=True)
    operator = Column(String, nullable=True)
    countries = Column(String, nullable=True)
    citation = Column(String, nullable=True)
    is_frequency_violator = Column(Boolean, nullable=False, default=False)
    associated_satellites = Column(String, nullable=True)
    added = Column(DateTime, nullable=False,  default=datetime.now(UTC))
    updated = Column(DateTime, nullable=True, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class Transmitters(Base):
    __tablename__ = 'transmitters'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    description = Column(String, nullable=False)
    alive = Column(Boolean, nullable=False)
    type = Column(String, nullable=False)
    uplink_low = Column(Integer, nullable=False)
    uplink_high = Column(Integer, nullable=False)
    uplink_drift = Column(Integer, nullable=False)
    downlink_low = Column(Integer, nullable=False)
    downlink_high = Column(Integer, nullable=False)
    downlink_drift = Column(Integer, nullable=False)
    mode = Column(String, nullable=False)
    mode_id = Column(Integer, nullable=False)
    uplink_mode = Column(String, nullable=False)
    invert = Column(Boolean, nullable=False)
    baud = Column(Integer, nullable=False)
    sat_id = Column(String, ForeignKey('satellites.sat_id'), nullable=True)
    norad_cat_id = Column(Integer, nullable=False)
    norad_follow_id = Column(Integer, nullable=False)
    status = Column(String, nullable=False)
    citation = Column(String, nullable=True)
    service = Column(String, nullable=False)
    iaru_coordination = Column(String, nullable=True)
    iaru_coordination_url = Column(String, nullable=True)
    itu_notification = Column(JSON, nullable=True)
    frequency_violation = Column(Boolean, nullable=False, default=False)
    unconfirmed = Column(Boolean, nullable=False, default=False)
    added = Column(DateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(DateTime, nullable=False, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class Rigs(Base):
    __tablename__ = 'rigs'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    radiotype = Column(String, nullable=False)
    pttstatus = Column(Integer, nullable=False)
    vfotype = Column(Integer, nullable=False)
    lodown = Column(Integer, nullable=False)
    loup = Column(Integer, nullable=False)
    added = Column(DateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(DateTime, nullable=False, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class Rotators(Base):
    __tablename__ = 'rotators'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    minaz = Column(Integer, nullable=False)
    maxaz = Column(Integer, nullable=False)
    minel = Column(Integer, nullable=False)
    maxel = Column(Integer, nullable=False)
    aztype = Column(Integer, nullable=False)
    azendstop = Column(Integer, nullable=False)
    added = Column(DateTime, nullable=False, default=datetime.now(UTC),)
    updated = Column(DateTime, nullable=False, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class Locations(Base):
    __tablename__ = 'locations'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    userid = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    name = Column(String, nullable=False)
    lat = Column(String, nullable=False)
    lon = Column(String, nullable=False)
    added = Column(DateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(DateTime, nullable=True, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class Users(Base):
    __tablename__ = 'users'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    email = Column(String, nullable=False, unique=True)
    status = Column(Enum('active', 'inactive', name='user_status_enum'), nullable=False, default='active')
    password = Column(String, nullable=False)
    fullname = Column(String, nullable=False)
    added = Column(DateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(DateTime, nullable=False, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class Preferences(Base):
    __tablename__ = 'preferences'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    userid = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    name = Column(String, nullable=False)
    value = Column(String, nullable=False)
    added = Column(DateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(DateTime, nullable=True, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class SatelliteTLESources(Base):
    __tablename__ = 'satellite_tle_sources'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String, nullable=False)
    identifier = Column(String, nullable=False)
    url = Column(String, nullable=False)
    format = Column(String, nullable=False, default='3le')
    added = Column(DateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(DateTime, nullable=False, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class SatelliteGroups(Base):
    __tablename__ = 'satellite_groups'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String, nullable=False)
    userid = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    added = Column(DateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(DateTime, nullable=False, default=datetime.now(UTC), onupdate=datetime.now(UTC))
