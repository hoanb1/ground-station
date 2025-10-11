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
import { toast } from 'react-toastify';
import CableIcon from '@mui/icons-material/Cable';

// Toast message component with title and body
const ToastMessage = ({ title, body }) => (
    <div>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>{title}</div>
        {body && <div style={{ fontSize: '13px', opacity: 0.9 }}>{body}</div>}
    </div>
);
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
            console.log('Socket connected with ID:', socket.id, socket);

            toast.success(
                <ToastMessage
                    title="Connected to backend"
                    body={`${socket.io.opts.secure ? 'wss://' : 'ws://'}${socket.io.opts.hostname}:${socket.io.opts.port}${socket.io.opts.path}`}
                />,
                {
                    icon: () => <CableIcon/>,
                }
            );
            initializeAppData(socket);
        });

        // Reconnection attempt event
        socket.on("reconnect_attempt", (attempt) => {
            toast.info(
                <ToastMessage
                    title="Reconnecting to backend"
                    body={`Attempt ${attempt}`}
                />,
                {
                    icon: () => <SyncIcon />,
                }
            );
        });

        // Error event
        socket.on("error", (error) => {
            toast.error(
                <ToastMessage
                    title="Connection error"
                    body={error}
                />,
                {
                    icon: () => <ErrorOutlineIcon />,
                }
            );
        });

        // Disconnect event
        socket.on('disconnect', () => {
            toast.error(
                <ToastMessage
                    title="Lost connection to backend"
                />,
                {
                    icon: () => <CableIcon />,
                }
            );
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
                    details.push(`New: ${newSats} satellites, ${newTransmitters} transmitters`);
                }
                if (modifiedSats > 0 || modifiedTransmitters > 0) {
                    details.push(`Modified: ${modifiedSats} satellites, ${modifiedTransmitters} transmitters`);
                }
                if (removedSats > 0 || removedTransmitters > 0) {
                    details.push(`Removed: ${removedSats} satellites, ${removedTransmitters} transmitters`);
                }

                const body = details.length > 0 ? details.join('\n') : 'No changes detected';

                toast.success(
                    <ToastMessage
                        title="TLE sync complete!"
                        body={body}
                    />,
                    {
                        icon: () => <SatelliteAltIcon />,
                        autoClose: 6000,
                    }
                );
                dispatch(setSynchronizing(false));
            }
        });

        // UI tracker state event
        socket.on("ui-tracker-state", (data) => {
            store.dispatch(setUITrackerValues(data));
        });

        // Satellite tracking events
        socket.on("satellite-tracking", (message) => {
            store.dispatch(setSatelliteData(message));
            if (message['events']) {
                message['events'].forEach(event => {
                    if (event.name === 'rotator_connected') {
                        const rotatorData = message['rotator_data'];
                        toast.success(
                            <ToastMessage
                                title="Rotator connected"
                                body={`${rotatorData.host}:${rotatorData.port}`}
                            />,
                            {
                                icon: () => <SettingsInputAntennaIcon />,
                            }
                        );
                    } else if (event.name === 'rotator_disconnected') {
                        const rotatorData = message['rotator_data'];
                        toast.warning(
                            <ToastMessage
                                title="Rotator disconnected"
                                body={`${rotatorData.host}:${rotatorData.port}`}
                            />,
                            {
                                icon: () => <SettingsInputAntennaIcon />,
                            }
                        );
                    } else if (event.name === 'rig_connected') {
                        const rigData = message['rig_data'];
                        toast.success(
                            <ToastMessage
                                title="Radio connected"
                                body={`${rigData.host}:${rigData.port}`}
                            />,
                            {
                                icon: () => <RadioIcon />,
                            }
                        );
                    } else if (event.name === 'rig_disconnected') {
                        const rigData = message['rig_data'];
                        toast.warning(
                            <ToastMessage
                                title="Radio disconnected"
                                body={`${rigData.host}:${rigData.port}`}
                            />,
                            {
                                icon: () => <RadioIcon />,
                            }
                        );
                    } else if (event.name === 'elevation_out_of_bounds') {
                        const satelliteData = message['data']?.['satellite_data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.error(
                            <ToastMessage
                                title="Elevation of target below the horizon"
                                body={`${satName} (NORAD ${noradId})`}
                            />,
                            {
                                icon: () => <ArrowUpwardIcon />,
                            }
                        );
                    } else if (event.name === 'azimuth_out_of_bounds') {
                        const satelliteData = message['data']?.['satellite_data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.error(
                            <ToastMessage
                                title="Target azimuth out of bounds"
                                body={`${satName} (NORAD ${noradId})`}
                            />,
                            {
                                icon: () => <ExploreIcon />,
                            }
                        );
                    } else if (event.name === 'minelevation_error') {
                        const satelliteData = message['data']?.['satellite_data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.error(
                            <ToastMessage
                                title="Target below minimum elevation"
                                body={`${satName} (NORAD ${noradId})`}
                            />,
                            {
                                icon: () => <ArrowDownwardIcon />,
                            }
                        );
                    } else if (event.name === 'norad_id_change') {
                        const satelliteData = message['data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.info(
                            <ToastMessage
                                title="Target satellite changed"
                                body={`${satName} (NORAD ${noradId})`}
                            />,
                            {
                                icon: () => <SatelliteAltIcon />,
                            }
                        );
                    } else if (event.name === 'rotator_error') {
                        const rotatorData = message['rotator_data'];
                        toast.error(
                            <ToastMessage
                                title={event.error}
                                body={`${rotatorData.host}:${rotatorData.port}`}
                            />,
                            {
                                icon: () => <SettingsInputAntennaIcon />,
                            }
                        );
                    } else if (event.name === 'rig_error') {
                        const rigData = message['rig_data'];
                        toast.error(
                            <ToastMessage
                                title={event.error}
                                body={`${rigData.host}:${rigData.port}`}
                            />,
                            {
                                icon: () => <RadioIcon />,
                            }
                        );
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
