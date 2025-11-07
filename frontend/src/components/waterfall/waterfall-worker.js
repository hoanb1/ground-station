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
import { storeFFTDataInHistory, autoScaleDbRange } from './worker-modules/auto-scaling.js';
import {
    drawBandscope as drawBandscopeModule,
    updateWaterfallLeftMargin as updateWaterfallLeftMarginModule
} from './worker-modules/rendering.js';

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
let bandscopeTopPadding = 0;

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
            waterfallHistory = storeFFTDataInHistory(eventMessage.data.fft, waterfallHistory, maxHistoryLength);

            // Perform initial auto-scaling once we have enough data (3-5 frames)
            if (!hasPerformedInitialAutoScale && waterfallHistory.length >= 3) {
                console.log('Performing initial auto-scale with', waterfallHistory.length, 'frames of data');
                const result = autoScaleDbRange(waterfallHistory, autoScalePreset);
                if (result) {
                    dbRange = result.dbRange;
                    self.postMessage({
                        type: 'autoScaleResult',
                        data: result
                    });
                }
                hasPerformedInitialAutoScale = true;
            }

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

        case 'autoScaleDbRange': {
            // Trigger auto-scaling of dB range
            const result = autoScaleDbRange(waterfallHistory, autoScalePreset);
            if (result) {
                dbRange = result.dbRange;
                self.postMessage({
                    type: 'autoScaleResult',
                    data: result
                });
            }
            break;
        }

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

// Function to throttle bandscope drawing
function throttledDrawBandscope() {
    const now = Date.now();

    // Only draw if enough time has passed since the last draw
    if (now - lastBandscopeDrawTime >= bandscopeDrawInterval) {
        drawBandscopeModule({
            bandscopeCtx,
            bandscopeCanvas,
            fftData,
            smoothedFftData,
            dbRange,
            colorMap,
            theme,
            dBAxisCtx,
            dBAxisCanvas,
            bandscopeTopPadding
        });
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
    bandscopeTopPadding = config.bandscopeTopPadding || 0;

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

    // Update the left margin column using module
    const marginResult = updateWaterfallLeftMarginModule({
        waterFallLeftMarginCtx,
        waterfallLeftMarginCanvas,
        waterfallCanvas,
        waterfallCtx,
        rotatorEventQueue,
        showRotatorDottedLines,
        theme,
        lastTimestamp,
        dottedLineImageData
    });
    lastTimestamp = marginResult.lastTimestamp;
    dottedLineImageData = marginResult.dottedLineImageData;

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

