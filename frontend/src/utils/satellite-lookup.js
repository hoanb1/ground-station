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

import satelliteLookupData from '../data/satellite-norad-lookup.json';

// Extract the satellites object from the JSON structure
const satelliteLookup = satelliteLookupData.satellites;

/**
 * Extract the base callsign from a full callsign by removing SSID suffix
 * Example: TVL2-6-1 -> TVL2-6
 * @param {string} callsign - Full callsign with potential SSID
 * @returns {string} Base callsign without SSID
 */
export function extractBaseCallsign(callsign) {
    if (!callsign) return null;

    // Remove trailing -X or -XX where X is a digit
    // This handles patterns like TVL2-6-1, TVL2-6-0, etc.
    const match = callsign.match(/^(.+)-\d+$/);
    if (match) {
        return match[1].toUpperCase();
    }

    return callsign.toUpperCase();
}

/**
 * Look up NORAD ID by callsign
 * @param {string} callsign - Satellite callsign (e.g., "TVL2-6-1" or "TEVEL2-6")
 * @returns {number|null} NORAD ID or null if not found
 */
export function getNoradFromCallsign(callsign) {
    if (!callsign) return null;

    // Try exact match first (uppercase)
    const exactMatch = satelliteLookup[callsign.toUpperCase()];
    if (exactMatch) return exactMatch;

    // Try base callsign without SSID
    const baseCallsign = extractBaseCallsign(callsign);
    if (baseCallsign && satelliteLookup[baseCallsign]) {
        return satelliteLookup[baseCallsign];
    }

    return null;
}

/**
 * Get satellite name from NORAD ID
 * @param {number} noradId - NORAD ID
 * @returns {string|null} Satellite name or null if not found
 */
export function getSatelliteNameFromNorad(noradId) {
    if (!noradId) return null;

    for (const [name, id] of Object.entries(satelliteLookup)) {
        if (id === noradId) {
            return name;
        }
    }

    return null;
}

/**
 * Get full satellite info from callsign
 * @param {string} callsign - Satellite callsign
 * @returns {{noradId: number|null, baseCallsign: string|null, satelliteName: string|null}}
 */
export function getSatelliteInfoFromCallsign(callsign) {
    const baseCallsign = extractBaseCallsign(callsign);
    const noradId = getNoradFromCallsign(callsign);
    const satelliteName = noradId ? getSatelliteNameFromNorad(noradId) : null;

    return {
        noradId,
        baseCallsign,
        satelliteName
    };
}
