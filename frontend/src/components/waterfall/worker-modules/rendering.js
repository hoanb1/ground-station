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

/**
 * Rendering functions for bandscope, dB axis, and waterfall left margin
 */

import { getColorForPower } from './color-maps.js';

/**
 * Draw bandscope (FFT line display)
 * @param {Object} params - Parameters object
 * @param {CanvasRenderingContext2D} params.bandscopeCtx - Bandscope canvas context
 * @param {OffscreenCanvas} params.bandscopeCanvas - Bandscope canvas
 * @param {Array<number>} params.fftData - FFT data to display
 * @param {Array<number>} params.smoothedFftData - Smoothed FFT data
 * @param {Array<number>} params.dbRange - [minDb, maxDb]
 * @param {string} params.colorMap - Color map name
 * @param {Object} params.theme - Theme colors
 * @param {CanvasRenderingContext2D} params.dBAxisCtx - dB axis canvas context
 * @param {OffscreenCanvas} params.dBAxisCanvas - dB axis canvas
 * @param {number} params.bandscopeTopPadding - Top padding offset
 */
export function drawBandscope({
    bandscopeCtx,
    bandscopeCanvas,
    fftData,
    smoothedFftData,
    dbRange,
    colorMap,
    theme,
    dBAxisCtx,
    dBAxisCanvas,
    bandscopeTopPadding = 0
}) {
    if (!bandscopeCanvas || fftData.length === 0) {
        return;
    }

    const width = bandscopeCanvas.width;
    const height = bandscopeCanvas.height;

    // Clear the canvas
    bandscopeCtx.fillStyle = theme.palette.background.default;
    bandscopeCtx.fillRect(0, 0, width, height);

    const [minDb, maxDb] = dbRange;

    // Draw dB marks and labels
    bandscopeCtx.fillStyle = 'white';
    bandscopeCtx.font = '12px Monospace';
    bandscopeCtx.textAlign = 'right';

    // Calculate step size based on range
    const dbRangeDiff = maxDb - minDb;
    const steps = Math.min(6, dbRangeDiff); // Maximum 10 steps
    const stepSize = Math.ceil(dbRangeDiff / steps);

    for (let db = Math.ceil(minDb / stepSize) * stepSize; db <= maxDb; db += stepSize) {
        const y = height - ((db - minDb) / (maxDb - minDb)) * height;

        // Draw a horizontal dotted grid line
        bandscopeCtx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
        bandscopeCtx.setLineDash([5, 5]);
        bandscopeCtx.beginPath();
        bandscopeCtx.moveTo(0, y);
        bandscopeCtx.lineTo(width, y);
        bandscopeCtx.stroke();
        bandscopeCtx.setLineDash([]);
    }

    // Draw the dB axis (y-axis)
    drawDbAxis({
        dBAxisCtx,
        dBAxisCanvas,
        width,
        height,
        topPadding: bandscopeTopPadding,
        dbRange,
        theme
    });

    // Draw the FFT data as a line graph using smoothed data
    drawFftLine({
        ctx: bandscopeCtx,
        fftData: smoothedFftData,
        width,
        height,
        dbRange,
        colorMap
    });
}

/**
 * Draw dB axis scale
 * @param {Object} params - Parameters object
 * @param {CanvasRenderingContext2D} params.dBAxisCtx - dB axis canvas context
 * @param {OffscreenCanvas} params.dBAxisCanvas - dB axis canvas
 * @param {number} params.width - Canvas width
 * @param {number} params.height - Canvas height (actual drawing area, excluding top padding)
 * @param {number} params.topPadding - Top padding offset
 * @param {Array<number>} params.dbRange - [minDb, maxDb]
 * @param {Object} params.theme - Theme colors
 */
export function drawDbAxis({
    dBAxisCtx,
    dBAxisCanvas,
    width,
    height,
    topPadding = 0,
    dbRange,
    theme
}) {
    const [minDb, maxDb] = dbRange;

    // Draw background for the entire canvas including top padding
    dBAxisCtx.fillStyle = theme.palette.background.elevated;
    dBAxisCtx.fillRect(0, 0, dBAxisCanvas.width, dBAxisCanvas.height);

    // Draw dB marks and labels (offset by topPadding)
    dBAxisCtx.fillStyle = theme.palette.text.primary;
    dBAxisCtx.font = '12px Monospace';
    dBAxisCtx.textAlign = 'right';

    // Calculate step size based on range
    const dbRangeValue = maxDb - minDb;
    const steps = Math.min(6, dbRangeValue); // Maximum 10 steps
    const stepSize = Math.ceil(dbRangeValue / steps);

    for (let db = Math.ceil(minDb / stepSize) * stepSize; db <= maxDb; db += stepSize) {
        const y = topPadding + height - ((db - minDb) / (maxDb - minDb)) * height;

        // Draw a horizontal dotted grid line (matches old behavior exactly)
        dBAxisCtx.strokeStyle = theme.palette.overlay.light;
        dBAxisCtx.setLineDash([2, 2]);
        dBAxisCtx.beginPath();
        dBAxisCtx.moveTo(dBAxisCanvas.width, y);
        dBAxisCtx.lineTo(width, y);
        dBAxisCtx.stroke();
        dBAxisCtx.setLineDash([]);

        // Draw label
        dBAxisCtx.fillText(`${db} dB`, dBAxisCanvas.width - 5, y + 3);
    }
}

/**
 * Draw FFT line on bandscope
 * @param {Object} params - Parameters object
 * @param {CanvasRenderingContext2D} params.ctx - Canvas context
 * @param {Array<number>} params.fftData - FFT data
 * @param {number} params.width - Canvas width
 * @param {number} params.height - Canvas height
 * @param {Array<number>} params.dbRange - [minDb, maxDb]
 * @param {string} params.colorMap - Color map name
 */
export function drawFftLine({
    ctx,
    fftData,
    width,
    height,
    dbRange,
    colorMap
}) {
    const [minDb, maxDb] = dbRange;
    const graphWidth = width;
    const skipFactor = fftData.length / graphWidth;

    // Generate line color based on a "hot" point in the colormap (e.g., 80% intensity)
    // This gives a color that's representative of the colormap
    const lineColorPoint = 0.8; // Use 80% intensity for the line
    const lineRgb = getColorForPower(
        minDb + (maxDb - minDb) * lineColorPoint,
        colorMap,
        [minDb, maxDb],
    );

    // Create line color with proper opacity
    const lineColor = `rgba(${lineRgb.r}, ${lineRgb.g}, ${lineRgb.b}, 0.8)`;

    // Generate fill color based on the same colormap but with lower intensity
    const fillColorPoint = 0.7; // Use 50% intensity for fill base color
    const fillRgb = getColorForPower(
        minDb + (maxDb - minDb) * fillColorPoint,
        colorMap,
        [minDb, maxDb],
    );

    // Create fill color with low opacity
    const fillColor = `rgba(${fillRgb.r}, ${fillRgb.g}, ${fillRgb.b}, 0.3)`;

    // Set line style with generated color
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Draw the line path
    for (let x = 0; x < graphWidth; x++) {
        // Map canvas pixel to the appropriate FFT bin using scaling
        const fftIndex = Math.min(Math.floor(x * skipFactor), fftData.length - 1);
        const amplitude = fftData[fftIndex];

        // Normalize amplitude to canvas height using dB range
        const normalizedValue = Math.max(0, Math.min(1, (amplitude - minDb) / (maxDb - minDb)));
        const y = height - (normalizedValue * height);

        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    // Draw the line
    ctx.stroke();

    // Add fill below the line using the generated fill color
    ctx.fillStyle = fillColor;
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fill();
}

/**
 * Update waterfall left margin with timestamps and rotator events
 * @param {Object} params - Parameters object
 * @param {CanvasRenderingContext2D} params.waterFallLeftMarginCtx - Left margin canvas context
 * @param {OffscreenCanvas} params.waterfallLeftMarginCanvas - Left margin canvas
 * @param {OffscreenCanvas} params.waterfallCanvas - Main waterfall canvas
 * @param {CanvasRenderingContext2D} params.waterfallCtx - Main waterfall canvas context
 * @param {Array<string>} params.rotatorEventQueue - Queue of rotator events
 * @param {boolean} params.showRotatorDottedLines - Whether to show dotted lines
 * @param {Object} params.theme - Theme colors
 * @param {Object} params.lastTimestamp - Last timestamp reference (mutable)
 * @param {Object} params.dottedLineImageData - Cached dotted line image data (mutable)
 * @returns {Object} Updated state { lastTimestamp, dottedLineImageData }
 */
export function updateWaterfallLeftMargin({
    waterFallLeftMarginCtx,
    waterfallLeftMarginCanvas,
    waterfallCanvas,
    waterfallCtx,
    rotatorEventQueue,
    showRotatorDottedLines,
    theme,
    lastTimestamp,
    dottedLineImageData
}) {
    // This part should run on EVERY frame, not just when minutes change
    // Move existing pixels DOWN by 1 pixel
    waterFallLeftMarginCtx.drawImage(
        waterfallLeftMarginCanvas,
        0, 0,
        waterfallLeftMarginCanvas.width, waterfallLeftMarginCanvas.height - 1,
        0, 1,
        waterfallLeftMarginCanvas.width, waterfallLeftMarginCanvas.height - 1
    );

    // Fill the top row with the background color
    waterFallLeftMarginCtx.fillStyle = theme.palette.background.paper;
    waterFallLeftMarginCtx.fillRect(0, 0, waterfallLeftMarginCanvas.width, 1);

    // Process last rotator events, if there are any then print a line
    const newRotatorEvent = rotatorEventQueue.pop();
    if (newRotatorEvent) {
        // Set font properties first to measure text
        waterFallLeftMarginCtx.font = '12px monospace';
        waterFallLeftMarginCtx.textAlign = 'center';
        waterFallLeftMarginCtx.textBaseline = 'top';

        // Measure text to get precise dimensions
        const textMetrics = waterFallLeftMarginCtx.measureText(newRotatorEvent);
        const textWidth = textMetrics.width;
        const textHeight = 12; // Match the actual font size
        const centerX = waterfallLeftMarginCanvas.width / 2;
        const textX = centerX - (textWidth / 2);

        // Only clear the specific rectangle where the text will be drawn
        waterFallLeftMarginCtx.clearRect(textX - 1, 0, textWidth + 2, textHeight);

        // Fill with background color
        waterFallLeftMarginCtx.fillStyle = theme.palette.background.paper;
        waterFallLeftMarginCtx.fillRect(textX - 1, 0, textWidth + 2, textHeight);

        // Draw the time text at y=0
        waterFallLeftMarginCtx.fillStyle = theme.palette.text.primary;
        waterFallLeftMarginCtx.fillText(newRotatorEvent, centerX, 0);

        // Draw dotted line only if showRotatorDottedLines is enabled
        if (showRotatorDottedLines) {
            // Get or create the imageData for the dotted line
            let imageData;

            // Check if we have a cached imageData for the dotted line
            if (!dottedLineImageData || dottedLineImageData.width !== waterfallCanvas.width) {
                // Create new ImageData if none exists or if width changed
                imageData = waterfallCtx.createImageData(waterfallCanvas.width, 1);
                dottedLineImageData = imageData;

                // Pre-fill the dotted line pattern
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 32) { // Increase step to create dots
                    for (let j = 0; j < 4; j++) { // Dot width of 1 pixel
                        const idx = i + (j * 4);
                        if (idx < data.length) {
                            data[idx] = 255;     // R
                            data[idx + 1] = 255; // G
                            data[idx + 2] = 255; // B
                            data[idx + 3] = 100; // A
                        }
                    }
                }
            } else {
                // Reuse the cached imageData
                imageData = dottedLineImageData;
            }

            // Draw the dotted line
            waterfallCtx.putImageData(imageData, 0, 0);
        }
    }

    // Calculate seconds since the epoch and check if we need to update
    const now = new Date();
    const currentSeconds = Math.floor(now.getTime() / 1000);

    // Only update if this is a NEW timestamp (check if lastTimestamp second has changed)
    const lastSeconds = lastTimestamp ? Math.floor(lastTimestamp.getTime() / 1000) : -1;
    const shouldUpdate = !lastTimestamp ||
        (currentSeconds !== lastSeconds && currentSeconds % 15 === 0) ||
        (lastTimestamp.getMinutes() !== now.getMinutes()) ||
        (lastTimestamp.getHours() !== now.getHours());

    // Update the timestamp every 15 seconds
    if (shouldUpdate) {
        // Format the time as HH:MM:SS
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timeString = `${hours}:${minutes}:${seconds}`;

        // Set font properties first to measure text
        waterFallLeftMarginCtx.font = '12px monospace';
        waterFallLeftMarginCtx.textAlign = 'center';
        waterFallLeftMarginCtx.textBaseline = 'top';

        // Measure text to get precise dimensions
        const textMetrics = waterFallLeftMarginCtx.measureText(timeString);
        const textWidth = textMetrics.width;
        const textHeight = 12; // Match the actual font size
        const centerX = waterfallLeftMarginCanvas.width / 2;
        const textX = centerX - (textWidth / 2);

        // Only clear the specific rectangle where the text will be drawn
        waterFallLeftMarginCtx.clearRect(textX - 1, 0, textWidth + 2, textHeight);

        // Fill with background color
        waterFallLeftMarginCtx.fillStyle = theme.palette.background.paper;
        waterFallLeftMarginCtx.fillRect(textX - 1, 0, textWidth + 2, textHeight);

        // Draw the time text at y=0
        waterFallLeftMarginCtx.fillStyle = theme.palette.text.primary;
        waterFallLeftMarginCtx.fillText(timeString, centerX, 0);

        // Update the last timestamp reference
        lastTimestamp = now;
    }

    // Return updated mutable state
    return {
        lastTimestamp,
        dottedLineImageData
    };
}
