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

"""
File browser handlers for recordings and snapshots via Socket.IO.

This module provides Socket.IO message handlers for browsing and managing
IQ recordings and waterfall snapshots stored on the filesystem.
"""

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Tuple, Union, cast


def get_disk_usage(path: Path) -> Dict[str, Union[int, str]]:
    """
    Get disk usage statistics for the filesystem containing the given path.

    Args:
        path: Path to check disk usage for

    Returns:
        Dictionary with 'total', 'used', and 'available' in bytes, optionally 'error' string
    """
    try:
        stat = shutil.disk_usage(path)
        return {
            "total": stat.total,
            "used": stat.used,
            "available": stat.free,
        }
    except Exception as e:
        return {
            "total": 0,
            "used": 0,
            "available": 0,
            "error": str(e),
        }


def parse_sigmf_metadata(meta_file_path: str) -> dict:
    """
    Parse a SigMF metadata file.

    Args:
        meta_file_path: Path to the .sigmf-meta file

    Returns:
        Dictionary containing parsed metadata or empty dict if parsing fails
    """
    try:
        with open(meta_file_path, "r") as f:
            metadata = json.load(f)

        global_meta = metadata.get("global", {})

        return {
            "datatype": global_meta.get("core:datatype"),
            "sample_rate": global_meta.get("core:sample_rate"),
            "version": global_meta.get("core:version"),
            "description": global_meta.get("core:description"),
            "recorder": global_meta.get("core:recorder"),
            "recording_in_progress": global_meta.get("gs:recording_in_progress", False),
            "start_time": global_meta.get("gs:start_time"),
            "finalized_time": global_meta.get("gs:finalized_time"),
            "target_satellite_norad_id": global_meta.get("gs:target_satellite_norad_id"),
            "target_satellite_name": global_meta.get("gs:target_satellite_name"),
            "captures": metadata.get("captures", []),
            "annotations": metadata.get("annotations", []),
        }
    except Exception as e:
        return {"error": f"Failed to parse metadata: {str(e)}"}


def get_image_dimensions(image_path: str) -> Tuple[Any, ...]:
    """
    Get image dimensions without loading the full image.

    Args:
        image_path: Path to the image file

    Returns:
        Tuple of (width, height) or (None, None) if unable to determine
    """
    try:
        from PIL import Image

        with Image.open(image_path) as img:
            size: Tuple[Any, ...] = img.size
            return size
    except Exception:
        return (None, None)


async def emit_file_browser_state(sio, state_data, logger):
    """
    Emit file browser state to all connected clients.

    Args:
        sio: Socket.IO server instance
        state_data: State data to emit
        logger: Logger instance
    """
    try:
        await sio.emit("file_browser_state", state_data)
        logger.debug(f"Emitted file_browser_state: {state_data.get('action', 'unknown')}")
    except Exception as e:
        logger.error(f"Error emitting file_browser_state: {str(e)}")


async def emit_file_browser_error(sio, error_message, action, logger):
    """
    Emit file browser error to all connected clients.

    Args:
        sio: Socket.IO server instance
        error_message: Error message
        action: Action that caused the error
        logger: Logger instance
    """
    try:
        await sio.emit("file_browser_error", {"error": error_message, "action": action})
        logger.error(f"Emitted file_browser_error for action '{action}': {error_message}")
    except Exception as e:
        logger.error(f"Error emitting file_browser_error: {str(e)}")


async def filebrowser_request_routing(sio, cmd, data, logger, sid):
    """
    Route file browser requests via Socket.IO.

    This function processes commands and emits state updates via pub/sub model.
    No return value - all responses are emitted as events.

    Args:
        sio: Socket.IO server instance
        cmd: Command string specifying the action to perform
        data: Additional data for the command
        logger: Logger instance
        sid: Socket.IO session ID
    """

    # Get the data directories
    backend_dir = Path(__file__).parent.parent
    recordings_dir = backend_dir / "data" / "recordings"
    snapshots_dir = backend_dir / "data" / "snapshots"

    try:
        if cmd == "list-files":
            # Extract pagination and sorting parameters
            page = data.get("page", 1) if data else 1
            page_size = data.get("pageSize", 8) if data else 8
            sort_by = data.get("sortBy", "created") if data else "created"
            sort_order = data.get("sortOrder", "desc") if data else "desc"
            show_recordings = data.get("showRecordings", True) if data else True
            show_snapshots = data.get("showSnapshots", True) if data else True

            logger.info(
                f"Listing files (page {page}, size {page_size}, sort {sort_by} {sort_order})"
            )

            all_items = []

            # Gather recordings if filter enabled
            if show_recordings and recordings_dir.exists():
                meta_files = list(recordings_dir.glob("*.sigmf-meta"))

                for meta_file in meta_files:
                    base_name = meta_file.stem
                    data_file = recordings_dir / f"{base_name}.sigmf-data"

                    if not data_file.exists():
                        logger.warning(f"Data file missing for {meta_file.name}")
                        continue

                    data_stat = data_file.stat()

                    # Quick metadata parse for sample rate (only if needed for sorting)
                    sample_rate = None
                    if sort_by == "sample_rate":
                        try:
                            metadata = parse_sigmf_metadata(str(meta_file))
                            sample_rate = metadata.get("sample_rate", 0)
                        except Exception:
                            sample_rate = 0

                    all_items.append(
                        {
                            "type": "recording",
                            "name": base_name,
                            "size": data_stat.st_size,
                            "created": data_stat.st_ctime,
                            "modified": data_stat.st_mtime,
                            "sample_rate": sample_rate,
                            "_meta_file": meta_file,
                            "_data_file": data_file,
                            "_base_name": base_name,
                        }
                    )

            # Gather snapshots if filter enabled
            if show_snapshots and snapshots_dir.exists():
                png_files = list(snapshots_dir.glob("*.png"))

                for png_file in png_files:
                    file_stat = png_file.stat()

                    all_items.append(
                        {
                            "type": "snapshot",
                            "name": png_file.stem,
                            "size": file_stat.st_size,
                            "created": file_stat.st_ctime,
                            "modified": file_stat.st_mtime,
                            "sample_rate": 0,  # Snapshots don't have sample rate
                            "_png_file": png_file,
                        }
                    )

            # Sort all items
            reverse = sort_order == "desc"
            if sort_by == "name":
                all_items.sort(key=lambda x: cast(str, x["name"]), reverse=reverse)
            elif sort_by == "size":
                all_items.sort(key=lambda x: cast(int, x["size"]), reverse=reverse)
            elif sort_by == "created":
                all_items.sort(key=lambda x: cast(float, x["created"]), reverse=reverse)
            elif sort_by == "modified":
                all_items.sort(key=lambda x: cast(float, x["modified"]), reverse=reverse)
            elif sort_by == "sample_rate":
                all_items.sort(key=lambda x: cast(int, x.get("sample_rate", 0)), reverse=reverse)

            # Calculate pagination
            total = len(all_items)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size

            # Process only items for current page with full details
            processed_items = []
            for item in all_items[start_idx:end_idx]:
                if item["type"] == "recording":
                    # Full processing for recordings
                    meta_file = cast(Path, item["_meta_file"])
                    data_file = cast(Path, item["_data_file"])
                    base_name = cast(str, item["_base_name"])

                    data_stat = data_file.stat()
                    metadata = parse_sigmf_metadata(str(meta_file))

                    # Check if recording is in progress (extracted by parse_sigmf_metadata)
                    is_recording_in_progress = metadata.get("recording_in_progress", False)

                    # Check for waterfall snapshot
                    snapshot_file = recordings_dir / f"{base_name}.png"
                    snapshot_info = None
                    if snapshot_file.exists():
                        width, height = get_image_dimensions(str(snapshot_file))
                        snapshot_info = {
                            "filename": snapshot_file.name,
                            "url": f"/recordings/{snapshot_file.name}",
                            "width": width,
                            "height": height,
                        }

                    processed_items.append(
                        {
                            "type": "recording",
                            "name": base_name,
                            "data_file": data_file.name,
                            "meta_file": meta_file.name,
                            "data_size": data_stat.st_size,
                            "created": datetime.fromtimestamp(
                                data_stat.st_ctime, timezone.utc
                            ).isoformat(),
                            "modified": datetime.fromtimestamp(
                                data_stat.st_mtime, timezone.utc
                            ).isoformat(),
                            "metadata": metadata,
                            "snapshot": snapshot_info,
                            "recording_in_progress": is_recording_in_progress,
                            "download_urls": {
                                "data": f"/recordings/{data_file.name}",
                                "meta": f"/recordings/{meta_file.name}",
                            },
                        }
                    )
                else:
                    # Full processing for snapshots
                    png_file = cast(Path, item["_png_file"])
                    file_stat = png_file.stat()
                    width, height = get_image_dimensions(str(png_file))

                    processed_items.append(
                        {
                            "type": "snapshot",
                            "name": png_file.stem,
                            "filename": png_file.name,
                            "size": file_stat.st_size,
                            "created": datetime.fromtimestamp(
                                file_stat.st_ctime, timezone.utc
                            ).isoformat(),
                            "modified": datetime.fromtimestamp(
                                file_stat.st_mtime, timezone.utc
                            ).isoformat(),
                            "width": width,
                            "height": height,
                            "url": f"/snapshots/{png_file.name}",
                        }
                    )

            # Get disk usage for the recordings directory
            disk_usage = get_disk_usage(recordings_dir)

            # Emit state update instead of returning
            await emit_file_browser_state(
                sio,
                {
                    "action": "list-files",
                    "items": processed_items,
                    "total": total,
                    "page": page,
                    "pageSize": page_size,
                    "diskUsage": disk_usage,
                },
                logger,
            )

        elif cmd == "list-recordings":
            # Extract pagination parameters
            page = data.get("page", 1) if data else 1
            page_size = data.get("pageSize", 20) if data else 20

            logger.info(f"Listing IQ recordings (page {page}, size {page_size})")
            recordings = []

            # Ensure directory exists
            if not recordings_dir.exists():
                return {
                    "success": True,
                    "data": {"items": [], "total": 0, "page": page, "pageSize": page_size},
                }

            # Find all .sigmf-meta files
            meta_files = list(recordings_dir.glob("*.sigmf-meta"))

            # Build list with basic info for sorting
            recording_items = []
            for meta_file in meta_files:
                base_name = meta_file.stem
                data_file = recordings_dir / f"{base_name}.sigmf-data"

                if not data_file.exists():
                    logger.warning(f"Data file missing for {meta_file.name}")
                    continue

                data_stat = data_file.stat()
                recording_items.append(
                    {
                        "meta_file": meta_file,
                        "data_file": data_file,
                        "base_name": base_name,
                        "modified": data_stat.st_mtime,
                    }
                )

            # Sort by modified time (newest first)
            recording_items.sort(key=lambda x: cast(float, x["modified"]), reverse=True)

            # Calculate pagination
            total = len(recording_items)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size

            # Only process items for current page
            for item in recording_items[start_idx:end_idx]:
                meta_file = cast(Path, item["meta_file"])
                data_file = cast(Path, item["data_file"])
                base_name = cast(str, item["base_name"])

                # Get file stats
                data_stat = data_file.stat()

                # Parse metadata
                metadata = parse_sigmf_metadata(str(meta_file))

                # Check if recording is in progress (extracted by parse_sigmf_metadata)
                is_recording_in_progress = metadata.get("recording_in_progress", False)

                # Check for waterfall snapshot
                snapshot_file = recordings_dir / f"{base_name}.png"
                snapshot_info = None
                if snapshot_file.exists():
                    width, height = get_image_dimensions(str(snapshot_file))
                    snapshot_info = {
                        "filename": snapshot_file.name,
                        "url": f"/recordings/{snapshot_file.name}",
                        "width": width,
                        "height": height,
                    }

                recording = {
                    "name": base_name,
                    "data_file": data_file.name,
                    "meta_file": meta_file.name,
                    "data_size": data_stat.st_size,
                    "created": datetime.fromtimestamp(data_stat.st_ctime, timezone.utc).isoformat(),
                    "modified": datetime.fromtimestamp(
                        data_stat.st_mtime, timezone.utc
                    ).isoformat(),
                    "metadata": metadata,
                    "snapshot": snapshot_info,
                    "recording_in_progress": is_recording_in_progress,
                    "download_urls": {
                        "data": f"/recordings/{data_file.name}",
                        "meta": f"/recordings/{meta_file.name}",
                    },
                }
                recordings.append(recording)

        elif cmd == "get-recording-details":
            logger.info(f"Getting recording details for: {data}")
            recording_name = data.get("name")

            if not recording_name:
                return {"success": False, "error": "Recording name not provided"}

            # Validate recording name (security check)
            if ".." in recording_name or "/" in recording_name or "\\" in recording_name:
                return {"success": False, "error": "Invalid recording name"}

            data_file = recordings_dir / f"{recording_name}.sigmf-data"
            meta_file = recordings_dir / f"{recording_name}.sigmf-meta"

            if not data_file.exists() or not meta_file.exists():
                return {"success": False, "error": "Recording not found"}

            # Get file stats
            data_stat = data_file.stat()

            # Parse metadata
            metadata = parse_sigmf_metadata(str(meta_file))

            # Check if recording is in progress (extracted by parse_sigmf_metadata)
            is_recording_in_progress = metadata.get("recording_in_progress", False)

            # Check for waterfall snapshot
            snapshot_file = recordings_dir / f"{recording_name}.png"
            snapshot_info = None
            if snapshot_file.exists():
                width, height = get_image_dimensions(str(snapshot_file))
                snapshot_info = {
                    "filename": snapshot_file.name,
                    "url": f"/recordings/{snapshot_file.name}",
                    "width": width,
                    "height": height,
                }

            recording = {
                "name": recording_name,
                "data_file": data_file.name,
                "meta_file": meta_file.name,
                "data_size": data_stat.st_size,
                "created": datetime.fromtimestamp(data_stat.st_ctime, timezone.utc).isoformat(),
                "modified": datetime.fromtimestamp(data_stat.st_mtime, timezone.utc).isoformat(),
                "metadata": metadata,
                "snapshot": snapshot_info,
                "recording_in_progress": is_recording_in_progress,
                "download_urls": {
                    "data": f"/recordings/{data_file.name}",
                    "meta": f"/recordings/{meta_file.name}",
                },
            }

        elif cmd == "delete-recording":
            logger.info(f"Deleting recording: {data}")
            recording_name = data.get("name")

            if not recording_name:
                return {"success": False, "error": "Recording name not provided"}

            # Validate recording name (security check)
            if ".." in recording_name or "/" in recording_name or "\\" in recording_name:
                return {"success": False, "error": "Invalid recording name"}

            data_file = recordings_dir / f"{recording_name}.sigmf-data"
            meta_file = recordings_dir / f"{recording_name}.sigmf-meta"
            snapshot_file = recordings_dir / f"{recording_name}.png"

            deleted_files = []

            # Delete data file
            if data_file.exists():
                data_file.unlink()
                deleted_files.append(data_file.name)

            # Delete metadata file
            if meta_file.exists():
                meta_file.unlink()
                deleted_files.append(meta_file.name)

            # Delete snapshot file if it exists
            if snapshot_file.exists():
                snapshot_file.unlink()
                deleted_files.append(snapshot_file.name)

            if not deleted_files:
                await emit_file_browser_error(
                    sio, "Recording not found", "delete-recording", logger
                )
                return

            logger.info(f"Deleted recording: {recording_name}")

            # Emit state update with delete action
            await emit_file_browser_state(
                sio,
                {
                    "action": "delete-recording",
                    "name": recording_name,
                    "deleted_files": deleted_files,
                    "message": f"Deleted {len(deleted_files)} file(s)",
                },
                logger,
            )

        elif cmd == "list-snapshots":
            # Extract pagination parameters
            page = data.get("page", 1) if data else 1
            page_size = data.get("pageSize", 20) if data else 20

            logger.info(f"Listing waterfall snapshots (page {page}, size {page_size})")
            snapshots = []

            # Ensure directory exists
            if not snapshots_dir.exists():
                return {
                    "success": True,
                    "data": {"items": [], "total": 0, "page": page, "pageSize": page_size},
                }

            # Find all PNG files
            png_files = list(snapshots_dir.glob("*.png"))

            # Build list with basic info for sorting
            snapshot_items = []
            for png_file in png_files:
                file_stat = png_file.stat()
                snapshot_items.append(
                    {
                        "png_file": png_file,
                        "modified": file_stat.st_mtime,
                    }
                )

            # Sort by modified time (newest first)
            snapshot_items.sort(key=lambda x: cast(float, x["modified"]), reverse=True)

            # Calculate pagination
            total = len(snapshot_items)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size

            # Only process items for current page
            for item in snapshot_items[start_idx:end_idx]:
                png_file = cast(Path, item["png_file"])
                file_stat = png_file.stat()

                # Try to get image dimensions
                width, height = get_image_dimensions(str(png_file))

                snapshot = {
                    "name": png_file.stem,
                    "filename": png_file.name,
                    "size": file_stat.st_size,
                    "created": datetime.fromtimestamp(file_stat.st_ctime, timezone.utc).isoformat(),
                    "modified": datetime.fromtimestamp(
                        file_stat.st_mtime, timezone.utc
                    ).isoformat(),
                    "width": width,
                    "height": height,
                    "url": f"/snapshots/{png_file.name}",
                }
                snapshots.append(snapshot)

        elif cmd == "delete-snapshot":
            logger.info(f"Deleting snapshot: {data}")
            snapshot_filename = data.get("filename")

            if not snapshot_filename:
                return {"success": False, "error": "Snapshot filename not provided"}

            # Validate filename (security check)
            if ".." in snapshot_filename or "/" in snapshot_filename or "\\" in snapshot_filename:
                return {"success": False, "error": "Invalid snapshot filename"}

            if not snapshot_filename.endswith(".png"):
                return {"success": False, "error": "Only PNG files can be deleted"}

            snapshot_file = snapshots_dir / snapshot_filename

            if not snapshot_file.exists():
                return {"success": False, "error": "Snapshot not found"}

            snapshot_file.unlink()
            logger.info(f"Deleted snapshot: {snapshot_filename}")

            # Emit state update with delete action
            await emit_file_browser_state(
                sio,
                {
                    "action": "delete-snapshot",
                    "filename": snapshot_filename,
                    "message": f"Deleted snapshot: {snapshot_filename}",
                },
                logger,
            )

        else:
            logger.warning(f"Unknown file browser command: {cmd}")
            await emit_file_browser_error(sio, f"Unknown command: {cmd}", cmd, logger)

    except Exception as e:
        logger.error(f"Error handling file browser command '{cmd}': {str(e)}")
        logger.exception(e)
        await emit_file_browser_error(sio, str(e), cmd, logger)
