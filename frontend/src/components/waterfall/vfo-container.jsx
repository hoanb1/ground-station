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
    const [dragMode, setDragMode] = useState(null); // 'center', 'leftEdge', or 'rightEdge'
    const lastClientXRef = useRef(0);
    const lastTouchXRef = useRef(0); // Track touch position
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
        if (!canvas) {
            return;
        }

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

            const marker = vfoMarkers[markerIdx];
            const bandwidth = marker.bandwidth || 3000;
            const mode = (marker.mode || 'USB').toUpperCase();

            // Skip if the marker is outside the visible range
            // Calculate the frequency range based on mode
            let markerLowFreq, markerHighFreq;

            if (mode === 'USB') {
                markerLowFreq = marker.frequency;
                markerHighFreq = marker.frequency + bandwidth;
            } else if (mode === 'LSB') {
                markerLowFreq = marker.frequency - bandwidth;
                markerHighFreq = marker.frequency;
            } else { // For AM, FM, and other modes that use both sidebands
                markerLowFreq = marker.frequency - bandwidth/2;
                markerHighFreq = marker.frequency + bandwidth/2;
            }

            if (markerHighFreq < startFreq || markerLowFreq > endFreq) {
                return;
            }

            // Calculate x position based on frequency
            const centerX = ((marker.frequency - startFreq) / freqRange) * canvas.width;

            // Calculate bandwidth edges positions based on mode
            let leftEdgeX, rightEdgeX;

            if (mode === 'USB') {
                leftEdgeX = centerX;
                rightEdgeX = ((markerHighFreq - startFreq) / freqRange) * canvas.width;
            } else if (mode === 'LSB') {
                leftEdgeX = ((markerLowFreq - startFreq) / freqRange) * canvas.width;
                rightEdgeX = centerX;
            } else { // AM, FM, etc.
                leftEdgeX = ((markerLowFreq - startFreq) / freqRange) * canvas.width;
                rightEdgeX = ((markerHighFreq - startFreq) / freqRange) * canvas.width;
            }

            // Ensure edges are within canvas
            leftEdgeX = Math.max(0, leftEdgeX);
            rightEdgeX = Math.min(canvas.width, rightEdgeX);

            // Draw shaded bandwidth area
            ctx.fillStyle = `${marker.color}22`; // Add transparency to color
            ctx.fillRect(leftEdgeX, 0, rightEdgeX - leftEdgeX, height);

            // Draw center marker line
            ctx.beginPath();
            ctx.strokeStyle = marker.color;
            ctx.lineWidth = 1.5;
            ctx.moveTo(centerX, 0);
            ctx.lineTo(centerX, height);
            ctx.stroke();

            // Draw bandwidth edge lines based on mode
            ctx.beginPath();
            ctx.strokeStyle = marker.color;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]); // Create dashed lines for the edges

            if (mode === 'USB') {
                // Only draw right edge for USB
                ctx.moveTo(rightEdgeX, 0);
                ctx.lineTo(rightEdgeX, height);
            } else if (mode === 'LSB') {
                // Only draw left edge for LSB
                ctx.moveTo(leftEdgeX, 0);
                ctx.lineTo(leftEdgeX, height);
            } else {
                // Draw both edges for other modes
                ctx.moveTo(leftEdgeX, 0);
                ctx.lineTo(leftEdgeX, height);

                ctx.moveTo(rightEdgeX, 0);
                ctx.lineTo(rightEdgeX, height);
            }

            ctx.stroke();
            ctx.setLineDash([]); // Reset to solid line

            // Draw edge handles based on mode
            ctx.fillStyle = marker.color;

            if (mode === 'USB' || mode === 'AM' || mode === 'FM') {
                // Right edge handle
                ctx.beginPath();
                ctx.arc(rightEdgeX, 20, 4, 0, 2 * Math.PI);
                ctx.fill();
            }

            if (mode === 'LSB' || mode === 'AM' || mode === 'FM') {
                // Left edge handle
                ctx.beginPath();
                ctx.arc(leftEdgeX, 20, 4, 0, 2 * Math.PI);
                ctx.fill();
            }

            // Draw frequency label background
            const modeText = ` [${mode}]`;
            const bwText = mode === 'USB' || mode === 'LSB' ? `${(bandwidth/1000).toFixed(1)}kHz` : `±${(bandwidth/2000).toFixed(1)}kHz`;
            const labelText = `${marker.name}: ${formatFrequency(marker.frequency)} MHz${modeText} ${bwText}`;
            ctx.font = '12px Monospace';
            const textMetrics = ctx.measureText(labelText);
            const labelWidth = textMetrics.width + 10; // Add padding
            const labelHeight = 14;

            ctx.fillStyle = marker.color;
            ctx.beginPath();
            ctx.roundRect(
                centerX - labelWidth / 2,
                5,
                labelWidth,
                labelHeight,
                2 // rounded corner radius
            );
            ctx.fill();

            // Draw frequency label text
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.fillText(labelText, centerX, 16);

            // Draw center handle
            ctx.fillStyle = marker.color;
            const handleWidth = 12;
            const handleHeight = 20;
            ctx.beginPath();
            ctx.roundRect(
                centerX - handleWidth / 2,
                40,
                handleWidth,
                handleHeight,
                2 // rounded corner radius
            );
            ctx.fill();
        });
    }, [vfoMarkers, actualWidth, height, centerFrequency, sampleRate, startFreq, endFreq, freqRange]);

    // Calculate frequency from position
    const calculateFrequency = useCallback((position) => {
        const freqRatio = position / actualWidth;
        return startFreq + (freqRatio * freqRange);
    }, [startFreq, freqRange, actualWidth]);

    // Check if mouse/touch is over a handle or edge
    const getHoverElement = useCallback((x, y) => {
        // Calculate scaling factor between canvas coordinate space and DOM space
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = actualWidth / rect.width;
        const canvasX = x * scaleX;

        // Check all markers
        for (const key of Object.keys(vfoMarkers)) {
            if (!vfoMarkers[key].active) continue;
            if (vfoMarkers[key].frequency < startFreq || vfoMarkers[key].frequency > endFreq) continue;

            const marker = vfoMarkers[key];
            const bandwidth = marker.bandwidth || 3000;
            const mode = (marker.mode || 'USB').toUpperCase();

            // Calculate center and edges positions based on mode
            const centerX = ((marker.frequency - startFreq) / freqRange) * actualWidth;

            let leftEdgeX, rightEdgeX;

            if (mode === 'USB') {
                leftEdgeX = centerX;
                rightEdgeX = ((marker.frequency + bandwidth - startFreq) / freqRange) * actualWidth;
            } else if (mode === 'LSB') {
                leftEdgeX = ((marker.frequency - bandwidth - startFreq) / freqRange) * actualWidth;
                rightEdgeX = centerX;
            } else { // AM, FM, etc.
                leftEdgeX = ((marker.frequency - bandwidth/2 - startFreq) / freqRange) * actualWidth;
                rightEdgeX = ((marker.frequency + bandwidth/2 - startFreq) / freqRange) * actualWidth;
            }

            // Ensure edges are within bounds
            leftEdgeX = Math.max(0, leftEdgeX);
            rightEdgeX = Math.min(actualWidth, rightEdgeX);

            // Check center handle (y between 40-60px)
            if (y >= 40 && y <= 60 && Math.abs(canvasX - centerX) <= 10) {
                return { key, element: 'center' };
            }

            // Check edge handles based on mode
            if (mode === 'USB' || mode === 'AM' || mode === 'FM') {
                // Check right edge (y between 15-25px, specifically around the handle)
                if (y >= 15 && y <= 25 && Math.abs(canvasX - rightEdgeX) <= 6) {
                    return { key, element: 'rightEdge' };
                }
            }

            if (mode === 'LSB' || mode === 'AM' || mode === 'FM') {
                // Check left edge (y between 15-25px, specifically around the handle)
                if (y >= 15 && y <= 25 && Math.abs(canvasX - leftEdgeX) <= 6) {
                    return { key, element: 'leftEdge' };
                }
            }
        }

        return { key: null, element: null };
    }, [vfoMarkers, actualWidth, startFreq, endFreq, freqRange]);

    // Handle mouse move to update cursor
    const handleMouseMove = useCallback((e) => {
        if (isDragging) return; // Don't change cursor during drag

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { element } = getHoverElement(x, y);

        if (element === 'center') {
            setCursor('ew-resize');
        } else if (element === 'leftEdge' || element === 'rightEdge') {
            setCursor('col-resize');
        } else {
            setCursor('default');
        }
    }, [getHoverElement, isDragging]);

    // Handle mouse leave
    const handleMouseLeave = useCallback(() => {
        if (!isDragging) {
            setCursor('default');
        }
    }, [isDragging]);

    // Handle mouse events for marker interaction
    const handleMouseDown = (e) => {
        // Only respond to left mouse button
        if (e.button !== 0) {
            return;
        }

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { key, element } = getHoverElement(x, y);

        if (key && element) {
            setActiveMarker(key);
            setDragMode(element);
            setIsDragging(true);
            setCursor(element === 'center' ? 'ew-resize' : 'col-resize');
            lastClientXRef.current = e.clientX;

            // Prevent default to avoid text selection while dragging
            e.preventDefault();
            e.stopPropagation();
        }
    };

    // Handle touch start for mobile devices
    const handleTouchStart = (e) => {
        if (e.touches.length !== 1) return; // Only handle single touches

        const touch = e.touches[0];
        const rect = canvasRef.current.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        const { key, element } = getHoverElement(x, y);

        if (key && element) {
            setActiveMarker(key);
            setDragMode(element);
            setIsDragging(true);
            lastTouchXRef.current = touch.clientX;

            // Prevent default to avoid scrolling while dragging
            e.preventDefault();
            e.stopPropagation();
        }
    };

    // Handle touch move for mobile devices
    const handleTouchMove = (e) => {
        if (!isDragging || !activeMarker || e.touches.length !== 1) return;

        e.preventDefault();
        e.stopPropagation();

        const touch = e.touches[0];
        const deltaX = touch.clientX - lastTouchXRef.current;
        lastTouchXRef.current = touch.clientX;

        // Get the active marker
        const marker = vfoMarkers[activeMarker];
        if (!marker) return;

        // Calculate the scaling factor between screen pixels and canvas pixels
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleFactor = actualWidth / rect.width;
        const scaledDelta = deltaX * scaleFactor;

        // Calculate pixels to frequency change
        const freqDelta = (scaledDelta / actualWidth) * freqRange;

        if (dragMode === 'center') {
            // Moving the entire VFO (center + bandwidth)
            const newFrequency = marker.frequency + freqDelta;

            // Ensure the frequency stays within the visible range
            const limitedFreq = Math.max(startFreq, Math.min(newFrequency, endFreq));

            dispatch(setVFOProperty({
                vfoNumber: parseInt(activeMarker),
                updates: {
                    frequency: limitedFreq,
                }
            }));
        }
        else if (dragMode === 'leftEdge') {
            // Moving the left edge (adjust bandwidth)
            const currentBandwidth = marker.bandwidth || 3000;
            // When dragging left edge right (positive delta), bandwidth decreases
            const newBandwidth = currentBandwidth - (2 * freqDelta);

            // Enforce minimum bandwidth (e.g., 500 Hz) and maximum (e.g., 30kHz)
            const limitedBandwidth = Math.max(500, Math.min(30000, newBandwidth));

            // Keep the center frequency constant
            dispatch(setVFOProperty({
                vfoNumber: parseInt(activeMarker),
                updates: {
                    bandwidth: limitedBandwidth,
                    // No frequency update
                }
            }));
        }
        else if (dragMode === 'rightEdge') {
            // Moving the right edge (adjust bandwidth)
            const currentBandwidth = marker.bandwidth || 3000;
            // When dragging right edge right (positive delta), bandwidth increases
            const newBandwidth = currentBandwidth + (2 * freqDelta);

            // Enforce minimum bandwidth and maximum
            const limitedBandwidth = Math.max(500, Math.min(30000, newBandwidth));

            // Keep the center frequency constant
            dispatch(setVFOProperty({
                vfoNumber: parseInt(activeMarker),
                updates: {
                    bandwidth: limitedBandwidth,
                    // No frequency update
                }
            }));
        }
    };

    // Handle touch end for mobile devices
    const handleTouchEnd = (e) => {
        if (isDragging) {
            setIsDragging(false);
            setActiveMarker(null);
            setDragMode(null);
        }
    };

    // Handle touch cancel for mobile devices
    const handleTouchCancel = (e) => {
        if (isDragging) {
            setIsDragging(false);
            setActiveMarker(null);
            setDragMode(null);
        }
    };

    // Inside the effect where we handle dragging
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

                // Calculate the scaling factor between screen pixels and canvas pixels
                const rect = canvasRef.current.getBoundingClientRect();
                const scaleFactor = actualWidth / rect.width;
                const scaledDelta = deltaX * scaleFactor;

                // Calculate pixels to frequency change
                const freqDelta = (scaledDelta / actualWidth) * freqRange;

                if (dragMode === 'center') {
                    // Moving the entire VFO (center + bandwidth)
                    const newFrequency = marker.frequency + freqDelta;

                    // Ensure the frequency stays within the visible range
                    const limitedFreq = Math.max(startFreq, Math.min(newFrequency, endFreq));

                    dispatch(setVFOProperty({
                        vfoNumber: parseInt(activeMarker),
                        updates: {
                            frequency: limitedFreq,
                        }
                    }));
                }
                else if (dragMode === 'leftEdge') {
                    // Moving the left edge (adjust bandwidth)
                    const currentBandwidth = marker.bandwidth || 3000;
                    // When dragging left edge right (positive delta), bandwidth decreases
                    const newBandwidth = currentBandwidth - (2 * freqDelta);

                    // Enforce minimum bandwidth (e.g., 500 Hz) and maximum (e.g., 30kHz)
                    const limitedBandwidth = Math.max(500, Math.min(30000, newBandwidth));

                    // Keep the center frequency constant
                    dispatch(setVFOProperty({
                        vfoNumber: parseInt(activeMarker),
                        updates: {
                            bandwidth: limitedBandwidth,
                            // No frequency update
                        }
                    }));
                }
                else if (dragMode === 'rightEdge') {
                    // Moving the right edge (adjust bandwidth)
                    const currentBandwidth = marker.bandwidth || 3000;
                    // When dragging right edge right (positive delta), bandwidth increases
                    const newBandwidth = currentBandwidth + (2 * freqDelta);

                    // Enforce minimum bandwidth and maximum
                    const limitedBandwidth = Math.max(500, Math.min(30000, newBandwidth));

                    // Keep the center frequency constant
                    dispatch(setVFOProperty({
                        vfoNumber: parseInt(activeMarker),
                        updates: {
                            bandwidth: limitedBandwidth,
                            // No frequency update
                        }
                    }));
                }
            };

            const handleMouseUpEvent = (event) => {
                setIsDragging(false);
                setActiveMarker(null);
                setDragMode(null);

                // Reset cursor based on mouse position
                if (canvasRef.current) {
                    const rect = canvasRef.current.getBoundingClientRect();
                    const mouseX = event.clientX - rect.left;
                    const mouseY = event.clientY - rect.top;

                    if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
                        const { element } = getHoverElement(mouseX, mouseY);

                        if (element === 'center') {
                            setCursor('ew-resize');
                        } else if (element === 'leftEdge' || element === 'rightEdge') {
                            setCursor('col-resize');
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
    }, [isDragging, activeMarker, dragMode, vfoMarkers, startFreq, endFreq, freqRange, actualWidth, getHoverElement, dispatch]);

    // Double click to remove a marker
    const handleDoubleClick = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { key } = getHoverElement(x, y);

        if (key) {
            dispatch(setVFOProperty({
                vfoNumber: parseInt(key),
                updates: {
                    active: false,
                }
            }));
        }
    };

    // Double tap to remove a marker on mobile devices
    const handleDoubleTap = (() => {
        let lastTap = 0;
        let tapTimeout;

        return (e) => {
            if (e.touches.length !== 1) return;

            clearTimeout(tapTimeout);

            const touch = e.touches[0];
            const rect = canvasRef.current.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;

            if (tapLength < 500 && tapLength > 0) {
                // Double tap detected
                const { key } = getHoverElement(x, y);

                if (key) {
                    dispatch(setVFOProperty({
                        vfoNumber: parseInt(key),
                        updates: {
                            active: false,
                        }
                    }));
                }

                e.preventDefault();
                e.stopPropagation();
            } else {
                // Single tap
                tapTimeout = setTimeout(() => {
                    // Single tap logic if needed
                }, 500);
            }

            lastTap = currentTime;
        };
    })();

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
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    cursor: cursor,
                    touchAction: 'none', // Prevent browser handling of all touch actions
                }}
            />
        </Box>
    );
};

export default VFOMarkersContainer;