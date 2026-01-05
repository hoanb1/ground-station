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

import React, { useMemo, useState, useRef, useEffect } from 'react';
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
import { setTimelineDuration, setTimelineExpanded, setSelectedObservation, setDialogOpen } from './scheduler-slice.jsx';

const ObservationsTimeline = () => {
    const dispatch = useDispatch();
    const observations = useSelector((state) => state.scheduler?.observations || []);
    const timeline = useSelector((state) => state.scheduler?.timeline);
    const { durationHours, isExpanded } = timeline;

    const [hoveredObservation, setHoveredObservation] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const [width, setWidth] = useState(1200);
    const containerRef = useRef(null);

    useEffect(() => {
        const updateWidth = () => {
            if (containerRef.current) {
                setWidth(containerRef.current.offsetWidth);
            }
        };

        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, [isExpanded]);
    const marginTop = 25;
    const marginBottom = 30;
    const barHeight = 30;
    const barSpacing = 5;
    const rowHeight = barHeight + barSpacing;

    // Filter observations within the time window
    const filteredObservations = useMemo(() => {
        const now = new Date();
        const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

        return observations.filter(obs => {
            if (!obs.pass) return false;
            const obsStart = new Date(obs.pass.event_start);
            const obsEnd = new Date(obs.pass.event_end);
            const inTimeWindow = obsEnd >= now && obsStart <= endTime;
            return inTimeWindow;
        }).sort((a, b) => new Date(a.pass.event_start) - new Date(b.pass.event_start));
    }, [observations, durationHours]);

    // Layout observations to avoid overlaps
    const { layoutData, requiredRows } = useMemo(() => {
        const now = new Date();
        const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
        const totalMs = endTime - now;

        const rows = [];

        filteredObservations.forEach((obs) => {
            const startTime = new Date(obs.pass.event_start);
            const obsEndTime = new Date(obs.pass.event_end);

            const startX = Math.max(0, ((startTime - now) / totalMs) * width);
            const endX = Math.min(width, ((obsEndTime - now) / totalMs) * width);
            const barWidth = endX - startX;

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
                    rows[rowIndex].push({ obs, startX, endX, barWidth, rowIndex });
                    placed = true;
                } else {
                    rowIndex++;
                }
            }
        });

        const layoutData = rows.flat();
        return { layoutData, requiredRows: Math.max(1, rows.length) };
    }, [filteredObservations, durationHours, width]);

    const height = Math.max(200, requiredRows * rowHeight + marginTop + marginBottom);

    const now = new Date();
    const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
    const hoursToShow = Math.min(durationHours, 48);
    const hourStep = hoursToShow <= 12 ? 2 : hoursToShow <= 24 ? 4 : 6;

    const handleObservationClick = (obs) => {
        dispatch(setSelectedObservation(obs));
        dispatch(setDialogOpen(true));
    };

    const getBarColor = (obs) => {
        if (obs.status === 'running') return '#4caf50';
        if (obs.status === 'completed') return '#42a5f5';
        if (obs.status === 'cancelled' || obs.status === 'failed') return '#ef5350';
        if (!obs.enabled) return '#999';
        return '#ab47bc';
    };

    return (
        <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
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
                <Box ref={containerRef} sx={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
                    <svg
                        width="100%"
                        height={height}
                        viewBox={`0 0 ${width} ${height}`}
                        style={{ display: 'block' }}
                        onMouseMove={(e) => {
                            setTooltipPosition({ x: e.clientX, y: e.clientY });
                        }}
                    >
                        <defs>
                            <pattern id="alternatingBg" width={width / (hoursToShow / hourStep)} height={height - marginTop - marginBottom} patternUnits="userSpaceOnUse">
                                <rect width={width / (hoursToShow / hourStep)} height={height - marginTop - marginBottom} fill="currentColor" opacity="0.02" />
                                <rect x={width / (hoursToShow / hourStep)} width={width / (hoursToShow / hourStep)} height={height - marginTop - marginBottom} fill="transparent" />
                            </pattern>
                            <filter id="shadow">
                                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3"/>
                            </filter>
                        </defs>

                        {/* Alternating background */}
                        <rect x="0" y={marginTop} width={width} height={height - marginTop - marginBottom} fill="url(#alternatingBg)" />

                        {/* Timeline border */}
                        <rect
                            x="0"
                            y={marginTop}
                            width={width}
                            height={height - marginTop - marginBottom}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="0.5"
                            opacity="0.3"
                        />

                        {/* Horizontal grid lines */}
                        {Array.from({ length: requiredRows - 1 }).map((_, i) => {
                            const y = marginTop + ((i + 1) * rowHeight);
                            return (
                                <line
                                    key={`h-grid-${i}`}
                                    x1="0"
                                    y1={y}
                                    x2={width}
                                    y2={y}
                                    stroke="currentColor"
                                    strokeWidth="0.5"
                                    opacity="0.15"
                                />
                            );
                        })}

                        {/* Vertical grid lines */}
                        {Array.from({ length: Math.floor(hoursToShow / hourStep) + 1 }).map((_, i) => {
                            const hour = i * hourStep;
                            const x = (hour / durationHours) * width;
                            const time = new Date(now.getTime() + hour * 60 * 60 * 1000);
                            const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                            const tPlusStr = `T+${Math.floor(hour)}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;

                            return (
                                <g key={`v-grid-${i}`}>
                                    {hour > 0 && (
                                        <line
                                            x1={x}
                                            y1={marginTop}
                                            x2={x}
                                            y2={height - marginBottom}
                                            stroke="currentColor"
                                            strokeWidth="0.5"
                                            opacity="0.2"
                                        />
                                    )}
                                    {/* T+ time axis at top */}
                                    <text
                                        x={x}
                                        y={marginTop - 5}
                                        textAnchor="middle"
                                        fontSize="11"
                                        fill="currentColor"
                                        opacity="0.7"
                                    >
                                        {tPlusStr}
                                    </text>
                                    {/* Absolute time axis at bottom */}
                                    <text
                                        x={x}
                                        y={height - 10}
                                        textAnchor="middle"
                                        fontSize="12"
                                        fill="currentColor"
                                    >
                                        {timeStr}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Current time marker */}
                        <g>
                            <line
                                x1="0"
                                y1={marginTop}
                                x2="0"
                                y2={height - marginBottom}
                                stroke="#f50057"
                                strokeWidth="2"
                            />
                            <text x="5" y={marginTop + 12} fontSize="12" fill="#f50057" fontWeight="bold">
                                NOW
                            </text>
                        </g>

                        {/* Observation events */}
                        {layoutData.map(({ obs, startX, barWidth, rowIndex }) => {
                            const y = marginTop + (rowIndex * rowHeight);
                            const endX = startX + barWidth;
                            const barColor = getBarColor(obs);

                            return (
                                <g
                                    key={obs.id}
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={() => setHoveredObservation(obs)}
                                    onMouseLeave={() => setHoveredObservation(null)}
                                    onClick={() => handleObservationClick(obs)}
                                >
                                    {/* Filled area */}
                                    <rect
                                        x={startX}
                                        y={marginTop}
                                        width={barWidth}
                                        height={height - marginTop - marginBottom}
                                        fill={barColor}
                                        opacity={hoveredObservation?.id === obs.id ? 0.15 : 0.1}
                                    />
                                    {/* Start line */}
                                    <line
                                        x1={startX}
                                        y1={marginTop}
                                        x2={startX}
                                        y2={height - marginBottom}
                                        stroke={barColor}
                                        strokeWidth="3"
                                        filter="url(#shadow)"
                                        opacity={hoveredObservation?.id === obs.id ? 0.9 : 1}
                                    />
                                    {/* End line */}
                                    <line
                                        x1={endX}
                                        y1={marginTop}
                                        x2={endX}
                                        y2={height - marginBottom}
                                        stroke={barColor}
                                        strokeWidth="3"
                                        filter="url(#shadow)"
                                        opacity={hoveredObservation?.id === obs.id ? 0.9 : 1}
                                    />
                                    {/* Satellite name */}
                                    {barWidth > 5 && (
                                        <text
                                            x={startX + barWidth / 2}
                                            y={(marginTop + height - marginBottom) / 2}
                                            fontSize="9"
                                            fontWeight="600"
                                            fill={barColor}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            transform={`rotate(-90, ${startX + barWidth / 2}, ${(marginTop + height - marginBottom) / 2})`}
                                            style={{ pointerEvents: 'none' }}
                                        >
                                            {obs.satellite.name || 'Unknown'}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>

                    {/* Tooltip */}
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
                                Start: {new Date(hoveredObservation.pass.event_start).toLocaleString()}
                            </Typography>
                            <Typography variant="caption" display="block">
                                End: {new Date(hoveredObservation.pass.event_end).toLocaleString()}
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
