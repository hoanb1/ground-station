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
 * Auto-scaling logic for dynamic dB range adjustment
 */

/**
 * Store FFT data in history for auto-scaling
 * @param {Array<number>} newFftData - New FFT data
 * @param {Array<Array<number>>} waterfallHistory - History of waterfall data
 * @param {number} maxHistoryLength - Maximum history length
 * @returns {Array<Array<number>>} Updated history
 */
export function storeFFTDataInHistory(newFftData, waterfallHistory, maxHistoryLength) {
    // Add new FFT data to history
    waterfallHistory.push([...newFftData]);

    // Keep only the last N frames for analysis
    if (waterfallHistory.length > maxHistoryLength) {
        waterfallHistory.shift();
    }

    return waterfallHistory;
}

/**
 * Auto-scale dB range based on waterfall history
 * @param {Array<Array<number>>} waterfallHistory - History of waterfall data
 * @param {string} preset - 'strong', 'medium', or 'weak'
 * @returns {Object} New dB range and statistics
 */
export function autoScaleDbRange(waterfallHistory, preset = 'medium') {
    if (waterfallHistory.length === 0) {
        return null;
    }

    // Flatten all FFT data into a single array for analysis
    const allValues = waterfallHistory.flat();

    // Sort values for percentile calculation
    const sortedValues = allValues.slice().sort((a, b) => a - b);

    // Calculate percentiles based on preset
    let minPercentile, maxPercentile;

    switch (preset) {
        case 'strong':
            // Strong: Very tight range, 10-90th percentile
            // Good for seeing fine details, may clip strong signals
            minPercentile = 0.10;
            maxPercentile = 0.90;
            break;

        case 'medium':
            // Medium: Balanced range, 5-95th percentile
            // Good general purpose, shows most signals
            minPercentile = 0.05;
            maxPercentile = 0.95;
            break;

        case 'weak':
            // Weak: Wide range, 2-98th percentile
            // Shows full dynamic range, may compress weak signals
            minPercentile = 0.02;
            maxPercentile = 0.98;
            break;

        default:
            minPercentile = 0.05;
            maxPercentile = 0.95;
    }

    const minIndex = Math.floor(sortedValues.length * minPercentile);
    const maxIndex = Math.floor(sortedValues.length * maxPercentile);

    let minDb = sortedValues[minIndex];
    let maxDb = sortedValues[maxIndex];

    // Ensure minimum range of 10 dB
    if (maxDb - minDb < 10) {
        const center = (minDb + maxDb) / 2;
        minDb = center - 5;
        maxDb = center + 5;
    }

    // Round to nearest 5 dB for cleaner display
    minDb = Math.round(minDb / 5) * 5;
    maxDb = Math.round(maxDb / 5) * 5;

    // Calculate some statistics for debugging
    const mean = allValues.reduce((sum, val) => sum + val, 0) / allValues.length;
    const median = sortedValues[Math.floor(sortedValues.length / 2)];

    return {
        dbRange: [minDb, maxDb],
        stats: {
            mean: mean.toFixed(2),
            median: median.toFixed(2),
            min: sortedValues[0].toFixed(2),
            max: sortedValues[sortedValues.length - 1].toFixed(2),
            samples: allValues.length,
            preset
        }
    };
}
