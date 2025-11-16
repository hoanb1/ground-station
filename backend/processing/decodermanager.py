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

from audio.audiobroadcaster import AudioBroadcaster


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

    def start_decoder(
        self, sdr_id, session_id, decoder_class, data_queue, audio_out_queue=None, **kwargs
    ):
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
            audio_out_queue: Optional queue for streaming demodulated audio to UI (for SSTV/Morse audio monitoring)
            **kwargs: Additional arguments to pass to the decoder constructor

        Returns:
            bool: True if started successfully, False otherwise
        """
        if sdr_id not in self.processes:
            self.logger.warning(f"No SDR process found for device {sdr_id}")
            return False

        process_info = self.processes[sdr_id]

        # Extract VFO number from kwargs if provided
        vfo_number = kwargs.get("vfo")

        # Check if decoder already exists for this session and VFO
        decoders_dict = process_info.get("decoders", {})
        session_decoders = decoders_dict.get(session_id, {})

        # Check if this specific VFO has a decoder
        if vfo_number and vfo_number in session_decoders:
            existing_entry = session_decoders[vfo_number]
            existing = (
                existing_entry.get("instance")
                if isinstance(existing_entry, dict)
                else existing_entry
            )
            # If same type, just return success (already running)
            if isinstance(existing, decoder_class):
                self.logger.debug(
                    f"{decoder_class.__name__} already running for session {session_id} VFO {vfo_number}"
                )
                return True
            else:
                # Different type, stop the old one first
                self.logger.info(
                    f"Switching from {type(existing).__name__} to {decoder_class.__name__} for session {session_id} VFO {vfo_number}"
                )
                self.stop_decoder(sdr_id, session_id, vfo_number)

        try:
            # Import decoder classes to determine demodulator requirements
            from demodulators.gmskdecoder import GMSKDecoder
            from demodulators.loradecoder import LoRaDecoder
            from demodulators.morsedecoder import MorseDecoder

            # Determine if this decoder needs raw IQ (no demodulator) or audio (internal demod)
            needs_raw_iq = decoder_class in (LoRaDecoder, GMSKDecoder)
            needs_ssb_demod = decoder_class == MorseDecoder  # Morse needs SSB (CW mode), not FM

            # Check if there's an active demodulator for this session
            # If not, or if it's not in internal mode, create an internal FM demodulator specifically for the decoder
            demod_entry = process_info.get("demodulators", {}).get(session_id)
            internal_demod_created = False

            # Check if we need to create/recreate the internal FM demodulator
            need_internal_demod = False

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
                # demod_entry is a nested dict {vfo_number: {instance, subscription_key}}
                if isinstance(demod_entry, dict) and vfo_number and vfo_number in demod_entry:
                    # Check specific VFO's demodulator
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
                elif isinstance(demod_entry, dict) and vfo_number:
                    # This VFO doesn't have a demodulator yet
                    need_internal_demod = True
                    self.logger.info(
                        f"No demodulator for VFO {vfo_number} in session {session_id}. "
                        f"Creating internal FM demodulator for decoder."
                    )

            if need_internal_demod:
                # Import demodulators here to avoid circular imports
                from demodulators.fmdemodulator import FMDemodulator
                from demodulators.ssbdemodulator import SSBDemodulator

                # Create AudioBroadcaster for distributing demodulated audio to multiple consumers
                # This allows the decoder and UI to both receive audio without modifying demodulator code
                broadcaster_input_queue: multiprocessing.Queue = multiprocessing.Queue(maxsize=10)
                audio_broadcaster = AudioBroadcaster(broadcaster_input_queue)
                audio_broadcaster.start()

                # Get VFO center frequency from kwargs if provided
                vfo_center_freq = kwargs.get("vfo_center_freq", None)

                # Select appropriate demodulator based on decoder type
                if needs_ssb_demod:
                    demod_class = SSBDemodulator
                    demod_mode = "cw"
                    demod_bandwidth = 2500  # 2.5 kHz bandwidth for Morse/CW
                    self.logger.info(
                        "Creating internal SSB demodulator (CW mode) for Morse decoder with AudioBroadcaster"
                    )
                else:
                    demod_class = FMDemodulator
                    demod_mode = None  # FM doesn't use mode parameter
                    demod_bandwidth = 12500  # 12.5 kHz bandwidth for SSTV
                    self.logger.info(
                        "Creating internal FM demodulator for decoder with AudioBroadcaster"
                    )

                # Start internal demodulator with internal_mode enabled
                # Demodulator writes to broadcaster input queue (single output)
                # Pass vfo_number if provided to maintain multi-VFO structure
                demod_kwargs = {
                    "sdr_id": sdr_id,
                    "session_id": session_id,
                    "demodulator_class": demod_class,
                    "audio_queue": broadcaster_input_queue,  # Demodulator feeds broadcaster
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
                    # Clean up broadcaster if demodulator failed to start
                    audio_broadcaster.stop()
                    return False

                internal_demod_created = True
                demod_entry = process_info.get("demodulators", {}).get(session_id)

            # Get the appropriate queue for the decoder
            if needs_raw_iq:
                # Raw IQ decoder - subscribe to IQ broadcaster like IQRecorder does
                iq_broadcaster = process_info.get("iq_broadcaster")
                if not iq_broadcaster:
                    self.logger.error(f"No IQ broadcaster found for device {sdr_id}")
                    return False

                # Create a unique subscription key for this decoder
                subscription_key = f"decoder:{session_id}"
                if vfo_number:
                    subscription_key += f":vfo{vfo_number}"

                # Subscribe to the broadcaster to get a dedicated IQ queue
                iq_queue = iq_broadcaster.subscribe(subscription_key, maxsize=3)

                # Filter out internal parameters before passing to decoder
                decoder_kwargs = {k: v for k, v in kwargs.items() if k != "vfo_center_freq"}

                # Create and start the decoder with the IQ queue
                decoder = decoder_class(iq_queue, data_queue, session_id, **decoder_kwargs)
                decoder.start()

                # Store the subscription key for cleanup
                subscription_key_to_store = subscription_key
                audio_broadcaster_instance = None  # Raw IQ decoders don't use audio broadcaster
            else:
                # Audio decoder - subscribe to AudioBroadcaster
                if not internal_demod_created:
                    self.logger.error(f"No internal demodulator created for session {session_id}")
                    return False

                # Subscribe decoder to audio broadcaster
                decoder_audio_queue = audio_broadcaster.subscribe(
                    f"decoder:{session_id}", maxsize=10
                )

                # If UI audio streaming requested, subscribe UI as well
                ui_forwarder_thread = None
                if audio_out_queue is not None:
                    ui_audio_queue = audio_broadcaster.subscribe(f"ui:{session_id}", maxsize=10)
                    self.logger.info("UI audio streaming enabled via AudioBroadcaster")

                    # Start a daemon thread to forward audio from ui_audio_queue to audio_out_queue
                    # This bridges the broadcaster subscriber queue to the caller's queue
                    # Thread will auto-cleanup when broadcaster stops or process exits
                    import threading

                    def forward_audio():
                        while True:
                            try:
                                audio_msg = ui_audio_queue.get(timeout=1.0)
                                try:
                                    audio_out_queue.put_nowait(audio_msg)
                                except Exception:
                                    pass  # Drop if UI queue full
                            except Exception:
                                break  # Exit on timeout or error

                    ui_forwarder_thread = threading.Thread(
                        target=forward_audio, daemon=True, name=f"UIAudioForwarder-{session_id}"
                    )
                    ui_forwarder_thread.start()
                    # Note: Thread reference stored in decoder entry but not explicitly joined
                    # Daemon thread will exit automatically when broadcaster stops

                # Filter out internal parameters before passing to decoder
                decoder_kwargs = {k: v for k, v in kwargs.items() if k != "vfo_center_freq"}

                # Create and start the decoder with the audio queue from broadcaster
                decoder = decoder_class(
                    decoder_audio_queue, data_queue, session_id, **decoder_kwargs
                )
                decoder.start()

                subscription_key_to_store = None
                audio_broadcaster_instance = audio_broadcaster  # Store for cleanup

            # Store reference in multi-VFO structure
            if "decoders" not in process_info:
                process_info["decoders"] = {}
            if session_id not in process_info["decoders"]:
                process_info["decoders"][session_id] = {}

            decoder_info = {
                "instance": decoder,
                "decoder_type": decoder_class.__name__,
                "internal_demod": internal_demod_created,  # Track if we created the demod
                "vfo_number": vfo_number,  # Store VFO number for multi-VFO cleanup
                "subscription_key": subscription_key_to_store,  # For raw IQ decoders
                "needs_raw_iq": needs_raw_iq,  # Track if this is a raw IQ decoder
                "audio_broadcaster": audio_broadcaster_instance,  # AudioBroadcaster instance for cleanup
                "ui_forwarder_thread": (
                    ui_forwarder_thread if not needs_raw_iq else None
                ),  # UI forwarder thread reference
            }

            # Store under VFO number (multi-VFO mode only)
            if vfo_number:
                process_info["decoders"][session_id][vfo_number] = decoder_info
            else:
                self.logger.error(
                    f"vfo_number is required to start decoder {decoder_class.__name__} for session {session_id}"
                )
                return False

            self.logger.info(
                f"Started {decoder_class.__name__} for session {session_id} on device {sdr_id}"
            )
            return True

        except Exception as e:
            self.logger.error(f"Error starting {decoder_class.__name__}: {str(e)}")
            self.logger.exception(e)
            return False

    def stop_decoder(self, sdr_id, session_id, vfo_number=None):
        """
        Stop a decoder thread for a specific session and optionally a specific VFO.

        If an internal FM demodulator was created for this decoder,
        it will also be stopped automatically.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier
            vfo_number: VFO number (1-4). If None, stops all decoders for session

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        if sdr_id not in self.processes:
            return False

        process_info = self.processes[sdr_id]
        decoders = process_info.get("decoders", {})

        if session_id not in decoders:
            return False

        session_decoders = decoders[session_id]

        # If vfo_number is specified, stop only that VFO's decoder
        if vfo_number is not None:
            if vfo_number not in session_decoders:
                self.logger.debug(f"No decoder found for session {session_id} VFO {vfo_number}")
                return False

            # Stop specific VFO decoder
            return self._stop_single_decoder(
                sdr_id, session_id, vfo_number, session_decoders[vfo_number], process_info
            )
        else:
            # Stop all VFO decoders for this session
            success = True
            for vfo_num in list(session_decoders.keys()):
                if not self._stop_single_decoder(
                    sdr_id, session_id, vfo_num, session_decoders[vfo_num], process_info
                ):
                    success = False
            return success

    def _stop_single_decoder(self, sdr_id, session_id, vfo_number, decoder_entry, process_info):
        """
        Internal method to stop a single decoder instance.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier
            vfo_number: VFO number
            decoder_entry: The decoder entry dict
            process_info: Process info dict

        Returns:
            bool: True if stopped successfully, False otherwise
        """
        try:
            # Extract decoder info from entry dict
            decoder = decoder_entry["instance"]
            internal_demod = decoder_entry.get("internal_demod", False)
            subscription_key = decoder_entry.get("subscription_key")  # For raw IQ decoders
            needs_raw_iq = decoder_entry.get("needs_raw_iq", False)
            audio_broadcaster = decoder_entry.get("audio_broadcaster")  # AudioBroadcaster instance
            ui_forwarder_thread = decoder_entry.get("ui_forwarder_thread")  # noqa: F841

            decoder_name = type(decoder).__name__
            decoder.stop()
            decoder.join(timeout=2.0)  # Wait up to 2 seconds

            # If this was a raw IQ decoder, unsubscribe from IQ broadcaster
            if needs_raw_iq and subscription_key:
                iq_broadcaster = process_info.get("iq_broadcaster")
                if iq_broadcaster:
                    iq_broadcaster.unsubscribe(subscription_key)
                    self.logger.info(f"Unsubscribed {decoder_name} from IQ broadcaster")

            # If we have an AudioBroadcaster, stop it
            if audio_broadcaster:
                audio_broadcaster.stop()
                vfo_info = f" VFO {vfo_number}" if vfo_number else ""
                self.logger.info(f"Stopped AudioBroadcaster for session {session_id}{vfo_info}")

            # If we created an internal demodulator for this decoder, stop it too
            # But first check if it still exists and is actually in internal mode
            if internal_demod:
                # Check if a demodulator exists for this session/VFO
                demod_entry = process_info.get("demodulators", {}).get(session_id)
                should_stop_demod = False

                if demod_entry:
                    # Check if this is multi-VFO mode
                    if isinstance(demod_entry, dict) and vfo_number and vfo_number in demod_entry:
                        # Check specific VFO's demodulator
                        vfo_demod = demod_entry[vfo_number].get("instance")
                        # Only stop if it's still in internal mode (not replaced by normal demod)
                        should_stop_demod = getattr(vfo_demod, "internal_mode", False)

                if should_stop_demod:
                    # Determine demodulator type from the decoder type for better logging
                    from demodulators.morsedecoder import MorseDecoder

                    demod_type = "SSB" if isinstance(decoder, MorseDecoder) else "FM"

                    self.logger.info(
                        f"Stopping internal {demod_type} demodulator for session {session_id} VFO {vfo_number}"
                    )
                    self.demodulator_manager.stop_demodulator(sdr_id, session_id, vfo_number)
                else:
                    self.logger.debug(
                        f"Internal demodulator for session {session_id} was already replaced, skipping cleanup"
                    )

            # Delete the decoder entry
            decoders = process_info.get("decoders", {})
            if session_id in decoders and vfo_number in decoders[session_id]:
                del decoders[session_id][vfo_number]
                # If no more VFO decoders, clean up session entry
                if not decoders[session_id]:
                    del decoders[session_id]

            self.logger.info(f"Stopped {decoder_name} for session {session_id} VFO {vfo_number}")
            return True

        except Exception as e:
            self.logger.error(f"Error stopping decoder: {str(e)}")
            return False

    def get_active_decoder(self, sdr_id, session_id, vfo_number=None):
        """
        Get the active decoder for a session and optionally a specific VFO.

        Args:
            sdr_id: Device identifier
            session_id: Session identifier
            vfo_number: VFO number (1-4). If None, returns first decoder found

        Returns:
            Decoder instance or None if not found
        """
        if sdr_id not in self.processes:
            return None

        process_info = self.processes[sdr_id]
        decoders = process_info.get("decoders", {})
        session_decoders = decoders.get(session_id)

        if session_decoders is None:
            return None

        # If vfo_number is specified, look for that specific VFO's decoder
        if vfo_number is not None:
            if isinstance(session_decoders, dict) and vfo_number in session_decoders:
                vfo_entry = session_decoders[vfo_number]
                if isinstance(vfo_entry, dict):
                    return vfo_entry.get("instance")
                return vfo_entry
            return None

        # No VFO specified: return first VFO decoder found
        if isinstance(session_decoders, dict):
            for vfo_num in sorted(session_decoders.keys()):
                vfo_entry = session_decoders[vfo_num]
                if isinstance(vfo_entry, dict):
                    return vfo_entry.get("instance")
                return vfo_entry
        return None
