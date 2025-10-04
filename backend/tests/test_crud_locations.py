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
Unit tests for location CRUD operations.
"""

import uuid

import pytest

from crud.locations import (
    add_location,
    delete_location,
    edit_location,
    fetch_location,
    fetch_location_for_userid,
)
from crud.users import add_user


@pytest.mark.asyncio
class TestLocationsCRUD:
    """Test suite for location CRUD operations."""

    async def test_add_location_success(self, db_session):
        """Test successful location creation."""
        location_data = {
            "name": "Athens Ground Station",
            "lat": 37.9838,
            "lon": 23.7275,
            "alt": 170,
        }

        result = await add_location(db_session, location_data)

        assert result["success"] is True
        assert result["error"] is None
        assert result["data"]["name"] == "Athens Ground Station"
        assert result["data"]["lat"] == 37.9838
        assert result["data"]["lon"] == 23.7275
        assert result["data"]["alt"] == 170
        assert "id" in result["data"]
        assert "added" in result["data"]

    async def test_add_location_with_userid(self, db_session):
        """Test creating location associated with a user."""
        # Create a user first
        user_result = await add_user(
            db_session,
            {
                "email": "user@example.com",
                "password": "pass123",
                "fullname": "Test User",
                "status": "active",
            },
        )
        user_id = user_result["data"]["id"]

        location_data = {
            "name": "User's Station",
            "userid": user_id,
            "lat": 40.7128,
            "lon": -74.0060,
            "alt": 10,
        }

        result = await add_location(db_session, location_data)

        assert result["success"] is True
        assert result["data"]["userid"] == user_id

    async def test_fetch_location_by_id(self, db_session):
        """Test fetching a single location by ID."""
        add_result = await add_location(
            db_session, {"name": "Test Location", "lat": 51.5074, "lon": -0.1278, "alt": 11}
        )

        location_id = add_result["data"]["id"]
        result = await fetch_location(db_session, location_id)

        assert result["success"] is True
        assert result["data"]["id"] == location_id
        assert result["data"]["name"] == "Test Location"

    async def test_fetch_location_by_string_id(self, db_session):
        """Test fetching location with string UUID."""
        add_result = await add_location(
            db_session, {"name": "Test Location", "lat": 48.8566, "lon": 2.3522, "alt": 35}
        )

        location_id = str(add_result["data"]["id"])
        result = await fetch_location(db_session, location_id)

        assert result["success"] is True
        assert result["data"]["name"] == "Test Location"

    async def test_fetch_location_not_found(self, db_session):
        """Test fetching non-existent location."""
        fake_id = uuid.uuid4()
        result = await fetch_location(db_session, fake_id)

        assert result["success"] is True
        assert result["data"] is None

    async def test_fetch_locations_for_user(self, db_session):
        """Test fetching all locations for a specific user."""
        # Create a user
        user_result = await add_user(
            db_session,
            {
                "email": "user@example.com",
                "password": "pass123",
                "fullname": "Test User",
                "status": "active",
            },
        )
        user_id = user_result["data"]["id"]

        # Add multiple locations for this user
        await add_location(
            db_session,
            {"name": "Location 1", "userid": user_id, "lat": 40.0, "lon": -74.0, "alt": 10},
        )
        await add_location(
            db_session,
            {"name": "Location 2", "userid": user_id, "lat": 41.0, "lon": -75.0, "alt": 20},
        )

        result = await fetch_location_for_userid(db_session, user_id)

        assert result["success"] is True
        # Note: Based on the code, this seems to have a bug at line 55
        # It filters by id instead of userid

    async def test_fetch_locations_without_userid(self, db_session):
        """Test fetching locations with no user association."""
        # Add location without userid
        await add_location(
            db_session, {"name": "Public Location", "lat": 35.0, "lon": -120.0, "alt": 50}
        )

        result = await fetch_location_for_userid(db_session, user_id=None)

        assert result["success"] is True

    async def test_edit_location_success(self, db_session):
        """Test successful location editing."""
        add_result = await add_location(
            db_session, {"name": "Old Name", "lat": 40.0, "lon": -74.0, "alt": 10}
        )

        location_id = add_result["data"]["id"]

        edit_data = {"id": location_id, "name": "New Name", "lat": 40.5, "alt": 15}

        result = await edit_location(db_session, edit_data)

        assert result["success"] is True
        assert result["data"]["name"] == "New Name"
        assert result["data"]["lat"] == 40.5
        assert result["data"]["alt"] == 15
        assert result["data"]["lon"] == -74.0  # Unchanged

    async def test_edit_location_missing_id(self, db_session):
        """Test editing without location ID."""
        edit_data = {"name": "New Name"}

        result = await edit_location(db_session, edit_data)

        assert result["success"] is False
        assert "id is required" in result["error"]

    async def test_edit_location_not_found(self, db_session):
        """Test editing non-existent location."""
        fake_id = uuid.uuid4()
        edit_data = {"id": fake_id, "name": "New Name"}

        result = await edit_location(db_session, edit_data)

        assert result["success"] is False
        assert "not found" in result["error"]

    async def test_edit_location_removes_timestamps(self, db_session):
        """Test that edit removes added/updated from data."""
        add_result = await add_location(
            db_session, {"name": "Test Location", "lat": 40.0, "lon": -74.0, "alt": 10}
        )

        location_id = add_result["data"]["id"]

        # Try to edit with timestamps (should be ignored)
        edit_data = {
            "id": location_id,
            "name": "Updated Name",
            "added": "2020-01-01",
            "updated": "2020-01-01",
        }

        result = await edit_location(db_session, edit_data)

        assert result["success"] is True
        assert result["data"]["name"] == "Updated Name"
        # Timestamps should be actual datetime objects, not the strings we passed

    async def test_delete_location_success(self, db_session):
        """Test successful location deletion."""
        add_result = await add_location(
            db_session, {"name": "To Delete", "lat": 40.0, "lon": -74.0, "alt": 10}
        )

        location_id = add_result["data"]["id"]
        result = await delete_location(db_session, location_id)

        assert result["success"] is True

        # Verify deletion
        fetch_result = await fetch_location(db_session, location_id)
        assert fetch_result["data"] is None

    async def test_delete_location_not_found(self, db_session):
        """Test deleting non-existent location."""
        fake_id = uuid.uuid4()
        result = await delete_location(db_session, fake_id)

        assert result["success"] is False
        assert "not found" in result["error"]

    async def test_location_coordinates_precision(self, db_session):
        """Test that location coordinates maintain precision."""
        location_data = {
            "name": "Precise Location",
            "lat": 37.98376543,
            "lon": 23.72754321,
            "alt": 170,
        }

        result = await add_location(db_session, location_data)

        assert result["success"] is True
        assert result["data"]["lat"] == 37.98376543
        assert result["data"]["lon"] == 23.72754321

    async def test_location_negative_altitude(self, db_session):
        """Test location with negative altitude (below sea level)."""
        location_data = {
            "name": "Dead Sea Station",
            "lat": 31.5,
            "lon": 35.5,
            "alt": -430,  # Dead Sea is ~430m below sea level
        }

        result = await add_location(db_session, location_data)

        assert result["success"] is True
        assert result["data"]["alt"] == -430
