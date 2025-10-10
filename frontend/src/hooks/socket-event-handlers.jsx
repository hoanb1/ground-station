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
            console.log('Socket connected with ID:', socket.id, socket);

            toast.success(
                <div>
                    <div style={{fontWeight: 600, marginBottom: '4px'}}>Connected to backend</div>
                    <div style={{fontSize: '13px', opacity: 0.9}}>
                        {socket.io.opts.secure ? 'wss://' : 'ws://'}{socket.io.opts.hostname}:{socket.io.opts.port}{socket.io.opts.path}
                    </div>
                </div>,
                {
                    icon: <CableIcon/>,
                }
            );
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
                    ? (
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>TLE sync complete!</div>
                            {details.map((detail, index) => (
                                <div key={index} style={{ fontSize: '13px', opacity: 0.9 }}>{detail}</div>
                            ))}
                        </div>
                    )
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
        socket.on("satellite-tracking", (message) => {
            store.dispatch(setSatelliteData(message));
            if (message['events']) {
                message['events'].forEach(event => {
                    if (event.name === 'rotator_connected') {
                        const rotatorData = message['rotator_data'];
                        toast.success(
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Rotator connected</div>
                                <div style={{ fontSize: '13px', opacity: 0.9 }}>{rotatorData.host}:{rotatorData.port}</div>
                            </div>,
                            {
                                icon: <SettingsInputAntennaIcon />,
                            }
                        );
                    } else if (event.name === 'rotator_disconnected') {
                        const rotatorData = message['rotator_data'];
                        toast(
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Rotator disconnected</div>
                                <div style={{ fontSize: '13px', opacity: 0.9 }}>{rotatorData.host}:{rotatorData.port}</div>
                            </div>,
                            {
                                icon: <SettingsInputAntennaIcon />,
                                type: 'warning',
                            }
                        );
                    } else if (event.name === 'rig_connected') {
                        const rigData = message['rig_data'];
                        toast.success(
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Radio connected</div>
                                <div style={{ fontSize: '13px', opacity: 0.9 }}>{rigData.host}:{rigData.port}</div>
                            </div>,
                            {
                                icon: <RadioIcon />,
                            }
                        );
                    } else if (event.name === 'rig_disconnected') {
                        const rigData = message['rig_data'];
                        toast(
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Radio disconnected</div>
                                <div style={{ fontSize: '13px', opacity: 0.9 }}>{rigData.host}:{rigData.port}</div>
                            </div>,
                            {
                                icon: <RadioIcon />,
                                type: 'warning',
                            }
                        );
                    } else if (event.name === 'elevation_out_of_bounds') {
                        const satelliteData = message['data']?.['satellite_data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.error(
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Elevation of target below the horizon</div>
                                <div style={{ fontSize: '13px', opacity: 0.9 }}>{satName} (NORAD {noradId})</div>
                            </div>,
                            {
                                icon: <ArrowUpwardIcon />,
                            }
                        );
                    } else if (event.name === 'azimuth_out_of_bounds') {
                        const satelliteData = message['data']?.['satellite_data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.error(
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Target azimuth out of bounds</div>
                                <div style={{ fontSize: '13px', opacity: 0.9 }}>{satName} (NORAD {noradId})</div>
                            </div>,
                            {
                                icon: <ExploreIcon />,
                            }
                        );
                    } else if (event.name === 'minelevation_error') {
                        const satelliteData = message['data']?.['satellite_data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.error(
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Target below minimum elevation</div>
                                <div style={{ fontSize: '13px', opacity: 0.9 }}>{satName} (NORAD {noradId})</div>
                            </div>,
                            {
                                icon: <ArrowDownwardIcon />,
                            }
                        );
                    } else if (event.name === 'norad_id_change') {
                        const satelliteData = message['data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast(
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Target satellite changed</div>
                                <div style={{ fontSize: '13px', opacity: 0.9 }}>{satName} (NORAD {noradId})</div>
                            </div>,
                            {
                                icon: <SatelliteAltIcon />,
                                type: 'info',
                            }
                        );
                    } else if (event.name === 'rotator_error') {
                        const rotatorData = message['rotator_data'];
                        toast.error(
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{event.error}</div>
                                <div style={{ fontSize: '13px', opacity: 0.9 }}>{rotatorData.host}:{rotatorData.port}</div>
                            </div>,
                            {
                                icon: <SettingsInputAntennaIcon />,
                            }
                        );
                    } else if (event.name === 'rig_error') {
                        const rigData = message['rig_data'];
                        toast.error(
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{event.error}</div>
                                <div style={{ fontSize: '13px', opacity: 0.9 }}>{rigData.host}:{rigData.port}</div>
                            </div>,
                            {
                                icon: <RadioIcon />,
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
