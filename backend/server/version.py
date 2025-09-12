"""
Version information for the Ground Station application.
This file is used as the source of truth for versioning across the application.
"""

# Version information: MAJOR.MINOR.PATCH
VERSION_MAJOR = 0
VERSION_MINOR = 1
VERSION_PATCH = 0

# Build information (auto-filled by build scripts)
BUILD_NUMBER = "dev"  # Will be populated during build time
GIT_COMMIT = "unknown"  # Will be populated during build time

# Full version string
VERSION = f"{VERSION_MAJOR}.{VERSION_MINOR}.{VERSION_PATCH}"

# Full version with build info
VERSION_FULL = f"{VERSION}-{BUILD_NUMBER}"

def get_version():
    """Return the version string"""
    return VERSION

def get_version_full():
    """Return the full version string with build information"""
    return VERSION_FULL
