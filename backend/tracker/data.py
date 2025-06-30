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


import crud
import asyncio
import logging
from common import is_geostationary, serialize_object
from datetime import datetime
from datetime import UTC
from typing import Callable, Any, List, Union, Coroutine, Optional
from db import AsyncSessionLocal
from tracking.footprint import get_satellite_coverage_circle
from tracking.satellite import get_satellite_position_from_tle, get_satellite_az_el, get_satellite_path

logger = logging.getLogger("tracker-worker")


async def compiled_satellite_data(dbsession, norad_id) -> dict:
    """
    Compiles detailed information about a satellite, including its orbital details,
    transmitters, and sky position based on tracking data and user's location.

    :param dbsession: Database session object used to interact with the database
    :param norad_id: Tracking state dictionary containing satellite tracking data
    :return: Dictionary containing satellite details, transmitters, and position
    :rtype: dict
    :raises Exception: If satellite tracking data is unavailable or incomplete
    :raises Exception: If no satellite matches the provided NORAD ID
    :raises Exception: If more than one satellite is found for the same NORAD ID
    :raises Exception: If user location is not found in the database
    """

    satellite_data = {
        'details': {},
        'position': {},
        'paths': {
            'past': [],
            'future': []
        },
        'coverage': [],
        'transmitters': [],
    }

    satellite = await crud.fetch_satellites(dbsession, norad_id=norad_id)

    if not satellite.get('success', False):
        raise Exception(f"No satellite found in the db for norad id {norad_id}")

    if len(satellite.get('data', [])) != 1:
        raise Exception(f"Expected exactly one satellite in the result for norad id {norad_id} got"
                        f" {len(satellite.get('data', []))}")

    satellite_data['details'] = satellite['data'][0]
    satellite_data['details']['is_geostationary'] = is_geostationary([
        satellite_data['details']['tle1'],
        satellite_data['details']['tle2']
    ])

    # get target map settings
    target_map_settings_reply = await crud.get_map_settings(dbsession, 'target-map-settings')
    target_map_settings = target_map_settings_reply['data'].get('value', {})

    # fetch transmitters
    transmitters = await crud.fetch_transmitters_for_satellite(dbsession, norad_id=norad_id)
    satellite_data['transmitters'] = transmitters['data']

    location = await crud.fetch_location_for_userid(dbsession, user_id=None)
    if not location.get('success', False):
        raise Exception(f"No location found in the db for user id None, please set one")

    # get current position
    position = await asyncio.to_thread(get_satellite_position_from_tle, [
        satellite_data['details']['name'],
        satellite_data['details']['tle1'],
        satellite_data['details']['tle2']
    ])

    # get position in the sky
    home_lat = location['data']['lat']
    home_lon = location['data']['lon']
    sky_point = await asyncio.to_thread(get_satellite_az_el, home_lat, home_lon, satellite['data'][0]['tle1'],
                                        satellite['data'][0]['tle2'], datetime.now(UTC))

    # calculate paths
    paths = await asyncio.to_thread(get_satellite_path, [
        satellite_data['details']['tle1'],
        satellite_data['details']['tle2']
    ], duration_minutes=int(target_map_settings.get('orbitProjectionDuration', 240)), step_minutes=0.5)

    satellite_data['paths'] = paths

    satellite_data['coverage'] = await asyncio.to_thread(get_satellite_coverage_circle,
                                                         position['lat'],
                                                         position['lon'],
                                                         position['alt'] / 1000,
                                                         num_points=300
                                                         )

    satellite_data['position'] = position
    position['az'] = sky_point[0]
    position['el'] = sky_point[1]

    satellite_data = serialize_object(satellite_data)

    return satellite_data


async def get_ui_tracker_state(group_id: str, norad_id: int):
    """
    Fetches the current tracker state for a specified group ID and satellite ID. This function
    interacts with the tracking database using asynchronous functions to retrieve data related
    to the specified identifiers. The response contains the success status and fetched data,
    or an error on failure.

    :param group_id: The unique identifier for the group whose satellites are to be fetched.
    :type group_id: int
    :param norad_id: The unique identifier for the satellite whose state is to be fetched.
    :type norad_id: int
    :return: A dictionary containing the success status and the tracker state data, or None
        if the operation fails.
    :rtype: dict
    """
    reply: dict[str, Union[bool, None, dict]] = {'success': False, 'data': None}

    data = {
        'groups': [],
        'satellites': [],
        'transmitters': [],
        'group_id': None,
        'norad_id': None,
        'rotator_id': 'none',
        'rig_id': 'none',
        'transmitter_id': 'none'
    }

    try:
        async with (AsyncSessionLocal() as dbsession):
            groups = await crud.fetch_satellite_group(dbsession)
            satellites = await crud.fetch_satellites_for_group_id(dbsession, group_id=group_id)
            tracking_state = await crud.get_tracking_state(dbsession, name='satellite-tracking')
            transmitters = await crud.fetch_transmitters_for_satellite(dbsession, norad_id=norad_id)
            data['groups'] = groups['data']
            data['satellites'] = satellites['data']
            data['group_id'] = group_id
            data['norad_id'] = norad_id
            data['rig_id'] = tracking_state['data']['value'].get('rig_id', "none")
            data['rotator_id'] = tracking_state['data']['value'].get('rotator_id', "none")
            data['transmitter_id'] = tracking_state['data']['value'].get('transmitter_id', "none")
            data['transmitters'] = transmitters['data']
            reply['success'] = True
            reply['data'] = data

    except Exception as e:
        logger.error(f"Failed to get tracker state for group id: {group_id}, satellite id: {norad_id}, error: {e}")
        logger.exception(e)

    finally:
        pass

    return reply

