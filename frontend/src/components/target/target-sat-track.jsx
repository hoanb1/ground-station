import React, {useState, useEffect, useCallback, useMemo, memo, useRef} from 'react';
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
import createTerminatorLine from '../common/terminator-line.jsx';
import {getSunMoonCoords} from "../common/sunmoon.jsx";
import {moonIcon, sunIcon, homeIcon, satelliteIcon} from '../common/icons.jsx';
import SettingsIsland from "../common/map-settings.jsx";
import {Box, Fab, Slider} from "@mui/material";
import HomeIcon from '@mui/icons-material/Home';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus';
import {getTileLayerById} from "../common/tile-layers.jsx";
import SatSelectorIsland from "./target-sat-selector.jsx";
import {
    InternationalDateLinePolyline, MapArrowControls,
    MapStatusBar,
    MapTitleBar, renderCountryFlagsCSV,
    StyledIslandParent, StyledIslandParentNoScrollbar,
    StyledIslandParentScrollbar, ThemedLeafletTooltip,
    ThemedStackIsland,
} from "../common/common.jsx";
import {getSatelliteCoverageCircle, getSatelliteLatLon, getSatellitePaths} from "../common/tracking-logic.jsx";
import {enqueueSnackbar} from "notistack";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {
    setSatGroupId, setTrackingStateBackend, setShowPastOrbitPath,
    setShowFutureOrbitPath,
    setShowSatelliteCoverage,
    setShowSunIcon,
    setShowMoonIcon,
    setShowTerminatorLine,
    setShowTooltip,
    setTerminatorLine,
    setDaySidePolygon,
    setPastOrbitLineColor,
    setFutureOrbitLineColor,
    setSatelliteCoverageColor,
    setOrbitProjectionDuration,
    setTileLayerID,
    setMapZoomLevel,
    setSunPos,
    setMoonPos,
    setGridEditable,
    setSliderTimeOffset,
    setLocation,
    setLoading, setSatelliteData,

} from './target-sat-slice.jsx'
import SatelliteInfoIsland from "./target-sat-info.jsx";
import NextPassesIsland from "./target-next-passes.jsx";


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
            label: '+15',
        },
        {
            value: -15,
            label: '-15',
        },
        {
            value: 30,
            label: '+30m',
        },
        {
            value: -30,
            label: '-30m',
        },
        {
            value: 45,
            label: '+45',
        },
        {
            value: -45,
            label: '-45',
        },
        {
            value: 60,
            label: '+60m',
        },
        {
            value: -60,
            label: '-60m',
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
            opacity: 0.8,
        }}>
            <Slider
                valueLabelDisplay="on"
                marks={marks}
                size="medium"
                track={false}
                aria-label=""
                defaultValue={""}
                onChange={(e, value) => {
                    handleSliderChange(value);
                }}
                min={-60}
                max={60}
                sx={{
                    height: 20,
                    width: '70%',
                }}
            />
        </Box>
    );
}


const TargetSatelliteTrack = React.memo(function () {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const {
        satelliteData,
        groupId,
        satelliteId: noradId,
        showPastOrbitPath,
        showFutureOrbitPath,
        showSatelliteCoverage,
        showSunIcon,
        showMoonIcon,
        showTerminatorLine,
        showTooltip,
        terminatorLine,
        daySidePolygon,
        pastOrbitLineColor,
        futureOrbitLineColor,
        satelliteCoverageColor,
        orbitProjectionDuration,
        tileLayerID,
        mapZoomLevel,
        sunPos,
        moonPos,
        gridEditable,
        sliderTimeOffset,
        location,
    } = useSelector(state => state.targetSatTrack);

    const [currentPastSatellitesPaths, setCurrentPastSatellitesPaths] = useState([]);
    const [currentFutureSatellitesPaths, setCurrentFutureSatellitesPaths] = useState([]);
    const [currentSatellitesPosition, setCurrentSatellitesPosition] = useState([]);
    const [currentSatellitesCoverage, setCurrentSatellitesCoverage] = useState([]);

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
                i: 'map-settings',
                x: 8,
                y: 9,
                w: 2,
                h: 12,
                minW: 2,
                maxW: 2,
                minH: 12,
                maxH: 12,
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
    handleSetGridEditableTarget = useCallback((value) => {
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

    const handleSelectSatelliteId = useCallback((noradId) => {
        const data = { 'norad_id': noradId, 'state': 'tracking', 'group_id': groupId };
        setLoading(true);
        dispatch(setTrackingStateBackend({ socket, data, }))
            .unwrap()
            .then((response) => {
                const satelliteData = response['satellite_data'];
                dispatch(setSatelliteData(satelliteData));
            })
            .catch((error) => {
                enqueueSnackbar(error, {
                    variant: 'error',
                });
            });
    }, [noradId]);

    const handleSetMapZoomLevel = useCallback((zoomLevel) => {
        (setMapZoomLevel(zoomLevel));
    }, [mapZoomLevel]);

    const handleSliderChange = useCallback((value) => {
        dispatch(setSliderTimeOffset(value));
    }, []);

    const handleShowTooltip = useCallback((value) => {
        dispatch(setShowTooltip(value));
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

    const satelliteUpdate = function (now) {
        if (Object.keys(satelliteData['details']['name']).length !== 0) {
            // generate current positions for the group of satellites
            let currentPos = [];
            let currentCoverage = [];
            let currentFuturePaths = [];
            let currentPastPaths = [];

            let now = new Date();
            now.setMinutes(now.getMinutes() + sliderTimeOffset);
            let [latitude, longitude, altitude, velocity] = getSatelliteLatLon(
                satelliteData['details']['tle1'],
                satelliteData['details']['tle2'],
                now
            );

            // focus map on satellite, center on latitude only
            let mapCoords = MapObject.getCenter();
            MapObject.setView([latitude, longitude], MapObject.getZoom());

            // calculate paths
            let paths = getSatellitePaths([
                satelliteData['details']['tle1'],
                satelliteData['details']['tle2']
            ], orbitProjectionDuration);

            // past path
            currentPastPaths.push(<Polyline
                key={`past-path-${noradId}`}
                positions={paths.past}
                pathOptions={{
                    color: pastOrbitLineColor,
                    weight:1,
                    opacity:0.5,
                }}
            />)

            // future path
            currentFuturePaths.push(<Polyline
                key={`future-path-${noradId}`}
                positions={paths.future}
                pathOptions={{
                    color: futureOrbitLineColor,
                    weight:1,
                    opacity:1,
                    dashArray: "5 5"
                }}
            />)

            if (showTooltip) {
                currentPos.push(<Marker key={"marker-"+satelliteData['details']['norad_id']} position={[latitude, longitude]}
                                        icon={satelliteIcon}>
                    <ThemedLeafletTooltip direction="bottom" offset={[0, 10]} opacity={0.9} permanent>
                        {satelliteData['details']['name']} - {parseInt(altitude) + " km, " + velocity.toFixed(0) + " km/s"}
                    </ThemedLeafletTooltip>
                </Marker>);
            } else {
                currentPos.push(<Marker key={"marker-"+satelliteData['details']['norad_id']} position={[latitude, longitude]}
                                        icon={satelliteIcon}>
                </Marker>);
            }

            let coverage = [];
            coverage = getSatelliteCoverageCircle(latitude, longitude, altitude, 360);
            currentCoverage.push(<Polyline
                noClip={true}
                key={"coverage-"+satelliteData['details']['name']}
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
        dispatch(setTerminatorLine(terminatorLine));

        // Day side polygon
        const dayPoly = [...terminatorLine];
        dayPoly.push(dayPoly[dayPoly.length - 1]);
        dispatch(setDaySidePolygon(dayPoly));

        // sun and moon position
        const [sunPos, moonPos] = getSunMoonCoords();
        dispatch(setSunPos(sunPos));
        dispatch(setMoonPos(moonPos));
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

    useEffect(()=>{
        satelliteUpdate(new Date());

        return ()=> {
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
                boundsOptions={{padding: [300, 300]}}

            >
                <MapTitleBar className={"react-grid-draggable window-title-bar"}>
                    Tracking {satelliteData['details']['name'] || "-"} {(satelliteData['position']['alt']/1000).toFixed(2)} km, {satelliteData['position']['vel'].toFixed(2)} km/s
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
                <Marker position={[location.lat, location.lon]} icon={homeIcon} opacity={0.4}/>
                {showPastOrbitPath? currentPastSatellitesPaths: null}
                {showFutureOrbitPath? currentFutureSatellitesPaths: null}
                {currentSatellitesPosition}
                {showSatelliteCoverage? currentSatellitesCoverage: null}
                <MapStatusBar/>
                <MapArrowControls mapObject={MapObject}/>
                <MapSlider handleSliderChange={handleSliderChange}/>
            </MapContainer>
        </StyledIslandParent>,
        <StyledIslandParentScrollbar key="map-settings">
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
            <SatelliteInfoIsland/>
        </StyledIslandParentScrollbar>,
        <StyledIslandParentNoScrollbar key="passes">
            <NextPassesIsland noradId={noradId}/>
        </StyledIslandParentNoScrollbar>,
        <StyledIslandParentScrollbar key="satselector">
            <SatSelectorIsland initialNoradId={noradId} initialGroupId={groupId}/>
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
