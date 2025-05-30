import React, { useState, useEffect, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from 'uuid';
import { Box, IconButton } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import {
    enableVFO1,
    enableVFO2,
    enableVFO3,
    enableVFO4,
    disableVFO1,
    disableVFO2,
    disableVFO3,
    disableVFO4,
    setVFOProperty,
} from './waterfall-slice.jsx';

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
    const [cursor, setCursor] = useState('default');

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
        Object.keys(vfoMarkers).forEach(markerIdx => {
            // Skip inactive VFOs
            if (!vfoMarkers[markerIdx].active) {
                return;
            }

            // Skip if the markerIdx is outside the visible range
            if (vfoMarkers[markerIdx].frequency < startFreq || vfoMarkers[markerIdx].frequency > endFreq) {
                return;
            }

            // Calculate x position based on frequency
            const x = ((vfoMarkers[markerIdx].frequency - startFreq) / freqRange) * canvas.width;

            // Draw markerIdx line
            ctx.beginPath();
            ctx.strokeStyle = vfoMarkers[markerIdx].color;
            ctx.lineWidth = 1;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // Draw frequency label background
            const labelText = `${vfoMarkers[markerIdx].name}: ${formatFrequency(vfoMarkers[markerIdx].frequency)} MHz`;
            ctx.font = '12px Monospace';
            const textMetrics = ctx.measureText(labelText);
            const labelWidth = textMetrics.width + 20; // Add padding
            const labelHeight = 14;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.roundRect(
                x - labelWidth / 2,
                5,
                labelWidth,
                labelHeight,
                4 // rounded corner radius
            );
            ctx.fill();

            // Draw frequency label text
            ctx.fillStyle = vfoMarkers[markerIdx].color;
            ctx.textAlign = 'center';
            ctx.fillText(labelText, x, 16);

            // Draw handle
            ctx.fillStyle = vfoMarkers[markerIdx].color;
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

    // Check if mouse is over a handle
    const isOverHandle = useCallback((x, y) => {
        // Check if y-coordinate is in handle area
        if (y < 40 || y > 60) return false;

        // Calculate scaling factor between canvas coordinate space and DOM space
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = actualWidth / rect.width;
        const canvasX = x * scaleX;

        // Check all markers
        for (const key of Object.keys(vfoMarkers)) {
            if (!vfoMarkers[key].active) continue;
            if (vfoMarkers[key].frequency < startFreq || vfoMarkers[key].frequency > endFreq) continue;

            const markerX = ((vfoMarkers[key].frequency - startFreq) / freqRange) * actualWidth;
            if (Math.abs(canvasX - markerX) <= 10) { // 10px hitbox
                return true;
            }
        }

        return false;
    }, [vfoMarkers, actualWidth, startFreq, endFreq, freqRange]);

    // Handle mouse move to update cursor
    const handleMouseMove = useCallback((e) => {
        if (isDragging) return; // Don't change cursor during drag

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (isOverHandle(x, y)) {
            setCursor('ew-resize');
        } else {
            setCursor('default');
        }
    }, [isOverHandle, isDragging]);

    // Handle mouse leave
    const handleMouseLeave = useCallback(() => {
        if (!isDragging) {
            setCursor('default');
        }
    }, [isDragging]);

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
            Object.keys(vfoMarkers).forEach(key => {
                if (!vfoMarkers[key].active) return;
                if (vfoMarkers[key].frequency < startFreq || vfoMarkers[key].frequency > endFreq) return;

                const markerX = ((vfoMarkers[key].frequency - startFreq) / freqRange) * actualWidth;

                if (Math.abs(canvasX - markerX) <= 10) { // 10px hitbox for handle
                    setActiveMarker(key);
                    setIsDragging(true);
                    setCursor('ew-resize');
                    lastClientXRef.current = e.clientX;

                    // Prevent default to avoid text selection while dragging
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
            });
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
                const marker = vfoMarkers[activeMarker];
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

                dispatch(setVFOProperty({vfoNumber: parseInt(activeMarker), updates: {
                        frequency: limitedFreq,
                        bandwidth: marker.bandwidth,
                    }
                }));
            };

            const handleMouseUpEvent = () => {
                setIsDragging(false);
                setActiveMarker(null);
                // Reset cursor based on mouse position
                if (canvasRef.current) {
                    const rect = canvasRef.current.getBoundingClientRect();
                    const mouseX = event.clientX - rect.left;
                    const mouseY = event.clientY - rect.top;

                    if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
                        if (isOverHandle(mouseX, mouseY)) {
                            setCursor('ew-resize');
                        } else {
                            setCursor('default');
                        }
                    } else {
                        setCursor('default');
                    }
                }
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
    }, [isDragging, activeMarker, vfoMarkers, startFreq, endFreq, freqRange, actualWidth, calculateFrequency, isOverHandle]);

    // Double click to remove a marker
    const handleDoubleClick = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const scaleX = actualWidth / rect.width;
        const canvasX = x * scaleX;

        // Find which marker was double-clicked
        Object.keys(vfoMarkers).forEach(key => {
            if (!vfoMarkers[key].active) return;
            if (vfoMarkers[key].frequency < startFreq || vfoMarkers[key].frequency > endFreq) return;

            const markerX = ((vfoMarkers[key].frequency - startFreq) / freqRange) * actualWidth;

            // Check the 10px hitbox
            if (Math.abs(canvasX - markerX) <= 10) {
                console.info("to delete: ", key);
                dispatch(setVFOProperty({vfoNumber: parseInt(key), updates: {
                        active: false,
                    }
                }));
            }
        });
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
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onDoubleClick={handleDoubleClick}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    cursor: cursor,
                    touchAction: 'pan-y',
                }}
            />
        </Box>
    );
};

export default VFOMarkersContainer;