
import os
import json
import subprocess
from datetime import datetime, timezone
from common.logger import logger


# Path to the version.json file containing the base version
VERSION_JSON_PATH = os.path.join(os.path.dirname(__file__), "version.json")

# Path to store version info during build
VERSION_FILE_PATH = os.path.join(os.path.dirname(__file__), "version-info.json")



def get_version_base():
    """Get the base version from version.json file."""
    try:
        if os.path.exists(VERSION_JSON_PATH):
            with open(VERSION_JSON_PATH, 'r') as f:
                version_data = json.load(f)
                return version_data.get("version", "0.0.0")  # Default to 0.0.0 if not found
        else:
            logger.warning(f"Version file not found: {VERSION_JSON_PATH}, using default version")
            return "0.0.0"
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Error reading version file: {e}")
        return "0.0.0"


def get_git_revision_short_hash():
    """Get the git revision short hash, if available."""
    try:
        return subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD']).decode('ascii').strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        # If we're not in a git repository or git isn't installed
        return "unknown"


def get_build_date():
    """Get the build date in ISO format."""
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def get_version_info():
    """Get complete version information."""
    # First check if we have a version-info.json file (created during build)
    if os.path.exists(VERSION_FILE_PATH):
        try:
            with open(VERSION_FILE_PATH, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            # If file exists but is invalid, continue with normal version generation
            pass

    # Determine environment (development by default)
    environment = os.environ.get("GS_ENVIRONMENT", "development")

    # Check if version is provided by environment (e.g., from the CI pipeline)
    if "BUILD_VERSION" in os.environ:
        version_info = {
            "version": os.environ["BUILD_VERSION"],
            "buildDate": os.environ.get("BUILD_DATE", get_build_date()),
            "gitCommit": os.environ.get("GIT_COMMIT", "unknown"),
            "environment": environment
        }
    else:
        # Otherwise generate a version from components
        git_hash = get_git_revision_short_hash()
        build_date = get_build_date()
        version_base = get_version_base()

        # Include environment indicator in dev builds
        env_suffix = "" if environment == "production" else f"-{environment}"
        version = f"{version_base}{env_suffix}-{build_date}-{git_hash}"

        version_info = {
            "version": version,
            "buildDate": build_date,
            "gitCommit": git_hash,
            "environment": environment
        }

    # Write to file for persistence
    try:
        with open(VERSION_FILE_PATH, 'w') as f:
            json.dump(version_info, f)
    except IOError:
        # Not critical if we can't write the file
        logger.warning(f"Warning: Failed to write version info to {VERSION_FILE_PATH}")

    return version_info


# Singleton instance of version info
_version_info = None


def get_version():
    """Get the current version string."""
    global _version_info
    if _version_info is None:
        _version_info = get_version_info()
    return _version_info["version"]


def get_full_version_info():
    """Get the complete version information dictionary."""
    global _version_info
    if _version_info is None:
        _version_info = get_version_info()
    return _version_info


def write_version_info_during_build():
    """
    CLI utility to write version info during the build process.
    This allows capturing the git commit at build time rather than runtime.
    """
    version_info = get_version_info()
    with open(VERSION_FILE_PATH, 'w') as f:
        json.dump(version_info, f)
    logger.info(f"Version information written to {VERSION_FILE_PATH}: {version_info}")
    return version_info