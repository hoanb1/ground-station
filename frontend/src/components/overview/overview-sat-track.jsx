import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';
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
import 'leaflet-fullscreen/dist/Leaflet.fullscreen.js';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'leaflet/dist/leaflet.css';
import {duration, styled} from "@mui/material/styles";
import createTerminatorLine from '../common/terminator-line.jsx';
import {getSunMoonCoords} from "../common/sunmoon.jsx";
import {moonIcon, sunIcon, homeIcon, satelliteIcon, satelliteIcon2} from '../common/icons.jsx';
import MapSettingsIsland from "../common/map-settings.jsx";
import {Box, Button, Fab} from "@mui/material";
import HomeIcon from '@mui/icons-material/Home';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus';
import {getTileLayerById, tileLayers} from "../common/tile-layers.jsx";
import OverviewSatelliteGroupSelector from "./overview-sat-selector.jsx";
import {
    StyledIslandParent,
    StyledIslandParentScrollbar,
    MapTitleBar,
    ThemedLeafletTooltip,
    MapStatusBar,
    InternationalDateLinePolyline,
    MapArrowControls,
    ThemedStackIsland,
    betterStatusValue,
    betterDateTimes,
    renderCountryFlagsCSV,
    StyledIslandParentNoScrollbar,
    SimpleTruncatedHtml, getClassNamesBasedOnGridEditing,
} from "../common/common.jsx";
import {
    getSatellitePaths,
    getSatelliteCoverageCircle,
    getSatelliteLatLon,
    isSatelliteVisible
} from '../common/tracking-logic.jsx';
import {enqueueSnackbar} from "notistack";
import {useSocket} from "../common/socket.jsx";
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import {useDispatch, useSelector} from "react-redux";
import {
    setShowTooltip,
    setGridEditable,
    setMapZoomLevel,
    setOpenMapSettingsDialog,
    setNextPassesHours,
} from './overview-sat-slice.jsx';
import NextPassesGroupIsland from "./overview-sat-passes.jsx";
import SettingsIcon from "@mui/icons-material/Settings";
import MapSettingsIslandDialog from './map-settings-dialog.jsx';
import Typography from "@mui/material/Typography";
import CoordinateGrid from "../common/mercator-grid.jsx";
import WeatherDisplay from "./weather-card.jsx";
import SatelliteInfoCard from "./overview-sat-info.jsx";


const storageMapZoomValueKey = "overview-map-zoom-level";

const viewSatelliteLimit = 100;

let MapObject = null;

// global callback for dashboard editing here
export let handleSetGridEditableOverview = function () {};

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

const ThemedDiv = styled('div')(({theme}) => ({
    backgroundColor: theme.palette.background.paper,
}));

function getMapZoomFromStorage() {
    const savedZoomLevel = localStorage.getItem(storageMapZoomValueKey);
    return savedZoomLevel ? parseFloat(savedZoomLevel) : 1.4;
}

const GlobalSatelliteTrack = React.memo(function () {

    const {socket} = useSocket();
    const dispatch = useDispatch();
    const {
        showPastOrbitPath,
        showFutureOrbitPath,
        showSatelliteCoverage,
        showSunIcon,
        showMoonIcon,
        showTerminatorLine,
        showTooltip,
        gridEditable,
        selectedSatellites,
        pastOrbitLineColor,
        futureOrbitLineColor,
        satelliteCoverageColor,
        orbitProjectionDuration,
        tileLayerID,
        mapZoomLevel,
        satelliteGroupId,
        openMapSettingsDialog,
        nextPassesHours,
        showGrid,
        selectedSatelliteId,
    } = useSelector(state => state.overviewSatTrack);
    const { location, } = useSelector((state) => state.location);
    const [currentPastSatellitesPaths, setCurrentPastSatellitesPaths] = useState([]);
    const [currentFutureSatellitesPaths, setCurrentFutureSatellitesPaths] = useState([]);
    const [currentSatellitesPosition, setCurrentSatellitesPosition] = useState([]);
    const [currentSatellitesCoverage, setCurrentSatellitesCoverage] = useState([]);
    const [terminatorLine, setTerminatorLine] = useState([]);
    const [daySidePolygon, setDaySidePolygon] = useState([]);
    const [sunPos, setSunPos] = useState(null);
    const [moonPos, setMoonPos] = useState(null);

    const ResponsiveReactGridLayout = useMemo(() => WidthProvider(Responsive), [gridEditable]);

    // Default layout if none in localStorage
    const defaultLayouts = {
        lg: [
            {
                i: 'map',
                x: 0,
                y: 4,
                w: 10,
                h: 18,
                resizeHandles: ['se','ne','nw','sw','s','e','w'],
            },
            {
                i: 'satselector',
                x: 11,
                y: 0,
                w: 2,
                h: 3,
                resizeHandles: ['se','ne','nw','sw','s','e','w'],
            },
            {
                i: 'passes',
                x: 0,
                y: 14,
                w: 8,
                h: 10,
                minH: 7,
                resizeHandles: ['se','ne','nw','sw','s','e','w']
            },
            {
                i: 'weather',
                x: 0,
                y: 14,
                w: 8,
                h: 2,
                minH: 7,
                resizeHandles: ['se','ne','nw','sw','s','e','w']
            },
            {
                i: 'sat-info',
                x: 0,
                y: 14,
                w: 8,
                h: 2,
                minH: 7,
                resizeHandles: ['se','ne','nw','sw','s','e','w']
            },
        ]
    };

    // globalize the callback
    handleSetGridEditableOverview = useCallback((value) => {
        dispatch(setGridEditable(value));
    }, [gridEditable]);

    const handleSetMapZoomLevel = useCallback((zoomLevel) => {
        dispatch(setMapZoomLevel(zoomLevel));
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

    function CenterHomeButton() {
        const targetCoordinates = [location.lat, location.lon];
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
            MapObject.toggleFullscreen();
        };
        return <Fab size="small" color="primary" aria-label="Go fullscreen" onClick={()=>{handleMapFullscreen()}}>
            <FullscreenIcon />
        </Fab>;
    }

    function satelliteUpdate(now) {
        let currentPos = [];
        let currentCoverage = [];
        let currentFuturePaths = [];
        let currentPastPaths = [];
        let satIndex = 0;

        selectedSatellites.forEach(satellite => {
            try {
                if (satIndex++ >= viewSatelliteLimit) {
                    return;
                }

                let noradid = satellite['norad_id'];
                let [lat, lon, altitude, velocity] = getSatelliteLatLon(
                    satellite['norad_id'],
                    satellite['tle1'],
                    satellite['tle2'],
                    now);

                console.info(selectedSatelliteId, noradid);

                if (selectedSatelliteId === noradid) {

                    // calculate paths
                    let paths = getSatellitePaths([
                        satellite['tle1'],
                        satellite['tle2']
                    ], orbitProjectionDuration);

                    // past path
                    currentPastPaths.push(<Polyline
                        key={`past-path-${noradid}`}
                        positions={paths.past}
                        pathOptions={{
                            color: pastOrbitLineColor,
                            weight: 1,
                            opacity: 0.5,
                            smoothFactor: 1,
                        }}
                    />)

                    // future path
                    currentFuturePaths.push(<Polyline
                        key={`future-path-${noradid}`}
                        positions={paths.future}
                        pathOptions={{
                            color: futureOrbitLineColor,
                            weight: 1,
                            opacity: 1,
                            dashArray: "3 3",
                            smoothFactor: 1,
                        }}
                    />)
                }


                const onMarkerMouseOver = (event, noradId) => {
                    //console.log(noradId, event);
                };

                const markerEventHandlers = {
                    mouseover: (event) => (onMarkerMouseOver(event, satellite['norad_id'])),
                }

                const isVisible = isSatelliteVisible(satellite['tle1'], satellite['tle2'], now, location);

                if (isVisible) {
                    let coverage = getSatelliteCoverageCircle(lat, lon, altitude, 360);
                    currentCoverage.push(<Polyline
                        noClip={true}
                        key={"coverage-" + satellite['name']}
                        pathOptions={{
                            color: satelliteCoverageColor,
                            weight: 1,
                            fill: true,
                            opacity: 0.75,
                            fillOpacity: 0.15,
                        }}
                        positions={coverage}
                    />);
                }

                if (showTooltip) {
                    currentPos.push(<Marker key={"marker-" + satellite['norad_id']} position={[lat, lon]}
                                            icon={satelliteIcon2}
                                            eventHandlers={markerEventHandlers}>
                        <ThemedLeafletTooltip direction="bottom" offset={[0, 10]} permanent={true}>
                            {satellite['name']} - {parseInt(altitude) + " km, " + velocity.toFixed(2) + " km/s"}
                        </ThemedLeafletTooltip>
                    </Marker>);
                } else {
                    currentPos.push(<Marker key={"marker-" + satellite['norad_id']} position={[lat, lon]}
                                            icon={satelliteIcon2}
                                            eventHandlers={markerEventHandlers}>
                    </Marker>);
                }
            } catch (e) {
                console.error(`Error while updating satellite ${satellite['name']} (${satellite['norad_id']}): ${e}`);
            }
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
        dispatch(setMapZoomLevel(initialMapZoom));

        return () => {

        };
    }, []);

    // update the satellites position, day/night terminator every 3 seconds
    useEffect(()=>{
        satelliteUpdate(new Date());
        const satelliteUpdateTimer = setInterval(()=>{
            satelliteUpdate(new Date())
        }, 3000);

        return ()=> {
            clearInterval(satelliteUpdateTimer);
        };
    },[selectedSatellites, showPastOrbitPath, showFutureOrbitPath, showSatelliteCoverage, showSunIcon, showMoonIcon,
        showTerminatorLine, pastOrbitLineColor, futureOrbitLineColor, satelliteCoverageColor, orbitProjectionDuration,
        mapZoomLevel, showTooltip, selectedSatelliteId]);

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

    function MapSettingsButton() {
        const dispatch = useDispatch();
        const handleClick = () => {
            dispatch(setOpenMapSettingsDialog(true));
        };

        return <Fab size="small" color="primary" aria-label="Go home" onClick={()=>{handleClick()}}>
            <SettingsIcon />
        </Fab>;
    }

    useEffect(() => {
        // zoom in and out a bit to fix the zoom factor issue
        const zoomLevel = MapObject.getZoom();
        const loc = MapObject.getCenter();
        setTimeout(() => {
            MapObject.setView([loc.lat, loc.lng], zoomLevel - 0.25);
            setTimeout(() => {
                MapObject.setView([loc.lat, loc.lng], zoomLevel);
            }, 500);
        }, 0);

        return () => {

        };
    }, [tileLayerID]);

    // pre-made ResponsiveGridLayout
    let gridContents = [
        <StyledIslandParent key="map">
            <MapContainer
                fullscreenControl={true}
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
                <MapTitleBar className={getClassNamesBasedOnGridEditing(gridEditable,  ["window-title-bar"])}>Birds eye view</MapTitleBar>
                <MapEventComponent handleSetMapZoomLevel={handleSetMapZoomLevel}/>
                <TileLayer
                    url={getTileLayerById(tileLayerID)['url']}
                    attribution="Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL."
                />
                <Box sx={{ '& > :not(style)': { m: 1 } }} style={{right: 5, top: 30, position: 'absolute'}}>
                    <MapSettingsButton/>
                    <CenterHomeButton/>
                    <CenterMapButton/>
                    <FullscreenMapButton/>
                </Box>
                <MapSettingsIslandDialog/>
                {sunPos && showSunIcon? <Marker position={sunPos} icon={sunIcon} opacity={0.5}></Marker>: null}
                {moonPos && showMoonIcon? <Marker position={moonPos} icon={moonIcon} opacity={0.5}></Marker>: null}

                {daySidePolygon.length>1 && showTerminatorLine && (
                    <Polygon
                        positions={daySidePolygon}
                        pathOptions={{
                            fillColor: 'black',
                            fillOpacity: 0.4,
                            color: 'white',
                            opacity: 0.5,
                            weight: 0,
                            smoothFactor: 1,
                        }}
                    />
                )}

                {terminatorLine.length>1 && showTerminatorLine && (
                    <Polyline
                        positions={terminatorLine}
                        pathOptions={{
                            color:'white',
                            weight: 1,
                            opacity: 0.1,
                        }}
                    />
                )}
                {InternationalDateLinePolyline()}
                <Marker position={[location.lat, location.lon]} icon={homeIcon} opacity={0.8}/>
                {showPastOrbitPath? currentPastSatellitesPaths: null}
                {showFutureOrbitPath? currentFutureSatellitesPaths: null}
                {currentSatellitesPosition}
                {showSatelliteCoverage? currentSatellitesCoverage: null}
                <MapStatusBar>
                    <SimpleTruncatedHtml className={"attribution"} htmlString={`<a href="https://leafletjs.com" title="A JavaScript library for interactive maps" target="_blank"
                       rel="noopener noreferrer">Leaflet</a> | ${getTileLayerById(tileLayerID)['attribution']}`}/>
                </MapStatusBar>
                <MapArrowControls mapObject={MapObject}/>
                {showGrid && (
                    <CoordinateGrid
                        latInterval={15}
                        lngInterval={15}
                        latColor="#FFFFFF"
                        lngColor="#FFFFFF"
                        weight={1}
                        opacity={0.5}
                        showLabels={false}
                    />
                )}
            </MapContainer>
        </StyledIslandParent>,
        <StyledIslandParentScrollbar key={"satselector"}>
            <OverviewSatelliteGroupSelector />
        </StyledIslandParentScrollbar>,
        <StyledIslandParentNoScrollbar key="passes">
            <NextPassesGroupIsland/>
        </StyledIslandParentNoScrollbar>,
        <StyledIslandParentNoScrollbar key="weather">
            <WeatherDisplay latitude={location.lat} longitude={location.lon} apiKey={"471aacccad269b47ed7d2aa3369c9f71"}/>
        </StyledIslandParentNoScrollbar>,
        <StyledIslandParentNoScrollbar key="sat-info">
            <SatelliteInfoCard/>
        </StyledIslandParentNoScrollbar>,

    ];

    let ResponsiveGridLayoutParent = null;

    if (gridEditable === true) {
        ResponsiveGridLayoutParent =
            <ResponsiveReactGridLayout
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
        ResponsiveGridLayoutParent =
            <ResponsiveReactGridLayout
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

export default GlobalSatelliteTrack;
