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

logger = logging.getLogger("performance-monitor")


class PerformanceMonitor(threading.Thread):
    """
    Centralized performance monitoring that polls queue/thread stats
    without requiring changes to worker threads.

    Monitors:
    - IQ Broadcasters
    - Demodulators (FM, AM, SSB, etc.)
    - Decoders (SSTV, Morse, etc.)
    - Audio Broadcasters

    Provides metrics including:
    - Queue depths and utilization
    - Message throughput rates (messages/sec, samples/sec)
    - Per-subscriber statistics
    - Thread health indicators
    """

    def __init__(self, process_manager, update_interval=1.0):
        """
        Initialize the performance monitor.

        Args:
            process_manager: Reference to ProcessManager instance
            update_interval: Seconds between metric collection (default: 1.0)
        """
        super().__init__(daemon=True, name="PerformanceMonitor")
        self.process_manager = process_manager
        self.update_interval = update_interval
        self.running = True
        self.monitoring_enabled = False  # Start disabled, enabled on client request
        self.monitoring_lock = threading.Lock()
        self.metrics_queue: queue.Queue = queue.Queue(maxsize=10)  # Output to UI
        self.previous_snapshots = {}  # For calculating rates
        self.last_collection_time = time.time()

        logger.info(f"Performance monitor initialized (update_interval={update_interval}s)")

    def enable_monitoring(self):
        """Enable active monitoring when client requests it."""
        with self.monitoring_lock:
            self.monitoring_enabled = True
            logger.info("Performance monitoring enabled")

    def disable_monitoring(self):
        """Disable active monitoring to reduce overhead when not in use."""
        with self.monitoring_lock:
            self.monitoring_enabled = False
            logger.info("Performance monitoring disabled")

    def run(self):
        """Main monitoring loop - runs in separate thread"""
        logger.info("Performance monitor started")

        while self.running:
            try:
                # Sleep first to avoid immediate poll
                time.sleep(self.update_interval)

                # Only collect metrics if monitoring is enabled
                with self.monitoring_lock:
                    if not self.monitoring_enabled:
                        continue

                current_time = time.time()
                time_delta = current_time - self.last_collection_time

                # Collect metrics from all components
                metrics = self.collect_metrics(time_delta)

                # Send to output queue (non-blocking)
                try:
                    self.metrics_queue.put_nowait(metrics)
                except queue.Full:
                    # Drop metrics if UI can't keep up
                    logger.debug("Metrics queue full, dropping metrics update")

                self.last_collection_time = current_time

            except Exception as e:
                logger.error(f"Error in performance monitor loop: {e}")
                logger.exception(e)

        logger.info("Performance monitor stopped")

    def collect_metrics(self, time_delta):
        """
        Poll all monitored components for their current state.

        Args:
            time_delta: Time since last collection (for rate calculations)

        Returns:
            dict: Complete metrics snapshot
        """
        all_metrics = {
            "timestamp": time.time(),
            "time_delta": time_delta,
            "sdrs": {},
        }

        for sdr_id, process_info in self.process_manager.processes.items():
            sdr_metrics = {
                "sdr_id": sdr_id,
                "broadcasters": self._poll_broadcasters(sdr_id, process_info, time_delta),
                "fft_processor": self._poll_fft_processor(sdr_id, process_info, time_delta),
                "demodulators": self._poll_demodulators(sdr_id, process_info, time_delta),
                "recorders": self._poll_recorders(sdr_id, process_info, time_delta),
                "decoders": self._poll_decoders(sdr_id, process_info, time_delta),
            }
            all_metrics["sdrs"][sdr_id] = sdr_metrics

        # Poll audio streamers (global, not per-SDR)
        all_metrics["audio_streamers"] = self._poll_audio_streamers(time_delta)

        # Poll active sessions/browsers (global, not per-SDR)
        all_metrics["sessions"] = self._poll_sessions(time_delta)

        return all_metrics

    def _poll_broadcasters(self, sdr_id, process_info, time_delta):
        """
        Poll all broadcasters (IQ and Audio) for the SDR.

        Args:
            sdr_id: SDR device identifier
            process_info: Process information dictionary
            time_delta: Time since last poll

        Returns:
            dict: Broadcaster metrics with connections
        """
        broadcasters = {}

        # Poll IQ Broadcaster
        iq_broadcaster_metrics = self._poll_iq_broadcaster(sdr_id, process_info, time_delta)
        if iq_broadcaster_metrics:
            # Add connection info: IQ broadcaster feeds FFT processor and demodulators
            connections = []
            connections.append({"target_type": "fft_processor", "target_id": sdr_id})

            # Add connections to demodulators
            demodulators = process_info.get("demodulators", {})
            for session_id, session_demods in demodulators.items():
                for vfo_num in session_demods.keys():
                    connections.append(
                        {"target_type": "demodulator", "target_id": f"{session_id}_vfo{vfo_num}"}
                    )

            iq_broadcaster_metrics["connections"] = connections
            iq_broadcaster_metrics["broadcaster_type"] = "iq"
            iq_broadcaster_metrics["broadcaster_id"] = f"iq_{sdr_id}"
            broadcasters[f"iq_{sdr_id}"] = iq_broadcaster_metrics

        # Poll Audio Broadcasters (from decoders)
        decoders = process_info.get("decoders", {})
        for session_id, session_decoders in decoders.items():
            for decoder_name, decoder_entry in session_decoders.items():
                audio_broadcaster = decoder_entry.get("audio_broadcaster")
                if audio_broadcaster:
                    audio_broadcaster_metrics = self._poll_audio_broadcaster(
                        sdr_id, session_id, decoder_name, audio_broadcaster, time_delta
                    )
                    if audio_broadcaster_metrics:
                        # Add connection info: Audio broadcaster feeds from demodulator to decoder and UI
                        connections = [
                            {
                                "source_type": "demodulator",
                                "source_id": f"{session_id}_vfo{decoder_entry.get('vfo_number', 0)}",
                            }
                        ]
                        connections.append(
                            {"target_type": "decoder", "target_id": f"{session_id}_{decoder_name}"}
                        )
                        connections.append({"target_type": "ui", "target_id": f"ui:{session_id}"})

                        audio_broadcaster_metrics["connections"] = connections
                        audio_broadcaster_metrics["broadcaster_type"] = "audio"
                        broadcaster_id = f"audio_{session_id}_{decoder_name}"
                        audio_broadcaster_metrics["broadcaster_id"] = broadcaster_id
                        broadcasters[broadcaster_id] = audio_broadcaster_metrics

        return broadcasters

    def _poll_iq_broadcaster(self, sdr_id, process_info, time_delta):
        """
        Extract IQ broadcaster metrics.

        Args:
            sdr_id: SDR device identifier
            process_info: Process information dictionary
            time_delta: Time since last poll

        Returns:
            dict: IQ broadcaster metrics
        """
        broadcaster = process_info.get("iq_broadcaster")
        if not broadcaster:
            return None

        # Get stats snapshot (thread-safe)
        with broadcaster.stats_lock:
            stats_snapshot = broadcaster.stats.copy()

        # Get subscriber info (thread-safe)
        with broadcaster.lock:
            source_queue_size = broadcaster.source_queue.qsize()
            subscriber_count = len(broadcaster.subscribers)

            subscribers_info = {}
            for sub_id, sub_info in broadcaster.subscribers.items():
                subscribers_info[sub_id] = {
                    "queue_size": sub_info["queue"].qsize(),
                    "queue_maxsize": sub_info["maxsize"],
                    "utilization": (
                        sub_info["queue"].qsize() / sub_info["maxsize"]
                        if sub_info["maxsize"] > 0
                        else 0
                    ),
                    "delivered": sub_info["delivered"],
                    "dropped": sub_info["dropped"],
                }

        # Calculate rates from previous snapshot
        prev_key = f"iq_broadcaster_{sdr_id}"
        prev_snapshot = self.previous_snapshots.get(prev_key, {})

        messages_in_rate = self._calculate_rate(
            stats_snapshot.get("messages_in", 0),
            prev_snapshot.get("messages_in", 0),
            time_delta,
        )

        messages_broadcast_rate = self._calculate_rate(
            stats_snapshot.get("messages_broadcast", 0),
            prev_snapshot.get("messages_broadcast", 0),
            time_delta,
        )

        # Store current snapshot for next iteration
        self.previous_snapshots[prev_key] = stats_snapshot.copy()

        return {
            "source_queue_size": source_queue_size,
            "subscriber_count": subscriber_count,
            "stats": stats_snapshot,
            "rates": {
                "messages_in_per_sec": messages_in_rate,
                "messages_broadcast_per_sec": messages_broadcast_rate,
            },
            "subscribers": subscribers_info,
            "is_alive": broadcaster.is_alive(),
        }

    def _poll_fft_processor(self, sdr_id, process_info, time_delta):
        """
        Extract FFT processor metrics.

        Args:
            sdr_id: SDR device identifier
            process_info: Process information dictionary
            time_delta: Time since last poll

        Returns:
            dict: FFT processor metrics or None if not available
        """
        fft_stats = process_info.get("fft_stats", {})
        if not fft_stats:
            return None

        # Get queue sizes
        iq_queue_fft = process_info.get("iq_queue_fft")
        data_queue = process_info.get("data_queue")

        input_queue_size = iq_queue_fft.qsize() if iq_queue_fft else 0
        output_queue_size = data_queue.qsize() if data_queue else 0

        # Calculate rates from previous snapshot
        prev_key = f"fft_{sdr_id}"
        previous = self.previous_snapshots.get(prev_key, {})

        iq_chunks_rate = self._calculate_rate(
            fft_stats.get("iq_chunks_in", 0),
            previous.get("iq_chunks_in", 0),
            time_delta,
        )

        iq_samples_rate = self._calculate_rate(
            fft_stats.get("iq_samples_in", 0),
            previous.get("iq_samples_in", 0),
            time_delta,
        )

        fft_results_rate = self._calculate_rate(
            fft_stats.get("fft_results_out", 0),
            previous.get("fft_results_out", 0),
            time_delta,
        )

        # Store current snapshot for next iteration
        self.previous_snapshots[prev_key] = fft_stats.copy()

        # Add connection info: FFT processor receives from IQ broadcaster
        connections = [{"source_type": "iq_broadcaster", "source_id": f"iq_{sdr_id}"}]

        return {
            "fft_id": sdr_id,
            "input_queue_size": input_queue_size,
            "output_queue_size": output_queue_size,
            "stats": fft_stats,
            "rates": {
                "iq_chunks_per_sec": iq_chunks_rate,
                "iq_samples_per_sec": iq_samples_rate,
                "fft_results_per_sec": fft_results_rate,
            },
            "is_alive": (
                process_info.get("fft_process").is_alive()
                if process_info.get("fft_process")
                else False
            ),
            "connections": connections,
        }

    def _poll_audio_broadcaster(
        self, sdr_id, session_id, decoder_name, audio_broadcaster, time_delta
    ):
        """
        Extract Audio broadcaster metrics.

        Args:
            sdr_id: SDR device identifier
            session_id: Session identifier
            decoder_name: Decoder name
            audio_broadcaster: AudioBroadcaster instance
            time_delta: Time since last poll

        Returns:
            dict: Audio broadcaster metrics
        """
        if not audio_broadcaster:
            return None

        # Get stats from broadcaster
        broadcaster_stats = audio_broadcaster.get_stats()
        overall_stats = broadcaster_stats.get("overall", {})
        subscribers_info = broadcaster_stats.get("subscribers", {})

        # Calculate rates from previous snapshot
        prev_key = f"audio_broadcaster_{sdr_id}_{session_id}_{decoder_name}"
        prev_snapshot = self.previous_snapshots.get(prev_key, {})

        messages_received_rate = self._calculate_rate(
            overall_stats.get("messages_received", 0),
            prev_snapshot.get("messages_received", 0),
            time_delta,
        )

        messages_broadcast_rate = self._calculate_rate(
            overall_stats.get("messages_broadcast", 0),
            prev_snapshot.get("messages_broadcast", 0),
            time_delta,
        )

        # Store current snapshot for next iteration
        self.previous_snapshots[prev_key] = overall_stats.copy()

        return {
            "session_id": session_id,
            "decoder_name": decoder_name,
            "subscriber_count": broadcaster_stats.get("active_subscribers", 0),
            "stats": overall_stats,
            "rates": {
                "messages_received_per_sec": messages_received_rate,
                "messages_broadcast_per_sec": messages_broadcast_rate,
            },
            "subscribers": subscribers_info,
            "is_alive": audio_broadcaster.is_alive(),
        }

    def _poll_demodulators(self, sdr_id, process_info, time_delta):
        """
        Extract demodulator metrics.

        Args:
            sdr_id: SDR device identifier
            process_info: Process information dictionary
            time_delta: Time since last poll

        Returns:
            dict: Demodulator metrics
        """
        demodulators = process_info.get("demodulators", {})
        demod_metrics = {}

        for session_id, session_demods in demodulators.items():
            for vfo_num, demod_entry in session_demods.items():
                demod_instance = demod_entry["instance"]
                key = f"{session_id}_vfo{vfo_num}"

                # Get stats snapshot (thread-safe)
                # Check if demodulator has stats (might be older demodulator)
                if not hasattr(demod_instance, "stats_lock"):
                    continue

                with demod_instance.stats_lock:
                    stats_snapshot = demod_instance.stats.copy()

                # Get queue sizes
                input_queue_size = demod_instance.iq_queue.qsize()
                output_queue_size = demod_instance.audio_queue.qsize()

                # Calculate rates
                prev_key = f"demod_{sdr_id}_{key}"
                prev_snapshot = self.previous_snapshots.get(prev_key, {})

                # Demodulators use iq_chunks_in/iq_samples_in and audio_chunks_out/audio_samples_out
                iq_chunks_in_rate = self._calculate_rate(
                    stats_snapshot.get("iq_chunks_in", 0),
                    prev_snapshot.get("iq_chunks_in", 0),
                    time_delta,
                )

                iq_samples_in_rate = self._calculate_rate(
                    stats_snapshot.get("iq_samples_in", 0),
                    prev_snapshot.get("iq_samples_in", 0),
                    time_delta,
                )

                audio_chunks_out_rate = self._calculate_rate(
                    stats_snapshot.get("audio_chunks_out", 0),
                    prev_snapshot.get("audio_chunks_out", 0),
                    time_delta,
                )

                audio_samples_out_rate = self._calculate_rate(
                    stats_snapshot.get("audio_samples_out", 0),
                    prev_snapshot.get("audio_samples_out", 0),
                    time_delta,
                )

                # Store current snapshot
                self.previous_snapshots[prev_key] = stats_snapshot.copy()

                # Add connection info: demodulator receives from IQ broadcaster
                connections = [{"source_type": "iq_broadcaster", "source_id": f"iq_{sdr_id}"}]

                # Check if this demodulator feeds an audio broadcaster (via decoder)
                has_audio_broadcaster = False
                decoders = process_info.get("decoders", {})
                for dec_session_id, session_decoders in decoders.items():
                    for decoder_name, decoder_entry in session_decoders.items():
                        if (
                            decoder_entry.get("vfo_number") == vfo_num
                            and dec_session_id == session_id
                        ):
                            if decoder_entry.get("audio_broadcaster"):
                                connections.append(
                                    {
                                        "target_type": "audio_broadcaster",
                                        "target_id": f"audio_{session_id}_{decoder_name}",
                                    }
                                )
                                has_audio_broadcaster = True

                # Check if demodulator outputs to global WebAudioStreamer
                # Demodulators without audio broadcasters output to the global audio_queue
                # which is consumed by WebAudioStreamer
                if not has_audio_broadcaster:
                    # Get the global audio queue from server.startup
                    try:
                        from server import startup

                        global_audio_queue = getattr(startup, "audio_queue", None)

                        # Check if this demodulator's audio_queue is the global queue
                        if (
                            global_audio_queue is not None
                            and demod_instance.audio_queue is global_audio_queue
                        ):
                            # Connect to the session-specific WebAudioStreamer
                            connections.append(
                                {
                                    "target_type": "audio_streamer",
                                    "target_id": f"web_audio_{session_id}",
                                }
                            )
                    except Exception as e:
                        logger.debug(f"Could not check audio queue connection: {e}")

                demod_metrics[key] = {
                    "type": type(demod_instance).__name__,
                    "session_id": session_id,
                    "vfo_number": vfo_num,
                    "demod_id": key,
                    "input_queue_size": input_queue_size,
                    "output_queue_size": output_queue_size,
                    "is_alive": demod_instance.is_alive(),
                    "stats": stats_snapshot,
                    "rates": {
                        "iq_chunks_in_per_sec": iq_chunks_in_rate,
                        "iq_samples_in_per_sec": iq_samples_in_rate,
                        "audio_chunks_out_per_sec": audio_chunks_out_rate,
                        "audio_samples_out_per_sec": audio_samples_out_rate,
                    },
                    "connections": connections,
                }

        return demod_metrics

    def _poll_recorders(self, sdr_id, process_info, time_delta):
        """
        Extract IQ recorder metrics.

        Args:
            sdr_id: SDR device identifier
            process_info: Process information dictionary
            time_delta: Time since last poll

        Returns:
            dict: Recorder metrics
        """
        recorders = process_info.get("recorders", {})
        recorder_metrics = {}

        for session_id, recorder_entry in recorders.items():
            # Handle both old format (direct instance) and new format (dict with instance)
            if isinstance(recorder_entry, dict):
                recorder_instance = recorder_entry.get("instance")
            else:
                recorder_instance = recorder_entry

            if not recorder_instance:
                continue

            key = session_id

            # Get stats snapshot (thread-safe)
            if not hasattr(recorder_instance, "stats_lock"):
                continue

            with recorder_instance.stats_lock:
                stats_snapshot = recorder_instance.stats.copy()

            # Get queue sizes
            input_queue_size = recorder_instance.iq_queue.qsize()

            # Calculate rates
            prev_key = f"recorder_{sdr_id}_{key}"
            prev_snapshot = self.previous_snapshots.get(prev_key, {})

            iq_chunks_in_rate = self._calculate_rate(
                stats_snapshot.get("iq_chunks_in", 0),
                prev_snapshot.get("iq_chunks_in", 0),
                time_delta,
            )

            iq_samples_in_rate = self._calculate_rate(
                stats_snapshot.get("iq_samples_in", 0),
                prev_snapshot.get("iq_samples_in", 0),
                time_delta,
            )

            samples_written_rate = self._calculate_rate(
                stats_snapshot.get("samples_written", 0),
                prev_snapshot.get("samples_written", 0),
                time_delta,
            )

            bytes_written_rate = self._calculate_rate(
                stats_snapshot.get("bytes_written", 0),
                prev_snapshot.get("bytes_written", 0),
                time_delta,
            )

            # Store current snapshot
            self.previous_snapshots[prev_key] = stats_snapshot.copy()

            # Add connection info: recorder receives from IQ broadcaster
            connections = [{"source_type": "iq_broadcaster", "source_id": f"iq_{sdr_id}"}]

            recorder_metrics[key] = {
                "type": type(recorder_instance).__name__,
                "session_id": session_id,
                "recorder_id": key,
                "input_queue_size": input_queue_size,
                "is_alive": recorder_instance.is_alive(),
                "stats": stats_snapshot,
                "rates": {
                    "iq_chunks_in_per_sec": iq_chunks_in_rate,
                    "iq_samples_in_per_sec": iq_samples_in_rate,
                    "samples_written_per_sec": samples_written_rate,
                    "bytes_written_per_sec": bytes_written_rate,
                },
                "connections": connections,
            }

        return recorder_metrics

    def _poll_decoders(self, sdr_id, process_info, time_delta):
        """
        Extract decoder metrics.

        Args:
            sdr_id: SDR device identifier
            process_info: Process information dictionary
            time_delta: Time since last poll

        Returns:
            dict: Decoder metrics
        """
        decoders = process_info.get("decoders", {})
        decoder_metrics = {}

        for session_id, session_decoders in decoders.items():
            for vfo_num, decoder_entry in session_decoders.items():
                decoder_instance = decoder_entry["instance"]
                key = f"{session_id}_vfo{vfo_num}"

                # Get stats snapshot (thread-safe)
                # Check if decoder has stats (might be older decoder)
                if not hasattr(decoder_instance, "stats_lock"):
                    continue

                with decoder_instance.stats_lock:
                    stats_snapshot = decoder_instance.stats.copy()

                # Get queue sizes
                input_queue_size = decoder_instance.audio_queue.qsize()

                # Calculate rates
                prev_key = f"decoder_{sdr_id}_{key}"
                prev_snapshot = self.previous_snapshots.get(prev_key, {})

                audio_chunks_in_rate = self._calculate_rate(
                    stats_snapshot.get("audio_chunks_in", 0),
                    prev_snapshot.get("audio_chunks_in", 0),
                    time_delta,
                )

                audio_samples_in_rate = self._calculate_rate(
                    stats_snapshot.get("audio_samples_in", 0),
                    prev_snapshot.get("audio_samples_in", 0),
                    time_delta,
                )

                data_messages_out_rate = self._calculate_rate(
                    stats_snapshot.get("data_messages_out", 0),
                    prev_snapshot.get("data_messages_out", 0),
                    time_delta,
                )

                # Store current snapshot
                self.previous_snapshots[prev_key] = stats_snapshot.copy()

                # Add connection info: decoder receives from audio broadcaster
                decoder_name = vfo_num  # Using vfo_num as decoder name based on the key structure
                connections = [
                    {
                        "source_type": "audio_broadcaster",
                        "source_id": f"audio_{session_id}_{decoder_name}",
                    }
                ]

                metrics_entry = {
                    "type": type(decoder_instance).__name__,
                    "session_id": session_id,
                    "vfo_number": vfo_num,
                    "decoder_id": key,
                    "input_queue_size": input_queue_size,
                    "is_alive": decoder_instance.is_alive(),
                    "stats": stats_snapshot,
                    "rates": {
                        "audio_chunks_in_per_sec": audio_chunks_in_rate,
                        "audio_samples_in_per_sec": audio_samples_in_rate,
                        "data_messages_out_per_sec": data_messages_out_rate,
                    },
                    "connections": connections,
                }

                # Check for audio broadcaster (legacy - no longer needed in metrics_entry since it's in broadcasters category)
                # But keep it for backward compatibility if needed
                audio_broadcaster = decoder_entry.get("audio_broadcaster")
                if audio_broadcaster:
                    # Get audio broadcaster stats
                    audio_broadcaster_stats = audio_broadcaster.get_stats()
                    metrics_entry["audio_broadcaster"] = audio_broadcaster_stats

                decoder_metrics[key] = metrics_entry

        return decoder_metrics

    def _poll_audio_streamers(self, time_delta):
        """
        Poll audio streamers (WebAudioStreamer that streams to web clients).
        Creates one streamer entry per active session.

        Args:
            time_delta: Time since last poll

        Returns:
            dict: Audio streamer metrics per session
        """
        streamers = {}

        # Get the web audio streamer
        audio_consumer = self.process_manager.get_audio_consumer()
        if audio_consumer and hasattr(audio_consumer, "session_stats_lock"):
            # Get per-session stats
            with audio_consumer.session_stats_lock:
                session_stats_snapshot = {
                    sid: stats.copy() for sid, stats in audio_consumer.session_stats.items()
                }

            # Get queue size (shared across all sessions)
            input_queue_size = audio_consumer.audio_queue.qsize()

            # Get session IP addresses and user agents from Socket.IO
            session_info = {}
            try:
                from handlers.socket import SESSIONS

                for sid, environ in SESSIONS.items():
                    # Check for real IP behind reverse proxy
                    real_ip = (
                        environ.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
                        or environ.get("HTTP_X_REAL_IP", "")
                        or environ.get("REMOTE_ADDR", "unknown")
                    )

                    session_info[sid] = {
                        "ip": real_ip,
                        "user_agent": environ.get("HTTP_USER_AGENT", "unknown"),
                    }
            except Exception as e:
                logger.debug(f"Could not get session info: {e}")

            # Create a streamer entry for each active session
            for session_id, session_stats in session_stats_snapshot.items():
                # Calculate rates
                prev_key = f"audio_consumer_web_{session_id}"
                prev_snapshot = self.previous_snapshots.get(prev_key, {})

                audio_chunks_in_rate = self._calculate_rate(
                    session_stats.get("audio_chunks_in", 0),
                    prev_snapshot.get("audio_chunks_in", 0),
                    time_delta,
                )

                audio_samples_in_rate = self._calculate_rate(
                    session_stats.get("audio_samples_in", 0),
                    prev_snapshot.get("audio_samples_in", 0),
                    time_delta,
                )

                messages_emitted_rate = self._calculate_rate(
                    session_stats.get("messages_emitted", 0),
                    prev_snapshot.get("messages_emitted", 0),
                    time_delta,
                )

                # Store current snapshot
                self.previous_snapshots[prev_key] = session_stats.copy()

                session_data = session_info.get(session_id, {})
                streamers[f"web_audio_{session_id}"] = {
                    "type": "WebAudioStreamer",
                    "streamer_id": f"web_audio_{session_id}",
                    "session_id": session_id,
                    "client_ip": session_data.get("ip", "unknown"),
                    "user_agent": session_data.get("user_agent", "unknown"),
                    "input_queue_size": input_queue_size,  # Shared queue
                    "is_alive": audio_consumer.is_alive(),
                    "stats": session_stats,
                    "rates": {
                        "audio_chunks_in_per_sec": audio_chunks_in_rate,
                        "audio_samples_in_per_sec": audio_samples_in_rate,
                        "messages_emitted_per_sec": messages_emitted_rate,
                    },
                }

        return streamers

    def _poll_sessions(self, time_delta):
        """
        Poll active Socket.IO sessions (connected browsers/clients).

        This method tracks all connected clients regardless of whether they're
        actively streaming audio or not.

        Args:
            time_delta: Time since last poll

        Returns:
            dict: Session/browser metrics for all connected clients
        """
        sessions = {}

        try:
            from handlers.socket import SESSIONS

            for sid, environ in SESSIONS.items():
                # Extract real IP address (support reverse proxy and ASGI)
                real_ip = "unknown"

                # Try X-Forwarded-For header first (standard reverse proxy)
                x_forwarded = environ.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
                if x_forwarded:
                    real_ip = x_forwarded
                # Try X-Real-IP header
                elif environ.get("HTTP_X_REAL_IP"):
                    real_ip = environ.get("HTTP_X_REAL_IP")
                # Try ASGI scope client tuple (ASGI-specific)
                elif "asgi.scope" in environ and "client" in environ["asgi.scope"]:
                    client = environ["asgi.scope"]["client"]
                    if client and len(client) >= 1:
                        real_ip = client[0]
                # Fallback to REMOTE_ADDR
                elif environ.get("REMOTE_ADDR"):
                    real_ip = environ.get("REMOTE_ADDR")

                sessions[sid] = {
                    "type": "Browser",
                    "session_id": sid,
                    "client_ip": real_ip,
                    "user_agent": environ.get("HTTP_USER_AGENT", "unknown"),
                    "is_alive": True,
                    "connected": True,
                }

        except Exception as e:
            logger.error(f"Could not poll sessions: {e}")

        return sessions

    def _calculate_rate(self, current_value, previous_value, time_delta):
        """
        Calculate rate of change per second.

        Args:
            current_value: Current counter value
            previous_value: Previous counter value
            time_delta: Time between measurements in seconds

        Returns:
            float: Rate per second
        """
        if time_delta <= 0:
            return 0.0

        delta = current_value - previous_value
        return delta / time_delta

    def stop(self):
        """Stop the performance monitor"""
        logger.info("Stopping performance monitor...")
        self.running = False

    def get_latest_metrics(self, timeout=None):
        """
        Get the latest metrics from the queue.

        Args:
            timeout: Optional timeout in seconds

        Returns:
            dict: Latest metrics, or None if queue is empty
        """
        try:
            return self.metrics_queue.get(timeout=timeout)
        except queue.Empty:
            return None
