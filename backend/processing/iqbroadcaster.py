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


import logging
import queue
import threading
import time
from typing import Any, Dict


class IQBroadcaster(threading.Thread):
    """
    Reads IQ samples from a single source queue (multiprocessing.Queue from SDR worker)
    and broadcasts copies to multiple subscriber queues (one per active demodulator).

    This allows multiple VFOs/demodulators to process the same IQ samples simultaneously
    without gaps, as each gets its own complete copy of the sample stream.

    The broadcaster runs as a daemon thread and will automatically stop when the
    main process exits.
    """

    def __init__(self, source_queue, sdr_id: str):
        """
        Initialize the IQ broadcaster.

        Args:
            source_queue: The multiprocessing.Queue to read IQ samples from (from SDR worker)
            sdr_id: Identifier for this SDR device (used for logging)
        """
        super().__init__(daemon=True, name=f"IQBroadcaster-{sdr_id}")
        self.source_queue = source_queue
        self.sdr_id = sdr_id
        self.subscribers: Dict[str, dict] = {}  # session_id -> {queue, delivered, dropped}
        self.running = True
        self.lock = threading.Lock()
        self.logger = logging.getLogger("iq-broadcaster")

        # Performance monitoring stats
        self.stats: Dict[str, Any] = {
            "messages_in": 0,
            "messages_broadcast": 0,
            "messages_dropped": 0,
            "queue_timeouts": 0,
            "last_activity": None,
            "errors": 0,
        }
        self.stats_lock = threading.Lock()

    def subscribe(self, session_id: str, maxsize: int = 50) -> "queue.Queue[Any]":
        """
        Create a new subscriber queue for a session.

        Args:
            session_id: Session identifier (client session ID)
            maxsize: Maximum size of the subscriber queue (default: 50)
                    If the demodulator can't keep up and the queue fills,
                    new samples will be dropped for that subscriber.

        Returns:
            queue.Queue: A new queue that will receive copies of IQ samples
        """
        with self.lock:
            if session_id not in self.subscribers:
                subscriber_queue: "queue.Queue[Any]" = queue.Queue(maxsize=maxsize)
                self.subscribers[session_id] = {
                    "queue": subscriber_queue,
                    "maxsize": maxsize,
                    "delivered": 0,
                    "dropped": 0,
                }
                self.logger.info(f"Subscribed session {session_id}")
            result: "queue.Queue[Any]" = self.subscribers[session_id]["queue"]
            return result

    def unsubscribe(self, session_id: str):
        """
        Remove a subscriber queue.

        Args:
            session_id: Session identifier to unsubscribe
        """
        with self.lock:
            if session_id in self.subscribers:
                del self.subscribers[session_id]
                self.logger.info(f"Unsubscribed session {session_id}")

    def get_subscriber_count(self) -> int:
        """
        Get the number of active subscribers.

        Returns:
            int: Number of active subscriber queues
        """
        with self.lock:
            return len(self.subscribers)

    def flush_all_queues(self):
        """
        Flush (empty) all subscriber queues.

        This is useful when sample rate changes, since all buffered data
        at the old sample rate becomes invalid.
        """
        with self.lock:
            for session_id, subscriber_info in self.subscribers.items():
                subscriber_queue = subscriber_info["queue"]
                flushed_count = 0
                while not subscriber_queue.empty():
                    try:
                        subscriber_queue.get_nowait()
                        flushed_count += 1
                    except queue.Empty:
                        break
                if flushed_count > 0:
                    self.logger.debug(
                        f"Flushed {flushed_count} items from queue for session {session_id}"
                    )

    def run(self):
        """
        Main broadcaster loop.

        Continuously reads IQ samples from the source queue and broadcasts
        copies to all subscriber queues. If a subscriber's queue is full,
        the sample is dropped for that subscriber only.
        """
        self.logger.info(f"IQ broadcaster started for SDR {self.sdr_id}")

        while self.running:
            try:

                # Get IQ samples from the SDR worker process
                # Use timeout to allow checking self.running periodically
                try:
                    iq_message = self.source_queue.get(timeout=0.1)

                    # Update stats
                    with self.stats_lock:
                        self.stats["messages_in"] += 1
                        self.stats["last_activity"] = time.time()

                except queue.Empty:
                    with self.stats_lock:
                        self.stats["queue_timeouts"] += 1
                    continue

                # Broadcast to all subscribers
                with self.lock:
                    dead_subscribers = []
                    for session_id, subscriber_info in self.subscribers.items():
                        subscriber_queue = subscriber_info["queue"]
                        try:
                            # Non-blocking put - drop sample if queue is full
                            # This prevents slow demodulators from blocking others
                            subscriber_queue.put_nowait(iq_message)
                            subscriber_info["delivered"] += 1
                            with self.stats_lock:
                                self.stats["messages_broadcast"] += 1
                        except queue.Full:
                            # Subscriber can't keep up - drop this sample
                            subscriber_info["dropped"] += 1
                            with self.stats_lock:
                                self.stats["messages_dropped"] += 1
                        except Exception as e:
                            # Mark subscriber for removal if there's an error
                            self.logger.warning(f"Error broadcasting to session {session_id}: {e}")
                            dead_subscribers.append(session_id)

                    # Clean up dead subscribers
                    for session_id in dead_subscribers:
                        del self.subscribers[session_id]
                        self.logger.info(f"Removed dead subscriber {session_id}")

            except Exception as e:
                if self.running:
                    self.logger.error(f"Error in broadcaster loop: {e}")
                    self.logger.exception(e)
                    with self.stats_lock:
                        self.stats["errors"] += 1

        self.logger.info(f"IQ broadcaster stopped for SDR {self.sdr_id}")

    def stop(self):
        """
        Stop the broadcaster thread.
        """
        self.running = False
        self.logger.info(f"Stopping IQ broadcaster for SDR {self.sdr_id}")
