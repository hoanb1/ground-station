# Ground Station - IQ Recorder
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


import json
import logging
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("iq-recorder")


class IQRecorder(threading.Thread):
    """
    IQ recorder that subscribes to IQ samples and writes them to SigMF format.

    Behaves like a demodulator but writes raw IQ instead of producing audio.
    This allows recording to be managed through the same infrastructure as demodulators.
    """

    def __init__(self, iq_queue, audio_queue, session_id, recording_path):
        super().__init__(daemon=True, name=f"IQRecorder-{session_id}")
        self.iq_queue = iq_queue
        self.recording_path = Path(recording_path)
        self.session_id = session_id
        self.running = True

        # Metadata tracking
        self.total_samples = 0
        self.captures = []
        self.annotations = []
        self.current_center_freq = None
        self.current_sample_rate = None
        self.start_datetime = None

        # Store start time to preserve it in final metadata
        self.start_time_iso = datetime.now(timezone.utc).isoformat() + "Z"

        # Open data file for writing
        self.data_file = open(f"{recording_path}.sigmf-data", "wb")

        # Create preliminary sigmf-meta file to mark recording as in progress
        self._write_preliminary_metadata()

        logger.info(f"IQ recorder started: {recording_path}")

    def run(self):
        """Main recording loop."""
        while self.running:
            try:
                if self.iq_queue.empty():
                    time.sleep(0.01)
                    continue

                iq_message = self.iq_queue.get(timeout=0.1)

                samples = iq_message.get("samples")
                center_freq = iq_message.get("center_freq")
                sample_rate = iq_message.get("sample_rate")
                timestamp = iq_message.get("timestamp")

                if samples is None or len(samples) == 0:
                    continue

                # Check if parameters changed (new capture segment needed)
                if (
                    self.current_center_freq != center_freq
                    or self.current_sample_rate != sample_rate
                ):

                    # Add new capture segment
                    self.captures.append(
                        {
                            "core:sample_start": self.total_samples,
                            "core:frequency": int(center_freq),
                            "core:datetime": datetime.fromtimestamp(
                                timestamp, tz=timezone.utc
                            ).isoformat()
                            + "Z",
                        }
                    )

                    self.current_center_freq = center_freq
                    self.current_sample_rate = sample_rate

                    if self.start_datetime is None:
                        self.start_datetime = timestamp

                    logger.info(
                        f"New capture segment at sample {self.total_samples}: "
                        f"freq={center_freq/1e6:.3f} MHz, rate={sample_rate/1e6:.2f} MS/s"
                    )

                # Write samples to file
                samples.tofile(self.data_file)
                self.total_samples += len(samples)

            except Exception as e:
                if self.running:
                    logger.error(f"Error in IQ recorder: {str(e)}")
                    logger.exception(e)
                time.sleep(0.1)

        logger.info(f"IQ recorder stopped: {self.total_samples} samples written")

    def _write_preliminary_metadata(self):
        """Write preliminary metadata file to mark recording as in progress."""
        preliminary_metadata = {
            "global": {
                "core:datatype": "cf32_le",
                "core:version": "1.0.0",
                "core:description": "Ground Station IQ Recording",
                "core:recorder": "ground-station",
                "gs:recording_in_progress": True,
                "gs:start_time": self.start_time_iso,
            },
            "captures": [],
            "annotations": [],
        }

        with open(f"{self.recording_path}.sigmf-meta", "w") as f:
            json.dump(preliminary_metadata, f, indent=2)

        logger.info(f"Preliminary metadata written: {self.recording_path}.sigmf-meta")

    def add_annotation(self, start_sample, sample_count, freq_lower, freq_upper, comment):
        """Add signal annotation to metadata."""
        self.annotations.append(
            {
                "core:sample_start": start_sample,
                "core:sample_count": sample_count,
                "core:freq_lower_edge": int(freq_lower),
                "core:freq_upper_edge": int(freq_upper),
                "core:comment": comment,
            }
        )

    def stop(self):
        """Stop recording and write metadata."""
        self.running = False
        self.join(timeout=2.0)

        # Close data file
        self.data_file.close()

        # Write final SigMF metadata (replaces preliminary metadata, preserves start_time)
        metadata = {
            "global": {
                "core:datatype": "cf32_le",
                "core:sample_rate": self.current_sample_rate,
                "core:version": "1.0.0",
                "core:description": "Ground Station IQ Recording",
                "core:recorder": "ground-station",
                "gs:start_time": self.start_time_iso,
                "gs:finalized_time": datetime.now(timezone.utc).isoformat() + "Z",
            },
            "captures": self.captures,
            "annotations": self.annotations,
        }

        with open(f"{self.recording_path}.sigmf-meta", "w") as f:
            json.dump(metadata, f, indent=2)

        logger.info(
            f"Metadata written: {len(self.captures)} capture(s), "
            f"{len(self.annotations)} annotation(s)"
        )
