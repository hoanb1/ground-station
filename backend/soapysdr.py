import asyncio
import socket
import logging
from zeroconf import ServiceStateChange
from zeroconf.asyncio import AsyncServiceBrowser, AsyncZeroconf

# Configure logger
logger = logging.getLogger('soapysdr')

# Store discovered servers here: {name: (ip_address, port)}
discovered_servers: dict[str, tuple[str, int]] = {}

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
                f"Found SoapyRemote Server: {name} | Server: {server_name} | Addresses: {addresses} | Port: {port} | Properties: {info.properties}")

            # Store the first valid IPv4 address found
            for addr in addresses:
                # Basic check for common private IPv4 ranges
                if addr.startswith(("192.168.", "10.", "172.")):  # Add other ranges if needed
                    discovered_servers[name] = (addr, port)
                    break  # Take the first suitable address
            else:
                if addresses:  # Fallback to the first address if no private IP matched
                    addr = addresses[0]
                    discovered_servers[name] = (addr, port)

    elif state_change is ServiceStateChange.Removed:
        logger.info(f"Service {name} removed")
        if name in discovered_servers:
            del discovered_servers[name]

# This is a wrapper that will handle the async callback properly
def service_state_change_handler(zeroconf, service_type, name, state_change):
    """Handle the service state change by scheduling the async callback."""
    asyncio.create_task(on_service_state_change(zeroconf, service_type, name, state_change))

async def discover_soapy_servers():
    """Discover SoapyRemote servers using AsyncZeroconf."""
    logger.info("Starting mDNS discovery for SoapyRemote servers...")

    # Create AsyncZeroconf instance
    azc = AsyncZeroconf()

    # Define service type
    service_type = "_soapy._tcp.local."  # Fixed the service type here

    # Create service browser with callback wrapper
    browser = AsyncServiceBrowser(
        azc.zeroconf,
        [service_type],
        handlers=[service_state_change_handler]  # Use the wrapper instead
    )

    try:
        search_duration = 10
        logger.info(f"Searching for {search_duration} seconds...")
        await asyncio.sleep(search_duration)

        if discovered_servers:
            logger.debug("Found the following potential SoapyRemote servers:")
            for name, (ip, port) in discovered_servers.items():
                logger.debug(f"  Name: {name}, IP: {ip}, Port: {port}")
        else:
            logger.debug("No SoapyRemote servers advertising via mDNS found.")

    except asyncio.CancelledError:
        logger.info("Discovery cancelled...")
    finally:
        logger.info("Closing Zeroconf browser...")
        await browser.async_cancel()
        await azc.async_close()
        logger.info("Discovery completed.")

# When you want to run this function:
# asyncio.run(discover_soapy_servers())