import crud
import requests
import json
import asyncio
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from models import Satellites, Transmitters, SatelliteGroups, SatelliteGroupType
from typing import List, Optional
from logger import get_logger
from arguments import arguments
from exceptions import *
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession


def parse_date(date_str: str) -> datetime:
    # Replace 'Z' with '+00:00' to indicate UTC offset
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


def get_transmitter_info_by_norad_id(norad_id: int, transmitters: List[dict]) -> dict | None:
    """
    Returns the satellite object from the provided list that matches the given NORAD ID.

    Parameters:
        norad_id (int): The NORAD ID to search for.
        transmitters (List[object]): A list of satellite objects which have a 'norad_id' attribute.

    Returns:
        The matching satellite object if found, otherwise None.
    """
    for transmitter in transmitters:
        norad_id_from_list = transmitter['norad_cat_id']
        if norad_id_from_list == norad_id:
            return transmitter
    return None


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

async def synchronize_satellite_data(dbsession, logger, sio):
    """
    Fetches all TLE sources from the database and logs the result.
    """

    def sync_fetch(url: str) -> requests.Response | None:
        reply = requests.get(url, timeout=5)
        return reply

    async def async_fetch(url: str, executor: ThreadPoolExecutor) -> requests.Response:
        loop = asyncio.get_running_loop()
        # Run sync_fetch in a thread pool
        return await loop.run_in_executor(executor, sync_fetch, url)

    satnogs_satellites_url = "http://db.satnogs.org/api/satellites/?format=json"
    satnogs_transmitters_url = "http://db.satnogs.org/api/transmitters/?format=json"
    satnogs_satellite_data = []
    satnogs_transmitter_data = []
    celestrak_list = []
    group_assignments =  {}

    tle_sources_reply = await crud.fetch_satellite_tle_source(dbsession)
    tle_sources = tle_sources_reply.get('data', [])

    # emit an event
    await sio.emit('sat-sync-events', {'status': 'inprogress', 'progress': 1,})

    # Use a single ThreadPoolExecutor for all async_fetch calls
    with ThreadPoolExecutor(max_workers=1) as pool:
        # get TLEs from our user-defined TLE sources (probably from celestrak.org)
        for tle_source in tle_sources:
            tle_source_name = tle_source['name']
            tle_source_identifier = tle_source['identifier']
            tle_source_url = tle_source['url']
            tle_source_format = tle_source['format']
            group_assignments[tle_source_identifier] = []

            try:
                logger.info(f"Fetching {tle_source_url}")
                response = await async_fetch(tle_source_url, pool)
                if response.status_code != 200:
                    logger.error(f"HTTP Error: Received status code {response.status_code} from {tle_source_url}")
                    raise Exception(f"Unable to fetch data from {tle_source_url}, error code was {response.status_code}")
                else:
                    satellite_data = simple_parse_3le(response.text)
                    group_assignments[tle_source_identifier] = get_norad_ids(satellite_data)

                celestrak_list = celestrak_list + satellite_data
                logger.info(f"Fetched {len(satellite_data)} TLEs from {tle_source_url}")

            except SynchronizationErrorMainTLESource as e:
                logger.error(f'Failed to fetch data from {tle_source["url"]}: {e.message}')
                await sio.emit('sat-sync-events', {'success': False, 'status': 'inprogress', 'progress': 0, 'error': e.message})

            except requests.exceptions.RequestException as e:
                logger.error(f'Failed to fetch data from {tle_source["url"]}: {e}')
                await sio.emit('sat-sync-events', {'success': False, 'status': 'inprogress', 'progress': 0, 'error': e})

            logger.info(f"Group {tle_source_identifier} has {len(group_assignments[tle_source_identifier])} members")

            # fetch group by identifier
            group = await crud.fetch_system_satellite_group_by_identifier(dbsession, tle_source_identifier)
            group = group.get('data', None)

            if group:
                group.satellite_ids = json.dumps(group_assignments[tle_source_identifier])
                await dbsession.commit()

            else:
                # make a system group and upsert it
                new_group = SatelliteGroups(
                    name=tle_source.get('name', None),
                    identifier=tle_source.get('identifier', None),
                    userid=None,
                    satellite_ids=json.dumps(group_assignments[tle_source_identifier]),
                    type=SatelliteGroupType.SYSTEM,
                )

                # merge and commit
                await dbsession.merge(new_group)
                await dbsession.commit()

    if not celestrak_list:
        logger.error("No TLEs were fetched from any TLE source, aborting!")
        await sio.emit('sat-sync-events', {'success': False, 'status': 'complete', 'progress': 0, 'error': 'No TLEs were fetched from any TLE source'})
        return

    # emit an event
    await sio.emit('sat-sync-events', {'status': 'inprogress', 'progress': 50})

    # get a complete list of satellite data (no TLEs) from Satnogs
    logger.info(f'Fetching satellite data from SATNOGS ({satnogs_satellites_url})')
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            response = await async_fetch(satnogs_satellites_url, pool)
            if response.status_code != 200:
                logger.error(f"HTTP Error: Received status code {response.status_code} from {satnogs_satellites_url}")

            else:
                satnogs_satellite_data = json.loads(response.text)

            logger.info(f"Fetched {len(satnogs_satellite_data)} satellites from SATNOGS")

    except requests.exceptions.RequestException as e:
        logger.error(f'Failed to fetch data from {satnogs_satellites_url} ({e})')

    # emit an event
    await sio.emit('sat-sync-events', {'status': 'inprogress', 'progress': 70,})

    # get transmitters from satnogs
    logger.info(f'Fetching transmitter data from SATNOGS ({satnogs_transmitters_url})')
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            response = await async_fetch(satnogs_transmitters_url, pool)
            if response.status_code != 200:
                logger.error(f"HTTP Error: Received status code {response.status_code} from {satnogs_transmitters_url}")
            else:
                satnogs_transmitter_data = json.loads(response.text)

            satnogs_transmitter_data = json.loads(response.text)
            logger.info(f"Fetched {len(satnogs_transmitter_data)} transmitters from SATNOGS")

    except requests.exceptions.RequestException as e:
        logger.error(f'Failed to fetch data from {satnogs_transmitters_url}: {e}')

    # emit an event
    await sio.emit('sat-sync-events', {'status': 'inprogress', 'progress': 80,})

    #  we now have everything, TLE from celestack sat info and transmitter info  from satnogs, lets put them in the db
    try:
        for sat in celestrak_list:
            norad_id = get_norad_id_from_tle(sat['line1'])
            satellite = Satellites(
                norad_id=norad_id,
                name=sat['name'],
                name_other=None,
                alternative_name=None,
                image=None,
                sat_id=None,
                tle1=sat['line1'],
                tle2=sat['line2'],
                status=None,
                decayed=None,
                launched=None,
                deployed=None,
                website=None,
                operator=None,
                countries=None,
                citation=None,
                is_frequency_violator=None,
                associated_satellites=None,
            )

            # let's find the sat info from the satnogs list
            satnogs_sat_info = get_satellite_by_norad_id(norad_id, satnogs_satellite_data)

            if satnogs_sat_info:
                satellite.sat_id = satnogs_sat_info.get('sat_id', None)
                satellite.name = satnogs_sat_info.get('name', None)
                satellite.image = satnogs_sat_info.get('image', None)
                satellite.status = satnogs_sat_info.get('status', None)
                satellite.decayed = parse_date(satnogs_sat_info.get('decayed')) if satnogs_sat_info.get('decayed', None) else None
                satellite.launched = parse_date(satnogs_sat_info.get('launched')) if satnogs_sat_info.get('launched', None) else None
                satellite.deployed = parse_date(satnogs_sat_info.get('deployed')) if satnogs_sat_info.get('deployed', None) else None
                satellite.website = satnogs_sat_info.get('website', None)
                satellite.operator = satnogs_sat_info.get('operator', None)
                satellite.countries = satnogs_sat_info.get('countries', None)
                satellite.telemetries = satnogs_sat_info.get('telemetries', None)
                #satellite.updated = parse_date(satnogs_sat_info.get('updated')) if satnogs_sat_info.get('updated', None) else None
                satellite.citation = satnogs_sat_info.get('citation', None)
                satellite.is_frequency_violator = satnogs_sat_info.get('is_frequency_violator', None)
                satellite.associated_satellites = json.dumps(satnogs_sat_info.get('associated_satellites', {}))

            # add sto dbsession
            await dbsession.merge(satellite)

            # commit session
            await dbsession.commit()

            # let's find transmitter info in the satnogs_transmitter_data list
            satnogs_transmitter_info = get_transmitter_info_by_norad_id(norad_id, satnogs_transmitter_data)

            if satnogs_transmitter_info:
                transmitter = Transmitters(
                    description=satnogs_transmitter_info.get('description', None),
                    alive=satnogs_transmitter_info.get('alive', None),
                    type=satnogs_transmitter_info.get('type', None),
                    uplink_low=satnogs_transmitter_info.get('uplink_low', None),
                    uplink_high=satnogs_transmitter_info.get('uplink_high', None),
                    uplink_drift=satnogs_transmitter_info.get('uplink_drift', None),
                    downlink_low=satnogs_transmitter_info.get('downlink_low', None),
                    downlink_high=satnogs_transmitter_info.get('downlink_high', None),
                    downlink_drift=satnogs_transmitter_info.get('downlink_drift', None),
                    mode=satnogs_transmitter_info.get('mode', None),
                    mode_id=satnogs_transmitter_info.get('mode_id', None),
                    uplink_mode=satnogs_transmitter_info.get('uplink_mode', None),
                    invert=satnogs_transmitter_info.get('invert', None),
                    baud=satnogs_transmitter_info.get('baud', None),
                    sat_id=satnogs_transmitter_info.get('sat_id', None),
                    norad_cat_id=satnogs_transmitter_info.get('norad_cat_id', None),
                    norad_follow_id=satnogs_transmitter_info.get('norad_follow_id', None),
                    status=satnogs_transmitter_info.get('status', None),
                    citation=satnogs_transmitter_info.get('citation', None),
                    service=satnogs_transmitter_info.get('service', None),
                    iaru_coordination=satnogs_transmitter_info.get('iaru_coordination', None),
                    iaru_coordination_url=satnogs_transmitter_info.get('iaru_coordination_url', None),
                    itu_notification=satnogs_transmitter_info.get('itu_notification', None),
                    frequency_violation=satnogs_transmitter_info.get('frequency_violation', None),
                    unconfirmed=satnogs_transmitter_info.get('unconfirmed', None),
                )

                await dbsession.merge(transmitter)

                # commit session
                await dbsession.commit()

    except Exception as e:
        await dbsession.rollback()  # Rollback in case of error
        logger.error(f"Error while synchronizing satellite data in the db: {e}")
        logger.exception(e)

    finally:
        # Always close the session when you're done
        await dbsession.close()

    # emit an event
    await sio.emit('sat-sync-events', {'success': True, 'status': 'complete', 'progress': 100,})
