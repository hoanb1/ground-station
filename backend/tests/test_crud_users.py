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
Unit tests for user CRUD operations.
"""

import pytest
import uuid
import bcrypt
from crud.users import fetch_users, add_user, edit_user, delete_user


@pytest.mark.asyncio
class TestUsersCRUD:
    """Test suite for user CRUD operations."""

    async def test_add_user_success(self, db_session):
        """Test successful user creation."""
        user_data = {
            "email": "test@example.com",
            "password": "securepassword123",
            "fullname": "Test User",
            "status": "active"
        }

        result = await add_user(db_session, user_data)

        assert result["success"] is True
        assert result["error"] is None
        assert result["data"]["email"] == "test@example.com"
        assert result["data"]["fullname"] == "Test User"
        assert result["data"]["status"] == "active"
        assert "id" in result["data"]
        assert "added" in result["data"]
        assert "updated" in result["data"]

        # Verify password is hashed
        assert result["data"]["password"] != "securepassword123"
        assert bcrypt.checkpw(
            "securepassword123".encode('utf-8'),
            result["data"]["password"].encode('utf-8')
        )

    async def test_add_user_missing_email(self, db_session):
        """Test user creation fails without email."""
        user_data = {
            "password": "securepassword123",
            "fullname": "Test User",
            "status": "active"
        }

        result = await add_user(db_session, user_data)

        assert result["success"] is False
        assert "Email cannot be empty" in result["error"]

    async def test_add_user_missing_password(self, db_session):
        """Test user creation fails without password."""
        user_data = {
            "email": "test@example.com",
            "fullname": "Test User",
            "status": "active"
        }

        result = await add_user(db_session, user_data)

        assert result["success"] is False
        assert "Password cannot be empty" in result["error"]

    async def test_add_user_invalid_status(self, db_session):
        """Test user creation fails with invalid status."""
        user_data = {
            "email": "test@example.com",
            "password": "securepassword123",
            "fullname": "Test User",
            "status": "invalid_status"
        }

        result = await add_user(db_session, user_data)

        assert result["success"] is False
        assert "Status must be active or inactive" in result["error"]

    async def test_fetch_users_all(self, db_session):
        """Test fetching all users."""
        # Add two users
        await add_user(db_session, {
            "email": "user1@example.com",
            "password": "pass1",
            "fullname": "User One",
            "status": "active"
        })
        await add_user(db_session, {
            "email": "user2@example.com",
            "password": "pass2",
            "fullname": "User Two",
            "status": "inactive"
        })

        result = await fetch_users(db_session)

        assert result["success"] is True
        assert result["error"] is None
        assert len(result["data"]) == 2
        assert result["data"][0]["email"] == "user1@example.com"
        assert result["data"][1]["email"] == "user2@example.com"

        # Verify passwords are not included by default
        assert result["data"][0]["password"] is None
        assert result["data"][1]["password"] is None

    async def test_fetch_users_by_id(self, db_session):
        """Test fetching a single user by ID."""
        # Add a user
        add_result = await add_user(db_session, {
            "email": "test@example.com",
            "password": "pass123",
            "fullname": "Test User",
            "status": "active"
        })

        user_id = add_result["data"]["id"]

        result = await fetch_users(db_session, user_id=user_id)

        assert result["success"] is True
        assert result["error"] is None
        assert result["data"]["email"] == "test@example.com"
        assert result["data"]["id"] == user_id

    async def test_fetch_users_with_password(self, db_session):
        """Test fetching users with password included."""
        await add_user(db_session, {
            "email": "test@example.com",
            "password": "pass123",
            "fullname": "Test User",
            "status": "active"
        })

        result = await fetch_users(db_session, include_password=True)

        assert result["success"] is True
        assert result["data"][0]["password"] is not None
        assert len(result["data"][0]["password"]) > 0

    async def test_edit_user_success(self, db_session):
        """Test successful user editing."""
        # Add a user
        add_result = await add_user(db_session, {
            "email": "test@example.com",
            "password": "oldpass",
            "fullname": "Old Name",
            "status": "active"
        })

        user_id = add_result["data"]["id"]

        # Edit the user
        edit_data = {
            "id": user_id,
            "fullname": "New Name",
            "status": "inactive"
        }

        result = await edit_user(db_session, edit_data)

        assert result["success"] is True
        assert result["error"] is None
        assert result["data"]["fullname"] == "New Name"
        assert result["data"]["status"] == "inactive"
        assert result["data"]["email"] == "test@example.com"  # unchanged

    async def test_edit_user_password(self, db_session):
        """Test editing user password."""
        # Add a user
        add_result = await add_user(db_session, {
            "email": "test@example.com",
            "password": "oldpass",
            "fullname": "Test User",
            "status": "active"
        })

        user_id = add_result["data"]["id"]

        # Change password
        edit_data = {
            "id": user_id,
            "password": "newpass123"
        }

        result = await edit_user(db_session, edit_data)

        assert result["success"] is True

        # Verify new password works
        fetch_result = await fetch_users(db_session, user_id=user_id, include_password=True)
        new_hash = fetch_result["data"]["password"]
        assert bcrypt.checkpw("newpass123".encode('utf-8'), new_hash.encode('utf-8'))

    async def test_edit_user_not_found(self, db_session):
        """Test editing non-existent user."""
        fake_id = uuid.uuid4()
        edit_data = {
            "id": fake_id,
            "fullname": "New Name"
        }

        result = await edit_user(db_session, edit_data)

        assert result["success"] is False
        assert "not found" in result["error"]

    async def test_edit_user_missing_id(self, db_session):
        """Test editing without user ID."""
        edit_data = {
            "fullname": "New Name"
        }

        result = await edit_user(db_session, edit_data)

        assert result["success"] is False
        assert "User id cannot be empty" in result["error"]

    async def test_delete_user_success(self, db_session):
        """Test successful user deletion."""
        # Add a user
        add_result = await add_user(db_session, {
            "email": "test@example.com",
            "password": "pass123",
            "fullname": "Test User",
            "status": "active"
        })

        user_id = add_result["data"]["id"]

        # Delete the user
        result = await delete_user(db_session, [user_id])

        assert result["success"] is True
        assert result["error"] is None

        # Verify user is deleted
        fetch_result = await fetch_users(db_session, user_id=user_id)
        assert fetch_result["data"] is None

    async def test_delete_multiple_users(self, db_session):
        """Test deleting multiple users at once."""
        # Add two users
        user1 = await add_user(db_session, {
            "email": "user1@example.com",
            "password": "pass1",
            "fullname": "User One",
            "status": "active"
        })
        user2 = await add_user(db_session, {
            "email": "user2@example.com",
            "password": "pass2",
            "fullname": "User Two",
            "status": "active"
        })

        user_ids = [user1["data"]["id"], user2["data"]["id"]]

        # Delete both
        result = await delete_user(db_session, user_ids)

        assert result["success"] is True

        # Verify both are deleted
        fetch_result = await fetch_users(db_session)
        assert len(fetch_result["data"]) == 0

    async def test_delete_user_not_found(self, db_session):
        """Test deleting non-existent user."""
        fake_id = uuid.uuid4()

        result = await delete_user(db_session, [fake_id])

        assert result["success"] is False
        assert "No users found" in result["error"]
