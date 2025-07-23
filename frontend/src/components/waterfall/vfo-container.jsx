import React, {useState, useEffect, useCallback, useRef, useMemo} from "react";
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
    setSelectedVFO,
    updateVFOParameters,
    setVfoActive,
    setVfoInactive,
} from './waterfall-slice.jsx';
import {useSocket} from "../common/socket.jsx";

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
    const {socket} = useSocket();
    const {
        vfoMarkers,
        maxVFOMarkers,
        selectedVFO,
        vfoColors,
        vfoActive,
    } = useSelector(state => state.waterfall);

    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const workerRef = useRef(null);
    const [actualWidth, setActualWidth] = useState(containerWidth);
    const lastMeasuredWidthRef = useRef(0);
    const [activeMarker, setActiveMarker] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragMode, setDragMode] = useState(null); // 'body', 'leftEdge', or 'rightEdge'
    const lastClientXRef = useRef(0);
    const lastTouchXRef = useRef(0);
    const height = bandscopeHeight + waterfallHeight;
    const [cursor, setCursor] = useState('default');
    const [workerInitialized, setWorkerInitialized] = useState(false);
    const [useWorker, setUseWorker] = useState(false);

    // Track previous VFO active state to detect changes
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

    // Consolidated function to set redux state
    const updateVFOProperty = useCallback((vfoNumber, updates) => {
        dispatch(setVFOProperty({
            vfoNumber,
            updates,
        }));
    }, [dispatch]);

    // Initialize Web Worker
    useEffect(() => {
        // Check if OffscreenCanvas is supported
        if (typeof OffscreenCanvas === 'undefined') {
            console.warn('OffscreenCanvas not supported, falling back to main thread rendering');
            setUseWorker(false);
            return;
        }

        try {
            // Create worker
            const worker = new Worker(new URL('./vfo-marker-worker.js', import.meta.url));
            workerRef.current = worker;

            // Handle worker messages
            worker.onmessage = (e) => {
                const { type, success, error } = e.data;

                switch (type) {
                    case 'CANVAS_INITIALIZED':
                        if (success) {
                            setWorkerInitialized(true);
                            setUseWorker(true);
                            console.log('VFO renderer worker initialized successfully');
                        } else {
                            console.error('Failed to initialize worker canvas:', error);
                            setUseWorker(false);
                        }
                        break;
                    case 'RENDER_COMPLETE':
                        // Optional: Handle render completion if needed
                        break;
                    case 'ERROR':
                        console.error('Worker error:', error);
                        break;
                    default:
                        break;
                }
            };

            worker.onerror = (error) => {
                console.error('Worker error:', error);
                setUseWorker(false);
            };

            return () => {
                if (workerRef.current) {
                    workerRef.current.terminate();
                    workerRef.current = null;
                }
            };
        } catch (error) {
            console.error('Failed to create worker:', error);
            setUseWorker(false);
        }
    }, []);

    // Initialize OffscreenCanvas when canvas is ready
    useEffect(() => {
        if (!workerRef.current || !canvasRef.current || !useWorker) return;

        const canvas = canvasRef.current;

        try {
            // Transfer canvas to worker
            const offscreenCanvas = canvas.transferControlToOffscreen();

            workerRef.current.postMessage({
                type: 'INIT_CANVAS',
                data: {
                    canvas: offscreenCanvas,
                    width: actualWidth,
                    height: height
                }
            }, [offscreenCanvas]);
        } catch (error) {
            console.error('Failed to transfer canvas to worker:', error);
            setUseWorker(false);
        }
    }, [useWorker, actualWidth, height]);

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

    // Add this new function after the updateVFOProperty function
    const handleDragMovement = useCallback((deltaX) => {
        if (!activeMarker) return;

        // Get the active marker
        const marker = vfoMarkers[activeMarker];
        if (!marker) return;

        // Calculate the scaling factor between screen pixels and canvas pixels
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleFactor = actualWidth / rect.width;
        const scaledDelta = deltaX * scaleFactor;

        // Calculate pixels to frequency change
        const freqDelta = (scaledDelta / actualWidth) * freqRange;

        if (dragMode === 'body') {
            // Moving the entire VFO (center + bandwidth)
            const newFrequency = marker.frequency + freqDelta;

            // Ensure the frequency stays within the visible range
            const limitedFreq = Math.round(Math.max(startFreq, Math.min(newFrequency, endFreq)));

            updateVFOProperty(parseInt(activeMarker), {
                frequency: limitedFreq,
            });

        } else if (dragMode === 'leftEdge') {
            // Moving the left edge (adjust bandwidth)
            const currentBandwidth = marker.bandwidth || 3000;
            // When dragging left edge right (positive delta), bandwidth decreases
            const newBandwidth = currentBandwidth - (2 * freqDelta);

            // Enforce minimum bandwidth and maximum using the state values
            const limitedBandwidth = Math.round(Math.max(minBandwidth, Math.min(maxBandwidth, newBandwidth)));

            updateVFOProperty(parseInt(activeMarker), {
                bandwidth: limitedBandwidth,
            });

        } else if (dragMode === 'rightEdge') {
            // Moving the right edge (adjust bandwidth)
            const currentBandwidth = marker.bandwidth || 3000;
            // When dragging right edge right (positive delta), bandwidth increases
            const newBandwidth = currentBandwidth + (2 * freqDelta);

            // Enforce minimum bandwidth and maximum using the state values
            const limitedBandwidth = Math.round(Math.max(minBandwidth, Math.min(maxBandwidth, newBandwidth)));

            updateVFOProperty(parseInt(activeMarker), {
                bandwidth: limitedBandwidth,
            });
        }
    }, [activeMarker, vfoMarkers, actualWidth, freqRange, dragMode, startFreq, endFreq, minBandwidth, maxBandwidth, updateVFOProperty]);

    // Add this function after handleDragMovement
    const endDragOperation = useCallback(() => {
        setIsDragging(false);
        setActiveMarker(null);
        setDragMode(null);
    }, []);

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
        // Only handle plain mousewheel events (not with shift key)
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
        // Positive deltaY = wheel down = increase frequency (inverted)
        // Negative deltaY = wheel up = decrease frequency (inverted)
        const freqChange = Math.sign(e.deltaY) * marker.stepSize;
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
        }, 100);

        return () => {
            clearInterval(interval);
        };
    }, [updateActualWidth]);

    // Update width when the container width changes
    useEffect(() => {
        updateActualWidth();
    }, [containerWidth, updateActualWidth]);

    // Send render commands to worker or fallback to direct rendering
    useEffect(() => {
        if (useWorker && workerInitialized && workerRef.current) {
            // Send rendering data to worker
            workerRef.current.postMessage({
                type: 'RENDER_VFO_MARKERS',
                data: {
                    vfoMarkers,
                    vfoActive,
                    selectedVFO,
                    canvasWidth: actualWidth,
                    canvasHeight: height,
                    centerFrequency,
                    sampleRate,
                    actualWidth,
                    containerWidth,
                    currentPositionX
                }
            });
        } else if (!useWorker) {
            // Fallback to direct canvas rendering
            renderVFOMarkersDirect();
        }
    }, [useWorker, workerInitialized, vfoActive, vfoMarkers, actualWidth, height,
        centerFrequency, sampleRate, selectedVFO, containerWidth, currentPositionX]);

    // Fallback rendering function for browsers without OffscreenCanvas support
    const renderVFOMarkersDirect = () => {
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
            const bandwidth = marker.bandwidth || 3000;
            const mode = (marker.mode || 'USB').toUpperCase();
            const isSelected = parseInt(markerIdx) === selectedVFO;

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

            const areaOpacity = isSelected ? '33' : '15';
            const lineOpacity = isSelected ? 'FF' : '99';

            // Draw shaded bandwidth area with adjusted opacity
            ctx.fillStyle = `${marker.color}${areaOpacity}`;
            ctx.fillRect(leftEdgeX, 0, rightEdgeX - leftEdgeX, height);

            // Draw center marker line with adjusted opacity
            ctx.beginPath();
            ctx.strokeStyle = `${marker.color}${lineOpacity}`;
            ctx.lineWidth = isSelected ? 2 : 1.5; // Make line thicker when selected
            ctx.moveTo(centerX, 0);
            ctx.lineTo(centerX, height);
            ctx.stroke();

            // Draw bandwidth edge lines based on mode with adjusted opacity
            ctx.beginPath();
            ctx.strokeStyle = `${marker.color}${lineOpacity}`;
            ctx.lineWidth = isSelected ? 1.5 : 1; // Make line thicker when selected
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
            // Reset to solid line
            ctx.setLineDash([]);

            // Draw edge handles based on mode
            ctx.fillStyle = `${marker.color}${lineOpacity}`;

            // Configurable handle dimensions
            const edgeHandleYPosition = edgeHandleYOffset;
            const edgeHandleWidth = isSelected ? 14 : 6;

            if (mode === 'USB' || mode === 'AM' || mode === 'FM') {
                // Right edge handle - vertical rectangle
                ctx.beginPath();
                ctx.roundRect(
                    rightEdgeX - edgeHandleWidth / 2,
                    edgeHandleYPosition - edgeHandleHeight / 2,
                    edgeHandleWidth,
                    edgeHandleHeight,
                    2 // rounded corner radius
                );
                ctx.fill();
            }

            if (mode === 'LSB' || mode === 'AM' || mode === 'FM') {
                // Left edge handle - vertical rectangle
                ctx.beginPath();
                ctx.roundRect(
                    leftEdgeX - edgeHandleWidth / 2,
                    edgeHandleYPosition - edgeHandleHeight / 2,
                    edgeHandleWidth,
                    edgeHandleHeight,
                    2 // rounded corner radius
                );
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

            ctx.fillStyle = `${marker.color}${lineOpacity}`;
            ctx.beginPath();
            ctx.roundRect(
                centerX - labelWidth / 2,
                5,
                labelWidth,
                labelHeight,
                2 // rounded corner radius
            );
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(labelText, centerX, 16);

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

            // Check label (y between 0-20px with enlarged touch area) - treat as body drag
            if (y >= 0 && y <= labelYRange) {
                // Calculate label width (approximated based on drawing code)
                const modeText = ` [${mode}]`;
                const bwText = mode === 'USB' || mode === 'LSB' ? `${(bandwidth/1000).toFixed(1)}kHz` : `±${(bandwidth/2000).toFixed(1)}kHz`;
                const labelText = `${marker.name}: ${formatFrequency(marker.frequency)} MHz${modeText} ${bwText}`;

                // Create temporary canvas for text measurement
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.font = '12px Monospace';
                const textMetrics = tempCtx.measureText(labelText);
                const labelWidth = textMetrics.width + 10;

                // Check if mouse is over label area
                if (Math.abs(canvasX - centerX) <= labelWidth / 2) {
                    return { key, element: 'body' }; // Treat label drag as body drag
                }
            }

            // Check edge handles based on mode - update Y range for edge handles
            // Use the new position (edgeHandleYPosition) with an appropriate range
            const edgeYMin = edgeHandleYPosition - edgeHandleHeight / 2;
            const edgeYMax = edgeHandleYPosition + edgeHandleHeight / 2;

            if (mode === 'USB' || mode === 'AM' || mode === 'FM') {
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
        edgeHandleHeight, edgeHandleYOffset, vfoMarkers]);

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
            lastTouchXRef.current = touch.clientX;

            // Prevent default to avoid scrolling while dragging
            e.preventDefault();
            // Stop propagation to prevent background elements from receiving this event
            e.stopPropagation();
        }

        // Set the selected VFO
        dispatch(setSelectedVFO(parseInt(key) || null));
    };

    // Handle touch move for mobile devices
    const handleTouchMove = (e) => {
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
        if (isDragging && activeMarker) {
            // Function to handle touchmove on document level
            const handleDocumentTouchMove = (e) => {
                if (e.touches.length !== 1) return;

                // Always prevent default for document-level touch events during drag
                e.preventDefault();
                e.stopPropagation();

                const touch = e.touches[0];
                const deltaX = touch.clientX - lastTouchXRef.current;
                lastTouchXRef.current = touch.clientX;

                // Use the shared drag movement function
                handleDragMovement(deltaX);
            };

            const handleDocumentTouchEnd = () => {
                endDragOperation();
            };

            const handleDocumentTouchCancel = () => {
                endDragOperation();
            };

            document.addEventListener('touchmove', handleDocumentTouchMove, { passive: false });
            document.addEventListener('touchend', handleDocumentTouchEnd);
            document.addEventListener('touchcancel', handleDocumentTouchCancel);

            return () => {
                document.removeEventListener('touchmove', handleDocumentTouchMove);
                document.removeEventListener('touchend', handleDocumentTouchEnd);
                document.removeEventListener('touchcancel', handleDocumentTouchCancel);
            };
        }
    }, [isDragging, activeMarker, handleDragMovement, endDragOperation]);

    // Set up global event handlers to intercept touch events during dragging
    useEffect(() => {
        // Only set up if we're actively dragging
        if (!isDragging) return;

        // Capture phase handler for document touchmove
        const handleDocumentTouchMove = (e) => {
            // During active dragging, always prevent default and stop propagation
            e.preventDefault();
            e.stopPropagation();

            if (e.touches.length !== 1) return;

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

            // Implement dragging logic based on drag mode
            if (dragMode === 'body') {
                const newFrequency = marker.frequency + freqDelta;
                const limitedFreq = Math.round(Math.max(startFreq, Math.min(newFrequency, endFreq)));

                updateVFOProperty(parseInt(activeMarker), {
                    frequency: limitedFreq,
                });

            } else if (dragMode === 'leftEdge') {
                const currentBandwidth = marker.bandwidth || 3000;
                const newBandwidth = currentBandwidth - (2 * freqDelta);
                const limitedBandwidth = Math.round(Math.max(minBandwidth, Math.min(maxBandwidth, newBandwidth)));

                updateVFOProperty(parseInt(activeMarker), {
                    bandwidth: limitedBandwidth,
                });

            } else if (dragMode === 'rightEdge') {
                const currentBandwidth = marker.bandwidth || 3000;
                const newBandwidth = currentBandwidth + (2 * freqDelta);
                const limitedBandwidth = Math.round(Math.max(minBandwidth, Math.min(maxBandwidth, newBandwidth)));

                updateVFOProperty(parseInt(activeMarker), {
                    bandwidth: limitedBandwidth,
                });
            }
        };

        // Capture phase handler for document touchend and touchcancel
        const handleDocumentTouchEnd = (e) => {
            // During active dragging, always prevent default and stop propagation
            e.preventDefault();
            e.stopPropagation();

            setIsDragging(false);
            setActiveMarker(null);
            setDragMode(null);
        };

        // Add event listeners with capture: true to intercept events before they reach other elements
        document.addEventListener('touchmove', handleDocumentTouchMove, { capture: true, passive: false });
        document.addEventListener('touchend', handleDocumentTouchEnd, { capture: true, passive: false });
        document.addEventListener('touchcancel', handleDocumentTouchEnd, { capture: true, passive: false });

        // Clean up
        return () => {
            // Clean up listeners when effect is cleaned up
            document.removeEventListener('touchmove', handleDocumentTouchMove, { capture: true, passive: false });
            document.removeEventListener('touchend', handleDocumentTouchEnd, { capture: true, passive: false });
            document.removeEventListener('touchcancel', handleDocumentTouchEnd, { capture: true, passive: false });
        };

    }, [isDragging, activeMarker, dragMode, vfoMarkers, startFreq, endFreq, freqRange, actualWidth, dispatch, minBandwidth, maxBandwidth, updateVFOProperty]);

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

        if (!e.touches || e.touches.length !== 1) return;

        const touch = e.touches[0];
        const rect = canvasRef.current.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        const { key } = getHoverElement(x, y);

        if (key) {
            // Update the selected VFO in Redux store
            dispatch(setSelectedVFO(parseInt(key) || null));

            // Prevent default to stop other handlers
            e.preventDefault();
            e.stopPropagation();
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
                        // First check if this is a drag operation
                        handleTouchStart(e);

                        // If not a drag, then it might be a tap for selection
                        // Use a small timeout to ensure we don't interfere with drag operations
                        if (!isDragging) {
                            setTimeout(() => {
                                if (!isDragging) {
                                    handleTap(e);
                                }
                            }, 50);
                        }
                    }
                    lastTapRef.current = currentTime;
                }}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
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
                }}
            />
        </Box>
    );
};

export default VFOMarkersContainer;