import React, { useState, useEffect } from 'react';
import { SatelliteAlt } from '@mui/icons-material';
import { renderToStaticMarkup } from 'react-dom/server';
import { Responsive, WidthProvider } from 'react-grid-layout';
import {
    MapContainer,
    TileLayer,
    Marker,
    Circle,
    Polyline,
    Polygon,
    useMap
} from 'react-leaflet';
import L from 'leaflet';
import * as satellite from 'satellite.js';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'leaflet/dist/leaflet.css';
import Paper from "@mui/material/Paper";
import {styled} from "@mui/material/styles";


const TitleBar = styled(Paper)(({ theme }) => ({
    width: '100%',
    height: '30px',
    padding: '3px',
    ...theme.typography.body2,
    textAlign: 'center',

}));

// -------------------------------------------------
// 1) Leaflet icon path fix for React
// -------------------------------------------------
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
    shadowUrl:
        'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png'
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
        const raw = localStorage.getItem('myGridLayouts');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveLayoutsToLocalStorage(layouts) {
    localStorage.setItem('myGridLayouts', JSON.stringify(layouts));
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

// -------------------------------------------------
// 5) Satellite logic (orbit, day/night terminator)
// -------------------------------------------------
function getLatLon(tleLine1, tleLine2, date) {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const pv = satellite.propagate(satrec, date);
    if (!pv.position || !pv.velocity) return null;

    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(pv.position, gmst);

    const lat = satellite.degreesLat(geo.latitude);
    const lon = satellite.degreesLong(geo.longitude);
    const altitude = geo.height;

    const { x, y, z } = pv.velocity;
    const velocity = Math.sqrt(x * x + y * y + z * z);
    return { lat, lon, altitude, velocity };
}

function getDayOfYear(d) {
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.floor((d - start) / (24 * 60 * 60 * 1000)) + 1;
}

function getSubSolarPoint(d) {
    const dayOfYr = getDayOfYear(d);
    const hours = d.getUTCHours() + d.getUTCMinutes()/60 + d.getUTCSeconds()/3600;
    const dayFrac = hours/24;
    const dayAngle = (2*Math.PI/365)*(dayOfYr+dayFrac-81);
    const decl = 23.44 * Math.sin(dayAngle);

    const lat = decl;
    const subSolarLon = -15*(hours - 12);
    let lon = subSolarLon;
    if(lon>180) lon -= 360;
    if(lon<-180) lon += 360;
    return { lat, lon };
}

function createTerminatorLine(date, steps=180) {
    const { lat: lat0Deg, lon: lon0Deg } = getSubSolarPoint(date);
    const lat0 = satellite.degreesToRadians(lat0Deg);
    const lon0 = satellite.degreesToRadians(lon0Deg);

    const d = Math.PI/2;
    const line = [];

    for(let i=0; i<steps; i++){
        const alpha = (2*Math.PI*i)/(steps-1);

        const lat = Math.asin(
            Math.sin(lat0)*Math.cos(d) +
            Math.cos(lat0)*Math.sin(d)*Math.cos(alpha)
        );
        const lon =
            lon0 +
            Math.atan2(
                Math.sin(alpha)*Math.sin(d)*Math.cos(lat0),
                Math.cos(d) - Math.sin(lat0)*Math.sin(lat)
            );

        let latDeg = satellite.radiansToDegrees(lat);
        let lonDeg = satellite.radiansToDegrees(lon);

        if(lonDeg>180) lonDeg-=360;
        if(lonDeg<-180) lonDeg+=360;

        line.push([latDeg, lonDeg]);
    }
    return line;
}

function segmentOrbit(positions) {
    if(!positions.length) return [];
    const segments = [];
    let currentSegment = [positions[0]];
    for(let i=1; i<positions.length; i++){
        const [lat1,lon1] = positions[i-1];
        const [lat2,lon2] = positions[i];
        const dLon = lon2-lon1;
        if(Math.abs(dLon)>180){
            segments.push(currentSegment);
            currentSegment = [[lat2,lon2]];
        } else {
            currentSegment.push([lat2,lon2]);
        }
    }
    segments.push(currentSegment);
    return segments;
}

// -------------------------------------------------
// 6) Main SatelliteTracker component
// -------------------------------------------------
function TargetSatelliteGridLayout() {
    const [latitude, setLatitude] = useState(0);
    const [longitude, setLongitude] = useState(0);
    const [altitude, setAltitude] = useState(0);
    const [velocity, setVelocity] = useState(0);

    const [pastPositions, setPastPositions] = useState([]);
    const [futurePositions, setFuturePositions] = useState([]);

    const [terminatorLine, setTerminatorLine] = useState([]);
    const [daySidePolygon, setDaySidePolygon] = useState([]);

    // 1) We load any stored layouts from localStorage or fallback to default
    const [layouts, setLayouts] = useState(() => {
        const loaded = loadLayoutsFromLocalStorage();
        return loaded ?? defaultLayouts;
    });

    const coverageRadius = 2250000; // about 2250 km

    // 2) Update the ISS position, day/night terminator every second
    useEffect(()=>{
        const timer = setInterval(()=>{
            const now = new Date();

            const current = getLatLon(TLE_LINE_1, TLE_LINE_2, now);
            if(current){
                setLatitude(current.lat);
                setLongitude(current.lon);
                setAltitude(current.altitude);
                setVelocity(current.velocity);
            }

            // Past track
            const pastArr = [];
            for(let i=-60; i<=0; i++){
                const t = new Date(now.getTime()+i*60000);
                const coords = getLatLon(TLE_LINE_1, TLE_LINE_2, t);
                if(coords){
                    pastArr.push([coords.lat, coords.lon]);
                }
            }
            setPastPositions(pastArr);

            // Future track
            const futureArr = [];
            for(let i=1; i<=60; i++){
                const t = new Date(now.getTime()+i*60000);
                const coords = getLatLon(TLE_LINE_1, TLE_LINE_2, t);
                if(coords){
                    futureArr.push([coords.lat, coords.lon]);
                }
            }
            setFuturePositions(futureArr);

            // Day/night boundary
            const line = createTerminatorLine(now, 180);
            setTerminatorLine(line);

            // Day side polygon
            const dayPoly = [...line].reverse();
            dayPoly.push(dayPoly[0]);
            setDaySidePolygon(dayPoly);

        }, 1000);
        return ()=>clearInterval(timer);
    },[]);

    // 3) Save new layouts to localStorage whenever the user drags/resizes
    function handleLayoutsChange(currentLayout, allLayouts){
        setLayouts(allLayouts);
        saveLayoutsToLocalStorage(allLayouts);
    }

    const pastSegments = segmentOrbit(pastPositions);
    const futureSegments = segmentOrbit(futurePositions);

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
                    center={[latitude, longitude]}
                    zoom={3}
                    style={{ width:'100%', height:'100%', minHeight:'400px' }}
                    dragging={false}
                    scrollWheelZoom={false}
                >
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution="Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL."
                    />
                    <RecenterAutomatically lat={latitude} lon={longitude} />

                    {/* Day side highlight */}
                    {daySidePolygon.length>1 && (
                        <Polygon
                            positions={daySidePolygon}
                            pathOptions={{
                                fillColor:'white',
                                fillOpacity:0.1,
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

                    {/* Past orbit (solid) */}
                    {pastSegments.map((seg, idx)=>(
                        <Polyline
                            key={`past-${idx}`}
                            positions={seg}
                            pathOptions={{
                                color:'green',
                                weight:2,
                                opacity:1
                        }}
                        />
                    ))}

                    {/* Future orbit (dotted) */}
                    {futureSegments.map((seg, idx)=>(
                        <Polyline
                            key={`future-${idx}`}
                            positions={seg}
                            pathOptions={{
                                color:'orange',
                                weight:2,
                                dashArray:'2,2',
                                opacity:0.2
                        }}
                        />
                    ))}

                    {/* ISS marker (Material UI SatelliteAlt icon) */}
                    <Marker position={[latitude, longitude]} icon={materialSatelliteIcon} />

                    {/* Home location marker (default) */}
                    <Marker position={[HOME_LAT, HOME_LON]} />

                    {/* Coverage circle */}
                    <Circle
                        center={[latitude, longitude]}
                        radius={coverageRadius}
                        pathOptions={{
                            color:'yellow',
                            weight:1,
                            opacity:0.5,
                            fillOpacity: 0.2,
                        }}
                    />
                </MapContainer>
            </div>

            {/* INFO ISLAND */}
            <div key="info" style={{ padding:'0rem 0rem 0rem 0rem', border:'1px solid #424242' }}>
                <TitleBar className={"react-grid-draggable"}></TitleBar>
                <div style={{ padding:'0rem 1rem 1rem 1rem' }}>
                    <h3>Satellite Info (ISS)</h3>
                    <p><strong>Latitude:</strong> {latitude.toFixed(4)}°</p>
                    <p><strong>Longitude:</strong> {longitude.toFixed(4)}°</p>
                    <p><strong>Altitude:</strong> {altitude.toFixed(2)} km</p>
                    <p><strong>Velocity:</strong> {velocity.toFixed(2)} km/s</p>
                </div>
            </div>

            {/* PASSES ISLAND */}
            <div key="passes" style={{ padding:'0rem 0rem 1rem 0rem', border:'1px solid #424242' }}>
                <TitleBar className={"react-grid-draggable"}></TitleBar>
                <div style={{ padding:'0rem 1rem 1rem 1rem' }}>
                    <h3>Next 24-hour Passes</h3>
                    <p>Pass data, etc.</p>
                </div>
            </div>
        </ResponsiveGridLayout>
    );
}

// Keep map centered on satellite
function RecenterAutomatically({ lat, lon }) {
    const map = useMap();
    useEffect(()=>{
        map.setView([lat, lon]);
    },[lat, lon, map]);
    return null;
}

export default TargetSatelliteGridLayout;
