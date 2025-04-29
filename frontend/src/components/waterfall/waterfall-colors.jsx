// Get color based on power level and selected color map
export const getColorForPower = (powerDb, mapName, [minDb, maxDb], colorCache) => {
    // Round the power value to reduce cache size (e.g., to the nearest 0.5 dB)
    const roundedPower = Math.round(powerDb * 2) / 2;

    // Create a cache key
    const cacheKey = `${roundedPower}-${mapName}-${minDb}-${maxDb}`;

    // Check if this color is already cached
    if (colorCache.current.has(cacheKey)) {
        return colorCache.current.get(cacheKey);
    }

    // If not in cache, calculate the color
    const normalizedValue = Math.max(0, Math.min(1, (roundedPower - minDb) / (maxDb - minDb)));

    // apply selected color map
    switch (mapName) {
        case 'viridis':
            const viridisRGB = {
                r: Math.floor(0 + 230 * Math.pow(normalizedValue, 2.0)),
                g: Math.floor(normalizedValue < 0.5 ? 5 + 215 * Math.pow(normalizedValue * 2, 1.4) : 220 - 160 * Math.pow((normalizedValue - 0.5) * 2, 0.8)),
                b: Math.floor(normalizedValue < 0.5 ? 20 + 210 * Math.pow(normalizedValue * 2, 1.2) : 230 - 230 * Math.pow((normalizedValue - 0.5) * 2, 0.7))
            };
            colorCache.current.set(cacheKey, viridisRGB);
            return viridisRGB;
        case 'plasma':
            const plasmaRGB = {
                r: Math.floor(20 + 230 * normalizedValue),
                g: Math.floor(normalizedValue < 0.7 ? 20 + 180 * normalizedValue / 0.7 : 200 - 150 * (normalizedValue - 0.7) / 0.3),
                b: Math.floor(normalizedValue < 0.5 ? 120 + 80 * normalizedValue / 0.5 : 200 - 200 * (normalizedValue - 0.5) / 0.5)
            };
            colorCache.current.set(cacheKey, plasmaRGB);
            return plasmaRGB;
        case 'inferno':
            const infernoRGB = {
                r: Math.floor(normalizedValue < 0.5 ? 20 + 200 * normalizedValue / 0.5 : 220 + 35 * (normalizedValue - 0.5) / 0.5),
                g: Math.floor(normalizedValue < 0.7 ? 10 + 120 * normalizedValue / 0.7 : 130 - 30 * (normalizedValue - 0.7) / 0.3),
                b: Math.floor(normalizedValue < 0.3 ? 40 + 80 * normalizedValue / 0.3 : 120 - 120 * (normalizedValue - 0.3) / 0.7)
            };
            colorCache.current.set(cacheKey, infernoRGB);
            return infernoRGB;
        case 'magma':
            const magmaRGB = {
                r: Math.floor(normalizedValue < 0.6 ? 30 + 170 * normalizedValue / 0.6 : 200 + 55 * (normalizedValue - 0.6) / 0.4),
                g: Math.floor(normalizedValue < 0.7 ? 10 + 140 * normalizedValue / 0.7 : 150 + 50 * (normalizedValue - 0.7) / 0.3),
                b: Math.floor(normalizedValue < 0.4 ? 100 + 70 * normalizedValue / 0.4 : 170 - 70 * (normalizedValue - 0.4) / 0.6)
            };
            colorCache.current.set(cacheKey, magmaRGB);
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
            colorCache.current.set(cacheKey, websdrRGB);
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

            colorCache.current.set(cacheKey, jetRGB);
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

            colorCache.current.set(cacheKey, cosmicRGB);
            return cosmicRGB;

        case 'greyscale':
            // Modified grayscale with darker low intensity
            // Apply a power curve to make low intensities darker
            const curvedValue = Math.pow(normalizedValue, 2.0); // Power > 1 makes darker low values
            const intensity = Math.floor(curvedValue * 255);
            const greyRGB = {r: intensity, g: intensity, b: intensity};
            colorCache.current.set(cacheKey, greyRGB);
            return greyRGB;

    }
}