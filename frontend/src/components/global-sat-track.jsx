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
            Object.keys(groupSatellites).map(noradid=>{
                let name = groupSatellites[noradid]['name'];
                let [lat, lon, altitude, velocity] = getSatelliteLatLon(
                    groupSatellites[noradid]['tleLine1'],
                    groupSatellites[noradid]['tleLine2'],
                    now);

                currentPos.push(<Marker key={"marker-"+groupSatellites[noradid]['name']} position={[lat, lon]}
                                        icon={satelliteIcon}>
                    <ThemedLeafletTooltip direction="bottom" offset={[0, 15]} opacity={0.9} permanent>
                        {groupSatellites[noradid]['name']} - {parseInt(altitude) + " km, " + velocity.toFixed(2) + " km/s"}
                    </ThemedLeafletTooltip>
                </Marker>);

                let coverage = getSatelliteCoverageCircle(lat, lon, altitude, 360);

                currentCoverage.push(<Polyline
                    noClip={true}
                    key={"coverage-"+groupSatellites[noradid]['name']}
                    pathOptions={{
                        color: 'purple',
                        weight: 1,
                        fill: true,
                        fillOpacity: 0.05,
                    }}
                    positions={coverage}
                />);
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
