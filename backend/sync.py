import crud
import requests
import os
import json
import asyncio
import urllib.parse
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
    progress = 0

    try:
        increment = 30 / len(tle_sources)
    except ZeroDivisionError:
        increment = 1

    # emit an event
    await sio.emit('sat-sync-events', {'status': 'inprogress', 'progress': progress})

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
                await sio.emit('sat-sync-events', {'success': False, 'status': 'inprogress', 'progress': 0, 'message': e.message})

            except requests.exceptions.RequestException as e:
                logger.error(f'Failed to fetch data from {tle_source["url"]}: {e}')
                await sio.emit('sat-sync-events', {'success': False, 'status': 'inprogress', 'progress': 0, 'message': e})

            progress += increment
            await sio.emit('sat-sync-events', {'status': 'inprogress', 'progress': progress, 'message': f'Fetched {tle_source_url}'})

            logger.info(f"Group {tle_source_identifier} has {len(group_assignments[tle_source_identifier])} members")

            # fetch group by identifier
            group = await crud.fetch_system_satellite_group_by_identifier(dbsession, tle_source_identifier)
            group = group.get('data', None)

            if group:
                group['satellite_ids'] = group_assignments[tle_source_identifier]
                await dbsession.commit()

            else:
                # make a system group and upsert it
                new_group = SatelliteGroups(
                    name=tle_source.get('name', None),
                    identifier=tle_source.get('identifier', None),
                    userid=None,
                    satellite_ids=group_assignments[tle_source_identifier],
                    type=SatelliteGroupType.SYSTEM,
                )

                # merge and commit
                await dbsession.merge(new_group)
                await dbsession.commit()

            progress += 5
            await sio.emit('sat-sync-events', {'status': 'inprogress', 'progress': progress, 'message': f'Group {tle_source.get('name', None)} created/updated'})

        # for complete
        progress += 5
        await sio.emit('sat-sync-events', {'status': 'inprogress', 'progress': progress, 'message': 'Finished fetching TLE sources'})

    if not celestrak_list:
        logger.error("No TLEs were fetched from any TLE source, aborting!")
        await sio.emit('sat-sync-events', {'success': False, 'status': 'complete', 'progress': 100, 'message': 'No TLEs were fetched from any TLE source'})
        return

    # emit an event
    progress += 5
    await sio.emit('sat-sync-events', {'status': 'inprogress', 'progress': progress, 'message': 'Fetching satellite data from SATNOGS'})

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
    progress += 5
    await sio.emit('sat-sync-events', {'status': 'inprogress', 'progress': progress, 'message': 'Fetching transmitter data from SATNOGS'})

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
    progress += 5
    await sio.emit('sat-sync-events', {'status': 'inprogress', 'progress': progress, 'message': 'Updating satellite data in the database...'})

    #  we now have everything, TLE from celestrak sat info and transmitter info  from satnogs, lets put them in the db
    count_sats = 0
    count_transmitters = 0
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
            count_sats+=1

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

            for transmitter in satnogs_transmitter_info:
                transmitter = Transmitters(
                    id=transmitter.get('uuid', None),
                    description=transmitter.get('description', None),
                    alive=transmitter.get('alive', None),
                    type=transmitter.get('type', None),
                    uplink_low=transmitter.get('uplink_low', None),
                    uplink_high=transmitter.get('uplink_high', None),
                    uplink_drift=transmitter.get('uplink_drift', None),
                    downlink_low=transmitter.get('downlink_low', None),
                    downlink_high=transmitter.get('downlink_high', None),
                    downlink_drift=transmitter.get('downlink_drift', None),
                    mode=transmitter.get('mode', None),
                    mode_id=transmitter.get('mode_id', None),
                    uplink_mode=transmitter.get('uplink_mode', None),
                    invert=transmitter.get('invert', None),
                    baud=transmitter.get('baud', None),
                    sat_id=transmitter.get('sat_id', None),
                    norad_cat_id=transmitter.get('norad_cat_id', None),
                    norad_follow_id=transmitter.get('norad_follow_id', None),
                    status=transmitter.get('status', None),
                    citation=transmitter.get('citation', None),
                    service=transmitter.get('service', None),
                    iaru_coordination=transmitter.get('iaru_coordination', None),
                    iaru_coordination_url=transmitter.get('iaru_coordination_url', None),
                    itu_notification=transmitter.get('itu_notification', None),
                    frequency_violation=transmitter.get('frequency_violation', None),
                    unconfirmed=transmitter.get('unconfirmed', None),
                )
                count_transmitters+=1

                await dbsession.merge(transmitter)

                # commit session
                await dbsession.commit()

    except Exception as e:
        await dbsession.rollback()  # Rollback in case of error
        logger.error(f"Error while synchronizing satellite data in the db: {e}")
        logger.exception(e)

        # emit an event
        await sio.emit('sat-sync-events', {'success': False, 'status': 'complete', 'progress': 100, 'error': str(e)})

    finally:
        # Always close the session when you're done
        await dbsession.close()

        logger.info(f"Successfully synchronized {count_sats} satellites and {count_transmitters} transmitters")

        # emit an event
        await sio.emit('sat-sync-events', {'success': True, 'status': 'complete', 'progress': 100, 'message': f'Successfully synchronized {count_sats} satellites and {count_transmitters} transmitters'})
