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

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    Paper,
    Box,
    Typography,
    IconButton,
    Stack,
    Chip,
    Tooltip,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Collapse,
} from '@mui/material';
import {
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { setTimelineDuration, setTimelineSatelliteFilter, setTimelineExpanded, setSelectedObservation, setDialogOpen } from './scheduler-slice.jsx';

const ObservationsTimeline = () => {
    const dispatch = useDispatch();
    const observations = useSelector((state) => state.scheduler?.observations || []);
    const timeline = useSelector((state) => state.scheduler?.timeline);
    const { durationHours, selectedSatelliteFilter, isExpanded } = timeline;

    const canvasRef = useRef(null);
    const [hoveredObservation, setHoveredObservation] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const observationBoundsRef = useRef(new Map()); // Store bounds separately

    // Filter observations within the time window
    const filteredObservations = useMemo(() => {
        const now = new Date();
        const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

        return observations.filter(obs => {
            if (!obs.tasks || obs.tasks.length === 0) return false;

            // Get earliest task start and latest task end
            let earliestStart = null;
            let latestEnd = null;

            obs.tasks.forEach(task => {
                if (task.start_time) {
                    const taskStart = new Date(task.start_time);
                    if (!earliestStart || taskStart < earliestStart) {
                        earliestStart = taskStart;
                    }
                }
                if (task.end_time) {
                    const taskEnd = new Date(task.end_time);
                    if (!latestEnd || taskEnd > latestEnd) {
                        latestEnd = taskEnd;
                    }
                }
            });

            if (!earliestStart || !latestEnd) return false;

            // Check if observation falls within our time window
            const inTimeWindow = latestEnd >= now && earliestStart <= endTime;

            // Apply satellite filter if set
            const matchesFilter = !selectedSatelliteFilter || obs.satellite.norad_id === selectedSatelliteFilter;

            return inTimeWindow && matchesFilter;
        }).sort((a, b) => {
            const aStart = Math.min(...a.tasks.map(t => new Date(t.start_time)));
            const bStart = Math.min(...b.tasks.map(t => new Date(t.start_time)));
            return aStart - bStart;
        });
    }, [observations, durationHours, selectedSatelliteFilter]);

    // Get unique satellites for filter dropdown
    const uniqueSatellites = useMemo(() => {
        const sats = new Map();
        observations.forEach(obs => {
            if (obs.satellite && !sats.has(obs.satellite.norad_id)) {
                sats.set(obs.satellite.norad_id, obs.satellite.name);
            }
        });
        return Array.from(sats.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [observations]);

    // Calculate number of rows needed for layout
    const requiredRows = useMemo(() => {
        const now = new Date();
        const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
        const totalMs = endTime - now;
        const width = 1200;

        const rows = [];

        filteredObservations.forEach((obs) => {
            // Get earliest task start and latest task end
            const taskStarts = obs.tasks.map(t => new Date(t.start_time)).filter(d => !isNaN(d));
            const taskEnds = obs.tasks.map(t => new Date(t.end_time)).filter(d => !isNaN(d));

            if (taskStarts.length === 0 || taskEnds.length === 0) return;

            const startTime = new Date(Math.min(...taskStarts));
            const obsEndTime = new Date(Math.max(...taskEnds));

            const startX = Math.max(0, ((startTime - now) / totalMs) * width);
            const endX = Math.min(width, ((obsEndTime - now) / totalMs) * width);

            let rowIndex = 0;
            let placed = false;

            while (!placed) {
                if (!rows[rowIndex]) {
                    rows[rowIndex] = [];
                }

                const overlaps = rows[rowIndex].some(existing => {
                    return !(endX <= existing.startX || startX >= existing.endX);
                });

                if (!overlaps) {
                    rows[rowIndex].push({ startX, endX });
                    placed = true;
                } else {
                    rowIndex++;
                }
            }
        });

        return Math.max(1, rows.length);
    }, [filteredObservations, durationHours]);

    // Draw timeline
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !isExpanded) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const theme = document.documentElement.getAttribute('data-theme');
        const isDark = theme === 'dark';

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        const now = new Date();
        const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
        const totalMs = endTime - now;

        const marginTop = 40;
        const marginBottom = 30;
        const timelineHeight = height - marginTop - marginBottom;
        const barHeight = 30;
        const barSpacing = 5;
        const rowHeight = barHeight + barSpacing;

        // Colors
        const textColor = isDark ? '#fff' : '#000';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const borderColor = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';
        const currentTimeColor = '#f50057';

        // Draw internal timeline area border
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        ctx.strokeRect(0, marginTop, width, height - marginTop - marginBottom);
        ctx.globalAlpha = 1.0;

        // Draw time grid with alternating background
        const hoursToShow = Math.min(durationHours, 48);
        const hourStep = hoursToShow <= 12 ? 2 : hoursToShow <= 24 ? 4 : 6;

        // Draw alternating background zones for every other time period
        for (let hour = 0; hour <= hoursToShow; hour += hourStep) {
            if (Math.floor(hour / hourStep) % 2 === 0) {
                const x1 = (hour / durationHours) * width;
                const x2 = ((hour + hourStep) / durationHours) * width;
                ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)';
                ctx.fillRect(x1, marginTop, x2 - x1, height - marginTop - marginBottom);
            }
        }

        ctx.strokeStyle = gridColor;
        ctx.fillStyle = textColor;
        ctx.font = '12px sans-serif';
        ctx.lineWidth = 1;

        // Draw vertical grid lines and separators
        for (let hour = 0; hour <= hoursToShow; hour += hourStep) {
            const x = (hour / durationHours) * width;

            // Draw vertical separator line (subtle)
            if (hour > 0) {
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.25;
                ctx.beginPath();
                ctx.moveTo(x, marginTop);
                ctx.lineTo(x, height - marginBottom);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }

            // Draw time labels
            ctx.fillStyle = textColor;
            const time = new Date(now.getTime() + hour * 60 * 60 * 1000);
            const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            ctx.fillText(timeStr, x - 20, height - 10);
        }

        // Draw horizontal grid lines for each row
        const numRows = Math.ceil((height - marginTop - marginBottom) / rowHeight);
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.15;
        for (let i = 1; i < numRows; i++) {
            const y = marginTop + (i * rowHeight);
            if (y < height - marginBottom) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1.0;

        // Draw current time marker
        ctx.strokeStyle = currentTimeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, marginTop);
        ctx.lineTo(0, height - marginBottom);
        ctx.stroke();
        ctx.fillStyle = currentTimeColor;
        ctx.fillText('NOW', 5, marginTop - 5);

        // Clear and rebuild bounds map
        observationBoundsRef.current.clear();

        // Layout observations to avoid overlaps
        const rows = [];

        filteredObservations.forEach((obs) => {
            // Get earliest task start and latest task end
            const taskStarts = obs.tasks.map(t => new Date(t.start_time)).filter(d => !isNaN(d));
            const taskEnds = obs.tasks.map(t => new Date(t.end_time)).filter(d => !isNaN(d));

            if (taskStarts.length === 0 || taskEnds.length === 0) return;

            const startTime = new Date(Math.min(...taskStarts));
            const endTime = new Date(Math.max(...taskEnds));

            const startX = Math.max(0, ((startTime - now) / totalMs) * width);
            const endX = Math.min(width, ((endTime - now) / totalMs) * width);
            const barWidth = endX - startX;

            // Find first row where this observation fits without overlap
            let rowIndex = 0;
            let placed = false;

            while (!placed) {
                if (!rows[rowIndex]) {
                    rows[rowIndex] = [];
                }

                // Check if this observation overlaps with any in this row
                const overlaps = rows[rowIndex].some(existing => {
                    return !(endX <= existing.startX || startX >= existing.endX);
                });

                if (!overlaps) {
                    rows[rowIndex].push({ obs, startX, endX, barWidth });
                    placed = true;
                } else {
                    rowIndex++;
                }
            }
        });

        // Draw observations
        rows.forEach((row, rowIndex) => {
            const y = marginTop + (rowIndex * rowHeight);

            row.forEach(({ obs, startX, barWidth }) => {
                // Determine color based on status
                let barColor;
                if (obs.status === 'running') {
                    barColor = isDark ? '#4caf50' : '#66bb6a';
                } else if (obs.status === 'completed') {
                    barColor = isDark ? '#2196f3' : '#42a5f5';
                } else if (obs.status === 'cancelled' || obs.status === 'failed') {
                    barColor = isDark ? '#f44336' : '#ef5350';
                } else if (!obs.enabled) {
                    barColor = isDark ? '#666' : '#bbb';
                } else {
                    barColor = isDark ? '#9c27b0' : '#ab47bc';
                }

                // Draw subtle shadow
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 2;

                // Draw rounded bar
                const radius = 6;
                ctx.fillStyle = barColor;
                ctx.beginPath();
                ctx.moveTo(startX + radius, y);
                ctx.lineTo(startX + barWidth - radius, y);
                ctx.quadraticCurveTo(startX + barWidth, y, startX + barWidth, y + radius);
                ctx.lineTo(startX + barWidth, y + barHeight - radius);
                ctx.quadraticCurveTo(startX + barWidth, y + barHeight, startX + barWidth - radius, y + barHeight);
                ctx.lineTo(startX + radius, y + barHeight);
                ctx.quadraticCurveTo(startX, y + barHeight, startX, y + barHeight - radius);
                ctx.lineTo(startX, y + radius);
                ctx.quadraticCurveTo(startX, y, startX + radius, y);
                ctx.closePath();
                ctx.fill();

                // Reset shadow
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                // Draw subtle border with rounded corners
                ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Add gradient overlay for depth
                const gradient = ctx.createLinearGradient(startX, y, startX, y + barHeight);
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
                ctx.fillStyle = gradient;
                ctx.fill();

                // Draw satellite name
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 12px sans-serif';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 2;
                const text = obs.satellite.name || 'Unknown';
                const textWidth = ctx.measureText(text).width;
                if (barWidth > textWidth + 10) {
                    ctx.fillText(text, startX + 5, y + 19);
                }
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;

                // Store observation bounds for hover detection
                observationBoundsRef.current.set(obs.id, { startX, y, barWidth, barHeight });
            });
        });

    }, [filteredObservations, durationHours, isExpanded]);

    // Handle canvas mouse move for hover
    const handleCanvasMouseMove = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        let found = null;
        for (const obs of filteredObservations) {
            const bounds = observationBoundsRef.current.get(obs.id);
            if (bounds) {
                const { startX, y: barY, barWidth, barHeight } = bounds;
                if (x >= startX && x <= startX + barWidth && y >= barY && y <= barY + barHeight) {
                    found = obs;
                    break;
                }
            }
        }

        setHoveredObservation(found);
        if (found) {
            setTooltipPosition({ x: e.clientX, y: e.clientY });
        }
    };

    const handleCanvasClick = (e) => {
        if (hoveredObservation) {
            dispatch(setSelectedObservation(hoveredObservation));
            dispatch(setDialogOpen(true));
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <Typography variant="h6">Observations Timeline</Typography>
                    <Chip
                        label={`${filteredObservations.length} observation${filteredObservations.length !== 1 ? 's' : ''}`}
                        size="small"
                        color="primary"
                    />
                </Stack>
                <Stack direction="row" spacing={2} alignItems="center">
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Duration</InputLabel>
                        <Select
                            value={durationHours}
                            onChange={(e) => dispatch(setTimelineDuration(e.target.value))}
                            label="Duration"
                        >
                            <MenuItem value={12}>12 hours</MenuItem>
                            <MenuItem value={24}>24 hours</MenuItem>
                            <MenuItem value={48}>48 hours</MenuItem>
                            <MenuItem value={72}>72 hours</MenuItem>
                        </Select>
                    </FormControl>
                    <IconButton onClick={() => dispatch(setTimelineExpanded(!isExpanded))}>
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </Stack>
            </Box>

            <Collapse in={isExpanded}>
                <Box
                    sx={{
                        position: 'relative',
                        border: '0.5px solid',
                        borderColor: 'divider',
                    }}
                >
                    <canvas
                        ref={canvasRef}
                        width={1200}
                        height={Math.max(150, requiredRows * 35 + 70)}
                        style={{
                            width: '100%',
                            height: 'auto',
                            cursor: hoveredObservation ? 'pointer' : 'default',
                            display: 'block',
                        }}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseLeave={() => setHoveredObservation(null)}
                        onClick={handleCanvasClick}
                    />

                    {hoveredObservation && (
                        <Box
                            sx={{
                                position: 'fixed',
                                left: tooltipPosition.x + 10,
                                top: tooltipPosition.y + 10,
                                bgcolor: 'background.paper',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1,
                                p: 1.5,
                                boxShadow: 3,
                                zIndex: 9999,
                                pointerEvents: 'none',
                                maxWidth: 300,
                            }}
                        >
                            <Typography variant="subtitle2" fontWeight="bold">
                                {hoveredObservation.satellite.name}
                            </Typography>
                            <Typography variant="caption" display="block">
                                Start: {new Date(Math.min(...hoveredObservation.tasks.map(t => new Date(t.start_time)))).toLocaleString()}
                            </Typography>
                            <Typography variant="caption" display="block">
                                End: {new Date(Math.max(...hoveredObservation.tasks.map(t => new Date(t.end_time)))).toLocaleString()}
                            </Typography>
                            <Typography variant="caption" display="block">
                                Peak: {hoveredObservation.pass.peak_altitude}°
                            </Typography>
                            <Box mt={1}>
                                {hoveredObservation.tasks.map((task, idx) => (
                                    <Chip
                                        key={idx}
                                        label={
                                            task.type === 'decoder' ? (
                                                task.config.decoder_type === 'lora' ? 'LoRa' :
                                                task.config.decoder_type === 'none' ? 'No Decoder' :
                                                task.config.decoder_type?.toUpperCase()
                                            ) :
                                            task.type === 'audio_recording' ? 'Audio' :
                                            task.type === 'transcription' ? 'Transcription' :
                                            'IQ'
                                        }
                                        size="small"
                                        sx={{ mr: 0.5, mb: 0.5 }}
                                    />
                                ))}
                            </Box>
                        </Box>
                    )}
                </Box>
            </Collapse>
        </Paper>
    );
};

export default ObservationsTimeline;
