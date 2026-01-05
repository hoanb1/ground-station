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
    useTheme,
} from '@mui/material';
import SunCalc from 'suncalc';
import { setTimelineDuration, setSelectedObservation, setDialogOpen } from './scheduler-slice.jsx';

const ObservationsTimeline = () => {
    const dispatch = useDispatch();
    const theme = useTheme();
    const observations = useSelector((state) => state.scheduler?.observations || []);
    const timeline = useSelector((state) => state.scheduler?.timeline);
    const { durationHours } = timeline;
    const groundStationLocation = useSelector((state) => state.location.location);

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
    }, []);
    const marginTop = 25;
    const marginBottom = 30;
    const marginLeft = 30;
    const marginRight = 30;
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
    const { layoutData, requiredRows, sunData } = useMemo(() => {
        const now = new Date();
        const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
        const totalMs = endTime - now;
        const drawableWidth = width - marginLeft - marginRight;

        // Calculate sun times for the timeline window
        let sunData = { nightPeriods: [], sunEvents: [] };
        if (groundStationLocation) {
            const { lat, lon } = groundStationLocation;

            const nightPeriods = [];
            const sunEvents = [];

            // Calculate for each day in the timeline window
            // Start from 1 day before to catch night periods that started before the window
            const startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(endTime);
            endDate.setDate(endDate.getDate() + 1);
            endDate.setHours(23, 59, 59, 999);

            let currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const sunTimes = SunCalc.getTimes(currentDate, lat, lon);
                const sunrise = sunTimes.sunrise;
                const sunset = sunTimes.sunset;

                // Check if sunrise is valid and within window
                if (sunrise && !isNaN(sunrise.getTime()) && sunrise >= now && sunrise <= endTime) {
                    sunEvents.push({ time: sunrise.getTime(), type: 'sunrise' });
                }

                // Check if sunset is valid and within window
                if (sunset && !isNaN(sunset.getTime()) && sunset >= now && sunset <= endTime) {
                    sunEvents.push({ time: sunset.getTime(), type: 'sunset' });
                }

                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // Sort events by time
            sunEvents.sort((a, b) => a.time - b.time);

            // Build night periods from events
            // Start by checking if we're in night at the start of the timeline
            const firstDayTimes = SunCalc.getTimes(new Date(now), lat, lon);
            const isNightAtStart = now < firstDayTimes.sunrise || now > firstDayTimes.sunset;

            if (isNightAtStart) {
                // Find first sunrise
                const firstSunrise = sunEvents.find(e => e.type === 'sunrise');
                if (firstSunrise) {
                    nightPeriods.push({
                        start: now.getTime(),
                        end: firstSunrise.time
                    });
                } else {
                    // Entire window is night
                    nightPeriods.push({
                        start: now.getTime(),
                        end: endTime.getTime()
                    });
                }
            }

            // Create night periods between sunset and sunrise events
            for (let i = 0; i < sunEvents.length; i++) {
                if (sunEvents[i].type === 'sunset') {
                    // Find next sunrise
                    const nextSunrise = sunEvents.slice(i + 1).find(e => e.type === 'sunrise');
                    if (nextSunrise) {
                        nightPeriods.push({
                            start: sunEvents[i].time,
                            end: nextSunrise.time
                        });
                    } else {
                        // No more sunrises, night until end of timeline
                        nightPeriods.push({
                            start: sunEvents[i].time,
                            end: endTime.getTime()
                        });
                    }
                }
            }

            sunData = { nightPeriods, sunEvents };
        }

        const rows = [];

        filteredObservations.forEach((obs) => {
            const startTime = new Date(obs.pass.event_start);
            const obsEndTime = new Date(obs.pass.event_end);

            const startX = marginLeft + Math.max(0, ((startTime - now) / totalMs) * drawableWidth);
            const endX = marginLeft + Math.min(drawableWidth, ((obsEndTime - now) / totalMs) * drawableWidth);
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
        return { layoutData, requiredRows: Math.max(1, rows.length), sunData };
    }, [filteredObservations, durationHours, width, marginLeft, marginRight, groundStationLocation]);

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
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={2} alignItems="center">
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary' }}>Timeline</Typography>
                </Stack>
                <Stack direction="row" spacing={2} alignItems="center">
                    <FormControl size="small" sx={{ minWidth: 85, '& .MuiInputBase-root': { fontSize: '0.875rem' } }}>
                        <InputLabel sx={{ fontSize: '0.875rem' }}>Duration</InputLabel>
                        <Select
                            value={durationHours}
                            onChange={(e) => dispatch(setTimelineDuration(e.target.value))}
                            label="Duration"
                        >
                            <MenuItem value={12} sx={{ fontSize: '0.875rem' }}>12h</MenuItem>
                            <MenuItem value={24} sx={{ fontSize: '0.875rem' }}>24h</MenuItem>
                            <MenuItem value={48} sx={{ fontSize: '0.875rem' }}>48h</MenuItem>
                            <MenuItem value={72} sx={{ fontSize: '0.875rem' }}>72h</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>
            </Box>

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
                        <rect x={marginLeft} y={marginTop} width={width - marginLeft - marginRight} height={height - marginTop - marginBottom} fill="url(#alternatingBg)" />

                        {/* Timeline border */}
                        <rect
                            x={marginLeft}
                            y={marginTop}
                            width={width - marginLeft - marginRight}
                            height={height - marginTop - marginBottom}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="0.5"
                            opacity="0.3"
                        />

                        {/* Night period shading */}
                        {sunData && sunData.nightPeriods.map((period, index) => {
                            const totalDuration = endTime.getTime() - now.getTime();
                            const leftPercent = ((period.start - now.getTime()) / totalDuration);
                            const widthPercent = ((period.end - period.start) / totalDuration);
                            const xPos = marginLeft + leftPercent * (width - marginLeft - marginRight);
                            const rectWidth = widthPercent * (width - marginLeft - marginRight);

                            return (
                                <rect
                                    key={`night-${index}`}
                                    x={xPos}
                                    y={marginTop}
                                    width={rectWidth}
                                    height={height - marginTop - marginBottom}
                                    fill={theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.15)'}
                                    style={{ pointerEvents: 'none' }}
                                />
                            );
                        })}

                        {/* Sun event markers - sunrise/sunset lines */}
                        {sunData && sunData.sunEvents.map((event, index) => {
                            const totalDuration = endTime.getTime() - now.getTime();
                            const position = ((event.time - now.getTime()) / totalDuration);
                            const xPos = marginLeft + position * (width - marginLeft - marginRight);
                            const isSunrise = event.type === 'sunrise';
                            const color = isSunrise ? '#6b5110' : '#2a5070';
                            const eventTime = new Date(event.time);
                            const timeStr = eventTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

                            return (
                                <g key={`sun-${index}`}>
                                    {/* Vertical line */}
                                    <line
                                        x1={xPos}
                                        y1={marginTop}
                                        x2={xPos}
                                        y2={height - marginBottom}
                                        stroke={color}
                                        strokeWidth="2"
                                        opacity="0.8"
                                        style={{ pointerEvents: 'none' }}
                                    />
                                    {/* Label at top */}
                                    <text
                                        x={xPos}
                                        y={marginTop - 8}
                                        textAnchor="middle"
                                        fontSize="10"
                                        fontWeight="bold"
                                        fill={color}
                                        opacity="0.8"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {isSunrise ? '☀ Sunrise' : '☾ Sunset'}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Vertical grid lines */}
                        {Array.from({ length: Math.floor(hoursToShow / hourStep) + 1 }).map((_, i) => {
                            const hour = i * hourStep;
                            const x = marginLeft + (hour / durationHours) * (width - marginLeft - marginRight);
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
                                x1={marginLeft}
                                y1={marginTop}
                                x2={marginLeft}
                                y2={height - marginBottom}
                                stroke="#f50057"
                                strokeWidth="2"
                            />
                            <text x={marginLeft + 5} y={marginTop + 12} fontSize="12" fill="#f50057" fontWeight="bold">
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
        </Box>
    );
};

export default ObservationsTimeline;
