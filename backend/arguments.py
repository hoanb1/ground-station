import argparse

parser = argparse.ArgumentParser(description="Start the FastAPI app with custom arguments.")
parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to run the server on")
parser.add_argument("--port", type=int, default=8000, help="Port to run the server on")
parser.add_argument("--db", type=str, default="./gs.db", help="Path to the database file")
parser.add_argument("--log-level", type=str, default="info", choices=["debug", "info", "warning", "error", "critical"], help="Set the logging level")
parser.add_argument("--log-config", type=str, default="logconfig.yaml", help="Path to the logger configuration file")
arguments = parser.parse_args()
