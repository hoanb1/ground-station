/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import CableIcon from '@mui/icons-material/Cable';
import SyncIcon from '@mui/icons-material/Sync';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import RadioIcon from '@mui/icons-material/Radio';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ExploreIcon from '@mui/icons-material/Explore';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import { store } from '../components/common/store.jsx';
import { setSyncState } from '../components/satellites/synchronize-slice.jsx';
import { setSatelliteData, setUITrackerValues } from '../components/target/target-slice.jsx';
import { setSynchronizing } from '../components/satellites/synchronize-slice.jsx';
import { initializeAppData } from '../services/data-sync.js';

/**
 * Custom hook to handle all socket event listeners
 * @param {Object} socket - Socket.IO connection instance
 */
export const useSocketEventHandlers = (socket) => {
    const dispatch = useDispatch();

    useEffect(() => {
        if (!socket) return;

        // Connection event
        socket.on('connect', async () => {
            console.log('Socket connected with ID:', socket.id);
            toast.success("Connected to backend", {
                icon: <CableIcon />,
            });
            initializeAppData(socket);
        });

        // Reconnection attempt event
        socket.on("reconnect_attempt", (attempt) => {
            toast(`Reconnecting to backend (attempt ${attempt})`, {
                icon: <SyncIcon />,
            });
        });

        // Error event
        socket.on("error", (error) => {
            toast.error(`Connection error: ${error}`, {
                icon: <ErrorOutlineIcon />,
            });
        });

        // Disconnect event
        socket.on('disconnect', () => {
            toast.error("Lost connection to backend", {
                icon: <CableIcon />,
            });
        });

        // Satellite sync events
        socket.on("sat-sync-events", (data) => {
            store.dispatch(setSyncState(data));

            if (data.status === 'complete' && data.success) {
                const newSats = data.newly_added?.satellites?.length || 0;
                const newTransmitters = data.newly_added?.transmitters?.length || 0;
                const modifiedSats = data.modified?.satellites?.length || 0;
                const modifiedTransmitters = data.modified?.transmitters?.length || 0;
                const removedSats = data.removed?.satellites?.length || 0;
                const removedTransmitters = data.removed?.transmitters?.length || 0;

                let details = [];
                if (newSats > 0 || newTransmitters > 0) {
                    details.push(`New: ${newSats} sats, ${newTransmitters} transmitters`);
                }
                if (modifiedSats > 0 || modifiedTransmitters > 0) {
                    details.push(`Modified: ${modifiedSats} sats, ${modifiedTransmitters} transmitters`);
                }
                if (removedSats > 0 || removedTransmitters > 0) {
                    details.push(`Removed: ${removedSats} sats, ${removedTransmitters} transmitters`);
                }

                const message = details.length > 0
                    ? `TLE sync complete! ${details.join(' • ')}`
                    : 'TLE sync complete! No changes detected';

                toast.success(message, {
                    icon: <SatelliteAltIcon />,
                    duration: 6000,
                });
                dispatch(setSynchronizing(false));
            }
        });

        // UI tracker state event
        socket.on("ui-tracker-state", (data) => {
            store.dispatch(setUITrackerValues(data));
        });

        // Satellite tracking events
        socket.on("satellite-tracking", (data) => {
            store.dispatch(setSatelliteData(data));
            if (data['events']) {
                data['events'].forEach(event => {
                    if (event.name === 'rotator_connected') {
                        toast.success("Rotator connected", {
                            icon: <SettingsInputAntennaIcon />,
                        });
                    } else if (event.name === 'rotator_disconnected') {
                        toast("Rotator disconnected", {
                            icon: <SettingsInputAntennaIcon />,
                        });
                    } else if (event.name === 'rig_connected') {
                        toast.success("Radio connected", {
                            icon: <RadioIcon />,
                        });
                    } else if (event.name === 'rig_disconnected') {
                        toast("Radio disconnected", {
                            icon: <RadioIcon />,
                        });
                    } else if (event.name === 'elevation_out_of_bounds') {
                        toast.error("Target elevation out of bounds", {
                            icon: <ArrowUpwardIcon />,
                        });
                    } else if (event.name === 'azimuth_out_of_bounds') {
                        toast.error("Target azimuth out of bounds", {
                            icon: <ExploreIcon />,
                        });
                    } else if (event.name === 'minelevation_error') {
                        toast.error("Target below minimum elevation", {
                            icon: <ArrowDownwardIcon />,
                        });
                    } else if (event.name === 'norad_id_change') {
                        toast("Target satellite changed", {
                            icon: <SatelliteAltIcon />,
                        });
                    } else if (event.name === 'rotator_error') {
                        toast.error(event.error, {
                            icon: <SettingsInputAntennaIcon />,
                        });
                    } else if (event.name === 'rig_error') {
                        toast.error(event.error, {
                            icon: <RadioIcon />,
                        });
                    }
                });
            }
        });

        // Cleanup function
        return () => {
            socket.off('connect');
            socket.off('reconnect_attempt');
            socket.off('error');
            socket.off('disconnect');
            socket.off("sat-sync-events");
            socket.off("satellite-tracking");
            socket.off("ui-tracker-state");
        };
    }, [socket, dispatch]);
};
