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
import {moonIcon, sunIcon, homeIcon, satelliteIcon} from '../common/icons.jsx';
import SettingsIsland from "../common/map-settings.jsx";
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
    TitleBar,
    getTimeFromISO,
    humanizeFutureDateInMinutes,
    ThemedStackIsland, betterStatusValue, betterDateTimes, renderCountryFlagsCSV, StyledIslandParentNoScrollbar
} from "../common/common.jsx";
import {getSatellitePaths, getSatelliteCoverageCircle, getSatelliteLatLon} from '../common/tracking-logic.jsx';
import {enqueueSnackbar} from "notistack";
import {useSocket} from "../common/socket.jsx";
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import {useDispatch, useSelector} from "react-redux";
import {
    setShowPastOrbitPath,
    setShowFutureOrbitPath,
    setShowSatelliteCoverage,
    setShowSunIcon,
    setShowMoonIcon,
    setShowTerminatorLine,
    setShowTooltip,
    setGridEditable,
    setSelectedSatellites,
    setPastOrbitLineColor,
    setFutureOrbitLineColor,
    setSatelliteCoverageColor,
    setOrbitProjectionDuration,
    setTileLayerID,
    setMapZoomLevel,
    setLocation,
    setLocationId,
    setLocationUserId,
    setSatelliteGroupId
} from './overview-sat-slice.jsx';
import NextPassesGroupIsland from "./overview-sat-passes.jsx";

const storageMapZoomValueKey = "overview-map-zoom-level";

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


function GlobalSatelliteTrack() {

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
        mapObject,
        satelliteGroupId,
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
                resizeHandles: ['se','ne','nw','sw','n','s','e','w'],
            },
            {
                i: 'satselector',
                x: 11,
                y: 0,
                w: 2,
                h: 3,
                resizeHandles: ['se','ne','nw','sw','n','s','e','w'],
            },
            {
                i: 'map-settings',
                x: 10,
                y: 4,
                w: 2,
                h: 12,
                minW: 2,
                maxW: 2,
                minH: 12,
                maxH: 12,
            },
            {
                i: 'passes',
                x: 0,
                y: 14,
                w: 8,
                h: 10,
                minH: 7,
                resizeHandles: ['se','ne','nw','sw','n','s','e','w']
            },
        ]
    };

    // globalize the callback
    handleSetGridEditableOverview = useCallback((value) => {
        dispatch(setGridEditable(value));
    }, [gridEditable]);
    
    const handleShowPastOrbitPath = useCallback((value) => {
        dispatch(setShowPastOrbitPath(value));
    }, [showPastOrbitPath]);

    const handleShowFutureOrbitPath = useCallback((value) => {
        dispatch(setShowFutureOrbitPath(value));
    }, [showFutureOrbitPath]);

    const handleShowSatelliteCoverage = useCallback((value) => {
        dispatch(setShowSatelliteCoverage(value));
    }, [showSatelliteCoverage]);

    const handleSetShowSunIcon = useCallback((value) => {
        dispatch(setShowSunIcon(value));
    }, [showSunIcon]);

    const handleSetShowMoonIcon = useCallback((value) => {
        dispatch(setShowMoonIcon(value));
    }, [showMoonIcon]);

    const handleShowTerminatorLine = useCallback((value) => {
        dispatch(setShowTerminatorLine(value));
    }, [showTerminatorLine]);

    const handlePastOrbitLineColor = useCallback((color) => {
        dispatch(setPastOrbitLineColor(color));
    }, [pastOrbitLineColor]);

    const handleFutureOrbitLineColor = useCallback((color) => {
        dispatch(setFutureOrbitLineColor(color));
    }, [futureOrbitLineColor]);

    const handleSatelliteCoverageColor = useCallback((color) => {
        dispatch(setSatelliteCoverageColor(color));
    }, [satelliteCoverageColor]);

    const handleOrbitProjectionDuration = useCallback((minutes) => {
        dispatch(setOrbitProjectionDuration(minutes));
    }, [orbitProjectionDuration]);

    const handleTileLayerID = useCallback((id) => {
        dispatch(setTileLayerID(id));
    }, [tileLayerID]);

    const handleGroupSatelliteSelection = useCallback((satellites) => {
        dispatch(setSelectedSatellites(satellites));
    }, [selectedSatellites]);

    const handleSetMapZoomLevel = useCallback((zoomLevel) => {
        dispatch(setMapZoomLevel(zoomLevel));
    }, [mapZoomLevel]);

    const handleShowTooltip = useCallback((value) => {
        dispatch(setShowTooltip(value));
    }, [showTooltip]);

    const handleSatelliteGroupIdChange = useCallback((groupid) => {
        dispatch(setSatelliteGroupId(groupid));
    }, [selectedSatellites]);

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
        }, 2000);
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
            let noradid = satellite['norad_id'];
            let [lat, lon, altitude, velocity] = getSatelliteLatLon(
                satellite['tle1'],
                satellite['tle2'],
                now);

            let paths = {};
            // calculate paths
            paths = getSatellitePaths([
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
                    dashArray: "4 4"
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

            const onMarkerMouseOver = (event, noradId) => {
                console.log(noradId, event);
            };

            const markerEventHandlers = {
                mouseover: (event) => (onMarkerMouseOver(event, satellite['norad_id'])),
            }

            if (showTooltip) {
                currentPos.push(<Marker key={"marker-"+satellite['name']} position={[lat, lon]} icon={satelliteIcon}
                                        eventHandlers={markerEventHandlers}>
                    <ThemedLeafletTooltip direction="bottom" offset={[0, 10]} opacity={0.9} permanent={true}>
                        {satellite['name']} - {parseInt(altitude) + " km, " + velocity.toFixed(2) + " km/s"}
                    </ThemedLeafletTooltip>
                </Marker>);
            } else {
                currentPos.push(<Marker key={"marker-"+satellite['name']} position={[lat, lon]} icon={satelliteIcon}
                                        eventHandlers={markerEventHandlers}>
                </Marker>);
            }

            let coverage = [];
            coverage = getSatelliteCoverageCircle(lat, lon, altitude, 360);
            currentCoverage.push(<Polyline
                noClip={true}
                key={"coverage-"+satellite['name']}
                pathOptions={{
                    color: satelliteCoverageColor,
                    weight: 1,
                    fill: true,
                    opacity: 0.75,
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
        dispatch(setMapZoomLevel(initialMapZoom));

        return () => {

        };
    }, []);

    // update the satellites position, day/night terminator every second
    useEffect(()=>{
        satelliteUpdate(new Date());
        const timer = setInterval(()=>{
            satelliteUpdate(new Date())
        }, 2000);

        return ()=> {
            clearInterval(timer);
        };
    },[selectedSatellites, showPastOrbitPath, showFutureOrbitPath, showSatelliteCoverage, showSunIcon, showMoonIcon,
        showTerminatorLine, pastOrbitLineColor, futureOrbitLineColor, satelliteCoverageColor, orbitProjectionDuration,
        mapZoomLevel, showTooltip]);

    useEffect(() => {
        socket.emit('data_request', 'get-location-for-user-id', null, (response) => {
            if (response['success']) {
                if (response['data']) {
                    dispatch(setLocation({
                        lat: parseFloat(response['data']['lat']),
                        lon: parseFloat(response['data']['lon']),
                    }));
                    dispatch(setLocationId(response['data']['id']));
                    dispatch(setLocationUserId(response['data']['userid']));
                } else {
                    enqueueSnackbar('No location found in the backend, please set one', {
                        variant: 'info',
                    })
                }
            } else {
                enqueueSnackbar('Failed to get home location from backend', {
                    variant: 'error',
                })
            }
        });
        return () => {

        };
    }, []);

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
                <MapTitleBar className={"react-grid-draggable window-title-bar"}>Global map</MapTitleBar>
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
                            weight: 0
                        }}
                    />
                )}

                {terminatorLine.length>1 && showTerminatorLine && (
                    <Polyline
                        positions={terminatorLine}
                        pathOptions={{
                            color:'white',
                            weight:1,
                            opacity: 0.2,
                        }}
                    />
                )}
                {InternationalDateLinePolyline()}
                <Marker position={[location.lat, location.lon]} icon={homeIcon} opacity={0.4}/>
                {showPastOrbitPath? currentPastSatellitesPaths: null}
                {showFutureOrbitPath? currentFutureSatellitesPaths: null}
                {currentSatellitesPosition}
                {showSatelliteCoverage? currentSatellitesCoverage: null}
                <MapStatusBar/>
                <MapArrowControls mapObject={mapObject}/>
            </MapContainer>
        </StyledIslandParent>,
        <StyledIslandParentScrollbar key="map-settings">
            <SettingsIsland
                initialShowPastOrbitPath={showPastOrbitPath}
                initialShowFutureOrbitPath={showFutureOrbitPath}
                initialShowSatelliteCoverage={showSatelliteCoverage}
                initialShowSunIcon={showSunIcon}
                initialShowMoonIcon={showMoonIcon}
                initialPastOrbitLineColor={pastOrbitLineColor}
                initialFutureOrbitLineColor={futureOrbitLineColor}
                initialSatelliteCoverageColor={satelliteCoverageColor}
                initialOrbitProjectionDuration={orbitProjectionDuration}
                initialTileLayerID={tileLayerID}
                initialShowTooltip={showTooltip}
                initialShowTerminatorLine={showTerminatorLine}
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
                handleShowTooltip={handleShowTooltip}
                handleTileLayerID={handleTileLayerID}
            />
        </StyledIslandParentScrollbar>,
        <StyledIslandParentScrollbar key={"satselector"}>
            <OverviewSatelliteGroupSelector
                handleGroupSatelliteSelection={handleGroupSatelliteSelection}
                handleSatelliteGroupIdChange={handleSatelliteGroupIdChange}
            />
        </StyledIslandParentScrollbar>,
        <StyledIslandParentNoScrollbar key="passes">
            <NextPassesGroupIsland groupId={satelliteGroupId}/>
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
}

export default GlobalSatelliteTrack;
