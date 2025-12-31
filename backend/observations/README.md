# Automated Observation System - Implementation Plan

**Status**: 🚧 Phase 1 Complete (VFO Manager + SessionTracker/Service Extensions)
**Started**: 2025-12-31
**Last Updated**: 2025-12-31
**Target Completion**: TBD

---

## Overview

This directory contains the implementation for the **Automated Observation System** - a programmatic satellite observation scheduler that can automatically execute scheduled passes without user intervention.

### Goal
Enable the ground station to autonomously:
1. Schedule satellite passes based on prediction algorithms
2. Configure SDR, demodulators, and decoders programmatically
3. Execute observations at AOS (Acquisition of Signal) time
4. Record IQ/audio and decode telemetry
5. Stop and cleanup at LOS (Loss of Signal) time
6. Store results for later analysis

---

## Architecture

### Current System (User-Driven)
```
User → UI → WebSocket → Backend → ProcessManager → SDR/Decoders
                          ↓
                       VFOManager (per user session)
```

### New System (Automated)
```
Scheduler → ObservationScheduler → ProcessManager → SDR/Decoders
                ↓                       ↓
         APScheduler              VFOManager (internal sessions)
         (cron-like)
```

---

## Key Components

### 1. **VFOManager Extensions** ✅ COMPLETE
**Location**: `backend/vfos/state.py`
**Status**: Implemented (2025-12-31)

**Purpose**: Support internal/automated observation VFOs that don't conflict with user sessions.

**Key Design**:
- **Namespace separation**: Internal sessions use `"internal:<observation_id>"` prefix
- **Singleton pattern**: All VFOManager instances share state
- **IQ stream embedding**: VFO state embedded in IQ messages for decoder processes

**API Added**:
| Method | Purpose |
|--------|---------|
| `make_internal_session_id(obs_id)` | Generate internal session ID |
| `is_internal_session(session_id)` | Check if session is internal |
| `create_internal_vfos(obs_id)` | Initialize VFOs for observation |
| `configure_internal_vfo(...)` | Configure VFO with automation defaults |
| `cleanup_internal_vfos(obs_id)` | Remove VFOs after observation |
| `get_all_internal_sessions()` | List active observations |
| `get_all_user_sessions()` | List user sessions |
| `get_internal_vfo_count()` | Count active observations |

**How It Works**:
```python
# Create isolated VFO set for observation
vfo_mgr = VFOManager()
session_id = vfo_mgr.create_internal_vfos("obs-uuid-123")
# → Returns: "internal:obs-uuid-123"

# Configure VFO for NOAA APT reception
vfo_mgr.configure_internal_vfo(
    observation_id="obs-uuid-123",
    vfo_number=1,
    center_freq=137_620_000,
    bandwidth=40_000,
    modulation="FM",
    decoder="satdump_weather",
    locked_transmitter_id="noaa-18-apt"
)

# VFO state flows: VFOManager → IQBroadcaster → Decoder process
# Decoders extract: iq_message["vfo_states"][vfo_number]
```

---

### 2. **Database Models** 🔴 TODO
**Location**: `backend/db/models.py`
**Status**: Not implemented

**Required Model**:
```python
class Observations(Base):
    __tablename__ = "observations"

    # Identity
    id = Column(UUID, primary_key=True, default=uuid.uuid4)

    # Target
    norad_id = Column(Integer, ForeignKey("satellites.norad_id"))
    transmitter_id = Column(String, ForeignKey("transmitters.id"))

    # Hardware
    sdr_id = Column(UUID, ForeignKey("sdrs.id"))
    location_id = Column(UUID, ForeignKey("locations.id"))
    rotator_id = Column(UUID, ForeignKey("rotators.id"), nullable=True)
    rig_id = Column(UUID, ForeignKey("rigs.id"), nullable=True)

    # Observation window
    aos_time = Column(AwareDateTime, nullable=False)
    los_time = Column(AwareDateTime, nullable=False)
    max_elevation = Column(Float)

    # Configuration (VFO to use: 1-4)
    vfo_number = Column(Integer, default=1)

    # Configuration JSONs
    sdr_config = Column(JSON)      # {center_freq, sample_rate, gain, ...}
    vfo_config = Column(JSON)      # {center_freq, bandwidth, modulation}
    recorder_config = Column(JSON) # {record_iq, record_audio, paths}
    decoder_config = Column(JSON)  # {decoder_type, params}
    tracker_config = Column(JSON)  # {enable_rotator, enable_rig_doppler}

    # Execution state
    status = Column(Enum("scheduled", "running", "completed", "failed", "cancelled"))
    started_at = Column(AwareDateTime, nullable=True)
    completed_at = Column(AwareDateTime, nullable=True)
    error_message = Column(String, nullable=True)

    # Results
    results = Column(JSON)  # {iq_path, audio_path, decoded_path, stats, ...}

    # Timestamps
    added = Column(AwareDateTime, default=datetime.now(timezone.utc))
    updated = Column(AwareDateTime, onupdate=datetime.now(timezone.utc))
```

**CRUD Operations** (`backend/crud/observations.py`):
- `create(session, observation_data)` - Create new observation
- `get(session, observation_id)` - Get observation by ID
- `get_by_status(session, status)` - Get observations by status
- `get_scheduled(session)` - Get upcoming scheduled observations
- `update(session, observation_id, updates)` - Update observation
- `delete(session, observation_id)` - Delete observation

**Migration**:
```bash
# Create Alembic migration
alembic revision --autogenerate -m "Add observations table"
alembic upgrade head
```

---

### 3. **ObservationScheduler Service** 🔴 TODO
**Location**: `backend/observations/scheduler.py`
**Status**: Not implemented

**Purpose**: Orchestrate observation lifecycle (schedule, start, stop, cleanup)

**Core Methods**:
```python
class ObservationScheduler:
    def __init__(self, process_manager, sio, scheduler: AsyncIOScheduler):
        self.process_manager = process_manager
        self.sio = sio
        self.scheduler = scheduler  # APScheduler instance
        self.vfo_manager = VFOManager()

    async def schedule_observation(self, observation_id: str):
        """
        Schedule AOS/LOS jobs with APScheduler

        Creates two jobs:
        - AOS job: _start_observation() at aos_time
        - LOS job: _stop_observation() at los_time
        """

    async def _start_observation(self, observation_id: str):
        """
        Execute at AOS time:
        1. Create internal VFO session
        2. Start SDR process
        3. Configure VFO state
        4. Start tracker (if enabled)
        5. Start decoder (triggers demodulator creation)
        6. Start IQ/audio recorders
        7. Update observation status to "running"
        """

    async def _stop_observation(self, observation_id: str):
        """
        Execute at LOS time:
        1. Stop SDR process (cascade stops all consumers)
        2. Stop tracker
        3. Cleanup internal VFOs
        4. Collect results (scan output directories)
        5. Update observation status to "completed"
        """

    async def auto_schedule_passes(
        self,
        norad_id: int,
        hours: float = 24,
        min_elevation: float = 10
    ):
        """
        Auto-schedule observations for all passes above threshold:
        1. Calculate passes using tracking.passes.calculate_next_events()
        2. For each pass: create Observation record
        3. Schedule with APScheduler
        4. Return list of observation IDs
        """

    async def cancel_observation(self, observation_id: str):
        """
        Cancel a scheduled observation:
        1. Remove APScheduler jobs
        2. If running, stop immediately
        3. Update status to "cancelled"
        """
```

**Integration with Existing Managers**:
- `ProcessManager.start_sdr_process()` - Start SDR
- `ProcessManager.stop_sdr_process()` - Stop SDR (cascade cleanup)
- `DecoderManager.start_decoder()` - Start decoder
- `RecorderManager.start_recorder()` - Record IQ
- `AudioRecorderManager.start_audio_recorder()` - Record audio
- `TranscriptionManager.start_transcription()` - Transcribe (optional)
- `tracking.passes.calculate_next_events()` - Calculate passes
- `tracker.runner.start_tracker_process()` - Start tracker
- `crud.tracking_state.set_tracking_state()` - Update tracker state

---

### 4. **Scheduler Integration** 🔴 TODO
**Location**: `backend/server/scheduler.py`
**Status**: Needs extension

**Current Jobs**:
- ✅ TLE sync (every 6 hours)
- ✅ Decoder health check (every 60 seconds)

**Required Changes**:
```python
def start_scheduler(sio, process_manager):
    """Initialize and start the background task scheduler."""
    global scheduler

    scheduler = AsyncIOScheduler()

    # Existing jobs
    scheduler.add_job(sync_satellite_data_job, ...)
    scheduler.add_job(check_and_restart_decoders_job, ...)

    # NEW: Initialize ObservationScheduler
    from observations.scheduler import ObservationScheduler
    observation_scheduler = ObservationScheduler(
        process_manager=process_manager,
        sio=sio,
        scheduler=scheduler
    )

    # NEW: Optional - Auto-schedule daily
    scheduler.add_job(
        observation_scheduler.auto_schedule_daily,
        trigger=IntervalTrigger(hours=24),
        id="auto_schedule_observations",
        name="Auto-schedule satellite observations"
    )

    scheduler.start()

    return scheduler, observation_scheduler
```

---

---

## Implementation Phases

### ✅ Phase 1: VFO Manager + Session Tracking Extensions (COMPLETE)

#### VFOManager (`vfos/state.py`)
- [x] Add internal session namespace support
- [x] Add create/configure/cleanup methods
- [x] Add query methods (list internal/user sessions)
- [x] Test VFO state embedding in IQ stream

#### SessionTracker (`session/tracker.py`)
- [x] Add `_internal_sessions` set to track internal observations
- [x] Add `register_internal_session()` method
- [x] Add `unregister_internal_session()` method
- [x] Add `is_internal_session()` method
- [x] Add `get_all_internal_sessions()` method
- [x] Add `get_all_user_sessions()` method
- [x] Add `get_internal_session_count()` method
- [x] Update `get_runtime_snapshot()` to include `is_internal` flag

#### SessionService (`session/service.py`)
- [x] Add `register_internal_observation()` method
- [x] Add `cleanup_internal_observation()` method

#### Session Types (`session/session_types.py`)
- [x] Add `is_internal` field to `SessionView` type

#### Testing
- [x] Create integration test script
- [x] Verify all internal session methods work correctly

**Effort**: 5-6 hours total (VFO Manager 2-3h + Session Tracking 3h)
**Completed**: 2025-12-31

**Benefits**:
- ✅ Internal observations visible in runtime snapshots
- ✅ UI can detect and prevent conflicts with automated observations
- ✅ Centralized session management (user + internal)
- ✅ Single cleanup path via SessionService

---

### 🔴 Phase 2: Database Layer (TODO)
- [ ] Create `Observations` model
- [ ] Create Alembic migration
- [ ] Implement CRUD operations (`crud/observations.py`)
- [ ] Test database operations

**Effort**: 3-4 hours
**Blockers**: None

---

### 🔴 Phase 3: ObservationScheduler Service (TODO)
- [ ] Implement core `ObservationScheduler` class
- [ ] Implement `schedule_observation()` method
- [ ] Implement `_start_observation()` method (AOS logic)
- [ ] Implement `_stop_observation()` method (LOS logic)
- [ ] Implement `auto_schedule_passes()` method
- [ ] Add error handling and cleanup
- [ ] Add logging and monitoring

**Effort**: 6-8 hours
**Blockers**: Phase 2 (database)

---

### 🔴 Phase 4: Integration & Testing (TODO)
- [ ] Integrate with `server/scheduler.py`
- [ ] Create test observation
- [ ] Test manual scheduling
- [ ] Test auto-scheduling
- [ ] Test concurrent observations
- [ ] Test error handling (SDR failure, decoder crash, etc.)
- [ ] Test cleanup on cancellation

**Effort**: 4-6 hours
**Blockers**: Phase 3

---

## Total Estimated Effort

| Phase | Effort | Status |
|-------|--------|--------|
| Phase 1: VFO Manager | 2-3 hours | ✅ Complete |
| Phase 2: Database | 3-4 hours | 🔴 TODO |
| Phase 3: ObservationScheduler | 6-8 hours | 🔴 TODO |
| Phase 4: Integration & Testing | 4-6 hours | 🔴 TODO |
| **Total** | **15-21 hours** | |

---

## Dependencies

### ✅ Already Available
- `VFOManager` - VFO state management (now with internal session support)
- `ProcessManager` - SDR process lifecycle
- `DecoderManager` - Protocol decoder management
- `RecorderManager` - IQ recording
- `AudioRecorderManager` - Audio recording
- `TranscriptionManager` - Audio transcription
- `SatelliteTracker` - Real-time tracking with doppler correction
- `tracking.passes` - Pass prediction algorithms
- `APScheduler` - Job scheduling (already installed)
- Database models - Satellites, Transmitters, SDRs, Rotators, Rigs, etc.

### 🔴 To Be Created
- `Observations` database model
- `crud/observations.py` - CRUD operations
- `observations/scheduler.py` - ObservationScheduler service
- Integration glue code

---

## Usage Example (Future)

```python
from observations.scheduler import observation_scheduler

# Auto-schedule next 24 hours of ISS passes
obs_ids = await observation_scheduler.auto_schedule_passes(
    norad_id=25544,  # ISS
    hours=24,
    min_elevation=15  # Only passes above 15° elevation
)

print(f"Scheduled {len(obs_ids)} observations")
# → "Scheduled 3 observations"

# System will automatically:
# 1. Start SDR at AOS time
# 2. Configure VFO and start decoder
# 3. Record IQ/audio
# 4. Track with doppler correction (if enabled)
# 5. Stop everything at LOS time
# 6. Save results to database
```

---

## Design Decisions

### Why Namespace Prefixing?
- **Simple**: Just a string prefix, no complex logic
- **Isolated**: User sessions never see internal sessions
- **Scalable**: Unlimited concurrent observations
- **Debuggable**: `get_all_internal_sessions()` shows what's running

### Why APScheduler?
- **Already installed**: No new dependencies
- **Battle-tested**: Mature, widely-used library
- **Flexible**: Supports cron, interval, and one-time jobs
- **Async support**: Works with FastAPI/asyncio

### Why Backend-Only (No REST API)?
- **Automation focus**: System autonomously schedules and executes
- **Backend-only**: No user interaction needed
- **Scriptable**: Python scripts can trigger scheduling directly

### Why Database Storage?
- **Persistence**: Observations survive restarts
- **History**: Query past observations
- **Analysis**: Track success rates, statistics
- **Conflict detection**: Prevent overlapping observations

---

## Open Questions

1. **Conflict Resolution**: What happens if two observations overlap?
   - Same SDR, different satellites?
   - Different SDRs, same rotator?
   - **Proposed**: First-come-first-served, or priority-based

2. **Error Recovery**: What if observation fails mid-way?
   - SDR crashes during observation
   - Decoder process dies
   - **Proposed**: Mark as "failed", log error, continue with next observation

3. **Resource Limits**: How many concurrent observations?
   - Limited by SDR count
   - Limited by CPU/memory
   - **Proposed**: Configurable limit in settings

4. **Storage Management**: What happens when disk fills up?
   - Auto-delete old observations?
   - Alert user?
   - **Proposed**: Configurable retention policy

5. **Observation Results**: What metadata to store?
   - Signal strength statistics
   - Frame count, error rate
   - Audio quality metrics
   - **Proposed**: Store in `results` JSON field, extensible

---

## References

### Related Files
- `backend/vfos/state.py` - VFO manager (internal session support)
- `backend/processing/processmanager.py` - SDR process orchestration
- `backend/processing/decodermanager.py` - Decoder management
- `backend/processing/recordermanager.py` - IQ recording
- `backend/processing/audiorecordermanager.py` - Audio recording
- `backend/tracker/logic.py` - Satellite tracking
- `backend/tracking/passes.py` - Pass prediction
- `backend/server/scheduler.py` - APScheduler integration
- `backend/db/models.py` - Database models

### External Documentation
- [APScheduler Docs](https://apscheduler.readthedocs.io/)
- [SQLAlchemy ORM](https://docs.sqlalchemy.org/)
- [Alembic Migrations](https://alembic.sqlalchemy.org/)

---

## Changelog

### 2025-12-31 (Phase 1 Complete)
#### VFOManager Extensions
- ✅ Added 8 new methods for internal observation support
- ✅ Added namespace prefixing (`"internal:<obs_id>"`)
- ✅ VFO state flows via IQBroadcaster to decoder processes

#### SessionTracker Extensions
- ✅ Added `_internal_sessions` set to track observations
- ✅ Added 6 new methods for internal session management
- ✅ Updated `get_runtime_snapshot()` to include `is_internal` flag

#### SessionService Extensions
- ✅ Added `register_internal_observation()` method
- ✅ Added `cleanup_internal_observation()` method
- ✅ Integrated with SessionTracker for unified session management

#### Session Types
- ✅ Updated `SessionView` type with `is_internal` field

#### Testing & Documentation
- ✅ Created integration test script (`test_session_integration.py`)
- ✅ All tests passing (10/10)
- ✅ Documented complete implementation plan
- ✅ Created `backend/observations/` directory structure

---

## Next Steps

1. **Immediate**: Implement Phase 2 (Database Layer)
   - Create `Observations` model
   - Create migration
   - Implement CRUD operations

2. **Short-term**: Implement Phase 3 (ObservationScheduler)
   - Core scheduler service
   - AOS/LOS execution logic
   - Auto-scheduling logic

3. **Medium-term**: Integration & Testing
   - End-to-end testing
   - Error handling refinement
   - Production deployment

---

**Document Version**: 1.0
**Last Updated**: 2025-12-31
**Author**: Ground Station Development Team
