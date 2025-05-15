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



import React, { useRef, useEffect, useState, useCallback } from 'react';
import {humanizeFrequency, preciseHumanizeFrequency} from "../common/common.jsx";
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
        availableTransmitters,
        satelliteData,
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
    const makeBookMark = (frequency, label, color, metadata = {}) => {
        return {
            frequency,
            label,
            color,
            metadata,
        };
    };

    // Add bookmarks for available transmitters whenever they change
    useEffect(() => {
        const bookMarks = [];
        availableTransmitters.forEach(transmitter => {
            bookMarks.push(makeBookMark(
                transmitter['downlink_low'],
                `${transmitter['description']} (${preciseHumanizeFrequency(transmitter['downlink_low'])})`,
                '#40ff00',
                {
                    type: 'transmitter',
                    transmitter_id: transmitter['id']
                }
            ));
        })
        dispatch(setBookMarks([...bookMarks]));
    }, [availableTransmitters]);

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
        if (rigData['observed_freq'] > 0 && rigData['transmitter_id'] !== "none") {
            // Get the transmitter ID and look up transmitter details
            const transmitterId = rigData['transmitter_id'];
            const transmitter = availableTransmitters.find(t => t.id === transmitterId);

            // Create a new bookmark for the doppler shifted frequency
            const newBookMark = {
                frequency: rigData['observed_freq'],
                label: `${satelliteData['details']['name']} - ${transmitter?.description || 'Unknown'} - Corrected: ${humanizeFrequency(rigData['observed_freq'])}`,
                color: '#ffea00',
                metadata: {
                    type: 'doppler_shift',
                    transmitter_id: transmitterId
                }
            };

            // Filter out any existing Doppler Shifted Frequency bookmark for this specific transmitter
            const filteredBookmarks = bookmarks.filter(bookmark =>
                !(bookmark.metadata?.type === 'doppler_shift' &&
                    bookmark.metadata?.transmitter_id === transmitterId)
            );

            // Dispatch the action with the updated bookmarks
            dispatch(setBookMarks([...filteredBookmarks, newBookMark]));
        }
    }, [rigData]);


    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const ctx = canvas.getContext('2d');

        // Set canvas width based on actual measured width
        canvas.width = actualWidth;
        canvas.height = height;

        // Clear the canvas with a transparent background
        ctx.clearRect(0, 0, canvas.width, height);

        // Calculate frequency range
        const freqRange = endFreq - startFreq;

        // Constants for label sizing
        const textHeight = 14;
        const padding = 4;
        const verticalSpacing = textHeight + padding * 2; // Total height of a label
        const baseY = 16; // Base Y position for the first label

        // First, identify all transmitter IDs that have doppler shift bookmarks
        // We'll use this to skip the corresponding transmitter bookmarks
        const transmitterIdsWithDoppler = new Set();
        bookmarks.forEach(bookmark => {
            if (bookmark.metadata?.type === 'doppler_shift' && bookmark.metadata?.transmitter_id) {
                transmitterIdsWithDoppler.add(bookmark.metadata.transmitter_id);
            }
        });

        // Draw each bookmark
        if (bookmarks.length) {
            let visibleBookmarkIndex = 0;
            bookmarks.forEach((bookmark) => {
                // Skip if the bookmark is outside the visible range
                if (bookmark.frequency < startFreq || bookmark.frequency > endFreq) {
                    return;
                }

                // Skip transmitter bookmarks that have a corresponding doppler shift bookmark
                if (bookmark.metadata?.type === 'transmitter' &&
                    bookmark.metadata?.transmitter_id &&
                    transmitterIdsWithDoppler.has(bookmark.metadata.transmitter_id)) {
                    return;
                }

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

                // Draw a downward-pointing arrow at the bottom of the canvas
                ctx.beginPath();
                const arrowSize = 6;
                const arrowY = height - arrowSize; // Position at bottom of canvas

                // Draw the arrow path
                ctx.moveTo(x - arrowSize, arrowY);
                ctx.lineTo(x + arrowSize, arrowY);
                ctx.lineTo(x, height);
                ctx.closePath();

                // If the bookmark is a transmitter, draw a hollow arrow with colored outline
                if (bookmark.metadata?.type === 'transmitter') {
                    ctx.strokeStyle = bookmark.color || '#ffff00';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                } else {
                    // For all other bookmarks, fill the arrow
                    ctx.fillStyle = bookmark.color || '#ffff00';
                    ctx.fill();
                }

                // Check if this is a doppler_shift type bookmark
                const isDopplerShift = bookmark.metadata?.type === 'doppler_shift';

                // For regular bookmarks - display at top with alternating heights
                if (bookmark.label && !isDopplerShift) {
                    // Calculate label vertical position based on index
                    // Use visibleBookmarkIndex to ensure proper alternating heights
                    const labelOffset = (visibleBookmarkIndex % 2) * verticalSpacing;
                    const labelY = baseY + labelOffset + 10;

                    ctx.font = '11px Arial';
                    ctx.fillStyle = bookmark.color || '#ffff00';
                    ctx.textAlign = 'center';

                    // Add semi-transparent background
                    const textMetrics = ctx.measureText(bookmark.label);
                    const textWidth = textMetrics.width;
                    const radius = 3;

                    ctx.beginPath();
                    ctx.roundRect(
                        x - textWidth / 2 - padding,
                        labelY - padding,
                        textWidth + padding * 2,
                        textHeight + padding * 2,
                        radius
                    );
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
                    ctx.fill();

                    // Draw the text
                    ctx.shadowBlur = 1;
                    ctx.globalAlpha = 0.6;
                    ctx.fillStyle = bookmark.color || '#ffff00';
                    ctx.fillText(bookmark.label, x, labelY + textHeight - padding);
                    ctx.globalAlpha = 1.0;

                    // Increment the visible bookmark index only for non-doppler bookmarks
                    visibleBookmarkIndex++;
                }

                // For doppler_shift bookmarks - display just above the arrow
                if (bookmark.label && isDopplerShift) {
                    ctx.font = 'bold 11px Arial';
                    ctx.fillStyle = bookmark.color || '#00ffff';
                    ctx.textAlign = 'center';

                    // Position the label just above the arrow
                    const dopplerLabelY = 25 - padding - textHeight;

                    // Add semi-transparent background
                    const textMetrics = `${ctx.measureText(bookmark.label)}`;
                    const textWidth = textMetrics.width;
                    const radius = 3;

                    ctx.beginPath();
                    ctx.roundRect(
                        x - textWidth / 2 - padding,
                        dopplerLabelY - padding,
                        textWidth + padding * 2,
                        textHeight + padding * 2,
                        radius
                    );
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
                    ctx.fill();

                    // Draw the text
                    ctx.shadowBlur = 1;
                    ctx.globalAlpha = 0.8;
                    ctx.fillStyle = bookmark.color || '#00ffff';
                    ctx.fillText(bookmark.label, x, dopplerLabelY + textHeight - padding);
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