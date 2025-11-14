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
import multiprocessing


class DecoderManager:
    """
    Manager for decoder consumers (SSTV, AFSK, RTTY, etc.)
    Decoders are special as they consume audio from demodulators
    """

    def __init__(self, processes, demodulator_manager):
        """
        Initialize the decoder manager

        Args:
            processes: Reference to the main processes dictionary from ProcessManager
            demodulator_manager: Reference to DemodulatorManager for creating internal demodulators
        """
        self.logger = logging.getLogger("decoder-manager")
        self.processes = processes
        self.demodulator_manager = demodulator_manager

    def start_decoder(self, sdr_id, session_id, decoder_class, data_queue, **kwargs):
        """
        Start a decoder thread for a specific session.

        Decoders consume audio from a demodulator and produce decoded data
        (e.g., SSTV images, AFSK packets, RTTY text).

        This method automatically creates an internal FM demodulator specifically
        for the decoder if one doesn't already exist for this session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier (client session ID)
            decoder_class: The decoder class to instantiate (e.g., SSTVDecoder, AFSKDecoder)
            data_queue: Queue where decoded data will be placed (same as SDR data_queue)
            **kwargs: Additional arguments to pass to the decoder constructor

        Returns:
            bool: True if started successfully, False otherwise
        """
        if sdr_id not in self.processes:
            self.logger.warning(f"No SDR process found for device {sdr_id}")
            return False

        process_info = self.processes[sdr_id]

        # Check if decoder already exists for this session
        if session_id in process_info.get("decoders", {}):
            existing_entry = process_info["decoders"][session_id]
            existing = (
                existing_entry.get("instance")
                if isinstance(existing_entry, dict)
                else existing_entry
            )
            # If same type, just return success (already running)
            if isinstance(existing, decoder_class):
                self.logger.debug(
                    f"{decoder_class.__name__} already running for session {session_id}"
                )
                return True
            else:
                # Different type, stop the old one first
                self.logger.info(
                    f"Switching from {type(existing).__name__} to {decoder_class.__name__} for session {session_id}"
                )
                self.stop_decoder(sdr_id, session_id)

        try:
            # Import decoder classes to determine demodulator requirements
            from demodulators.loradecoder import LoRaDecoder
            from demodulators.morsedecoder import MorseDecoder

            # Determine if this decoder needs raw IQ (no demodulator) or audio (internal demod)
            needs_raw_iq = decoder_class == LoRaDecoder
            needs_ssb_demod = decoder_class == MorseDecoder  # Morse needs SSB (CW mode), not FM

            # Check if there's an active demodulator for this session
            # If not, or if it's not in internal mode, create an internal FM demodulator specifically for the decoder
            demod_entry = process_info.get("demodulators", {}).get(session_id)
            internal_demod_created = False

            # Check if we need to create/recreate the internal FM demodulator
            need_internal_demod = False
            vfo_number = kwargs.get("vfo")  # Get VFO number if provided

            if needs_raw_iq:
                # Raw IQ decoder (like LoRa) - no demodulator needed
                self.logger.info(
                    f"{decoder_class.__name__} receives raw IQ samples directly from SDR"
                )
            elif not demod_entry:
                need_internal_demod = True
                self.logger.info(
                    f"No active demodulator found for session {session_id}. "
                    f"Creating internal FM demodulator for decoder."
                )
            else:
                # In multi-VFO mode, demod_entry is a nested dict {vfo_number: {instance, subscription_key}}
                # In legacy mode, demod_entry is {instance, subscription_key}
                if isinstance(demod_entry, dict) and vfo_number and vfo_number in demod_entry:
                    # Multi-VFO mode: check specific VFO's demodulator
                    vfo_entry = demod_entry[vfo_number]
                    demodulator = vfo_entry.get("instance")
                    if not getattr(demodulator, "internal_mode", False):
                        need_internal_demod = True
                        self.logger.info(
                            f"Existing demodulator for session {session_id} VFO {vfo_number} is not in internal mode. "
                            f"Stopping it and creating internal FM demodulator for decoder."
                        )
                        # Stop only the specific VFO's demodulator
                        self.demodulator_manager.stop_demodulator(sdr_id, session_id, vfo_number)
                elif isinstance(demod_entry, dict) and "instance" in demod_entry:
                    # Legacy mode: single demodulator for session
                    demodulator = demod_entry.get("instance")
                    if not getattr(demodulator, "internal_mode", False):
                        need_internal_demod = True
                        self.logger.info(
                            f"Existing demodulator for session {session_id} is not in internal mode. "
                            f"Stopping it and creating internal FM demodulator for decoder."
                        )
                        # Stop the existing non-internal demodulator (legacy mode, no VFO number)
                        self.demodulator_manager.stop_demodulator(sdr_id, session_id)
                elif isinstance(demod_entry, dict) and vfo_number:
                    # Multi-VFO mode but this VFO doesn't have a demodulator yet
                    need_internal_demod = True
                    self.logger.info(
                        f"No demodulator for VFO {vfo_number} in session {session_id}. "
                        f"Creating internal FM demodulator for decoder."
                    )

            if need_internal_demod:
                # Import demodulators here to avoid circular imports
                from demodulators.fmdemodulator import FMDemodulator
                from demodulators.ssbdemodulator import SSBDemodulator

                # Create internal audio queue for the demodulator
                internal_audio_queue: multiprocessing.Queue = multiprocessing.Queue(maxsize=10)

                # Get VFO center frequency from kwargs if provided
                vfo_center_freq = kwargs.get("vfo_center_freq", None)

                # Select appropriate demodulator based on decoder type
                if needs_ssb_demod:
                    demod_class = SSBDemodulator
                    demod_mode = "cw"
                    demod_bandwidth = 2500  # 2.5 kHz bandwidth for Morse/CW
                    self.logger.info(
                        "Creating internal SSB demodulator (CW mode) for Morse decoder"
                    )
                else:
                    demod_class = FMDemodulator
                    demod_mode = None  # FM doesn't use mode parameter
                    demod_bandwidth = 12500  # 12.5 kHz bandwidth for SSTV
                    self.logger.info("Creating internal FM demodulator for decoder")

                # Start internal demodulator with internal_mode enabled
                # Pass vfo_number if provided to maintain multi-VFO structure
                demod_kwargs = {
                    "sdr_id": sdr_id,
                    "session_id": session_id,
                    "demodulator_class": demod_class,
                    "audio_queue": internal_audio_queue,
                    "vfo_number": vfo_number,  # Pass VFO number for multi-VFO mode
                    "internal_mode": True,  # Enable internal mode to bypass VFO checks
                    "center_freq": vfo_center_freq,  # Pass VFO frequency
                    "bandwidth": demod_bandwidth,
                }

                # Add mode parameter only for SSB
                if demod_mode:
                    demod_kwargs["mode"] = demod_mode

                success = self.demodulator_manager.start_demodulator(**demod_kwargs)

                if not success:
                    demod_type = "SSB" if needs_ssb_demod else "FM"
                    self.logger.error(
                        f"Failed to start internal {demod_type} demodulator for session {session_id}"
                    )
                    return False

                internal_demod_created = True
                demod_entry = process_info.get("demodulators", {}).get(session_id)

            # Get the appropriate queue for the decoder
            if needs_raw_iq:
                # Raw IQ decoder - subscribe to IQ broadcaster like IQRecorder does
                broadcaster = process_info.get("iq_broadcaster")
                if not broadcaster:
                    self.logger.error(f"No IQ broadcaster found for device {sdr_id}")
                    return False

                # Create a unique subscription key for this decoder
                subscription_key = f"decoder:{session_id}"
                if vfo_number:
                    subscription_key += f":vfo{vfo_number}"

                # Subscribe to the broadcaster to get a dedicated IQ queue
                iq_queue = broadcaster.subscribe(subscription_key, maxsize=3)

                # Filter out internal parameters before passing to decoder
                decoder_kwargs = {k: v for k, v in kwargs.items() if k != "vfo_center_freq"}

                # Create and start the decoder with the IQ queue
                decoder = decoder_class(iq_queue, data_queue, session_id, **decoder_kwargs)
                decoder.start()

                # Store the subscription key for cleanup
                subscription_key_to_store = subscription_key
            else:
                # Audio decoder - get audio queue from demodulator
                if demod_entry is None:
                    self.logger.error(f"No demodulator entry found for session {session_id}")
                    return False

                # Handle both multi-VFO and legacy mode
                if isinstance(demod_entry, dict) and vfo_number and vfo_number in demod_entry:
                    # Multi-VFO mode: get specific VFO's demodulator
                    vfo_entry = demod_entry[vfo_number]
                    demodulator = vfo_entry.get("instance")
                elif isinstance(demod_entry, dict) and "instance" in demod_entry:
                    # Legacy mode: single demodulator
                    demodulator = demod_entry.get("instance")
                else:
                    demodulator = None

                if demodulator is None:
                    self.logger.error(f"No demodulator instance found for session {session_id}")
                    return False
                audio_queue = demodulator.audio_queue

                # Filter out internal parameters before passing to decoder
                # vfo_center_freq is used for internal FM demodulator setup, not passed to decoder
                decoder_kwargs = {k: v for k, v in kwargs.items() if k != "vfo_center_freq"}

                # Create and start the decoder with the audio queue
                decoder = decoder_class(audio_queue, data_queue, session_id, **decoder_kwargs)
                decoder.start()

                subscription_key_to_store = None

            # Store reference
            if "decoders" not in process_info:
                process_info["decoders"] = {}
            process_info["decoders"][session_id] = {
                "instance": decoder,
                "decoder_type": decoder_class.__name__,
                "internal_demod": internal_demod_created,  # Track if we created the demod
                "vfo_number": vfo_number,  # Store VFO number for multi-VFO cleanup
                "subscription_key": subscription_key_to_store,  # For raw IQ decoders
                "needs_raw_iq": needs_raw_iq,  # Track if this is a raw IQ decoder
            }

            self.logger.info(
                f"Started {decoder_class.__name__} for session {session_id} on device {sdr_id}"
            )
            return True

        except Exception as e:
            self.logger.error(f"Error starting {decoder_class.__name__}: {str(e)}")
            self.logger.exception(e)
            return False

    def stop_decoder(self, sdr_id, session_id):
        """
        Stop a decoder thread for a specific session.

        If an internal FM demodulator was created for this decoder,
        it will also be stopped automatically.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        if sdr_id not in self.processes:
            return False

        process_info = self.processes[sdr_id]
        decoders = process_info.get("decoders", {})

        if session_id not in decoders:
            return False

        try:
            decoder_entry = decoders[session_id]
            # Handle both old format (direct instance) and new format (dict with instance)
            if isinstance(decoder_entry, dict):
                decoder = decoder_entry["instance"]
                internal_demod = decoder_entry.get("internal_demod", False)
                vfo_number = decoder_entry.get("vfo_number")  # Get VFO number if present
                subscription_key = decoder_entry.get("subscription_key")  # For raw IQ decoders
                needs_raw_iq = decoder_entry.get("needs_raw_iq", False)
            else:
                decoder = decoder_entry
                internal_demod = False
                vfo_number = None
                subscription_key = None
                needs_raw_iq = False

            decoder_name = type(decoder).__name__
            decoder.stop()
            decoder.join(timeout=2.0)  # Wait up to 2 seconds

            # If this was a raw IQ decoder, unsubscribe from broadcaster
            if needs_raw_iq and subscription_key:
                broadcaster = process_info.get("iq_broadcaster")
                if broadcaster:
                    broadcaster.unsubscribe(subscription_key)
                    self.logger.info(f"Unsubscribed {decoder_name} from IQ broadcaster")

            # If we created an internal demodulator for this decoder, stop it too
            if internal_demod:
                if vfo_number:
                    self.logger.info(
                        f"Stopping internal FM demodulator for session {session_id} VFO {vfo_number}"
                    )
                    self.demodulator_manager.stop_demodulator(sdr_id, session_id, vfo_number)
                else:
                    self.logger.info(f"Stopping internal FM demodulator for session {session_id}")
                    self.demodulator_manager.stop_demodulator(sdr_id, session_id)

            del decoders[session_id]
            self.logger.info(f"Stopped {decoder_name} for session {session_id}")
            return True

        except Exception as e:
            self.logger.error(f"Error stopping decoder: {str(e)}")
            return False

    def get_active_decoder(self, sdr_id, session_id):
        """
        Get the active decoder for a session.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier

        Returns:
            Decoder instance or None if not found
        """
        if sdr_id not in self.processes:
            return None

        process_info = self.processes[sdr_id]
        decoders = process_info.get("decoders", {})
        decoder_entry = decoders.get(session_id)

        if decoder_entry is None:
            return None

        # Handle both old format (direct instance) and new format (dict with instance)
        if isinstance(decoder_entry, dict):
            return decoder_entry.get("instance")
        return decoder_entry
