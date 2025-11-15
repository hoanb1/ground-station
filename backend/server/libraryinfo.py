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

"""Library version information utilities."""

import importlib.metadata
import subprocess
import sys
from typing import Any, Dict, List, Optional

from common.logger import logger


def get_package_version(package_name: str) -> Optional[str]:
    """
    Get the version of an installed Python package.

    Args:
        package_name: Name of the package

    Returns:
        Version string or None if package is not installed
    """
    try:
        return importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        return None


def get_system_library_version(command: List[str]) -> Optional[str]:
    """
    Get the version of a system library by running a command.

    Args:
        command: Command to execute (e.g., ['uhd_find_devices', '--version'])

    Returns:
        Version string or None if command fails
    """
    try:
        result = subprocess.run(
            command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5
        )
        output = result.stdout + result.stderr
        return output.strip() if output else None
    except (subprocess.SubprocessError, FileNotFoundError, TimeoutError):
        return None


def get_python_version() -> str:
    """Get the Python version."""
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def get_library_versions() -> Dict[str, Any]:
    """
    Get versions of all important libraries and dependencies.

    Returns:
        Dictionary containing categorized library information
    """
    libraries: Dict[str, Dict[str, Any]] = {
        "python": {
            "name": "Python",
            "version": get_python_version(),
            "category": "runtime",
            "description": "Python interpreter",
        },
        # Core web framework
        "fastapi": {
            "name": "FastAPI",
            "version": get_package_version("fastapi"),
            "category": "web",
            "description": "Web framework",
        },
        "uvicorn": {
            "name": "Uvicorn",
            "version": get_package_version("uvicorn"),
            "category": "web",
            "description": "ASGI server",
        },
        "python-socketio": {
            "name": "Python-SocketIO",
            "version": get_package_version("python-socketio"),
            "category": "web",
            "description": "WebSocket communication",
        },
        # Database
        "sqlalchemy": {
            "name": "SQLAlchemy",
            "version": get_package_version("sqlalchemy"),
            "category": "database",
            "description": "SQL toolkit and ORM",
        },
        "alembic": {
            "name": "Alembic",
            "version": get_package_version("alembic"),
            "category": "database",
            "description": "Database migrations",
        },
        # SDR libraries
        "pyrtlsdr": {
            "name": "pyrtlsdr",
            "version": get_package_version("pyrtlsdr"),
            "category": "sdr",
            "description": "RTL-SDR Python bindings",
        },
        # Scientific computing
        "numpy": {
            "name": "NumPy",
            "version": get_package_version("numpy"),
            "category": "scientific",
            "description": "Numerical computing",
        },
        "scipy": {
            "name": "SciPy",
            "version": get_package_version("scipy"),
            "category": "scientific",
            "description": "Scientific computing",
        },
        "scikit-learn": {
            "name": "scikit-learn",
            "version": get_package_version("scikit-learn"),
            "category": "scientific",
            "description": "Machine learning",
        },
        # Satellite tracking
        "skyfield": {
            "name": "Skyfield",
            "version": get_package_version("skyfield"),
            "category": "tracking",
            "description": "Astronomy and satellite tracking",
        },
        "sgp4": {
            "name": "SGP4",
            "version": get_package_version("sgp4"),
            "category": "tracking",
            "description": "Satellite position calculations",
        },
        # Audio processing
        "sounddevice": {
            "name": "sounddevice",
            "version": get_package_version("sounddevice"),
            "category": "audio",
            "description": "Audio I/O",
        },
        # Image processing
        "pillow": {
            "name": "Pillow",
            "version": get_package_version("pillow"),
            "category": "image",
            "description": "Image processing",
        },
        # Task scheduling
        "apscheduler": {
            "name": "APScheduler",
            "version": get_package_version("apscheduler"),
            "category": "scheduling",
            "description": "Task scheduling",
        },
        # Error correction
        "reedsolo": {
            "name": "reedsolo",
            "version": get_package_version("reedsolo"),
            "category": "encoding",
            "description": "Reed-Solomon error correction",
        },
        # HTTP client
        "requests": {
            "name": "Requests",
            "version": get_package_version("requests"),
            "category": "networking",
            "description": "HTTP library",
        },
        "httpx": {
            "name": "HTTPX",
            "version": get_package_version("httpx"),
            "category": "networking",
            "description": "Async HTTP client",
        },
        # Security
        "cryptography": {
            "name": "Cryptography",
            "version": get_package_version("cryptography"),
            "category": "security",
            "description": "Cryptographic primitives",
        },
        "pyjwt": {
            "name": "PyJWT",
            "version": get_package_version("pyjwt"),
            "category": "security",
            "description": "JSON Web Token implementation",
        },
    }

    # Try to get system library versions
    system_libraries: Dict[str, Dict[str, Any]] = {}

    # UHD (USRP Hardware Driver)
    # Try uhd_config_info --version first, then fall back to checking if any uhd command exists
    uhd_version = get_system_library_version(["uhd_config_info", "--version"])
    if not uhd_version:
        # Try alternative: check if uhd_find_devices exists
        uhd_check = get_system_library_version(["which", "uhd_find_devices"])
        if uhd_check:
            uhd_version = "installed"

    if uhd_version:
        # Extract just the version number if it's in the output
        version_str = uhd_version.split("\n")[0] if "\n" in uhd_version else uhd_version
        # Clean up the version string (remove extra text)
        if "UHD" in version_str:
            # Extract version number from strings like "UHD 4.x.x.x"
            parts = version_str.split()
            for part in parts:
                if part[0].isdigit():
                    version_str = part
                    break

        system_libraries["uhd"] = {
            "name": "UHD",
            "version": version_str.strip(),
            "category": "sdr",
            "description": "USRP Hardware Driver",
        }

    # SoapySDR
    soapy_version = get_system_library_version(["SoapySDRUtil", "--info"])
    if soapy_version:
        # Extract version from output
        for line in soapy_version.split("\n"):
            if "Lib Version" in line:
                version = line.split(":")[-1].strip()
                system_libraries["soapysdr"] = {
                    "name": "SoapySDR",
                    "version": version,
                    "category": "sdr",
                    "description": "Vendor-neutral SDR support library",
                }
                break

    # RTL-SDR library (check if rtl_test exists)
    rtlsdr_version = get_system_library_version(["rtl_test", "-h"])
    if rtlsdr_version:
        system_libraries["rtl-sdr"] = {
            "name": "rtl-sdr",
            "version": "installed",
            "category": "sdr",
            "description": "RTL-SDR library",
        }

    # Combine all libraries
    all_libraries: Dict[str, Dict[str, Any]] = {**libraries, **system_libraries}

    # Filter out libraries that are not installed (None version)
    installed_libraries: Dict[str, Dict[str, Any]] = {
        key: value for key, value in all_libraries.items() if value["version"] is not None
    }

    # Categorize libraries
    categorized: Dict[str, List[Dict[str, str]]] = {}
    for lib_key, lib_info in installed_libraries.items():
        category: str = lib_info["category"]
        if category not in categorized:
            categorized[category] = []
        categorized[category].append(
            {
                "key": lib_key,
                "name": lib_info["name"],
                "version": lib_info["version"],
                "description": lib_info["description"],
            }
        )

    # Sort categories and libraries within categories
    result: Dict[str, List[Dict[str, str]]] = {}
    for category in sorted(categorized.keys()):
        result[category] = sorted(categorized[category], key=lambda x: x["name"])

    logger.info(f"Retrieved version information for {len(installed_libraries)} libraries")

    return {"categories": result, "total_count": len(installed_libraries)}
