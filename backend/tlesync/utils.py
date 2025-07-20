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


from sqlalchemy import select, delete
from db.models import Satellites, Transmitters, SatelliteGroups, SatelliteGroupType
from typing import List
from datetime import datetime, UTC, timezone


def parse_date(date_str: str) -> datetime:
    """
    Parses a date string in ISO 8601 format with an optional 'Z' suffix
    indicating UTC time and converts it to a datetime object.

    :param date_str: The ISO 8601 formatted date string, which may
        include a 'Z' suffix indicating UTC time.
    :type date_str: str
    :return: A datetime object corresponding to the provided date
        string.
    :rtype: datetime
    """
    date_str = date_str.replace("Z", "+00:00")
    return datetime.fromisoformat(date_str)


def get_norad_ids(tle_objects: list) -> list:
    """
    Extracts the NORAD ID from the 'line1' field in each object of the list.

    :param tle_objects: A list of dictionaries containing {'name', 'line1', 'line2'}.
    :return: A list of integer NORAD IDs.
    """
    return [parse_norad_id_from_line1(obj['line1']) for obj in tle_objects]


def parse_norad_id_from_line1(line1: str) -> int:
    """
    Parses the NORAD ID from the TLE's first line.
    Assumes the NORAD ID is located at indices 2..6 in the string.

    :param line1: TLE line1 string (e.g. '1 25544U 98067A   23109.65481637 ...').
    :return: The integer NORAD ID extracted from line1.
    """
    norad_str = line1[2:7].strip()
    return int(norad_str)


def get_norad_id_from_tle(tle: str) -> int:
    """
    Extracts the NORAD ID from a TLE (Two-Line Element) string.

    Parameters:
        tle (str): A TLE string that may include a satellite name line or just the two standard TLE lines.

    Returns:
        int: The NORAD ID extracted from the first TLE data line.

    Raises:
        ValueError: If a valid first data line is not found in the input.
    """
    # Split the TLE into individual lines and remove any surrounding whitespace.
    lines = tle.strip().splitlines()

    tle_line = None
    # Loop through the lines to find the first TLE data line
    for line in lines:
        if line.startswith("1 "):
            tle_line = line
            break

    if tle_line is None:
        raise ValueError(f"A valid TLE first data line was not found in the provided input (TLE: {tle})")

    # According to the TLE format, NORAD ID is within columns 3 to 7 (1-indexed)
    # For Python (0-indexed), this translates to positions [2:7].
    norad_id_str = tle_line[2:7].strip()

    try:
        return int(norad_id_str)
    except ValueError as e:
        raise ValueError("Failed to convert the extracted NORAD ID to an integer.") from e


def get_satellite_by_norad_id(norad_id: int, satellites: List[dict]) -> dict | None:
    """
    Returns the satellite object from the provided list that matches the given NORAD ID.

    Parameters:
        norad_id (int): The NORAD ID to search for.
        satellites (List[object]): A list of satellite objects which have a 'norad_id' attribute.

    Returns:
        The matching satellite object if found, otherwise None.
    """
    for satellite in satellites:
        norad_id_from_list = satellite['norad_cat_id']
        if norad_id_from_list == norad_id:
            return satellite
    return None


def get_transmitter_info_by_norad_id(norad_id: int, transmitters: list) -> list:
    """
    Returns the satellite object from the provided list that matches the given NORAD ID.

    Parameters:
        norad_id (int): The NORAD ID to search for.
        transmitters (List[object]): A list of satellite objects which have a 'norad_id' attribute.

    Returns:
        The matching satellite object if found, otherwise None.
    """

    trxs = []

    for transmitter in transmitters:
        norad_id_from_list = transmitter['norad_cat_id']
        if norad_id_from_list == norad_id:
            trxs.append(transmitter)
    return trxs


def simple_parse_3le(file_contents: str) -> list:
    """
    Parses satellite 3LE data from a string and returns a list of dictionaries.
    Each dictionary has "name", "line1", and "line2" keys.

    :param file_contents: str, the contents of a file with 3LE data
    :return: list of dicts, each dict containing "name", "line1", and "line2"
    """
    # Split the file contents into lines, stripping out any extra whitespace
    lines = file_contents.strip().splitlines()

    # We'll store the parsed satellite data here
    satellites = []

    # 3 lines correspond to each satellite's set
    # So we'll iterate in steps of 3
    for i in range(0, len(lines), 3):
        # Ensure we don't run out of lines
        if i + 2 < len(lines):
            name_line = lines[i].strip()
            line1 = lines[i + 1].strip()
            line2 = lines[i + 2].strip()

            satellites.append({
                "name": name_line,
                "line1": line1,
                "line2": line2
            })

    return satellites


async def detect_and_remove_satellites(session, tle_source_identifier, current_satellite_ids):
    """
    Detect satellites that were removed from a TLE source and handle their removal.

    Args:
        session: SQLAlchemy async session
        tle_source_identifier: The identifier of the TLE source
        current_satellite_ids: List of current satellite NORAD IDs from the TLE source

    Returns:
        Dict with removed satellite details including names
    """

    # Get the existing satellite group for this TLE source
    result = await session.execute(
        select(SatelliteGroups).filter_by(
            identifier=tle_source_identifier,
            type=SatelliteGroupType.SYSTEM
        )
    )
    existing_group = result.scalar_one_or_none()

    if not existing_group or not existing_group.satellite_ids:
        # No existing group or no previous satellite IDs, nothing to remove
        return {"satellites": [], "transmitters": []}

    # Convert current_satellite_ids to set for faster lookup
    current_ids_set = set(current_satellite_ids)
    previous_ids_set = set(existing_group.satellite_ids)

    # Find satellites that were in the previous list but not in the current list
    removed_satellite_ids = list(previous_ids_set - current_ids_set)

    removed_data = {
        "satellites": [],
        "transmitters": []
    }

    if removed_satellite_ids:
        print(f"Detected {len(removed_satellite_ids)} removed satellites from TLE source '{tle_source_identifier}': {removed_satellite_ids}")

        # Handle removal of satellites and their transmitters
        for norad_id in removed_satellite_ids:
            # Get satellite details before removing
            satellite_result = await session.execute(
                select(Satellites).filter_by(norad_id=norad_id)
            )
            satellite = satellite_result.scalar_one_or_none()

            if satellite:
                # Check if this satellite exists in other TLE sources
                other_groups_result = await session.execute(
                    select(SatelliteGroups).filter(
                        SatelliteGroups.identifier != tle_source_identifier,
                        SatelliteGroups.type == SatelliteGroupType.SYSTEM
                    )
                )
                other_groups = other_groups_result.scalars().all()

                # Check if the satellite exists in any other system group
                satellite_in_other_sources = False
                for group in other_groups:
                    if group.satellite_ids and norad_id in group.satellite_ids:
                        satellite_in_other_sources = True
                        break

                if not satellite_in_other_sources:
                    # Satellite is not in any other TLE source, safe to remove
                    print(f"Removing satellite {norad_id} ({satellite.name}) and its transmitters (not found in other TLE sources)")

                    # Get transmitter details before removing
                    transmitters_result = await session.execute(
                        select(Transmitters).filter_by(norad_cat_id=norad_id)
                    )
                    transmitters = transmitters_result.scalars().all()

                    # Add transmitter details to removed data
                    for transmitter in transmitters:
                        removed_data["transmitters"].append({
                            "uuid": transmitter.id,
                            "description": transmitter.description,
                            "satellite_name": satellite.name,
                            "norad_id": norad_id,
                            "downlink_low": transmitter.downlink_low,
                            "downlink_high": transmitter.downlink_high,
                            "mode": transmitter.mode
                        })

                    # Remove transmitters first (due to foreign key constraint)
                    transmitters_delete_result = await session.execute(
                        delete(Transmitters).filter_by(norad_cat_id=norad_id)
                    )
                    transmitters_deleted = transmitters_delete_result.rowcount
                    if transmitters_deleted > 0:
                        print(f"Removed {transmitters_deleted} transmitters for satellite {norad_id}")

                    # Add satellite details to removed data
                    removed_data["satellites"].append({
                        "norad_id": norad_id,
                        "name": satellite.name,
                        "sat_id": satellite.sat_id,
                        "tle_source": tle_source_identifier
                    })

                    # Remove the satellite
                    satellite_delete_result = await session.execute(
                        delete(Satellites).filter_by(norad_id=norad_id)
                    )
                    satellite_deleted = satellite_delete_result.rowcount
                    if satellite_deleted > 0:
                        print(f"Removed satellite {norad_id} ({satellite.name})")
                else:
                    print(f"Satellite {norad_id} ({satellite.name}) found in other TLE sources, keeping it")
            else:
                print(f"Satellite {norad_id} not found in database, skipping removal")

    return removed_data


async def update_satellite_group_with_removal_detection(session, tle_source_identifier, satellite_ids, group_name):
    """
    Update or create a satellite group and detect removed satellites.

    Args:
        session: SQLAlchemy async session
        tle_source_identifier: The identifier of the TLE source
        satellite_ids: List of current satellite NORAD IDs
        group_name: Name for the satellite group

    Returns:
        Dict with removed satellite details including names
    """

    # First, detect and handle removed satellites
    removed_data = await detect_and_remove_satellites(session, tle_source_identifier, satellite_ids)

    # Then update or create the satellite group
    result = await session.execute(
        select(SatelliteGroups).filter_by(
            identifier=tle_source_identifier,
            type=SatelliteGroupType.SYSTEM
        )
    )
    existing_group = result.scalar_one_or_none()

    if existing_group:
        # Update the existing group
        existing_group.satellite_ids = satellite_ids
        existing_group.updated = datetime.now(timezone.utc)
        print(f"Updated satellite group '{group_name}' with {len(satellite_ids)} satellites")
    else:
        # Create a new group
        new_group = SatelliteGroups(
            name=group_name,
            identifier=tle_source_identifier,
            type=SatelliteGroupType.SYSTEM,
            satellite_ids=satellite_ids,
            added=datetime.now(timezone.utc),
            updated=datetime.now(timezone.utc)
        )
        session.add(new_group)
        print(f"Created new satellite group '{group_name}' with {len(satellite_ids)} satellites")

    return removed_data
