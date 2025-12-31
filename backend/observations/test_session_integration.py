"""
Test script for internal session integration.

This script tests that SessionTracker and SessionService properly handle
internal observation sessions.
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from session.tracker import session_tracker  # noqa: E402


def test_internal_session_integration():
    """Test internal session registration and tracking."""
    print("=" * 60)
    print("Testing Internal Session Integration")
    print("=" * 60)

    obs_id = "test-obs-123"

    # Test 1: Register internal session
    print("\n1. Registering internal session...")
    session_id = session_tracker.register_internal_session(
        observation_id=obs_id,
        sdr_id="test-sdr-1",
        vfo_number=1,
        metadata={"norad_id": 25544, "transmitter_id": "iss-voice"},
    )
    print(f"   ✓ Created session: {session_id}")

    # Test 2: Check if session is internal
    print("\n2. Checking session type...")
    is_internal = session_tracker.is_internal_session(session_id)
    print(f"   ✓ Is internal: {is_internal}")
    assert is_internal, "Session should be marked as internal"

    # Test 3: Check metadata
    print("\n3. Checking metadata...")
    metadata = session_tracker.get_session_metadata(session_id)
    print(f"   ✓ Metadata: {metadata}")
    assert metadata["origin"] == "internal", "Origin should be 'internal'"
    assert (
        "ObservationScheduler" in metadata["user_agent"]
    ), "User agent should contain ObservationScheduler"

    # Test 4: Check SDR mapping
    print("\n4. Checking SDR mapping...")
    sdr_id = session_tracker.get_session_sdr(session_id)
    print(f"   ✓ SDR ID: {sdr_id}")
    assert sdr_id == "test-sdr-1", "SDR ID should match"

    # Test 5: Check VFO mapping
    print("\n5. Checking VFO mapping...")
    vfo_num = session_tracker.get_session_vfo_int(session_id)
    print(f"   ✓ VFO number: {vfo_num}")
    assert vfo_num == 1, "VFO should be 1"

    # Test 6: List internal sessions
    print("\n6. Listing internal sessions...")
    internal_sessions = session_tracker.get_all_internal_sessions()
    print(f"   ✓ Internal sessions: {internal_sessions}")
    assert session_id in internal_sessions, "Session should be in internal sessions list"

    # Test 7: List user sessions
    print("\n7. Listing user sessions...")
    user_sessions = session_tracker.get_all_user_sessions()
    print(f"   ✓ User sessions: {user_sessions}")
    assert session_id not in user_sessions, "Session should NOT be in user sessions list"

    # Test 8: Count internal sessions
    print("\n8. Counting internal sessions...")
    count = session_tracker.get_internal_session_count()
    print(f"   ✓ Internal session count: {count}")
    assert count >= 1, "Should have at least 1 internal session"

    # Test 9: Unregister internal session
    print("\n9. Unregistering internal session...")
    result = session_tracker.unregister_internal_session(obs_id)
    print(f"   ✓ Unregister result: {result}")
    assert result, "Unregister should return True"

    # Test 10: Verify session is gone
    print("\n10. Verifying session cleanup...")
    is_internal = session_tracker.is_internal_session(session_id)
    print(f"    ✓ Is internal after cleanup: {is_internal}")
    assert not is_internal, "Session should no longer be marked as internal"

    internal_sessions = session_tracker.get_all_internal_sessions()
    print(f"    ✓ Internal sessions after cleanup: {internal_sessions}")
    assert session_id not in internal_sessions, "Session should not be in internal sessions list"

    print("\n" + "=" * 60)
    print("✅ All tests passed!")
    print("=" * 60)


if __name__ == "__main__":
    test_internal_session_integration()
