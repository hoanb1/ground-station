from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Table, MetaData
import uuid

# Creates a base class for declarative models using SQLAlchemy.
Base = declarative_base()

# Creates a MetaData object that holds schema-level information such as tables, columns, and constraints.
metadata = MetaData()


class Satellites(Base):
    __tablename__ = 'satellites'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String, nullable=False)
    name_other = Column(String, nullable=True)
    alternative_name = Column(String, nullable=True)
    image = Column(String, nullable=True)
    sat_id = Column(String, nullable=False, unique=True)
    norad_id = Column(Integer, nullable=False, unique=True)
    tle1 = Column(String, nullable=True)
    tle2 = Column(String, nullable=True)
    status = Column(String, nullable=False)
    decayed = Column(DateTime, nullable=True)
    launched = Column(DateTime, nullable=True)
    deployed = Column(DateTime, nullable=True)
    website = Column(String, nullable=True)
    operator = Column(String, nullable=True)
    countries = Column(String, nullable=True)
    added = Column(DateTime, nullable=False)
    updated = Column(DateTime, nullable=True)
    citation = Column(String, nullable=True)
    is_frequency_violator = Column(Boolean, nullable=False, default=False)
    associated_satellites = Column(String, nullable=True)

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
    added = Column(DateTime, nullable=False)
    updated = Column(DateTime, nullable=False)

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
    added = Column(DateTime, nullable=False)
    updated = Column(DateTime, nullable=False)

class Locations(Base):
    __tablename__ = 'locations'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    userid = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    name = Column(String, nullable=False)
    lat = Column(String, nullable=False)
    lon = Column(String, nullable=False)
    added = Column(DateTime, nullable=False)
    updated = Column(DateTime, nullable=True)

class Users(Base):
    __tablename__ = 'users'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    email = Column(String, nullable=False, unique=True)
    password = Column(String, nullable=False)
    fullname = Column(String, nullable=False)
    added = Column(DateTime, nullable=False)
    updated = Column(DateTime, nullable=False)

class Preferences(Base):
    __tablename__ = 'preferences'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    userid = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    name = Column(String, nullable=False)
    value = Column(String, nullable=False)
    added = Column(DateTime, nullable=False)
    updated = Column(DateTime, nullable=True)
