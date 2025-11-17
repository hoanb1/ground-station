# Ground Station - Audio Broadcaster
# Developed by Claude (Anthropic AI) for the Ground Station project
#
# This module implements a thread-safe pub/sub pattern for audio distribution.
# It receives audio from a single input queue (fed by demodulators) and broadcasts
# to multiple subscribers (playback, transcription, recording, etc.).
#
# Key features:
# - Runs in its own thread for non-blocking operation
# - Multiple independent subscribers with configurable queue sizes
# - Per-subscriber statistics and monitoring
# - Graceful handling of slow consumers (drop messages rather than block)
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

import logging
import queue
import threading
import time
from copy import deepcopy
from typing import Any, Dict

# Configure logging
logger = logging.getLogger("audio-broadcaster")


class AudioBroadcaster(threading.Thread):
    """
    Thread-safe audio broadcaster using pub/sub pattern.

    Receives audio from single input queue and distributes to multiple
    subscriber queues. Each subscriber gets a copy of every audio message.
    """

    def __init__(self, input_queue: queue.Queue):
        """
        Initialize the audio broadcaster.

        Args:
            input_queue: Source queue that receives audio from demodulators
        """
        super().__init__(daemon=True, name="Ground Station - AudioBroadcaster")
        self.input_queue = input_queue
        self.subscribers: Dict[str, dict] = {}
        self.subscribers_lock = threading.Lock()
        self.running = True

        # Statistics
        self.stats: Dict[str, Any] = {
            "messages_received": 0,
            "messages_broadcast": 0,
            "errors": 0,
            "queue_timeouts": 0,
            "last_activity": None,
        }

    def subscribe(self, name: str, maxsize: int = 10) -> queue.Queue:
        """
        Subscribe to audio stream.

        Args:
            name: Subscriber name (e.g., "playback", "transcription")
            maxsize: Maximum queue size for this subscriber

        Returns:
            Queue that will receive audio messages
        """
        subscriber_queue: queue.Queue = queue.Queue(maxsize=maxsize)

        with self.subscribers_lock:
            self.subscribers[name] = {
                "queue": subscriber_queue,
                "maxsize": maxsize,
                "delivered": 0,
                "dropped": 0,
                "errors": 0,
            }

        logger.info(
            f"New subscriber: '{name}' (queue size: {maxsize}, total subscribers: {len(self.subscribers)})"
        )
        return subscriber_queue

    def unsubscribe(self, name: str):
        """
        Unsubscribe from audio stream.

        Args:
            name: Subscriber name to remove
        """
        with self.subscribers_lock:
            if name in self.subscribers:
                del self.subscribers[name]
                logger.info(f"Subscriber removed: '{name}' (remaining: {len(self.subscribers)})")

    def run(self):
        """Main broadcast loop - runs in separate thread"""
        logger.info("Audio broadcaster started")

        while self.running:
            try:

                # Get audio from input queue (blocking with timeout)
                audio_message = self.input_queue.get(timeout=1.0)
                self.stats["messages_received"] += 1
                self.stats["last_activity"] = time.time()

                # Broadcast to all subscribers
                with self.subscribers_lock:
                    for name, subscriber in self.subscribers.items():
                        try:
                            # Create a copy for each subscriber to avoid shared state issues
                            message_copy = deepcopy(audio_message)
                            subscriber["queue"].put_nowait(message_copy)
                            subscriber["delivered"] += 1
                            self.stats["messages_broadcast"] += 1

                        except queue.Full:
                            # Subscriber queue is full - drop message
                            subscriber["dropped"] += 1

                            # Log warning periodically
                            if subscriber["dropped"] % 100 == 0:
                                logger.warning(
                                    f"Subscriber '{name}' queue full - "
                                    f"dropped {subscriber['dropped']} messages total"
                                )

                        except Exception as e:
                            subscriber["errors"] += 1
                            self.stats["errors"] += 1
                            logger.error(f"Error broadcasting to '{name}': {e}")

                # Note: task_done() only exists on queue.Queue (threading), not multiprocessing.Queue
                # If input_queue is a threading queue, mark task as done for join() support
                if hasattr(self.input_queue, "task_done"):
                    self.input_queue.task_done()

            except queue.Empty:
                # No data available - continue waiting
                self.stats["queue_timeouts"] += 1
                continue

            except Exception as e:
                logger.error(f"Broadcaster error: {e}")
                self.stats["errors"] += 1

        logger.info("Audio broadcaster stopped")

    def stop(self):
        """Stop the broadcaster thread"""
        logger.info("Stopping audio broadcaster...")
        self.running = False

    def get_stats(self) -> dict:
        """
        Get broadcaster statistics.

        Returns:
            Dictionary with overall stats and per-subscriber stats
        """
        with self.subscribers_lock:
            subscriber_stats = {
                name: {
                    "delivered": sub["delivered"],
                    "dropped": sub["dropped"],
                    "errors": sub["errors"],
                    "maxsize": sub["maxsize"],
                }
                for name, sub in self.subscribers.items()
            }

        return {
            "overall": self.stats.copy(),
            "subscribers": subscriber_stats,
            "active_subscribers": len(self.subscribers),
        }

    def log_stats(self):
        """Log current statistics"""
        stats = self.get_stats()
        logger.info(
            f"Broadcaster stats: "
            f"received={stats['overall']['messages_received']}, "
            f"broadcast={stats['overall']['messages_broadcast']}, "
            f"errors={stats['overall']['errors']}, "
            f"subscribers={stats['active_subscribers']}"
        )

        for name, sub_stats in stats["subscribers"].items():
            logger.info(
                f"  {name}: delivered={sub_stats['delivered']}, "
                f"dropped={sub_stats['dropped']}, errors={sub_stats['errors']}"
            )
