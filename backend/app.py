import argparse
from fastapi import FastAPI, WebSocket, Depends
from models import Base
import logging
import socketio
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import uvicorn
import logging.config
import yaml
import json


def setup_arguments():
    """
    Configures and parses command-line arguments for launching a FastAPI application.

    This function sets up an argument parser to accept custom inputs such as the
    host address, port number, and database file path necessary to configure and
    run a FastAPI application. It returns an object containing the parsed arguments.

    :raises SystemExit: If the parsing fails or the arguments are invalid.

    :return: A namespace object containing the parsed arguments.
    :rtype: argparse.Namespace
    """
    parser = argparse.ArgumentParser(description="Start the FastAPI app with custom arguments.")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to run the server on")
    parser.add_argument("--port", type=int, default=8000, help="Port to run the server on")
    parser.add_argument("--db", type=str, default="./gs.db", help="Path to the database file")
    parser.add_argument("--log-level", type=str, default="info", choices=["debug", "info", "warning", "error", "critical"], help="Set the logging level")
    parser.add_argument("--log-config", type=str, default="logconfig.yaml", help="Path to the logger configuration file")
    arguments = parser.parse_args()
    return arguments

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
    logger.info("Client connected: %s", sid)

@sio.event
async def disconnect(sid):
    logger.info("Client disconnected: %s", sid)

@sio.event
async def message(sid, data):
    logger.info("Received message: %s", data)

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


def yaml_to_json_config(filepath):
    """
    Converts a YAML file to a Python dictionary.

    This function reads a YAML configuration file from the provided file path
    and returns its contents as a Python dictionary. It is useful for loading
    configuration settings stored in YAML format.

    :param filepath: Path to the YAML file that needs to be converted.
    :type filepath: str
    :return: Python dictionary containing the loaded YAML configuration.
    :rtype: dict
    :raises FileNotFoundError: If the specified file cannot be found.
    :raises yaml.YAMLError: If the YAML file cannot be parsed due to invalid syntax.
    """
    with open(filepath, "r") as file:
        return yaml.safe_load(file)


# Command-line argument parsing
if __name__ == "__main__":

    # setup cli arguments
    args = setup_arguments()

    # logger setup
    logging_config = yaml_to_json_config(args.log_config)
    logging.config.dictConfig(logging_config)
    logger = logging.getLogger("ground-station")
    logger.info("Starting the Ground Station Backend with the following arguments: %s", args)


    # SQLAlchemy setup
    DATABASE_URL = f"sqlite:///./{args.db}"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # create tables
    check_and_create_tables()

    # Run the ASGI application with Uvicorn on port 5000.
    uvicorn.run(socket_app, host="0.0.0.0", port=5000, log_config=logging_config)
