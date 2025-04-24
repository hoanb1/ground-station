import argparse

parser = argparse.ArgumentParser(description="Start the Ground Station app with custom arguments.")
parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to run the server on")
parser.add_argument("--port", type=int, default=5000, help="Port to run the server on")
parser.add_argument("--db", type=str, default="./gs.db", help="Path to the database file")
parser.add_argument("--log-level", type=str, default="info", choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"], help="Set the logging level")
parser.add_argument("--log-config", type=str, default="logconfig.yaml", help="Path to the logger configuration file")
parser.add_argument("--secret-key", type=str, default="YOUR_RANDOM_SECRET_KEY", help="Secret key used for user authentication" )
parser.add_argument("--track-interval", type=int, default=3, help="Seconds between track updates")

arguments = parser.parse_args()
