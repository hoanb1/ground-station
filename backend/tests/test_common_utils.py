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
Tests for common/utils.py utility functions.
"""

import uuid

import pytest

from unittest.mock import patch

from common.utils import convert_strings_to_uuids, is_local_address, get_loopback_optimized_host


class TestConvertStringsToUuids:
    """Test cases for convert_strings_to_uuids function."""

    def test_convert_valid_single_uuid(self):
        """Test converting a single valid UUID string."""
        test_uuid = str(uuid.uuid4())
        result = convert_strings_to_uuids([test_uuid])

        assert len(result) == 1
        assert isinstance(result[0], uuid.UUID)
        assert str(result[0]) == test_uuid

    def test_convert_multiple_valid_uuids(self):
        """Test converting multiple valid UUID strings."""
        test_uuids = [str(uuid.uuid4()) for _ in range(5)]
        result = convert_strings_to_uuids(test_uuids)

        assert len(result) == 5
        assert all(isinstance(u, uuid.UUID) for u in result)
        assert [str(u) for u in result] == test_uuids

    def test_convert_empty_list(self):
        """Test converting an empty list."""
        result = convert_strings_to_uuids([])

        assert result == []
        assert isinstance(result, list)

    def test_convert_with_hyphens(self):
        """Test converting UUID strings with standard hyphen format."""
        test_uuid = "550e8400-e29b-41d4-a716-446655440000"
        result = convert_strings_to_uuids([test_uuid])

        assert len(result) == 1
        assert str(result[0]) == test_uuid

    def test_convert_without_hyphens(self):
        """Test converting UUID strings without hyphens."""
        test_uuid_no_hyphens = "550e8400e29b41d4a716446655440000"
        expected_uuid = "550e8400-e29b-41d4-a716-446655440000"
        result = convert_strings_to_uuids([test_uuid_no_hyphens])

        assert len(result) == 1
        assert str(result[0]) == expected_uuid

    def test_convert_mixed_formats(self):
        """Test converting a mix of UUID string formats."""
        test_uuids = [
            "550e8400-e29b-41d4-a716-446655440000",  # with hyphens
            "550e8400e29b41d4a716446655440001",  # without hyphens
            str(uuid.uuid4()),  # generated
        ]
        result = convert_strings_to_uuids(test_uuids)

        assert len(result) == 3
        assert all(isinstance(u, uuid.UUID) for u in result)

    def test_convert_invalid_uuid_raises_error(self):
        """Test that invalid UUID string raises ValueError."""
        invalid_uuid = "not-a-valid-uuid"

        with pytest.raises(ValueError):
            convert_strings_to_uuids([invalid_uuid])

    def test_convert_invalid_uuid_in_list_raises_error(self):
        """Test that one invalid UUID in a list raises ValueError."""
        test_uuids = [str(uuid.uuid4()), "invalid-uuid", str(uuid.uuid4())]

        with pytest.raises(ValueError):
            convert_strings_to_uuids(test_uuids)

    def test_convert_wrong_length_uuid(self):
        """Test that UUID string with wrong length raises ValueError."""
        invalid_uuid = "550e8400-e29b-41d4-a716"  # Too short

        with pytest.raises(ValueError):
            convert_strings_to_uuids([invalid_uuid])

    def test_convert_preserves_order(self):
        """Test that the order of UUIDs is preserved."""
        test_uuids = [str(uuid.uuid4()) for _ in range(10)]
        result = convert_strings_to_uuids(test_uuids)

        assert [str(u) for u in result] == test_uuids


class TestLocalAddressOptimization:
    """Test cases for local address detection and optimization."""

    def test_is_local_address_standards(self):
        assert is_local_address("127.0.0.1") is True
        assert is_local_address("localhost") is True
        assert is_local_address("localhost ") is True
        assert is_local_address("::1") is True
        assert is_local_address("") is False
        assert is_local_address(None) is False

    @patch("psutil.net_if_addrs")
    @patch("socket.getaddrinfo")
    def test_is_local_address_with_interfaces(self, mock_getaddrinfo, mock_net_if_addrs):
        from unittest.mock import MagicMock
        from common.utils import is_local_address

        # Mock getaddrinfo to return a resolved IP
        mock_getaddrinfo.return_value = [(None, None, None, None, ("192.168.6.15", 0))]

        # Mock psutil.net_if_addrs to simulate local network interfaces
        mock_addr = MagicMock()
        mock_addr.address = "192.168.6.15"
        mock_net_if_addrs.return_value = {"eth0": [mock_addr]}

        assert is_local_address("192.168.6.15") is True
        assert is_local_address("my-local-server.lan") is True

    @patch("psutil.net_if_addrs")
    @patch("socket.getaddrinfo")
    def test_is_local_address_remote(self, mock_getaddrinfo, mock_net_if_addrs):
        from unittest.mock import MagicMock
        from common.utils import is_local_address

        # Mock getaddrinfo to resolve to a remote IP
        mock_getaddrinfo.return_value = [(None, None, None, None, ("8.8.8.8", 0))]

        # Mock psutil.net_if_addrs
        mock_addr = MagicMock()
        mock_addr.address = "192.168.3.63"
        mock_net_if_addrs.return_value = {"eth0": [mock_addr]}

        assert is_local_address("8.8.8.8") is False

    @patch("socket.create_connection")
    @patch("common.utils.is_local_address")
    def test_get_loopback_optimized_host_local_listening(self, mock_is_local, mock_connect):
        from unittest.mock import MagicMock
        from common.utils import get_loopback_optimized_host

        mock_is_local.return_value = True

        # Simulate port is open on loopback
        mock_connect.return_value = MagicMock()

        result = get_loopback_optimized_host("192.168.6.15", 55132)
        assert result == "127.0.0.1"

    @patch("socket.create_connection")
    @patch("common.utils.is_local_address")
    def test_get_loopback_optimized_host_local_not_listening(self, mock_is_local, mock_connect):
        from common.utils import get_loopback_optimized_host

        mock_is_local.return_value = True

        # Simulate port is closed on loopback
        mock_connect.side_effect = Exception("Connection refused")

        result = get_loopback_optimized_host("192.168.6.15", 55132)
        assert result == "192.168.6.15"

    @patch("common.utils.is_local_address")
    def test_get_loopback_optimized_host_remote(self, mock_is_local):
        from common.utils import get_loopback_optimized_host

        mock_is_local.return_value = False

        result = get_loopback_optimized_host("8.8.8.8", 55132)
        assert result == "8.8.8.8"

