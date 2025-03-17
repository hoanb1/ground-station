import argparse
import uvicorn
import logging.config
import yaml
import logging
import socketio
import json
from datetime import datetime
import crud
from fastapi import FastAPI, WebSocket, Depends
from models import Base
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, declared_attr
from logger import get_logger, get_logger_config
from arguments import arguments

# setup a logger
logger = get_logger(arguments)

# hold a list of sessions
SESSIONS = {}

def get_database_session():
    """
    Provides a database session instance.

    This function creates and returns a scoped session to interact with
    the database. Always close the session after use.

    :return: A database session instance.
    :rtype: sqlalchemy.orm.Session
    """
    return SessionLocal()

# Create an asynchronous Socket.IO server using ASGI mode.
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*', logger=True, engineio_logger=True)
app = FastAPI()

# Wrap the Socket.IO server with an ASGI application.
# This allows non-Socket.IO routes (like the FastAPI endpoints) to be served as well.
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@sio.event
async def connect(sid, environ):
    client_ip = environ.get("REMOTE_ADDR")
    logger.info(f'Client {sid} from {client_ip} connected')
    SESSIONS[sid] = environ

@sio.event
async def disconnect(sid, environ):
    logger.info(f'Client {sid} from {SESSIONS[sid]['REMOTE_ADDR']} disconnected',)
    del SESSIONS[sid]

@sio.on('data_request')
async def handle_frontend_data_requests(sid, cmd, data):
    logger.info(f'Received event from: {sid}, with cmd: {cmd}, and data: {data}')
    dbsession = SessionLocal()
    reply = {'success': None, 'data': None}

    if cmd == "get-tle-sources":
        # get rows
        tle_sources = crud.fetch_satellite_tle_source(dbsession)
        reply = {'success': True, 'data': tle_sources.get('data', [])}
    dbsession.close()

    return reply

@sio.on('data_submission')
async def handle_frontend_data_submissions(sid, cmd, data):
    logger.info(f'Received event from: {sid}, with cmd: {cmd}, and data: {data}')

    reply = {'success': None, 'data': None}
    dbsession = SessionLocal()

    if cmd == "submit-tle-sources":
        # create a TLE source
        logger.info(f'Adding TLE source: {data}')
        crud.add_satellite_tle_source(dbsession, data)

        # get rows
        tle_sources = crud.fetch_satellite_tle_source(dbsession)
        reply = {'success': True, 'data': tle_sources.get('data', [])}

    elif cmd == "delete-tle-sources":
        logger.info(f'Deleting TLE source: {data}')
        crud.delete_satellite_tle_sources(dbsession, data)

        # get rows
        tle_sources = crud.fetch_satellite_tle_source(dbsession)
        reply = {'success': True, 'data': tle_sources.get('data', [])}

    elif cmd == "edit-tle-source":
        logger.info(f'Editing TLE source: {data}')
        crud.edit_satellite_tle_source(dbsession, data['id'], data)

        # get rows
        tle_sources = crud.fetch_satellite_tle_source(dbsession)
        reply = {'success': True, 'data': tle_sources.get('data', [])}

    else:
        logger.info(f'Unknown command: {cmd}')

    dbsession.close()

    return reply

@sio.on('auth_request')
async def handle_frontend_auth_requests(sid, *params):
    logger.info(f'Received event from ${sid}: ${params[0]}')

    return {'success': True, 'message': "Event received"}


# Example route
@app.get("/")
def read_root():
    logger.info("Root endpoint accessed")
    return {"message": "Welcome to the FastAPI app!"}

# Function to check and create tables
def check_and_create_tables():
    """
    Checks the database for table existence and creates the tables if they do not exist.

    This function ensures that all the database tables defined in the metadata
    are present in the database. If a table is missing, it will be created. Logging
    is performed to indicate the start and completion of the process.

    :return: None
    """
    logger.info("Checking if database tables exist...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables are ensured to exist.")



# Command-line argument parsing
if __name__ == "__main__":

    # setup a logger
    logger = get_logger(arguments)

    logger.info("Configuring database connection...")
    # SQLAlchemy setup
    DATABASE_URL = f"sqlite:///./{arguments.db}"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # create tables
    check_and_create_tables()

    logger.info(f'Starting Ground Station server with parameters {arguments}')
    # Run the ASGI application with Uvicorn on port 5000.
    uvicorn.run(socket_app, host="0.0.0.0", port=5000, log_config=get_logger_config(arguments))
