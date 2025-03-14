import argparse
from fastapi import FastAPI, WebSocket, Depends
from models import Base
import logging
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import uvicorn

# SQLAlchemy setup
DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Logger setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# FastAPI app
app = FastAPI()


# Function to check and create tables
def check_and_create_tables():
    logger.info("Checking if database tables exist...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables are ensured to exist.")


# Middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket route
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        logger.info(f"Received WebSocket message: {data}")
        await websocket.send_text(f"Message text was: {data}")


# Example route
@app.get("/")
def read_root():
    logger.info("Root endpoint accessed")
    return {"message": "Welcome to the FastAPI app!"}


# Command-line argument parsing
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Start the FastAPI app with custom arguments.")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to run the server on")
    parser.add_argument("--port", type=int, default=8000, help="Port to run the server on")
    args = parser.parse_args()
    check_and_create_tables()
    uvicorn.run(app, host=args.host, port=args.port)
