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

import json
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any, Union

from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from common.common import logger, serialize_object
from db.models import Transmitters

NULL_MARKERS = {"", "-", None}

_transmitters_by_sat_cache = None


def clear_transmitters_cache():
    global _transmitters_by_sat_cache
    _transmitters_by_sat_cache = None


def _is_null_marker(value: Any) -> bool:
    return value in NULL_MARKERS or (isinstance(value, str) and value.strip() in NULL_MARKERS)


def _coerce_required_int(value: Any, field_name: str) -> int:
    if _is_null_marker(value):
        raise ValueError(f"{field_name} is required")
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be an integer") from exc


def _coerce_optional_int(value: Any, field_name: str) -> int | None:
    if _is_null_marker(value):
        return None
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be an integer") from exc


def _coerce_optional_bool(value: Any, field_name: str) -> bool | None:
    if _is_null_marker(value):
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    if isinstance(value, int) and value in {0, 1}:
        return bool(value)
    raise ValueError(f"{field_name} must be a boolean")


def _coerce_optional_str(value: Any) -> str | None:
    if _is_null_marker(value):
        return None
    return str(value)


def _coerce_optional_json(value: Any, field_name: str) -> Any | None:
    if _is_null_marker(value):
        return None
    parsed = value
    for _ in range(4):
        if isinstance(parsed, (dict, list, bool, int, float)) or parsed is None:
            return parsed
        if not isinstance(parsed, str):
            raise ValueError(f"{field_name} must be valid JSON")
        parsed_str = parsed.strip()
        if _is_null_marker(parsed_str):
            return None
        try:
            parsed = json.loads(parsed_str)
            continue
        except json.JSONDecodeError:
            # Handle legacy double-escaped JSON string payloads.
            if parsed_str.startswith('"') and parsed_str.endswith('"'):
                inner = parsed_str[1:-1]
                parsed = inner.replace('\\\\"', '"')
                continue
            raise ValueError(f"{field_name} must be valid JSON")
    raise ValueError(f"{field_name} must be valid JSON")


def _normalize_transmitter_payload(data: dict, for_edit: bool = False) -> dict:
    payload = dict(data)

    payload["norad_cat_id"] = _coerce_required_int(payload.pop("satelliteId", None), "satelliteId")

    optional_int_fields = {
        "uplinkLow": "uplink_low",
        "uplinkHigh": "uplink_high",
        "downlinkLow": "downlink_low",
        "downlinkHigh": "downlink_high",
        "uplinkDrift": "uplink_drift",
        "downlinkDrift": "downlink_drift",
        "baud": "baud",
    }
    for source_key, target_key in optional_int_fields.items():
        if source_key in payload:
            payload[target_key] = _coerce_optional_int(payload.pop(source_key), source_key)
        elif not for_edit:
            payload[target_key] = None

    optional_bool_fields = {"alive": "alive", "invert": "invert"}
    for source_key, target_key in optional_bool_fields.items():
        if source_key in payload:
            payload[target_key] = _coerce_optional_bool(payload[source_key], source_key)
        elif not for_edit:
            payload[target_key] = None

    if "uplinkMode" in payload:
        payload["uplink_mode"] = _coerce_optional_str(payload.pop("uplinkMode"))
    elif not for_edit:
        payload["uplink_mode"] = None

    if "itu_notification" in payload:
        payload["itu_notification"] = _coerce_optional_json(
            payload.get("itu_notification"), "itu_notification"
        )
    elif not for_edit:
        payload["itu_notification"] = None

    return payload


async def fetch_transmitters_for_satellites(session: AsyncSession, norad_ids: list[int]) -> dict:
    """
    Fetch all transmitters for a list of satellite NORAD IDs in a single query.
    Returns a dictionary mapping norad_id -> list of serialized transmitters.
    """
    try:
        if not norad_ids:
            return {"success": True, "data": {}, "error": None}

        global _transmitters_by_sat_cache
        if _transmitters_by_sat_cache is not None:
            # Auto-invalidate in-memory cache if any requested norad_id is not in cache keys
            if any(nid not in _transmitters_by_sat_cache for nid in norad_ids):
                _transmitters_by_sat_cache = None

        if _transmitters_by_sat_cache is not None:
            result_map = {}
            for nid in norad_ids:
                result_map[nid] = _transmitters_by_sat_cache.get(nid, [])
            return {"success": True, "data": result_map, "error": None}

        stmt = select(Transmitters)
        result = await session.execute(stmt)
        all_transmitters = result.scalars().all()

        from collections import defaultdict

        cache_map = defaultdict(list)
        for tx in all_transmitters:
            serialized_tx = serialize_object(tx)
            cache_map[tx.norad_cat_id].append(serialized_tx)
            if tx.norad_follow_id and tx.norad_follow_id != tx.norad_cat_id:
                cache_map[tx.norad_follow_id].append(serialized_tx)

        _transmitters_by_sat_cache = dict(cache_map)

        result_map = {}
        for nid in norad_ids:
            result_map[nid] = _transmitters_by_sat_cache.get(nid, [])
        return {"success": True, "data": result_map, "error": None}

    except Exception as e:
        logger.error(f"Error fetching transmitters bulk: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_transmitters_for_satellite(session: AsyncSession, norad_id: int) -> dict:
    """
    Fetch all transmitter records associated with the given satellite NORAD id.
    Matches by either norad_cat_id or norad_follow_id.
    """
    try:
        global _transmitters_by_sat_cache
        if _transmitters_by_sat_cache is not None:
            return {
                "success": True,
                "data": _transmitters_by_sat_cache.get(norad_id, []),
                "error": None,
            }

        reply = await fetch_transmitters_for_satellites(session, [norad_id])
        if reply.get("success"):
            return {"success": True, "data": reply["data"].get(norad_id, []), "error": None}
        return reply

    except Exception as e:
        logger.error(f"Error fetching transmitters for satellite {norad_id}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def fetch_transmitter(session: AsyncSession, transmitter_id: Union[uuid.UUID, str]) -> dict:
    """
    Fetch a single transmitter record by its UUID or string representation.
    """
    try:
        # Since transmitter.id is a string, convert UUID to string if needed
        if isinstance(transmitter_id, uuid.UUID):
            transmitter_id = str(transmitter_id)

        stmt = select(Transmitters).filter(Transmitters.id == transmitter_id)
        result = await session.execute(stmt)
        transmitter = result.scalar_one_or_none()
        transmitter = serialize_object(transmitter)
        return {"success": True, "data": transmitter, "error": None}

    except Exception as e:
        logger.error(f"Error fetching transmitters by transmitter id {transmitter_id}: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def add_transmitter(session: AsyncSession, data: dict) -> dict:
    """
    Create and add a new transmitter record.
    """
    try:
        data = _normalize_transmitter_payload(data)
        new_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        data["id"] = str(new_id)
        data["added"] = now
        data["updated"] = now

        if _is_null_marker(data.get("source")):
            data["source"] = "manual"

        stmt = insert(Transmitters).values(**data).returning(Transmitters)

        result = await session.execute(stmt)
        await session.commit()
        new_transmitter = result.scalar_one()
        new_transmitter = serialize_object(new_transmitter)
        clear_transmitters_cache()
        return {"success": True, "data": new_transmitter, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error adding transmitter: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def edit_transmitter(session: AsyncSession, data: dict) -> dict:
    """
    Edit an existing transmitter record by updating provided fields.
    """
    try:
        transmitter_id = data.get("id")
        if not transmitter_id:
            return {"success": False, "error": "Transmitter id is required."}

        data = dict(data)
        data.pop("id", None)
        data.pop("added", None)
        data.pop("updated", None)

        data = _normalize_transmitter_payload(data, for_edit=True)

        # Ensure the record exists first
        stmt = select(Transmitters).filter(Transmitters.id == transmitter_id)
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()
        if not existing:
            return {"success": False, "error": f"Transmitter with id {transmitter_id} not found."}

        # Add updated timestamp
        data["updated"] = datetime.now(timezone.utc)

        upd_stmt = (
            update(Transmitters)
            .where(Transmitters.id == transmitter_id)
            .values(**data)
            .returning(Transmitters)
        )
        upd_result = await session.execute(upd_stmt)
        await session.commit()
        updated_transmitter = upd_result.scalar_one_or_none()
        updated_transmitter = serialize_object(updated_transmitter)
        clear_transmitters_cache()
        return {"success": True, "data": updated_transmitter, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error editing transmitter: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


async def delete_transmitter(session: AsyncSession, transmitter_id: Union[uuid.UUID, str]) -> dict:
    """
    Delete a transmitter record by its UUID or string representation of UUID.
    """
    try:
        logger.info(transmitter_id)

        del_stmt = (
            delete(Transmitters).where(Transmitters.id == transmitter_id).returning(Transmitters)
        )
        result = await session.execute(del_stmt)
        deleted = result.scalar_one_or_none()
        if not deleted:
            return {"success": False, "error": f"Transmitter with id {transmitter_id} not found."}
        await session.commit()
        clear_transmitters_cache()
        return {"success": True, "data": None, "error": None}

    except Exception as e:
        await session.rollback()
        logger.error(f"Error deleting transmitter: {e}")
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}
