"""Background task scheduler for the ground station."""

from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from common.logger import logger
from db import AsyncSessionLocal
from tlesync.logic import synchronize_satellite_data

# Global scheduler instance
scheduler: Optional[AsyncIOScheduler] = None


async def sync_satellite_data_job(sio):
    """Job wrapper for synchronize_satellite_data that creates its own session."""
    try:
        logger.info("Running scheduled satellite data synchronization...")
        async with AsyncSessionLocal() as session:
            await synchronize_satellite_data(session, logger, sio)
        logger.info("Scheduled satellite data synchronization completed successfully")
    except Exception as e:
        logger.error(f"Error during scheduled satellite synchronization: {e}")
        logger.exception(e)


def start_scheduler(sio):
    """Initialize and start the background task scheduler."""
    global scheduler

    if scheduler is not None:
        logger.warning("Scheduler already started")
        return scheduler

    logger.info("Starting background task scheduler...")
    scheduler = AsyncIOScheduler()

    # Schedule satellite data synchronization every 6 hours
    scheduler.add_job(
        sync_satellite_data_job,
        trigger=IntervalTrigger(hours=6),
        args=[sio],
        id="sync_satellite_data",
        name="Synchronize satellite data",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Background task scheduler started successfully")
    logger.info("Scheduled jobs:")
    for job in scheduler.get_jobs():
        logger.info(f"  - {job.name} (ID: {job.id}, Next run: {job.next_run_time})")

    return scheduler


def stop_scheduler():
    """Stop the background task scheduler."""
    global scheduler

    if scheduler is None:
        return

    logger.info("Stopping background task scheduler...")
    scheduler.shutdown(wait=False)
    scheduler = None
    logger.info("Background task scheduler stopped")
