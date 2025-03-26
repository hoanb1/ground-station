import uuid
import json
from datetime import date, datetime
from sqlalchemy import Table, MetaData
from datetime import datetime, UTC, timezone, timedelta
from sqlalchemy import TypeDecorator, DateTime
from sqlalchemy.orm import DeclarativeMeta
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
from enum import Enum as PyEnum
from sqlalchemy import Column, Enum


# Creates a base class for declarative models using SQLAlchemy.
Base = declarative_base()

# Creates a MetaData object that holds schema-level information such as tables, columns, and constraints.
metadata = MetaData()

class ModelEncoder(json.JSONEncoder):
    def default(self, obj):

        if isinstance(obj, (date, datetime)):
            return obj.isoformat()

        if isinstance(obj, timedelta):
            return str(obj)

        if isinstance(obj, uuid.UUID):
            return str(obj)

        # Attempt to convert SQLAlchemy model objects
        # by reading their columns
        try:
            return {
                column.name: getattr(obj, column.name)
                for column in obj.__table__.columns
            }
        except AttributeError:
            # If the object is not a SQLAlchemy model row, fallback
            return super().default(obj)


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

class AwareDateTime(TypeDecorator):
    """
    A type that ensures timezone-aware datetimes by
    attaching UTC if the datetime is naive.
    """
    impl = DateTime(timezone=False)  # or True, but SQLite doesn't honor tz anyway

    def process_result_value(self, value, dialect):
        """
        When reading from DB, if it's naive, attach UTC.
        """
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    def process_bind_param(self, value, dialect):
        """
        (Optional) When writing to DB, you can also
        enforce that all datetimes are stored in UTC.
        """
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class JsonField(TypeDecorator):
    """
    A type for handling JSON data by serializing/deserializing
    it during storage and retrieval.
    """
    impl = JSON

    def process_result_value(self, value, dialect):
        """
        When reading from DB, deserialize JSON string to Python object.
        """
        if value is not None:
            return json.loads(value)
        return value

    def process_bind_param(self, value, dialect):
        """
        When writing to DB, serialize Python object to JSON string.
        """
        if value is not None:
            return json.dumps(value)
        return value




class Satellites(Base):
    __tablename__ = 'satellites'
    norad_id = Column(Integer, primary_key=True, nullable=False, unique=True)
    name = Column(String, nullable=False)
    name_other = Column(String, nullable=True)
    alternative_name = Column(String, nullable=True)
    image = Column(String, nullable=True)
    sat_id = Column(String, nullable=True)
    tle1 = Column(String, nullable=False)
    tle2 = Column(String, nullable=False)
    status = Column(String, nullable=True)
    decayed = Column(AwareDateTime, nullable=True)
    launched = Column(AwareDateTime, nullable=True)
    deployed = Column(AwareDateTime, nullable=True)
    website = Column(String, nullable=True)
    operator = Column(String, nullable=True)
    countries = Column(String, nullable=True)
    citation = Column(String, nullable=True)
    is_frequency_violator = Column(Boolean, nullable=True, default=False)
    associated_satellites = Column(String, nullable=True)
    added = Column(AwareDateTime, nullable=False,  default=datetime.now(UTC))
    updated = Column(AwareDateTime, nullable=True, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class Transmitters(Base):
    __tablename__ = 'transmitters'
    id = Column(String, nullable=False, primary_key=True, unique=True)
    description = Column(String, nullable=True)
    alive = Column(Boolean, nullable=True)
    type = Column(String, nullable=True)
    uplink_low = Column(Integer, nullable=True)
    uplink_high = Column(Integer, nullable=True)
    uplink_drift = Column(Integer, nullable=True)
    downlink_low = Column(Integer, nullable=True)
    downlink_high = Column(Integer, nullable=True)
    downlink_drift = Column(Integer, nullable=True)
    mode = Column(String, nullable=True)
    mode_id = Column(Integer, nullable=True)
    uplink_mode = Column(String, nullable=True)
    invert = Column(Boolean, nullable=True)
    baud = Column(Integer, nullable=True)
    sat_id = Column(String, ForeignKey('satellites.sat_id'), nullable=True)
    norad_cat_id = Column(Integer, nullable=False)
    norad_follow_id = Column(Integer, nullable=True)
    status = Column(String, nullable=False)
    citation = Column(String, nullable=True)
    service = Column(String, nullable=True)
    iaru_coordination = Column(String, nullable=True)
    iaru_coordination_url = Column(String, nullable=True)
    itu_notification = Column(JSON, nullable=True)
    frequency_violation = Column(Boolean, nullable=True, default=False)
    unconfirmed = Column(Boolean, nullable=True, default=False)
    added = Column(AwareDateTime, nullable=True, default=datetime.now(UTC))
    updated = Column(AwareDateTime, nullable=True, default=datetime.now(UTC), onupdate=datetime.now(UTC))

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
    added = Column(AwareDateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(AwareDateTime, nullable=False, default=datetime.now(UTC), onupdate=datetime.now(UTC))

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
    added = Column(AwareDateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(AwareDateTime, nullable=False, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class Locations(Base):
    __tablename__ = 'locations'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    userid = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    name = Column(String, nullable=False)
    lat = Column(String, nullable=False)
    lon = Column(String, nullable=False)
    added = Column(AwareDateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(AwareDateTime, nullable=True, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class Users(Base):
    __tablename__ = 'users'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    email = Column(String, nullable=False, unique=True)
    status = Column(Enum('active', 'inactive', name='user_status_enum'), nullable=False, default='active')
    password = Column(String, nullable=False)
    fullname = Column(String, nullable=False)
    added = Column(AwareDateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(AwareDateTime, nullable=False, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class Preferences(Base):
    __tablename__ = 'preferences'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    userid = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    name = Column(String, nullable=False)
    value = Column(String, nullable=False)
    added = Column(AwareDateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(AwareDateTime, nullable=True, default=datetime.now(UTC), onupdate=datetime.now(UTC))

class SatelliteTLESources(Base):
    __tablename__ = 'satellite_tle_sources'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String, nullable=False)
    identifier = Column(String, nullable=False)
    url = Column(String, nullable=False)
    format = Column(String, nullable=False, default='3le')
    added = Column(AwareDateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(AwareDateTime, nullable=False, default=datetime.now(UTC), onupdate=datetime.now(UTC))


class SatelliteGroupType(str, PyEnum):
    USER = "user"
    SYSTEM = "system"


class SatelliteGroups(Base):
    __tablename__ = 'satellite_groups'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String, nullable=False)
    identifier = Column(String, nullable=True)
    userid = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    type = Column(Enum(SatelliteGroupType), nullable=False, default=SatelliteGroupType.USER)
    satellite_ids = Column(JsonField, nullable=True)
    added = Column(AwareDateTime, nullable=False, default=datetime.now(UTC))
    updated = Column(AwareDateTime, nullable=False, default=datetime.now(UTC), onupdate=datetime.now(UTC))
