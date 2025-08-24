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
let colorCache = new Map();
let fftUpdateCount = 0;
let fftRateStartTime = Date.now();
let fftUpdatesPerSecond = 0;
let fftRateIntervalId = null;
let binsUpdateCount = 0;
let binsPerSecond = 0;
let lastBandscopeDrawTime = 0;
let bandscopeDrawInterval = 150;
let dottedLineImageData = null;
let rotatorEventQueue = [];
let lastTimestamp = new Date();
let renderWaterfallCount = 0;
let vfoMarkers = [];

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
let smoothingType = 'exponential';

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

        case 'updateFFTData':
            // Increment the counter for rate calculation
            fftUpdateCount++;

            // Increment the fft bin counter
            binsUpdateCount += eventMessage.data.fft.length;

            // Store the new FFT data
            fftData = eventMessage.data.fft;

            // Update smoothed data with every new FFT frame
            updateSmoothedFftData(eventMessage.data.fft);

            // Store FFT data in history for auto-scaling
            storeFFTDataInHistory(eventMessage.data.fft);

            // If we're set to immediate rendering, trigger a render now
            if (eventMessage.data.immediate) {
                renderWaterfall();
            }
            break;

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

        default:
            console.error('Unknown command:', cmd);
    }
};

//Function that produces a smoother line out of the FFT data
function updateSmoothedFftData(newFftData) {
    // Check if smoothedFftData needs to be resized
    if (smoothedFftData.length !== newFftData.length) {
        console.log(`Resizing smoothed FFT data from ${smoothedFftData.length} to ${newFftData.length}`);
        smoothedFftData = new Array(newFftData.length).fill(-120);
        fftHistory = []; // Clear history when size changes
    }

    // Add new FFT data to history
    fftHistory.push([...newFftData]);

    // Keep only the last N frames
    if (fftHistory.length > maxFftHistoryLength) {
        fftHistory.shift();
    }

    // Apply different smoothing algorithms
    switch (smoothingType) {
        case 'simple':
            // Simple moving average
            for (let i = 0; i < newFftData.length; i++) {
                let sum = 0;
                for (let j = 0; j < fftHistory.length; j++) {
                    sum += fftHistory[j][i];
                }
                smoothedFftData[i] = sum / fftHistory.length;
            }
            break;

        case 'weighted':
            // Weighted average - recent frames have more influence
            for (let i = 0; i < newFftData.length; i++) {
                let weightedSum = 0;
                let totalWeight = 0;

                for (let j = 0; j < fftHistory.length; j++) {
                    // More recent frames get higher weight
                    const weight = j + 1; // weights: 1, 2, 3, 4, 5...
                    weightedSum += fftHistory[j][i] * weight;
                    totalWeight += weight;
                }
                smoothedFftData[i] = weightedSum / totalWeight;
            }
            break;

        case 'exponential':
            // Exponential moving average - only needs current and previous
            if (fftHistory.length === 1) {
                // First frame, just copy
                smoothedFftData = [...newFftData];
            } else {
                for (let i = 0; i < newFftData.length; i++) {
                    // EMA formula: new_value = alpha * current + (1 - alpha) * previous
                    const alpha = 1 - smoothingStrength; // Convert to alpha (lower strength = higher alpha = less smoothing)
                    smoothedFftData[i] = alpha * newFftData[i] + smoothingStrength * smoothedFftData[i];
                }
            }
            break;
    }
}

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

    // Calculate mean and standard deviation
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

    let min = filteredValues.reduce((a, b) => Math.min(a, b), filteredValues[0]);
    let max = filteredValues.reduce((a, b) => Math.max(a, b), filteredValues[0]);

    // Add some padding to the range
    min = Math.floor(min);
    max = Math.ceil(max);

    // Update the local dbRange
    dbRange = [min, max];

    // Send the new range back to the main thread
    self.postMessage({
        type: 'autoScaleResult',
        data: {
            dbRange: [min, max],
            stats: {
                mean: mean.toFixed(2),
                stdDev: stdDev.toFixed(2),
                samplesAnalyzed: allValues.length,
                framesAnalyzed: samplesToCheck,
                filteredSamples: filteredValues.length
            }
        }
    });

    console.log(`Auto-scaled dB range: [${min}, ${max}] (analyzed ${allValues.length} samples from ${samplesToCheck} frames)`);
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

    // IMPORTANT: Reset smoothing arrays when FFT size changes
    fftHistory = [];
    smoothedFftData = new Array(fftSize).fill(-120);

    // Clear the canvas
    waterfallCtx.fillStyle = 'black';
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

    // Enable image smoothing (anti-aliasing)
    dBAxisCtx.imageSmoothingEnabled = true;
    dBAxisCtx.imageSmoothingQuality = 'high';

    const width = bandscopeCanvas.width;
    const height = bandscopeCanvas.height;

    // Clear the canvas
    bandscopeCtx.fillStyle = 'black';
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
    ctx.fillStyle = 'rgba(40, 40, 40, 0.7)';
    ctx.fillRect(0, 0, dBAxisCanvas.width, height);

    // Draw dB marks and labels
    ctx.fillStyle = 'white';
    ctx.font = '12px Monospace';
    ctx.textAlign = 'right';

    // Calculate step size based on range
    const dbRange = maxDb - minDb;
    const steps = Math.min(6, dbRange); // Maximum 10 steps
    const stepSize = Math.ceil(dbRange / steps);

    for (let db = Math.ceil(minDb / stepSize) * stepSize; db <= maxDb; db += stepSize) {
        const y = height - ((db - minDb) / (maxDb - minDb)) * height;

        // Draw a horizontal dotted grid line
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
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
    waterFallLeftMarginCtx.fillStyle = 'rgba(28, 28, 28, 1)';
    waterFallLeftMarginCtx.fillRect(0, 0, waterfallLeftMarginCanvas.width, 1);

    // Process last rotator events, if there are any then print a line
    const newRotatorEvent = rotatorEventQueue.pop();
    if (newRotatorEvent) {
        // Draw a more visible background for the timestamp
        waterFallLeftMarginCtx.fillStyle = 'rgba(28, 28, 28, 1)';
        waterFallLeftMarginCtx.fillRect(0, 0, dBAxisCanvas.width, 14);

        // Draw the time text
        waterFallLeftMarginCtx.font = '12px monospace';
        waterFallLeftMarginCtx.fillStyle = 'rgba(255, 255, 255, 1)';
        waterFallLeftMarginCtx.textAlign = 'center';
        waterFallLeftMarginCtx.textBaseline = 'top';
        waterFallLeftMarginCtx.fillText(newRotatorEvent, dBAxisCanvas.width / 2, 2);

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

    // Calculate seconds since the epoch and check if divisible by 15
    const now = new Date();
    const currentSeconds = Math.floor(now.getTime() / 1000);
    const shouldUpdate = !lastTimestamp ||
        currentSeconds % 15 === 0 ||
        (lastTimestamp.getMinutes() !== now.getMinutes()) ||
        (lastTimestamp.getHours() !== now.getHours());

    // Update the timestamp every 15 seconds
    if (shouldUpdate) {
        // Format the time as HH:MM:SS
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timeString = `${hours}:${minutes}:${seconds}`;

        // Draw a more visible background for the timestamp
        waterFallLeftMarginCtx.fillStyle = 'rgba(28, 28, 28, 1)';
        waterFallLeftMarginCtx.fillRect(0, 0, dBAxisCanvas.width, 14);

        // Draw the time text
        waterFallLeftMarginCtx.font = '12px monospace';
        waterFallLeftMarginCtx.fillStyle = 'rgba(255, 255, 255, 1)';
        waterFallLeftMarginCtx.textAlign = 'center';
        waterFallLeftMarginCtx.textBaseline = 'top';
        waterFallLeftMarginCtx.fillText(timeString, dBAxisCanvas.width / 2, 2);

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

const getColorForPower = (powerDb, mapName, [minDb, maxDb]) => {
    // Round the power value to reduce cache size (e.g., to the nearest 0.5 dB)
    const roundedPower = Math.round(powerDb * 2) / 2;

    // Create a cache key
    const cacheKey = `${roundedPower}-${mapName}-${minDb}-${maxDb}`;

    // Check if this color is already cached
    if (colorCache.has(cacheKey)) {
        return colorCache.get(cacheKey);
    }

    // If not in the cache, calculate the color
    const normalizedValue = Math.max(0, Math.min(1, (roundedPower - minDb) / (maxDb - minDb)));

    // Apply the selected color map
    switch (mapName) {
        case 'cosmic':
            // Custom cosmic colormap with dark purple to yellow gradient based on provided colors
            // #070208 -> #100b56 -> #170d87 -> #7400cd -> #cb5cff -> #f9f9ae
            let cosmicRGB;
            if (normalizedValue < 0.2) {
                // #070208 to #100b56
                const factor = normalizedValue / 0.2;
                cosmicRGB = {
                    r: 7 + Math.floor(factor * 9),
                    g: 2 + Math.floor(factor * 9),
                    b: 8 + Math.floor(factor * 78)
                };
            } else if (normalizedValue < 0.4) {
                // #100b56 to #170d87
                const factor = (normalizedValue - 0.2) / 0.2;
                cosmicRGB = {
                    r: 16 + Math.floor(factor * 7),
                    g: 11 + Math.floor(factor * 2),
                    b: 86 + Math.floor(factor * 49)
                };
            } else if (normalizedValue < 0.6) {
                // #170d87 to #7400cd
                const factor = (normalizedValue - 0.4) / 0.2;
                cosmicRGB = {
                    r: 23 + Math.floor(factor * 93),
                    g: 13 + Math.floor(factor * 0),
                    b: 135 + Math.floor(factor * 70)
                };
            } else if (normalizedValue < 0.8) {
                // #7400cd to #cb5cff
                const factor = (normalizedValue - 0.6) / 0.2;
                cosmicRGB = {
                    r: 116 + Math.floor(factor * 87),
                    g: 0 + Math.floor(factor * 92),
                    b: 205 + Math.floor(factor * 50)
                };
            } else {
                // #cb5cff to #f9f9ae
                const factor = (normalizedValue - 0.8) / 0.2;
                cosmicRGB = {
                    r: 203 + Math.floor(factor * 46),
                    g: 92 + Math.floor(factor * 167),
                    b: 255 - Math.floor(factor * 81)
                };
            }

            colorCache.set(cacheKey, cosmicRGB);
            return cosmicRGB;

        case 'greyscale':
            // Modified grayscale with darker low intensity
            // Apply a power curve to make low intensities darker
            const curvedValue = Math.pow(normalizedValue, 2.0); // Power > 1 makes darker low values
            const intensity = Math.floor(curvedValue * 255);
            const greyRGB = {r: intensity, g: intensity, b: intensity};
            colorCache.set(cacheKey, greyRGB);
            return greyRGB;

        case 'iceberg':
            // Iceberg palette - Optimized for high contrast with darker low values
            // Very dark blue -> dark blue -> blue -> cyan -> white
            let icebergRGB;

            // Apply a curve to make lower values darker
            // This pushes the very low values closer to black
            const iceCurvedValue = Math.pow(normalizedValue, 1.5);

            if (iceCurvedValue < 0.25) {
                // Very dark blue to dark blue
                const factor = iceCurvedValue / 0.25;
                icebergRGB = {
                    r: Math.floor(0 + factor * 20),
                    g: Math.floor(0 + factor * 30),
                    b: Math.floor(10 + factor * 70)
                };
            } else if (iceCurvedValue < 0.5) {
                // Dark blue to medium blue
                const factor = (iceCurvedValue - 0.25) / 0.25;
                icebergRGB = {
                    r: Math.floor(20 + factor * 30),
                    g: Math.floor(30 + factor * 70),
                    b: Math.floor(80 + factor * 100)
                };
            } else if (iceCurvedValue < 0.75) {
                // Medium blue to cyan
                const factor = (iceCurvedValue - 0.5) / 0.25;
                icebergRGB = {
                    r: Math.floor(50 + factor * 100),
                    g: Math.floor(100 + factor * 155),
                    b: Math.floor(180 + factor * 75)
                };
            } else {
                // Cyan to white
                const factor = (iceCurvedValue - 0.75) / 0.25;
                icebergRGB = {
                    r: Math.floor(150 + factor * 105),
                    g: Math.floor(255),
                    b: Math.floor(255)
                };
            }
            colorCache.set(cacheKey, icebergRGB);
            return icebergRGB;

        case 'heat':
            // Heat palette - Optimized for distinguishing signal levels with darker low end
            // Black -> deep red -> bright red -> orange -> yellow -> white
            let heatRGB;

            // Apply a curve to make lower values darker
            const heatCurvedValue = Math.pow(normalizedValue, 1.5);

            if (heatCurvedValue < 0.15) {
                // True black to very deep red
                const factor = heatCurvedValue / 0.15;
                heatRGB = {
                    r: Math.floor(0 + factor * 60),
                    g: Math.floor(0),
                    b: Math.floor(0)
                };
            } else if (heatCurvedValue < 0.35) {
                // Very deep red to deep red
                const factor = (heatCurvedValue - 0.15) / 0.2;
                heatRGB = {
                    r: Math.floor(60 + factor * 100),
                    g: Math.floor(0 + factor * 20),
                    b: Math.floor(0)
                };
            } else if (heatCurvedValue < 0.55) {
                // Deep red to bright red
                const factor = (heatCurvedValue - 0.35) / 0.2;
                heatRGB = {
                    r: Math.floor(160 + factor * 95),
                    g: Math.floor(20 + factor * 70),
                    b: Math.floor(0)
                };
            } else if (heatCurvedValue < 0.75) {
                // Bright red to orange
                const factor = (heatCurvedValue - 0.55) / 0.2;
                heatRGB = {
                    r: Math.floor(255),
                    g: Math.floor(90 + factor * 120),
                    b: Math.floor(0 + factor * 50)
                };
            } else if (heatCurvedValue < 0.9) {
                // Orange to yellow
                const factor = (heatCurvedValue - 0.75) / 0.15;
                heatRGB = {
                    r: Math.floor(255),
                    g: Math.floor(210 + factor * 45),
                    b: Math.floor(50 + factor * 100)
                };
            } else {
                // Yellow to white
                const factor = (heatCurvedValue - 0.9) / 0.1;
                heatRGB = {
                    r: Math.floor(255),
                    g: Math.floor(255),
                    b: Math.floor(150 + factor * 105)
                };
            }
            colorCache.set(cacheKey, heatRGB);
            return heatRGB;
    }
}