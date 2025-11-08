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

"""First-time initialization logic for new database setup."""

import asyncio
import random
import string

from common.logger import logger
from db import AsyncSessionLocal
from db.models import Locations, TLESources


async def first_time_initialization():
    """Function called on first server start to populate database with default data."""
    logger.info("Filling in initial data like TLE sources and default location...")
    async with AsyncSessionLocal() as session:
        try:

            def generate_identifier(length=16):
                """Generate a random identifier similar to what the CRUD does."""
                return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))

            logger.info("FIRSTTIME - Populating database with default data...")
            # Add default TLE sources
            cubesat_source = TLESources(
                name="Cubesats",
                identifier=generate_identifier(),
                url="http://www.celestrak.com/NORAD/elements/cubesat.txt",
                format="3le",
            )
            session.add(cubesat_source)

            amateur_source = TLESources(
                name="Amateur",
                identifier=generate_identifier(),
                url="http://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle",
                format="3le",
            )
            session.add(amateur_source)

            # Add a default location at coordinates 0,0
            default_location = Locations(
                name="Default Location",
                lat=0.0,
                lon=0.0,
                alt=0,
            )
            session.add(default_location)

            await session.commit()
            logger.info(
                "Initial data populated successfully with default TLE sources "
                "(Cubesats and Amateur) and default location at coordinates (0.0, 0.0)."
            )

        except Exception as e:
            logger.error(f"Error populating initial data: {e}")
            await session.rollback()
            raise


async def run_initial_sync(sio):
    """Run the initial satellite data synchronization after delay."""
    from db import AsyncSessionLocal
    from tlesync.logic import synchronize_satellite_data

    try:
        logger.info("Waiting 5 seconds before starting initial synchronization...")
        await asyncio.sleep(5)
        logger.info("Starting initial satellite data synchronization...")
        async with AsyncSessionLocal() as sync_session:
            await synchronize_satellite_data(sync_session, logger, sio)
        logger.info("Initial satellite data synchronization completed successfully")
    except Exception as e:
        logger.error(f"Error during initial satellite synchronization: {e}")
        logger.exception(e)
