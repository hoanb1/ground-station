import * as satellite from 'satellite.js';
import {enqueueSnackbar} from "notistack";

/**
 * Calculates the latitude, longitude, altitude, and velocity of a satellite based on TLE data and date.
 *
 * @param {string} tleLine1 The first line of the two-line element set (TLE) describing the satellite's orbit.
 * @param {string} tleLine2 The second line of the two-line element set (TLE) describing the satellite's orbit.
 * @param {Date} date The date and time for which to calculate the satellite's position and velocity.
 * @return {Object|null} An object containing latitude (lat), longitude (lon), altitude, and velocity of the satellite.
 *                       Returns null if the satellite's position or velocity cannot be determined.
 */
export function getSatelliteLatLon(tleLine1, tleLine2, date) {
    try {
        const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
        const pv = satellite.propagate(satrec, date);
        if (!pv.position || !pv.velocity) return null;

        const gmst = satellite.gstime(date);
        const geo = satellite.eciToGeodetic(pv.position, gmst);

        const lat = satellite.degreesLat(geo.latitude);
        const lon = satellite.degreesLong(geo.longitude);
        const altitude = geo.height;

        const {x, y, z} = pv.velocity;
        const velocity = Math.sqrt(x * x + y * y + z * z);
        return [lat, lon, altitude, velocity];

    } catch (error) {
        console.error("Error calculating satellite position and velocity:", error);
        enqueueSnackbar("Error calculating satellite position and velocity: " + error.message, {
            variant: "error",
            autoHideDuration: 5000,
        });
        return [0, 0, 0, 0];
    }
}

/**
 * Returns an array of { lat, lon } points representing the satellite’s
 * coverage area on Earth (its horizon circle), adjusted so that if the area
 * includes the north or south pole, a vertex for that pole is inserted.
 *
 * @param {number} satLat - Satellite latitude in degrees.
 * @param {number} satLon - Satellite longitude in degrees.
 * @param {number} altitudeKm - Satellite altitude above Earth's surface in km.
 * @param {number} [numPoints=36] - Number of segments for the circle boundary.
 *                                  (The resulting array will have numPoints+1 points.)
 * @return {Array<{lat: number, lon: number}>} The polygon (in degrees) for the coverage area.
 */
export function getSatelliteCoverageCircle(satLat, satLon, altitudeKm, numPoints = 36) {
    // Mean Earth radius in kilometers (WGS-84 approximate)
    const R_EARTH = 6378.137;

    // Convert satellite subpoint to radians
    const lat0 = (satLat * Math.PI) / 180;
    const lon0 = (satLon * Math.PI) / 180;

    // Compute angular radius of the coverage circle (in radians)
    // d = arccos(R_EARTH / (R_EARTH + altitudeKm))
    const d = Math.acos(R_EARTH / (R_EARTH + altitudeKm));

    // Generate the circle points (closed polygon)
    const circlePoints = [];
    for (let i = 0; i <= numPoints; i++) {
        const theta = (2 * Math.PI * i) / numPoints;

        // Using spherical trigonometry to compute a point d away from (lat0,lon0)
        const lat_i = Math.asin(
            Math.sin(lat0) * Math.cos(d) +
            Math.cos(lat0) * Math.sin(d) * Math.cos(theta)
        );
        const lon_i = lon0 + Math.atan2(
            Math.sin(d) * Math.sin(theta) * Math.cos(lat0),
            Math.cos(d) - Math.sin(lat0) * Math.sin(lat_i)
        );

        // Convert back to degrees and normalize longitude to [-180, 180)
        const latDeg = (lat_i * 180) / Math.PI;
        let lonDeg = (lon_i * 180) / Math.PI;
        //lonDeg = ((lonDeg + 540) % 360) - 180;

        circlePoints.push({ lat: latDeg, lon: lonDeg });
    }

    // Adjust the polygon if it should include a pole.
    // Condition for north pole inclusion: the spherical cap extends beyond the north pole.
    // (That is, if d > (π/2 - lat0)). Similarly for the south pole: d > (π/2 + lat0) when lat0 is negative.
    let adjustedPoints = circlePoints.slice();

    // North pole case (for satellites in the northern hemisphere or whose cap covers the north)
    if (d > (Math.PI / 2 - lat0)) {
        // Find the index with the maximum latitude (the highest point in our computed circle)
        let maxIndex = 0, maxLat = -Infinity;
        for (let i = 0; i < circlePoints.length; i++) {
            if (circlePoints[i].lat > maxLat) {
                maxLat = circlePoints[i].lat;
                maxIndex = i;
            }
        }
        // Insert the north pole as an extra vertex immediately after the highest point.
        // (Using the same longitude as that highest point.)
        adjustedPoints = [
            { lat: 90, lon: circlePoints[0].lon },
            ...circlePoints.slice(0, maxIndex + 1),
            ...circlePoints.slice(maxIndex + 1),
            { lat: 90, lon: circlePoints[circlePoints.length - 1].lon },
        ];
    }

    // South pole case (for satellites in the southern hemisphere or whose cap covers the south)
    if (d > (Math.PI / 2 + lat0)) {
        // Find the index with the minimum latitude (the lowest point in our computed circle)
        let minIndex = 0, minLat = Infinity;
        for (let i = 0; i < circlePoints.length; i++) {
            if (circlePoints[i].lat < minLat) {
                minLat = circlePoints[i].lat;
                minIndex = i;
            }
        }
        // Insert the south pole as an extra vertex immediately after the lowest point.
        adjustedPoints = [
            ...adjustedPoints.slice(0, minIndex + 1),
            { lat: -90, lon: circlePoints[minIndex].lon },
            { lat: -90, lon: circlePoints[minIndex + 1].lon },
            ...adjustedPoints.slice(minIndex + 1),
        ];
    }

    return adjustedPoints;
}
// Make sure satellite.js is imported, e.g.,
// const satellite = require('satellite.js');

/**
 * Normalizes a longitude value to be within -180 to 180 degrees.
 * @param {number} lon - The longitude in degrees.
 * @returns {number} - The normalized longitude.
 */
export function normalizeLongitude(lon) {
    while (lon > 180) {
        lon -= 360;
    }
    while (lon < -180) {
        lon += 360;
    }
    return lon;
}

/**
 * Splits an array of points into segments so that no segment contains a jump
 * greater than 180 degrees in longitude.
 *
 * @param {Array} points - An array of objects of the form {lat, lon}.
 * @returns {Array} - Either an array of points (if only one segment exists) or an array of segments.
 */
export function splitAtDateline(points) {
    if (points.length === 0) return points;
    const segments = [];
    let currentSegment = [points[0]];

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        // Because our points are normalized, a jump of more than 180 degrees
        // indicates a crossing of the dateline.
        if (Math.abs(curr.lon - prev.lon) > 180) {
            // End the current segment and start a new one.
            segments.push(currentSegment);
            currentSegment = [curr];
        } else {
            currentSegment.push(curr);
        }
    }
    segments.push(currentSegment);
    // If there is only one segment, return it directly; otherwise return the segments.
    return segments.length === 1 ? segments[0] : segments;
}

/**
 * Computes the satellite's past and future path coordinates from its TLE.
 * The path is computed at a fixed time step and then split into segments so that
 * no segment contains a line crossing the dateline (+180 or -180 longitude).
 *
 * @param {Array} tle - An array containing two TLE lines [line1, line2].
 * @param {number} durationMinutes - The projection duration (in minutes) for both past and future.
 * @param {number} [stepMinutes=1] - (Optional) The time interval in minutes between coordinate samples.
 * @returns {Object} An object with two properties:
 *                   { past: [{lat, lon}] or [[{lat, lon}], ...],
 *                     future: [{lat, lon}] or [[{lat, lon}], ...] }
 */
export function getSatellitePaths(tle, durationMinutes, stepMinutes = 1) {
    try {
        // Create a satellite record from the provided TLE
        const satrec = satellite.twoline2satrec(tle[0], tle[1]);
        const now = new Date();
        const pastPoints = [];
        const futurePoints = [];
        const stepMs = stepMinutes * 60 * 1000;

        // Compute past points: from (now - durationMinutes) up to now (inclusive)
        for (let t = now.getTime() - durationMinutes * 60 * 1000; t <= now.getTime(); t += stepMs) {
            const time = new Date(t);
            const { position } = satellite.propagate(satrec, time);
            if (position) {
                const gmst = satellite.gstime(time);
                const posGd = satellite.eciToGeodetic(position, gmst);
                let lon = normalizeLongitude(satellite.degreesLong(posGd.longitude));
                const lat = satellite.degreesLat(posGd.latitude);
                pastPoints.push({ lat, lon });
            }
        }

        // Compute future points: from now up to (now + durationMinutes) (inclusive)
        for (let t = now.getTime(); t <= now.getTime() + durationMinutes * 60 * 1000; t += stepMs) {
            const time = new Date(t);
            const { position } = satellite.propagate(satrec, time);
            if (position) {
                const gmst = satellite.gstime(time);
                const posGd = satellite.eciToGeodetic(position, gmst);
                let lon = normalizeLongitude(satellite.degreesLong(posGd.longitude));
                const lat = satellite.degreesLat(posGd.latitude);
                futurePoints.push({ lat, lon });
            }
        }

        // Split the past and future arrays into segments to avoid drawing lines across the dateline.
        const past = splitAtDateline(pastPoints);
        const future = splitAtDateline(futurePoints);

        return { past, future };
    } catch (error) {
        console.error("Error computing satellite paths:", error);
        enqueueSnackbar("Error computing satellite paths: " + error.message, {
            variant: "error",
            autoHideDuration: 5000,
        });
        return { past: [], future: [] };
    }
}

/**
 * Determines whether a satellite is geostationary based on its TLE.
 * @param {string[]} tle - An array of two TLE lines [line1, line2].
 * @returns {boolean} - True if the orbit is approximately geostationary, false otherwise.
 */
function isGeostationary(tle) {
    if (!Array.isArray(tle) || tle.length < 2) {
        throw new Error("TLE must be an array containing two lines of valid TLE data.");
    }

    const line2 = tle[1];

    // Each field in Line 2 has a fixed position (character index). Refer to the TLE format.
    // - Inclination (degrees):    columns 8-15
    // - RA of ascending node:     columns 17-24
    // - Eccentricity:            columns 26-32 (decimal point is implied at the start)
    // - Argument of perigee:     columns 34-41
    // - Mean anomaly:            columns 43-50
    // - Mean motion (rev/day):   columns 52-62
    // - Revolution number:       columns 63-68 (not used here)

    const inclinationDeg = parseFloat(line2.substring(8, 16));
    // Eccentricity is typically given as an integer with an implied decimal point at the beginning.
    // For example, "0000457" means 0.0000457
    const eccentricityStr = line2.substring(26, 33);
    const eccentricity = parseFloat(`0.${eccentricityStr}`);
    const meanMotion = parseFloat(line2.substring(52, 63));

    // Typical checks for geostationary orbit:
    // 1. Mean motion ~ 1 revolution per sidereal day ≈ 1.0027 rev/day
    //    Here we allow a small range around 1.0–1.0027 for tolerance.
    // 2. Inclination close to 0° (must be near the equator)
    // 3. Eccentricity near 0 (circular orbit)

    // Define thresholds (can be tweaked depending on desired strictness)
    const meanMotionLower = 0.995;    // Lower bound on mean motion
    const meanMotionUpper = 1.005;    // Upper bound on mean motion
    const inclinationMax   = 3.0;     // Degrees (allow small inclination for station-keeping)
    const eccentricityMax  = 0.01;    // Allow small eccentricity

    const isMeanMotionOK   = meanMotion >= meanMotionLower && meanMotion <= meanMotionUpper;
    const isInclinationOK  = inclinationDeg <= inclinationMax;
    const isEccentricityOK = eccentricity <= eccentricityMax;

    return isMeanMotionOK && isInclinationOK && isEccentricityOK;
}


/**
 * Checks if the satellite (from its TLE) is over a given latitude/longitude at a specified time.
 *
 * @param {string[]} tle - Array of two lines [line1, line2] containing the satellite's TLE.
 * @param {Date} date - The date/time at which to check the satellite's position.
 * @param {number} targetLat - Target latitude in degrees (negative for south).
 * @param {number} targetLon - Target longitude in degrees (negative for west).
 * @param {number} thresholdKm - Distance threshold in kilometers (default=500).
 *                              The satellite is considered "over" the location if
 *                              it is within this distance on Earth's surface.
 * @returns {boolean} True if the satellite is within thresholdKm of the specified location.
 */
function isSatelliteOverLocation(tle, date, targetLat, targetLon, thresholdKm = 500) {
    if (!Array.isArray(tle) || tle.length < 2) {
        throw new Error("TLE must be an array with two lines of data.");
    }

    // 1) Parse TLE with satellite.js => satrec object
    const satrec = satellite.twoline2satrec(tle[0], tle[1]);

    // 2) Propagate orbit to given date/time
    const positionAndVelocity = satellite.propagate(satrec, date);
    const positionEci = positionAndVelocity.position; // { x, y, z } in km

    if (!positionEci) {
        // If propagation failed (e.g., TLE out of date), positionEci might be undefined
        return false;
    }

    // 3) Get GMST (Greenwich Mean Sidereal Time) for coordinate transforms
    const gmst = satellite.gstime(date);

    // 4) Convert ECI position to geodetic coordinates (lat/long/height)
    const geodeticCoords = satellite.eciToGeodetic(positionEci, gmst);
    const satLat = satellite.degreesLat(geodeticCoords.latitude);
    const satLon = satellite.degreesLong(geodeticCoords.longitude);

    // 5) Calculate the ground distance between (satLat, satLon) and (targetLat, targetLon)
    const distance = calculateGreatCircleDistance(satLat, satLon, targetLat, targetLon);

    // 6) Compare distance with threshold
    return distance <= thresholdKm;
}

/**
 * Calculate the great-circle distance between two lat/lon points on Earth (in km).
 * Uses the haversine formula.
 *
 * @param {number} lat1 - Latitude of point 1 (in degrees).
 * @param {number} lon1 - Longitude of point 1 (in degrees).
 * @param {number} lat2 - Latitude of point 2 (in degrees).
 * @param {number} lon2 - Longitude of point 2 (in degrees).
 * @returns {number} Distance in kilometers.
 */
function calculateGreatCircleDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Approx Earth radius in km

    // Convert degrees to radians
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const radLat1 = toRadians(lat1);
    const radLat2 = toRadians(lat2);

    // Haversine formula
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(radLat1) * Math.cos(radLat2)
        * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRadians(deg) {
    return deg * (Math.PI / 180);
}
