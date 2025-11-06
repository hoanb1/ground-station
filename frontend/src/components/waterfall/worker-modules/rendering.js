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
 * Rendering functions for bandscope and dB axis
 */

/**
 * Draw bandscope (FFT line display)
 * @param {CanvasRenderingContext2D} bandscopeCtx - Bandscope canvas context
 * @param {Array<number>} fftData - FFT data to display
 * @param {Array<number>} dbRange - [minDb, maxDb]
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {Object} theme - Theme colors
 */
export function drawBandscope(bandscopeCtx, fftData, dbRange, canvasWidth, canvasHeight, theme) {
    const [minDb, maxDb] = dbRange;

    // Clear bandscope canvas
    bandscopeCtx.fillStyle = theme.palette.background.paper;
    bandscopeCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw grid lines
    drawBandscopeGrid(bandscopeCtx, dbRange, canvasWidth, canvasHeight, theme);

    // Draw FFT line
    drawFftLine(bandscopeCtx, fftData, dbRange, canvasWidth, canvasHeight);
}

/**
 * Draw grid lines on bandscope
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array<number>} dbRange - [minDb, maxDb]
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Object} theme - Theme colors
 */
function drawBandscopeGrid(ctx, dbRange, width, height, theme) {
    const [minDb, maxDb] = dbRange;
    const dbStep = 10; // Draw a line every 10 dB

    ctx.strokeStyle = theme.palette.border.light;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);

    // Draw horizontal grid lines
    for (let db = Math.ceil(minDb / dbStep) * dbStep; db <= maxDb; db += dbStep) {
        const y = height - ((db - minDb) / (maxDb - minDb)) * height;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    ctx.setLineDash([]);
}

/**
 * Draw FFT line on bandscope
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array<number>} fftData - FFT data
 * @param {Array<number>} dbRange - [minDb, maxDb]
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 */
function drawFftLine(ctx, fftData, dbRange, width, height) {
    const [minDb, maxDb] = dbRange;

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < fftData.length; i++) {
        const x = (i / fftData.length) * width;
        const normalizedValue = (fftData[i] - minDb) / (maxDb - minDb);
        const y = height - (normalizedValue * height);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();
}

/**
 * Draw dB axis scale
 * @param {CanvasRenderingContext2D} dBAxisCtx - dB axis canvas context
 * @param {Array<number>} dbRange - [minDb, maxDb]
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {Object} theme - Theme colors
 */
export function drawDbAxis(dBAxisCtx, dbRange, canvasWidth, canvasHeight, theme) {
    const [minDb, maxDb] = dbRange;

    // Clear dB axis canvas
    dBAxisCtx.fillStyle = theme.palette.background.paper;
    dBAxisCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw axis labels
    dBAxisCtx.fillStyle = theme.palette.text.primary;
    dBAxisCtx.font = '10px monospace';
    dBAxisCtx.textAlign = 'right';
    dBAxisCtx.textBaseline = 'middle';

    const dbStep = 10;

    for (let db = Math.ceil(minDb / dbStep) * dbStep; db <= maxDb; db += dbStep) {
        const y = canvasHeight - ((db - minDb) / (maxDb - minDb)) * canvasHeight;
        dBAxisCtx.fillText(`${db}`, canvasWidth - 5, y);
    }
}

/**
 * Update waterfall left margin with rotator information
 * @param {CanvasRenderingContext2D} waterfallLeftMarginCtx - Left margin canvas context
 * @param {Object} rotatorEvent - Rotator event data
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {boolean} showRotatorDottedLines - Whether to show dotted lines
 * @param {Object} theme - Theme colors
 */
export function updateWaterfallLeftMargin(
    waterfallLeftMarginCtx,
    rotatorEvent,
    canvasWidth,
    canvasHeight,
    showRotatorDottedLines,
    theme
) {
    // Clear the left margin canvas
    waterfallLeftMarginCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!rotatorEvent || !rotatorEvent.timestamp) {
        return;
    }

    // Calculate Y position based on timestamp
    const now = Date.now();
    const eventTime = new Date(rotatorEvent.timestamp).getTime();
    const timeDiff = now - eventTime;

    // Assume waterfall scrolls at approximately 10 pixels per second (adjust as needed)
    const scrollSpeed = 10;
    const yOffset = Math.floor((timeDiff / 1000) * scrollSpeed);

    // Only draw if the event is still visible on screen
    if (yOffset < canvasHeight) {
        const y = yOffset;

        // Draw background indicator
        waterfallLeftMarginCtx.fillStyle = theme.palette.overlay.medium;
        waterfallLeftMarginCtx.fillRect(0, y - 10, canvasWidth, 20);

        // Draw text
        waterfallLeftMarginCtx.fillStyle = theme.palette.text.primary;
        waterfallLeftMarginCtx.font = '10px monospace';
        waterfallLeftMarginCtx.textAlign = 'left';
        waterfallLeftMarginCtx.textBaseline = 'middle';

        const azText = `Az: ${rotatorEvent.azimuth.toFixed(1)}°`;
        const elText = `El: ${rotatorEvent.elevation.toFixed(1)}°`;

        waterfallLeftMarginCtx.fillText(azText, 5, y - 5);
        waterfallLeftMarginCtx.fillText(elText, 5, y + 5);

        // Draw dotted line across if enabled
        if (showRotatorDottedLines) {
            waterfallLeftMarginCtx.strokeStyle = theme.palette.border.main;
            waterfallLeftMarginCtx.lineWidth = 1;
            waterfallLeftMarginCtx.setLineDash([4, 4]);
            waterfallLeftMarginCtx.beginPath();
            waterfallLeftMarginCtx.moveTo(canvasWidth - 5, y);
            waterfallLeftMarginCtx.lineTo(canvasWidth, y);
            waterfallLeftMarginCtx.stroke();
            waterfallLeftMarginCtx.setLineDash([]);
        }
    }
}
