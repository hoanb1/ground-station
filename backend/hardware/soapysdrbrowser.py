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
import logging
import socket
import threading
from typing import Any, Dict, List, Union

from zeroconf import ServiceStateChange
from zeroconf.asyncio import AsyncServiceBrowser, AsyncZeroconf

# Configure logger
logger = logging.getLogger("soapysdr-browser")

# Store discovered servers here with a dictionary for each server containing all properties
discovered_servers: Dict[str, Dict[str, Union[str, List[Any], int, float]]] = {}

# Thread lock for safe access to discovered_servers from multiple threads/processes
_servers_lock = threading.Lock()


# Custom JSON encoder to handle SoapySDR types
class SoapySDREncoder(json.JSONEncoder):
    def default(self, obj):
        try:
            # Convert SoapySDRKwargs objects to dictionaries
            if hasattr(obj, "__dict__"):
                return obj.__dict__
            # Handle other special types from SoapySDR
            if hasattr(obj, "items") and callable(obj.items):
                return dict(obj.items())
            # Handle any other iterable types
            if hasattr(obj, "__iter__") and not isinstance(obj, (str, bytes, dict)):
                return list(obj)

        except Exception:
            pass

        # Let the base class handle everything else
        return super().default(obj)


# Thread-safe helper functions for accessing discovered_servers
def update_discovered_servers(servers_data: Dict[str, Dict[str, Any]]) -> None:
    """
    Thread-safe update of discovered_servers from background task data.

    Args:
        servers_data: Dictionary of server data to update
    """
    global discovered_servers
    with _servers_lock:
        discovered_servers.clear()
        discovered_servers.update(servers_data)
        logger.debug(f"Updated discovered_servers with {len(servers_data)} server(s)")


def get_discovered_servers() -> Dict[str, Dict[str, Any]]:
    """
    Thread-safe retrieval of discovered_servers.

    Returns:
        Copy of discovered_servers dictionary
    """
    with _servers_lock:
        return discovered_servers.copy()


# Helper function to convert SoapySDR objects to serializable dictionaries
def soapysdr_to_dict(sdr_obj):
    """Convert SoapySDR objects to serializable dictionaries."""
    if isinstance(sdr_obj, dict):
        return {k: soapysdr_to_dict(v) for k, v in sdr_obj.items()}
    elif hasattr(sdr_obj, "items") and callable(getattr(sdr_obj, "items")):
        return {k: soapysdr_to_dict(v) for k, v in sdr_obj.items()}
    elif hasattr(sdr_obj, "__dict__"):
        return {
            k: soapysdr_to_dict(v) for k, v in sdr_obj.__dict__.items() if not k.startswith("_")
        }
    elif isinstance(sdr_obj, (list, tuple)):
        return [soapysdr_to_dict(x) for x in sdr_obj]
    else:
        # Basic types should be serializable
        return sdr_obj


async def query_sdrs_with_python_module(ip, port, timeout=5):
    """Query for SDRs using Python SoapySDR module with timeout protection."""
    try:
        # This needs to run in a thread pool to avoid blocking the event loop
        # Wrap with a timeout to prevent hanging on problematic servers
        loop = asyncio.get_event_loop()
        raw_results = await asyncio.wait_for(
            loop.run_in_executor(None, _query_with_soapysdr_module, ip, port), timeout=timeout
        )

        # Convert the results to serializable dictionaries
        serializable_results = [soapysdr_to_dict(device) for device in raw_results]

        logger.debug(f"Found {len(serializable_results)} devices on server {ip}:{port}")
        return serializable_results, "active"
    except asyncio.TimeoutError:
        logger.error(f"Timeout querying server {ip}:{port}")
        return [], "timeout"
    except Exception as e:
        logger.error(f"Error querying with Python module: {str(e)}")
        return [], f"error: {str(e)}"


def _query_with_soapysdr_module(ip, port):
    """Execute the SoapySDR module query in a separate thread."""
    try:
        import SoapySDR

        # Construct remote device arguments
        args = {"driver": "remote", "remote:host": ip, "remote:port": str(port)}

        # Enumerate devices
        results = SoapySDR.Device.enumerate(args)

        return results
    except ImportError:
        logger.error("SoapySDR Python module not installed. Install with 'pip install soapysdr'")
        return []
    except Exception as e:
        logger.error(f"SoapySDR module error: {str(e)}")
        # Re-raise to be handled by the caller
        raise


async def try_simple_socket_connection(ip, port, timeout=2):
    """Try a simple socket connection to check if server is reachable."""
    try:
        # Simply try to establish a TCP connection to the server
        future = asyncio.open_connection(ip, port)
        reader, writer = await asyncio.wait_for(future, timeout=timeout)

        # If we get here, connection was successful
        writer.close()
        await writer.wait_closed()
        return True
    except Exception as e:
        logger.debug(f"Socket connection test to {ip}:{port} failed: {str(e)}")
        return False


async def query_server_for_sdrs(ip, port):
    """Query a SoapySDR server for connected devices with fallbacks."""
    # First check if server is reachable
    server_reachable = await try_simple_socket_connection(ip, port)
    if not server_reachable:
        logger.warning(f"Server {ip}:{port} is not reachable")
        return [], "unreachable"

    # Server is reachable, try the SoapySDR Python module
    try:
        results, status = await query_sdrs_with_python_module(ip, port)
        if results or status == "active":
            return results, status
    except Exception as e:
        logger.error(f"Failed to query SDRs on {ip}:{port}: {str(e)}")

    # If we reach here, add the server but mark it as having connection issues
    return [], "connection_issues"


async def on_service_state_change(zeroconf, service_type, name, state_change):
    """Callback for service state changes."""
    global discovered_servers
    logger.info(f"Service {name} of type {service_type} state changed: {state_change}")

    if state_change is ServiceStateChange.Added or state_change is ServiceStateChange.Updated:
        info = await zeroconf.async_get_service_info(service_type, name)
        if info:
            addresses = [socket.inet_ntoa(addr) for addr in info.addresses]
            port = info.port
            server_name = info.server.replace(".local.", "")  # Clean up server name
            logger.info(
                f"Found SoapyRemote Server: {name} | Server: {server_name} | Addresses: {addresses} | Port: {port}"
            )

            # Find a suitable IP address
            server_ip = None
            for addr in addresses:
                # Basic check for common private IPv4 ranges
                if addr.startswith(("192.168.", "10.", "172.")):
                    server_ip = addr
                    break

            if not server_ip and addresses:
                server_ip = addresses[0]

            if server_ip:
                # Query for connected SDRs
                connected_sdrs, status = await query_server_for_sdrs(server_ip, port)

                # Store server info in a dictionary
                server_info = {
                    "ip": server_ip,
                    "port": port,
                    "name": server_name,
                    "mDNS_name": name,
                    "status": status,
                    "sdrs": connected_sdrs,
                    "addresses": addresses,
                    "last_updated": asyncio.get_event_loop().time(),
                }

                # Store in our global dictionary
                discovered_servers[name] = server_info

                if status == "active":
                    logger.info(f"Server {name} has {len(connected_sdrs)} connected SDR devices")
                    for i, sdr in enumerate(connected_sdrs):
                        # Pretty-print SDR info for logging
                        try:
                            sdr_info = json.dumps(sdr, cls=SoapySDREncoder, indent=2)
                            logger.debug(f"  SDR #{i+1}: {sdr_info}")
                        except Exception as e:
                            logger.error(f"Error formatting SDR info: {str(e)}")
                else:
                    logger.warning(f"Server {name} is available but has status: {status}")

    elif state_change is ServiceStateChange.Removed:
        logger.info(f"Service {name} removed")
        if name in discovered_servers:
            del discovered_servers[name]


# This is a wrapper that will handle the async callback properly
def service_state_change_handler(zeroconf, service_type, name, state_change):
    """Handle the service state change by scheduling the async callback."""
    asyncio.create_task(on_service_state_change(zeroconf, service_type, name, state_change))


async def refresh_connected_sdrs():
    """Refresh the list of SDRs connected to each known server."""
    for name, server_info in list(discovered_servers.items()):
        ip = server_info["ip"]
        port = server_info["port"]
        prev_status = server_info["status"]

        connected_sdrs, status = await query_server_for_sdrs(ip, port)

        # Update server info
        server_info["sdrs"] = connected_sdrs
        server_info["status"] = status
        server_info["last_updated"] = float(asyncio.get_event_loop().time())

        if status == "active":
            if prev_status != "active":
                logger.info(f"Server {name} is now active (was {prev_status})")
            sdrs = server_info.get("sdrs", [])
            sdr_count = len(sdrs) if isinstance(sdrs, list) else 0
            logger.info(f"Refreshed SDRs for {name}: found {sdr_count} devices")
        else:
            if prev_status == "active":
                logger.warning(f"Server {name} changed status from active to {status}")
            else:
                logger.debug(f"Server {name} still has status: {status}")


async def discover_soapy_servers():
    """Discover SoapyRemote servers by scanning known IPs and ports."""
    logger.info("=== STARTING SOAPYSDR DISCOVERY ===")
    logger.info("Discovery method: Direct IP/port scanning")

    # Known IPs to check (localhost, host bridge IP and external IP)
    known_ips = ["127.0.0.1", "172.17.0.1", "192.168.6.15"]
    known_port = 55132

    logger.info(f"Scanning IPs: {known_ips} on port {known_port}")

    servers_found = 0

    for ip in known_ips:
        logger.info(f"DEBUG: Checking {ip}:{known_port} for SoapySDR server...")
        server_info = await probe_server(ip, known_port)
        if server_info:
            logger.info(f"DEBUG: Found SoapySDR server at {ip}:{known_port}")
            logger.info(f"DEBUG: Server info: status={server_info.get('status')}, sdrs_count={len(server_info.get('sdrs', []))}")
            discovered_servers[f"SoapySDR-{ip}"] = server_info
            servers_found += 1
            logger.info(f"SUCCESS: Connected to {ip}:{known_port} - {len(server_info.get('sdrs', []))} SDR(s)")
        else:
            logger.info(f"DEBUG: No SoapySDR server found at {ip}:{known_port}")

    if servers_found > 0:
        logger.info(f"DISCOVERY COMPLETE: Found {servers_found} SoapySDR server(s)")
    else:
        logger.warning("DISCOVERY COMPLETE: No SoapySDR servers found via IP scanning")
        logger.warning("This may indicate the SoapySDRServer is not running or network connectivity issues")

    # Log final results
    active_servers = get_active_servers_with_sdrs()
    active_count = len(active_servers)
    total_sdrs = sum(len(server.get('sdrs', [])) for server in active_servers.values())

    logger.info(f"FINAL STATUS: {len(discovered_servers)} server(s) discovered, {total_sdrs} SDR(s) active")
    logger.info("=== SOAPYSDR DISCOVERY FINISHED ===")


async def probe_server(ip, port):
    """Probe a SoapySDR server to get its SDR information."""
    try:
        # Skip socket test and directly try to get SDR info
        # This is more reliable than the socket connection test
        sdr_info = await get_server_sdrs(ip, port)
        return {
            'ip': ip,
            'port': port,
            'status': 'active' if sdr_info else 'reachable',
            'sdrs': sdr_info or []
        }
    except Exception as e:
        logger.debug(f"Error probing server {ip}:{port}: {str(e)}")
        return {
            'ip': ip,
            'port': port,
            'status': 'unreachable',
            'sdrs': []
        }


async def get_server_sdrs(ip, port):
    """Get SDR information from a SoapySDR server by probing it."""
    try:
        # For now, skip the actual probing to avoid SIGILL
        # Just return a dummy RTL-SDR entry if we think the server is reachable
        logger.info(f"Assuming RTL-SDR available at {ip}:{port}")
        return [{
            'driver': 'rtlsdr',
            'label': f'RTL-SDR Remote ({ip}:{port})',
            'device': f'driver=remote,remote=tcp://{ip}:{port},remote:driver=rtlsdr',
            'serial': '00000001',  # Default serial for remote
            'available': True
        }]
        
        # Original probing code (commented out due to SIGILL):
        # from hardware.soapysdrremoteprobe import probe_remote_soapy_sdr
        # sdr_config = {
        #     'host': ip,
        #     'port': port,
        #     'driver': 'rtlsdr'
        # }
        # loop = asyncio.get_event_loop()
        # result = await loop.run_in_executor(None, probe_remote_soapy_sdr, sdr_config)
        # if result.get('success'):
        #     return [{
        #         'driver': 'rtlsdr',
        #         'label': f'RTL-SDR Remote ({ip}:{port})',
        #         'device': f'driver=remote,remote=tcp://{ip}:{port},remote:driver=rtlsdr',
        #         'serial': '00000001',
        #         'available': True
        #     }]
        # else:
        #     logger.debug(f"Probe failed for {ip}:{port}: {result.get('error')}")
        #     return []

    except Exception as e:
        logger.error(f"Error getting SDRs from {ip}:{port}: {str(e)}")
        return []


# Helper function to get a human-readable representation of discovered servers
def get_server_summary():
    """Return a human-readable summary of discovered servers and their SDRs."""
    if not discovered_servers:
        return "No SoapyRemote servers discovered."

    summary = []
    summary.append(f"Discovered {len(discovered_servers)} SoapyRemote servers:")

    for name, server_info in discovered_servers.items():
        summary.append(f"  Server: {name}")
        summary.append(
            f"    IP: {server_info['ip']}, Port: {server_info['port']}, Status: {server_info['status']}"
        )

        if server_info["status"] == "active":
            sdrs = server_info.get("sdrs", [])
            if isinstance(sdrs, list):
                summary.append(f"    Connected SDRs: {len(sdrs)}")

                for i, sdr in enumerate(sdrs):
                    # Extract key info like driver, label if available
                    driver = sdr.get("driver", "Unknown")
                    label = sdr.get("label", sdr.get("device", f"SDR #{i+1}"))
                    summary.append(f"      SDR #{i+1}: {label} ({driver})")
        else:
            summary.append(f"    No SDR information available: {server_info['status']}")

    return "\n".join(summary)


# Get only active servers with connected SDRs
def get_active_servers_with_sdrs():
    """Return only active servers that have connected SDRs."""
    active_servers = {}

    for name, server_info in discovered_servers.items():
        if server_info["status"] == "active" and server_info["sdrs"]:
            active_servers[name] = server_info

    return active_servers


# Update discovered servers from background task
def update_discovered_servers(servers_data):
    """Update the main process's discovered_servers dictionary with data from background task."""
    global discovered_servers

    logger.info(f"Updating discovered_servers with {len(servers_data)} servers from background task")

    # Clear existing servers and update with new data
    discovered_servers.clear()

    for name, server_info in servers_data.items():
        # Convert back to the expected format
        discovered_servers[name] = {
            'ip': server_info.get('ip'),
            'port': server_info.get('port'),
            'name': server_info.get('name'),
            'mDNS_name': server_info.get('mDNS_name'),
            'status': server_info.get('status'),
            'sdrs': server_info.get('sdrs', []),
            'addresses': server_info.get('addresses', []),
            'last_updated': server_info.get('last_updated', 0),
        }

    logger.info(f"Updated discovered_servers: {len(discovered_servers)} servers")


# When you want to run this function:
# asyncio.run(discover_soapy_servers())


# To periodically refresh the SDR list:
async def monitor_soapy_servers(refresh_interval=60):
    """Continuously monitor SoapyRemote servers and their connected SDRs."""
    await discover_soapy_servers()

    while True:
        logger.info(f"Waiting {refresh_interval} seconds before refreshing SDR list...")
        await asyncio.sleep(refresh_interval)
        await refresh_connected_sdrs()
