import React, {useState, useEffect, useRef, useCallback} from 'react';
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
    Tooltip, useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-fullscreen/dist/Leaflet.fullscreen.js';
import * as satellite from 'satellite.js';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'leaflet/dist/leaflet.css';
import {styled} from "@mui/material/styles";
import createTerminatorLine from './terminator.jsx';
import {getSunMoonCoords} from "./sunmoon.jsx";
import {moonIcon, sunIcon, homeIcon, satelliteIcon} from './icons.jsx';
import {getAllSatellites, HAMTLEs, MERIDIANTLEs, NOAATLEs} from './tles.jsx';
import SettingsIsland from "./map-settings.jsx";
import {Box, Fab} from "@mui/material";
import HomeIcon from '@mui/icons-material/Home';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus';
import {getTileLayerById, tileLayers} from "./tile-layer.jsx";
import MemoizedOverviewSatelliteSelector from "./overview-sat-selector.jsx";
import {
    CODEC_BOOL,
    CODEC_JSON,
    StyledIslandParent,
    StyledIslandParentScrollbar,
    MapTitleBar,
    ThemedLeafletTooltip,
    MapStatusBar,
    InternationalDateLinePolyline
} from "./common.jsx";
import { useLocalStorageState } from '@toolpad/core';
import {getSatellitePaths, getSatelliteCoverageCircle, getSatelliteLatLon, splitAtDateline, normalizeLongitude} from './tracking-logic.jsx';
import Paper from "@mui/material/Paper";

// global leaflet map object
const HOME_LAT = 40.6293;
const HOME_LON = 22.9474;
const storageMapZoomValueKey = "overview-map-zoom-level";

let MapObject = null;

export const gridLayoutStoreName = 'global-sat-track-layouts';

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

// Default layout if none in localStorage
const defaultLayouts = {
    lg: [
        {
            i: 'satselector',
            x: 0,
            y: 0,
            w: 12,
            h: 3,
            resizeHandles: ['se','ne','nw','sw','n','s','e','w'],
            isResizable: true,
        },
        {
            i: 'map',
            x: 0,
            y: 4,
            w: 10,
            h: 18,
            resizeHandles: ['se','ne','nw','sw','n','s','e','w'],
            isResizable: true,
        },
        {
            i: 'settings',
            x: 10,
            y: 4,
            w: 2,
            h: 15,
            minW: 2,
            maxW: 2,
            minH: 15,
            maxH: 15,
            isResizable: true,
            resizeHandles: ['se','ne','nw','sw','n','s','e','w'],
        }
    ]
};

function CenterHomeButton() {
    const targetCoordinates = [HOME_LAT, HOME_LON];
    const map = useMap();
    const handleClick = () => {
        map.setView(targetCoordinates, map.getZoom());
    };

    return <Fab size="small" color="primary" aria-label="Go home" onClick={()=>{handleClick()}}>
        <HomeIcon />
    </Fab>;
}

function CenterMapButton() {
    const targetCoordinates = [0, 0];
    const map = useMap();
    const handleClick = () => {
        console.info("centering...");
        map.setView(targetCoordinates, map.getZoom());
    };

    return <Fab size="small" color="primary" aria-label="Go to center of map" onClick={()=>{handleClick()}}>
        <FilterCenterFocusIcon />
    </Fab>;
}

const ThemedDiv = styled('div')(({theme}) => ({
    backgroundColor: theme.palette.background.paper,
}));

function getMapZoomFromStorage() {
    const savedZoomLevel = localStorage.getItem(storageMapZoomValueKey);
    return savedZoomLevel ? parseFloat(savedZoomLevel) : 1.4;
}

function GlobalSatelliteTrack({ initialShowPastOrbitPath=false, initialShowFutureOrbitPath=false,
                                  initialShowSatelliteCoverage=true, initialShowSunIcon=true, initialShowMoonIcon=true,
                                  initialShowTerminatorLine=true, initialTileLayerID="stadiadark",
                                  initialPastOrbitLineColor="#ed840c", initialFutureOrbitLineColor="#08bd5f",
                                  initialSatelliteCoverageColor="#8700db", initialOrbitProjectionDuration=60 }) {

    const [showPastOrbitPath, setShowPastOrbitPath] = useLocalStorageState('overview-show-past-orbit', initialShowPastOrbitPath, { codec: CODEC_BOOL });
    const [showFutureOrbitPath, setShowFutureOrbitPath] = useLocalStorageState('overview-show-future-orbit', initialShowFutureOrbitPath, { codec: CODEC_BOOL });
    const [showSatelliteCoverage, setShowSatelliteCoverage] = useLocalStorageState('overview-show-satellite-coverage', initialShowSatelliteCoverage, { codec: CODEC_BOOL });
    const [showSunIcon, setShowSunIcon] = useLocalStorageState('overview-show-sun-icon', initialShowSunIcon, { codec: CODEC_BOOL });
    const [showMoonIcon, setShowMoonIcon] = useLocalStorageState('overview-show-moon-icon', initialShowMoonIcon, { codec: CODEC_BOOL });
    const [showTerminatorLine, setShowTerminatorLine] = useLocalStorageState('overview-show-terminator-line', initialShowTerminatorLine);
    const [selectedSatellites, setSelectedSatellites] = useLocalStorageState('overview-selected-satellites', [], { codec: CODEC_JSON });
    const [currentPastSatellitesPaths, setCurrentPastSatellitesPaths] = useState([]);
    const [currentFutureSatellitesPaths, setCurrentFutureSatellitesPaths] = useState([]);
    const [currentSatellitesPosition, setCurrentSatellitesPosition] = useState([]);
    const [currentSatellitesCoverage, setCurrentSatellitesCoverage] = useState([]);
    const [terminatorLine, setTerminatorLine] = useState([]);
    const [daySidePolygon, setDaySidePolygon] = useState([]);
    const [pastOrbitLineColor, setPastOrbitLineColor] = useState(initialPastOrbitLineColor);
    const [futureOrbitLineColor, setFutureOrbitLineColor] = useState(initialFutureOrbitLineColor);
    const [satelliteCoverageColor, setSatelliteCoverageColor] = useState(initialSatelliteCoverageColor);
    const [orbitProjectionDuration, setOrbitProjectionDuration] = useLocalStorageState('overview-orbit-projection-duration', initialOrbitProjectionDuration, { codec: CODEC_JSON });
    const [tileLayerID, setTileLayerID] = useState(initialTileLayerID);
    const [sunPos, setSunPos] = useState(null);
    const [moonPos, setMoonPos] = useState(null);
    const [satelliteList, setSatelliteList] = useLocalStorageState('overview-satellite-list',null, { codec: CODEC_JSON });
    const [mapZoomLevel, setMapZoomLevel] = useState(getMapZoomFromStorage());
    const [mapObject, setMapObject] = useState(null);

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

    const handleGroupSatelliteSelection = useCallback((satellites) => {
        setSelectedSatellites(satellites)
    }, [selectedSatellites]);

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
            MapObject.invalidateSize();
        }, 1000);
    };

    function FullscreenMapButton() {
        const handleMapFullscreen = () => {
            console.info(MapObject);
            console.info(mapObject);
            mapObject.toggleFullscreen();
        };

        return <Fab size="small" color="primary" aria-label="Go fullscreen" onClick={()=>{handleMapFullscreen()}}>
            <FullscreenIcon />
        </Fab>;
    }

    function satelliteUpdate(now) {
        // generate current positions for the group of satellites
        let currentPos = [];
        let currentCoverage = [];
        let currentFuturePaths = [];
        let currentPastPaths = [];

        selectedSatellites.forEach(satellite => {
            let noradid = satellite['noradid'];
            let [lat, lon, altitude, velocity] = getSatelliteLatLon(
                satellite['tleLine1'],
                satellite['tleLine2'],
                now);

            let paths = {};
            // calculate paths
            paths = getSatellitePaths([
                satellite['tleLine1'],
                satellite['tleLine2']
            ], orbitProjectionDuration);

            // past path
            currentPastPaths.push(<Polyline
                key={`past-path-${noradid}`}
                positions={paths.past}
                pathOptions={{
                    color: pastOrbitLineColor,
                    weight:1,
                    opacity:1
                }}
            />)

            // future path
            currentFuturePaths.push(<Polyline
                key={`future-path-${noradid}`}
                positions={paths.future}
                pathOptions={{
                    color: futureOrbitLineColor,
                    weight:1,
                    opacity:1
                }}
            />)

            currentPos.push(<Marker key={"marker-"+satellite['name']} position={[lat, lon]}
                                    icon={satelliteIcon}>
                <ThemedLeafletTooltip direction="bottom" offset={[0, 10]} opacity={0.9} permanent>
                    {satellite['name']} - {parseInt(altitude) + " km, " + velocity.toFixed(2) + " km/s"}
                </ThemedLeafletTooltip>
            </Marker>);

            let coverage = [];
            coverage = getSatelliteCoverageCircle(lat, lon, altitude, 360);
            currentCoverage.push(<Polyline
                noClip={true}
                key={"coverage-"+satellite['name']}
                pathOptions={{
                    color: satelliteCoverageColor,
                    weight: 1,
                    fill: true,
                    fillOpacity: 0.05,
                }}
                positions={coverage}
            />);
        });

        setCurrentPastSatellitesPaths(currentPastPaths);
        setCurrentFutureSatellitesPaths(currentFuturePaths);
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
    }

    useEffect(() => {
        const savedZoomLevel = localStorage.getItem(storageMapZoomValueKey);
        const initialMapZoom = savedZoomLevel ? parseFloat(savedZoomLevel) : 1;
        setMapZoomLevel(initialMapZoom);

        return () => {

        };
    }, []);

    useEffect(() => {
        // get all satellites
        setSatelliteList(getAllSatellites());

        return () => {
            // Cleanup function (optional), runs when component unmounts or before the effect re-runs
        };
    }, [/* Add your dependencies here */]);

    // update the satellites position, day/night terminator every second
    useEffect(()=>{
        satelliteUpdate(new Date())

        const timer = setInterval(()=>{
            satelliteUpdate(new Date())
        }, 1000);

        return ()=>clearInterval(timer);
    },[selectedSatellites, showPastOrbitPath, showFutureOrbitPath, showSatelliteCoverage, showSunIcon, showMoonIcon,
        showTerminatorLine, pastOrbitLineColor, futureOrbitLineColor, satelliteCoverageColor, orbitProjectionDuration, mapZoomLevel]);

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



    

    return (
        <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            onLayoutChange={handleLayoutsChange}
            breakpoints={{ lg:1200, md:996, sm:768, xs:480, xxs:0 }}
            cols={{ lg:12, md:10, sm:6, xs:2, xxs:2 }}
            rowHeight={30}
            isResizable
            isDraggable
            draggableHandle=".react-grid-draggable"
        >
            <StyledIslandParent key="map">
                <MapContainer
                    fullscreenControl={true}
                    ref={setMapObject}
                    center={[0, 0]}
                    zoom={mapZoomLevel}
                    style={{ width:'100%', height:'100%' }}
                    dragging={false}
                    scrollWheelZoom={false}
                    maxZoom={10}
                    minZoom={0}
                    whenReady={handleWhenReady}
                    zoomSnap={0.25}
                    zoomDelta={0.25}
                >
                    <MapTitleBar className={"react-grid-draggable"}>Global map</MapTitleBar>
                    <MapEventComponent handleSetMapZoomLevel={handleSetMapZoomLevel}/>
                    <TileLayer
                        url={getTileLayerById(tileLayerID)['url']}
                        attribution="Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL."
                    />
                    <Box sx={{ '& > :not(style)': { m: 1 } }} style={{right: 5, top: 30, position: 'absolute'}}>
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
            </StyledIslandParent>
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
            </StyledIslandParentScrollbar>
            <StyledIslandParentScrollbar key={"satselector"}>
                <MemoizedOverviewSatelliteSelector
                    satelliteList={satelliteList}
                    handleGroupSatelliteSelection={handleGroupSatelliteSelection}/>
            </StyledIslandParentScrollbar>
        </ResponsiveGridLayout>
    );
}

export default GlobalSatelliteTrack;
