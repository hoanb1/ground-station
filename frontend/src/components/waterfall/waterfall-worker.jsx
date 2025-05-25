let waterfallCanvas = null;
let bandscopeCanvas = null;
let dBAxisCanvas = null;
let waterfallLeftMarginCanvas = null;
let waterfallCtx = null;
let bandscopeCtx = null;
let dBAxisCtx = null;
let waterFallLeftMarginCtx = null;
let renderIntervalId = null;
let targetFPS = 10;
let fftData = new Array(1024).fill(-120);
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
let bandscopeDrawInterval = 100;
let dottedLineImageData = null;
let rotatorEventQueue = [];
let lastTimestamp = new Date();

// Main message handler
self.onmessage = function(eventMessage) {
    const { cmd } = eventMessage.data;

    switch(cmd) {
        case 'initCanvas':
            waterfallCanvas = eventMessage.data.waterfallCanvas;
            bandscopeCanvas = eventMessage.data.bandscopeCanvas;
            dBAxisCanvas = eventMessage.data.dBAxisCanvas;
            waterfallLeftMarginCanvas = eventMessage.data.waterfallLeftMarginCanvas;
            waterfallCtx = waterfallCanvas.getContext('2d', { alpha: true, desynchronized: true, willReadFrequently: true });
            bandscopeCtx = bandscopeCanvas.getContext('2d', { alpha: true, desynchronized: true, willReadFrequently: true });
            dBAxisCtx = dBAxisCanvas.getContext('2d', { alpha: true, desynchronized: false, willReadFrequently: true });
            waterFallLeftMarginCtx = waterfallLeftMarginCanvas.getContext('2d', { alpha: true, desynchronized: true, willReadFrequently: true });
            setupCanvas(eventMessage.data.config);

            // Start monitoring when canvas is initialized
            startFftRateMonitoring();
            break;

        case 'start':
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

            // If we're set to immediate rendering, trigger a render now
            if (eventMessage.data.immediate) {
                renderWaterfall();
            }
            break;

        case 'updateConfig':
            // Update rendering configuration
            if (eventMessage.data.colorMap) {
                colorMap = eventMessage.data.colorMap;
            }
            if (eventMessage.data.dbRange) {
                dbRange = eventMessage.data.dbRange;
            }

            //console.info("worker config update", eventMessage.data.colorMap, eventMessage.data.dbRange);
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

        default:
            console.error('Unknown command:', cmd);
    }
};

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
    fftRateStartTime = Date.now();

    // Calculate and report rate every second
    fftRateIntervalId = setInterval(() => {
        const now = Date.now();
        const elapsedSeconds = (now - fftRateStartTime) / 1000;

        // Calculate rate (updates per second)
        fftUpdatesPerSecond = fftUpdateCount / elapsedSeconds;

        // Calculate bins per second
        binsPerSecond = binsUpdateCount / elapsedSeconds;

        // Report the rate to the main thread
        self.postMessage({
            type: 'metrics',
            data: {
                fftUpdatesPerSecond: parseFloat(fftUpdatesPerSecond.toFixed(1)),
                binsPerSecond: binsPerSecond,
                totalUpdates: fftUpdateCount,
                timeElapsed: elapsedSeconds,
            }
        });

        // Reset for next interval
        fftUpdateCount = 0;
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
    renderIntervalId = setInterval(() => renderWaterfall(), 1000 / targetFPS);

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

    // Scroll the existing content DOWN instead of UP
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

    for (let i = 0; i < fftData.length; i++) {
        // Map the FFT bin to a pixel position
        const x = Math.floor(i * waterfallCanvas.width / fftData.length);

        // Get the power level and normalize it to 0-1
        const power = Math.max(min, Math.min(max, fftData[i]));
        const normalized = (power - min) / range;

        // Calculate a scaling factor to fit all frequency bins to the available width
        const skipFactor = fftData.length / (waterfallCanvas.width);

        const fftIndex = Math.min(Math.floor(x * skipFactor), fftData.length - 1);
        const amplitude = fftData[fftIndex];

        let color = getColorForPower(
            amplitude,
            colorMap,
            dbRange,
        );

        // Set the pixel color
        const pixelIndex = x * 4;
        data[pixelIndex] = color.r;
        data[pixelIndex + 1] = color.g;
        data[pixelIndex + 2] = color.b;
        data[pixelIndex + 3] = 255; // Alpha
    }

    // Put the image data on the TOP row of the canvas instead of bottom
    waterfallCtx.putImageData(imageData, 0, 0);
}


function drawBandscope() {

    if (!bandscopeCanvas || fftData.length === 0) {
        return;
    }

    // Enable image smoothing (anti-aliasing)
    bandscopeCtx.imageSmoothingEnabled = true;
    bandscopeCtx.imageSmoothingQuality = 'high'; // Options: 'low', 'medium', 'high'

    // Enable image smoothing (anti-aliasing)
    dBAxisCtx.imageSmoothingEnabled = true;
    dBAxisCtx.imageSmoothingQuality = 'high'; // Options: 'low', 'medium', 'high'

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

    // Get the most recent FFT data
    const lastFFTData = fftData;

    // Draw the dB axis (y-axis)
    drawDbAxis(dBAxisCtx, width, height, dbRange);

    // Draw the FFT data as a line graph
    drawFftLine(bandscopeCtx, lastFFTData, width, height, dbRange);
}

function drawDbAxis(ctx, width, height, [minDb, maxDb]) {

    // Draw background for the axis area
    ctx.fillStyle = 'rgba(40, 40, 40, 0.7)';
    ctx.fillRect(0, 0, dBAxisCanvas.width, height);

    // Draw vertical line to separate axis from the plot
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
    ctx.beginPath();
    ctx.moveTo(dBAxisCanvas.width, 0);
    ctx.lineTo(dBAxisCanvas.width, height);
    ctx.stroke();

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
        case 'viridis':
            const viridisRGB = {
                r: Math.floor(0 + 230 * Math.pow(normalizedValue, 2.0)),
                g: Math.floor(normalizedValue < 0.5 ? 5 + 215 * Math.pow(normalizedValue * 2, 1.4) : 220 - 160 * Math.pow((normalizedValue - 0.5) * 2, 0.8)),
                b: Math.floor(normalizedValue < 0.5 ? 20 + 210 * Math.pow(normalizedValue * 2, 1.2) : 230 - 230 * Math.pow((normalizedValue - 0.5) * 2, 0.7))
            };
            colorCache.set(cacheKey, viridisRGB);
            return viridisRGB;
        case 'plasma':
            const plasmaRGB = {
                r: Math.floor(20 + 230 * normalizedValue),
                g: Math.floor(normalizedValue < 0.7 ? 20 + 180 * normalizedValue / 0.7 : 200 - 150 * (normalizedValue - 0.7) / 0.3),
                b: Math.floor(normalizedValue < 0.5 ? 120 + 80 * normalizedValue / 0.5 : 200 - 200 * (normalizedValue - 0.5) / 0.5)
            };
            colorCache.set(cacheKey, plasmaRGB);
            return plasmaRGB;
        case 'inferno':
            const infernoRGB = {
                r: Math.floor(normalizedValue < 0.5 ? 20 + 200 * normalizedValue / 0.5 : 220 + 35 * (normalizedValue - 0.5) / 0.5),
                g: Math.floor(normalizedValue < 0.7 ? 10 + 120 * normalizedValue / 0.7 : 130 - 30 * (normalizedValue - 0.7) / 0.3),
                b: Math.floor(normalizedValue < 0.3 ? 40 + 80 * normalizedValue / 0.3 : 120 - 120 * (normalizedValue - 0.3) / 0.7)
            };
            colorCache.set(cacheKey, infernoRGB);
            return infernoRGB;
        case 'magma':
            const magmaRGB = {
                r: Math.floor(normalizedValue < 0.6 ? 30 + 170 * normalizedValue / 0.6 : 200 + 55 * (normalizedValue - 0.6) / 0.4),
                g: Math.floor(normalizedValue < 0.7 ? 10 + 140 * normalizedValue / 0.7 : 150 + 50 * (normalizedValue - 0.7) / 0.3),
                b: Math.floor(normalizedValue < 0.4 ? 100 + 70 * normalizedValue / 0.4 : 170 - 70 * (normalizedValue - 0.4) / 0.6)
            };
            colorCache.set(cacheKey, magmaRGB);
            return magmaRGB;

        case 'websdr':
            // Custom WebSDR colormap with blue -> purple -> magenta -> yellow
            let websdrRGB;
            if (normalizedValue < 0.25) {
                // Dark blue to medium blue for very weak signals
                const factor = normalizedValue / 0.25;
                websdrRGB = {
                    r: 20 + Math.floor(factor * 40),
                    g: 20 + Math.floor(factor * 50),
                    b: 80 + Math.floor(factor * 100)
                };
            } else if (normalizedValue < 0.5) {
                // Medium blue to purple transition
                const factor = (normalizedValue - 0.25) / 0.25;
                websdrRGB = {
                    r: 60 + Math.floor(factor * 80),
                    g: 70 - Math.floor(factor * 20),
                    b: 180 + Math.floor(factor * 75)
                };
            } else if (normalizedValue < 0.7) {
                // Purple to bright magenta
                const factor = (normalizedValue - 0.5) / 0.2;
                websdrRGB = {
                    r: 140 + Math.floor(factor * 115),
                    g: 50 + Math.floor(factor * 40),
                    b: 255 - Math.floor(factor * 50)
                };
            } else if (normalizedValue < 0.85) {
                // Magenta to gold transition
                const factor = (normalizedValue - 0.7) / 0.15;
                websdrRGB = {
                    r: 255,
                    g: 90 + Math.floor(factor * 165),
                    b: 205 - Math.floor(factor * 205)
                };
            } else {
                // Gold to bright yellow for strongest signals
                const factor = (normalizedValue - 0.85) / 0.15;
                websdrRGB = {
                    r: 255,
                    g: 255,
                    b: Math.floor(factor * 130)
                };
            }
            colorCache.set(cacheKey, websdrRGB);
            return websdrRGB;

        case 'jet':
            // Classic jet colormap (blue -> cyan -> green -> yellow -> red)
            let jetRGB;
            if (normalizedValue < 0.125) {
                jetRGB = {r: 0, g: 0, b: Math.floor(normalizedValue * 8 * 255)};
            } else if (normalizedValue < 0.375) {
                jetRGB = {r: 0, g: Math.floor((normalizedValue - 0.125) * 4 * 255), b: 255};
            } else if (normalizedValue < 0.625) {
                jetRGB = {
                    r: Math.floor((normalizedValue - 0.375) * 4 * 255),
                    g: 255,
                    b: Math.floor(255 - (normalizedValue - 0.375) * 4 * 255)
                };
            } else if (normalizedValue < 0.875) {
                jetRGB = {r: 255, g: Math.floor(255 - (normalizedValue - 0.625) * 4 * 255), b: 0};
            } else {
                jetRGB = {r: Math.floor(255 - (normalizedValue - 0.875) * 8 * 255), g: 0, b: 0};
            }

            colorCache.set(cacheKey, jetRGB);
            return jetRGB;

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

    }
}