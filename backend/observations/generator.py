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

"""Core observation generation logic."""

import traceback
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from common.common import logger
from crud import locations as crud_locations
from crud.monitoredsatellites import (
    fetch_enabled_monitored_satellites,
    fetch_monitored_satellites,
    mark_observation_as_generated,
)
from crud.satellites import fetch_satellites
from crud.scheduledobservations import add_scheduled_observation, edit_scheduled_observation
from observations.conflicts import find_overlapping_observation, should_update_observation
from tracking.passes import calculate_next_events


async def generate_observations_for_monitored_satellites(
    session: AsyncSession, monitored_satellite_id: Optional[str] = None
) -> dict:
    """
    Generate scheduled observations for monitored satellites.

    Args:
        session: Database session
        monitored_satellite_id: Optional ID to generate for specific satellite, or None for all

    Returns:
        Dict with success status, statistics, and any errors
    """
    try:
        # Fetch monitored satellites
        if monitored_satellite_id:
            result = await fetch_monitored_satellites(session, monitored_satellite_id)
            if not result["success"]:
                return {
                    "success": False,
                    "error": result.get("error", "Unknown error"),
                    "data": None,
                }
            monitored_sats = [result["data"]] if result["data"] else []
        else:
            result = await fetch_enabled_monitored_satellites(session)
            if not result["success"]:
                return {
                    "success": False,
                    "error": result.get("error", "Unknown error"),
                    "data": None,
                }
            monitored_sats = result["data"] or []

        if not monitored_sats:
            return {
                "success": True,
                "data": {"generated": 0, "updated": 0, "skipped": 0, "satellites_processed": 0},
                "error": None,
            }

        # Fetch ground station location (get first location from database)
        locations_result = await crud_locations.fetch_all_locations(session)
        if not locations_result["success"]:
            return {
                "success": False,
                "error": f"Failed to fetch locations: {locations_result['error']}",
            }

        locations = locations_result["data"] or []
        if not locations:
            logger.warning("No ground station location found in database")
            return {
                "success": False,
                "error": "No ground station location found. Please add a location in the settings.",
            }

        # Use first location as home location (same as tracking system does)
        home_location = {"lat": float(locations[0]["lat"]), "lon": float(locations[0]["lon"])}

        stats = {"generated": 0, "updated": 0, "skipped": 0, "satellites_processed": 0}

        # Process each monitored satellite
        for mon_sat in monitored_sats:
            try:
                result = await _generate_observations_for_satellite(session, mon_sat, home_location)
                stats["satellites_processed"] += 1
                stats["generated"] += result.get("generated", 0)
                stats["updated"] += result.get("updated", 0)
                stats["skipped"] += result.get("skipped", 0)

            except Exception as e:
                logger.error(
                    f"Error generating observations for monitored satellite {mon_sat['id']}: {e}"
                )
                logger.error(traceback.format_exc())
                # Continue processing other satellites

        await session.commit()

        return {"success": True, "data": stats, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error in generate_observations_for_monitored_satellites: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def _generate_observations_for_satellite(
    session: AsyncSession, monitored_sat: dict, home_location: dict
) -> dict:
    """
    Generate observations for a single monitored satellite.

    Args:
        session: Database session
        monitored_sat: Monitored satellite data
        home_location: Ground station location dict with 'lat' and 'lon'

    Returns:
        Dict with statistics for this satellite
    """
    stats = {"generated": 0, "updated": 0, "skipped": 0}

    # Fetch satellite TLE data
    norad_id = monitored_sat["satellite"]["norad_id"]
    sat_result = await fetch_satellites(session, norad_id=norad_id)

    if not sat_result["success"] or not sat_result["data"]:
        logger.error(f"Failed to fetch satellite data for NORAD ID {norad_id}")
        return stats

    satellite_data = sat_result["data"][0]  # fetch_satellites returns a list

    # Extract generation config
    gen_config = monitored_sat.get("generation_config", {})
    min_elevation = gen_config.get("min_elevation", 20)
    lookahead_hours = gen_config.get("lookahead_hours", 24)

    # Calculate passes
    passes_result = calculate_next_events(
        satellite_data=satellite_data,
        home_location=home_location,
        hours=lookahead_hours,
        above_el=min_elevation,
    )

    if not passes_result["success"]:
        logger.error(
            f"Failed to calculate passes for NORAD ID {norad_id}: {passes_result['error']}"
        )
        return stats

    passes = passes_result["data"]

    # Filter passes by peak elevation (passes already filtered by above_el during calculation)
    valid_passes = [p for p in passes if p["peak_altitude"] >= min_elevation]

    logger.info(
        f"Found {len(valid_passes)} valid passes for {satellite_data['name']} (NORAD {norad_id})"
    )

    # Process each pass
    for pass_data in valid_passes:
        try:
            event_start = datetime.fromisoformat(pass_data["event_start"].replace("Z", "+00:00"))
            event_end = datetime.fromisoformat(pass_data["event_end"].replace("Z", "+00:00"))

            # Check for existing observation
            existing = await find_overlapping_observation(
                session, norad_id, event_start, event_end, monitored_sat["id"]
            )

            if existing:
                if should_update_observation(existing):
                    # Update existing failed/cancelled observation
                    await _update_observation(session, existing, monitored_sat, pass_data)
                    stats["updated"] += 1
                else:
                    # Skip existing valid observation
                    stats["skipped"] += 1
            else:
                # Create new observation
                await _create_observation(session, monitored_sat, pass_data)
                stats["generated"] += 1

        except Exception as e:
            logger.error(f"Error processing pass for NORAD ID {norad_id}: {e}")
            logger.error(traceback.format_exc())
            continue

    return stats


async def _create_observation(session: AsyncSession, monitored_sat: dict, pass_data: dict):
    """
    Create a new scheduled observation from pass data.

    Args:
        session: Database session
        monitored_sat: Monitored satellite configuration
        pass_data: Pass prediction data
    """
    satellite = monitored_sat["satellite"]
    event_start = datetime.fromisoformat(pass_data["event_start"].replace("Z", "+00:00"))

    # Format observation name
    obs_name = f"{satellite['name']} - {event_start.strftime('%Y-%m-%d %H:%M UTC')}"

    # Build observation data (format expected by CRUD)
    observation_data = {
        "id": f"obs-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "name": obs_name,
        "enabled": True,
        "status": "scheduled",
        "satellite": satellite,
        "pass": {
            "event_start": pass_data["event_start"],
            "event_end": pass_data["event_end"],
            "peak_altitude": pass_data["peak_altitude"],
            "start_azimuth": pass_data.get("start_azimuth"),
            "end_azimuth": pass_data.get("end_azimuth"),
            "peak_azimuth": pass_data.get("peak_azimuth"),
            "distance_at_peak": pass_data.get("distance_at_peak"),
        },
        "sdr": monitored_sat.get("sdr", {}),
        "rotator": monitored_sat.get("rotator", {}),
        "rig": monitored_sat.get("rig", {}),
        "transmitter": {},
        "tasks": monitored_sat.get("tasks", []),
    }

    # Create the observation
    result = await add_scheduled_observation(session, observation_data)

    if result["success"]:
        # Mark as auto-generated
        observation_id = result["data"]["id"]
        await mark_observation_as_generated(session, observation_id, monitored_sat["id"])
        logger.info(f"Created observation: {obs_name}")
    else:
        logger.error(f"Failed to create observation: {result['error']}")


async def _update_observation(
    session: AsyncSession, existing_obs, monitored_sat: dict, pass_data: dict
):
    """
    Update an existing scheduled observation with new pass data.

    Args:
        session: Database session
        existing_obs: Existing ScheduledObservations object
        monitored_sat: Monitored satellite configuration
        pass_data: New pass prediction data
    """
    satellite = monitored_sat["satellite"]
    event_start = datetime.fromisoformat(pass_data["event_start"].replace("Z", "+00:00"))

    # Format observation name
    obs_name = f"{satellite['name']} - {event_start.strftime('%Y-%m-%d %H:%M UTC')}"

    # Build updated observation data (format expected by CRUD)
    observation_data = {
        "id": existing_obs.id,
        "name": obs_name,
        "enabled": True,
        "status": "scheduled",  # Reset status to scheduled
        "satellite": satellite,
        "pass": {
            "event_start": pass_data["event_start"],
            "event_end": pass_data["event_end"],
            "peak_altitude": pass_data["peak_altitude"],
            "start_azimuth": pass_data.get("start_azimuth"),
            "end_azimuth": pass_data.get("end_azimuth"),
            "peak_azimuth": pass_data.get("peak_azimuth"),
            "distance_at_peak": pass_data.get("distance_at_peak"),
        },
        "sdr": monitored_sat.get("sdr", {}),
        "rotator": monitored_sat.get("rotator", {}),
        "rig": monitored_sat.get("rig", {}),
        "transmitter": {},
        "tasks": monitored_sat.get("tasks", []),
    }

    # Update the observation
    result = await edit_scheduled_observation(session, observation_data)

    if result["success"]:
        # Update generated_at timestamp
        await mark_observation_as_generated(session, existing_obs.id, monitored_sat["id"])
        logger.info(f"Updated observation: {obs_name}")
    else:
        logger.error(f"Failed to update observation: {result['error']}")
