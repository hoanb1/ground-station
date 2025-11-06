
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


import React, {useState, useEffect, useCallback, useRef, useMemo} from "react";
import { useDispatch, useSelector } from "react-redux";
import { Box, IconButton } from '@mui/material';
import {
    setVFOProperty,
    setSelectedVFO,
} from './waterfall-slice.jsx';
import { canvasDrawingUtils, getVFOLabelIconWidth } from './vfo-utils.js';

const VFOMarkersContainer = ({
                                 centerFrequency,
                                 sampleRate,
                                 waterfallHeight,
                                 bandscopeHeight,
                                 containerWidth,
                                 zoomScale,
                                 currentPositionX,
                             }) => {
    const dispatch = useDispatch();
    const {
        vfoMarkers,
        maxVFOMarkers,
        selectedVFO,
        vfoColors,
        vfoActive,
    } = useSelector(state => state.waterfall);

    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    // Canvas context caching for performance
    const canvasContextRef = useRef(null);
    const [actualWidth, setActualWidth] = useState(containerWidth);
    const lastMeasuredWidthRef = useRef(0);
    const [activeMarker, setActiveMarker] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const isDraggingRef = useRef(false);
    const [dragMode, setDragMode] = useState(null); // 'body', 'leftEdge', or 'rightEdge'
    const lastClientXRef = useRef(0);
    const lastTouchXRef = useRef(0);
    //const height = bandscopeHeight + waterfallHeight;
    const height = bandscopeHeight;
    const [cursor, setCursor] = useState('default');

    // Track the previous VFO active state to detect changes
    const prevVfoActiveRef = useRef({});

    // Configurable bandwidth limits
    const [minBandwidth] = useState(500); // 500 Hz minimum
    const [maxBandwidth] = useState(100000); // 100 kHz maximum

    // Configurable vertical length of resize handles
    const [edgeHandleHeight] = useState(20);

    // Configurable Y position offset for resize handles
    const [edgeHandleYOffset] = useState(50);

    // Configurable mousewheel frequency step (in Hz)
    const [mousewheelFreqStep] = useState(1000); // 100 Hz step

    // Calculate frequency range
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;
    const freqRange = endFreq - startFreq;

    // Format frequency to display in MHz
    const formatFrequency = (freq) => {
        return (freq / 1e6).toFixed(3);
    };

    // Get or create canvas context with caching
    const getCanvasContext = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        // Return cached context if available and canvas hasn't changed
        if (canvasContextRef.current && canvasContextRef.current.canvas === canvas) {
            return canvasContextRef.current;
        }

        // Create and cache new context
        try {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
                canvasContextRef.current = ctx;
                return ctx;
            }
        } catch (error) {
            console.error('Failed to get canvas 2d context:', error);
        }

        return null;
    }, []);

    // Clear canvas context cache when canvas changes
    useEffect(() => {
        // Reset cached context when canvas ref changes
        canvasContextRef.current = null;
    }, [canvasRef.current]);

    // Consolidated function to set redux state
    const updateVFOProperty = useCallback((vfoNumber, updates) => {
        dispatch(setVFOProperty({
            vfoNumber,
            updates,
        }));
    }, [dispatch]);

    // Utility function for bandwidth calculation
    const calculateBandwidthChange = useCallback((currentBandwidth, freqDelta, dragMode) => {
        let newBandwidth;
        if (dragMode === 'leftEdge') {
            newBandwidth = currentBandwidth - (2 * freqDelta);
        } else if (dragMode === 'rightEdge') {
            newBandwidth = currentBandwidth + (2 * freqDelta);
        } else {
            return currentBandwidth;
        }

        return Math.round(Math.max(minBandwidth, Math.min(maxBandwidth, newBandwidth)));
    }, [minBandwidth, maxBandwidth]);

    // Utility function for VFO frequency calculations
    const calculateVFOFrequencyBounds = useCallback((marker) => {
        const bandwidth = marker.bandwidth || 3000;
        const mode = (marker.mode || 'USB').toUpperCase();

        let markerLowFreq, markerHighFreq, leftEdgeX, rightEdgeX;

        if (mode === 'USB' || mode === 'CW') {
            markerLowFreq = marker.frequency;
            markerHighFreq = marker.frequency + bandwidth;
            leftEdgeX = ((marker.frequency - startFreq) / freqRange) * actualWidth;
            rightEdgeX = ((markerHighFreq - startFreq) / freqRange) * actualWidth;
        } else if (mode === 'LSB') {
            markerLowFreq = marker.frequency - bandwidth;
            markerHighFreq = marker.frequency;
            leftEdgeX = ((markerLowFreq - startFreq) / freqRange) * actualWidth;
            rightEdgeX = ((marker.frequency - startFreq) / freqRange) * actualWidth;
        } else { // AM, FM, etc.
            markerLowFreq = marker.frequency - bandwidth/2;
            markerHighFreq = marker.frequency + bandwidth/2;
            leftEdgeX = ((markerLowFreq - startFreq) / freqRange) * actualWidth;
            rightEdgeX = ((markerHighFreq - startFreq) / freqRange) * actualWidth;
        }

        // Ensure edges are within bounds
        leftEdgeX = Math.max(0, leftEdgeX);
        rightEdgeX = Math.min(actualWidth, rightEdgeX);

        return {
            markerLowFreq,
            markerHighFreq,
            leftEdgeX,
            rightEdgeX,
            centerX: ((marker.frequency - startFreq) / freqRange) * actualWidth,
            mode,
            bandwidth
        };
    }, [startFreq, freqRange, actualWidth]);


    // When the VFO status changes, detect which VFO was just made active
    useEffect(() => {
        // Compare current vfoActive with previous state
        Object.keys(vfoActive).forEach(vfoNumber => {
            const isCurrentlyActive = vfoActive[vfoNumber];
            const wasPreviouslyActive = prevVfoActiveRef.current[vfoNumber] || false;

            // Only process VFOs that just became active (transition from false/undefined to true)
            if (isCurrentlyActive && !wasPreviouslyActive) {
                const marker = vfoMarkers[vfoNumber];

                if (marker) {
                    const visibleRange = getVisibleFrequencyRange();
                    const needsFrequencyUpdate =
                        marker.frequency === null ||
                        marker.frequency < visibleRange.startFrequency ||
                        marker.frequency > visibleRange.endFrequency;

                    if (needsFrequencyUpdate) {
                        // Set frequency to center of visible range
                        const newFrequency = visibleRange.centerFrequency;

                        // Also ensure color is set if null
                        const updates = {
                            frequency: newFrequency
                        };

                        if (marker.color === null) {
                            // Use the color from vfoColors array based on VFO number
                            const colorIndex = parseInt(vfoNumber) - 1;
                            updates.color = vfoColors[colorIndex] || '#FF0000';
                        }

                        dispatch(setVFOProperty({
                            vfoNumber: parseInt(vfoNumber),
                            updates,
                        }));
                    }
                }
            }
        });

        // Update the previous state reference for next comparison
        prevVfoActiveRef.current = { ...vfoActive };

        return () => {
            // Cleanup if needed
        };
    }, [vfoActive, vfoMarkers, vfoColors, dispatch]);

    // Function after the updateVFOProperty function
    const handleDragMovement = useCallback((deltaX) => {
        if (!activeMarker) return;

        const marker = vfoMarkers[activeMarker];
        if (!marker) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const scaleFactor = actualWidth / rect.width;
        const scaledDelta = deltaX * scaleFactor;
        const freqDelta = (scaledDelta / actualWidth) * freqRange;

        if (dragMode === 'body') {
            const newFrequency = marker.frequency + freqDelta;
            const limitedFreq = Math.round(Math.max(startFreq, Math.min(newFrequency, endFreq)));
            updateVFOProperty(parseInt(activeMarker), { frequency: limitedFreq });
        } else {
            const currentBandwidth = marker.bandwidth || 3000;
            const limitedBandwidth = calculateBandwidthChange(currentBandwidth, freqDelta, dragMode);
            updateVFOProperty(parseInt(activeMarker), { bandwidth: limitedBandwidth });
        }
    }, [activeMarker, vfoMarkers, actualWidth, freqRange, dragMode, startFreq, endFreq, updateVFOProperty, calculateBandwidthChange]);

    // Function after handleDragMovement
    const endDragOperation = useCallback(() => {
        setIsDragging(false);
        isDraggingRef.current = false;
        setActiveMarker(null);
        setDragMode(null);
    }, []);

    // Utility function after canvasDrawingUtils:
    const generateLabelText = useCallback((marker, mode, bandwidth) => {
        const modeText = ` [${mode}]`;
        const bwText = mode === 'USB' || mode === 'LSB' || mode === 'CW' ? `${(bandwidth/1000).toFixed(1)}kHz` : `±${(bandwidth/2000).toFixed(1)}kHz`;
        return `${marker.name}: ${formatFrequency(marker.frequency)} MHz${modeText} ${bwText}`;
    }, [formatFrequency]);

    // Function to calculate visible frequency range considering zoom and pan
    const getVisibleFrequencyRange = () => {
        // When zoomed out (actualWidth < containerWidth), we see the full spectrum
        if (actualWidth <= containerWidth) {
            return {
                startFrequency: centerFrequency - sampleRate / 2,
                endFrequency: centerFrequency + sampleRate / 2,
                centerFrequency: centerFrequency,
                bandwidth: sampleRate
            };
        }

        // When zoomed in (actualWidth > containerWidth), calculate visible portion
        const zoomFactor = actualWidth / containerWidth;

        // Calculate the visible width as a fraction of the total zoomed width
        const visibleWidthRatio = containerWidth / actualWidth;

        // Calculate the pan offset as a fraction of the total zoomed width
        // currentPositionX is negative when panned right
        const panOffsetRatio = -currentPositionX / actualWidth;

        // Calculate start and end ratios, ensuring they stay within bounds
        const startRatio = Math.max(0, Math.min(1 - visibleWidthRatio, panOffsetRatio));
        const endRatio = Math.min(1, startRatio + visibleWidthRatio);

        // Calculate the full frequency range
        const fullStartFreq = centerFrequency - sampleRate / 2;
        const fullEndFreq = centerFrequency + sampleRate / 2;
        const fullFreqRange = fullEndFreq - fullStartFreq;

        // Calculate visible frequency range
        const visibleStartFreq = fullStartFreq + (startRatio * fullFreqRange);
        const visibleEndFreq = fullStartFreq + (endRatio * fullFreqRange);

        return {
            startFrequency: visibleStartFreq,
            endFrequency: visibleEndFreq,
            centerFrequency: (visibleStartFreq + visibleEndFreq) / 2,
            bandwidth: visibleEndFreq - visibleStartFreq
        };
    };

    // Handle mousewheel events for frequency adjustment
    const handleWheel = useCallback((e) => {
        // Only handle plain mousewheel events (not with a shift key)
        if (e.shiftKey) {
            return; // Let the underlying canvas handle shift+wheel events
        }

        // Check if we have a selected VFO
        if (selectedVFO === null || !vfoMarkers[selectedVFO] || !vfoActive[selectedVFO]) {
            return;
        }

        // Prevent default scrolling behavior
        e.preventDefault();
        e.stopPropagation();

        const marker = vfoMarkers[selectedVFO];

        // Calculate frequency change based on wheel direction
        // Positive deltaY = wheel down = decrease frequency
        // Negative deltaY = wheel up = increase frequency
        const freqChange = -Math.sign(e.deltaY) * marker.stepSize;
        const newFrequency = marker.frequency + freqChange;

        // Ensure the frequency stays within the visible range
        const limitedFreq = Math.round(Math.max(startFreq, Math.min(newFrequency, endFreq)));

        // Update the VFO frequency
        updateVFOProperty(selectedVFO, {
            frequency: limitedFreq,
        });

    }, [selectedVFO, vfoMarkers, mousewheelFreqStep, startFreq, endFreq, updateVFOProperty]);

    // Set up a wheel event listener with passive: false to allow preventDefault
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Add wheel event listener with passive: false to ensure preventDefault works
        canvas.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            canvas.removeEventListener('wheel', handleWheel);
        };
    }, [handleWheel]);

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
        }, 250);

        return () => {
            clearInterval(interval);
        };
    }, [updateActualWidth]);

    // Update width when the container width changes
    useEffect(() => {
        updateActualWidth();
    }, [containerWidth, updateActualWidth]);

    // Send render commands to the worker or fallback to direct rendering
    useEffect(() => {
        renderVFOMarkersDirect();
    }, [vfoActive, vfoMarkers, actualWidth, height,
        centerFrequency, sampleRate, selectedVFO, containerWidth, currentPositionX]);

    // Rendering function with cached context
    const renderVFOMarkersDirect = () => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        // Use cached context
        const ctx = getCanvasContext();
        if (!ctx) {
            console.warn('Could not get canvas 2d context');
            return;
        }

        // Set canvas dimensions
        canvas.width = actualWidth;
        canvas.height = height;

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, height);

        // Get active VFO keys and sort them so selected VFO is last (drawn on top)
        const vfoKeys = Object.keys(vfoActive).filter(key => vfoActive[key]);

        // Sort keys to put selected VFO at the end (drawn last)
        const sortedVfoKeys = vfoKeys.sort((a, b) => {
            // If a is selected, it should come after b (drawn on top)
            if (parseInt(a) === selectedVFO) return 1;
            // If b is selected, it should come after a
            if (parseInt(b) === selectedVFO) return -1;
            // Otherwise maintain original order
            return parseInt(a) - parseInt(b);
        });

        // Draw each marker in sorted order (selected one drawn last)
        sortedVfoKeys.forEach(markerIdx => {
            const marker = vfoMarkers[markerIdx];
            const isSelected = parseInt(markerIdx) === selectedVFO;

            // Use the utility function for calculations
            const bounds = calculateVFOFrequencyBounds(marker);

            // Skip if the marker is outside the visible range
            if (bounds.markerHighFreq < startFreq || bounds.markerLowFreq > endFreq) {
                return;
            }

            const { leftEdgeX, rightEdgeX, centerX, mode, bandwidth } = bounds;
            const areaOpacity = isSelected ? '33' : '15';
            const lineOpacity = isSelected ? 'FF' : '99';

            // Use drawing utilities
            canvasDrawingUtils.drawVFOArea(ctx, leftEdgeX, rightEdgeX, height, marker.color, areaOpacity);
            canvasDrawingUtils.drawVFOLine(ctx, centerX, height, marker.color, lineOpacity, isSelected ? 2 : 1.5);
            canvasDrawingUtils.drawVFOEdges(ctx, mode, leftEdgeX, rightEdgeX, height, marker.color, lineOpacity, isSelected ? 1.5 : 1);

            // Draw edge handles based on mode
            const edgeHandleYPosition = edgeHandleYOffset;
            const edgeHandleWidth = isSelected ? 14 : 6;

            if (mode === 'USB' || mode === 'CW' || mode === 'AM' || mode === 'FM') {
                canvasDrawingUtils.drawVFOHandle(ctx, rightEdgeX, edgeHandleYPosition, edgeHandleWidth, edgeHandleHeight, marker.color, lineOpacity);
            }

            if (mode === 'LSB' || mode === 'AM' || mode === 'FM') {
                canvasDrawingUtils.drawVFOHandle(ctx, leftEdgeX, edgeHandleYPosition, edgeHandleWidth, edgeHandleHeight, marker.color, lineOpacity);
            }

            // Draw frequency label
            const labelText = generateLabelText(marker, mode, bandwidth);

            canvasDrawingUtils.drawVFOLabel(ctx, centerX, labelText, marker.color, lineOpacity, isSelected);
        });
    };

    // Check if mouse/touch is over a handle or edge
    const getHoverElement = useCallback((x, y) => {
        // Calculate scaling factor between canvas coordinate space and DOM space
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = actualWidth / rect.width;
        const canvasX = x * scaleX;

        // Determine if this is a touch event (use larger hit areas for touch)
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        // Use larger hit areas for touch devices
        const edgeHandleWidth = isTouchDevice ? 12 : 6;
        const labelYRange = isTouchDevice ? 25 : 20;
        const edgeHandleYPosition = edgeHandleYOffset;

        // Function to check if a single VFO has a hit
        const checkVFOHit = (key) => {
            if (!vfoMarkers[key] || !vfoActive[key]) return null;

            const marker = vfoMarkers[key];

            // Use the utility function for calculations
            const bounds = calculateVFOFrequencyBounds(marker);
            const { leftEdgeX, rightEdgeX, centerX, mode, bandwidth } = bounds;

            // Check label (y between 0-20px with enlarged touch area) - treat as body drag
            if (y >= 0 && y <= labelYRange) {
                // Calculate label width (approximated based on drawing code)
                const labelText = generateLabelText(marker, mode, bandwidth);

                // Use cached context for text measurement
                const ctx = getCanvasContext();
                if (ctx) {
                    ctx.font = '12px Monospace';
                    const textMetrics = ctx.measureText(labelText);
                    // Always add extra width for speaker icon (shown as muted or active)
                    const iconWidth = getVFOLabelIconWidth();
                    const labelWidth = textMetrics.width + 10 + iconWidth;

                    // Check if mouse is over label area
                    if (Math.abs(canvasX - centerX) <= labelWidth / 2) {
                        return { key, element: 'body' };
                    }
                }
            }

            // Check edge handles based on mode - update Y range for edge handles
            // Use the new position (edgeHandleYPosition) with an appropriate range
            const edgeYMin = edgeHandleYPosition - edgeHandleHeight / 2;
            const edgeYMax = edgeHandleYPosition + edgeHandleHeight / 2;

            if (mode === 'USB' || mode === 'CW' || mode === 'AM' || mode === 'FM') {
                // Check right edge with updated Y position
                if (y >= edgeYMin && y <= edgeYMax && Math.abs(canvasX - rightEdgeX) <= edgeHandleWidth) {
                    return { key, element: 'rightEdge' };
                }
            }

            if (mode === 'LSB' || mode === 'AM' || mode === 'FM') {
                // Check left edge with updated Y position
                if (y >= edgeYMin && y <= edgeYMax && Math.abs(canvasX - leftEdgeX) <= edgeHandleWidth) {
                    return { key, element: 'leftEdge' };
                }
            }

            // Check if click is within the VFO body area (but not on edge handles)
            if (canvasX >= leftEdgeX && canvasX <= rightEdgeX &&
                !(y >= edgeYMin && y <= edgeYMax)) {
                return { key, element: 'body' }; // Treat clicks within VFO body as body drag
            }

            return null;
        };

        // First check if the selected VFO has a hit
        if (selectedVFO !== null) {
            const selectedKey = selectedVFO.toString();
            const hitResult = checkVFOHit(selectedKey);
            if (hitResult) {
                return { key: selectedKey, element: hitResult.element };
            }
        }

        // Get all active VFO keys and sort them (non-selected VFOs)
        const vfoKeys = Object.keys(vfoActive).filter(key =>
            vfoActive[key] && parseInt(key) !== selectedVFO
        );

        // Check each VFO in order
        for (const key of vfoKeys) {
            const hitResult = checkVFOHit(key);
            if (hitResult) {
                return { key, element: hitResult.element };
            }
        }

        return { key: null, element: null };
    }, [vfoActive, actualWidth, startFreq, freqRange, selectedVFO, formatFrequency,
        edgeHandleHeight, edgeHandleYOffset, vfoMarkers, getCanvasContext]);

    // Handle mouse move to update cursor
    const handleMouseMove = useCallback((e) => {
        // Don't change cursor during drag
        if (isDragging) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { element } = getHoverElement(x, y);

        if (element === 'body') {
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
        if (e.button !== 0) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { key, element } = getHoverElement(x, y);

        if (key && (element === 'body' || element === 'leftEdge' || element === 'rightEdge')) {
            setActiveMarker(key);
            setDragMode(element);
            setIsDragging(true);
            setCursor(element === 'body' ? 'ew-resize' : 'col-resize');
            lastClientXRef.current = e.clientX;

            // Prevent default to avoid text selection while dragging
            e.preventDefault();
            e.stopPropagation();
        }
        // If not dragging a handle, the click event will fire to handle selection

        // Set the selected VFO
        dispatch(setSelectedVFO(parseInt(key) || null));
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
            isDraggingRef.current = true;  // Set ref immediately
            lastTouchXRef.current = touch.clientX;

            // Prevent default to avoid scrolling while dragging
            e.preventDefault();
            // Stop propagation to prevent background elements from receiving this event
            e.stopPropagation();
        }

        // Set the selected VFO
        dispatch(setSelectedVFO(parseInt(key) || null));

        // Return element so caller can check it
        return { key, element };
    };

    // Handle touch move for mobile devices
    const handleTouchMove = (e) => {
        // Cancel any pending tap timeout when touch moves
        if (touchStartTimeoutRef.current) {
            clearTimeout(touchStartTimeoutRef.current);
            touchStartTimeoutRef.current = null;
        }

        if (!isDragging || !activeMarker || e.touches.length !== 1) return;

        // Always prevent default and stop propagation when dragging
        e.preventDefault();
        e.stopPropagation();

        const touch = e.touches[0];
        const deltaX = touch.clientX - lastTouchXRef.current;
        lastTouchXRef.current = touch.clientX;

        handleDragMovement(deltaX);
    };

    // Handle touch end for mobile devices
    const handleTouchEnd = (e) => {
        // Cancel any pending tap timeout
        if (touchStartTimeoutRef.current) {
            clearTimeout(touchStartTimeoutRef.current);
            touchStartTimeoutRef.current = null;
        }

        if (isDragging) {
            // Prevent default and stop propagation when ending a drag
            e.preventDefault();
            e.stopPropagation();

            endDragOperation();
        }
    };

    // Handle touch cancel for mobile devices
    const handleTouchCancel = (e) => {
        if (isDragging) {
            // Prevent default and stop propagation when cancelling a drag
            e.preventDefault();
            e.stopPropagation();

            endDragOperation();
        }
    };

    // Inside the effect where we handle dragging
    useEffect(() => {
        if (isDragging && activeMarker) {
            const handleMouseMoveEvent = (e) => {
                // Ignore mouse events that are synthesized from touch events
                // This prevents the VFO from jumping when touch-and-hold on tablets
                if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();

                const deltaX = e.clientX - lastClientXRef.current;
                lastClientXRef.current = e.clientX;

                handleDragMovement(deltaX);
            };

            const handleMouseUp = () => {
                endDragOperation();
            };

            document.addEventListener('mousemove', handleMouseMoveEvent);
            document.addEventListener('mouseup', handleMouseUp);

            return () => {
                document.removeEventListener('mousemove', handleMouseMoveEvent);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, activeMarker, handleDragMovement, endDragOperation]);

    // For touch event dragging, we need a separate effect
    useEffect(() => {
        if (!isDragging) return;

        const handleDocumentTouchMove = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.touches.length !== 1) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - lastTouchXRef.current;
            lastTouchXRef.current = touch.clientX;

            // Use the existing handleDragMovement function instead of duplicating logic
            handleDragMovement(deltaX);
        };

        const handleDocumentTouchEnd = (e) => {
            e.preventDefault();
            e.stopPropagation();
            endDragOperation();
        };

        document.addEventListener('touchmove', handleDocumentTouchMove, { capture: true, passive: false });
        document.addEventListener('touchend', handleDocumentTouchEnd, { capture: true, passive: false });
        document.addEventListener('touchcancel', handleDocumentTouchEnd, { capture: true, passive: false });

        return () => {
            document.removeEventListener('touchmove', handleDocumentTouchMove, { capture: true });
            document.removeEventListener('touchend', handleDocumentTouchEnd, { capture: true });
            document.removeEventListener('touchcancel', handleDocumentTouchEnd, { capture: true });
        };
    }, [isDragging, handleDragMovement, endDragOperation]);

    // Updated click handler to use setSelectedVFO action
    const handleClick = (e) => {
        // Skip if we're dragging
        if (isDragging) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const { key } = getHoverElement(x, y);

        if (key) {
            // Dont update, we do that on mousedown
            //dispatch(setSelectedVFO(parseInt(key) || null));
        }
    };

    // Updated tap handler for mobile devices
    const handleTap = (e) => {
        // Skip if we're dragging
        if (isDragging) return;

        // Check if event is still valid (React synthetic events get nullified)
        if (!e || !e.touches || e.touches.length !== 1) return;

        const touch = e.touches[0];
        if (!touch || touch.clientX === undefined || touch.clientY === undefined) return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        const { key } = getHoverElement(x, y);

        if (key) {
            // Update the selected VFO in Redux store
            dispatch(setSelectedVFO(parseInt(key) || null));

            // Prevent default to stop other handlers
            if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
        }
    };

    // Double click to remove a marker
    const handleDoubleClick = (e) => {

        // Disable this for now
        return false;
    };

    // Double tap to remove a marker on mobile devices
    const lastTapRef = useRef(0);
    const tapTimeoutRef = useRef(null);
    const touchStartTimeoutRef = useRef(null);

    return (
        <Box
            ref={containerRef}
            className={"vfo-markers-container"}
            sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                //width: `${containerWidth}px`,
                width: '100%',
                height: height,
                zIndex: 400,
            }}
        >
            {/* Canvas for VFO markers */}
            <canvas
                className={"vfo-markers-canvas"}
                ref={canvasRef}
                onClick={handleClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onDoubleClick={handleDoubleClick}
                onTouchStart={(e) => {
                    // Store the timestamp for distinguishing between tap and double-tap
                    const currentTime = new Date().getTime();
                    const tapLength = currentTime - lastTapRef.current;

                    // Handle potential double-tap
                    if (tapLength < 500 && tapLength > 0) {
                        //handleDoubleTap(e);
                    } else {
                        // First, check if this is a drag operation
                        handleTouchStart(e);

                        // If not a drag, then it might be a tap for selection
                        // Use a small timeout to ensure we don't interfere with drag operations
                        // Check the ref (synchronous) not the state (asynchronous)
                        if (!isDraggingRef.current) {
                            // Capture touch coordinates before they become invalid
                            const touch = e.touches[0];
                            const capturedX = touch.clientX;
                            const capturedY = touch.clientY;

                            touchStartTimeoutRef.current = setTimeout(() => {
                                if (!isDraggingRef.current) {
                                    // Create a synthetic event-like object with captured coordinates
                                    const syntheticEvent = {
                                        touches: [{
                                            clientX: capturedX,
                                            clientY: capturedY
                                        }]
                                    };
                                    handleTap(syntheticEvent);
                                }
                                touchStartTimeoutRef.current = null;
                            }, 50);
                        }
                    }
                    lastTapRef.current = currentTime;
                }}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
                onContextMenu={(e) => {
                    // Prevent context menu on long press
                    e.preventDefault();
                    e.stopPropagation();
                }}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    cursor: cursor,
                    // touchAction: 'none', // Prevent browser handling of all touch actions
                    // WebkitUserSelect: 'none',
                    // MozUserSelect: 'none',
                    // msUserSelect: 'none',
                    // userSelect: 'none',
                    //transform: 'translateZ(0)', // this it breaks box-shadow CSS and also makes the canvas blurry in Chrome
                    //backfaceVisibility: 'hidden',
                    perspective: '1000px',
                }}
            />
        </Box>
    );
};

export default VFOMarkersContainer;