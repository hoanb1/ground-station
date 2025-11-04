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
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Dict, List

import requests

import crud
from common.common import *  # noqa: F401,F403
from common.exceptions import SynchronizationErrorMainTLESource
from tlesync.state import SatelliteSyncState
from tlesync.utils import (
    async_fetch,
    create_final_success_message,
    create_initial_sync_state,
    create_progress_tracker,
    create_satellite_from_tle_data,
    create_transmitter_from_satnogs_data,
    detect_duplicate_satellites,
    detect_satellite_modifications,
    detect_transmitter_modifications,
    get_norad_id_from_tle,
    get_norad_ids,
    get_satellite_by_norad_id,
    get_transmitter_info_by_norad_id,
    query_existing_data,
    simple_parse_3le,
    update_satellite_group_with_removal_detection,
    update_satellite_with_satnogs_data,
)

# Global state to track satellite synchronization progress
sync_state = create_initial_sync_state()

# Lock to prevent concurrent synchronization
_sync_lock = asyncio.Lock()


async def synchronize_satellite_data(dbsession, logger, sio):
    """
    Fetches all TLE sources from the database and logs the result.
    Uses a structured progress tracking system to accurately report progress.
    """
    global sync_state

    # Try to acquire the lock without blocking
    if _sync_lock.locked():
        logger.warning("Satellite data synchronization already in progress, skipping this run")
        return

    async with _sync_lock:
        logger.info("Starting satellite data synchronization (lock acquired)")

        # Create an instance of our state manager
        sync_state_manager = SatelliteSyncState()

        # Reset the state at the beginning of synchronization
        sync_state = create_initial_sync_state()

        # Update the sync state in the manager
        sync_state_manager.set_state(sync_state)
        await sio.emit("sat-sync-events", sync_state)

        # Define progress weights for each phase
        progress_phases = {
            "fetch_tle_sources": 15,  # Fetching TLE data from sources
            "fetch_satnogs_satellites": 10,  # Fetching satellite data from SATNOGS
            "fetch_satnogs_transmitters": 10,  # Fetching transmitter data from SATNOGS
            "process_satellites": 40,  # Processing satellite data
            "process_transmitters": 25,  # Processing transmitter data
        }

        # Create progress tracker
        update_progress, completed_phases, highest_progress = create_progress_tracker(
            progress_phases, sync_state, sync_state_manager
        )

        satnogs_satellites_url = "http://db.satnogs.org/api/satellites/?format=json"
        satnogs_transmitters_url = "http://db.satnogs.org/api/transmitters/?format=json"
        satnogs_satellite_data: List[Dict[str, Any]] = []
        satnogs_transmitter_data: List[Dict[str, Any]] = []
        celestrak_list: List[Dict[str, Any]] = []
        group_assignments: Dict[str, List[int]] = {}

        tle_sources_reply = await crud.tle_sources.fetch_satellite_tle_source(dbsession)
        sources = tle_sources_reply.get("data", [])

        # Use a single ThreadPoolExecutor for all async_fetch calls
        with ThreadPoolExecutor(max_workers=1) as pool:
            # get TLEs from our user-defined TLE sources (probably from celestrak.org)
            for i, tle_source in enumerate(sources):
                tle_source_name = tle_source["name"]
                tle_source_identifier = tle_source["identifier"]
                tle_source_url = tle_source["url"]
                group_assignments[tle_source_identifier] = []

                # Update active sources in state and progress
                progress_state = update_progress(
                    "fetch_tle_sources", i, len(sources), f"Fetching {tle_source_url}"
                )
                sync_state["active_sources"] = [tle_source_name]
                await sio.emit("sat-sync-events", progress_state)

                try:
                    logger.info(f"Fetching {tle_source_url}")
                    response = await async_fetch(tle_source_url, pool)
                    if response.status_code != 200:
                        logger.error(
                            f"HTTP Error: Received status code {response.status_code} from {tle_source_url}"
                        )
                        raise requests.exceptions.RequestException(
                            f"Unable to fetch data from {tle_source_url}, error code was {response.status_code}"
                        )
                    else:
                        satellite_data = simple_parse_3le(response.text)
                        group_assignments[tle_source_identifier] = get_norad_ids(satellite_data)

                    celestrak_list = celestrak_list + satellite_data
                    logger.info(f"Fetched {len(satellite_data)} TLEs from {tle_source_url}")

                except SynchronizationErrorMainTLESource as e:
                    error_msg = f'Failed to fetch data from {tle_source["url"]}: {e.message}'
                    logger.error(error_msg)

                    # Update error in state
                    sync_state["errors"].append(error_msg)
                    sync_state["success"] = False
                    sync_state["message"] = e.message
                    sync_state["last_update"] = datetime.now(timezone.utc).isoformat() + "Z"
                    sync_state_manager.set_state(sync_state)

                    await sio.emit("sat-sync-events", sync_state)
                    continue

                except requests.exceptions.RequestException as e:
                    error_msg = f'Failed to fetch data from {tle_source["url"]}: {e}'
                    logger.error(error_msg)

                    # Update error in state
                    sync_state["errors"].append(error_msg)
                    sync_state["success"] = False
                    sync_state["message"] = str(e)
                    sync_state["last_update"] = datetime.now(timezone.utc).isoformat() + "Z"
                    sync_state_manager.set_state(sync_state)

                    await sio.emit("sat-sync-events", sync_state)
                    continue

                # Update progress, completed sources, and emit event
                progress_state = update_progress(
                    "fetch_tle_sources", i + 1, len(sources), f"Fetched {tle_source_url}"
                )
                await sio.emit("sat-sync-events", progress_state)

                logger.info(
                    f"Group {tle_source_identifier} has {len(group_assignments[tle_source_identifier])} members"
                )

                # Use the new removal detection function instead of the old group management code
                try:
                    removed_data = await update_satellite_group_with_removal_detection(
                        session=dbsession,
                        tle_source_identifier=tle_source_identifier,
                        satellite_ids=group_assignments[tle_source_identifier],
                        group_name=tle_source_name,
                        logger=logger,
                    )

                    if removed_data["satellites"] or removed_data["transmitters"]:
                        # Add removed items to the global sync state
                        sync_state["removed"]["satellites"].extend(removed_data["satellites"])
                        sync_state["removed"]["transmitters"].extend(removed_data["transmitters"])

                        removed_sats_count = len(removed_data["satellites"])
                        removed_trx_count = len(removed_data["transmitters"])
                        logger.info(
                            f"Removed {removed_sats_count} satellites and {removed_trx_count} transmitters from TLE source '{tle_source_identifier}'"
                        )

                    # Commit the changes
                    await dbsession.commit()

                except Exception as e:
                    logger.error(
                        f"Error during satellite removal detection for TLE source '{tle_source_identifier}': {e}"
                    )
                    await dbsession.rollback()

                # Update completed sources and groups processed in state
                sync_state["completed_sources"].append(tle_source_name)
                sync_state["active_sources"] = []
                sync_state["stats"]["groups_processed"] += 1
                sync_state["last_update"] = datetime.now(timezone.utc).isoformat()
                sync_state_manager.set_state(sync_state)

                # Update message for group creation/update
                progress_state = update_progress(
                    "fetch_tle_sources",
                    i + 1,
                    len(sources),
                    f'Group {tle_source.get("name", None)} created/updated',
                )
                await sio.emit("sat-sync-events", progress_state)

            # Mark TLE sources phase as complete
            completed_phases.add("fetch_tle_sources")

            if not celestrak_list:
                logger.error("No TLEs were fetched from any TLE source, aborting!")
                # Update state for error
                sync_state["status"] = "complete"
                sync_state["progress"] = 100
                sync_state["success"] = False
                sync_state["message"] = "No TLEs were fetched from any TLE source"
                sync_state["errors"].append("No TLEs were fetched from any TLE source")
                sync_state["last_update"] = datetime.now(timezone.utc).isoformat()
                sync_state_manager.set_state(sync_state)

                await sio.emit("sat-sync-events", sync_state)
                return

            # Detect and handle duplicate satellites
            logger.info("Detecting duplicate satellites across TLE sources...")
            duplicate_detection_result = detect_duplicate_satellites(celestrak_list, logger)

            # Log duplicate information
            if duplicate_detection_result["duplicate_count"] > 0:
                logger.warning(
                    f"Found {duplicate_detection_result['duplicate_count']} satellites "
                    f"with {duplicate_detection_result['total_duplicates']} duplicate entries"
                )

                # Log specific duplicates for debugging
                for norad_id, info in duplicate_detection_result["duplicates_info"].items():
                    if info["is_duplicate"]:
                        logger.warning(
                            f"NORAD ID {norad_id} appears {info['occurrences']} times "
                            f"with names: {', '.join(info['names'])}"
                        )

            # Use deduplicated list for processing
            celestrak_list = duplicate_detection_result["deduplicated_list"]
            logger.info(f"Proceeding with {len(celestrak_list)} unique satellites")

            # Start fetching satellite data from SATNOGS
            progress_state = update_progress(
                "fetch_satnogs_satellites", 0, 1, "Fetching satellite data from SATNOGS"
            )
            sync_state["active_sources"] = ["SATNOGS Satellites"]
            sync_state_manager.set_state(sync_state)
            await sio.emit("sat-sync-events", progress_state)

            # get a complete list of satellite data (no TLEs) from Satnogs
            logger.info(f"Fetching satellite data from SATNOGS ({satnogs_satellites_url})")
            try:
                response = await async_fetch(satnogs_satellites_url, pool)
                if response.status_code != 200:
                    logger.error(
                        f"HTTP Error: Received status code {response.status_code} from {satnogs_satellites_url}"
                    )
                else:
                    satnogs_satellite_data = json.loads(response.text)

                logger.info(f"Fetched {len(satnogs_satellite_data)} satellites from SATNOGS")

                # Update state and mark phase as complete
                sync_state["completed_sources"].append("SATNOGS Satellites")
                sync_state["active_sources"] = []
                completed_phases.add("fetch_satnogs_satellites")
                progress_state = update_progress(
                    "fetch_satnogs_satellites", 1, 1, "Satellite data fetched from SATNOGS"
                )
                await sio.emit("sat-sync-events", progress_state)

            except requests.exceptions.RequestException as e:
                error_msg = f"Failed to fetch data from {satnogs_satellites_url} ({e})"
                logger.error(error_msg)

                # Update error in state
                sync_state["errors"].append(error_msg)
                sync_state["last_update"] = datetime.now(timezone.utc).isoformat()
                sync_state_manager.set_state(sync_state)

            # Start fetching transmitter data from SATNOGS
            progress_state = update_progress(
                "fetch_satnogs_transmitters", 0, 1, "Fetching transmitter data from SATNOGS"
            )
            sync_state["active_sources"] = ["SATNOGS Transmitters"]
            sync_state_manager.set_state(sync_state)
            await sio.emit("sat-sync-events", progress_state)

            # get transmitters from satnogs
            logger.info(f"Fetching transmitter data from SATNOGS ({satnogs_transmitters_url})")
            try:
                response = await async_fetch(satnogs_transmitters_url, pool)
                if response.status_code != 200:
                    logger.error(
                        f"HTTP Error: Received status code {response.status_code} from {satnogs_transmitters_url}"
                    )
                else:
                    satnogs_transmitter_data = json.loads(response.text)

                logger.info(f"Fetched {len(satnogs_transmitter_data)} transmitters from SATNOGS")

                # Update state and mark phase as complete
                sync_state["completed_sources"].append("SATNOGS Transmitters")
                sync_state["active_sources"] = []
                completed_phases.add("fetch_satnogs_transmitters")
                progress_state = update_progress(
                    "fetch_satnogs_transmitters", 1, 1, "Transmitter data fetched from SATNOGS"
                )
                await sio.emit("sat-sync-events", progress_state)

            except requests.exceptions.RequestException as e:
                error_msg = f"Failed to fetch data from {satnogs_transmitters_url}: {e}"
                logger.error(error_msg)

                # Update error in state
                sync_state["errors"].append(error_msg)
                sync_state["last_update"] = datetime.now(timezone.utc).isoformat()
                sync_state_manager.set_state(sync_state)

        # Begin processing satellites and transmitters
        progress_state = update_progress(
            "process_satellites",
            0,
            len(celestrak_list),
            "Updating satellite data in the database...",
        )
        sync_state["active_sources"] = ["Database Update"]
        sync_state_manager.set_state(sync_state)
        await sio.emit("sat-sync-events", progress_state)

        # Get existing satellite and transmitter data
        existing_data = await query_existing_data(dbsession, logger)

        #  we now have everything, TLE from celestrak sat info and transmitter info from satnogs, lets put them in the db
        count_sats = 0
        count_transmitters = 0
        try:
            total_satellites = len(celestrak_list)

            # Pre-calculate total transmitters to ensure progress is accurate
            logger.info("Calculating expected transmitter count for progress tracking...")
            total_transmitters_to_process = 0
            for sat in celestrak_list:
                norad_id = get_norad_id_from_tle(sat["line1"])
                transmitters = get_transmitter_info_by_norad_id(norad_id, satnogs_transmitter_data)
                total_transmitters_to_process += len(transmitters)

            logger.info(
                f"Expected to process {total_transmitters_to_process} transmitters in total"
            )

            # Now process satellites
            for i, sat in enumerate(celestrak_list):
                norad_id = get_norad_id_from_tle(sat["line1"])

                # Check if this is a new satellite
                is_new_satellite = norad_id not in existing_data["satellite_norad_ids"]

                # Create satellite object
                satellite = create_satellite_from_tle_data(sat, norad_id)
                count_sats += 1

                # Update progress based on satellites processed
                progress_state = update_progress(
                    "process_satellites",
                    i + 1,
                    total_satellites,
                    f'Processing satellite {count_sats}/{total_satellites}: {sat["name"]}',
                )
                sync_state["stats"]["satellites_processed"] = count_sats
                sync_state_manager.set_state(sync_state)

                # Every 100 satellites, emit an update to avoid flooding
                if count_sats % 100 == 0 or count_sats == total_satellites:
                    await sio.emit("sat-sync-events", progress_state)

                # let's find the sat info from the satnogs list
                satnogs_sat_info = get_satellite_by_norad_id(norad_id, satnogs_satellite_data)

                # Update satellite with SATNOGS data and get comparison data
                satellite_data_for_comparison = update_satellite_with_satnogs_data(
                    satellite, satnogs_sat_info
                )

                # Check if satellite was modified (not new but has changes)
                if not is_new_satellite:
                    detect_satellite_modifications(
                        norad_id,
                        satellite_data_for_comparison,
                        existing_data["satellites"],
                        sync_state,
                        logger,
                    )

                # add to dbsession
                await dbsession.merge(satellite)

                # commit session
                await dbsession.commit()

                # If this is a new satellite, add it to the newly added list
                if is_new_satellite:
                    sync_state["newly_added"]["satellites"].append(
                        {"norad_id": norad_id, "name": satellite.name, "sat_id": satellite.sat_id}
                    )
                    logger.info(f"New satellite added: {satellite.name} (NORAD ID: {norad_id})")

                # let's find transmitter info in the satnogs_transmitter_data list
                satnogs_transmitter_info = get_transmitter_info_by_norad_id(
                    norad_id, satnogs_transmitter_data
                )

                for j, transmitter_info in enumerate(satnogs_transmitter_info):
                    transmitter_uuid = transmitter_info.get("uuid", None)

                    # Check if this is a new transmitter
                    is_new_transmitter = transmitter_uuid not in existing_data["transmitter_uuids"]

                    # Create transmitter object and get comparison data
                    transmitter, transmitter_data_for_comparison = (
                        create_transmitter_from_satnogs_data(transmitter_info)
                    )
                    count_transmitters += 1

                    # Update progress for transmitters only if we have some to process
                    if total_transmitters_to_process > 0:
                        progress_state = update_progress(
                            "process_transmitters",
                            count_transmitters,
                            total_transmitters_to_process,
                            f"Processing transmitter {count_transmitters}/{total_transmitters_to_process}",
                        )
                        sync_state["stats"]["transmitters_processed"] = count_transmitters
                        sync_state_manager.set_state(sync_state)

                        # Every 20 transmitters, emit an update to avoid flooding
                        if count_transmitters % 20 == 0 or (
                            i == total_satellites - 1 and j == len(satnogs_transmitter_info) - 1
                        ):
                            await sio.emit("sat-sync-events", progress_state)

                    # Check if the transmitter was modified (not new but has changes)
                    if not is_new_transmitter:
                        detect_transmitter_modifications(
                            transmitter_uuid,
                            transmitter_data_for_comparison,
                            existing_data["transmitters"],
                            sync_state,
                            satellite.name,
                            norad_id,
                            logger,
                        )

                    await dbsession.merge(transmitter)

                    # commit session
                    await dbsession.commit()

                    # If this is a new transmitter, add it to the newly added list
                    if is_new_transmitter:
                        sync_state["newly_added"]["transmitters"].append(
                            {
                                "uuid": transmitter_uuid,
                                "description": transmitter.description,
                                "satellite_name": satellite.name,
                                "norad_id": norad_id,
                                "downlink_low": transmitter.downlink_low,
                                "downlink_high": transmitter.downlink_high,
                                "mode": transmitter.mode,
                            }
                        )
                        logger.info(
                            f"New transmitter added: {transmitter.description} for satellite {satellite.name} (UUID: {transmitter_uuid})"
                        )

            # Mark processing phases as complete
            completed_phases.add("process_satellites")
            completed_phases.add("process_transmitters")

            # Log summary of newly added and removed items
            new_satellites_count = len(sync_state["newly_added"]["satellites"])
            new_transmitters_count = len(sync_state["newly_added"]["transmitters"])
            removed_satellites_count = len(sync_state["removed"]["satellites"])
            removed_transmitters_count = len(sync_state["removed"]["transmitters"])
            modified_satellites_count = len(sync_state["modified"]["satellites"])
            modified_transmitters_count = len(sync_state["modified"]["transmitters"])

            logger.info(
                f"Successfully synchronized {count_sats} satellites and {count_transmitters} transmitters"
            )
            logger.info(
                f"New items added: {new_satellites_count} satellites, {new_transmitters_count} transmitters"
            )
            logger.info(
                f"Items removed: {removed_satellites_count} satellites, {removed_transmitters_count} transmitters"
            )
            logger.info(
                f"Items modified: {modified_satellites_count} satellites, {modified_transmitters_count} transmitters"
            )

            # Update final state - always set to 100% when complete
            sync_state["status"] = "complete"
            sync_state["progress"] = 100
            sync_state["success"] = True

            # Create a detailed success message
            success_message = create_final_success_message(
                count_sats, count_transmitters, sync_state
            )

            sync_state["message"] = success_message
            sync_state["active_sources"] = []
            sync_state["completed_sources"].append("Database Update")
            sync_state["last_update"] = datetime.now(timezone.utc).isoformat()
            sync_state_manager.set_state(sync_state)

            await sio.emit("sat-sync-events", sync_state)

        except Exception as e:
            await dbsession.rollback()  # Rollback in case of error
            logger.error(f"Error while synchronizing satellite data in the db: {e}")
            logger.exception(e)

            # Update state for error
            sync_state["status"] = "complete"
            sync_state["progress"] = 100
            sync_state["success"] = False
            sync_state["message"] = f"Error: {str(e)}"
            sync_state["errors"].append(str(e))
            sync_state["last_update"] = datetime.now(timezone.utc).isoformat()
            sync_state_manager.set_state(sync_state)

            await sio.emit("sat-sync-events", sync_state)

        finally:
            # Always close the session when you're done
            await dbsession.close()
