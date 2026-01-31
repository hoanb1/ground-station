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

import React, { useEffect, useRef, useState } from 'react';
import {
    Box,
    Typography,
    Chip,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export default function RecordingDialog({ open, onClose, recording }) {
    const { t } = useTranslation('filebrowser');
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [showHint, setShowHint] = useState(false);
    const [cursorInfo, setCursorInfo] = useState(null);
    const panStartRef = useRef({ x: 0, y: 0 });
    const pointerStartRef = useRef({ x: 0, y: 0 });
    const pointersRef = useRef(new Map());
    const pinchStartRef = useRef({ distance: 0, zoom: 1, pan: { x: 0, y: 0 } });
    const zoomContainerRef = useRef(null);
    const zoomImageRef = useRef(null);
    const lastPointerTypeRef = useRef('mouse');

    // Get timezone preference
    const timezone = useSelector((state) => {
        const tzPref = state.preferences?.preferences?.find(p => p.name === 'timezone');
        return tzPref?.value || 'UTC';
    });

    // Timezone-aware date formatting function
    const formatDate = (isoDate) => {
        const date = new Date(isoDate);
        return date.toLocaleString('en-US', { timeZone: timezone });
    };

    useEffect(() => {
        if (open) {
            setZoom(1);
            setPan({ x: 0, y: 0 });
            setIsPanning(false);
            setShowHint(true);
        }
    }, [open, recording?.snapshot?.url]);

    useEffect(() => {
        const container = zoomContainerRef.current;
        if (!container) return;

        const handleWheel = (event) => {
            if (!recording?.snapshot) return;
            event.preventDefault();
            event.stopPropagation();
            handleZoom(event);
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', handleWheel);
        };
    }, [recording?.snapshot, zoom, pan]);

    useEffect(() => {
        if (!showHint) return undefined;
        const timer = setTimeout(() => setShowHint(false), 2500);
        return () => clearTimeout(timer);
    }, [showHint]);

    const sectionSx = {
        p: 2,
        mb: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50'),
    };

    const rowSx = {
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '160px 1fr' },
        gap: { xs: 0.5, sm: 2 },
        py: 0.5,
    };

    const formatFrequency = (frequencyHz) => {
        if (frequencyHz === null || frequencyHz === undefined) return '';
        if (frequencyHz >= 1e9) {
            return `${(frequencyHz / 1e9).toFixed(6)} GHz`;
        }
        if (frequencyHz >= 1e6) {
            return `${(frequencyHz / 1e6).toFixed(6)} MHz`;
        }
        if (frequencyHz >= 1e3) {
            return `${(frequencyHz / 1e3).toFixed(3)} kHz`;
        }
        return `${frequencyHz.toFixed(0)} Hz`;
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const getPanBounds = (zoomValue) => {
        const container = zoomContainerRef.current;
        const image = zoomImageRef.current;
        if (!container || !image) {
            return { maxX: 0, maxY: 0 };
        }
        const rect = container.getBoundingClientRect();
        const naturalWidth = image.naturalWidth || 0;
        const naturalHeight = image.naturalHeight || 0;
        if (!naturalWidth || !naturalHeight) {
            return { maxX: 0, maxY: 0 };
        }
        const scaleToContain = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
        const scaledWidth = naturalWidth * scaleToContain * zoomValue;
        const scaledHeight = naturalHeight * scaleToContain * zoomValue;
        const maxX = Math.max(0, (scaledWidth - rect.width) / 2);
        const maxY = Math.max(0, (scaledHeight - rect.height) / 2);
        return { maxX, maxY };
    };

    const getImageCursorInfo = (event) => {
        const container = zoomContainerRef.current;
        const image = zoomImageRef.current;
        if (!container || !image) return null;

        const rect = container.getBoundingClientRect();
        const naturalWidth = image.naturalWidth || 0;
        const naturalHeight = image.naturalHeight || 0;
        if (!naturalWidth || !naturalHeight) return null;

        const localX = event.clientX - rect.left;
        const localY = event.clientY - rect.top;
        const centeredX = localX - rect.width / 2;
        const centeredY = localY - rect.height / 2;
        const unscaledX = (centeredX - pan.x) / zoom;
        const unscaledY = (centeredY - pan.y) / zoom;

        const scaleToContain = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
        const contentWidth = naturalWidth * scaleToContain;
        const contentHeight = naturalHeight * scaleToContain;

        const halfWidth = contentWidth / 2;
        const halfHeight = contentHeight / 2;
        if (unscaledX < -halfWidth || unscaledX > halfWidth || unscaledY < -halfHeight || unscaledY > halfHeight) {
            return null;
        }

        const imageX = (unscaledX + halfWidth) / contentWidth * naturalWidth;
        const imageY = (unscaledY + halfHeight) / contentHeight * naturalHeight;

        const centerFrequency = recording?.metadata?.center_frequency;
        const sampleRate = recording?.metadata?.sample_rate;
        const startTime = recording?.metadata?.start_time;
        const endTime = recording?.metadata?.finalized_time || recording?.modified || recording?.created;

        const hasFrequencyData = Number.isFinite(centerFrequency) && Number.isFinite(sampleRate);
        const hasTimeData = Boolean(startTime && endTime);

        let frequency = null;
        if (hasFrequencyData) {
            const startFreq = centerFrequency - sampleRate / 2;
            frequency = startFreq + (imageX / naturalWidth) * sampleRate;
        }

        let timeLabel = '';
        if (hasTimeData) {
            const startMs = new Date(startTime).getTime();
            const endMs = new Date(endTime).getTime();
            if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
                const timeMs = startMs + (imageY / naturalHeight) * (endMs - startMs);
                timeLabel = formatDate(new Date(timeMs).toISOString());
            }
        }

        return {
            x: localX,
            y: localY,
            frequency,
            timeLabel,
        };
    };

    const clampPan = (nextPan, zoomValue) => {
        if (zoomValue <= 1) {
            return { x: 0, y: 0 };
        }
        const { maxX, maxY } = getPanBounds(zoomValue);
        return {
            x: clamp(nextPan.x, -maxX, maxX),
            y: clamp(nextPan.y, -maxY, maxY),
        };
    };

    const handleZoom = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setShowHint(false);
        lastPointerTypeRef.current = event.pointerType || 'mouse';
        if (!recording?.snapshot) return;
        if (!zoomContainerRef.current) return;
        const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
        const nextZoom = clamp(zoom * zoomFactor, 1, 6);
        const rect = zoomContainerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const cursorOffset = {
            x: event.clientX - centerX,
            y: event.clientY - centerY,
        };
        const ratio = nextZoom / zoom;
        const nextPan = {
            x: pan.x + (1 - ratio) * cursorOffset.x,
            y: pan.y + (1 - ratio) * cursorOffset.y,
        };

        setZoom(nextZoom);
        setPan(clampPan(nextPan, nextZoom));
        if (event.pointerType !== 'touch') {
            setCursorInfo(getImageCursorInfo(event));
        }
    };

    const handlePointerDown = (event) => {
        if (!recording?.snapshot) return;
        if (event.pointerType !== 'touch' && event.button !== 0) return;
        setShowHint(false);
        lastPointerTypeRef.current = event.pointerType || 'mouse';
        if (event.pointerType !== 'touch' || pointersRef.current.size === 0) {
            setCursorInfo(getImageCursorInfo(event));
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointersRef.current.size === 2) {
            const [p1, p2] = Array.from(pointersRef.current.values());
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            pinchStartRef.current = {
                distance: Math.hypot(dx, dy),
                zoom,
                pan: { ...pan },
            };
            setIsPanning(false);
            return;
        }

        if (pointersRef.current.size === 1) {
            setIsPanning(true);
            pointerStartRef.current = { x: event.clientX, y: event.clientY };
            panStartRef.current = { ...pan };
        }
    };

    const handlePointerMove = (event) => {
        if (!recording?.snapshot) return;
        lastPointerTypeRef.current = event.pointerType || 'mouse';
        if (event.pointerType !== 'touch' || pointersRef.current.size < 2) {
            setCursorInfo(getImageCursorInfo(event));
        }
        if (!pointersRef.current.has(event.pointerId)) return;
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointersRef.current.size === 2) {
            const [p1, p2] = Array.from(pointersRef.current.values());
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const distance = Math.hypot(dx, dy);
            const start = pinchStartRef.current;
            if (!start.distance) return;

            const ratio = distance / start.distance;
            const nextZoom = clamp(start.zoom * ratio, 1, 6);
            const rect = zoomContainerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const centerX = (p1.x + p2.x) / 2 - (rect.left + rect.width / 2);
            const centerY = (p1.y + p2.y) / 2 - (rect.top + rect.height / 2);
            const zoomRatio = nextZoom / start.zoom;
            const nextPan = {
                x: start.pan.x + (1 - zoomRatio) * centerX,
                y: start.pan.y + (1 - zoomRatio) * centerY,
            };

            setZoom(nextZoom);
            setPan(clampPan(nextPan, nextZoom));
            return;
        }

        if (!isPanning) return;
        const dx = event.clientX - pointerStartRef.current.x;
        const dy = event.clientY - pointerStartRef.current.y;
        setPan(clampPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy }, zoom));
    };

    const handlePointerUp = (event) => {
        if (pointersRef.current.has(event.pointerId)) {
            pointersRef.current.delete(event.pointerId);
        }
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (pointersRef.current.size < 2) {
            pinchStartRef.current = { distance: 0, zoom: 1, pan: { x: 0, y: 0 } };
        }
        if (pointersRef.current.size === 1) {
            const [p1] = Array.from(pointersRef.current.values());
            pointerStartRef.current = { x: p1.x, y: p1.y };
            panStartRef.current = { ...pan };
            setIsPanning(true);
            return;
        }
        setIsPanning(false);
    };

    if (!recording) return null;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
        >
            <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">Recording Details</Typography>
                    <Box>
                        {recording?.snapshot?.width && recording?.snapshot?.height && (
                            <Chip
                                label={`${recording.snapshot.width}×${recording.snapshot.height}`}
                                size="small"
                                sx={{ mr: 1, height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                            />
                        )}
                        <Chip label={formatBytes(recording?.data_size || 0)} size="small" sx={{ height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }} />
                    </Box>
                </Box>
            </DialogTitle>
            <DialogContent>
                {recording && (
                    <Box sx={{ mt: 1 }}>
                        {recording.snapshot && (
                            <Box
                                sx={{
                                    mb: 2,
                                    textAlign: 'center',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1.5,
                                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50'),
                                    height: { xs: 280, sm: 360, md: 440 },
                                    overflow: 'hidden',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    touchAction: 'none',
                                    position: 'relative',
                                    '&:hover': {
                                        boxShadow: '0 0 0 2px rgba(66, 135, 245, 0.25)',
                                        borderStyle: 'dashed',
                                    },
                                }}
                                ref={zoomContainerRef}
                                onWheel={handleZoom}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={handlePointerUp}
                                onPointerLeave={() => {
                                    if (lastPointerTypeRef.current !== 'touch') {
                                        setCursorInfo(null);
                                    }
                                }}
                                onDoubleClick={() => {
                                    setZoom(1);
                                    setPan({ x: 0, y: 0 });
                                }}
                            >
                                <img
                                    src={recording.snapshot.url}
                                    alt={recording.name}
                                    ref={zoomImageRef}
                                    draggable={false}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'contain',
                                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                        transformOrigin: 'center center',
                                        cursor: isPanning ? 'grabbing' : 'grab',
                                    }}
                                />
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        top: 8,
                                        right: 8,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                        px: 1,
                                        py: 0.5,
                                        borderRadius: 999,
                                        bgcolor: 'rgba(0, 0, 0, 0.55)',
                                        color: 'common.white',
                                        fontSize: '0.7rem',
                                        letterSpacing: '0.02em',
                                        pointerEvents: 'none',
                                    }}
                                >
                                    <ZoomInIcon sx={{ fontSize: '0.9rem' }} />
                                    Zoom
                                </Box>
                                {showHint && (
                                    <Box
                                        sx={{
                                            position: 'absolute',
                                            bottom: 8,
                                            left: 8,
                                            px: 1.25,
                                            py: 0.6,
                                            borderRadius: 1,
                                            bgcolor: 'rgba(0, 0, 0, 0.55)',
                                            color: 'common.white',
                                            fontSize: '0.7rem',
                                            letterSpacing: '0.02em',
                                            pointerEvents: 'none',
                                        }}
                                    >
                                        Scroll to zoom · Drag to pan
                                    </Box>
                                )}
                                {cursorInfo && (
                                    <>
                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                top: 0,
                                                bottom: 0,
                                                left: cursorInfo.x,
                                                width: '1px',
                                                bgcolor: 'rgba(255, 255, 255, 0.5)',
                                                pointerEvents: 'none',
                                            }}
                                        />
                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                left: 0,
                                                right: 0,
                                                top: cursorInfo.y,
                                                height: '1px',
                                                bgcolor: 'rgba(255, 255, 255, 0.5)',
                                                pointerEvents: 'none',
                                            }}
                                        />
                                        {cursorInfo.frequency !== null && (
                                            <Box
                                                sx={{
                                                    position: 'absolute',
                                                    top: 8,
                                                    left: cursorInfo.x,
                                                    transform: 'translateX(-50%)',
                                                    px: 1,
                                                    py: 0.4,
                                                    borderRadius: 1,
                                                    bgcolor: 'rgba(0, 0, 0, 0.7)',
                                                    color: 'common.white',
                                                    fontSize: '0.7rem',
                                                    letterSpacing: '0.02em',
                                                    pointerEvents: 'none',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {formatFrequency(cursorInfo.frequency)}
                                            </Box>
                                        )}
                                        {cursorInfo.timeLabel && (
                                            <Box
                                                sx={{
                                                    position: 'absolute',
                                                    left: 8,
                                                    top: cursorInfo.y,
                                                    transform: 'translateY(-50%)',
                                                    px: 1,
                                                    py: 0.4,
                                                    borderRadius: 1,
                                                    bgcolor: 'rgba(0, 0, 0, 0.7)',
                                                    color: 'common.white',
                                                    fontSize: '0.7rem',
                                                    letterSpacing: '0.02em',
                                                    pointerEvents: 'none',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {cursorInfo.timeLabel}
                                            </Box>
                                        )}
                                    </>
                                )}
                            </Box>
                        )}

                        <Typography variant="subtitle2" gutterBottom>
                            Recording
                        </Typography>
                        <Box sx={sectionSx}>
                            <Box sx={rowSx}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                    Name
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                                    {recording.name}
                                </Typography>
                            </Box>
                            <Box sx={rowSx}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                    Files
                                </Typography>
                                <Box sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                    <Box sx={{ mb: 0.5 }}>
                                        {recording.data_file} ({formatBytes(recording.data_size)})
                                    </Box>
                                    <Box sx={{ mb: recording.snapshot ? 0.5 : 0 }}>
                                        {recording.meta_file}
                                    </Box>
                                    {recording.snapshot && (
                                        <Box>
                                            {recording.snapshot.filename} ({recording.snapshot.width}×{recording.snapshot.height})
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        </Box>

                        {recording.metadata && (
                            <>
                                {(recording.metadata.target_satellite_name || recording.metadata.target_satellite_norad_id) && (
                                    <>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Target Satellite
                                        </Typography>
                                        <Box sx={sectionSx}>
                                            {recording.metadata.target_satellite_name && (
                                                <Box sx={rowSx}>
                                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                        Name
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                        {recording.metadata.target_satellite_name}
                                                    </Typography>
                                                </Box>
                                            )}
                                            {recording.metadata.target_satellite_norad_id && (
                                                <Box sx={rowSx}>
                                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                        NORAD ID
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                        {recording.metadata.target_satellite_norad_id}
                                                    </Typography>
                                                </Box>
                                            )}
                                        </Box>
                                    </>
                                )}

                                <Typography variant="subtitle2" gutterBottom>
                                    Metadata
                                </Typography>
                                <Box sx={sectionSx}>
                                    {recording.metadata.datatype && (
                                        <Box sx={rowSx}>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                Data Type
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                {recording.metadata.datatype}
                                            </Typography>
                                        </Box>
                                    )}
                                    {recording.metadata.sample_rate && (
                                        <Box sx={rowSx}>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                Sample Rate
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                {recording.metadata.sample_rate} Hz
                                            </Typography>
                                        </Box>
                                    )}
                                    {recording.metadata.start_time && (
                                        <Box sx={rowSx}>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                Start Time
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                {formatDate(recording.metadata.start_time)}
                                            </Typography>
                                        </Box>
                                    )}
                                    {recording.metadata.finalized_time && (
                                        <Box sx={rowSx}>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                End Time
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                {formatDate(recording.metadata.finalized_time)}
                                            </Typography>
                                        </Box>
                                    )}
                                    {recording.metadata.version && (
                                        <Box sx={rowSx}>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                SigMF Version
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                {recording.metadata.version}
                                            </Typography>
                                        </Box>
                                    )}
                                    {recording.metadata.recorder && (
                                        <Box sx={rowSx}>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                Recorder
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                {recording.metadata.recorder}
                                            </Typography>
                                        </Box>
                                    )}
                                    {recording.metadata.description && (
                                        <Box sx={rowSx}>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                Description
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                                {recording.metadata.description}
                                            </Typography>
                                        </Box>
                                    )}
                                </Box>

                                {recording.metadata.captures?.length > 0 && (
                                    <>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Capture Segments ({recording.metadata.captures.length})
                                        </Typography>
                                        <Stack spacing={1} sx={{ mb: 2 }}>
                                            {recording.metadata.captures.map((capture, index) => (
                                                <Box
                                                    key={index}
                                                    sx={{
                                                        p: 2,
                                                        border: '1px solid',
                                                        borderColor: 'divider',
                                                        borderRadius: 1.5,
                                                        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'common.white'),
                                                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
                                                    }}
                                                >
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                                            Segment {index + 1}
                                                        </Typography>
                                                        <Chip
                                                            label={`${Object.keys(capture).length} fields`}
                                                            size="small"
                                                            sx={{ height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                                                        />
                                                    </Box>
                                                    <Box sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                                                        {Object.entries(capture).map(([key, value]) => (
                                                            <Box key={key} sx={rowSx}>
                                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                                    {key}
                                                                </Typography>
                                                                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                                                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                                </Typography>
                                                            </Box>
                                                        ))}
                                                    </Box>
                                                </Box>
                                            ))}
                                        </Stack>
                                    </>
                                )}
                            </>
                        )}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => window.open(recording?.download_urls.data, '_blank')}
                    startIcon={<DownloadIcon />}
                >
                    Download Data
                </Button>
                <Button
                    onClick={() => window.open(recording?.download_urls.meta, '_blank')}
                    startIcon={<DownloadIcon />}
                >
                    Download Metadata
                </Button>
                {recording?.snapshot && (
                    <Button
                        onClick={() => window.open(recording.snapshot.url, '_blank')}
                        startIcon={<DownloadIcon />}
                    >
                        Download Snapshot
                    </Button>
                )}
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}
