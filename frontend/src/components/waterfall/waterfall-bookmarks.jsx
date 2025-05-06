import React, { useRef, useEffect, useState, useCallback } from 'react';
import { humanizeFrequency } from "../common/common.jsx";
import {useDispatch, useSelector} from "react-redux";
import {
    setBookMarks
} from "./waterfall-slice.jsx";


const getBookmarkCanvasWidth = (element) => {
    return element.current?.getBoundingClientRect();
}

const BookmarkCanvas = ({
                            centerFrequency,
                            sampleRate,
                            containerWidth,
                            height,
                            onBookmarkClick = null
                        }) => {
    const dispatch = useDispatch();
    const canvasRef = useRef(null);
    const bookmarkContainerRef = useRef(null);
    const [actualWidth, setActualWidth] = useState(2048);
    const lastMeasuredWidthRef = useRef(0);

    const {
        bookmarks,
    } = useSelector((state) => state.waterfall);

    const {
        rigData,
    } = useSelector((state) => state.targetSatTrack);

    // Calculate frequency range
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;

    const updateActualWidth = useCallback(() => {
        // Get the actual client dimensions of the element
        const rect = getBookmarkCanvasWidth(bookmarkContainerRef);

        // Only update if the width has changed significantly (avoid unnecessary redraws)
        if (rect && Math.abs(rect.width - lastMeasuredWidthRef.current) > 1) {
            if (rect.width > 0) {
                lastMeasuredWidthRef.current = rect.width;
                setActualWidth(rect.width);
            }
        }
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

    // Update width when the container width changes
    useEffect(() => {
        updateActualWidth();

        if (rigData['observed_freq'] > 0) {
            // show a bookmark for the doppler shifted frequency
            addBookmark(
                rigData['observed_freq'],
                `Doppler Shifted Frequency: ${humanizeFrequency(rigData['observed_freq'])}`,
                '#00ffff'
            );
        }

    }, [rigData]);

    // Draw the bookmarks on the canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Set canvas width based on actual measured width
        canvas.width = actualWidth;
        canvas.height = height;

        // Clear the canvas with a transparent background
        ctx.clearRect(0, 0, canvas.width, height);

        // Calculate frequency range
        const freqRange = endFreq - startFreq;

        // Draw each bookmark
        if (bookmarks.length) {
            bookmarks.forEach((bookmark) => {
                // Skip if the bookmark is outside the visible range
                if (bookmark.frequency < startFreq || bookmark.frequency > endFreq) return;

                // Calculate x position based on frequency
                const x = ((bookmark.frequency - startFreq) / freqRange) * canvas.width;

                // Draw bookmark marker
                ctx.beginPath();
                ctx.strokeStyle = bookmark.color || '#ffff00';
                ctx.lineWidth = 0.8;

                // Draw a subtle dashed vertical line
                ctx.setLineDash([2, 4]);
                ctx.globalAlpha = 0.6;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
                ctx.setLineDash([]); // Reset dash pattern
                ctx.globalAlpha = 1.0;

                // Draw a small marker at the top
                ctx.beginPath();
                ctx.fillStyle = bookmark.color || '#ffff00';
                const markerSize = 4;
                ctx.arc(x, markerSize + 2, markerSize, 0, Math.PI, true);
                ctx.fill();

                // Draw label if provided
                if (bookmark.label) {
                    ctx.font = '11px Arial';
                    ctx.fillStyle = bookmark.color || '#ffff00';
                    ctx.textAlign = 'center';

                    // Add semi-transparent background
                    const textMetrics = ctx.measureText(bookmark.label);
                    const textWidth = textMetrics.width;
                    const textHeight = 14;
                    const padding = 3;
                    const radius = 3;

                    ctx.beginPath();
                    ctx.roundRect(
                        x - textWidth / 2 - padding,
                        16 - padding,
                        textWidth + padding * 2,
                        textHeight + padding * 2,
                        radius
                    );
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
                    ctx.fill();

                    // Draw the text
                    ctx.shadowBlur = 1;
                    ctx.globalAlpha = 0.8;
                    ctx.fillStyle = bookmark.color || '#ffff00';
                    ctx.fillText(bookmark.label, x, 16 + textHeight / 2);
                    ctx.globalAlpha = 1.0;
                }

                // Reset shadow
                ctx.shadowBlur = 0;
            });
        }
    }, [bookmarks, centerFrequency, sampleRate, actualWidth, height]);

    // Handle click events on the canvas
    const handleCanvasClick = useCallback((e) => {
        if (!onBookmarkClick) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const widthRatio = canvas.width / rect.width;
        const canvasX = clickX * widthRatio;

        // Calculate which bookmark was clicked (if any)
        const freqRange = endFreq - startFreq;

        // Convert click position to frequency
        const clickedFreq = startFreq + (canvasX / canvas.width) * freqRange;

        // Find the bookmark closest to the click (within a threshold)
        const threshold = sampleRate * 0.01; // 1% of the frequency range
        const clickedBookmark = bookmarks.find(bookmark =>
            Math.abs(bookmark.frequency - clickedFreq) < threshold
        );

        if (clickedBookmark) {
            onBookmarkClick(clickedBookmark);
        }
    }, [bookmarks, onBookmarkClick, startFreq, endFreq, sampleRate]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !onBookmarkClick) return;

        canvas.addEventListener('click', handleCanvasClick);

        return () => {
            canvas.removeEventListener('click', handleCanvasClick);
        };
    }, [handleCanvasClick, onBookmarkClick]);

    return (
        <div
            ref={bookmarkContainerRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${height}px`,
                pointerEvents: onBookmarkClick ? 'auto' : 'none',
            }}
        >
            <canvas
                ref={canvasRef}
                width={actualWidth}
                height={height}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    touchAction: 'pan-y',
                }}
            />
        </div>
    );
};

export default BookmarkCanvas;