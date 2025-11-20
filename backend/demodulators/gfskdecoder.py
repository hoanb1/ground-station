# Ground Station - GFSK Decoder using GNU Radio
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
# GFSK decoder implementation based on gr-satellites by Daniel Estevez
# https://github.com/daniestevez/gr-satellites
# Copyright 2019 Daniel Estevez <daniel@destevez.net>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# GFSK (Gaussian Frequency Shift Keying) is very similar to GMSK but with
# a wider Gaussian filter (BT >= 0.5). Both are demodulated using the same
# FSK demodulator from gr-satellites.
#
# This is essentially an alias to the GMSK decoder with appropriate naming
# for clarity when dealing with GFSK-specific satellites.

from .gmskdecoder import (
    GNURADIO_AVAILABLE,
    DecoderStatus,
    GMSKDecoder,
    GMSKFlowgraph,
    GMSKMessageHandler,
)

# Create aliases for GFSK
GFSKFlowgraph = GMSKFlowgraph
GFSKMessageHandler = GMSKMessageHandler


class GFSKDecoder(GMSKDecoder):
    """
    Real-time GFSK decoder using GNU Radio

    GFSK (Gaussian Frequency Shift Keying) uses the same demodulation
    as GMSK. The difference is in the modulation parameters (BT parameter),
    but the receiver processing is identical.

    This class inherits from GMSKDecoder and only changes the logging
    prefix and metadata to indicate GFSK mode.
    """

    def __init__(
        self,
        iq_queue,
        data_queue,
        session_id,
        output_dir="data/decoded",
        vfo=None,
        transmitter=None,
        baudrate=9600,
        deviation=5000,
        batch_interval=5.0,
    ):
        # Initialize parent GMSK decoder
        super().__init__(
            iq_queue=iq_queue,
            data_queue=data_queue,
            session_id=session_id,
            output_dir=output_dir,
            vfo=vfo,
            transmitter=transmitter,
            baudrate=baudrate,
            deviation=deviation,
            batch_interval=batch_interval,
        )

        # Update thread name for GFSK
        self.name = f"GFSKDecoder-{session_id}"

        # Override transmitter mode if not already set
        if not self.transmitter_mode or self.transmitter_mode == "GMSK":
            self.transmitter_mode = self.transmitter.get("mode", "GFSK")

    def _on_packet_decoded(self, payload, callsigns=None):
        """Override to use GFSK in log messages and file names"""
        try:
            self.packet_count += 1
            with self.stats_lock:
                self.stats["packets_decoded"] = self.packet_count

            # Use parent implementation but will use GFSK in filenames
            # due to transmitter_mode being set to GFSK
            super()._on_packet_decoded(payload, callsigns)

        except Exception as e:
            import logging

            logger = logging.getLogger("gfskdecoder")
            logger.error(f"Error processing decoded packet: {e}")
            logger.exception(e)
            with self.stats_lock:
                self.stats["errors"] += 1

    def _send_status_update(self, status, info=None):
        """Send status update to UI with GFSK decoder type"""
        import queue
        import time

        # Build decoder configuration info (GFSK uses same params as GMSK)
        config_info = {
            "baudrate": self.baudrate,
            "deviation_hz": self.deviation,
            "framing": self.framing,  # "ax25" or "usp"
            "transmitter": self.transmitter_description,
            "transmitter_mode": self.transmitter_mode,
            "transmitter_downlink_mhz": (
                round(self.transmitter_downlink_freq / 1e6, 3)
                if self.transmitter_downlink_freq
                else None
            ),
        }

        # Merge with any additional info passed in
        if info:
            config_info.update(info)

        msg = {
            "type": "decoder-status",
            "status": status.value,
            "decoder_type": "gfsk",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "info": config_info,
        }
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            import logging

            logger = logging.getLogger("gfskdecoder")
            logger.warning("Data queue full, dropping status update")

    def _send_stats_update(self):
        """Send statistics update to UI with GFSK decoder type"""
        import queue
        import time

        msg = {
            "type": "decoder-stats",
            "decoder_type": "gfsk",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
            "stats": {
                "packets_decoded": self.packet_count,
                "baudrate": self.baudrate,
                "deviation": self.deviation,
            },
        }
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            pass

    def run(self):
        """Override run to use GFSK in log messages"""
        import logging

        logger = logging.getLogger("gfskdecoder")
        logger.info(f"GFSK decoder started for {self.session_id}")

        # Call parent run method
        super().run()

        logger.info(f"GFSK decoder stopped for {self.session_id}")

    def stop(self):
        """Stop the decoder thread with GFSK decoder type"""
        import queue
        import time

        self.running = False

        # Send final status update
        msg = {
            "type": "decoder-status",
            "status": "closed",
            "decoder_type": "gfsk",
            "session_id": self.session_id,
            "vfo": self.vfo,
            "timestamp": time.time(),
        }
        try:
            self.data_queue.put(msg, block=False)
            with self.stats_lock:
                self.stats["data_messages_out"] += 1
        except queue.Full:
            pass


# Export all necessary components
__all__ = [
    "GNURADIO_AVAILABLE",
    "DecoderStatus",
    "GFSKFlowgraph",
    "GFSKMessageHandler",
    "GFSKDecoder",
]
