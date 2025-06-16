/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
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


import React, {useCallback, useEffect, useRef, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import {Box, IconButton} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import FrequencyScale from "./frequency-scale-canvas.jsx";
import BookmarkCanvas from "./waterfall-bookmarks.jsx";
import {
    setBookMarks
} from "./waterfall-slice.jsx";
import VFOMarkersContainer from './vfo-container.jsx';
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

import {v4 as uuidv4} from 'uuid';
import TuneIcon from '@mui/icons-material/Tune';

// Inside your WaterfallWithStrictXAxisZoom component, add:
const WaterfallWithStrictXAxisZoom = React.memo(({
                                                     bandscopeCanvasRef,
                                                     waterFallCanvasRef,
                                                     centerFrequency,
                                                     sampleRate,
                                                     waterFallWindowHeight,
                                                 }) => {

    const containerRef = useRef(null);
    const containerWidthRef = useRef(0);
    const [isMobile, setIsMobile] = useState(false);
    const scaleRef = useRef(1);
    const positionXRef = useRef(0);
    const isDraggingRef = useRef(false);
    const lastXRef = useRef(0);
    const lastPinchDistanceRef = useRef(0);
    const pinchCenterXRef = useRef(0);
    const dispatch = useDispatch();
    const {
        waterFallVisualWidth,
        waterFallCanvasWidth,
        waterFallCanvasHeight,
        bandScopeHeight,
        waterFallScaleX,
        waterFallPositionX,
        frequencyScaleHeight,
        autoDBRange,
        bookmarks,
    } = useSelector((state) => state.waterfall);

    // Add state for bookmarks
    const [customScale, setCustomScale] = useState(1);
    const [customPositionX, setCustomPositionX] = useState(0);
    const [visualContainerWidth, setVisualContainerWidth] = useState(waterFallCanvasWidth);

    // Function to recalculate position when the container resizes
    const handleResize = useCallback(() => {
        if (!containerRef.current || scaleRef.current <= 1) return;

        const newWidth = containerRef.current.clientWidth;
        const oldWidth = containerWidthRef.current;

        if (oldWidth === 0 || newWidth === oldWidth) return;

        // Calculate a new position based on scale and size change ratio
        // This keeps the visible content centered as the container resizes
        const centerPointRatio = 0.5; // Center of the view
        const oldCenterPoint = oldWidth * centerPointRatio;
        const newCenterPoint = newWidth * centerPointRatio;

        // Scale the center point positions
        const oldScaledCenter = (oldCenterPoint - positionXRef.current) / scaleRef.current;

        // Calculate the position to maintain the same content at the center
        const newPositionX = newCenterPoint - (oldScaledCenter * scaleRef.current);

        // Apply constraints to keep within bounds
        const maxPanLeft = newWidth - (newWidth * scaleRef.current);
        positionXRef.current = Math.max(maxPanLeft, Math.min(0, newPositionX));

        // Update width reference
        containerWidthRef.current = newWidth;

        // Apply transform
        applyTransform();
        updateReactState();
    }, []);

    // Function to add a bookmark at a specific frequency
    const addBookmark = useCallback((frequency, label, color = '#ffff00') => {
        const newBookmark = {
            id: Date.now().toString(),
            frequency,
            label: label || `${(frequency / 1e6).toFixed(3)} MHz`,
            color
        };

        dispatch(setBookMarks([...bookmarks, newBookmark]));

    }, []);

    // Add a bookmark at the center frequency
    const addCenterFrequencyBookmark = useCallback(() => {
        addBookmark(
            centerFrequency,
            `Center ${(centerFrequency / 1e6).toFixed(3)} MHz`,
            '#00ffff'
        );
    }, [addBookmark, centerFrequency]);

    // Handle clicks on bookmarks
    const handleBookmarkClick = useCallback((bookmark) => {
        // Example: You could show a dialog to edit or delete the bookmark
        console.log('Clicked on bookmark:', bookmark);

        // For now, just log it, but you could add more advanced features here
    }, []);

    // Set up ResizeObserver to detect container size changes
    useEffect(() => {
        if (!containerRef.current) return;

        // Store initial width
        containerWidthRef.current = containerRef.current.clientWidth;

        // Create ResizeObserver
        const resizeObserver = new ResizeObserver(() => {
            handleResize();
        });

        // Start observing the container
        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
        };

    }, [handleResize]);

    // Calculate the visual width including CSS transforms
    function getScaledWidth(element, scaleX) {
        return element.getBoundingClientRect().width;
    }

    // Apply a transform directly to a DOM element
    const applyTransform = useCallback(() => {
        if (containerRef.current) {
            containerRef.current.style.transform = `translateX(${positionXRef.current}px) scaleX(${scaleRef.current})`;

            // Updating state on a mouse wheel event is not a good idea
            //const newVisualWidth = getScaledWidth(containerRef.current, scaleRef.current);
            //setVisualContainerWidth(newVisualWidth);
            //dispatch(setWaterFallVisualWidth(newVisualWidth));
        }
    }, []);

    const checkMobile = () => {
        setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768);
    };

    useEffect(() => {
        // Detect mobile devices
        checkMobile();
        window.addEventListener('resize', checkMobile);

        // Set positionX and scaleX values from Redux
        scaleRef.current = waterFallScaleX;
        positionXRef.current = waterFallPositionX;

        return () => {
            window.removeEventListener('resize', checkMobile);
        }
    }, []);

    // Update React state for rendering (but not for calculations)
    const updateReactState = useCallback(() => {
        setCustomScale(scaleRef.current);
        setCustomPositionX(positionXRef.current);
    }, []);

    // Zoom functionality
    const zoomOnXAxisOnly = useCallback((deltaScale, centerX) => {
        const prevScale = scaleRef.current;
        const newScale = Math.max(1, Math.min(15, prevScale + deltaScale));

        // Exit if the scale didn't change
        if (newScale === prevScale) return;

        const containerWidth = containerRef.current?.clientWidth || 0;
        containerWidthRef.current = containerWidth;

        // Calculate how far from the left edge the center point is (as a ratio of scaled width)
        const mousePointRatio = (centerX - positionXRef.current) / (containerWidth * prevScale);

        // Calculate a new position
        let newPositionX = 0;
        if (newScale === 1) {
            // Reset position at scale 1
            newPositionX = 0;
        } else {
            // Keep the point under mouse at the same relative position
            newPositionX = centerX - mousePointRatio * containerWidth * newScale;

            // Constrain to boundaries
            const maxPanLeft = containerWidth - (containerWidth * newScale);
            newPositionX = Math.max(maxPanLeft, Math.min(0, newPositionX));
        }

        // Update refs
        scaleRef.current = newScale;
        positionXRef.current = newPositionX;

        // Apply the transform immediately
        applyTransform();

    }, [applyTransform, updateReactState]);

    // Panning functionality
    const panOnXAxisOnly = useCallback((deltaX) => {
        // Only allow panning if zoomed in
        if (scaleRef.current <= 1) {
            return;
        }

        const containerWidth = containerRef.current?.clientWidth || 0;

        // Calculate boundaries
        const scaledWidth = containerWidth * scaleRef.current;
        const maxPanLeft = containerWidth - scaledWidth;

        // Update position with constraints
        positionXRef.current = Math.max(
            maxPanLeft,
            Math.min(0, positionXRef.current + deltaX)
        );

        // Apply transform directly
        applyTransform();

        // Update React state for rendering purposes only
        updateReactState();
    }, [applyTransform, updateReactState]);

    // Reset to the default state
    const resetCustomTransform = useCallback(() => {
        scaleRef.current = 1;
        positionXRef.current = 0;

        applyTransform();
        updateReactState();
    }, [applyTransform, updateReactState]);

    // Set up all event handlers
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Wheel event for zooming
        const handleWheel = (e) => {
            //e.preventDefault();
            // Only zoom when shift key is pressed
            if (!e.shiftKey) {
                return;
            }
            const deltaScale = -e.deltaY * 0.01;
            zoomOnXAxisOnly(deltaScale, e.offsetX);
        };

        // Mouse events for panning
        const handleMouseDown = (e) => {
            isDraggingRef.current = true;
            lastXRef.current = e.clientX;
            // Prevent text selection during drag
            e.preventDefault();
            // Set cursor to indicate dragging
            container.style.cursor = 'grabbing';
        };

        const handleMouseMove = (e) => {
            if (!isDraggingRef.current) return;

            const deltaX = e.clientX - lastXRef.current;
            lastXRef.current = e.clientX;

            // Call pan function with the delta
            panOnXAxisOnly(deltaX);
        };

        const handleMouseUp = () => {
            isDraggingRef.current = false;
            // Reset cursor
            if (container) {
                container.style.cursor = 'grab';
            }
        };

        // Touch events
        const handleTouchStart = (e) => {
            if (e.touches.length === 1) {
                isDraggingRef.current = true;
                lastXRef.current = e.touches[0].clientX;
                //e.preventDefault();
            } else if (e.touches.length === 2) {
                // Pinch-to-zoom
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                lastPinchDistanceRef.current = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                pinchCenterXRef.current = (touch1.clientX + touch2.clientX) / 2;
                e.preventDefault();
            }
        };

        const handleTouchMove = (e) => {
            // Single touch = pan
            if (e.touches.length === 1 && isDraggingRef.current) {
                const deltaX = e.touches[0].clientX - lastXRef.current;
                lastXRef.current = e.touches[0].clientX;
                panOnXAxisOnly(deltaX);
                //e.preventDefault();
            }

            // Two touches = pinch zoom
            else if (e.touches.length === 2) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );

                const deltaScale = (currentDistance - lastPinchDistanceRef.current) * 0.01;
                lastPinchDistanceRef.current = currentDistance;

                pinchCenterXRef.current = (touch1.clientX + touch2.clientX) / 2;

                zoomOnXAxisOnly(deltaScale, pinchCenterXRef.current);
                e.preventDefault();
            }
        };

        const handleTouchEnd = () => {
            isDraggingRef.current = false;
        };

        // Set initial cursor
        container.style.cursor = 'grab';

        // Add all event listeners
        container.addEventListener('wheel', handleWheel, {passive: false});
        container.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        // For touch events, passive: false is critical for preventDefault to work
        container.addEventListener('touchstart', handleTouchStart, {passive: false});
        container.addEventListener('touchmove', handleTouchMove, {passive: false});
        window.addEventListener('touchend', handleTouchEnd);

        // Cleanup
        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);

            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);

    // Set touch actions for mobile scrolling
    useEffect(() => {
        const canvases = [
            bandscopeCanvasRef.current,
            waterFallCanvasRef.current
        ];

        canvases.forEach(canvas => {
            if (canvas) {
                canvas.style.touchAction = 'pan-y';
            }
        });
    }, [bandscopeCanvasRef, waterFallCanvasRef]);

    return (
        <Box sx={{
            height: 'calc(100% - 90px)',
            width: '100%',
            overflow: 'hidden',
            touchAction: 'pan-y',
            position: 'relative',
        }}>
            {/* Zoom controls */}
            <Box sx={{
                position: 'absolute',
                bottom: isMobile ? 20 : 10,
                right: isMobile ? 20 : 10,
                zIndex: 10,
                display: 'flex',
                gap: '5px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '20px',
                padding: '5px',
            }}>
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={() => {
                        zoomOnXAxisOnly(0.3, window.innerWidth / 2);
                    }}
                    sx={{color: 'white'}}
                >
                    <AddIcon/>
                </IconButton>
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={() => {
                        zoomOnXAxisOnly(-0.3, window.innerWidth / 2);
                    }}
                    sx={{color: 'white'}}
                >
                    <RemoveIcon/>
                </IconButton>
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={resetCustomTransform}
                    sx={{color: 'white'}}
                >
                    <RestartAltIcon/>
                </IconButton>
            </Box>

            {/* Canvases */}
            <Box
                ref={containerRef}
                sx={{
                    width: '100%',
                    height: 'auto',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    transformOrigin: 'left center',
                    touchAction: 'pan-y',
                }}
            >
                {/* Bandscope container with relative positioning */}
                <Box sx={{position: 'relative'}}>
                    <canvas
                        ref={bandscopeCanvasRef}
                        width={waterFallCanvasWidth}
                        height={bandScopeHeight}
                        style={{
                            width: '100%',
                            height: `${bandScopeHeight}px`,
                            borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                            display: 'block',
                            touchAction: 'pan-y',
                            transform: 'translateZ(0)',
                            backfaceVisibility: 'hidden',
                            perspective: '1000px',
                        }}
                    />
                    <BookmarkCanvas
                        centerFrequency={centerFrequency}
                        sampleRate={sampleRate}
                        containerWidth={visualContainerWidth}
                        height={bandScopeHeight}
                        onBookmarkClick={handleBookmarkClick}
                    />
                </Box>

                <FrequencyScale
                    centerFrequency={centerFrequency}
                    containerWidth={visualContainerWidth}
                    sampleRate={sampleRate}
                />

                <canvas
                    ref={waterFallCanvasRef}
                    width={waterFallCanvasWidth}
                    height={waterFallWindowHeight - 230}
                    style={{
                        width: '100%',
                        height: `${waterFallWindowHeight - 230}px`,
                        display: 'block',
                        touchAction: 'pan-y',
                        //transform: 'translateZ(0)', // commented out because it breaks box-shadow CSS
                        //backfaceVisibility: 'hidden',
                        //perspective: '1000px',
                    }}
                />
                <VFOMarkersContainer
                    centerFrequency={centerFrequency}
                    sampleRate={sampleRate}
                    waterfallHeight={waterFallCanvasHeight}
                    bandscopeHeight={bandScopeHeight}
                    containerWidth={containerWidthRef.current}
                    zoomScale={scaleRef.current}
                    currentPositionX={positionXRef.current}
                />
            </Box>

        </Box>
    );
});

export default WaterfallWithStrictXAxisZoom;