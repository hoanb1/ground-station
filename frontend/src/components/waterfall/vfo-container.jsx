/**
 * Canvas-based VFO Markers container component
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from 'uuid';
import { Box, IconButton } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { addVFOMarker, updateVFOMarker, removeVFOMarker } from './waterfall-slice.jsx';

const VFOMarkersContainer = ({
                                 centerFrequency,
                                 sampleRate,
                                 waterfallHeight,
                                 bandscopeHeight,
                                 containerWidth,
                             }) => {
    const dispatch = useDispatch();
    const {
        vfoMarkers,
        maxVFOMarkers
    } = useSelector(state => state.waterfall);

    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const [actualWidth, setActualWidth] = useState(containerWidth);
    const lastMeasuredWidthRef = useRef(0);
    const [vfoColors] = useState(['#ffff00', '#00ffff', '#ff00ff', '#00ff00']);
    const [activeMarker, setActiveMarker] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const lastClientXRef = useRef(0);
    const height = bandscopeHeight + waterfallHeight;

    // Calculate frequency range
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;
    const freqRange = endFreq - startFreq;

    // Format frequency to display in MHz
    const formatFrequency = (freq) => {
        return (freq / 1e6).toFixed(3);
    };

    // Update actual width measurement
    const updateActualWidth = useCallback(() => {
        // Get the actual client dimensions of the element
        const rect = containerRef.current?.getBoundingClientRect();

        // Only update if the width has changed significantly (avoid unnecessary redraws)
        if (rect && Math.abs(rect.width - lastMeasuredWidthRef.current) > 1) {
            if (rect.width > 0) {
                lastMeasuredWidthRef.current = rect.width;
                setActualWidth(rect.width);
            }
        }
    }, []);

    // Poll for container width changes
    useEffect(() => {
        const interval = setInterval(() => {
            updateActualWidth();
        }, 100);

        return () => {
            clearInterval(interval);
        };
    }, [updateActualWidth]);

    // Update width when the container width changes
    useEffect(() => {
        updateActualWidth();
    }, [containerWidth, updateActualWidth]);

    // Draw all VFO markers on the canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Set canvas width based on actual measured width
        canvas.width = actualWidth;
        canvas.height = height;

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, height);

        // Draw each marker
        vfoMarkers.forEach(marker => {
            // Skip if the marker is outside the visible range
            if (marker.frequency < startFreq || marker.frequency > endFreq) {
                return;
            }

            // Calculate x position based on frequency
            const x = ((marker.frequency - startFreq) / freqRange) * canvas.width;

            // Draw marker line
            ctx.beginPath();
            ctx.strokeStyle = marker.color;
            ctx.lineWidth = 1;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // Draw frequency label background
            const labelText = `${formatFrequency(marker.frequency)} MHz`;
            ctx.font = '11px Arial';
            const textMetrics = ctx.measureText(labelText);
            const labelWidth = textMetrics.width + 20; // Add padding
            const labelHeight = 20;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.roundRect(
                x - labelWidth / 2,
                10,
                labelWidth,
                labelHeight,
                4 // rounded corner radius
            );
            ctx.fill();

            // Draw frequency label text
            ctx.fillStyle = marker.color;
            ctx.textAlign = 'center';
            ctx.fillText(labelText, x, 24);

            // Draw handle
            ctx.fillStyle = marker.color;
            const handleWidth = 12;
            const handleHeight = 20;
            ctx.beginPath();
            ctx.roundRect(
                x - handleWidth / 2,
                40,
                handleWidth,
                handleHeight,
                3 // rounded corner radius
            );
            ctx.fill();
        });
    }, [vfoMarkers, actualWidth, height, centerFrequency, sampleRate, startFreq, endFreq, freqRange]);

    // Calculate frequency from position
    const calculateFrequency = useCallback((position) => {
        const freqRatio = position / actualWidth;
        return startFreq + (freqRatio * freqRange);
    }, [startFreq, freqRange, actualWidth]);

    const handleAddVFO = () => {
        if (vfoMarkers.length < maxVFOMarkers) {
            // Create a new VFO marker at the center frequency
            const newVFO = {
                id: uuidv4(),
                color: vfoColors[vfoMarkers.length % vfoColors.length],
                frequency: centerFrequency,
                bandwidth: 3000 // Default bandwidth (3 kHz)
            };

            dispatch(addVFOMarker(newVFO));
        }
    };

    // Handle mouse events for marker interaction
    const handleMouseDown = (e) => {
        if (e.button !== 0) return; // Only respond to left mouse button

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Calculate scaling factor between canvas coordinate space and DOM space
        const scaleX = actualWidth / rect.width;
        const canvasX = x * scaleX;

        // Check if we clicked on a marker handle (around y=40-60px)
        if (y >= 40 && y <= 60) {
            // Convert each marker's frequency to a position
            for (const marker of vfoMarkers) {
                if (marker.frequency < startFreq || marker.frequency > endFreq) continue;

                const markerX = ((marker.frequency - startFreq) / freqRange) * actualWidth;

                if (Math.abs(canvasX - markerX) <= 10) { // 10px hitbox for handle
                    setActiveMarker(marker.id);
                    setIsDragging(true);
                    lastClientXRef.current = e.clientX;

                    // Prevent default to avoid text selection while dragging
                    e.preventDefault();
                    e.stopPropagation();
                    break;
                }
            }
        }
    };

    // Separate handler for adding document event listeners after a marker is selected
    useEffect(() => {
        if (isDragging && activeMarker) {
            const handleMouseMoveEvent = (e) => {
                e.preventDefault();
                e.stopPropagation();

                const deltaX = e.clientX - lastClientXRef.current;
                lastClientXRef.current = e.clientX;

                // Get the active marker
                const marker = vfoMarkers.find(m => m.id === activeMarker);
                if (!marker) return;

                // Calculate the current marker position in canvas coordinates
                const currentX = ((marker.frequency - startFreq) / freqRange) * actualWidth;

                // Calculate the scaling factor between screen pixels and canvas pixels
                const rect = canvasRef.current.getBoundingClientRect();
                const scaleFactor = actualWidth / rect.width;

                // Apply the scaled delta to get the new position
                const newX = currentX + (deltaX * scaleFactor);

                // Convert the new position to a frequency
                const newFrequency = calculateFrequency(newX);

                // Ensure the frequency stays within the visible range
                const limitedFreq = Math.max(startFreq, Math.min(newFrequency, endFreq));

                // Update the marker in Redux
                dispatch(updateVFOMarker({
                    id: marker.id,
                    frequency: limitedFreq,
                    bandwidth: marker.bandwidth
                }));
            };

            const handleMouseUpEvent = () => {
                setIsDragging(false);
                setActiveMarker(null);
            };

            // Add the event listeners
            document.addEventListener('mousemove', handleMouseMoveEvent);
            document.addEventListener('mouseup', handleMouseUpEvent);

            // Clean up
            return () => {
                document.removeEventListener('mousemove', handleMouseMoveEvent);
                document.removeEventListener('mouseup', handleMouseUpEvent);
            };
        }
    }, [isDragging, activeMarker, vfoMarkers, startFreq, endFreq, freqRange, actualWidth, calculateFrequency, dispatch]);

    // Double click to remove a marker
    const handleDoubleClick = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const scaleX = actualWidth / rect.width;
        const canvasX = x * scaleX;

        // Find which marker was double-clicked
        for (const marker of vfoMarkers) {
            if (marker.frequency < startFreq || marker.frequency > endFreq) continue;

            const markerX = ((marker.frequency - startFreq) / freqRange) * actualWidth;

            if (Math.abs(canvasX - markerX) <= 10) { // 10px hitbox
                dispatch(removeVFOMarker(marker.id));
                break;
            }
        }
    };

    return (
        <Box
            ref={containerRef}
            className={"vfo-markers-container"}
            sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${containerWidth}px`,
                height: height,
                zIndex: 600
            }}
        >
            {/* Canvas for VFO markers */}
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onDoubleClick={handleDoubleClick}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    cursor: isDragging ? 'ew-resize' : 'default',
                    touchAction: 'pan-y',
                }}
            />

            {/* Add VFO Button */}
            <IconButton
                sx={{
                    position: 'absolute',
                    bottom: 10,
                    right: 10,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    color: '#fff',
                    '&:hover': {
                        backgroundColor: 'rgba(0,0,0,0.9)',
                    },
                    zIndex: 700,
                }}
                onClick={handleAddVFO}
                disabled={vfoMarkers.length >= maxVFOMarkers}
            >
                <TuneIcon />
            </IconButton>
        </Box>
    );
};

export default VFOMarkersContainer;