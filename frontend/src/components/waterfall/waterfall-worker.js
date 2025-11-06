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

// Import worker modules (gradual migration)
import { getColorForPower } from './worker-modules/color-maps.js';
import { updateSmoothedFftData } from './worker-modules/smoothing.js';

let waterfallCanvas = null;
let bandscopeCanvas = null;
let dBAxisCanvas = null;
let waterfallLeftMarginCanvas = null;
let waterfallCtx = null;
let bandscopeCtx = null;
let dBAxisCtx = null;
let waterFallLeftMarginCtx = null;
let renderIntervalId = null;
let targetFPS = 15;
let fftData = new Array(1024).fill(-120);
let fftSize = 8192;
let colorMap = 'cosmic';
let dbRange = [-120, 30];
let scrollOffset = 0;
let imageData = null;
// colorCache now in color-maps.js module
let fftUpdateCount = 0;
let fftRateStartTime = Date.now();
let fftUpdatesPerSecond = 0;
let fftRateIntervalId = null;
let binsUpdateCount = 0;
let binsPerSecond = 0;
let lastBandscopeDrawTime = 0;
let bandscopeDrawInterval = 200;
let dottedLineImageData = null;
let rotatorEventQueue = [];
let lastTimestamp = new Date();
let renderWaterfallCount = 0;
let vfoMarkers = [];
let showRotatorDottedLines = true;
let autoScalePreset = 'medium'; // 'strong', 'medium', 'weak'

// Store theme object
let theme = {
    palette: {
        background: {
            default: '#121212',
            paper: '#1e1e1e',
            elevated: '#2a2a2a',
        },
        border: {
            main: '#424242',
            light: '#494949',
            dark: '#262626',
        },
        overlay: {
            light: 'rgba(255, 255, 255, 0.08)',
            medium: 'rgba(255, 255, 255, 0.12)',
            dark: 'rgba(0, 0, 0, 0.5)',
        },
        text: {
            primary: '#ffffff',
            secondary: 'rgba(255, 255, 255, 0.7)',
        }
    }
};

// Store waterfall history for auto-scaling
let waterfallHistory = [];

// Keep the last 10 frames for analysis
const maxHistoryLength = 5;

// Add a flag to track if initial auto-scaling has been performed
let hasPerformedInitialAutoScale = false;

// Store recent FFT data for averaging
let fftHistory = [];

// Number of frames to average (adjust as needed)
let maxFftHistoryLength = 5;

// Smoothing type: 'simple', 'weighted', 'exponential'
let smoothingType = 'weighted';

// For exponential smoothing (0-1, higher = more smoothing)
let smoothingStrength = 0.9;

// Cached smoothed data
let smoothedFftData = new Array(1024).fill(-120);


// Main message handler
self.onmessage = function(eventMessage) {
    const { cmd } = eventMessage.data;

    switch(cmd) {
        case 'initCanvas':
            waterfallCanvas = eventMessage.data.waterfallCanvas;
            bandscopeCanvas = eventMessage.data.bandscopeCanvas;
            dBAxisCanvas = eventMessage.data.dBAxisCanvas;
            waterfallLeftMarginCanvas = eventMessage.data.waterfallLeftMarginCanvas;
            waterfallCtx = waterfallCanvas.getContext('2d', {
                alpha: true,
                desynchronized: true,
                willReadFrequently: false, // true breaks Webview on android and Hermit browser
            });
            bandscopeCtx = bandscopeCanvas.getContext('2d', {
                alpha: true,
                desynchronized: true,
                willReadFrequently: false, // true breaks Webview on android and Hermit browser
            });
            dBAxisCtx = dBAxisCanvas.getContext('2d', {
                alpha: true,
                desynchronized: true,
                willReadFrequently: false, // true breaks Webview on android and Hermit browser
            });
            waterFallLeftMarginCtx = waterfallLeftMarginCanvas.getContext('2d', {
                alpha: true,
                desynchronized: true,
                willReadFrequently: false, // true breaks Webview on android and Hermit browser
            });

            // Enable image smoothing (anti-aliasing)
            waterfallCtx.imageSmoothingEnabled = true;
            waterfallCtx.imageSmoothingQuality = 'high';
            bandscopeCtx.imageSmoothingEnabled = true;
            bandscopeCtx.imageSmoothingQuality = 'high';
            dBAxisCtx.imageSmoothingEnabled = true;
            dBAxisCtx.imageSmoothingQuality = 'high';

            setupCanvas(eventMessage.data.config);

            // Start monitoring when canvas is initialized
            startFftRateMonitoring();
            break;

        case 'start':
            // Reset auto-scale flag for new sessions
            hasPerformedInitialAutoScale = false;
            waterfallHistory = []; // Clear any existing history

            startRendering(eventMessage.data.fps || targetFPS);
            break;

        case 'stop':
            stopRendering();
            break;

        case 'updateFPS':
            updateFPS(eventMessage.data.fps);
            break;

        case 'toggleRotatorDottedLines':
            // Toggle the visibility of dotted lines for rotator events
            showRotatorDottedLines = eventMessage.data.show;
            break;

        case 'updateFFTData': {
            // Increment the counter for rate calculation
            fftUpdateCount++;

            // Increment the fft bin counter
            binsUpdateCount += eventMessage.data.fft.length;

            // Store the new FFT data
            fftData = eventMessage.data.fft;

            // Update smoothed data with every new FFT frame
            const smoothResult = updateSmoothedFftData(
                eventMessage.data.fft,
                fftHistory,
                smoothedFftData,
                smoothingType,
                smoothingStrength,
                maxFftHistoryLength
            );
            fftHistory = smoothResult.fftHistory;
            smoothedFftData = smoothResult.smoothedFftData;

            // Store FFT data in history for auto-scaling
            storeFFTDataInHistory(eventMessage.data.fft);

            // If we're set to immediate rendering, trigger a render now
            if (eventMessage.data.immediate) {
                renderWaterfall();
            }
            break;
        }

        case 'updateFFTSize':
            fftSize = eventMessage.data.fftSize;

            // Reset smoothing arrays when FFT size changes
            fftHistory = [];
            smoothedFftData = new Array(fftSize).fill(-120);

            // Also reset waterfall history for auto-scaling
            waterfallHistory = [];
            hasPerformedInitialAutoScale = false;

            self.postMessage({
                type: 'fftSizeUpdated',
                data: { fftSize: fftSize }
            });
            break;

        case 'updateSmoothingConfig':
            if (eventMessage.data.historyLength !== undefined) {
                maxFftHistoryLength = Math.max(1, Math.min(20, eventMessage.data.historyLength));
            }
            if (eventMessage.data.smoothingType !== undefined) {
                smoothingType = eventMessage.data.smoothingType;
            }
            if (eventMessage.data.smoothingStrength !== undefined) {
                smoothingStrength = Math.max(0, Math.min(1, eventMessage.data.smoothingStrength));
            }

            // Reset history when changing settings
            fftHistory = [];
            smoothedFftData = new Array(fftData.length).fill(-120);

            self.postMessage({
                type: 'smoothingConfigUpdated',
                data: {
                    historyLength: maxFftHistoryLength,
                    smoothingType: smoothingType,
                    smoothingStrength: smoothingStrength
                }
            });
            break;

        case 'updateConfig':
            // Update rendering configuration
            if (eventMessage.data.colorMap) {
                colorMap = eventMessage.data.colorMap;
            }
            if (eventMessage.data.dbRange) {
                dbRange = eventMessage.data.dbRange;
            }
            if (eventMessage.data.theme) {
                theme = eventMessage.data.theme;
            }
            break;

        case 'autoScaleDbRange':
            // Trigger auto-scaling of dB range
            autoScaleDbRange();
            break;

        case 'rotatorEvent':
            // Handle rotator events to display them on canvas
            rotatorEventQueue.push(eventMessage.data.event);
            break;

        case 'releaseCanvas':
            waterfallCanvas = null;
            waterfallCtx = null;
            break;

        case 'startMonitoring':
            startFftRateMonitoring();
            break;

        case 'stopMonitoring':
            stopFftRateMonitoring();
            break;

        case 'updateVFOMarkers':
            vfoMarkers = eventMessage.data.markers;
            break;

        case 'setAutoScalePreset':
            autoScalePreset = eventMessage.data.preset;
            console.log('Auto-scale preset changed to:', autoScalePreset);
            break;

        case 'captureWaterfallCanvas':
            // Capture waterfall canvas as PNG
            if (waterfallCanvas && waterfallCtx) {
                try {
                    // Get the original canvas dimensions
                    const originalWidth = waterfallCanvas.width;
                    const originalHeight = waterfallCanvas.height;

                    // Calculate reasonable output dimensions
                    // Max width: 2048px (reasonable for web display, good quality)
                    // Keep original height (don't scale Y axis)
                    const maxWidth = 2048;
                    let targetWidth, targetHeight;

                    // Always keep original height
                    targetHeight = originalHeight;

                    if (originalWidth > maxWidth) {
                        targetWidth = maxWidth;
                    } else {
                        targetWidth = originalWidth;
                    }

                    // Create a temporary canvas with target dimensions
                    const tempCanvas = new OffscreenCanvas(targetWidth, targetHeight);
                    const tempCtx = tempCanvas.getContext('2d');

                    // Draw the entire waterfall canvas scaled to the temp canvas
                    // This performs high-quality image scaling
                    tempCtx.drawImage(waterfallCanvas, 0, 0, originalWidth, originalHeight, 0, 0, targetWidth, targetHeight);

                    // Convert to blob (this works in workers)
                    tempCanvas.convertToBlob({ type: 'image/png' })
                        .then(blob => {
                            // Send the blob back to main thread
                            // Main thread will convert to data URL
                            self.postMessage({
                                type: 'waterfallCaptured',
                                data: {
                                    blob: blob,
                                    width: targetWidth,
                                    height: targetHeight,
                                    originalWidth: originalWidth,
                                    originalHeight: originalHeight
                                }
                            });
                        })
                        .catch(err => {
                            console.error('Worker: Failed to convert canvas to blob:', err);
                            self.postMessage({
                                type: 'waterfallCaptureFailed',
                                error: err.message
                            });
                        });
                } catch (err) {
                    console.error('Worker: Failed to capture waterfall canvas:', err);
                    self.postMessage({
                        type: 'waterfallCaptureFailed',
                        error: err.message
                    });
                }
            } else {
                console.error('Worker: Canvas or context not available');
                self.postMessage({
                    type: 'waterfallCaptureFailed',
                    error: 'Canvas not available'
                });
            }
            break;

        default:
            console.error('Unknown command:', cmd);
    }
};


// Store FFT data in history for auto-scaling analysis
function storeFFTDataInHistory(fftDataArray) {
    // Add new data to the history
    waterfallHistory.push([...fftDataArray]);

    // Keep only the last N frames
    if (waterfallHistory.length > maxHistoryLength) {
        waterfallHistory.shift();
    }

    // Perform initial auto-scaling once we have enough data (3-5 frames)
    if (!hasPerformedInitialAutoScale && waterfallHistory.length >= 3) {
        console.log('Performing initial auto-scale with', waterfallHistory.length, 'frames of data');
        autoScaleDbRange();
        hasPerformedInitialAutoScale = true;
    }
}

// Auto-scale dB range based on recent waterfall data
function autoScaleDbRange() {
    if (waterfallHistory.length === 0) {
        console.warn('No waterfall history available for auto-scaling');
        return;
    }

    // Collect all values from recent frames
    const allValues = [];
    const samplesToCheck = Math.min(10, waterfallHistory.length);

    for (let i = 0; i < samplesToCheck; i++) {
        const row = waterfallHistory[i];
        allValues.push(...row);
    }

    if (allValues.length === 0) {
        console.warn('No data available for auto-scaling');
        return;
    }

    // Sort values for percentile-based calculation
    const sortedValues = [...allValues].sort((a, b) => a - b);

    let min, max;

    // Apply different scaling strategies based on preset
    switch (autoScalePreset) {
        case 'strong': {
            // For strong signals: Very wide dB range to handle strong signals without clipping
            // Use 2nd to 99th percentile for maximum range
            const strongLowIdx = Math.floor(sortedValues.length * 0.02);
            const strongHighIdx = Math.floor(sortedValues.length * 0.99);
            min = sortedValues[strongLowIdx];
            max = sortedValues[strongHighIdx];
            // Extra padding for strong signals
            min = Math.floor(min - 10);
            max = Math.ceil(max + 10);
            break;
        }

        case 'medium': {
            // For medium signals: Moderate range, less strict than weak
            // Use 5th to 97th percentile
            const mediumLowIdx = Math.floor(sortedValues.length * 0.05);
            const mediumHighIdx = Math.floor(sortedValues.length * 0.97);
            min = sortedValues[mediumLowIdx];
            max = sortedValues[mediumHighIdx];
            // Moderate padding
            min = Math.floor(min - 5);
            max = Math.ceil(max + 5);
            break;
        }

        case 'weak':
        default: {
            // For weak signals: Original algorithm with std dev filtering (tight range, good contrast)
            const sum = allValues.reduce((acc, val) => acc + val, 0);
            const mean = sum / allValues.length;

            const squaredDiffs = allValues.map(val => (val - mean) ** 2);
            const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / allValues.length;
            const stdDev = Math.sqrt(variance);

            // Filter out values more than X standard deviations from the mean
            const stdDevMultiplier = 4.5;
            const filteredValues = allValues.filter(val =>
                Math.abs(val - mean) <= stdDevMultiplier * stdDev
            );

            if (filteredValues.length === 0) {
                console.warn('No valid values after filtering for auto-scaling');
                return;
            }

            min = filteredValues.reduce((a, b) => Math.min(a, b), filteredValues[0]);
            max = filteredValues.reduce((a, b) => Math.max(a, b), filteredValues[0]);

            // Minimal padding for tight contrast on weak signals
            min = Math.floor(min);
            max = Math.ceil(max);
            break;
        }
    }

    // Update the local dbRange
    dbRange = [min, max];

    // Send the new range back to the main thread
    self.postMessage({
        type: 'autoScaleResult',
        data: {
            dbRange: [min, max],
            preset: autoScalePreset,
            stats: {
                samplesAnalyzed: allValues.length,
                framesAnalyzed: samplesToCheck
            }
        }
    });

    console.log(`Auto-scaled dB range (${autoScalePreset}): [${min}, ${max}] (analyzed ${allValues.length} samples from ${samplesToCheck} frames)`);
}

// Function to throttle bandscope drawing
function throttledDrawBandscope() {
    const now = Date.now();

    // Only draw if enough time has passed since the last draw
    if (now - lastBandscopeDrawTime >= bandscopeDrawInterval) {
        drawBandscope();
        lastBandscopeDrawTime = now;
    }
}

function startFftRateMonitoring() {
    // Reset counters
    fftUpdateCount = 0;
    renderWaterfallCount = 0; // Reset renderWaterfall counter
    fftRateStartTime = Date.now();

    // Calculate and report rate every second
    fftRateIntervalId = setInterval(() => {
        const now = Date.now();
        const elapsedSeconds = (now - fftRateStartTime) / 1000;

        // Calculate rates
        fftUpdatesPerSecond = fftUpdateCount / elapsedSeconds;
        const renderWaterfallPerSecond = renderWaterfallCount / elapsedSeconds;

        // Calculate bins per second
        binsPerSecond = binsUpdateCount / elapsedSeconds;

        // Report the rates to the main thread
        self.postMessage({
            type: 'metrics',
            data: {
                fftUpdatesPerSecond: parseFloat(fftUpdatesPerSecond.toFixed(1)),
                binsPerSecond: binsPerSecond,
                renderWaterfallPerSecond: parseFloat(renderWaterfallPerSecond.toFixed(1)),
                totalUpdates: fftUpdateCount,
                timeElapsed: elapsedSeconds,
            }
        });

        // Reset for next interval
        fftUpdateCount = 0;
        renderWaterfallCount = 0;
        binsUpdateCount = 0;
        fftRateStartTime = now;
    }, 1000);
}

function stopFftRateMonitoring() {
    if (fftRateIntervalId) {
        clearInterval(fftRateIntervalId);
        fftRateIntervalId = null;
    }
}

function setupCanvas(config) {
    if (!waterfallCanvas || !waterfallCtx) return;

    waterfallCanvas.width = config.width;
    waterfallCanvas.height = config.height;

    // Initialize the imageData for faster rendering
    imageData = waterfallCtx.createImageData(waterfallCanvas.width, 1);

    // Other setup
    colorMap = config.colorMap;
    dbRange = config.dbRange;
    fftSize = config.fftSize;
    showRotatorDottedLines = config.showRotatorDottedLines;

    // Update theme if provided
    if (config.theme) {
        theme = config.theme;
    }

    // IMPORTANT: Reset smoothing arrays when FFT size changes
    fftHistory = [];
    smoothedFftData = new Array(fftSize).fill(-120);

    // Clear the canvas
    waterfallCtx.fillStyle = theme.palette.background.default;
    waterfallCtx.fillRect(0, 0, waterfallCanvas.width, waterfallCanvas.height);
}

function startRendering(fps) {
    // Clear any existing interval first
    stopRendering();

    // Clear last rotator events
    rotatorEventQueue = [];

    targetFPS = fps;

    // Confirm start
    self.postMessage({ type: 'status', status: 'started', fps: targetFPS });
}

// Stop the rendering cycle
function stopRendering() {
    if (renderIntervalId) {
        clearInterval(renderIntervalId);
        renderIntervalId = null;
    }
    self.postMessage({ type: 'status', status: 'stopped' });
}

function renderWaterfall() {
    if (!waterfallCanvas || !waterfallCtx) return;

    // Increment the counter for rate calculation
    renderWaterfallCount++;

    // Move the current content down by 1 pixel
    waterfallCtx.drawImage(waterfallCanvas, 0, 0, waterfallCanvas.width, waterfallCanvas.height - 1, 0, 1, waterfallCanvas.width, waterfallCanvas.height - 1);

    // Render the new row of FFT data at the TOP instead of bottom
    renderFFTRow(fftData);

    // Update the left margin column
    updateWaterfallLeftMargin();

    // Draw bandscope
    //drawBandscope();

    // Draw bandscope with throttling
    throttledDrawBandscope();
}

function renderFFTRow(fftData) {
    if (!imageData) return;

    const data = imageData.data;
    const [min, max] = dbRange;
    const range = max - min;
    const canvasWidth = waterfallCanvas.width;

    // Clear the image data first
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 0;     // R
        data[i + 1] = 0; // G
        data[i + 2] = 0; // B
        data[i + 3] = 255; // A
    }

    if (fftData.length >= canvasWidth) {
        // More FFT bins than pixels - downsample
        const skipFactor = fftData.length / canvasWidth;

        for (let x = 0; x < canvasWidth; x++) {
            const fftIndex = Math.min(Math.floor(x * skipFactor), fftData.length - 1);
            const amplitude = fftData[fftIndex];

            let color = getColorForPower(amplitude, colorMap, dbRange);

            const pixelIndex = x * 4;
            data[pixelIndex] = color.r;
            data[pixelIndex + 1] = color.g;
            data[pixelIndex + 2] = color.b;
            data[pixelIndex + 3] = 255;
        }
    } else {
        // Fewer FFT bins than pixels - interpolate/stretch
        const stretchFactor = canvasWidth / fftData.length;

        for (let i = 0; i < fftData.length; i++) {
            const amplitude = fftData[i];
            let color = getColorForPower(amplitude, colorMap, dbRange);

            // Calculate the pixel range for this FFT bin
            const startX = Math.floor(i * stretchFactor);
            const endX = Math.floor((i + 1) * stretchFactor);

            // Fill all pixels in this range with the same color
            for (let x = startX; x < endX && x < canvasWidth; x++) {
                const pixelIndex = x * 4;
                data[pixelIndex] = color.r;
                data[pixelIndex + 1] = color.g;
                data[pixelIndex + 2] = color.b;
                data[pixelIndex + 3] = 255;
            }
        }
    }

    // Put the image data on the TOP row of the canvas
    waterfallCtx.putImageData(imageData, 0, 0);
}

function drawBandscope() {
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
    drawDbAxis(dBAxisCtx, width, height, dbRange);

    // Draw the FFT data as a line graph using smoothed data
    drawFftLine(bandscopeCtx, smoothedFftData, width, height, dbRange);
}

function drawDbAxis(ctx, width, height, [minDb, maxDb]) {

    // Draw background for the axis area
    ctx.fillStyle = theme.palette.background.elevated;
    ctx.fillRect(0, 0, dBAxisCanvas.width, height);

    // Draw dB marks and labels
    ctx.fillStyle = theme.palette.text.primary;
    ctx.font = '12px Monospace';
    ctx.textAlign = 'right';

    // Calculate step size based on range
    const dbRange = maxDb - minDb;
    const steps = Math.min(6, dbRange); // Maximum 10 steps
    const stepSize = Math.ceil(dbRange / steps);

    for (let db = Math.ceil(minDb / stepSize) * stepSize; db <= maxDb; db += stepSize) {
        const y = height - ((db - minDb) / (maxDb - minDb)) * height;

        // Draw a horizontal dotted grid line
        ctx.strokeStyle = theme.palette.overlay.light;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(dBAxisCanvas.width, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw label
        ctx.fillText(`${db} dB`, dBAxisCanvas.width - 5, y + 3);
    }
}

function drawFftLine(ctx, fftData, width, height, [minDb, maxDb]) {
    const graphWidth = width;
    const skipFactor = fftData.length / graphWidth;

    // Get the current colormap from settings
    const currentColorMap = colorMap;

    // Generate line color based on a "hot" point in the colormap (e.g., 80% intensity)
    // This gives a color that's representative of the colormap
    const lineColorPoint = 0.8; // Use 80% intensity for the line
    const lineRgb = getColorForPower(
        minDb + (maxDb - minDb) * lineColorPoint,
        currentColorMap,
        [minDb, maxDb],
    );

    // Create line color with proper opacity
    const lineColor = `rgba(${lineRgb.r}, ${lineRgb.g}, ${lineRgb.b}, 0.8)`;

    // Generate fill color based on the same colormap but with lower intensity
    const fillColorPoint = 0.7; // Use 50% intensity for fill base color
    const fillRgb = getColorForPower(
        minDb + (maxDb - minDb) * fillColorPoint,
        currentColorMap,
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

function updateWaterfallLeftMargin() {
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
}

// Update FPS setting
function updateFPS(fps) {
    if (fps !== targetFPS) {
        targetFPS = fps;

        // Restart with new FPS if currently running
        if (renderIntervalId) {
            startRendering(targetFPS);
        }

        self.postMessage({ type: 'status', status: 'fpsUpdated', fps: targetFPS });
    }
}

