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

export const ComponentNode = ({ data }) => {
    const { component, type } = data;

    // Only IQ broadcasters don't have input handles (they're the source)
    const isIQBroadcaster = type === 'broadcaster' && component.broadcaster_type === 'iq';
    const isAudioBroadcaster = type === 'broadcaster' && component.broadcaster_type === 'audio';

    return (
        <>
            {/* Input handle - all except IQ broadcaster */}
            {!isIQBroadcaster && (
                <Handle
                    type="target"
                    position={Position.Left}
                    style={{ background: '#555' }}
                />
            )}

            <Paper
                elevation={3}
                sx={{
                    p: 1.5,
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
                        <Chip
                            label={component.is_alive ? (type === 'recorder' ? 'Recording' : 'Running') : 'Stopped'}
                            size="small"
                            color={component.is_alive ? (type === 'recorder' ? 'error' : 'success') : 'error'}
                        />
                    )}
                </Box>

                {/* Metrics - Two column layout with divider */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 1, mt: 1 }}>
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
                            {/* Full width metrics */}
                            <Box sx={{ gridColumn: '1 / 4' }}>
                                <Divider sx={{ my: 0.5 }} />
                                <Stack spacing={0.25}>
                                    <MetricRow
                                        label="Queue"
                                        value={component.source_queue_size || 0}
                                    />
                                    <MetricRow
                                        label="Subscribers"
                                        value={component.subscriber_count || 0}
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
                            {/* Right column - Output */}
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', display: 'block', mb: 0.5 }}>
                                    Output
                                </Typography>
                                <Stack spacing={0.25}>
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
                            {/* Full width */}
                            <Box sx={{ gridColumn: '1 / 4' }}>
                                <Divider sx={{ my: 0.5 }} />
                                <MetricRow
                                    label="Queue"
                                    value={`${component.input_queue_size || 0}/${component.output_queue_size || 0}`}
                                />
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
                            {/* Full width */}
                            <Box sx={{ gridColumn: '1 / 4' }}>
                                <Divider sx={{ my: 0.5 }} />
                                <MetricRow
                                    label="Queue"
                                    value={`${component.input_queue_size || 0}/${component.output_queue_size || 0}`}
                                />
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
                            {/* Full width */}
                            <Box sx={{ gridColumn: '1 / 4' }}>
                                <Divider sx={{ my: 0.5 }} />
                                <MetricRow
                                    label="Queue"
                                    value={component.input_queue_size || 0}
                                />
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
                                    {component.stats?.images_decoded !== undefined && (
                                        <MetricRow
                                            label="Images"
                                            value={formatNumber(component.stats.images_decoded)}
                                        />
                                    )}
                                </Stack>
                            </Box>
                            {/* Full width */}
                            <Box sx={{ gridColumn: '1 / -1' }}>
                                <Divider sx={{ my: 0.5 }} />
                                <MetricRow
                                    label="Queue"
                                    value={component.input_queue_size || 0}
                                />
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
                            {/* Full width */}
                            <Box sx={{ gridColumn: '1 / -1' }}>
                                <Divider sx={{ my: 0.5 }} />
                                <MetricRow
                                    label="Queue"
                                    value={component.input_queue_size || 0}
                                />
                            </Box>
                        </>
                    )}

                    {/* Show errors if any - full width */}
                    {component.stats?.errors > 0 && (
                        <Box sx={{ gridColumn: '1 / -1' }}>
                            <Divider sx={{ my: 0.5 }} />
                            <MetricRow
                                label="Errors"
                                value={formatNumber(component.stats.errors)}
                            />
                        </Box>
                    )}
                </Box>
            </Paper>

            {/* Output handle */}
            {type !== 'decoder' && type !== 'recorder' && type !== 'streamer' && (
                <Handle
                    type="source"
                    position={Position.Right}
                    style={{ background: '#555' }}
                />
            )}
        </>
    );
};
