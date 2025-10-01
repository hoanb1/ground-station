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
Unit tests for preference and map settings CRUD operations.
"""

import pytest
import uuid
from crud.preferences import (
    fetch_preference,
    fetch_preference_for_userid,
    add_preference,
    edit_preference,
    set_preferences,
    delete_preference,
    set_map_settings,
    get_map_settings
)
from crud.users import add_user


@pytest.mark.asyncio
class TestPreferencesCRUD:
    """Test suite for preference CRUD operations."""

    async def test_add_preference_success(self, db_session):
        """Test successful preference creation."""
        # Create a user first
        user_result = await add_user(db_session, {
            "email": "user@example.com",
            "password": "pass123",
            "fullname": "Test User",
            "status": "active"
        })
        user_id = user_result["data"]["id"]

        preference_data = {
            "userid": user_id,
            "name": "theme",
            "value": "dark"
        }

        result = await add_preference(db_session, preference_data)

        assert result["success"] is True
        assert result["error"] is None
        assert result["data"]["name"] == "theme"
        assert result["data"]["value"] == "dark"
        assert result["data"]["userid"] == user_id
        assert "id" in result["data"]
        assert "added" in result["data"]

    async def test_add_preference_without_userid(self, db_session):
        """Test creating global preference (no userid)."""
        preference_data = {
            "userid": None,
            "name": "system_theme",
            "value": "light"
        }

        result = await add_preference(db_session, preference_data)

        assert result["success"] is True
        assert result["data"]["userid"] is None

    async def test_fetch_preference_by_id(self, db_session):
        """Test fetching a single preference by ID."""
        user_result = await add_user(db_session, {
            "email": "user@example.com",
            "password": "pass123",
            "fullname": "Test User",
            "status": "active"
        })

        add_result = await add_preference(db_session, {
            "userid": user_result["data"]["id"],
            "name": "language",
            "value": "en_US"
        })

        preference_id = add_result["data"]["id"]
        result = await fetch_preference(db_session, preference_id)

        assert result["success"] is True
        assert result["data"]["id"] == preference_id
        assert result["data"]["name"] == "language"

    async def test_fetch_preference_not_found(self, db_session):
        """Test fetching non-existent preference."""
        fake_id = uuid.uuid4()
        result = await fetch_preference(db_session, fake_id)

        assert result["success"] is True
        assert result["data"] is None

    async def test_fetch_preferences_for_user_with_defaults(self, db_session):
        """Test fetching preferences with default values."""
        user_result = await add_user(db_session, {
            "email": "user@example.com",
            "password": "pass123",
            "fullname": "Test User",
            "status": "active"
        })
        user_id = user_result["data"]["id"]

        # Add only one preference
        await add_preference(db_session, {
            "userid": user_id,
            "name": "theme",
            "value": "dark"
        })

        result = await fetch_preference_for_userid(db_session, user_id)

        assert result["success"] is True
        assert len(result["data"]) == 5  # Should return all 5 defaults

        # Find the theme preference
        theme_pref = next(p for p in result["data"] if p["name"] == "theme")
        assert theme_pref["value"] == "dark"  # User's value

        # Check default value is used for unset preference
        timezone_pref = next(p for p in result["data"] if p["name"] == "timezone")
        assert timezone_pref["value"] == "Europe/Athens"  # Default value

    async def test_fetch_preferences_without_userid(self, db_session):
        """Test fetching global preferences."""
        # Add global preference
        await add_preference(db_session, {
            "userid": None,
            "name": "timezone",
            "value": "UTC"
        })

        result = await fetch_preference_for_userid(db_session, user_id=None)

        assert result["success"] is True
        assert len(result["data"]) == 5  # Should return defaults

        # Check if our custom value is returned
        timezone_pref = next(p for p in result["data"] if p["name"] == "timezone")
        assert timezone_pref["value"] == "UTC"

    async def test_edit_preference_success(self, db_session):
        """Test successful preference editing."""
        user_result = await add_user(db_session, {
            "email": "user@example.com",
            "password": "pass123",
            "fullname": "Test User",
            "status": "active"
        })

        add_result = await add_preference(db_session, {
            "userid": user_result["data"]["id"],
            "name": "theme",
            "value": "dark"
        })

        preference_id = add_result["data"]["id"]

        edit_data = {
            "id": preference_id,
            "value": "light"
        }

        result = await edit_preference(db_session, edit_data)

        assert result["success"] is True
        assert result["data"]["value"] == "light"
        assert result["data"]["name"] == "theme"  # Unchanged

    async def test_edit_preference_missing_id(self, db_session):
        """Test editing without preference ID."""
        edit_data = {
            "value": "new_value"
        }

        result = await edit_preference(db_session, edit_data)

        assert result["success"] is False
        assert "cannot be empty" in result["error"]

    async def test_edit_preference_not_found(self, db_session):
        """Test editing non-existent preference."""
        fake_id = uuid.uuid4()
        edit_data = {
            "id": fake_id,
            "value": "new_value"
        }

        result = await edit_preference(db_session, edit_data)

        assert result["success"] is False
        assert "not found" in result["error"]

    async def test_set_preferences_upsert_new(self, db_session):
        """Test set_preferences creates new preferences."""
        user_result = await add_user(db_session, {
            "email": "user@example.com",
            "password": "pass123",
            "fullname": "Test User",
            "status": "active"
        })
        user_id = user_result["data"]["id"]

        preferences = [
            {"userid": user_id, "name": "theme", "value": "dark"},
            {"userid": user_id, "name": "language", "value": "en_US"}
        ]

        result = await set_preferences(db_session, preferences)

        assert result["success"] is True
        assert len(result["data"]) == 2

    async def test_set_preferences_update_existing(self, db_session):
        """Test set_preferences updates existing preferences."""
        user_result = await add_user(db_session, {
            "email": "user@example.com",
            "password": "pass123",
            "fullname": "Test User",
            "status": "active"
        })
        user_id = user_result["data"]["id"]

        # Create initial preference
        add_result = await add_preference(db_session, {
            "userid": user_id,
            "name": "theme",
            "value": "dark"
        })

        preference_id = add_result["data"]["id"]

        # Update via set_preferences
        preferences = [
            {"id": preference_id, "userid": user_id, "name": "theme", "value": "light", "added": "2020-01-01"}
        ]

        result = await set_preferences(db_session, preferences)

        assert result["success"] is True
        assert result["data"][0]["value"] == "light"
        assert result["data"][0]["id"] == preference_id

    async def test_set_preferences_mixed_operations(self, db_session):
        """Test set_preferences with mix of new and existing."""
        user_result = await add_user(db_session, {
            "email": "user@example.com",
            "password": "pass123",
            "fullname": "Test User",
            "status": "active"
        })
        user_id = user_result["data"]["id"]

        # Create one preference
        existing = await add_preference(db_session, {
            "userid": user_id,
            "name": "theme",
            "value": "dark"
        })

        preferences = [
            {"id": existing["data"]["id"], "userid": user_id, "name": "theme", "value": "light", "added": "2020-01-01"},
            {"userid": user_id, "name": "language", "value": "fr_FR"}
        ]

        result = await set_preferences(db_session, preferences)

        assert result["success"] is True
        assert len(result["data"]) == 2

    async def test_delete_preference_success(self, db_session):
        """Test successful preference deletion."""
        user_result = await add_user(db_session, {
            "email": "user@example.com",
            "password": "pass123",
            "fullname": "Test User",
            "status": "active"
        })

        add_result = await add_preference(db_session, {
            "userid": user_result["data"]["id"],
            "name": "theme",
            "value": "dark"
        })

        preference_id = add_result["data"]["id"]
        result = await delete_preference(db_session, preference_id)

        assert result["success"] is True

        # Verify deletion
        fetch_result = await fetch_preference(db_session, preference_id)
        assert fetch_result["data"] is None

    async def test_delete_preference_not_found(self, db_session):
        """Test deleting non-existent preference."""
        fake_id = uuid.uuid4()
        result = await delete_preference(db_session, fake_id)

        assert result["success"] is False
        assert "not found" in result["error"]


@pytest.mark.asyncio
class TestMapSettingsCRUD:
    """Test suite for map settings (TrackingState) operations."""

    async def test_set_map_settings_new(self, db_session):
        """Test creating new map settings."""
        settings_data = {
            "name": "satellite-tracking",
            "value": {"zoom": 3, "center": [0, 0]}
        }

        result = await set_map_settings(db_session, settings_data)

        assert result["success"] is True
        assert result["data"]["name"] == "satellite-tracking"
        assert result["data"]["value"]["zoom"] == 3

    async def test_set_map_settings_update_existing(self, db_session):
        """Test updating existing map settings."""
        # Create initial settings
        initial_data = {
            "name": "satellite-tracking",
            "value": {"zoom": 3, "center": [0, 0]}
        }
        await set_map_settings(db_session, initial_data)

        # Update settings
        updated_data = {
            "name": "satellite-tracking",
            "value": {"zoom": 5, "center": [40, -74]}
        }
        result = await set_map_settings(db_session, updated_data)

        assert result["success"] is True
        assert result["data"]["value"]["zoom"] == 5
        assert result["data"]["value"]["center"] == [40, -74]

    async def test_set_map_settings_missing_name(self, db_session):
        """Test setting map settings without name."""
        settings_data = {
            "value": {"zoom": 3}
        }

        result = await set_map_settings(db_session, settings_data)

        assert result["success"] is False
        assert "name is required" in result["error"]

    async def test_set_map_settings_missing_value(self, db_session):
        """Test setting map settings without value."""
        settings_data = {
            "name": "satellite-tracking"
        }

        result = await set_map_settings(db_session, settings_data)

        assert result["success"] is False
        assert "value is required" in result["error"]

    async def test_get_map_settings_existing(self, db_session):
        """Test retrieving existing map settings."""
        # Create settings first
        settings_data = {
            "name": "satellite-tracking",
            "value": {"zoom": 3, "center": [0, 0]}
        }
        await set_map_settings(db_session, settings_data)

        # Retrieve settings
        result = await get_map_settings(db_session, "satellite-tracking")

        assert result["success"] is True
        assert result["data"]["name"] == "satellite-tracking"
        assert result["data"]["value"]["zoom"] == 3

    async def test_get_map_settings_not_found(self, db_session):
        """Test retrieving non-existent map settings."""
        result = await get_map_settings(db_session, "nonexistent")

        assert result["success"] is True
        assert result["data"] == {}

    async def test_map_settings_complex_value(self, db_session):
        """Test map settings with complex nested JSON."""
        complex_data = {
            "name": "advanced-settings",
            "value": {
                "map": {
                    "zoom": 3,
                    "center": [40.7128, -74.0060],
                    "layers": ["satellite", "labels"]
                },
                "filters": {
                    "min_elevation": 10,
                    "max_passes": 5
                }
            }
        }

        result = await set_map_settings(db_session, complex_data)

        assert result["success"] is True
        assert result["data"]["value"]["map"]["layers"] == ["satellite", "labels"]
        assert result["data"]["value"]["filters"]["min_elevation"] == 10

    async def test_map_settings_idempotent_updates(self, db_session):
        """Test that repeated updates with same data work correctly."""
        settings_data = {
            "name": "test-settings",
            "value": {"key": "value1"}
        }

        # First update
        result1 = await set_map_settings(db_session, settings_data)
        assert result1["success"] is True

        # Second update with same data
        result2 = await set_map_settings(db_session, settings_data)
        assert result2["success"] is True
        assert result2["data"]["value"]["key"] == "value1"

        # Third update with different data
        settings_data["value"]["key"] = "value2"
        result3 = await set_map_settings(db_session, settings_data)
        assert result3["success"] is True
        assert result3["data"]["value"]["key"] == "value2"
