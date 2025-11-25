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
import { toast } from '../utils/toast-with-timestamp.jsx';
import CableIcon from '@mui/icons-material/Cable';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { fetchPreferences } from '../components/settings/preferences-slice.jsx';

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
import {
    setIsRecording,
    setRecordingDuration,
    setRecordingStartTime,
    setCenterFrequency,
    setSampleRate,
    setGain,
    setFFTSize,
    setFFTWindow,
    setBiasT,
    setTunerAgc,
    setRtlAgc,
    setFFTAveraging,
    setIsStreaming,
    setErrorMessage,
    setErrorDialogOpen,
    setStartStreamingLoading,
} from '../components/waterfall/waterfall-slice.jsx';
import { updateAllVFOStates, setVFOProperty } from '../components/waterfall/vfo-slice.jsx';
import { fetchFiles } from '../components/filebrowser/filebrowser-slice.jsx';
import { setConnected, setConnecting, setReConnectAttempt } from '../components/dashboard/dashboard-slice.jsx';
import {
    decoderStatusChanged,
    decoderProgressUpdated,
    decoderOutputReceived,
    decoderErrorOccurred,
    setCurrentSessionId,
    cleanupStaleDecoders
} from '../components/decoders/decoders-slice.jsx';
import { updateMetrics } from '../components/performance/performance-slice.jsx';
import ImageIcon from '@mui/icons-material/Image';

/**
 * Custom hook to handle all socket event listeners
 * @param {Object} socket - Socket.IO connection instance
 */
export const useSocketEventHandlers = (socket) => {
    const { t } = useTranslation('common');
    const dispatch = useDispatch();

    useEffect(() => {
        if (!socket) return;

        // Connection event
        socket.on('connect', async () => {
            console.log('Socket connected with ID:', socket.id, socket);

            // Update connection state
            dispatch(setConnecting(false));
            dispatch(setConnected(true));

            // Update current session ID and clean up stale decoders from previous sessions
            store.dispatch(setCurrentSessionId(socket.id));

            // Clean up any stale decoder entries that survived persistence
            // This handles the case where Redux persisted state has decoders from old sessions
            setTimeout(() => {
                store.dispatch(cleanupStaleDecoders());
            }, 1000);

            // Load preferences first to ensure toast position is correct
            await store.dispatch(fetchPreferences({socket}));

            toast.success(
                <ToastMessage
                    title={t('notifications.connection.connected_to_backend')}
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
            dispatch(setReConnectAttempt(attempt));
            toast.info(
                <ToastMessage
                    title={t('notifications.connection.reconnecting_to_backend')}
                    body={t('notifications.connection.attempt', { attempt })}
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
                    title={t('notifications.connection.connection_error')}
                    body={error}
                />,
                {
                    icon: () => <ErrorOutlineIcon />,
                }
            );
        });

        // Disconnect event
        socket.on('disconnect', () => {
            // Update connection state
            dispatch(setConnecting(true));
            dispatch(setConnected(false));

            toast.error(
                <ToastMessage
                    title={t('notifications.connection.lost_connection')}
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
                    details.push(t('notifications.sync.new_items', { satellites: newSats, transmitters: newTransmitters }));
                }
                if (modifiedSats > 0 || modifiedTransmitters > 0) {
                    details.push(t('notifications.sync.modified_items', { satellites: modifiedSats, transmitters: modifiedTransmitters }));
                }
                if (removedSats > 0 || removedTransmitters > 0) {
                    details.push(t('notifications.sync.removed_items', { satellites: removedSats, transmitters: removedTransmitters }));
                }

                const body = details.length > 0 ? details.join('\n') : t('notifications.sync.no_changes');

                toast.success(
                    <ToastMessage
                        title={t('notifications.sync.tle_sync_complete')}
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

        // File browser state updates (pub/sub model)
        socket.on("file_browser_state", (state) => {

            switch (state.action) {
                case 'list-files':
                    // Manually dispatch fulfilled action with actual data (not pending)
                    // Backend now returns all files, frontend handles pagination
                    store.dispatch({
                        type: 'filebrowser/fetchFiles/fulfilled',
                        payload: {
                            items: state.items,
                            diskUsage: state.diskUsage,
                            pending: false,
                        },
                    });
                    break;

                case 'delete-recording':
                case 'delete-snapshot':
                case 'delete-decoded':
                    toast.success(state.message || t('notifications.file_browser.item_deleted'));
                    break;

                case 'recording-started':
                case 'recording-stopped':
                case 'snapshot-saved':
                case 'decoded-saved':
                    // These events trigger refetch in components
                    break;

                default:
                    console.warn('Unknown file browser action:', state.action);
            }
        });

        // File browser errors
        socket.on("file_browser_error", (errorData) => {
            console.error('File browser error:', errorData);
            toast.error(errorData.error || t('notifications.file_browser.error'));
        });

        // Recording state updates (pub/sub model)
        socket.on("recording_state", (state) => {
            console.log('Recording state received:', state);

            switch (state.action) {
                case 'started':
                    if (state.success) {
                        store.dispatch(setIsRecording(true));
                        store.dispatch(setRecordingDuration(0));
                        store.dispatch(setRecordingStartTime(new Date().toISOString()));
                        toast.success(t('notifications.recording.started'));
                    }
                    break;

                case 'stopped':
                    if (state.success) {
                        store.dispatch(setIsRecording(false));
                        store.dispatch(setRecordingDuration(0));
                        store.dispatch(setRecordingStartTime(null));
                        toast.success(t('notifications.recording.stopped'));
                    }
                    break;

                case 'start-failed':
                    toast.error(t('notifications.recording.start_failed', { error: state.error }));
                    break;

                case 'stop-failed':
                    toast.error(t('notifications.recording.stop_failed', { error: state.error }));
                    break;
            }
        });

        // VFO states are now managed entirely in the UI
        // Backend no longer sends vfo-states or vfo-frequency-update events

        // SDR configuration error events
        socket.on('sdr-config-error', (error) => {
            store.dispatch(setErrorMessage(error.message));
            store.dispatch(setErrorDialogOpen(true));
            store.dispatch(setStartStreamingLoading(false));
            toast.error(`Failed to configure SDR: ${error.message}`);
        });

        // SDR error events
        socket.on('sdr-error', (error) => {
            store.dispatch(setErrorMessage(error.message));
            store.dispatch(setErrorDialogOpen(true));
            store.dispatch(setStartStreamingLoading(false));
            // Stop streaming on error - waterfall component will handle animation cleanup
            store.dispatch(setIsStreaming(false));
        });

        // SDR configuration updates
        socket.on('sdr-config', (data) => {
            store.dispatch(setCenterFrequency(data['center_freq']));
            store.dispatch(setSampleRate(data['sample_rate']));
            store.dispatch(setGain(data['gain']));
            store.dispatch(setFFTSize(data['fft_size']));
            store.dispatch(setFFTWindow(data['fft_window']));
            store.dispatch(setBiasT(data['bias_t']));
            store.dispatch(setTunerAgc(data['tuner_agc']));
            store.dispatch(setRtlAgc(data['rtl_agc']));
            store.dispatch(setFFTAveraging(data['fft_averaging']));
        });

        // SDR streaming status
        socket.on('sdr-status', (data) => {
            if (data['streaming'] === true) {
                store.dispatch(setIsStreaming(true));
                store.dispatch(setStartStreamingLoading(false));
            } else if (data['streaming'] === false) {
                store.dispatch(setIsStreaming(false));
                store.dispatch(setStartStreamingLoading(false));
            }
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
                                title={t('notifications.rotator.connected')}
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
                                title={t('notifications.rotator.disconnected')}
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
                                title={t('notifications.radio.connected')}
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
                                title={t('notifications.radio.disconnected')}
                                body={`${rigData.host}:${rigData.port}`}
                            />,
                            {
                                icon: () => <RadioIcon />,
                            }
                        );
                    } else if (event.name === 'min_elevation_out_of_bounds') {
                        const satelliteData = message['data']?.['satellite_data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.error(
                            <ToastMessage
                                title={t('notifications.tracking.below_min_elevation')}
                                body={t('notifications.tracking.satellite_info', { name: satName, noradId })}
                            />,
                            {
                                icon: () => <ArrowDownwardIcon />,
                            }
                        );
                    } else if (event.name === 'max_elevation_out_of_bounds') {
                        const satelliteData = message['data']?.['satellite_data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.error(
                            <ToastMessage
                                title={t('notifications.tracking.above_max_elevation')}
                                body={t('notifications.tracking.satellite_info', { name: satName, noradId })}
                            />,
                            {
                                icon: () => <ArrowUpwardIcon />,
                            }
                        );
                    } else if (event.name === 'min_azimuth_out_of_bounds') {
                        const satelliteData = message['data']?.['satellite_data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.error(
                            <ToastMessage
                                title={t('notifications.tracking.below_min_azimuth')}
                                body={t('notifications.tracking.satellite_info', { name: satName, noradId })}
                            />,
                            {
                                icon: () => <ExploreIcon />,
                            }
                        );
                    } else if (event.name === 'max_azimuth_out_of_bounds') {
                        const satelliteData = message['data']?.['satellite_data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.error(
                            <ToastMessage
                                title={t('notifications.tracking.above_max_azimuth')}
                                body={t('notifications.tracking.satellite_info', { name: satName, noradId })}
                            />,
                            {
                                icon: () => <ExploreIcon />,
                            }
                        );
                    } else if (event.name === 'norad_id_change') {
                        const satelliteData = message['data'];
                        const satName = satelliteData?.details?.name || 'Unknown';
                        const noradId = satelliteData?.details?.norad_id || '';
                        toast.info(
                            <ToastMessage
                                title={t('notifications.tracking.satellite_changed')}
                                body={t('notifications.tracking.satellite_info', { name: satName, noradId })}
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

        // Performance metrics events
        socket.on('performance-metrics', (data) => {
            store.dispatch(updateMetrics(data));
        });

        // Decoder data events (SSTV, AFSK, Morse, GMSK, etc.)
        socket.on('decoder-data', (data) => {
            switch (data.type) {
                case 'decoder-status':
                    store.dispatch(decoderStatusChanged({
                        session_id: data.session_id,
                        status: data.status,
                        mode: data.mode,
                        decoder_type: data.decoder_type,
                        vfo: data.vfo,
                        timestamp: data.timestamp,
                        progress: data.progress,
                        info: data.info  // Include decoder configuration info (baudrate, framing, etc.)
                    }));
                    break;

                case 'decoder-progress':
                    store.dispatch(decoderProgressUpdated({
                        session_id: data.session_id,
                        vfo: data.vfo,
                        progress: data.progress,
                        timestamp: data.timestamp
                    }));
                    break;

                case 'decoder-output': {
                    store.dispatch(decoderOutputReceived(data));

                    // Show toast notification only for SSTV (image output)
                    // Morse and other text-based decoders are too frequent for toasts
                    if (data.decoder_type === 'sstv' && data.output.image_data) {
                        const outputType = data.output.format;
                        const fileName = data.output.filename;
                        const imageData = data.output.image_data;

                        toast.success(
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <ToastMessage
                                    title={t('notifications.decoder.output_received')}
                                    body={`${data.decoder_type.toUpperCase()}: ${fileName}`}
                                />
                                <Box
                                    component="img"
                                    src={`data:${outputType};base64,${imageData}`}
                                    alt={fileName}
                                    sx={{
                                        maxWidth: '100%',
                                        maxHeight: '200px',
                                        objectFit: 'contain',
                                        borderRadius: '4px',
                                        marginTop: '8px'
                                    }}
                                />
                            </Box>,
                            {
                                icon: () => <ImageIcon />,
                                autoClose: 10000,
                            }
                        );
                    }
                    break;
                }

                case 'decoder-error':
                    store.dispatch(decoderErrorOccurred(data));
                    break;

                default:
                    console.warn('Unknown decoder event type:', data.type);
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
            socket.off("file_browser_state");
            socket.off("file_browser_error");
            socket.off("recording_state");
            socket.off("vfo-states");
            socket.off("vfo-frequency-update");
            socket.off("sdr-config-error");
            socket.off("sdr-error");
            socket.off("sdr-config");
            socket.off("sdr-status");
            socket.off("performance-metrics");
            socket.off("decoder-data");
        };
    }, [socket, dispatch, t]);
};
