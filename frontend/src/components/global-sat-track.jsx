import React, { useState, useEffect } from 'react';
import { SatelliteAlt } from '@mui/icons-material';
import { renderToStaticMarkup } from 'react-dom/server';
import { Responsive, WidthProvider } from 'react-grid-layout';
import {
    MapContainer,
    TileLayer,
    Marker,
    Circle,
    CircleMarker,
    Polyline,
    Polygon,
    useMap, Popup,
    Tooltip,
} from 'react-leaflet';
import * as d3 from "d3";
import L from 'leaflet';
import * as satellite from 'satellite.js';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'leaflet/dist/leaflet.css';
import Paper from "@mui/material/Paper";
import {styled} from "@mui/material/styles";
import createTerminatorLine from './terminator.jsx';
import {getSunMoonCoords} from "./sunmoon.jsx";
import {moonIcon, sunIcon, homeIcon, satelliteIcon} from './icons.jsx';
import TLEs from './tles.jsx';
import {Satellite} from './satellite.jsx';
import {geoProject} from 'd3-geo-projection';

const TitleBar = styled(Paper)(({ theme }) => ({
    width: '100%',
    height: '30px',
    padding: '3px',
    ...theme.typography.body2,
    textAlign: 'center',
}));

const ThemedLeafletTooltip = styled(Tooltip)(({ theme }) => ({
    color: theme.palette.text.primary,
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    borderColor: theme.palette.background.paper,
}));

const coverageRadius = 2250000; // about 2250 km
const gridLayoutStoreName = 'global-sat-track-layouts';

// -------------------------------------------------
// 1) Leaflet icon path fix for React
// -------------------------------------------------
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png'
});

const ResponsiveGridLayout = WidthProvider(Responsive);


// -------------------------------------------------
// 2) Convert MUI SatelliteAlt icon to a Leaflet icon (optional)
// -------------------------------------------------
const iconSvgString = renderToStaticMarkup(<SatelliteAlt style={{ fontSize: 32 }} />);
const materialSatelliteIcon = L.icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(iconSvgString),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});

// -------------------------------------------------
// 3) TLE for ISS and example "Home" location
// -------------------------------------------------
const TLE_LINE_1 =
    '1 25544U 98067A   25057.69551956  .00051272  00000-0  91556-3 0  9991';
const TLE_LINE_2 =
    '2 25544  51.6387 134.2889 0005831 315.8203 179.6729 15.49515680498024';

const HOME_LAT = 40.6293;
const HOME_LON = 22.9474;

// -------------------------------------------------
// 4) Load / Save layouts from localStorage
// -------------------------------------------------
function loadLayoutsFromLocalStorage() {
    try {
        const raw = localStorage.getItem(gridLayoutStoreName);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveLayoutsToLocalStorage(layouts) {
    localStorage.setItem(gridLayoutStoreName, JSON.stringify(layouts));
}

// Default layout if none in localStorage
const defaultLayouts = {
    lg: [
        {
            i: 'map',
            x: 0,
            y: 0,
            w: 6,
            h: 14,
            resizeHandles: ['se','ne','nw','sw','n','s','e','w']
        },
        {
            i: 'info',
            x: 6,
            y: 0,
            w: 3,
            h: 14,
            resizeHandles: ['se','ne','nw','sw','n','s','e','w']
        },
        {
            i: 'passes',
            x: 9,
            y: 0,
            w: 3,
            h: 14,
            resizeHandles: ['se','ne','nw','sw','n','s','e','w']
        }
    ]
};


/**
 * Calculates the latitude, longitude, altitude, and velocity of a satellite based on TLE data and date.
 *
 * @param {string} tleLine1 The first line of the two-line element set (TLE) describing the satellite's orbit.
 * @param {string} tleLine2 The second line of the two-line element set (TLE) describing the satellite's orbit.
 * @param {Date} date The date and time for which to calculate the satellite's position and velocity.
 * @return {Object|null} An object containing latitude (lat), longitude (lon), altitude, and velocity of the satellite.
 *                       Returns null if the satellite's position or velocity cannot be determined.
 */
function getSatelliteLatLon(tleLine1, tleLine2, date) {

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
}
/**
 * Returns an array of { lat, lon } points representing the coverage
 * circle on Earth from a satellite at (satLat, satLon, altitude).
 *
 * @param {number} satLat - Satellite latitude in degrees.
 * @param {number} satLon - Satellite longitude in degrees.
 * @param {number} altitudeKm - Satellite altitude above Earth's surface in kilometers.
 * @param {number} [numPoints=36] - Number of segments for the circle boundary.
 *                                  The returned array will contain numPoints+1 points,
 *                                  with the last point equal to the first.
 * @return {Array<{lat: number, lon: number}>} List of lat/lon points (in degrees) forming a closed circle.
 */
function getSatelliteCoverageCircle(satLat, satLon, altitudeKm, numPoints = 36) {
    // Mean Earth radius in kilometers (WGS-84 approximate)
    const R_EARTH = 6378.137;

    // Convert input satellite lat/lon to radians
    const lat0 = (satLat * Math.PI) / 180;
    const lon0 = (satLon * Math.PI) / 180;

    // Compute the angular radius of the coverage circle:
    // coverageAngle = arccos(R_EARTH / (R_EARTH + altitudeKm))
    const coverageAngle = Math.acos(R_EARTH / (R_EARTH + altitudeKm));

    // Array to hold our coverage boundary points
    const coveragePoints = [];

    // Loop from 0 to numPoints (inclusive) to ensure a closed circle
    for (let i = 0; i <= numPoints; i++) {
        // Azimuth angle (θ) from 0 to 2π
        const theta = (2 * Math.PI * i) / numPoints;

        // Calculate latitude of the point on the coverage circle:
        //   lat_i = arcsin( sin(lat0)*cos(coverageAngle) + cos(lat0)*sin(coverageAngle)*cos(theta) )
        const lat_i = Math.asin(
            Math.sin(lat0) * Math.cos(coverageAngle) +
            Math.cos(lat0) * Math.sin(coverageAngle) * Math.cos(theta)
        );

        // Calculate longitude of the point on the coverage circle:
        //   lon_i = lon0 + atan2( sin(coverageAngle)*sin(theta)*cos(lat0),
        //                         cos(coverageAngle) - sin(lat0)*sin(lat_i) )
        const lon_i =
            lon0 +
            Math.atan2(
                Math.sin(coverageAngle) * Math.sin(theta) * Math.cos(lat0),
                Math.cos(coverageAngle) - Math.sin(lat0) * Math.sin(lat_i)
            );

        // Convert radians back to degrees
        const latDeg = (lat_i * 180) / Math.PI;
        let lonDeg = (lon_i * 180) / Math.PI;
        // Normalize longitude to [-180, 180)
        //lonDeg = ((lonDeg + 540) % 360) - 180;

        coveragePoints.push({ lat: latDeg, lon: lonDeg });
    }

    return coveragePoints;
}


/**
 * Projects latitude and longitude to Web Mercator coordinates.
 * This uses the common Web Mercator (EPSG:3857) projection.
 *
 * @param {number} lat - Latitude in degrees.
 * @param {number} lon - Longitude in degrees.
 * @returns {{x: number, y: number}} The Mercator projected coordinates.
 */
function projectToMercator(lat, lon) {
    const R = 6378137; // Earth's radius in meters for Web Mercator
    const x = (lon * Math.PI / 180) * R;
    const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
    return { x, y };
}

/**
 * Checks if an array of lat/lon coordinates represents a closed circle
 * when projected on a Mercator projection.
 * It compares the projected first and last points within a small tolerance.
 *
 * @param {Array<{lat: number, lon: number}>} coordinates - Array of lat/lon coordinates.
 * @param {number} [tolerance=1e-6] - Tolerance (in meters) for considering two points as identical.
 * @returns {boolean} True if the first and last projected points are nearly identical.
 */
function isCircleClosedOnMercator(coordinates, tolerance = 1e-6) {
    if (coordinates.length < 2) {
        return false; // Not enough points to form a circle.
    }

    const first = projectToMercator(coordinates[0].lat, coordinates[0].lon);
    const last = projectToMercator(
        coordinates[coordinates.length - 1].lat,
        coordinates[coordinates.length - 1].lon
    );

    const dx = Math.abs(first.x - last.x);
    const dy = Math.abs(first.y - last.y);

    return dx < tolerance && dy < tolerance;
}


/**
 * Adjusts the given set of geographical coordinates to close open circles on a Mercator map projection.
 * If the coordinates represent points in the northern hemisphere, the circle is closed by adding points at the North Pole.
 * If the coordinates are in the southern hemisphere, the circle is closed by adding points at the South Pole.
 *
 * @param {Array<Object>} coordinates - An array of coordinate objects, where each object contains `lat` (latitude) and `lon` (longitude) properties.
 * @return {Array<Object>} The modified array of coordinates with additional points to close the circle.
 */
function correctOpenCirclesOnMercator(coordinates) {

    if (coordinates[0].lat > 0) {
        coordinates.push({lat: 90, lon: coordinates[coordinates.length - 1].lon});
        coordinates.unshift({lat: 90, lon: coordinates[0].lon});
    } else {
        coordinates.push({lat: -90, lon: coordinates[coordinates.length - 1].lon});
        coordinates.unshift({lat: -90, lon: coordinates[0].lon});
    }
    return coordinates;
}


/**
 * Detects if there is a dominant line in a set of 2D points using RANSAC.
 *
 * @param {Array<{x: number, y: number}>} points - Array of point objects with x,y properties.
 * @param {Object} [options]
 * @param {number} [options.iterations=1000] - Number of RANSAC iterations.
 * @param {number} [options.distanceThreshold=0.1] - Max distance from line to be considered an inlier.
 * @param {number} [options.minInliers=5] - Minimum number of inliers required to consider it a valid line.
 * @returns {Object|null} - If a line is found, returns an object with:
 *   {
 *     start: {x, y},
 *     end: {x, y},
 *     inliers: Array of points belonging to that line,
 *     line: { a, b, c }  // line equation ax + by + c = 0
 *   }
 *   Otherwise returns null if no sufficient line is found.
 */
function ransacLineDetection(points, {
    iterations = 1000,
    distanceThreshold = 0.1,
    minInliers = 5
} = {}) {
    if (points.length < 2) {
        return null; // Need at least two points to define a line
    }

    // Helper to compute distance from a point to line ax + by + c = 0
    function distanceToLine(a, b, c, x, y) {
        return Math.abs(a * x + b * y + c) / Math.sqrt(a * a + b * b);
    }

    // Keep track of the best line so far
    let bestLine = null;       // Will store {a, b, c}
    let bestInliersCount = 0;
    let bestInliers = [];

    for (let i = 0; i < iterations; i++) {
        // 1. Randomly pick two distinct points
        const idx1 = Math.floor(Math.random() * points.length);
        let idx2 = Math.floor(Math.random() * points.length);
        // Ensure idx2 != idx1
        while (idx2 === idx1) {
            idx2 = Math.floor(Math.random() * points.length);
        }

        const p1 = points[idx1];
        const p2 = points[idx2];

        // Edge case: if x2 ~ x1, define a vertical line x = constant
        let a, b, c;
        if (Math.abs(p2.x - p1.x) < 1e-12) {
            // line: x = p1.x => 1*x + 0*y - p1.x = 0
            a = 1;
            b = 0;
            c = -p1.x;
        } else {
            // 2. Fit line in form: a x + b y + c = 0
            // Using slope-intercept => slope = (y2 - y1)/(x2 - x1)
            // Then line is slope*x - y + intercept = 0
            const slope = (p2.y - p1.y) / (p2.x - p1.x);
            const intercept = p1.y - slope * p1.x;
            // Convert y = slope*x + intercept to a x + b y + c = 0:
            // => slope*x - y + intercept = 0
            a = slope;
            b = -1;
            c = intercept;
        }

        // 3. Count how many points are inliers
        const inliers = [];
        for (const pt of points) {
            const dist = distanceToLine(a, b, c, pt.x, pt.y);
            if (dist < distanceThreshold) {
                inliers.push(pt);
            }
        }

        // 4. Check if this is the best so far
        if (inliers.length > bestInliersCount) {
            bestInliersCount = inliers.length;
            bestLine = { a, b, c };
            bestInliers = inliers;
        }
    }

    // If not enough inliers, no valid line found
    if (!bestLine || bestInliersCount < minInliers) {
        return null;
    }

    // 5. Determine start and end of the line segment using the inliers
    //    We can do this by projecting inliers onto the direction vector of the line.
    //    The direction vector can be taken from any two inliers, e.g., from the first two inliers.
    //    Then find min and max projections.
    const [first, second] = bestInliers;
    // If we don't have at least two distinct inliers, we can't define a segment
    if (!second) {
        return null;
    }

    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const dirLen = Math.sqrt(dx * dx + dy * dy);
    if (dirLen < 1e-12) {
        return null;
    }

    // Unit direction vector
    const ux = dx / dirLen;
    const uy = dy / dirLen;

    // Project each inlier onto the direction
    let minProj = Infinity, maxProj = -Infinity;
    let minPoint = null, maxPoint = null;

    // We'll choose the first inlier as a reference anchor (x0,y0)
    const x0 = first.x;
    const y0 = first.y;

    for (const pt of bestInliers) {
        // Vector from reference to current
        const vx = pt.x - x0;
        const vy = pt.y - y0;
        // Dot product with direction => param along the line
        const proj = vx * ux + vy * uy;

        if (proj < minProj) {
            minProj = proj;
            minPoint = pt;
        }
        if (proj > maxProj) {
            maxProj = proj;
            maxPoint = pt;
        }
    }

    // minPoint and maxPoint define the line segment
    return {
        start: minPoint,
        end: maxPoint,
        inliers: bestInliers,
        line: bestLine  // { a, b, c } => line eqn a*x + b*y + c = 0
    };
}





function GlobalSatelliteTrack() {
    const [groupSatellites, setGroupSatellites] = useState({});
    const [currentSatellitesPosition, setCurrentSatellitesPosition] = useState([]);
    const [currentSatellitesCoverage, setCurrentSatellitesCoverage] = useState([]);
    const [terminatorLine, setTerminatorLine] = useState([]);
    const [daySidePolygon, setDaySidePolygon] = useState([]);
    const [sunPos, setSunPos] = useState(null);
    const [moonPos, setMoonPos] = useState(null);

    // we load any stored layouts from localStorage or fallback to default
    const [layouts, setLayouts] = useState(() => {
        const loaded = loadLayoutsFromLocalStorage();
        return loaded ?? defaultLayouts;
    });

    // update the satellites position, day/night terminator every second
    useEffect(()=>{
        const timer = setInterval(()=>{
            const now = new Date();

            // populate the satellite group
            setGroupSatellites(TLEs);

            // generate current positions for the group of satellites
            let currentPos = [];
            let currentCoverage = [];
            Object.keys(groupSatellites).map(key=>{
                //if (key === "40069") {
                    let name = groupSatellites[key]['name'];
                    let noradid = groupSatellites[key]['noradid'];
                    let [lat, lon, altitude, velocity] = getSatelliteLatLon(
                        groupSatellites[key]['tleLine1'],
                        groupSatellites[key]['tleLine2'],
                        now);

                    currentPos.push(<Marker key={"marker-"+groupSatellites[key]['name']} position={[lat, lon]}
                                            icon={satelliteIcon}>
                        <ThemedLeafletTooltip direction="bottom" offset={[0, 15]} opacity={0.9} permanent>
                            {groupSatellites[key]['name']} - {parseInt(altitude) + " km, " + velocity.toFixed(2) + " km/s"}
                        </ThemedLeafletTooltip>
                    </Marker>);

                    let coverage = getSatelliteCoverageCircle(lat, lon, altitude, 180);
                    // if (noradid === 40069) {
                    //     console.info(coverage);
                    // }

                    const result = ransacLineDetection(coverage, {
                        iterations: 2000,
                        distanceThreshold: 0.1,
                        minInliers: 3
                    });

                    if (result) {
                        console.info("A straight line "+groupSatellites[key]['name']+" segment was detected in the series.");
                        console.info(result)
                    } else {
                    }

                    // correct the open circle issue where plotting coverage circles on mercator map
                    if (!isCircleClosedOnMercator(coverage)) {
                        coverage = correctOpenCirclesOnMercator(coverage);
                    } else {
                    }

                    currentCoverage.push(<Polyline
                        noClip={true}
                        key={"coverage-"+groupSatellites[key]['name']}
                        pathOptions={{
                            color: 'purple',
                            weight: 1,
                            fill: true,
                            fillOpacity: 0.05,
                        }}
                        positions={coverage}
                    />);
                //}
            });

            setCurrentSatellitesPosition(currentPos);
            setCurrentSatellitesCoverage(currentCoverage);

            // Day/night boundary
            const terminatorLine = createTerminatorLine().reverse();
            setTerminatorLine(terminatorLine);

            // Day side polygon
            const dayPoly = [...terminatorLine];
            dayPoly.push(dayPoly[dayPoly.length - 1]);
            setDaySidePolygon(dayPoly);

            // sun and moon position
            const [sunPos, moonPos] = getSunMoonCoords();
            setSunPos(sunPos);
            setMoonPos(moonPos);

        }, 1000);

        return ()=>clearInterval(timer);
    },[groupSatellites]);

    // 3) Save new layouts to localStorage whenever the user drags/resizes
    function handleLayoutsChange(currentLayout, allLayouts){
        setLayouts(allLayouts);
        saveLayoutsToLocalStorage(allLayouts);
    }

    return (
        <ResponsiveGridLayout
            className="layout"
            // Provide our loaded (or default) layouts
            layouts={layouts}
            // When user changes them, store them
            onLayoutChange={handleLayoutsChange}
            breakpoints={{ lg:1200, md:996, sm:768, xs:480, xxs:0 }}
            cols={{ lg:12, md:10, sm:6, xs:4, xxs:2 }}
            rowHeight={30}
            isResizable
            isDraggable
            draggableHandle=".react-grid-draggable"
        >
            {/* MAP ISLAND */}
            <div key="map" style={{ border:'1px solid #424242', overflow:'hidden'}}>
                <TitleBar className={"react-grid-draggable"}></TitleBar>
                <MapContainer
                    center={[0, 0]}
                    zoom={2}
                    style={{ width:'100%', height:'100%', minHeight:'400px' }}
                    dragging={false}
                    scrollWheelZoom={false}
                    maxZoom={10}
                    minZoom={0}
                >
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution="Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL."
                    />

                    {sunPos? <Marker position={sunPos} icon={sunIcon} opacity={0.3}></Marker>: null}
                    {moonPos? <Marker position={moonPos} icon={moonIcon} opacity={0.3}></Marker>: null}

                    {/* Day side highlight */}
                    {daySidePolygon.length>1 && (
                        <Polygon
                            positions={daySidePolygon}
                            pathOptions={{
                                fillColor:'black',
                                fillOpacity:0.4,
                                color:'white',
                                weight:0
                            }}
                        />
                    )}

                    {/* Terminator line */}
                    {terminatorLine.length>1 && (
                        <Polyline
                            positions={terminatorLine}
                            pathOptions={{
                                color:'white',
                                weight:1,
                                opacity:0.2,
                        }}
                        />
                    )}

                    <Marker position={[HOME_LAT, HOME_LON]} icon={homeIcon} opacity={0.4}/>
                    {currentSatellitesPosition}
                    {currentSatellitesCoverage}

                </MapContainer>
            </div>
        </ResponsiveGridLayout>
    );
}

export default GlobalSatelliteTrack;
