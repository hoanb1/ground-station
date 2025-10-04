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

from typing import Dict, Union

from common.auth import authenticate_user
from db import AsyncSessionLocal


async def auth_request_routing(sio, cmd, data, logger, sid):
    """
    Routes authentication requests to the appropriate handle based on the command
    provided. Establishes an asynchronous session with the database for processing
    the request. Ensures the database session is properly closed after use.

    :param sid:
    :param sio: Socket.IO server instance facilitating communication via events.
    :type sio: AsyncServer
    :param cmd: Command string determining the operation to be performed.
    :param data: Payload of the authentication request containing data required for
        processing.
    :type data: dict
    :param logger: Logger instance for logging the events, errors, or general
        information related to the processing of the request.
    :type logger: Logger
    :return: A dictionary containing the success status of the operation and
        any resulting data after processing the request.
    :rtype: dict
    """

    reply: Dict[str, Union[bool, None, dict, str]] = {"success": None, "user": None, "token": None}

    async with AsyncSessionLocal() as dbsession:

        logger.debug(f"Auth request, cmd: {cmd}, data: {data}")
        auth_reply = await authenticate_user(dbsession, data["email"], data["password"])

        if auth_reply is not None:
            # login success
            reply["success"] = True
            reply["token"] = auth_reply.get("token", None)

            # fetch user data
            reply["user"] = auth_reply.get("user", None)

        else:
            reply["success"] = False

    return reply
