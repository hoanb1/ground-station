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

import React, { useMemo, useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Box, Paper, Typography, Chip, Stack } from '@mui/material';
import { AccessTime, RadioButtonChecked, Satellite, Router } from '@mui/icons-material';

/**
 * Compact banner showing either:
 * - Currently running observation with details
 * - Next upcoming observation with countdown
 */
export default function ObservationStatusBanner() {
    const observations = useSelector((state) => state.scheduler.observations);
    const [countdown, setCountdown] = useState('');

    const { runningObservation, nextObservation } = useMemo(() => {
        const now = new Date();
        const running = observations.find((obs) => obs.status === 'running' && obs.enabled);

        // Find next enabled scheduled observation
        const upcoming = observations
            .filter((obs) => obs.status === 'scheduled' && obs.enabled && obs.pass?.event_start)
            .map((obs) => ({
                ...obs,
                startTime: new Date(obs.pass.event_start),
            }))
            .filter((obs) => obs.startTime > now)
            .sort((a, b) => a.startTime - b.startTime)[0];

        return { runningObservation: running, nextObservation: upcoming };
    }, [observations]);

    const observation = runningObservation || nextObservation;
    const isRunning = !!runningObservation;

    // Live countdown for scheduled observations
    useEffect(() => {
        if (!observation?.pass) return;

        const updateCountdown = () => {
            const now = new Date();
            if (isRunning) {
                const endTime = new Date(observation.pass.event_end);
                const remainingMs = endTime - now;
                const remainingMin = Math.floor(remainingMs / 60000);
                setCountdown(remainingMin > 0 ? `${remainingMin} min remaining` : 'Ending soon');
            } else {
                const startTime = new Date(observation.pass.event_start);
                const untilMs = startTime - now;
                const hours = Math.floor(untilMs / 3600000);
                const minutes = Math.floor((untilMs % 3600000) / 60000);
                const seconds = Math.floor((untilMs % 60000) / 1000);

                if (hours > 24) {
                    const days = Math.floor(hours / 24);
                    setCountdown(`in ${days}d ${hours % 24}h`);
                } else if (hours > 0) {
                    setCountdown(`in ${hours}h ${minutes}m`);
                } else {
                    setCountdown(`in ${minutes}m ${seconds}s`);
                }
            }
        };

        // Update immediately
        updateCountdown();

        // Update every second
        const interval = setInterval(updateCountdown, 1000);

        return () => clearInterval(interval);
    }, [observation, isRunning]);

    // Don't show banner if nothing to display
    if (!runningObservation && !nextObservation) {
        return null;
    }

    // Format start/end times
    const formatTime = (isoString) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const startTime = observation.pass ? formatTime(observation.pass.event_start) : '';
    const endTime = observation.pass ? formatTime(observation.pass.event_end) : '';

    // Get task count
    const taskCount = observation.tasks?.length || 0;
    const decoderTasks = observation.tasks?.filter((t) => t.type === 'decoder').length || 0;
    const recordingTasks = observation.tasks?.filter((t) => t.type === 'iq_recording' || t.type === 'audio_recording').length || 0;

    return (
        <Paper
            elevation={2}
            sx={{
                p: 2,
                background: isRunning
                    ? 'linear-gradient(135deg, rgba(76, 175, 80, 0.25) 0%, rgba(76, 175, 80, 0.15) 100%)'
                    : 'linear-gradient(135deg, rgba(33, 150, 243, 0.25) 0%, rgba(33, 150, 243, 0.15) 100%)',
                borderLeft: isRunning ? '4px solid #4caf50' : '4px solid #2196f3',
            }}
        >
            <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
                {/* Status indicator */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {isRunning ? (
                        <RadioButtonChecked sx={{ color: '#4caf50', fontSize: 20 }} />
                    ) : (
                        <AccessTime sx={{ color: '#2196f3', fontSize: 20 }} />
                    )}
                    <Typography variant="body2" fontWeight={600} color="text.secondary">
                        {isRunning ? 'NOW OBSERVING' : 'NEXT OBSERVATION'}
                    </Typography>
                </Box>

                {/* Satellite name */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Satellite sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <Typography variant="body1" fontWeight={600}>
                        {observation.satellite?.name || 'Unknown'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        ({observation.satellite?.norad_id || 'N/A'})
                    </Typography>
                </Box>

                {/* Time info */}
                {countdown && (
                    <Chip
                        label={countdown}
                        size="small"
                        sx={{
                            bgcolor: isRunning ? 'rgba(76, 175, 80, 0.2)' : 'rgba(33, 150, 243, 0.2)',
                            fontWeight: 600,
                        }}
                    />
                )}

                {/* Pass times */}
                {startTime && endTime && (
                    <Typography variant="body2" color="text.secondary">
                        {startTime} - {endTime}
                    </Typography>
                )}

                {/* Peak elevation */}
                {observation.pass?.peak_altitude && (
                    <Chip
                        label={`${observation.pass.peak_altitude.toFixed(0)}° peak`}
                        size="small"
                        variant="outlined"
                    />
                )}

                {/* SDR info */}
                {observation.sdr?.name && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Router sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                            {observation.sdr.name}
                        </Typography>
                    </Box>
                )}

                {/* Task summary */}
                {taskCount > 0 && (
                    <Typography variant="body2" color="text.secondary">
                        {decoderTasks > 0 && `${decoderTasks} decoder${decoderTasks > 1 ? 's' : ''}`}
                        {decoderTasks > 0 && recordingTasks > 0 && ', '}
                        {recordingTasks > 0 && `${recordingTasks} recording${recordingTasks > 1 ? 's' : ''}`}
                    </Typography>
                )}

                {/* Observation name (if different from satellite) */}
                {observation.name && observation.name !== observation.satellite?.name && (
                    <Typography variant="body2" color="text.secondary" fontStyle="italic">
                        "{observation.name}"
                    </Typography>
                )}
            </Stack>
        </Paper>
    );
}
