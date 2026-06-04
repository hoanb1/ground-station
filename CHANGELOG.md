# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-06-04

### Added
- Database indexes for frequently queried foreign keys and parameters to eliminate full table scans in SQLite:
  - `ix_transmitters_norad_cat_id` on the `transmitters` table.
  - `ix_transmitters_norad_follow_id` on the `transmitters` table.
  - `ix_preferences_name` on the `preferences` table.
- Alembic database migration `bfc7e0d92ee6_add_performance_indexes.py` for standard index initialization.
- In-memory cache for satellite transmitters (`_transmitters_by_sat_cache` with write invalidation) to completely bypass SQLite queries during rapid tracking loops.
- Unit tests in `backend/tests/test_crud_transmitters.py` to verify correctness of the transmitter memory-caching logic.

### Fixed
- Fixed N+1 query patterns in `fetch_satellites_for_group_id` and `search_satellites` by implementing bulk-loading of transmitters and groups.
- Optimized API handlers in `backend/handlers/entities/satellites.py` to leverage bulk loading and remove redundant query loops.
- Redefined conflict detection query logic in `find_any_time_conflict` (`backend/observations/conflicts.py`) by replacing index-inhibiting `func.coalesce` with standard index-friendly `OR` / `AND` queries.

### Performance
- Dramatically reduced CPU/IO spikes and SDR package drops on Celeron/low-end servers during active tracking.
