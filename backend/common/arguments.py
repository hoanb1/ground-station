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


import argparse
import os

parser = argparse.ArgumentParser(description="Start the Ground Station app with custom arguments.")
parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to run the server on")
parser.add_argument("--port", type=int, default=5000, help="Port to run the server on")
parser.add_argument("--db", type=str, default="data/db/gs.db", help="Path to the database file")
parser.add_argument(
    "--log-level",
    type=str,
    default="INFO",
    choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
    help="Set the logging level",
)
parser.add_argument(
    "--log-config", type=str, default="logconfig.yaml", help="Path to the logger configuration file"
)
parser.add_argument(
    "--secret-key",
    type=str,
    default="YOUR_RANDOM_SECRET_KEY",
    help="Secret key used for user authentication",
)
parser.add_argument("--track-interval", type=int, default=2, help="Seconds between track updates")
parser.add_argument(
    "--enable-soapy-discovery",
    type=lambda x: str(x).lower() in ("true", "1", "t"),
    default=False,
    help="Enable periodic SoapySDR server discovery",
)
parser.add_argument(
    "--runonce-soapy-discovery",
    type=lambda x: str(x).lower() in ("true", "1", "t"),
    default=True,
    help="Run the SoapySDR server discovery once on startup",
)

# Only parse arguments if we're not in an alembic context
if os.environ.get("ALEMBIC_CONTEXT"):
    # Create a namespace with default values for alembic context
    arguments = argparse.Namespace(
        host="0.0.0.0",
        port=5000,
        db="data/db/gs.db",
        log_level="INFO",
        log_config="logconfig.yaml",
        secret_key="YOUR_RANDOM_SECRET_KEY",
        track_interval=2,
        enable_soapy_discovery=False,
        runonce_soapy_discovery=True,
    )
else:
    arguments = parser.parse_args()
