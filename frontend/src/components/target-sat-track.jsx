import React, {useState, useEffect, useCallback, useMemo} from 'react';
import { SatelliteAlt } from '@mui/icons-material';
import { Responsive, WidthProvider } from 'react-grid-layout';
import {
    MapContainer,
    TileLayer,
    Marker,
    Polyline,
    Polygon,
    Tooltip, useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import * as satellite from 'satellite.js';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'leaflet/dist/leaflet.css';
import {styled} from "@mui/material/styles";
import createTerminatorLine from './terminator.jsx';
import {getSunMoonCoords} from "./sunmoon.jsx";
import {moonIcon, sunIcon, homeIcon, satelliteIcon} from './icons.jsx';
import {getSatelliteDataByNoradId} from './tles.jsx';
import SettingsIsland from "./map-settings.jsx";
import {Box, Fab} from "@mui/material";
import HomeIcon from '@mui/icons-material/Home';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus';
import {getTileLayerById} from "./tile-layer.jsx";
import SatSelectorIsland from "./target-sat-selector.jsx";
import {
    InternationalDateLinePolyline,
    MapStatusBar,
    MapTitleBar,
    StyledIslandParent,
    StyledIslandParentScrollbar
} from "./common.jsx";
import {TitleBar} from "./common.jsx";
import {useLocalStorageState} from "@toolpad/core";
import {HOME_LON, HOME_LAT} from "./common.jsx";
import {handleSetGridEditableOverview} from "./overview-sat-track.jsx";

// global leaflet map object
let MapObject = null;
const storageMapZoomValueKey = "target-map-zoom-level";

// global callback for dashboard editing here
export let handleSetGridEditableTarget = function () {};

const ThemedLeafletTooltip = styled(Tooltip)(({ theme }) => ({
    color: theme.palette.text.primary,
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    borderColor: theme.palette.background.paper,
}));

export const gridLayoutStoreName = 'target-sat-track-layouts';

// -------------------------------------------------
// Leaflet icon path fix for React
// -------------------------------------------------
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png'
});

const ResponsiveGridLayout = WidthProvider(Responsive);


// load / save layouts from localStorage
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

function CenterHomeButton() {
    const targetCoordinates = [HOME_LAT, HOME_LON];
    const handleClick = () => {
        MapObject.setView(targetCoordinates, MapObject.getZoom());
    };

    return <Fab size="small" color="primary" aria-label="Go home" onClick={()=>{handleClick()}}>
        <HomeIcon />
    </Fab>;
}

function CenterMapButton() {
    const targetCoordinates = [0, 0];
    const handleClick = () => {
        MapObject.setView(targetCoordinates, MapObject.getZoom());
    };

    return <Fab size="small" color="primary" aria-label="Go to center of map" onClick={()=>{handleClick()}}>
        <FilterCenterFocusIcon />
    </Fab>;
}

function FullscreenMapButton() {
    const handleMapFullscreen = () => {
        const mapContainer = MapObject.getContainer();
        if (!document.fullscreenElement) {
            if (mapContainer.requestFullscreen) {
                mapContainer.requestFullscreen();
            } else if (mapContainer.mozRequestFullScreen) {
                mapContainer.mozRequestFullScreen();
            } else if (mapContainer.webkitRequestFullscreen) {
                mapContainer.webkitRequestFullscreen();
            } else if (mapContainer.msRequestFullscreen) {
                mapContainer.msRequestFullscreen();
            }
        } else {
            // Exit fullscreen if we're already in it
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    };

    return <Fab size="small" color="primary" aria-label="Go fullscreen" onClick={()=>{handleMapFullscreen()}}>
        <FullscreenIcon />
    </Fab>;
}

function CenterSatelliteButton() {
    const targetCoordinates = [0, 0];
    const handleClick = () => {
        MapObject.setView(targetCoordinates, MapObject.getZoom());
    };

    return <Fab size="small" color="primary" aria-label="Follow satellite" onClick={()=>{handleClick()}}>
        <SatelliteAlt />
    </Fab>;
}


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
function getSatelliteCoverageCircle(satLat, satLon, altitudeKm, numPoints = 36) {
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
function normalizeLongitude(lon) {
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
function splitAtDateline(points) {
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
function getSatellitePaths(tle, durationMinutes, stepMinutes = 1) {
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
}

const ThemedDiv = styled('div')(({theme}) => ({
    backgroundColor: theme.palette.background.paper,
}));

function getMapZoomFromStorage() {
    const savedZoomLevel = localStorage.getItem(storageMapZoomValueKey);
    return savedZoomLevel ? parseFloat(savedZoomLevel) : 1.4;
}

function TargetSatelliteTrack({ initialNoradId=0, initialShowPastOrbitPath=true, initialShowFutureOrbitPath=true,
                                  initialShowSatelliteCoverage=true, initialShowSunIcon=true, initialShowMoonIcon=true,
                                  initialShowTerminatorLine=true, initialTileLayerID="stadiadark",
                                  initialPastOrbitLineColor="#ed840c", initialFutureOrbitLineColor="#08bd5f",
                                  initialSatelliteCoverageColor="#8700db", initialOrbitProjectionDuration=240 }) {

    const [satelliteName, setSatelliteName] = useState(null);
    const [satelliteLat, setSatelliteLat] = useState(null);
    const [satelliteLon, setSatelliteLon] = useState(null);
    const [satelliteAltitude, setSatelliteAltitude] = useState(0.0);
    const [satelliteVelocity, setSatelliteVelocity] = useState(0.0);
    const [showPastOrbitPath, setShowPastOrbitPath] = useState(initialShowPastOrbitPath);
    const [showFutureOrbitPath, setShowFutureOrbitPath] = useState(initialShowFutureOrbitPath);
    const [showSatelliteCoverage, setShowSatelliteCoverage] = useState(initialShowSatelliteCoverage);
    const [showSunIcon, setShowSunIcon] = useState(initialShowSunIcon);
    const [showMoonIcon, setShowMoonIcon] = useState(initialShowMoonIcon);
    const [showTerminatorLine, setShowTerminatorLine] = useState(initialShowTerminatorLine);
    const [groupSatellites, setGroupSatellites] = useState({});
    const [currentPastSatellitesPaths, setCurrentPastSatellitesPaths] = useState([]);
    const [currentFutureSatellitesPaths, setCurrentFutureSatellitesPaths] = useState([]);
    const [currentSatellitesPosition, setCurrentSatellitesPosition] = useState([]);
    const [currentSatellitesCoverage, setCurrentSatellitesCoverage] = useState([]);
    const [terminatorLine, setTerminatorLine] = useState([]);
    const [daySidePolygon, setDaySidePolygon] = useState([]);
    const [pastOrbitLineColor, setPastOrbitLineColor] = useState(initialPastOrbitLineColor);
    const [futureOrbitLineColor, setFutureOrbitLineColor] = useState(initialFutureOrbitLineColor);
    const [satelliteCoverageColor, setSatelliteCoverageColor] = useState(initialSatelliteCoverageColor);
    const [orbitProjectionDuration, setOrbitProjectionDuration] = useState(initialOrbitProjectionDuration);
    const [tileLayerID, setTileLayerID] = useLocalStorageState('target-tile-id', initialTileLayerID);
    const [noradId, setNoradId] = useLocalStorageState('target-satellite-noradid', initialNoradId);
    const [mapZoomLevel, setMapZoomLevel] = useState(getMapZoomFromStorage());
    const satelliteData = getSatelliteDataByNoradId(noradId);
    const [gridDraggable, setGridDraggable] = useState(false);
    const [gridResizable, setGridResizable] = useState(false);
    const [sunPos, setSunPos] = useState(null);
    const [moonPos, setMoonPos] = useState(null);
    const [gridEditable, setGridEditable] = useState(false);

    const ResponsiveReactGridLayout = useMemo(() => WidthProvider(Responsive), [gridEditable]);

    // default layout if none in localStorage
    const defaultLayouts = {
        lg: [
            {
                i: 'satselector',
                x: 0,
                y: 0,
                w: 12,
                h: 3,
                resizeHandles: ['se','ne','nw','sw','n','s','e','w'],
            },
            {
                i: 'map',
                x: 0,
                y: 3,
                w: 8,
                h: 15,
                resizeHandles: ['se','ne','nw','sw','n','s','e','w']
            },
            {
                i: 'settings',
                x: 8,
                y: 9,
                w: 2,
                h: 15,
                minW: 2,
                maxW: 2,
                minH: 15,
                maxH: 15,
            },
            {
                i: 'info',
                x: 10,
                y: 11,
                w: 2,
                h: 8,
                resizeHandles: ['se','ne','nw','sw','n','s','e','w']
            },
            {
                i: 'passes',
                x: 10,
                y: 14,
                w: 2,
                h: 7,
                resizeHandles: ['se','ne','nw','sw','n','s','e','w']
            },

        ]
    };

    // globalize the callback
    handleSetGridEditableTarget = useCallback((value) => {
        setGridEditable(value);
    }, [gridEditable]);

    const handleShowPastOrbitPath = useCallback((value) => {
        setShowPastOrbitPath(value);
    }, [showPastOrbitPath]);

    const handleShowFutureOrbitPath = useCallback((value) => {
        setShowFutureOrbitPath(value);
    }, [showFutureOrbitPath]);

    const handleShowSatelliteCoverage = useCallback((value) => {
        setShowSatelliteCoverage(value);
    }, [showSatelliteCoverage]);

    const handleSetShowSunIcon = useCallback((value) => {
        setShowSunIcon(value);
    }, [showSunIcon]);

    const handleSetShowMoonIcon = useCallback((value) => {
        setShowMoonIcon(value);
    }, [showMoonIcon]);

    const handleShowTerminatorLine = useCallback((value) => {
        setShowTerminatorLine(value);
    }, [showTerminatorLine]);

    const handlePastOrbitLineColor = useCallback((color) => {
        setPastOrbitLineColor(color);
    }, [pastOrbitLineColor]);

    const handleFutureOrbitLineColor = useCallback((color) => {
        setFutureOrbitLineColor(color);
    }, [futureOrbitLineColor]);

    const handleSatelliteCoverageColor = useCallback((color) => {
        setSatelliteCoverageColor(color);
    }, [satelliteCoverageColor]);

    const handleOrbitProjectionDuration = useCallback((minutes) => {
        setOrbitProjectionDuration(minutes);
    }, [orbitProjectionDuration]);

    const handleTileLayerID = useCallback((id) => {
        setTileLayerID(id);
    }, [tileLayerID]);

    const handleSelectSatelliteId = useCallback((noradId) => {
        setNoradId(noradId);
    }, [noradId]);

    const handleSetMapZoomLevel = useCallback((zoomLevel) => {
        setMapZoomLevel(zoomLevel);
    }, [mapZoomLevel]);

    // we load any stored layouts from localStorage or fallback to default
    const [layouts, setLayouts] = useState(() => {
        const loaded = loadLayoutsFromLocalStorage();
        return loaded ?? defaultLayouts;
    });



    const handleWhenReady = (map) => {
        // map is ready
        MapObject = map.target;
        setInterval(()=>{
            map.target.invalidateSize();
        }, 1000);
    };

    let [latitude, longitude, altitude, velocity] = [null, null, null, null];

    function satelliteUpdate(now) {
        if (satelliteData !== null) {

            // generate current positions for the group of satellites
            let currentPos = [];
            let currentCoverage = [];
            let currentFuturePaths = [];
            let currentPastPaths = [];
            setSatelliteName(satelliteData['name']);
            [latitude, longitude, altitude, velocity] = getSatelliteLatLon(
                satelliteData['tleLine1'],
                satelliteData['tleLine2'],
                now);

            // set satellite data
            setSatelliteLat(latitude);
            setSatelliteLon(longitude);
            setSatelliteAltitude(altitude);
            setSatelliteVelocity(velocity);

            // focus map on satellite, center on latitude only
            let mapCoords = MapObject.getCenter();
            MapObject.setView([mapCoords.lat, longitude], MapObject.getZoom());

            let paths = {};
            // calculate paths
            paths = getSatellitePaths([
                satelliteData['tleLine1'],
                satelliteData['tleLine2']
            ], orbitProjectionDuration);

            // past path
            currentPastPaths.push(<Polyline
                key={`past-path-${initialNoradId}`}
                positions={paths.past}
                pathOptions={{
                    color: pastOrbitLineColor,
                    weight:1,
                    opacity:1
                }}
            />)

            // future path
            currentFuturePaths.push(<Polyline
                key={`future-path-${initialNoradId}`}
                positions={paths.future}
                pathOptions={{
                    color: futureOrbitLineColor,
                    weight:1,
                    opacity:1
                }}
            />)

            currentPos.push(<Marker key={"marker-"+satelliteData['name']} position={[latitude, longitude]}
                                    icon={satelliteIcon}>
                <ThemedLeafletTooltip direction="bottom" offset={[0, 10]} opacity={0.9} permanent>
                    {satelliteData['name']} - {parseInt(altitude) + " km, " + velocity.toFixed(2) + " km/s"}
                </ThemedLeafletTooltip>
            </Marker>);

            let coverage = [];
            coverage = getSatelliteCoverageCircle(latitude, longitude, altitude, 360);
            currentCoverage.push(<Polyline
                noClip={true}
                key={"coverage-"+satelliteData['name']}
                pathOptions={{
                    color: satelliteCoverageColor,
                    weight: 1,
                    fill: true,
                    fillOpacity: 0.05,
                }}
                positions={coverage}
            />);

            setCurrentPastSatellitesPaths(currentPastPaths);
            setCurrentFutureSatellitesPaths(currentFuturePaths);
            setCurrentSatellitesPosition(currentPos);
            setCurrentSatellitesCoverage(currentCoverage);
        }

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
    }

    // update the satellites position, day/night terminator every second
    useEffect(()=>{
        satelliteUpdate(new Date());
        const timer = setInterval(()=>{
            satelliteUpdate(new Date());
        }, 1000);

        return ()=>clearInterval(timer);

    },[groupSatellites, showPastOrbitPath, showFutureOrbitPath, showSatelliteCoverage, showSunIcon, showMoonIcon,
        showTerminatorLine, pastOrbitLineColor, futureOrbitLineColor, satelliteCoverageColor, orbitProjectionDuration,
        latitude, longitude, altitude, velocity, tileLayerID, noradId]);

    function handleLayoutsChange(currentLayout, allLayouts){
        setLayouts(allLayouts);
        saveLayoutsToLocalStorage(allLayouts);
    }

    // subscribe to map events
    function MapEventComponent({handleSetMapZoomLevel}) {
        const mapEvents = useMapEvents({
            zoomend: () => {
                const mapZoom = mapEvents.getZoom()
                handleSetMapZoomLevel(mapZoom);
                localStorage.setItem(storageMapZoomValueKey, mapZoom);
            },
        });
        return null;
    }

    // pre-make the components
    let gridContents = [
        <StyledIslandParent key="map">
            <MapContainer
                center={[0, 0]}
                zoom={mapZoomLevel}
                style={{ width:'100%', height:'100%', minHeight:'400px', minWidth:'400px' }}
                dragging={false}
                scrollWheelZoom={false}
                maxZoom={7}
                minZoom={0}
                whenReady={handleWhenReady}
                zoomSnap={0.25}
                zoomDelta={0.25}
            >
                <MapTitleBar className={"react-grid-draggable window-title-bar"}>Tracking {satelliteName} {satelliteAltitude.toFixed(2)} km, {satelliteVelocity.toFixed(2)} km/s</MapTitleBar>
                <MapEventComponent handleSetMapZoomLevel={handleSetMapZoomLevel}/>
                <TileLayer
                    url={getTileLayerById(tileLayerID)['url']}
                    attribution="Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL."
                />
                <Box sx={{ '& > :not(style)': { m: 1 } }} style={{right: 0, top: 30, position: 'absolute'}}>
                    <CenterHomeButton/>
                    <CenterMapButton/>
                    <FullscreenMapButton/>
                </Box>

                {sunPos && showSunIcon? <Marker position={sunPos} icon={sunIcon} opacity={0.3}></Marker>: null}
                {moonPos && showMoonIcon? <Marker position={moonPos} icon={moonIcon} opacity={0.3}></Marker>: null}

                {daySidePolygon.length>1 && showTerminatorLine && (
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

                {terminatorLine.length>1 && showTerminatorLine && (
                    <Polyline
                        positions={terminatorLine}
                        pathOptions={{
                            color:'white',
                            weight:1,
                            opacity:0.2,
                        }}
                    />
                )}
                {InternationalDateLinePolyline()}
                <Marker position={[HOME_LAT, HOME_LON]} icon={homeIcon} opacity={0.4}/>
                {showPastOrbitPath? currentPastSatellitesPaths: null}
                {showFutureOrbitPath? currentFutureSatellitesPaths: null}
                {currentSatellitesPosition}
                {showSatelliteCoverage? currentSatellitesCoverage: null}
                <MapStatusBar/>
            </MapContainer>
        </StyledIslandParent>,
        <StyledIslandParentScrollbar key="settings">
            <SettingsIsland
                initialShowPastOrbitPath={showPastOrbitPath}
                initialShowFutureOrbitPath={showFutureOrbitPath}
                initialShowSatelliteCoverage={showSatelliteCoverage}
                initialShowSunIcon={showSunIcon}
                initialShowMoonIcon={showMoonIcon}
                initialShowTerminatorLine={showTerminatorLine}
                initialPastOrbitLineColor={pastOrbitLineColor}
                initialFutureOrbitLineColor={futureOrbitLineColor}
                initialSatelliteCoverageColor={satelliteCoverageColor}
                initialOrbitProjectionDuration={orbitProjectionDuration}
                initialTileLayerID={tileLayerID}
                handleShowPastOrbitPath={handleShowPastOrbitPath}
                handleShowFutureOrbitPath={handleShowFutureOrbitPath}
                handleShowSatelliteCoverage={handleShowSatelliteCoverage}
                handleSetShowSunIcon={handleSetShowSunIcon}
                handleSetShowMoonIcon={handleSetShowMoonIcon}
                handleShowTerminatorLine={handleShowTerminatorLine}
                handlePastOrbitLineColor={handlePastOrbitLineColor}
                handleFutureOrbitLineColor={handleFutureOrbitLineColor}
                handleSatelliteCoverageColor={handleSatelliteCoverageColor}
                handleOrbitProjectionDuration={handleOrbitProjectionDuration}
                handleTileLayerID={handleTileLayerID}
            />
        </StyledIslandParentScrollbar>,
        <StyledIslandParentScrollbar key="info">
            <TitleBar className={"react-grid-draggable"}>Information</TitleBar>
            <div style={{ padding:'0rem 1rem 1rem 1rem' }}>
                <h2>{satelliteName}</h2>
                <p><strong>Latitude:</strong> {satelliteLat? satelliteLat.toFixed(4): "n/a"}°</p>
                <p><strong>Longitude:</strong> {satelliteLon? satelliteLon.toFixed(4): "n/a"}°</p>
                <p><strong>Altitude:</strong> {satelliteAltitude? satelliteAltitude.toFixed(2): "n/a"} km</p>
                <p><strong>Velocity:</strong> {satelliteVelocity? satelliteVelocity.toFixed(2): "n/a"} km/s</p>
            </div>
        </StyledIslandParentScrollbar>,
        <StyledIslandParentScrollbar key="passes">
            <TitleBar className={"react-grid-draggable window-title-bar"}>Next passes</TitleBar>
            <div style={{ padding:'0rem 1rem 1rem 1rem' }}>
                <h3>Next 24-hour Passes</h3>
                <p>Pass data, etc.</p>
            </div>
        </StyledIslandParentScrollbar>,
        <StyledIslandParentScrollbar key="satselector">
            <SatSelectorIsland handleSelectSatelliteId={handleSelectSatelliteId}/>
        </StyledIslandParentScrollbar>
    ];

    let ResponsiveGridLayoutParent = null;

    if (gridEditable === true) {
        ResponsiveGridLayoutParent = <ResponsiveReactGridLayout
            useCSSTransforms={false}
            className="layout"
            layouts={layouts}
            onLayoutChange={handleLayoutsChange}
            breakpoints={{ lg:1200, md:996, sm:768, xs:480, xxs:0 }}
            cols={{ lg:12, md:10, sm:6, xs:2, xxs:2 }}
            rowHeight={30}
            isResizable={true}
            isDraggable={true}
            draggableHandle=".react-grid-draggable"
        >
            {gridContents}
        </ResponsiveReactGridLayout>;
    } else {
        ResponsiveGridLayoutParent = <ResponsiveReactGridLayout
            useCSSTransforms={false}
            className="layout"
            layouts={layouts}
            onLayoutChange={handleLayoutsChange}
            breakpoints={{ lg:1200, md:996, sm:768, xs:480, xxs:0 }}
            cols={{ lg:12, md:10, sm:6, xs:2, xxs:2 }}
            rowHeight={30}
            isResizable={false}
            isDraggable={false}
            draggableHandle=".react-grid-draggable"
        >
            {gridContents}
        </ResponsiveReactGridLayout>;
    }

    return ResponsiveGridLayoutParent;
}

export default TargetSatelliteTrack;
