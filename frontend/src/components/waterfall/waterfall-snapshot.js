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

import { useCallback } from 'react';
import { useTheme } from '@mui/material';

/**
 * Custom hook for capturing waterfall display snapshots
 *
 * This hook provides functionality to capture a complete waterfall display including:
 * - Bandscope spectrum analyzer
 * - Bookmark overlays
 * - Bandplan overlays
 * - Frequency scale labels
 * - dB axis scales (left margin)
 * - Main waterfall canvas
 *
 * The captured image is scaled to a target width while preserving the left margin at original size.
 */
export const useWaterfallSnapshot = ({
    bandscopeCanvasRef,
    dBAxisScopeCanvasRef,
    waterFallLeftMarginCanvasRef,
    bandScopeHeight,
    frequencyScaleHeight,
    waterFallCanvasHeight,
    waterFallCanvasWidth,
}) => {
    const theme = useTheme();

    /**
     * Captures the waterfall canvas from the worker
     * @returns {Promise<string|null>} Data URL of the waterfall canvas or null if timeout
     */
    const captureWaterfallCanvas = useCallback(async () => {
        // Request waterfall canvas capture from worker
        const captureEvent = new CustomEvent('capture-waterfall-canvas');
        window.dispatchEvent(captureEvent);

        // Wait for the waterfall canvas to be captured
        const maxWaitTime = 2000;
        const pollInterval = 50;
        let elapsed = 0;
        let waterfallDataURL = null;

        while (elapsed < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            elapsed += pollInterval;

            if (window.waterfallCanvasDataURL) {
                waterfallDataURL = window.waterfallCanvasDataURL;
                delete window.waterfallCanvasDataURL;
                break;
            }
        }

        if (!waterfallDataURL) {
            console.error('Waterfall canvas capture timeout');
            return null;
        }

        return waterfallDataURL;
    }, []);

    /**
     * Finds overlay canvases in the DOM
     * @returns {Object} Object containing bookmarkCanvas, bandplanCanvas, frequencyScaleCanvas, and frequencyScaleLeftCanvas
     */
    const findOverlayCanvases = useCallback(() => {
        const allCanvases = document.querySelectorAll('canvas');
        let bookmarkCanvas = null;
        let bandplanCanvas = null;
        let frequencyScaleCanvas = null;
        let frequencyScaleLeftCanvas = null;

        const bandscopeCanvas = bandscopeCanvasRef.current;

        allCanvases.forEach(canvas => {
            // Look for bookmark canvas by its class name
            if (canvas.classList.contains('bookmark-canvas')) {
                bookmarkCanvas = canvas;
            } else if (canvas.classList.contains('frequency-band-overlay')) {
                // Look for bandplan overlay canvas by its class name
                bandplanCanvas = canvas;
            } else if (canvas.height === 21) {
                // Small canvas between dB axes
                frequencyScaleLeftCanvas = canvas;
            } else if (
                canvas !== bandscopeCanvas &&
                canvas.classList.contains('waterfall-canvas') === false &&
                canvas.classList.contains('bandscope-canvas') === false &&
                canvas.classList.contains('waterfall-left-margin-canvas') === false &&
                canvas.classList.contains('bookmark-canvas') === false &&
                canvas.classList.contains('frequency-band-overlay') === false
            ) {
                // Frequency scale is the other canvas that's not bandscope or waterfall
                if (!frequencyScaleCanvas && canvas.height < 30 && canvas.height !== 21) {
                    frequencyScaleCanvas = canvas;
                }
            }
        });

        return { bookmarkCanvas, bandplanCanvas, frequencyScaleCanvas, frequencyScaleLeftCanvas };
    }, [bandscopeCanvasRef]);

    /**
     * Creates a composite canvas with all waterfall elements at original size
     * @param {string} waterfallDataURL - Data URL of the waterfall canvas
     * @param {Object} overlayCanvases - Object containing overlay canvas elements
     * @returns {Promise<HTMLCanvasElement>} Composite canvas with all elements
     */
    const createCompositeCanvas = useCallback(async (waterfallDataURL, overlayCanvases) => {
        const bandscopeCanvas = bandscopeCanvasRef.current;
        const dBAxisScopeCanvas = dBAxisScopeCanvasRef.current;
        const waterfallLeftMarginCanvas = waterFallLeftMarginCanvasRef.current;
        const { bookmarkCanvas, bandplanCanvas, frequencyScaleCanvas, frequencyScaleLeftCanvas } = overlayCanvases;

        const leftMarginWidth = dBAxisScopeCanvas ? dBAxisScopeCanvas.width : 0;
        const totalHeight = bandScopeHeight + frequencyScaleHeight + waterFallCanvasHeight;
        const totalWidth = leftMarginWidth + waterFallCanvasWidth;

        // Create composite canvas
        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = totalWidth;
        compositeCanvas.height = totalHeight;
        const ctx = compositeCanvas.getContext('2d');

        // Fill background
        ctx.fillStyle = theme.palette.background.default;
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        let yOffset = 0;

        // Draw dB axis for bandscope on the left
        if (dBAxisScopeCanvas) {
            ctx.drawImage(dBAxisScopeCanvas, 0, yOffset, leftMarginWidth, bandScopeHeight);
        }

        // Draw bandscope
        ctx.drawImage(bandscopeCanvas, leftMarginWidth, yOffset, waterFallCanvasWidth, bandScopeHeight);

        // Draw bookmark overlay on top of bandscope if available
        if (bookmarkCanvas && bookmarkCanvas.width > 0 && bookmarkCanvas.height > 0) {
            ctx.drawImage(bookmarkCanvas, leftMarginWidth, yOffset, waterFallCanvasWidth, bandScopeHeight);
        }

        // Draw bandplan overlay on top of bandscope if available
        if (bandplanCanvas && bandplanCanvas.width > 0 && bandplanCanvas.height > 0) {
            ctx.drawImage(bandplanCanvas, leftMarginWidth, yOffset, waterFallCanvasWidth, bandScopeHeight);
        }

        yOffset += bandScopeHeight;

        // Draw small canvas between dB axes (21px height)
        if (frequencyScaleLeftCanvas) {
            ctx.drawImage(frequencyScaleLeftCanvas, 0, yOffset, leftMarginWidth, frequencyScaleHeight);
        }

        // Draw frequency scale if available
        if (frequencyScaleCanvas && frequencyScaleCanvas.width > 0 && frequencyScaleCanvas.height > 0) {
            ctx.drawImage(frequencyScaleCanvas, leftMarginWidth, yOffset, waterFallCanvasWidth, frequencyScaleHeight);
        } else {
            // Fill with background if not available
            ctx.fillStyle = theme.palette.background.paper;
            ctx.fillRect(leftMarginWidth, yOffset, waterFallCanvasWidth, frequencyScaleHeight);
        }
        yOffset += frequencyScaleHeight;

        // Draw waterfall left margin (dB axis)
        if (waterfallLeftMarginCanvas) {
            ctx.drawImage(waterfallLeftMarginCanvas, 0, yOffset, leftMarginWidth, waterFallCanvasHeight);
        }

        // Draw waterfall from data URL
        const waterfallImg = new Image();
        await new Promise((resolve, reject) => {
            waterfallImg.onload = resolve;
            waterfallImg.onerror = reject;
            waterfallImg.src = waterfallDataURL;
        });
        ctx.drawImage(waterfallImg, leftMarginWidth, yOffset, waterFallCanvasWidth, waterFallCanvasHeight);

        return compositeCanvas;
    }, [
        bandscopeCanvasRef,
        dBAxisScopeCanvasRef,
        waterFallLeftMarginCanvasRef,
        bandScopeHeight,
        frequencyScaleHeight,
        waterFallCanvasHeight,
        waterFallCanvasWidth,
        theme
    ]);

    /**
     * Scales the composite canvas to target width while keeping left margin at original size
     * Also crops the image to keep only the top 900px
     * @param {HTMLCanvasElement} compositeCanvas - The composite canvas to scale
     * @param {number} targetTotalWidth - Target width for the final image (default: 1620)
     * @returns {HTMLCanvasElement} Scaled and cropped final canvas
     */
    const scaleCompositeCanvas = useCallback((compositeCanvas, targetTotalWidth = 1620) => {
        const dBAxisScopeCanvas = dBAxisScopeCanvasRef.current;
        const leftMarginWidth = dBAxisScopeCanvas ? dBAxisScopeCanvas.width : 0;
        const totalHeight = bandScopeHeight + frequencyScaleHeight + waterFallCanvasHeight;
        const croppedHeight = Math.min(900, totalHeight); // Crop to top 900px

        // Step 1: Extract the main area (without left margin) to scale it
        const targetMainWidth = targetTotalWidth - leftMarginWidth; // Reserve space for left margin
        const scaledMainCanvas = document.createElement('canvas');
        scaledMainCanvas.width = targetMainWidth;
        scaledMainCanvas.height = croppedHeight;
        const scaledMainCtx = scaledMainCanvas.getContext('2d');

        // Draw only the main waterfall area (without left margin) scaled and cropped
        scaledMainCtx.drawImage(
            compositeCanvas,
            leftMarginWidth, 0, waterFallCanvasWidth, croppedHeight, // source (cropped)
            0, 0, targetMainWidth, croppedHeight // destination (scaled)
        );

        // Step 2: Create final canvas with left margin at original size + scaled main area
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetTotalWidth;
        finalCanvas.height = croppedHeight;
        const finalCtx = finalCanvas.getContext('2d');

        // Fill background
        finalCtx.fillStyle = theme.palette.background.default;
        finalCtx.fillRect(0, 0, targetTotalWidth, croppedHeight);

        // Draw left margin at original size (cropped)
        finalCtx.drawImage(
            compositeCanvas,
            0, 0, leftMarginWidth, croppedHeight, // source (left margin only, cropped)
            0, 0, leftMarginWidth, croppedHeight // destination (same size)
        );

        // Draw scaled main area to the right
        finalCtx.drawImage(scaledMainCanvas, leftMarginWidth, 0, targetMainWidth, croppedHeight);

        return finalCanvas;
    }, [
        dBAxisScopeCanvasRef,
        bandScopeHeight,
        frequencyScaleHeight,
        waterFallCanvasHeight,
        waterFallCanvasWidth,
        theme
    ]);

    /**
     * Captures a complete waterfall snapshot
     * @param {number} targetWidth - Target width for the final image (default: 1620)
     * @returns {Promise<string|null>} Data URL of the captured snapshot or null if failed
     */
    const captureSnapshot = useCallback(async (targetWidth = 1620) => {
        try {
            const bandscopeCanvas = bandscopeCanvasRef.current;
            if (!bandscopeCanvas) {
                console.error('Bandscope canvas not available');
                return null;
            }

            // Step 1: Capture waterfall canvas from worker
            const waterfallDataURL = await captureWaterfallCanvas();
            if (!waterfallDataURL) {
                return null;
            }

            // Step 2: Find overlay canvases
            const overlayCanvases = findOverlayCanvases();

            // Step 3: Create composite canvas at original size
            const compositeCanvas = await createCompositeCanvas(waterfallDataURL, overlayCanvases);

            // Step 4: Scale to target width (keeping left margin at original size)
            const finalCanvas = scaleCompositeCanvas(compositeCanvas, targetWidth);

            // Step 5: Convert to data URL
            return finalCanvas.toDataURL('image/png');

        } catch (error) {
            console.error('Error capturing waterfall snapshot:', error);
            return null;
        }
    }, [
        bandscopeCanvasRef,
        captureWaterfallCanvas,
        findOverlayCanvases,
        createCompositeCanvas,
        scaleCompositeCanvas
    ]);

    return {
        captureSnapshot
    };
};
