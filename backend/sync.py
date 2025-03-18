import crud
import requests
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor


def simple_parse_3le(file_contents):
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


async def synchronize_satellite_data(dbsession, logger):
    """
    Fetches all TLE sources from the database and logs the result.
    """

    def sync_fetch(url: str) -> str:
        reply = requests.get(url)
        return reply.text

    async def async_fetch(url: str, executor: ThreadPoolExecutor) -> str:
        loop = asyncio.get_running_loop()
        # Run sync_fetch in a thread pool
        return await loop.run_in_executor(executor, sync_fetch, url)


    satnogs_satellites_url = "https://db.satnogs.org/api/satellites/?format=json"
    satnogs_transmitters_url = "https://db.satnogs.org/api/transmitters/?format=json"
    satnogs_satellite_data = []
    satnogs_transmitter_data = []
    tle_list = []

    tle_sources_reply = await crud.fetch_satellite_tle_source(dbsession)
    tle_sources = tle_sources_reply.get('data', [])
    satellite_data = []

    # get TLEs from our user-defined TLE sources (probably from celestrak.org)
    for tle_source in tle_sources:
        logger.info(f'TLE source: {tle_source}')

        try:
            # one at a time
            with ThreadPoolExecutor(max_workers=1) as pool:
                # Schedule all requests concurrently
                tasks = [async_fetch(tle_source['url'], pool)]
                logger.info(f"Fetching {tle_source['url']}")
                responses = await asyncio.gather(*tasks)

            tle_list = simple_parse_3le(responses[0])
            satellite_data.append(tle_list)

        except requests.exceptions.RequestException as e:
            logger.error(f'Failed to fetch data from {tle_source["url"]}: {e}')

    logger.info(tle_list)

    # get a complete list of satellite data (no TLEs) from Satnogs
    logger.info(f'Fetching satellite data from SATNOGS ({satnogs_satellites_url})')
    try:
        response = requests.get(satnogs_satellites_url)
        response.raise_for_status()
        satnogs_satellite_data = json.loads(response.text)

    except requests.exceptions.RequestException as e:
        logger.error(f'Failed to fetch data from {satnogs_satellites_url}: {e}')

    # get transmitters from satnogs
    try:
        response = requests.get(satnogs_transmitters_url)
        response.raise_for_status()
        satnogs_transmitter_data = json.loads(response.text)

    except requests.exceptions.RequestException as e:
        logger.error(f'Failed to fetch data from {satnogs_transmitters_url}: {e}')
