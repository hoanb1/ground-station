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

import React, { useRef } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    Box,
    Typography,
    Paper,
    Grid2,
    Chip,
    Divider,
    Stack
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useSelector, useDispatch } from 'react-redux';
import { setDialogOpen } from './performance-slice.jsx';
import ConnectionVisualizer from './connection-visualizer.jsx';
import { useSocket } from '../common/socket.jsx';

const PerformanceMetricsDialog = () => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const open = useSelector((state) => state.performance.dialogOpen);
    const metrics = useSelector((state) => state.performance.latestMetrics);
    const connected = useSelector((state) => state.performance.connected);
    const containerRef = useRef(null);

    const handleClose = () => {
        dispatch(setDialogOpen(false));
        if (socket) {
            socket.emit('stop-monitoring');
        }
    };

    const formatRate = (rate) => {
        if (rate === null || rate === undefined) return 'N/A';

        // Humanize large rates
        if (rate >= 1000000) {
            return (rate / 1000000).toFixed(2) + 'M';
        } else if (rate >= 1000) {
            return (rate / 1000).toFixed(2) + 'K';
        }
        return rate.toFixed(2);
    };

    const formatNumber = (num) => {
        if (num === null || num === undefined) return 'N/A';

        // Humanize large numbers
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(2) + 'B';
        } else if (num >= 1000000) {
            return (num / 1000000).toFixed(2) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(2) + 'K';
        }
        return num.toLocaleString();
    };

    const MetricCard = ({ title, children, statusChip }) => (
        <Paper
            elevation={2}
            sx={{
                p: 2,
                height: '100%',
                backgroundColor: (theme) => theme.palette.background?.paper || theme.palette.background.paper,
                border: 1,
                borderColor: (theme) => theme.palette.border?.main || 'divider',
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                    {title}
                </Typography>
                {statusChip}
            </Box>
            <Box sx={{ mt: 1 }}>{children}</Box>
        </Paper>
    );

    const MetricRow = ({ label, value, unit }) => (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
                {label}:
            </Typography>
            <Typography variant="body2" fontWeight="medium">
                {value} {unit && <span style={{ fontSize: '0.85em', opacity: 0.7 }}>{unit}</span>}
            </Typography>
        </Box>
    );

    const renderBroadcasters = (sdrId, broadcasters) => {
        if (!broadcasters || Object.keys(broadcasters).length === 0) return null;

        return Object.entries(broadcasters).map(([broadcasterId, broadcaster]) => {
            const isIQ = broadcaster.broadcaster_type === 'iq';
            const title = isIQ
                ? `IQ Broadcaster - ${sdrId}`
                : `Audio Broadcaster - ${broadcaster.session_id} ${broadcaster.decoder_name}`;

            return (
                <Grid2 size={{ xs: 12, md: 6 }} key={broadcasterId}>
                    <Box data-component-id={broadcaster.broadcaster_id}>
                        <MetricCard
                            title={title}
                            statusChip={
                                <Chip
                                    label={broadcaster.is_alive ? 'Running' : 'Stopped'}
                                    size="small"
                                    color={broadcaster.is_alive ? 'success' : 'error'}
                                />
                            }
                        >
                        <Stack spacing={0.5}>
                            {isIQ && (
                                <>
                                    <MetricRow
                                        label="Messages In"
                                        value={formatNumber(broadcaster.stats?.messages_in)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(broadcaster.rates?.messages_in_per_sec)}
                                        unit="msg/s"
                                    />
                                    <MetricRow
                                        label="Messages Broadcast"
                                        value={formatNumber(broadcaster.stats?.messages_broadcast)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(broadcaster.rates?.messages_broadcast_per_sec)}
                                        unit="msg/s"
                                    />
                                    <MetricRow
                                        label="Source Queue"
                                        value={broadcaster.source_queue_size}
                                    />
                                    <MetricRow
                                        label="Dropped"
                                        value={formatNumber(broadcaster.stats?.messages_dropped)}
                                    />
                                </>
                            )}
                            {!isIQ && (
                                <>
                                    <MetricRow
                                        label="Messages Received"
                                        value={formatNumber(broadcaster.stats?.messages_received)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(broadcaster.rates?.messages_received_per_sec)}
                                        unit="msg/s"
                                    />
                                    <MetricRow
                                        label="Messages Broadcast"
                                        value={formatNumber(broadcaster.stats?.messages_broadcast)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(broadcaster.rates?.messages_broadcast_per_sec)}
                                        unit="msg/s"
                                    />
                                    <MetricRow
                                        label="Errors"
                                        value={formatNumber(broadcaster.stats?.errors)}
                                    />
                                </>
                            )}
                            <Divider sx={{ my: 1, borderColor: (theme) => theme.palette.border?.light || 'divider' }} />
                            <Typography variant="caption" color="text.secondary">
                                Subscribers: {broadcaster.subscriber_count}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                {broadcaster.subscribers && Object.entries(broadcaster.subscribers).map(([subId, sub]) => (
                                    <Chip
                                        key={subId}
                                        label={`${subId}: ${sub.queue_size || 0}/${sub.maxsize || sub.queue_maxsize || 0}`}
                                        size="small"
                                        variant="outlined"
                                        color={((sub.queue_size || 0) / (sub.maxsize || sub.queue_maxsize || 1)) > 0.8 ? 'error' : 'default'}
                                    />
                                ))}
                            </Box>
                        </Stack>
                    </MetricCard>
                    </Box>
                </Grid2>
            );
        });
    };

    const renderIQBroadcaster = (sdrId, broadcaster) => {
        if (!broadcaster) return null;

        return (
            <Grid2 size={{ xs: 12 }} key={`iq-${sdrId}`}>
                <MetricCard title={`IQ Broadcaster - ${sdrId}`}>
                    <Grid2 container spacing={2}>
                        <Grid2 size={{ xs: 12, sm: 6 }}>
                            <MetricRow
                                label="Messages In"
                                value={formatNumber(broadcaster.stats?.messages_in)}
                            />
                            <MetricRow
                                label="Rate"
                                value={formatRate(broadcaster.rates?.messages_in_per_sec)}
                                unit="msg/s"
                            />
                            <MetricRow
                                label="Source Queue"
                                value={broadcaster.source_queue_size}
                            />
                        </Grid2>
                        <Grid2 size={{ xs: 12, sm: 6 }}>
                            <MetricRow
                                label="Messages Broadcast"
                                value={formatNumber(broadcaster.stats?.messages_broadcast)}
                            />
                            <MetricRow
                                label="Rate"
                                value={formatRate(broadcaster.rates?.messages_broadcast_per_sec)}
                                unit="msg/s"
                            />
                            <MetricRow
                                label="Dropped"
                                value={formatNumber(broadcaster.stats?.messages_dropped)}
                            />
                        </Grid2>
                        <Grid2 size={{ xs: 12 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Subscribers: {broadcaster.subscriber_count}
                            </Typography>
                            {broadcaster.subscribers && Object.entries(broadcaster.subscribers).map(([subId, sub]) => (
                                <Chip
                                    key={subId}
                                    label={`${subId}: ${sub.queue_size}/${sub.queue_maxsize}`}
                                    size="small"
                                    sx={{
                                        m: 0.5,
                                        borderColor: (theme) => theme.palette.border?.light || 'divider',
                                    }}
                                    variant="outlined"
                                    color={sub.queue_size / sub.queue_maxsize > 0.8 ? 'error' : 'default'}
                                />
                            ))}
                        </Grid2>
                    </Grid2>
                </MetricCard>
            </Grid2>
        );
    };

    const renderFFTProcessor = (sdrId, fftProcessor) => {
        if (!fftProcessor) return null;

        return (
            <Grid2 size={{ xs: 12, sm: 6 }} key={`fft-${sdrId}`}>
                <Box data-component-id={fftProcessor.fft_id || sdrId}>
                    <MetricCard
                        title={`FFT Processor - ${sdrId}`}
                        statusChip={
                            <Chip
                                label={fftProcessor.is_alive ? 'Running' : 'Stopped'}
                                size="small"
                                color={fftProcessor.is_alive ? 'success' : 'error'}
                            />
                        }
                    >
                    <Stack spacing={0.5}>
                        <MetricRow
                            label="IQ Chunks In"
                            value={formatNumber(fftProcessor.stats?.iq_chunks_in)}
                        />
                        <MetricRow
                            label="Rate"
                            value={formatRate(fftProcessor.rates?.iq_chunks_per_sec)}
                            unit="chunks/s"
                        />
                        <MetricRow
                            label="IQ Samples"
                            value={formatNumber(fftProcessor.stats?.iq_samples_in)}
                        />
                        <MetricRow
                            label="Rate"
                            value={formatRate(fftProcessor.rates?.iq_samples_per_sec)}
                            unit="samples/s"
                        />
                        <Divider sx={{ my: 1, borderColor: (theme) => theme.palette.border?.light || 'divider' }} />
                        <MetricRow
                            label="FFT Results Out"
                            value={formatNumber(fftProcessor.stats?.fft_results_out)}
                        />
                        <MetricRow
                            label="Rate"
                            value={formatRate(fftProcessor.rates?.fft_results_per_sec)}
                            unit="results/s"
                        />
                        <MetricRow
                            label="Input Queue"
                            value={fftProcessor.input_queue_size}
                        />
                        <MetricRow
                            label="Output Queue"
                            value={fftProcessor.output_queue_size}
                        />
                        <MetricRow
                            label="Errors"
                            value={formatNumber(fftProcessor.stats?.errors)}
                        />
                    </Stack>
                </MetricCard>
                </Box>
            </Grid2>
        );
    };

    const renderDemodulators = (sdrId, demodulators) => {
        if (!demodulators || Object.keys(demodulators).length === 0) return null;

        return Object.entries(demodulators).map(([key, demod]) => (
            <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={`demod-${sdrId}-${key}`}>
                <Box data-component-id={demod.demod_id || key}>
                    <MetricCard
                        title={`${demod.type} - ${key}`}
                        statusChip={
                            <Chip
                                label={demod.is_alive ? 'Running' : 'Stopped'}
                                size="small"
                                color={demod.is_alive ? 'success' : 'error'}
                            />
                        }
                    >
                    <Stack spacing={0.5}>
                        <MetricRow
                            label="IQ Chunks In"
                            value={formatNumber(demod.stats?.iq_chunks_in)}
                        />
                        <MetricRow
                            label="Rate"
                            value={formatRate(demod.rates?.iq_chunks_in_per_sec)}
                            unit="chunks/s"
                        />
                        <MetricRow
                            label="IQ Samples"
                            value={formatNumber(demod.stats?.iq_samples_in)}
                        />
                        <MetricRow
                            label="Rate"
                            value={formatRate(demod.rates?.iq_samples_in_per_sec)}
                            unit="samples/s"
                        />
                        <Divider sx={{ my: 1, borderColor: (theme) => theme.palette.border?.light || 'divider' }} />
                        <MetricRow
                            label="Audio Chunks Out"
                            value={formatNumber(demod.stats?.audio_chunks_out)}
                        />
                        <MetricRow
                            label="Rate"
                            value={formatRate(demod.rates?.audio_chunks_out_per_sec)}
                            unit="chunks/s"
                        />
                        <MetricRow
                            label="Audio Samples"
                            value={formatNumber(demod.stats?.audio_samples_out)}
                        />
                        <MetricRow
                            label="Rate"
                            value={formatRate(demod.rates?.audio_samples_out_per_sec)}
                            unit="samples/s"
                        />
                        <Divider sx={{ my: 1, borderColor: (theme) => theme.palette.border?.light || 'divider' }} />
                        <MetricRow
                            label="Input Queue"
                            value={demod.input_queue_size}
                        />
                        <MetricRow
                            label="Output Queue"
                            value={demod.output_queue_size}
                        />
                        <MetricRow
                            label="Errors"
                            value={formatNumber(demod.stats?.errors)}
                        />
                    </Stack>
                </MetricCard>
                </Box>
            </Grid2>
        ));
    };

    const renderRecorders = (sdrId, recorders) => {
        if (!recorders || Object.keys(recorders).length === 0) return null;

        return Object.entries(recorders).map(([key, recorder]) => (
            <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={`recorder-${sdrId}-${key}`}>
                <Box data-component-id={recorder.recorder_id || key}>
                    <MetricCard
                        title={`${recorder.type} - ${key}`}
                        statusChip={
                            <Chip
                                label={recorder.is_alive ? 'Recording' : 'Stopped'}
                                size="small"
                                color={recorder.is_alive ? 'error' : 'default'}
                            />
                        }
                    >
                        <Stack spacing={0.5}>
                            <MetricRow
                                label="IQ Chunks In"
                                value={formatNumber(recorder.stats?.iq_chunks_in)}
                            />
                            <MetricRow
                                label="Rate"
                                value={formatRate(recorder.rates?.iq_chunks_in_per_sec)}
                                unit="chunks/s"
                            />
                            <MetricRow
                                label="IQ Samples"
                                value={formatNumber(recorder.stats?.iq_samples_in)}
                            />
                            <MetricRow
                                label="Rate"
                                value={formatRate(recorder.rates?.iq_samples_in_per_sec)}
                                unit="samples/s"
                            />
                            <Divider sx={{ my: 1, borderColor: (theme) => theme.palette.border?.light || 'divider' }} />
                            <MetricRow
                                label="Samples Written"
                                value={formatNumber(recorder.stats?.samples_written)}
                            />
                            <MetricRow
                                label="Rate"
                                value={formatRate(recorder.rates?.samples_written_per_sec)}
                                unit="samples/s"
                            />
                            <MetricRow
                                label="Bytes Written"
                                value={formatNumber(recorder.stats?.bytes_written)}
                            />
                            <MetricRow
                                label="Rate"
                                value={formatRate(recorder.rates?.bytes_written_per_sec)}
                                unit="bytes/s"
                            />
                            <Divider sx={{ my: 1, borderColor: (theme) => theme.palette.border?.light || 'divider' }} />
                            <MetricRow
                                label="Input Queue"
                                value={recorder.input_queue_size}
                            />
                            <MetricRow
                                label="Errors"
                                value={formatNumber(recorder.stats?.errors)}
                            />
                        </Stack>
                    </MetricCard>
                </Box>
            </Grid2>
        ));
    };

    const renderDecoders = (sdrId, decoders) => {
        if (!decoders || Object.keys(decoders).length === 0) return null;

        return Object.entries(decoders).map(([key, decoder]) => (
            <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={`decoder-${sdrId}-${key}`}>
                <Box data-component-id={decoder.decoder_id || key}>
                    <MetricCard
                        title={`${decoder.type} - ${key}`}
                        statusChip={
                            <Chip
                                label={decoder.is_alive ? 'Running' : 'Stopped'}
                                size="small"
                                color={decoder.is_alive ? 'success' : 'error'}
                            />
                        }
                    >
                    <Stack spacing={0.5}>
                        <MetricRow
                            label="Audio Chunks"
                            value={formatNumber(decoder.stats?.audio_chunks_in)}
                        />
                        <MetricRow
                            label="Rate"
                            value={formatRate(decoder.rates?.audio_chunks_in_per_sec)}
                            unit="chunks/s"
                        />
                        <MetricRow
                            label="Data Messages Out"
                            value={formatNumber(decoder.stats?.data_messages_out)}
                        />
                        <MetricRow
                            label="Rate"
                            value={formatRate(decoder.rates?.data_messages_out_per_sec)}
                            unit="msg/s"
                        />
                        {decoder.stats?.images_decoded !== undefined && (
                            <MetricRow
                                label="Images"
                                value={formatNumber(decoder.stats.images_decoded)}
                            />
                        )}
                        <Divider sx={{ my: 1, borderColor: (theme) => theme.palette.border?.light || 'divider' }} />
                        <MetricRow
                            label="Input Queue"
                            value={decoder.input_queue_size}
                        />
                    </Stack>
                </MetricCard>
                </Box>
            </Grid2>
        ));
    };

    const renderAudioStreamers = (streamers) => {
        if (!streamers || Object.keys(streamers).length === 0) return null;

        return Object.entries(streamers).map(([key, streamer]) => (
            <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={`streamer-${key}`}>
                <Box data-component-id={streamer.streamer_id || key}>
                    <MetricCard
                        title={`${streamer.type}`}
                        statusChip={
                            <Chip
                                label={streamer.is_alive ? 'Running' : 'Stopped'}
                                size="small"
                                color={streamer.is_alive ? 'success' : 'error'}
                            />
                        }
                    >
                        <Stack spacing={0.5}>
                            <MetricRow
                                label="Audio Chunks In"
                                value={formatNumber(streamer.stats?.audio_chunks_in)}
                            />
                            <MetricRow
                                label="Rate"
                                value={formatRate(streamer.rates?.audio_chunks_in_per_sec)}
                                unit="chunks/s"
                            />
                            <MetricRow
                                label="Audio Samples"
                                value={formatNumber(streamer.stats?.audio_samples_in)}
                            />
                            <MetricRow
                                label="Rate"
                                value={formatRate(streamer.rates?.audio_samples_in_per_sec)}
                                unit="samples/s"
                            />
                            <Divider sx={{ my: 1, borderColor: (theme) => theme.palette.border?.light || 'divider' }} />
                            <MetricRow
                                label="Messages Emitted"
                                value={formatNumber(streamer.stats?.messages_emitted)}
                            />
                            <MetricRow
                                label="Rate"
                                value={formatRate(streamer.rates?.messages_emitted_per_sec)}
                                unit="msg/s"
                            />
                            <MetricRow
                                label="Input Queue"
                                value={streamer.input_queue_size}
                            />
                            <MetricRow
                                label="Errors"
                                value={formatNumber(streamer.stats?.errors)}
                            />
                        </Stack>
                    </MetricCard>
                </Box>
            </Grid2>
        ));
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="xl"
            fullWidth
            PaperProps={{
                sx: {
                    height: '90vh',
                    backgroundColor: (theme) => theme.palette.background?.paper || theme.palette.background.paper,
                    backgroundImage: 'none',
                }
            }}
        >
            <DialogTitle
                sx={{
                    borderBottom: 1,
                    borderColor: (theme) => theme.palette.border?.main || 'divider',
                    backgroundColor: (theme) => theme.palette.background?.elevated || theme.palette.background.default,
                }}
            >
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={2}>
                        <Typography variant="h6">Performance Metrics</Typography>
                        <Chip
                            label={connected ? 'Connected' : 'Disconnected'}
                            size="small"
                            color={connected ? 'success' : 'error'}
                        />
                    </Box>
                    <IconButton onClick={handleClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent
                dividers
                sx={{
                    backgroundColor: (theme) => theme.palette.background?.default || theme.palette.background.default,
                    borderColor: (theme) => theme.palette.border?.main || 'divider',
                    position: 'relative',
                }}
            >
                {!metrics ? (
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
                        <Typography variant="body1" color="text.secondary">
                            Waiting for metrics data...
                        </Typography>
                    </Box>
                ) : (
                    <Box ref={containerRef} sx={{ position: 'relative' }}>
                        {/* Connection Visualizer - draws lines between components */}
                        {metrics.sdrs && Object.entries(metrics.sdrs).map(([sdrId, sdrData]) => (
                            <ConnectionVisualizer key={`connections-${sdrId}`} sdrData={sdrData} containerRef={containerRef} />
                        ))}

                        {metrics.sdrs && Object.entries(metrics.sdrs).map(([sdrId, sdrData]) => (
                            <Box key={sdrId} sx={{ mb: 4 }}>
                                <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                                    SDR: {sdrId}
                                </Typography>
                                <Grid2 container spacing={2}>
                                    {/* Broadcasters Section */}
                                    {sdrData.broadcasters && Object.keys(sdrData.broadcasters).length > 0 && (
                                        <Grid2 size={{ xs: 12 }}>
                                            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
                                                Broadcasters
                                            </Typography>
                                            <Grid2 container spacing={2}>
                                                {renderBroadcasters(sdrId, sdrData.broadcasters)}
                                            </Grid2>
                                        </Grid2>
                                    )}

                                    {/* FFT Processor */}
                                    {sdrData.fft_processor && (
                                        <Grid2 size={{ xs: 12 }}>
                                            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
                                                FFT Processor
                                            </Typography>
                                            <Grid2 container spacing={2}>
                                                {renderFFTProcessor(sdrId, sdrData.fft_processor)}
                                            </Grid2>
                                        </Grid2>
                                    )}

                                    {/* Demodulators */}
                                    {sdrData.demodulators && Object.keys(sdrData.demodulators).length > 0 && (
                                        <Grid2 size={{ xs: 12 }}>
                                            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
                                                Demodulators
                                            </Typography>
                                            <Grid2 container spacing={2}>
                                                {renderDemodulators(sdrId, sdrData.demodulators)}
                                            </Grid2>
                                        </Grid2>
                                    )}

                                    {/* Recorders */}
                                    {sdrData.recorders && Object.keys(sdrData.recorders).length > 0 && (
                                        <Grid2 size={{ xs: 12 }}>
                                            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
                                                IQ Recorders
                                            </Typography>
                                            <Grid2 container spacing={2}>
                                                {renderRecorders(sdrId, sdrData.recorders)}
                                            </Grid2>
                                        </Grid2>
                                    )}

                                    {/* Decoders */}
                                    {sdrData.decoders && Object.keys(sdrData.decoders).length > 0 && (
                                        <Grid2 size={{ xs: 12 }}>
                                            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
                                                Decoders
                                            </Typography>
                                            <Grid2 container spacing={2}>
                                                {renderDecoders(sdrId, sdrData.decoders)}
                                            </Grid2>
                                        </Grid2>
                                    )}
                                </Grid2>
                            </Box>
                        ))}

                        {/* Audio Streamers Section (global, not per-SDR) */}
                        {metrics.audio_streamers && Object.keys(metrics.audio_streamers).length > 0 && (
                            <Box sx={{ mb: 4 }}>
                                <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                                    Audio Streamers
                                </Typography>
                                <Grid2 container spacing={2}>
                                    {renderAudioStreamers(metrics.audio_streamers)}
                                </Grid2>
                            </Box>
                        )}
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default PerformanceMetricsDialog;
