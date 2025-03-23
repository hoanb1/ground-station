import React, {useState, useEffect, useCallback, useMemo, memo} from 'react';
import { SatelliteAlt } from '@mui/icons-material';
import { Responsive, WidthProvider } from 'react-grid-layout';
import {
    MapContainer,
    TileLayer,
    Marker,
    Polyline,
    Polygon,
    useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'leaflet/dist/leaflet.css';
import createTerminatorLine from './common/terminator-line.jsx';
import {getSunMoonCoords} from "./common/sunmoon.jsx";
import {moonIcon, sunIcon, homeIcon, satelliteIcon} from './common/icons.jsx';
import SettingsIsland from "./common/map-settings.jsx";
import {Box, Fab, Slider} from "@mui/material";
import HomeIcon from '@mui/icons-material/Home';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus';
import {getTileLayerById} from "./common/tile-layers.jsx";
import SatSelectorIsland from "./target-sat-selector.jsx";
import {
    betterDateTimes, betterStatusValue,
    CODEC_BOOL,
    InternationalDateLinePolyline, MapArrowControls,
    MapStatusBar,
    MapTitleBar, renderCountryFlags,
    StyledIslandParent,
    StyledIslandParentScrollbar, ThemedLeafletTooltip
} from "./common/common.jsx";
import {TitleBar} from "./common/common.jsx";
import {useLocalStorageState} from "@toolpad/core";
import {HOME_LON, HOME_LAT} from "./common/common.jsx";
import {getSatelliteCoverageCircle, getSatelliteLatLon, getSatellitePaths} from "./common/tracking-logic.jsx";
import {enqueueSnackbar} from "notistack";
import {useSocket} from "./common/socket.jsx";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";

// global leaflet map object
let MapObject = null;
const storageMapZoomValueKey = "target-map-zoom-level";

// global callback for dashboard editing here
export let handleSetGridEditableTarget = function () {};

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

function getMapZoomFromStorage() {
    const savedZoomLevel = localStorage.getItem(storageMapZoomValueKey);
    return savedZoomLevel ? parseFloat(savedZoomLevel) : 1.4;
}

const MapSlider = function ({handleSliderChange}) {

    const marks = [
        {
            value: 0,
            label: '0m',
        },
        {
            value: 15,
            label: '+15m',
        },
        {
            value: -15,
            label: '-15m',
        },
        {
            value: 30,
            label: '+30m',
        },
        {
            value: -30,
            label: '-30m',
        }
    ];

    return (
        <Box sx={{
            width: '100%;',
            bottom: 10,
            position: 'absolute',
            left: '0%',
            zIndex: 400,
            textAlign: 'center',
            opacity: 0.7,
        }}>
            <Slider
                marks={marks}
                size="medium"
                track={false}
                aria-label=""
                defaultValue={""}
                onChange={(e, value) => {
                    handleSliderChange(value);
                }}
                min={-30}
                max={30}
                sx={{
                    height: 20,
                    width: '70%',
                }}
            />
        </Box>
    );
}

const TargetSatelliteTrack = React.memo(function ({ initialNoradId=0, initialShowPastOrbitPath=true, initialShowFutureOrbitPath=true,
                                  initialShowSatelliteCoverage=true, initialShowSunIcon=true, initialShowMoonIcon=true,
                                  initialShowTerminatorLine=true, initialShowTooltip=true, initialTileLayerID="stadiadark",
                                  initialPastOrbitLineColor="#ed840c", initialFutureOrbitLineColor="#08bd5f",
                                  initialSatelliteCoverageColor="#8700db", initialOrbitProjectionDuration=240 }) {
    const { socket } = useSocket();
    const [satelliteName, setSatelliteName] = useState(null);
    const [satelliteLat, setSatelliteLat] = useState(null);
    const [satelliteLon, setSatelliteLon] = useState(null);
    const [satelliteAltitude, setSatelliteAltitude] = useState(0.0);
    const [satelliteVelocity, setSatelliteVelocity] = useState(0.0);
    const [showPastOrbitPath, setShowPastOrbitPath] = useLocalStorageState('target-show-past-orbit-path', initialShowPastOrbitPath, { codec: CODEC_BOOL });
    const [showFutureOrbitPath, setShowFutureOrbitPath] = useLocalStorageState('target-show-future-path', initialShowFutureOrbitPath, { codec: CODEC_BOOL });
    const [showSatelliteCoverage, setShowSatelliteCoverage] = useLocalStorageState('target-show-coverage', initialShowSatelliteCoverage, { codec: CODEC_BOOL });
    const [showSunIcon, setShowSunIcon] = useLocalStorageState('target-show-sun', initialShowSunIcon, { codec: CODEC_BOOL });
    const [showMoonIcon, setShowMoonIcon] = useLocalStorageState('target-show-moon', initialShowMoonIcon, { codec: CODEC_BOOL });
    const [showTerminatorLine, setShowTerminatorLine] = useLocalStorageState('target-show-terminator', initialShowTerminatorLine, { codec: CODEC_BOOL });
    const [showTooltip, setShowTooltip] = useLocalStorageState('target-show-tooltip', initialShowTooltip, { codec: CODEC_BOOL });
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
    const [groupId, setGroupId] = useLocalStorageState('target-satellite-groupid', initialNoradId);
    const [mapZoomLevel, setMapZoomLevel] = useState(getMapZoomFromStorage());
    const [sunPos, setSunPos] = useState(null);
    const [moonPos, setMoonPos] = useState(null);
    const [gridEditable, setGridEditable] = useState(false);
    const [satelliteData, setSatelliteData] = useState({});
    const [sliderTimeOffset, setSliderTimeOffset] = useState(0);

    const ResponsiveReactGridLayout = useMemo(() => WidthProvider(Responsive), [gridEditable]);

    // default layout if none in localStorage
    const defaultLayouts = {
        lg: [
            {
                i: 'map',
                x: 0,
                y: 3,
                w: 8,
                h: 15,
                resizeHandles: ['se','ne','nw','sw','n','s','e','w']
            },
            {
                i: 'satselector',
                x: 10,
                y: 0,
                w: 2,
                h: 4,
                resizeHandles: ['se','ne','nw','sw','n','s','e','w'],
            },
            {
                i: 'settings',
                x: 8,
                y: 9,
                w: 2,
                h: 12,
                minW: 2,
                maxW: 2,
                minH: 10,
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
        fetchSatelliteData(noradId);
    }, [noradId]);

    const handleSetMapZoomLevel = useCallback((zoomLevel) => {
        setMapZoomLevel(zoomLevel);
    }, [mapZoomLevel]);

    const handleSliderChange = useCallback((value) => {
        setSliderTimeOffset(value);
    }, []);

    const handleShowTooltip = useCallback((value) => {
        setShowTooltip(value);
    }, [showTooltip]);

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

    const satelliteUpdate = function (now) {
        if (Object.keys(satelliteData).length !== 0) {
            // generate current positions for the group of satellites
            let currentPos = [];
            let currentCoverage = [];
            let currentFuturePaths = [];
            let currentPastPaths = [];

            let now = new Date();
            now.setMinutes(now.getMinutes() + sliderTimeOffset);
            let [latitude, longitude, altitude, velocity] = getSatelliteLatLon(
                satelliteData['tle1'],
                satelliteData['tle2'],
                now
            );

            // set satellite data
            setSatelliteName(satelliteData['name']);
            setSatelliteLat(latitude);
            setSatelliteLon(longitude);
            setSatelliteAltitude(altitude);
            setSatelliteVelocity(velocity);

            // focus map on satellite, center on latitude only
            let mapCoords = MapObject.getCenter();
            MapObject.setView([mapCoords.lat, longitude], MapObject.getZoom());

            // calculate paths
            let paths = getSatellitePaths([
                satelliteData['tle1'],
                satelliteData['tle2']
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

            if (showTooltip) {
                currentPos.push(<Marker key={"marker-"+satelliteData['norad_id']} position={[latitude, longitude]}
                                        icon={satelliteIcon}>
                    <ThemedLeafletTooltip direction="bottom" offset={[0, 10]} opacity={0.9} permanent>
                        {satelliteData['name']} - {parseInt(altitude) + " km, " + velocity.toFixed(2) + " km/s"}
                    </ThemedLeafletTooltip>
                </Marker>);
            } else {
                currentPos.push(<Marker key={"marker-"+satelliteData['norad_id']} position={[latitude, longitude]}
                                        icon={satelliteIcon}>
                </Marker>);
            }

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
        } else {
            //console.warn("No satellite data found for norad id: ", noradId, satelliteData);
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

    const fetchSatelliteData = function(noradId) {
        socket.emit("data_request", "get-satellite", noradId, (response) => {
            if (response['success'] && response.data[0]) {
                setSatelliteData(response.data[0]);
            } else {
                enqueueSnackbar(`Failed to get satellite data for norad id: ${noradId} (${response.message})`, {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
        });
    }

    useEffect(() => {
        if (noradId) {
            fetchSatelliteData(noradId);
        }

        return () => {

        };
    }, []);

    useEffect(()=>{
        satelliteUpdate(new Date());
        let timer = setInterval(()=>{
            let now = new Date();
            satelliteUpdate(now);
        }, 1000);

        return ()=> {
            clearInterval(timer);
        };

    },[noradId, satelliteData, orbitProjectionDuration, pastOrbitLineColor, futureOrbitLineColor,
        satelliteCoverageColor, sliderTimeOffset, showTooltip, showPastOrbitPath, showFutureOrbitPath]);

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
                <MapTitleBar className={"react-grid-draggable window-title-bar"}>
                    Tracking {satelliteName || "-"} {satelliteAltitude.toFixed(2)} km, {satelliteVelocity.toFixed(2)} km/s
                </MapTitleBar>
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
                <MapArrowControls mapObject={MapObject}/>
                <MapSlider handleSliderChange={handleSliderChange}/>

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
                initialShowTooltip={showTooltip}
                handleShowTooltip={handleShowTooltip}
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
            <TitleBar className={"react-grid-draggable"}>Satellite info</TitleBar>
            <Table size="small" style={{ width: '100%' }}>
                <TableBody>
                    <TableRow>
                        <TableCell><strong>Name:</strong></TableCell>
                        <TableCell>{satelliteData['name'] || "n/a"}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell><strong>Latitude:</strong></TableCell>
                        <TableCell>{satelliteLat ? satelliteLat.toFixed(4) : "n/a"}°</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell><strong>Longitude:</strong></TableCell>
                        <TableCell>{satelliteLon ? satelliteLon.toFixed(4) : "n/a"}°</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell><strong>Altitude:</strong></TableCell>
                        <TableCell>{satelliteAltitude ? satelliteAltitude.toFixed(2) : "n/a"} km</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell><strong>Velocity:</strong></TableCell>
                        <TableCell>{satelliteVelocity ? satelliteVelocity.toFixed(2) : "n/a"} km/s</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell><strong>Status:</strong></TableCell>
                        <TableCell>{satelliteData['status']? betterStatusValue(satelliteData['status']): "n/a"}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell><strong>Launch Date:</strong></TableCell>
                        <TableCell>{satelliteData['launched']? betterDateTimes(satelliteData['launched']) :"n/a"}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell><strong>Countries:</strong></TableCell>
                        <TableCell>{satelliteData['countries']? renderCountryFlags(satelliteData['countries']): "n/a"}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell><strong>Transmitters:</strong></TableCell>
                        <TableCell>{satelliteData['transmitters'] ? satelliteData['transmitters'].length : "n/a"}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>

        </StyledIslandParentScrollbar>,
        <StyledIslandParentScrollbar key="passes">
            <TitleBar className={"react-grid-draggable window-title-bar"}>Next passes</TitleBar>
            <div style={{ padding:'0rem 1rem 1rem 1rem' }}>
                <h3>Next 24-hour Passes</h3>
                <p>Pass data, etc.</p>
            </div>
        </StyledIslandParentScrollbar>,
        <StyledIslandParentScrollbar key="satselector">
            <SatSelectorIsland initialNoradId={noradId} initialGroupId={groupId} handleSelectSatelliteId={handleSelectSatelliteId}/>
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
});

export default TargetSatelliteTrack;
