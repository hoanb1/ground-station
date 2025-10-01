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


import multiprocessing
import crud
import asyncio
import logging
from datetime import UTC
from db.__init__ import AsyncSessionLocal
from controllers.rotator import RotatorController
from controllers.rig import RigController
from controllers.sdr import SDRController
from common.arguments import arguments as args
from common.constants import TrackingEvents, TrackerCommands, SocketEvents, TrackingStateNames, DictKeys
from datetime import datetime
from tracking.doppler import calculate_doppler_shift
from tracker.utils import pretty_dict
from tracker.data import compiled_satellite_data


logger = logging.getLogger("tracker-worker")


class SatelliteTracker:
    """
    Satellite tracking class that manages rotator and rig controllers
    for automated satellite tracking in a multiprocessing environment.
    """

    def __init__(self, queue_out: multiprocessing.Queue, queue_in: multiprocessing.Queue, stop_event=None):
        """Initialize the satellite tracker with queues and configuration."""
        # Store queue references
        self.queue_out = queue_out
        self.queue_in = queue_in
        self.stop_event = stop_event

        # Configuration constants
        self.azimuth_limits = (0, 360)
        self.elevation_limits = (0, 90)
        self.min_elevation = 10.0
        self.az_tolerance = 2.0
        self.el_tolerance = 2.0

        # State tracking
        self.current_rotator_id = "none"
        self.current_rig_id = "none"
        self.current_transmitter_id = "none"
        self.current_rotator_state = "disconnected"
        self.current_rig_state = "disconnected"
        self.current_norad_id = None
        self.current_group_id = None

        # Hardware controllers
        self.rotator_controller = None
        self.rig_controller = None

        # Data structures
        self.rotator_data = {
            'az': 0, 'el': 0, 'connected': False, 'tracking': False,
            'slewing': False, 'outofbounds': False, 'minelevation': False,
            'stopped': False, 'error': False
        }
        self.rig_data = {
            'connected': False, 'tracking': False, 'stopped': False, 'error': False,
            'frequency': 0, 'observed_freq': 0, 'doppler_shift': 0, 'original_freq': 0,
            'transmitter_id': 'none', 'device_type': ''
        }

        # Operational state
        self.notified = {}
        self.nudge_offset = {'az': 0, 'el': 0}

        # State change tracking (replacing StateTracker)
        self.prev_norad_id = None
        self.prev_rotator_state = None
        self.prev_rotator_id = None
        self.prev_rig_state = None
        self.prev_transmitter_id = None
        self.prev_rig_id = None

        # Events to send the UI
        self.events = []

        # Performance monitoring
        self.start_loop_date = None

    def in_tracking_state(self) -> bool:
        """Check if rotator is currently in tracking state."""
        return self.current_rotator_state == "tracking"

    async def handle_satellite_change(self, old, new):
        """Handle satellite target change events."""
        logger.info(f"Target satellite change detected from '{old}' to '{new}'")

        # Reset state
        self.rotator_data['minelevation'] = False
        self.notified = {}

        # Notify about change
        self.queue_out.put({
            DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
            DictKeys.DATA: {
                DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.NORAD_ID_CHANGE, 'old': old, 'new': new}]
            }
        })

        # Update rig state in database
        async with AsyncSessionLocal() as dbsession:
            new_tracking_state = await crud.satellites.set_tracking_state(dbsession, {
                DictKeys.NAME: TrackingStateNames.SATELLITE_TRACKING,
                'value': {
                    'transmitter_id': "none",
                    'rig_state': "stopped" if self.current_rig_state == "tracking" else self.current_rig_state,
                }
            })

        # Update local state
        self.rig_data['tracking'] = False
        self.rig_data['stopped'] = True

    async def connect_to_rotator(self):
        """Connect to the rotator hardware."""
        if self.current_rotator_id is not None and self.rotator_controller is None:
            try:
                async with AsyncSessionLocal() as dbsession:
                    rotator_details_reply = await crud.hardware.fetch_rotators(dbsession, rotator_id=self.current_rotator_id)
                    rotator_details = rotator_details_reply['data']

                self.rotator_controller = RotatorController(
                    host=rotator_details['host'],
                    port=rotator_details['port']
                )
                await self.rotator_controller.connect()

                # Update state
                self.rotator_data.update({
                    'connected': True, 'tracking': False, 'slewing': False,
                    'outofbounds': False, 'stopped': True
                })

                self.queue_out.put({
                    DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                    DictKeys.DATA: {
                        DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.ROTATOR_CONNECTED}],
                        'rotator_data': self.rotator_data.copy()
                    }
                })

            except Exception as e:
                logger.error(f"Failed to connect to rotator: {e}")
                logger.exception(e)
                await self._handle_rotator_error(e)

    async def _handle_rotator_error(self, error):
        """Handle rotator connection errors."""
        self.rotator_data.update({
            'connected': False, 'tracking': False, 'slewing': False,
            'stopped': False, 'error': True
        })

        async with AsyncSessionLocal() as dbsession:
            new_tracking_state = await crud.satellites.set_tracking_state(dbsession, {
                DictKeys.NAME: TrackingStateNames.SATELLITE_TRACKING,
                'value': {'rotator_state': 'disconnected'}
            })

        self.queue_out.put({
            DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
            DictKeys.DATA: {
                DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.ROTATOR_ERROR, "error": str(error)}],
                'rotator_data': self.rotator_data.copy(),
                'tracking_state': new_tracking_state[DictKeys.DATA]['value'],
            }
        })

        self.rotator_controller = None

    async def handle_rotator_state_change(self, old, new):
        """Handle rotator state changes."""
        logger.info(f"Rotator state change detected from '{old}' to '{new}'")

        self.rotator_data['minelevation'] = False

        if new == "connected":
            await self.connect_to_rotator()
            self.rotator_data['connected'] = True
            self.rotator_data['stopped'] = True
        elif new == "tracking":
            await self.connect_to_rotator()
            self.rotator_data['tracking'] = True
            self.rotator_data['stopped'] = False
        elif new == "stopped":
            self.rotator_data['tracking'] = False
            self.rotator_data['slewing'] = False
            self.rotator_data['stopped'] = True
        elif new == "disconnected":
            await self._disconnect_rotator()
            self.rotator_data['tracking'] = False
            self.rotator_data['stopped'] = True
        elif new == "parked":
            await self._park_rotator()
        else:
            logger.error(f"Unknown tracking state: {new}")

    async def _disconnect_rotator(self):
        """Disconnect from rotator."""
        if self.rotator_controller is not None:
            logger.info(f"Disconnecting from rotator at {self.rotator_controller.host}:{self.rotator_controller.port}...")
            try:
                await self.rotator_controller.disconnect()
                self.rotator_data['connected'] = False
                self.queue_out.put({
                    DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                    DictKeys.DATA: {
                        DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.ROTATOR_DISCONNECTED}],
                        'rotator_data': self.rotator_data.copy()
                    }
                })
            except Exception as e:
                logger.error(f"Error disconnecting from rotator: {e}")
                logger.exception(e)
            finally:
                self.rotator_controller = None

    async def _park_rotator(self):
        """Park the rotator."""
        self.rotator_data.update({'tracking': False, 'slewing': False})

        try:
            park_reply = await self.rotator_controller.park()
            if park_reply:
                self.rotator_data['parked'] = True
                self.queue_out.put({
                    DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                    DictKeys.DATA: {
                        DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.ROTATOR_PARKED}],
                        'rotator_data': self.rotator_data.copy()
                    }
                })
            else:
                raise Exception("Failed to park rotator")
        except Exception as e:
            logger.error(f"Failed to park rotator: {e}")
            logger.exception(e)

    async def handle_rotator_id_change(self, old, new):
        """Handle rotator ID changes."""
        logger.info(f"Rotator ID change detected from '{old}' to '{new}'")

    async def connect_to_rig(self):
        """Connect to rig hardware (radio or SDR)."""
        if self.current_rig_id is not None and self.rig_controller is None:
            try:
                async with AsyncSessionLocal() as dbsession:
                    # Try the hardware rig first
                    rig_details_reply = await crud.hardware.fetch_rigs(dbsession, rig_id=self.current_rig_id)

                    if rig_details_reply.get('data') is not None:
                        rig_type = 'radio'
                    else:
                        # Try SDR
                        rig_details_reply = await crud.hardware.fetch_sdr(dbsession, sdr_id=self.current_rig_id)
                        if not rig_details_reply.get('data', None):
                            raise Exception(f"No rig or SDR found with ID: {self.current_rig_id}")
                        rig_type = 'sdr'

                    rig_details = rig_details_reply['data']

                # Create appropriate controller
                if rig_type == 'sdr':
                    self.rig_controller = SDRController(sdr_details=rig_details)
                else:
                    self.rig_controller = RigController(host=rig_details['host'], port=rig_details['port'])

                await self.rig_controller.connect()

                # Update state
                self.rig_data.update({
                    'connected': True, 'tracking': False, 'tuning': False,
                    'device_type': rig_details.get('type', 'hardware')
                })

                self.queue_out.put({
                    DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                    DictKeys.DATA: {
                        DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.RIG_CONNECTED}],
                        'rig_data': self.rig_data.copy()
                    }
                })

            except Exception as e:
                logger.error(f"Failed to connect to rig: {e}")
                logger.exception(e)
                await self._handle_rig_error(e)

    async def _handle_rig_error(self, error):
        """Handle rig connection errors."""
        self.rig_data.update({
            'connected': False, 'tracking': False, 'tuning': False, 'error': True
        })

        async with AsyncSessionLocal() as dbsession:
            new_tracking_state = await crud.satellites.set_tracking_state(dbsession, {
                DictKeys.NAME: TrackingStateNames.SATELLITE_TRACKING,
                'value': {'rig_state': 'disconnected'}
            })

        self.queue_out.put({
            DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
            DictKeys.DATA: {
                DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.RIG_ERROR, "error": str(error)}],
                'rig_data': self.rig_data.copy(),
                'tracking_state': new_tracking_state[DictKeys.DATA]['value'],
            }
        })

        self.rig_controller = None

    async def handle_rig_state_change(self, old, new):
        """Handle rig state changes."""
        logger.info(f"Rig state change detected from '{old}' to '{new}'")

        if new == "connected":
            await self.connect_to_rig()
            self.rig_data['connected'] = True

        elif new == "disconnected":
            await self._disconnect_rig()
            self.rig_data['connected'] = False
            self.rig_data['tracking'] = False
            self.rig_data['stopped'] = True
        elif new == "tracking":
            await self.connect_to_rig()
            self.rig_data['tracking'] = True
            self.rig_data['stopped'] = False
        elif new == "stopped":
            self.rig_data['tracking'] = False
            self.rig_data['tuning'] = False
            self.rig_data['stopped'] = True

    async def _disconnect_rig(self):
        """Disconnect from rig."""
        if self.rig_controller is not None:
            logger.info("Disconnecting from rig...")
            try:
                await self.rig_controller.disconnect()
                self.rig_data.update({'connected': False, 'tracking': False, 'tuning': False})
                self.queue_out.put({
                    DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                    DictKeys.DATA: {
                        DictKeys.EVENTS: [{DictKeys.NAME: TrackingEvents.RIG_DISCONNECTED}],
                        'rig_data': self.rig_data.copy()
                    }
                })
            except Exception as e:
                logger.error(f"Error disconnecting from rig: {e}")
                logger.exception(e)
            finally:
                self.rig_controller = None

    async def handle_transmitter_id_change(self, old, new):
        """Handle transmitter ID changes."""
        logger.info(f"Transmitter ID change detected from '{old}' to '{new}'")

    async def handle_rig_id_change(self, old, new):
        """Handle rig ID changes."""
        logger.info(f"Rig ID change detected from '{old}' to '{new}'")

    def _check_state_changes(self):
        """Check for state changes and return list of changes."""
        changes = []

        if self.current_norad_id != self.prev_norad_id:
            changes.append(('satellite', self.prev_norad_id, self.current_norad_id))
            self.prev_norad_id = self.current_norad_id

        if self.current_rotator_state != self.prev_rotator_state:
            changes.append(('rotator_state', self.prev_rotator_state, self.current_rotator_state))
            self.prev_rotator_state = self.current_rotator_state

        if self.current_rotator_id != self.prev_rotator_id:
            changes.append(('rotator_id', self.prev_rotator_id, self.current_rotator_id))
            self.prev_rotator_id = self.current_rotator_id

        if self.current_rig_state != self.prev_rig_state:
            changes.append(('rig_state', self.prev_rig_state, self.current_rig_state))
            self.prev_rig_state = self.current_rig_state

        if self.current_transmitter_id != self.prev_transmitter_id:
            changes.append(('transmitter_id', self.prev_transmitter_id, self.current_transmitter_id))
            self.prev_transmitter_id = self.current_transmitter_id

        if self.current_rig_id != self.prev_rig_id:
            changes.append(('rig_id', self.prev_rig_id, self.current_rig_id))
            self.prev_rig_id = self.current_rig_id

        return changes

    async def _process_state_changes(self, changes):
        """Process all detected state changes."""
        for change_type, old, new in changes:
            if change_type == 'satellite':
                await self.handle_satellite_change(old, new)
            elif change_type == 'rotator_state':
                await self.handle_rotator_state_change(old, new)
            elif change_type == 'rotator_id':
                await self.handle_rotator_id_change(old, new)
            elif change_type == 'rig_state':
                await self.handle_rig_state_change(old, new)
            elif change_type == 'transmitter_id':
                await self.handle_transmitter_id_change(old, new)
            elif change_type == 'rig_id':
                await self.handle_rig_id_change(old, new)

    async def _process_commands(self):
        """Process incoming commands from the queue."""
        try:
            while not self.queue_in.empty():
                command = self.queue_in.get_nowait()
                logger.info(f"Received command: {command}")

                cmd_type = command.get('command')
                if cmd_type == TrackerCommands.STOP:
                    logger.info("Received stop command, exiting tracking task")
                    return True
                elif cmd_type == TrackerCommands.NUDGE_CLOCKWISE:
                    self.nudge_offset['az'] += 2
                elif cmd_type == TrackerCommands.NUDGE_COUNTER_CLOCKWISE:
                    self.nudge_offset['az'] -= 2
                elif cmd_type == TrackerCommands.NUDGE_UP:
                    self.nudge_offset['el'] += 2
                elif cmd_type == TrackerCommands.NUDGE_DOWN:
                    self.nudge_offset['el'] -= 2

        except Exception as e:
            logger.error(f"Error processing commands: {e}")

        return False  # Continue running

    async def _validate_hardware_states(self):
        """Validate that hardware states match database expectations."""
        # Check if rotator should be connected but isn't
        if self.current_rotator_state == "connected" and self.rotator_controller is None:
            logger.warning("Tracking state said rotator must be connected but it is not")

            async with AsyncSessionLocal() as dbsession:
                new_tracking_state = await crud.satellites.set_tracking_state(dbsession, {
                    DictKeys.NAME: TrackingStateNames.SATELLITE_TRACKING,
                    'value': {'rotator_state': 'disconnected'}
                })

            self.rotator_data['connected'] = False
            self.rotator_data['tracking'] = False
            self.rotator_data['stopped'] = True

            self.queue_out.put({
                DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                DictKeys.DATA: {
                    'rotator_data': self.rotator_data.copy(),
                    'tracking_state': new_tracking_state[DictKeys.DATA]['value'],
                }
            })

        # Check if rig should be connected but isn't
        if self.current_rig_state == "connected" and self.rig_controller is None:
            logger.warning("Tracking state said rig must be connected but it is not")

            async with AsyncSessionLocal() as dbsession:
                new_tracking_state = await crud.satellites.set_tracking_state(dbsession, {
                    DictKeys.NAME: TrackingStateNames.SATELLITE_TRACKING,
                    'value': {'rig_state': 'disconnected'}
                })

            self.rig_data['connected'] = False
            self.rig_data['tracking'] = False
            self.rig_data['stopped'] = True

            self.queue_out.put({
                DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                DictKeys.DATA: {
                    'rig_data': self.rig_data.copy(),
                    'tracking_state': new_tracking_state[DictKeys.DATA]['value'],
                }
            })

    async def _update_hardware_positions(self):
        """Update current hardware positions."""
        # Get rotator position
        if self.rotator_controller:
            self.rotator_data['az'], self.rotator_data['el'] = await self.rotator_controller.get_position()

        # Get rig frequency
        if self.rig_controller:
            self.rig_data['frequency'] = await self.rig_controller.get_frequency()

    def _check_position_limits(self, skypoint, satellite_name):
        """Check if satellite position is within limits."""
        events = []

        # Check azimuth limits
        if skypoint[0] > self.azimuth_limits[1] or skypoint[0] < self.azimuth_limits[0]:
            logger.debug(f"Azimuth out of bounds for satellite #{self.current_norad_id} {satellite_name}")
            if self.in_tracking_state() and not self.notified.get(TrackingEvents.AZIMUTH_OUT_OF_BOUNDS, False):
                events.append({DictKeys.NAME: TrackingEvents.AZIMUTH_OUT_OF_BOUNDS})
            self.notified[TrackingEvents.AZIMUTH_OUT_OF_BOUNDS] = True
            self.rotator_data['outofbounds'] = True
            self.rotator_data['stopped'] = True

        # Check elevation limits
        if skypoint[1] < self.elevation_limits[0] or skypoint[1] > self.elevation_limits[1]:
            logger.debug(f"Elevation out of bounds for satellite #{self.current_norad_id} {satellite_name}")
            if self.in_tracking_state() and not self.notified.get(TrackingEvents.ELEVATION_OUT_OF_BOUNDS, False):
                events.append({DictKeys.NAME: TrackingEvents.ELEVATION_OUT_OF_BOUNDS})
            self.notified[TrackingEvents.ELEVATION_OUT_OF_BOUNDS] = True
            self.rotator_data['outofbounds'] = True
            self.rotator_data['stopped'] = True

        # Check minimum elevation
        if skypoint[1] < self.min_elevation:
            logger.debug(f"Elevation below minimum ({self.min_elevation})° for satellite #{self.current_norad_id} {satellite_name}")
            if self.in_tracking_state() and not self.notified.get(TrackingEvents.MIN_ELEVATION_ERROR, False):
                events.append({DictKeys.NAME: TrackingEvents.MIN_ELEVATION_ERROR})
            self.notified[TrackingEvents.MIN_ELEVATION_ERROR] = True
            self.rotator_data['minelevation'] = True
            self.rotator_data['stopped'] = True

        # Send events if any
        if events:
            self.queue_out.put({
                DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                DictKeys.DATA: {DictKeys.EVENTS: events}
            })

    async def _handle_transmitter_tracking(self, satellite_tles, location):
        """Handle transmitter selection and doppler calculation."""
        if self.current_transmitter_id != "none":
            async with AsyncSessionLocal() as dbsession:
                current_transmitter_reply = await crud.satellites.fetch_transmitter(dbsession,
                                                                         transmitter_id=self.current_transmitter_id)
                current_transmitter = current_transmitter_reply.get('data', {})

            if current_transmitter:
                self.rig_data['original_freq'] = current_transmitter.get('downlink_low', 0)

                # Calculate doppler shift
                self.rig_data['observed_freq'], self.rig_data['doppler_shift'] = calculate_doppler_shift(
                    satellite_tles[0],
                    satellite_tles[1],
                    location['lat'],
                    location['lon'],
                    0,
                    current_transmitter.get('downlink_low', 0)
                )

                if self.current_rig_state == "tracking":
                    self.rig_data['tracking'] = True
                    self.rig_data['stopped'] = False

                else:
                    self.rig_data['observed_freq'] = 0
                    self.rig_data['doppler_shift'] = 0
                    self.rig_data['tracking'] = False
                    self.rig_data['stopped'] = True

            self.rig_data['transmitter_id'] = self.current_transmitter_id

        else:
            logger.debug("No satellite transmitter selected")
            self.rig_data['transmitter_id'] = self.current_transmitter_id
            self.rig_data['observed_freq'] = 0
            self.rig_data['doppler_shift'] = 0
            self.rig_data['tracking'] = False
            self.rig_data['stopped'] = True

    async def _control_rig_frequency(self):
        """Control rig frequency based on doppler calculations."""
        if self.rig_controller and self.current_rig_state == "tracking":
            frequency_gen = self.rig_controller.set_frequency(self.rig_data['observed_freq'])

            try:
                current_frequency, is_tuning = await anext(frequency_gen)
                self.rig_data['tuning'] = is_tuning

                logger.debug(f"Current frequency: {current_frequency}, tuning={is_tuning}")
            except StopAsyncIteration:
                logger.info(f"Tuning to frequency {self.rig_data['observed_freq']} complete")

    async def _control_rotator_position(self, skypoint):
        """Control rotator position for tracking or nudging."""
        if (self.rotator_controller and self.current_rotator_state == "tracking" and
                not self.rotator_data['outofbounds'] and not self.rotator_data['minelevation']):

            # Check if movement is needed
            if (abs(skypoint[0] - self.rotator_data['az']) > self.az_tolerance or
                    abs(skypoint[1] - self.rotator_data['el']) > self.el_tolerance):

                position_gen = self.rotator_controller.set_position(skypoint[0], skypoint[1])
                self.rotator_data['stopped'] = False

                try:
                    az, el, is_slewing = await anext(position_gen)
                    self.rotator_data['slewing'] = is_slewing
                    logger.debug(f"Current position: AZ={az}°, EL={el}°, slewing={is_slewing}")
                except StopAsyncIteration:
                    logger.info(f"Slewing to AZ={skypoint[0]}° EL={skypoint[1]}° complete")

        elif self.rotator_controller and self.current_rotator_state != "tracking":
            # Handle nudge commands when not tracking
            if self.nudge_offset['az'] != 0 or self.nudge_offset['el'] != 0:
                new_az = self.rotator_data['az'] + self.nudge_offset['az']
                new_el = self.rotator_data['el'] + self.nudge_offset['el']

                position_gen = self.rotator_controller.set_position(new_az, new_el)

                try:
                    az, el, is_slewing = await anext(position_gen)
                    self.rotator_data['slewing'] = is_slewing
                    logger.debug(f"Current position: AZ={az}°, EL={el}°, slewing={is_slewing}")
                except StopAsyncIteration:
                    logger.info(f"Slewing to AZ={az}° EL={el}° complete")

    def _cleanup_data_states(self):
        """Clean up temporary state flags."""
        # Clean up rotator_data
        self.rotator_data['slewing'] = False
        self.rotator_data['outofbounds'] = False
        self.rotator_data['minelevation'] = False
        self.rotator_data['error'] = False

        # Clean up rig_data
        self.rig_data['tuning'] = False
        self.rig_data['error'] = False

        # Reset nudge offset values
        self.nudge_offset = {'az': 0, 'el': 0}

    async def run(self):
        """Main tracking loop - this replaces the original function."""
        # Validate interval
        assert 0 < args.track_interval < 6, f"track_interval must be between 2 and 5, got {args.track_interval}"

        while True:
            # Process commands first
            should_stop = await self._process_commands()
            if should_stop:
                break

            try:
                self.start_loop_date = datetime.now(UTC)
                self.events = []

                # Get tracking data from database
                async with AsyncSessionLocal() as dbsession:

                    # Get tracking state from the db
                    tracking_state_reply = await crud.satellites.get_tracking_state(dbsession, name=TrackingStateNames.SATELLITE_TRACKING)
                    assert tracking_state_reply.get('success', False) is True, f"Error in satellite tracking task: {tracking_state_reply}"
                    assert tracking_state_reply['data']['value']['group_id'], f"No group id found in satellite tracking state: {tracking_state_reply}"
                    assert tracking_state_reply['data']['value']['norad_id'], f"No norad id found in satellite tracking state: {tracking_state_reply}"

                    # Fetch the location of the ground station
                    location_reply = await crud.locations.fetch_location_for_userid(dbsession, user_id=None)
                    location = location_reply['data']
                    tracker = tracking_state_reply['data']['value']

                    # Get a data dict that contains all the information for the target satellite
                    satellite_data = await compiled_satellite_data(dbsession, tracking_state_reply['data']['value']['norad_id'])
                    assert not satellite_data['error'], f"Could not compute satellite details for satellite {tracking_state_reply['data']['value']['norad_id']}"

                    satellite_tles = [satellite_data['details']['tle1'], satellite_data['details']['tle2']]
                    satellite_name = satellite_data['details']['name']

                # Update current state variables
                self.current_norad_id = tracker.get('norad_id', None)
                self.current_group_id = tracker.get('group_id', None)
                self.current_rotator_id = tracker.get('rotator_id', "none")
                self.current_rig_id = tracker.get('rig_id', "none")
                self.current_transmitter_id = tracker.get('transmitter_id', "none")
                self.current_rotator_state = tracker.get('rotator_state', "disconnected")
                self.current_rig_state = tracker.get('rig_state', "disconnected")

                # Check for state changes and handle them
                changes = self._check_state_changes()
                await self._process_state_changes(changes)

                # Validate hardware states
                await self._validate_hardware_states()

                # Update hardware positions
                await self._update_hardware_positions()

                # Work on sky coordinates
                skypoint = (satellite_data['position']['az'], satellite_data['position']['el'])

                # Check position limits
                self._check_position_limits(skypoint, satellite_name)

                # Log valid target
                logger.debug(f"We have a valid target (#{self.current_norad_id} {satellite_name}) at az: {skypoint[0]}° el: {skypoint[1]}°")

                # Handle transmitter tracking
                await self._handle_transmitter_tracking(satellite_tles, location)

                # Control rig frequency
                await self._control_rig_frequency()

                # Control rotator position
                await self._control_rotator_position(skypoint)

            except Exception as e:
                logger.error(f"Error in satellite tracking task: {e}")
                logger.exception(e)

            finally:
                # Send updates via the queue
                try:
                    full_msg = {
                        DictKeys.EVENT: SocketEvents.SATELLITE_TRACKING,
                        DictKeys.DATA: {
                            'satellite_data': satellite_data,
                            DictKeys.EVENTS: self.events.copy(),
                            'rotator_data': self.rotator_data.copy(),
                            'rig_data': self.rig_data.copy(),
                            'tracking_state': tracker.copy(),
                        }
                    }
                    logger.debug(f"Sending satellite tracking data: \n{pretty_dict(full_msg)}")
                    self.queue_out.put(full_msg)

                except Exception as e:
                    logger.critical(f"Error sending satellite tracking data: {e}")
                    logger.exception(e)

                # Calculate sleep time
                loop_duration = round((datetime.now(UTC) - self.start_loop_date).total_seconds(), 2)

                if loop_duration > args.track_interval:
                    logger.warning(f"Single tracking loop iteration took longer ({loop_duration}) than the configured "
                                   f"interval ({args.track_interval})")

                remaining_time_to_sleep = max((args.track_interval - loop_duration), 0)

                # Clean up data states
                self._cleanup_data_states()

                # Check if stop_event is set before sleeping
                if self.stop_event and self.stop_event.is_set():
                    logger.info("Stop event detected, exiting tracking task")
                    break

                logger.debug(f"Waiting for {round(remaining_time_to_sleep, 2)} seconds before next update "
                             f"(already spent {round(loop_duration, 2)})...")
                await asyncio.sleep(remaining_time_to_sleep)


async def satellite_tracking_task(queue_out: multiprocessing.Queue, queue_in: multiprocessing.Queue, stop_event=None):
    """
    Wrapper function that creates and runs a SatelliteTracker instance.
    This maintains compatibility with existing multiprocessing code.

    Periodically tracks and transmits satellite position and details along with user location data
    using multiprocessing Queue instead of Socket.IO for inter-process communication.

    This function performs satellite tracking by retrieving tracking states, determining current
    satellite position, and calculating azimuth and elevation values based on user geographic
    location. Data retrieval is achieved through database queries for satellite and user
    information, and updates are transmitted via the queue_out Queue.

    :param queue_out: Queue to send tracking data to the main process
    :type queue_out: multiprocessing.Queue
    :param queue_in: Queue to receive commands from the main process
    :type queue_in: multiprocessing.Queue
    :param stop_event: Event to signal this function to stop execution
    :type stop_event: multiprocessing.Event
    :return: None
    """
    tracker = SatelliteTracker(queue_out, queue_in, stop_event)
    await tracker.run()