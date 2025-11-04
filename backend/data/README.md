# Data Directory

This directory contains all persistent application data for Ground Station.

## Structure

```
data/
├── db/          # SQLite database files
├── recordings/  # IQ recordings in SigMF format
└── snapshots/   # Waterfall display snapshots
```

## Production Deployment

**Important:** In production (Docker), this entire `data/` directory is mounted as a Docker volume to ensure data persistence across container restarts and updates.

All user data, including:
- Database (satellite TLEs, locations, SDR configurations, etc.)
- IQ recordings
- Waterfall snapshots

...will be stored in this volume and preserved during container lifecycle operations.

## Development

During development, these directories are created automatically on first startup and are excluded from version control via `.gitignore`.
