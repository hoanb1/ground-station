# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-07-31

### Fixed
- Fixed missing `fetchSatelliteWithTransmitters` import in `MonitoredSatelliteDialog` component (`monitored-satellite-dialog.jsx`) which triggered runtime `ReferenceError` when opening satellite scheduler dialog.
- Expanded task accordions by default in `MonitoredSatelliteDialog` so task configuration fields and transmitter selection dropdowns are immediately visible and interactive.
- Added decoder type validation check in `DecoderConfigSuggestion` (`decoder-config-suggestion.jsx`) to avoid unsupported backend query requests for decoders such as SSTV.
- Scoped `setAvailableTransmitters` action payload in Redux (`target-slice.jsx` & `target-selector-bar.jsx`) with `trackerId` to ensure multi-tracker state synchronization.
- Streamlined `search_satellites` response formatting in backend satellite entity handler (`backend/handlers/entities/satellites.py`).

### Added
- Database indexes for frequently queried foreign keys and parameters to eliminate full table scans in SQLite:
  - `ix_transmitters_norad_cat_id` on the `transmitters` table.
  - `ix_transmitters_norad_follow_id` on the `transmitters` table.
  - `ix_preferences_name` on the `preferences` table.
- Alembic database migration `bfc7e0d92ee6_add_performance_indexes.py` for standard index initialization.
- In-memory cache for satellite transmitters (`_transmitters_by_sat_cache` with write invalidation) to completely bypass SQLite queries during rapid tracking loops.
- Unit tests in `backend/tests/test_crud_transmitters.py` to verify correctness of the transmitter memory-caching logic.

### Fixed
- Fixed a serious file descriptor and disk space leak by wrapping `IQRecorder.run` and `AudioRecorder.run` loops in `try...finally` to guarantee file handles (`.sigmf-data` and `.wav`) are always closed on thread exit.
- Fixed consumer resource leak when stopping the entire SDR process by updating `stop_sdr_process` in `processlifecycle.py` to clean up all active demodulators, recorders, decoders, and transcription workers for all clients.
- Fixed N+1 query patterns in `fetch_satellites_for_group_id` and `search_satellites` by implementing bulk-loading of transmitters and groups.
- Optimized API handlers in `backend/handlers/entities/satellites.py` to leverage bulk loading and remove redundant query loops.
- Redefined conflict detection query logic in `find_any_time_conflict` (`backend/observations/conflicts.py`) by replacing index-inhibiting `func.coalesce` with standard index-friendly `OR` / `AND` queries.

### Performance
- Dramatically reduced CPU/IO spikes and SDR package drops on Celeron/low-end servers during active tracking.
