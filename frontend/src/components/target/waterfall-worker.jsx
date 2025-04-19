// Cache for color mapping to improve performance
const colorCache = new Map();

// Main message handler
self.onmessage = function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'process-fft':
            const { fftData, width, colorMap, dbRange } = data;
            const processedRow = processFFTRow(fftData, width, colorMap, dbRange);
            self.postMessage({
                type: 'fft-processed',
                data: processedRow
            });
            break;

        // Could add more commands here in the future
        case 'clear-cache':
            colorCache.clear();
            self.postMessage({ type: 'cache-cleared' });
            break;

        default:
            self.postMessage({
                type: 'error',
                error: `Unknown command: ${type}`
            });
    }
};

// Process an FFT row and convert to pixel data
function processFFTRow(fftRow, canvasWidth, colorMap, dbRange) {
    const imageData = new Uint8ClampedArray(canvasWidth * 4);

    // Calculate a scaling factor to fit all frequency bins to canvas width
    const skipFactor = fftRow.length / canvasWidth;

    // Process each pixel in the row
    for (let x = 0; x < canvasWidth; x++) {
        // Map canvas pixel to the appropriate FFT bin using scaling
        const fftIndex = Math.min(Math.floor(x * skipFactor), fftRow.length - 1);
        const amplitude = fftRow[fftIndex];

        const rgb = getColorForPower(amplitude, colorMap, dbRange);

        // Each pixel uses 4 array positions (r,g,b,a)
        const pixelIndex = x * 4;
        imageData[pixelIndex] = rgb.r;     // R
        imageData[pixelIndex + 1] = rgb.g; // G
        imageData[pixelIndex + 2] = rgb.b; // B
        imageData[pixelIndex + 3] = 255;   // Alpha
    }

    return imageData;
}

// Get color based on power level and selected color map
function getColorForPower(powerDb, mapName, [minDb, maxDb]) {
    // Round the power value to reduce cache size (e.g., to the nearest 0.5 dB)
    const roundedPower = Math.round(powerDb * 2) / 2;

    // Create a cache key
    const cacheKey = `${roundedPower}-${mapName}-${minDb}-${maxDb}`;

    // Check if this color is already cached
    if (colorCache.has(cacheKey)) {
        return colorCache.get(cacheKey);
    }

    // If not in cache, calculate the color
    const normalizedValue = Math.max(0, Math.min(1, (roundedPower - minDb) / (maxDb - minDb)));

    // Apply selected color map
    let rgb;

    switch (mapName) {
        case 'viridis':
            rgb = {
                r: Math.floor(70 + 180 * normalizedValue),
                g: Math.floor(normalizedValue < 0.5 ? 70 + 180 * normalizedValue * 2 : 250 - 80 * (normalizedValue - 0.5) * 2),
                b: Math.floor(normalizedValue < 0.5 ? 130 + 120 * normalizedValue * 2 : 250 - 200 * (normalizedValue - 0.5) * 2)
            };
            break;

        case 'plasma':
            rgb = {
                r: Math.floor(20 + 230 * normalizedValue),
                g: Math.floor(normalizedValue < 0.7 ? 20 + 180 * normalizedValue / 0.7 : 200 - 150 * (normalizedValue - 0.7) / 0.3),
                b: Math.floor(normalizedValue < 0.5 ? 120 + 80 * normalizedValue / 0.5 : 200 - 200 * (normalizedValue - 0.5) / 0.5)
            };
            break;

        case 'inferno':
            rgb = {
                r: Math.floor(normalizedValue < 0.5 ? 20 + 200 * normalizedValue / 0.5 : 220 + 35 * (normalizedValue - 0.5) / 0.5),
                g: Math.floor(normalizedValue < 0.7 ? 10 + 120 * normalizedValue / 0.7 : 130 - 30 * (normalizedValue - 0.7) / 0.3),
                b: Math.floor(normalizedValue < 0.3 ? 40 + 80 * normalizedValue / 0.3 : 120 - 120 * (normalizedValue - 0.3) / 0.7)
            };
            break;

        case 'magma':
            rgb = {
                r: Math.floor(normalizedValue < 0.6 ? 30 + 170 * normalizedValue / 0.6 : 200 + 55 * (normalizedValue - 0.6) / 0.4),
                g: Math.floor(normalizedValue < 0.7 ? 10 + 140 * normalizedValue / 0.7 : 150 + 50 * (normalizedValue - 0.7) / 0.3),
                b: Math.floor(normalizedValue < 0.4 ? 100 + 70 * normalizedValue / 0.4 : 170 - 70 * (normalizedValue - 0.4) / 0.6)
            };
            break;

        case 'jet':
            if (normalizedValue < 0.125) {
                rgb = { r: 0, g: 0, b: Math.floor(normalizedValue * 8 * 255) };
            } else if (normalizedValue < 0.375) {
                rgb = { r: 0, g: Math.floor((normalizedValue - 0.125) * 4 * 255), b: 255 };
            } else if (normalizedValue < 0.625) {
                rgb = {
                    r: Math.floor((normalizedValue - 0.375) * 4 * 255),
                    g: 255,
                    b: Math.floor(255 - (normalizedValue - 0.375) * 4 * 255)
                };
            } else if (normalizedValue < 0.875) {
                rgb = {
                    r: 255,
                    g: Math.floor(255 - (normalizedValue - 0.625) * 4 * 255),
                    b: 0
                };
            } else {
                rgb = {
                    r: Math.floor(255 - (normalizedValue - 0.875) * 8 * 255),
                    g: 0,
                    b: 0
                };
            }
            break;

        default: // Default grayscale
            const intensity = Math.floor(normalizedValue * 255);
            rgb = { r: intensity, g: intensity, b: intensity };
    }

    // Cache the result
    colorCache.set(cacheKey, rgb);
    return rgb;
}