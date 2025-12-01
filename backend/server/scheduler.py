"""Background task scheduler for the ground station."""

import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from common.logger import logger
from db import AsyncSessionLocal
from tlesync.logic import synchronize_satellite_data

# Suppress apscheduler internal INFO logs (only show warnings and errors)
logging.getLogger("apscheduler").setLevel(logging.WARNING)

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


def check_and_restart_decoders_job(process_manager):
    """Job to check decoder health and restart if needed."""
    try:
        restarted = process_manager.decoder_manager.check_and_restart_decoders()
        if restarted > 0:
            logger.info(f"Decoder health check: {restarted} decoder(s) restarted")
    except Exception as e:
        logger.error(f"Error during decoder health check: {e}")
        logger.exception(e)


def start_scheduler(sio, process_manager):
    """Initialize and start the background task scheduler."""
    global scheduler

    if scheduler is not None:
        logger.warning("Scheduler already started")
        return scheduler

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

    # Schedule decoder health check every 60 seconds as a safety net
    # Primary restart mechanism is event-driven via data_queue (immediate response)
    # This is a backup in case message delivery fails
    scheduler.add_job(
        check_and_restart_decoders_job,
        trigger=IntervalTrigger(seconds=60),
        args=[process_manager],
        id="check_restart_decoders",
        name="Check and restart decoders (fallback)",
        replace_existing=True,
    )

    scheduler.start()

    # Consolidated startup log with job details
    jobs = scheduler.get_jobs()
    job_count = len(jobs)
    logger.info(
        f"Background task scheduler started: {job_count} job{'s' if job_count != 1 else ''} scheduled"
    )
    for job in jobs:
        # Format next run time without microseconds for cleaner display
        next_run = (
            job.next_run_time.strftime("%Y-%m-%d %H:%M:%S %Z") if job.next_run_time else "N/A"
        )
        logger.info(f"  - {job.name} → next run: {next_run}")

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
