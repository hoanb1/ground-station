
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box } from '@mui/material';

const FrequencyBandOverlay = ({
                                  centerFrequency,
                                  sampleRate,
                                  containerWidth,
                                  height,
                                  bands = [],
                                  bandHeight = 20,
                                  onBandClick = null,
                                  zoomScale = 1,
                                  panOffset = 0,
                              }) => {
    const canvasRef = useRef(null);
    const bandContainerRef = useRef(null);
    const [actualWidth, setActualWidth] = useState(2048);
    const lastMeasuredWidthRef = useRef(0);

    // Calculate frequency range (full spectrum - no zoom/pan consideration here)
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;

    const updateActualWidth = useCallback(() => {
        const rect = bandContainerRef.current?.getBoundingClientRect();
        if (rect && Math.abs(rect.width - lastMeasuredWidthRef.current) > 1) {
            if (rect.width > 0) {
                lastMeasuredWidthRef.current = rect.width;
                setActualWidth(rect.width);
            }
        }
    }, []);

    // Convert frequency to pixel position (full spectrum coordinates)
    const frequencyToPixel = useCallback((frequency) => {
        const freqRange = endFreq - startFreq;
        return ((frequency - startFreq) / freqRange) * actualWidth;
    }, [startFreq, endFreq, actualWidth]);

    // Poll for container width changes
    useEffect(() => {
        const interval = setInterval(() => {
            updateActualWidth();
        }, 100);
        return () => clearInterval(interval);
    }, [updateActualWidth]);

    // Update width when the container width changes
    useEffect(() => {
        updateActualWidth();
    }, [containerWidth, updateActualWidth]);

    // Draw the frequency bands
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Set canvas width based on actual measured width
        canvas.width = actualWidth;
        canvas.height = height;

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, height);

        // Calculate the band drawing area (bottom of the canvas)
        const bandY = height - bandHeight - 1;

        // Draw bands and labels in one pass
        bands.forEach((band) => {
            const { startFrequency, endFrequency, color = '#ffff00', textColor = '#000000', name } = band;

            // Skip if the band is completely outside the full frequency range
            if (endFrequency < startFreq || startFrequency > endFreq) {
                return;
            }

            // Convert frequencies to pixel positions
            const startX = frequencyToPixel(startFrequency);
            const endX = frequencyToPixel(endFrequency);
            const bandWidth = endX - startX;

            // Draw the colored band (always draw the full band - let CSS transform handle clipping)
            if (bandWidth > 0) {
                ctx.fillStyle = color;
                ctx.fillRect(startX, bandY, bandWidth, bandHeight);
            }

            // Draw the label if there's a name
            if (name) {
                const centerX = (startX + endX) / 2;
                const labelY = bandY + (bandHeight / 2);

                // Measure text width for positioning
                ctx.font = '12px Arial, sans-serif';
                const textMetrics = ctx.measureText(name);
                const textWidth = textMetrics.width;
                const padding = 8;
                const totalLabelWidth = textWidth + (padding * 2);

                // Calculate the visible portion of the band on the canvas
                const visibleStartX = Math.max(0, startX);
                const visibleEndX = Math.min(actualWidth, endX);
                const visibleWidth = visibleEndX - visibleStartX;

                // Only show label if any part of the band is visible
                if (visibleWidth > 0) {
                    let labelX = centerX;
                    let drawConnectingLine = false;
                    let strategy = 'center';

                    // Check if the center position would be visible
                    if (centerX >= 0 && centerX <= actualWidth) {
                        // Center is visible, use it
                        labelX = centerX;
                        strategy = 'center';
                    } else if (visibleWidth >= totalLabelWidth) {
                        // Center is not visible but we have enough visible width to show the label
                        if (centerX < 0) {
                            // Band center is to the left, position label at the visible left edge
                            labelX = visibleStartX + totalLabelWidth / 2 + padding;
                            strategy = 'left-edge';
                        } else {
                            // Band center is to the right, position label at the visible right edge
                            labelX = visibleEndX - totalLabelWidth / 2 - padding;
                            strategy = 'right-edge';
                        }
                    } else if (visibleWidth >= 30) {
                        // Small visible width but enough for a label
                        labelX = (visibleStartX + visibleEndX) / 2;
                        strategy = 'constrained-center';
                    } else {
                        // Very small visible area - position label outside but connected
                        const leftSpace = visibleStartX;
                        const rightSpace = actualWidth - visibleEndX;

                        if (leftSpace >= totalLabelWidth && leftSpace >= rightSpace) {
                            // Position to the left of the visible area
                            labelX = Math.max(totalLabelWidth / 2, visibleStartX - totalLabelWidth / 2 - 10);
                            drawConnectingLine = true;
                            strategy = 'outside-left';
                        } else if (rightSpace >= totalLabelWidth) {
                            // Position to the right of the visible area
                            labelX = Math.min(actualWidth - totalLabelWidth / 2, visibleEndX + totalLabelWidth / 2 + 10);
                            drawConnectingLine = true;
                            strategy = 'outside-right';
                        } else {
                            // Force position at the best available space
                            if (leftSpace > rightSpace) {
                                labelX = Math.max(totalLabelWidth / 2, leftSpace / 2);
                                strategy = 'forced-left';
                            } else {
                                labelX = Math.min(actualWidth - totalLabelWidth / 2, actualWidth - rightSpace / 2);
                                strategy = 'forced-right';
                            }
                        }
                    }

                    // Final bounds check to ensure label stays within canvas
                    labelX = Math.max(totalLabelWidth / 2, Math.min(actualWidth - totalLabelWidth / 2, labelX));

                    // Set text properties
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    // Draw the text with shadow for better readability
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
                    ctx.shadowBlur = 2;
                    ctx.shadowOffsetX = 1;
                    ctx.shadowOffsetY = 1;

                    ctx.fillStyle = textColor;
                    ctx.fillText(name, labelX, labelY);

                    // Draw connecting line if needed
                    if (drawConnectingLine) {
                        // Reset shadow for the line
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;

                        // Find the closest point on the visible band to connect to
                        const connectToX = Math.max(visibleStartX, Math.min(visibleEndX, centerX));

                        ctx.strokeStyle = color;
                        ctx.lineWidth = 1;
                        ctx.setLineDash([2, 2]);
                        ctx.beginPath();
                        ctx.moveTo(connectToX, labelY);
                        ctx.lineTo(labelX, labelY);
                        ctx.stroke();
                        ctx.setLineDash([]); // Reset to solid line
                    }

                    // Reset shadow
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                } else {
                    console.info(`Skipping label "${name}" - no visible portion of band`);
                }
            }
        });
    }, [bands, centerFrequency, sampleRate, actualWidth, height, bandHeight, startFreq, endFreq, frequencyToPixel]);

    // Handle click events on the canvas
    const handleCanvasClick = useCallback((e) => {
        if (!onBandClick) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const widthRatio = canvas.width / rect.width;
        const canvasX = clickX * widthRatio;
        const clickY = e.clientY - rect.top;

        // Check if click was in the band area
        const bandY = height - bandHeight;
        if (clickY >= bandY && clickY <= height) {
            // Calculate which frequency was clicked (full spectrum coordinates)
            const freqRange = endFreq - startFreq;
            const clickedFreq = startFreq + (canvasX / canvas.width) * freqRange;

            // Find which band was clicked
            const clickedBand = bands.find((band) => {
                return clickedFreq >= band.startFrequency && clickedFreq <= band.endFrequency;
            });

            if (clickedBand) {
                onBandClick(clickedBand);
            }
        }
    }, [bands, onBandClick, startFreq, endFreq, height, bandHeight]);

    // Set up click event listener
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !onBandClick) return;

        canvas.addEventListener('click', handleCanvasClick);
        return () => canvas.removeEventListener('click', handleCanvasClick);
    }, [handleCanvasClick, onBandClick]);

    return (
        <Box
            ref={bandContainerRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${height}px`,
                pointerEvents: onBandClick ? 'auto' : 'none',
                zIndex: 10,
            }}
        >
            <canvas
                className={'frequency-band-overlay'}
                ref={canvasRef}
                width={actualWidth}
                height={height}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    touchAction: 'pan-y',
                    cursor: onBandClick ? 'pointer' : 'default',
                }}
            />
        </Box>
    );
};

export default FrequencyBandOverlay;