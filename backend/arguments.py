# Copyright (c) 2024 Efstratios Goudelis
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

parser = argparse.ArgumentParser(description="Start the Ground Station app with custom arguments.")
parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to run the server on")
parser.add_argument("--port", type=int, default=5000, help="Port to run the server on")
parser.add_argument("--db", type=str, default="./gs.db", help="Path to the database file")
parser.add_argument("--log-level", type=str, default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"], help="Set the logging level")
parser.add_argument("--log-config", type=str, default="logconfig.yaml", help="Path to the logger configuration file")
parser.add_argument("--secret-key", type=str, default="YOUR_RANDOM_SECRET_KEY", help="Secret key used for user authentication" )
parser.add_argument("--track-interval", type=int, default=2, help="Seconds between track updates")
parser.add_argument("--enable-soapy-discovery", type=lambda x: str(x).lower() in ('true', '1', 't'), default=False,
                    help="Enable periodic SoapySDR server discovery")
parser.add_argument("--runonce-soapy-discovery", type=lambda x: str(x).lower() in ('true', '1', 't'), default=True,
                    help="Run the SoapySDR server discovery once on startup")

arguments = parser.parse_args()
