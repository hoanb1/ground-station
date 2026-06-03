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


import socket
import uuid
import logging
from typing import List

logger = logging.getLogger("common.utils")


def convert_strings_to_uuids(string_uuids: List[str]) -> List[uuid.UUID]:
    """
    Converts a list of string UUIDs to a list of UUID objects.

    Parameters:
      string_uuids (List[str]): A list of strings representing UUIDs.

    Returns:
      List[uuid.UUID]: A list of UUID objects.
    """
    return [uuid.UUID(u) for u in string_uuids]


def is_local_address(hostname: str) -> bool:
    """
    Check if the hostname or IP address resolves to a local interface on this machine.
    """
    if not hostname:
        return False
    h_lower = hostname.lower().strip()
    if h_lower in ("localhost", "127.0.0.1", "::1", "0.0.0.0", "::"):
        return True

    # Try resolving hostname to IPs
    try:
        resolved_ips = {addrinfo[4][0] for addrinfo in socket.getaddrinfo(hostname, None)}
    except Exception:
        resolved_ips = {hostname}

    # Get all interface IPs on the system
    local_ips = set()
    try:
        import psutil

        for interface, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                # Strip interface scope if IPv6
                ip = addr.address.split("%")[0]
                local_ips.add(ip)
    except Exception as e:
        logger.warning(f"Failed to query network interfaces via psutil: {e}")

    # Check if any resolved IP matches local IPs
    for resolved_ip in resolved_ips:
        if resolved_ip in local_ips:
            return True

    return False


def get_loopback_optimized_host(hostname: str, port: int) -> str:
    """
    Determine the best connection target.
    If the hostname resolves to a local IP and the port is open/listening on 127.0.0.1,
    returns '127.0.0.1'. Otherwise, returns the original hostname.
    """
    if not hostname:
        return hostname

    if not is_local_address(hostname):
        return hostname

    # Standard loopback hostnames don't need optimization or port checking
    if hostname.lower().strip() in ("localhost", "127.0.0.1", "::1"):
        return hostname

    # Check if the port is listening on 127.0.0.1
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.1):
            logger.info(
                f"Local address '{hostname}' detected. Redirecting to loopback '127.0.0.1' on port {port}."
            )
            return "127.0.0.1"
    except Exception:
        # Port is not listening on loopback (or connection failed), keep original hostname
        logger.debug(
            f"Local address '{hostname}' detected but port {port} is not listening on 127.0.0.1. Connecting via '{hostname}'."
        )
        return hostname

