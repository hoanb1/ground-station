# Ground Station - Shared Memory Cleanup Utility
# Developed by Claude (Anthropic AI) for the Ground Station project
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
#
# Utility to clean up orphaned shared memory segments created by GNU Radio.
#
# GNU Radio creates shared memory segments for circular buffers between blocks.
# Even with proper cleanup (tb.stop(), disconnect_all(), del), these segments
# can persist in the kernel, eventually hitting the system limit (shmmni).
#
# This utility runs a background thread that periodically removes orphaned
# segments (those with nattch=0, meaning no processes are attached).

import logging
import subprocess
import threading
import time

logger = logging.getLogger("shm_cleanup")


class SharedMemoryCleanup:
    """Background thread that periodically cleans up orphaned shared memory segments."""

    def __init__(self, cleanup_interval=30):
        """
        Initialize the cleanup thread.

        Args:
            cleanup_interval: Seconds between cleanup runs (default: 30)
        """
        self.cleanup_interval = cleanup_interval
        self.running = False
        self.thread = None
        self._cleanup_count = 0
        self._last_segment_count = 0

    def start(self):
        """Start the cleanup thread."""
        if self.running:
            logger.warning("Cleanup thread already running")
            return

        self.running = True
        self.thread = threading.Thread(target=self._cleanup_loop, daemon=True, name="SHM-Cleanup")
        self.thread.start()
        logger.info(f"Started shared memory cleanup thread (interval: {self.cleanup_interval}s)")

    def stop(self):
        """Stop the cleanup thread."""
        if not self.running:
            return

        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=5)
        logger.info(
            f"Stopped shared memory cleanup thread (cleaned {self._cleanup_count} segments total)"
        )

    def _cleanup_loop(self):
        """Main cleanup loop."""
        while self.running:
            try:
                cleaned = self._cleanup_orphaned_segments()
                if cleaned > 0:
                    self._cleanup_count += cleaned
                    logger.info(
                        f"Cleaned {cleaned} orphaned shared memory segments (total: {self._cleanup_count})"
                    )

                # Log current segment usage periodically
                segment_count = self._get_segment_count()
                if segment_count != self._last_segment_count:
                    logger.debug(f"Current shared memory segments: {segment_count}")
                    self._last_segment_count = segment_count

            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")

            # Sleep in short intervals to allow quick shutdown
            for _ in range(self.cleanup_interval * 2):
                if not self.running:
                    break
                time.sleep(0.5)

    def _cleanup_orphaned_segments(self):
        """
        Remove orphaned shared memory segments (nattch=0).

        Returns:
            Number of segments removed
        """
        try:
            # Get list of orphaned segment IDs (column 2, where column 6 nattch==0)
            # Skip first 3 header lines with NR>3
            result = subprocess.run(
                ["sh", "-c", "ipcs -m | awk 'NR>3 && $6==0 {print $2}'"],
                capture_output=True,
                text=True,
                timeout=5,
            )

            if result.returncode != 0:
                logger.error(f"Failed to list shared memory segments: {result.stderr}")
                return 0

            segment_ids = [
                line.strip() for line in result.stdout.strip().split("\n") if line.strip()
            ]

            if not segment_ids:
                return 0

            # Remove each orphaned segment
            removed = 0
            for seg_id in segment_ids:
                try:
                    subprocess.run(
                        ["ipcrm", "-m", seg_id],
                        capture_output=True,
                        timeout=2,
                        check=True,
                    )
                    removed += 1
                except subprocess.CalledProcessError:
                    # Segment may have been removed by another process
                    pass
                except Exception as e:
                    logger.debug(f"Failed to remove segment {seg_id}: {e}")

            return removed

        except Exception as e:
            logger.error(f"Error cleaning orphaned segments: {e}")
            return 0

    def _get_segment_count(self):
        """Get current number of allocated shared memory segments."""
        try:
            result = subprocess.run(
                ["sh", "-c", "ipcs -m -u | grep 'segments allocated' | awk '{print $3}'"],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if result.returncode == 0 and result.stdout.strip():
                return int(result.stdout.strip())
        except Exception:
            pass
        return 0


# Global singleton instance
_cleanup_instance = None
_cleanup_lock = threading.Lock()


def start_cleanup_thread(cleanup_interval=30):
    """
    Start the global shared memory cleanup thread.

    Args:
        cleanup_interval: Seconds between cleanup runs (default: 30)
    """
    global _cleanup_instance

    with _cleanup_lock:
        if _cleanup_instance is None:
            _cleanup_instance = SharedMemoryCleanup(cleanup_interval=cleanup_interval)
            _cleanup_instance.start()
        else:
            logger.debug("Cleanup thread already started")


def stop_cleanup_thread():
    """Stop the global shared memory cleanup thread."""
    global _cleanup_instance

    with _cleanup_lock:
        if _cleanup_instance is not None:
            _cleanup_instance.stop()
            _cleanup_instance = None
