
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
import {
    canvasDrawingUtils,
    getVFOLabelIconWidth,
    calculateBandwidthChange,
    calculateVFOFrequencyBounds,
    generateVFOLabelText,
    getVisibleFrequencyRange,
    formatFrequency
} from './vfo-utils.js';
import {
    useVFODragHandlers,
    useVFOMouseHandlers,
    useVFOTouchHandlers,
    useVFOWheelHandler,
    useVFODragState
} from './vfo-events.jsx';

const VFOMarkersContainer = ({
                                 centerFrequency,
                                 sampleRate,
                                 waterfallHeight,
                                 bandscopeHeight,
                                 bandscopeTopPadding = 0,
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
    const height = bandscopeHeight + bandscopeTopPadding;
    const [cursor, setCursor] = useState('default');

    // Track the previous VFO active state to detect changes
    const prevVfoActiveRef = useRef({});

    // Configurable bandwidth limits
    const [minBandwidth] = useState(500); // 500 Hz minimum
    const [maxBandwidth] = useState(100000); // 100 kHz maximum

    // Configurable vertical length of resize handles
    const [edgeHandleHeight] = useState(20);

    // Configurable Y position offset for resize handles
    const [edgeHandleYOffset] = useState(40);

    // Configurable mousewheel frequency step (in Hz)
    const [mousewheelFreqStep] = useState(1000); // 100 Hz step

    // Additional refs needed by event handlers
    const lastTapRef = useRef(0);
    const tapTimeoutRef = useRef(null);
    const touchStartTimeoutRef = useRef(null);

    // Calculate frequency range
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;
    const freqRange = endFreq - startFreq;

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
                    const visibleRange = getVisibleFrequencyRange(centerFrequency, sampleRate, actualWidth, containerWidth, currentPositionX);
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
    }, [vfoActive, vfoMarkers, vfoColors, dispatch, centerFrequency, sampleRate, actualWidth, containerWidth, currentPositionX]);

    // Use VFO drag handlers
    const { handleDragMovement } = useVFODragHandlers({
        activeMarker,
        vfoMarkers,
        actualWidth,
        freqRange,
        dragMode,
        startFreq,
        endFreq,
        updateVFOProperty,
        minBandwidth,
        maxBandwidth,
        canvasRef
    });

    // End drag operation
    const endDragOperation = useCallback(() => {
        setIsDragging(false);
        isDraggingRef.current = false;
        setActiveMarker(null);
        setDragMode(null);
    }, []);

    // Use VFO wheel handler
    useVFOWheelHandler({
        canvasRef,
        selectedVFO,
        vfoMarkers,
        vfoActive,
        startFreq,
        endFreq,
        updateVFOProperty
    });

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
            const bounds = calculateVFOFrequencyBounds(marker, startFreq, freqRange, actualWidth);

            // Skip if the marker is outside the visible range
            if (bounds.markerHighFreq < startFreq || bounds.markerLowFreq > endFreq) {
                return;
            }

            const { leftEdgeX, rightEdgeX, centerX, mode, bandwidth } = bounds;
            const areaOpacity = isSelected ? '33' : '15';
            const lineOpacity = isSelected ? 'FF' : '99';

            // Use drawing utilities
            canvasDrawingUtils.drawVFOArea(ctx, leftEdgeX, rightEdgeX, height, marker.color, areaOpacity, bandscopeTopPadding);
            canvasDrawingUtils.drawVFOLine(ctx, centerX, height, marker.color, lineOpacity, isSelected ? 2 : 1.5, bandscopeTopPadding);
            canvasDrawingUtils.drawVFOEdges(ctx, mode, leftEdgeX, rightEdgeX, height, marker.color, lineOpacity, isSelected ? 1.5 : 1, bandscopeTopPadding);

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
            const labelText = generateVFOLabelText(marker, mode, bandwidth, formatFrequency);

            canvasDrawingUtils.drawVFOLabel(ctx, centerX, labelText, marker.color, lineOpacity, isSelected, bandscopeTopPadding, marker.locked);
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
            const bounds = calculateVFOFrequencyBounds(marker, startFreq, freqRange, actualWidth);
            const { leftEdgeX, rightEdgeX, centerX, mode, bandwidth } = bounds;

            // Check label (y between 0 and labelYRange with enlarged touch area) - treat as body drag
            if (y >= 0 && y <= labelYRange) {
                // Calculate label width (approximated based on drawing code)
                const labelText = generateVFOLabelText(marker, mode, bandwidth, formatFrequency);

                // Use cached context for text measurement
                const ctx = getCanvasContext();
                if (ctx) {
                    ctx.font = '12px Monospace';
                    const textMetrics = ctx.measureText(labelText);
                    // Always add extra width for speaker icon (shown as muted or active) and lock icon if locked
                    const iconWidth = getVFOLabelIconWidth(marker.locked);
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
    }, [vfoActive, actualWidth, startFreq, freqRange, selectedVFO,
        edgeHandleHeight, edgeHandleYOffset, vfoMarkers, getCanvasContext]);

    // Use VFO mouse handlers
    const {
        handleMouseMove,
        handleMouseLeave,
        handleMouseDown,
        handleClick,
        handleDoubleClick
    } = useVFOMouseHandlers({
        canvasRef,
        getHoverElement,
        isDragging,
        setActiveMarker,
        setDragMode,
        setIsDragging,
        setCursor,
        lastClientXRef,
        dispatch,
        setSelectedVFO
    });

    // Use VFO touch handlers
    const {
        handleTouchStart,
        handleTouchMove: handleTouchMoveBase,
        handleTouchEnd: handleTouchEndBase,
        handleTouchCancel: handleTouchCancelBase,
        handleTap
    } = useVFOTouchHandlers({
        canvasRef,
        getHoverElement,
        isDragging,
        setActiveMarker,
        setDragMode,
        setIsDragging,
        isDraggingRef,
        lastTouchXRef,
        touchStartTimeoutRef,
        dispatch,
        setSelectedVFO
    });

    // Wrap touch handlers to pass additional dependencies
    const handleTouchMove = useCallback((e) => {
        handleTouchMoveBase(e, touchStartTimeoutRef, handleDragMovement);
    }, [handleTouchMoveBase, handleDragMovement]);

    const handleTouchEnd = useCallback((e) => {
        handleTouchEndBase(e, touchStartTimeoutRef, endDragOperation);
    }, [handleTouchEndBase, endDragOperation]);

    const handleTouchCancel = useCallback((e) => {
        handleTouchCancelBase(e, touchStartTimeoutRef, endDragOperation);
    }, [handleTouchCancelBase, endDragOperation]);

    // Use VFO drag state management
    useVFODragState({
        isDragging,
        activeMarker,
        handleDragMovement,
        endDragOperation,
        lastClientXRef,
        lastTouchXRef
    });

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