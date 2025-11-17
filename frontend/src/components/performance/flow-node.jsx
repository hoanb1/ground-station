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

import React from 'react';
import { Handle, Position } from 'reactflow';
import { Paper, Box, Typography, Chip, Divider, Stack } from '@mui/material';

const formatRate = (rate) => {
    if (rate === null || rate === undefined) return 'N/A';
    if (rate >= 1000000) return (rate / 1000000).toFixed(2) + 'M';
    if (rate >= 1000) return (rate / 1000).toFixed(2) + 'K';
    return rate.toFixed(2);
};

const formatNumber = (num) => {
    if (num === null || num === undefined) return 'N/A';
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return num.toLocaleString();
};

const MetricRow = ({ label, value, unit }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 0.25 }}>
        <Typography variant="caption" color="text.secondary">
            {label}:
        </Typography>
        <Typography variant="caption" fontWeight="medium">
            {value} {unit && <span style={{ fontSize: '0.85em', opacity: 0.7 }}>{unit}</span>}
        </Typography>
    </Box>
);

const CpuMemoryBars = ({ cpuPercent, memoryMb, memoryPercent }) => {
    const cappedCpuPercent = Math.min(cpuPercent || 0, 100);
    const cappedMemPercent = Math.min(memoryPercent || 0, 100);

    const getCpuColor = (percent) => {
        if (percent < 50) return '#4caf50'; // Green
        if (percent < 80) return '#ff9800'; // Orange
        return '#f44336'; // Red
    };

    const getMemColor = (percent) => {
        if (percent < 50) return '#2196f3'; // Blue
        if (percent < 80) return '#9c27b0'; // Purple
        return '#f44336'; // Red
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', height: '100%', gap: 1.5 }}>
            {/* CPU Bar */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 0.5, fontSize: '0.65rem' }}>
                    CPU
                </Typography>
                <Box sx={{
                    flex: 1,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    backgroundColor: 'rgba(128, 128, 128, 0.2)',
                    borderRadius: 0.5,
                    position: 'relative',
                    minHeight: '50px',
                }}>
                    <Box sx={{
                        width: '100%',
                        height: `${cappedCpuPercent}%`,
                        backgroundColor: getCpuColor(cappedCpuPercent),
                        borderRadius: 0.5,
                        transition: 'height 0.3s ease, background-color 0.3s ease',
                    }} />
                </Box>
                <Typography variant="caption" sx={{ mt: 0.3, fontWeight: 'medium', fontSize: '0.65rem' }}>
                    {cappedCpuPercent.toFixed(1)}%
                </Typography>
            </Box>

            {/* Memory Bar */}
            {memoryMb !== undefined && memoryPercent !== undefined && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 0.5, fontSize: '0.65rem' }}>
                        MEM
                    </Typography>
                    <Box sx={{
                        flex: 1,
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        backgroundColor: 'rgba(128, 128, 128, 0.2)',
                        borderRadius: 0.5,
                        position: 'relative',
                        minHeight: '50px',
                    }}>
                        <Box sx={{
                            width: '100%',
                            height: `${cappedMemPercent}%`,
                            backgroundColor: getMemColor(cappedMemPercent),
                            borderRadius: 0.5,
                            transition: 'height 0.3s ease, background-color 0.3s ease',
                        }} />
                    </Box>
                    <Typography variant="caption" sx={{ mt: 0.3, fontWeight: 'medium', fontSize: '0.65rem' }}>
                        {memoryMb.toFixed(0)}MB
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

export const ComponentNode = ({ data }) => {
    const { component, type, inputCount = 1, outputCount = 1 } = data;

    // Workers and Trackers don't have input handles (they're sources)
    const isWorker = type === 'worker';
    const isTracker = type === 'tracker';
    const isIQBroadcaster = type === 'broadcaster' && component.broadcaster_type === 'iq';
    const isAudioBroadcaster = type === 'broadcaster' && component.broadcaster_type === 'audio';

    // Calculate handle positions for multiple connections
    const calculateHandlePositions = (count) => {
        if (count === 1) return [50]; // Single handle at center (50%)
        const positions = [];
        const spacing = 80 / (count + 1); // Distribute across 80% of height
        for (let i = 0; i < count; i++) {
            positions.push(10 + spacing * (i + 1)); // Start at 10%, space evenly
        }
        return positions;
    };

    const inputPositions = calculateHandlePositions(inputCount);
    const outputPositions = calculateHandlePositions(outputCount);

    return (
        <>
            {/* Input handles - all except Worker and Tracker */}
            {!isWorker && !isTracker && inputPositions.map((pos, idx) => (
                <Handle
                    key={`input-${idx}`}
                    id={`input-${idx}`}
                    type="target"
                    position={Position.Left}
                    style={{
                        background: '#555',
                        top: `${pos}%`,
                    }}
                />
            ))}

            <Paper
                elevation={3}
                sx={{
                    p: 0.5,
                    minWidth: 280,
                    backgroundColor: (theme) => theme.palette.background?.paper || theme.palette.background.paper,
                    border: 1,
                    borderColor: (theme) => theme.palette.border?.main || 'divider',
                }}
            >
                {/* Title with status */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                        {data.label}
                    </Typography>
                    {component.is_alive !== undefined && (
                        <Box
                            sx={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                ml: 1,
                                mr: '5px',
                                backgroundColor: component.is_alive
                                    ? (type === 'recorder' ? '#f44336' : '#4caf50')
                                    : '#9e9e9e',
                                boxShadow: component.is_alive
                                    ? `0 0 8px ${type === 'recorder' ? '#f44336' : '#4caf50'}`
                                    : 'none',
                            }}
                        />
                    )}
                </Box>

                <Divider sx={{ mb: 1 }} />

                {/* Metrics - Two or Three column layout with dividers */}
                <Box sx={{ display: 'grid', gridTemplateColumns: (type === 'fft' || type === 'worker' || type === 'tracker') ? '1fr auto 80px auto 1fr' : '1fr auto 1fr', gap: 1 }}>
                    {/* Tracker metrics */}
                    {type === 'tracker' && (
                        <>
                            {/* Left column - Processing */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Processing
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Cycles"
                                        value={formatNumber(component.stats?.tracking_cycles)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.tracking_cycles_per_sec)}
                                        unit="/s"
                                    />
                                    <MetricRow
                                        label="DB Queries"
                                        value={formatNumber(component.stats?.db_queries)}
                                    />
                                </Stack>
                            </Box>
                            {/* Vertical divider */}
                            <Divider orientation="vertical" flexItem />
                            {/* Middle column - CPU & Memory Bars */}
                            <Box>
                                <CpuMemoryBars
                                    cpuPercent={component.stats?.cpu_percent}
                                    memoryMb={component.stats?.memory_mb}
                                    memoryPercent={component.stats?.memory_percent}
                                />
                            </Box>
                            {/* Vertical divider */}
                            <Divider orientation="vertical" flexItem />
                            {/* Right column - Output */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Output
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Updates"
                                        value={formatNumber(component.stats?.updates_sent)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.updates_per_sec)}
                                        unit="/s"
                                    />
                                    <MetricRow
                                        label="Commands"
                                        value={formatNumber(component.stats?.commands_processed)}
                                    />
                                </Stack>
                            </Box>
                        </>
                    )}

                    {/* Worker metrics */}
                    {type === 'worker' && (
                        <>
                            {/* Left column - Empty (no input) */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    SDR
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Samples"
                                        value={formatNumber(component.stats?.samples_read)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.samples_per_sec)}
                                        unit="/s"
                                    />
                                    <MetricRow
                                        label="Errors"
                                        value={formatNumber(component.stats?.read_errors)}
                                    />
                                </Stack>
                            </Box>
                            {/* Vertical divider */}
                            <Divider orientation="vertical" flexItem />
                            {/* Middle column - CPU & Memory Bars */}
                            <Box>
                                <CpuMemoryBars
                                    cpuPercent={component.stats?.cpu_percent}
                                    memoryMb={component.stats?.memory_mb}
                                    memoryPercent={component.stats?.memory_percent}
                                />
                            </Box>
                            {/* Vertical divider */}
                            <Divider orientation="vertical" flexItem />
                            {/* Right column - Output */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Output
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="IQ Chunks"
                                        value={formatNumber(component.stats?.iq_chunks_out)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.iq_chunks_per_sec)}
                                        unit="/s"
                                    />
                                    <MetricRow
                                        label="Drops"
                                        value={formatNumber(component.stats?.queue_drops)}
                                    />
                                </Stack>
                            </Box>
                        </>
                    )}

                    {/* Broadcaster metrics */}
                    {type === 'broadcaster' && (
                        <>
                            {/* Left column - Input */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Input
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Queue"
                                        value={component.source_queue_size || 0}
                                    />
                                    <MetricRow
                                        label="Msgs"
                                        value={formatNumber(component.stats?.messages_in || component.stats?.messages_received)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.messages_in_per_sec || component.rates?.messages_received_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                            {/* Vertical divider */}
                            <Divider orientation="vertical" flexItem />
                            {/* Right column - Output */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Output
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Subscribers"
                                        value={component.subscriber_count || 0}
                                    />
                                    <MetricRow
                                        label="Msgs"
                                        value={formatNumber(component.stats?.messages_broadcast)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.messages_broadcast_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                        </>
                    )}

                    {/* FFT Processor metrics */}
                    {type === 'fft' && (
                        <>
                            {/* Left column - Input */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Input
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Queue"
                                        value={component.input_queue_size || 0}
                                    />
                                    <MetricRow
                                        label="IQ"
                                        value={formatNumber(component.stats?.iq_chunks_in)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.iq_chunks_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                            {/* Vertical divider */}
                            <Divider orientation="vertical" flexItem />
                            {/* Middle column - CPU & Memory Bars */}
                            <Box>
                                <CpuMemoryBars
                                    cpuPercent={component.stats?.cpu_percent}
                                    memoryMb={component.stats?.memory_mb}
                                    memoryPercent={component.stats?.memory_percent}
                                />
                            </Box>
                            {/* Vertical divider */}
                            <Divider orientation="vertical" flexItem />
                            {/* Right column - Output */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Output
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Queue"
                                        value={component.output_queue_size || 0}
                                    />
                                    <MetricRow
                                        label="FFT"
                                        value={formatNumber(component.stats?.fft_results_out)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.fft_results_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                        </>
                    )}

                    {/* Demodulator metrics */}
                    {type === 'demodulator' && (
                        <>
                            {/* Left column - Input */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Input
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Queue"
                                        value={component.input_queue_size || 0}
                                    />
                                    <MetricRow
                                        label="IQ"
                                        value={formatNumber(component.stats?.iq_chunks_in)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.iq_chunks_in_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                            {/* Vertical divider */}
                            <Divider orientation="vertical" flexItem />
                            {/* Right column - Output */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Output
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Queue"
                                        value={component.output_queue_size || 0}
                                    />
                                    <MetricRow
                                        label="Audio"
                                        value={formatNumber(component.stats?.audio_chunks_out)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.audio_chunks_out_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                        </>
                    )}

                    {/* Recorder metrics */}
                    {type === 'recorder' && (
                        <>
                            {/* Left column - Input */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Input
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Queue"
                                        value={component.input_queue_size || 0}
                                    />
                                    <MetricRow
                                        label="IQ"
                                        value={formatNumber(component.stats?.iq_chunks_in)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.iq_chunks_in_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                            {/* Vertical divider */}
                            <Divider orientation="vertical" flexItem />
                            {/* Right column - Output */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Output
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Written"
                                        value={formatNumber(component.stats?.samples_written)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.samples_written_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                        </>
                    )}

                    {/* Decoder metrics */}
                    {type === 'decoder' && (
                        <>
                            {/* Left column - Input */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Input
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Queue"
                                        value={component.input_queue_size || 0}
                                    />
                                    <MetricRow
                                        label="Audio"
                                        value={formatNumber(component.stats?.audio_chunks_in)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.audio_chunks_in_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                            {/* Vertical divider */}
                            <Divider orientation="vertical" flexItem />
                            {/* Right column - Output */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Output
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Data"
                                        value={formatNumber(component.stats?.data_messages_out)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.data_messages_out_per_sec)}
                                        unit="/s"
                                    />
                                    {component.stats?.images_decoded !== undefined && (
                                        <MetricRow
                                            label="Images"
                                            value={formatNumber(component.stats.images_decoded)}
                                        />
                                    )}
                                </Stack>
                            </Box>
                        </>
                    )}

                    {/* Audio Streamer metrics */}
                    {type === 'streamer' && (
                        <>
                            {/* Left column - Input */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Input
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Queue"
                                        value={component.input_queue_size || 0}
                                    />
                                    <MetricRow
                                        label="Audio"
                                        value={formatNumber(component.stats?.audio_chunks_in)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.audio_chunks_in_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                            {/* Vertical divider */}
                            <Divider orientation="vertical" flexItem />
                            {/* Right column - Output */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Output
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Msgs"
                                        value={formatNumber(component.stats?.messages_emitted)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.messages_emitted_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                            {/* Active sessions - full width */}
                            {component.active_sessions && Object.keys(component.active_sessions).length > 0 && (
                                <Box sx={{ gridColumn: '1 / 4', mt: 1 }}>
                                    <Divider sx={{ mb: 0.5 }} />
                                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                        Active Sessions
                                    </Typography>
                                    <Stack spacing={0.25}>
                                        {Object.entries(component.active_sessions).map(([sessionId, session]) => (
                                            <Box key={sessionId} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                                    {session.ip}
                                                </Typography>
                                                <Typography variant="caption" fontWeight="medium" sx={{ fontSize: '0.7rem' }}>
                                                    {formatRate(session.rates?.messages_emitted_per_sec || 0)}/s
                                                </Typography>
                                            </Box>
                                        ))}
                                    </Stack>
                                </Box>
                            )}
                        </>
                    )}

                    {/* Browser metrics */}
                    {type === 'browser' && (
                        <>
                            <Box sx={{ gridColumn: '1 / 4' }}>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Connection Info
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Session"
                                        value={component.session_id?.substring(0, 12) + '...'}
                                    />
                                    <MetricRow
                                        label="IP"
                                        value={component.client_ip || 'unknown'}
                                    />
                                    {component.user_agent && component.user_agent !== 'unknown' && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 0.25 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                User Agent:
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                fontWeight="medium"
                                                sx={{
                                                    maxWidth: '160px',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    textAlign: 'right'
                                                }}
                                                title={component.user_agent}
                                            >
                                                {component.user_agent}
                                            </Typography>
                                        </Box>
                                    )}
                                </Stack>
                            </Box>
                            <Box sx={{ gridColumn: '1 / 4', mt: 1 }}>
                                <Divider sx={{ mb: 0.5 }} />
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Received
                                </Typography>
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Audio"
                                        value={formatNumber(component.stats?.audio_chunks_in)}
                                    />
                                    <MetricRow
                                        label="Samples"
                                        value={formatNumber(component.stats?.audio_samples_in)}
                                    />
                                    <MetricRow
                                        label="Messages"
                                        value={formatNumber(component.stats?.messages_emitted)}
                                    />
                                    <MetricRow
                                        label="Rate"
                                        value={formatRate(component.rates?.messages_emitted_per_sec)}
                                        unit="/s"
                                    />
                                </Stack>
                            </Box>
                        </>
                    )}

                    {/* Show errors if any - full width */}
                    {component.stats?.errors > 0 && (
                        <Box sx={{ gridColumn: (type === 'fft' || type === 'worker' || type === 'tracker') ? '1 / 6' : '1 / 4' }}>
                            <Divider sx={{ my: 0.5 }} />
                            <MetricRow
                                label="Errors"
                                value={formatNumber(component.stats.errors)}
                            />
                        </Box>
                    )}
                </Box>
            </Paper>

            {/* Output handles */}
            {type !== 'recorder' && type !== 'browser' && outputPositions.map((pos, idx) => (
                <Handle
                    key={`output-${idx}`}
                    id={`output-${idx}`}
                    type="source"
                    position={Position.Right}
                    style={{
                        background: '#555',
                        top: `${pos}%`,
                    }}
                />
            ))}
        </>
    );
};
