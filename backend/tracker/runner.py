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


import asyncio
import logging
import multiprocessing
from typing import Optional

import setproctitle

from tracker.logic import SatelliteTracker

logger = logging.getLogger("tracker-worker")

# Some globals for the tracker process
tracker_process = multiprocessing.Process()
queue_to_tracker = multiprocessing.Queue()
queue_from_tracker = multiprocessing.Queue()
tracker_stop_event = multiprocessing.Event()


def start_tracker_process():
    """
    Starts the satellite tracking task in a separate process using multiprocessing.

    This function creates the necessary queues for communication between the main process
    and the tracker process, and handles the lifecycle of the tracker process using the
    new SatelliteTracker class.

    :return: A tuple containing (process, queue_in, queue_out, tracker_stop_event)
    """

    global tracker_process, queue_to_tracker, queue_from_tracker, tracker_stop_event

    # Define the process target function that will run the async tracking task
    def run_tracking_task():
        # Set the process title for system monitoring tools
        setproctitle.setproctitle("Ground Station - SatelliteTracker")

        # Set the multiprocessing process name
        multiprocessing.current_process().name = "Ground Station - SatelliteTracker"

        # Create a new event loop for this process
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            # Create and run the SatelliteTracker instance
            tracker = SatelliteTracker(queue_from_tracker, queue_to_tracker, tracker_stop_event)
            loop.run_until_complete(tracker.run())

        except Exception as e:
            logger.error(f"Error in tracker process: {e}")
            logger.exception(e)
        finally:
            loop.close()

    # Create and start the process
    tracker_process = multiprocessing.Process(
        target=run_tracking_task, name="Ground Station - SatelliteTracker"
    )

    # Process will terminate when main process exits
    tracker_process.daemon = True
    tracker_process.start()

    logger.info(
        f"Started satellite tracker process 'SatelliteTracker' with PID {tracker_process.pid}"
    )

    return tracker_process, queue_to_tracker, queue_from_tracker, tracker_stop_event
