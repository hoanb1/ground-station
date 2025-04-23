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
import {moonIcon, sunIcon, homeIcon, satelliteIcon, satelliteIcon2} from '../common/icons.jsx';
import MapSettingsIsland from "../common/map-settings.jsx";
import {Box, Fab, Slider} from "@mui/material";
import HomeIcon from '@mui/icons-material/Home';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus';
import SettingsIcon from '@mui/icons-material/Settings';
import {getTileLayerById} from "../common/tile-layers.jsx";
import SatSelectorIsland from "./target-sat-selector.jsx";
import {
    getClassNamesBasedOnGridEditing, humanizeAltitude, humanizeVelocity,
    InternationalDateLinePolyline, MapArrowControls,
    MapStatusBar,
    MapTitleBar, renderCountryFlagsCSV,
    StyledIslandParent, StyledIslandParentNoScrollbar,
    StyledIslandParentScrollbar, ThemedLeafletTooltip,
    ThemedStackIsland,
} from "../common/common.jsx";
import {enqueueSnackbar} from "notistack";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {
    setSatGroupId,
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
    setLoading,
    fetchSatellite,
    getTrackingStateFromBackend,
    setSatelliteId,
    setTargetMapSetting,
} from './target-sat-slice.jsx'
import SatelliteInfoIsland from "./target-sat-info.jsx";
import NextPassesIsland from "./target-next-passes.jsx";
import VideoWebRTCPlayer from "../common/video-webrtc.jsx";
import {setOpenMapSettingsDialog} from "./target-sat-slice.jsx";
import MapSettingsIslandDialog from './map-settings-dialog.jsx';
import {SimpleTruncatedHtml} from '../common/common.jsx';
import CoordinateGrid from "../common/mercator-grid.jsx";
import RotatorControl from "./rotator-control.jsx";
import RigControl from "./rig-control.jsx";
import CameraView from "../common/camera-view.jsx";
import MiniWaterfallDisplay from "./waterfall-view.jsx";
import {
    satellitePositionSelector,
    satelliteCoverageSelector,
    satelliteDetailsSelector,
    satelliteTrackingStateSelector,
    satellitePathsSelector,
    satelliteTransmittersSelector
} from './state-selectors.jsx';


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


const TargetSatelliteLayout = React.memo(function () {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const {
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
        openMapSettingsDialog,
        showGrid,
    } = useSelector(state => state.targetSatTrack);

    const satellitePosition = useSelector(satellitePositionSelector);
    const satelliteCoverage = useSelector(satelliteCoverageSelector);
    const satelliteDetails = useSelector(satelliteDetailsSelector);
    const satelliteTrackingState = useSelector(satelliteTrackingStateSelector);
    const satellitePaths = useSelector(satellitePathsSelector);
    const satelliteTransmitters = useSelector(satelliteTransmittersSelector);

    const { location } = useSelector(state => state.location);
    const [currentPastSatellitesPaths, setCurrentPastSatellitesPaths] = useState([]);
    const [currentFutureSatellitesPaths, setCurrentFutureSatellitesPaths] = useState([]);
    const [currentSatellitesPosition, setCurrentSatellitesPosition] = useState([]);
    const [currentSatellitesCoverage, setCurrentSatellitesCoverage] = useState([]);
    const coverageRef = useRef(null);

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
                resizeHandles: ['se','ne','nw','sw','s','e','w']
            },
            {
                i: 'satselector',
                x: 10,
                y: 0,
                w: 2,
                h: 4,
                resizeHandles: ['se','ne','nw','sw','s','e','w'],
            },
            {
                i: 'info',
                x: 10,
                y: 11,
                w: 2,
                h: 8,
                resizeHandles: ['se','ne','nw','sw','s','e','w']
            },
            {
                i: 'passes',
                x: 0,
                y: 14,
                w: 8,
                h: 10,
                minH: 6,
                resizeHandles: ['se','ne','nw','sw','s','e','w']
            },
            {
                i: 'rotator-control',
                x: 0,
                y: 14,
                w: 8,
                h: 10,
                minH: 6,
                resizeHandles: ['se','ne','nw','sw','s','e','w']
            },
            {
                i: 'rig-control',
                x: 0,
                y: 14,
                w: 8,
                h: 10,
                minH: 6,
                resizeHandles: ['se','ne','nw','sw','s','e','w']
            },
            {
                i: 'video',
                x: 10,
                y: 14,
                w: 2,
                h: 10,
                minH: 4,
                resizeHandles: ['se','ne','nw','sw','s','e','w']
            },
        ]
    };

    // globalize the callback
    handleSetGridEditableTarget = useCallback((value) => {
        dispatch(setGridEditable(value));
    }, [gridEditable]);

    const handleSetMapZoomLevel = useCallback((zoomLevel) => {
        dispatch(setMapZoomLevel(zoomLevel));
    }, [mapZoomLevel]);

    const handleSliderChange = useCallback((value) => {
        dispatch(setSliderTimeOffset(value));
    }, []);

    // we load any stored layouts from localStorage or fallback to default
    const [layouts, setLayouts] = useState(() => {
        const loaded = loadLayoutsFromLocalStorage();
        return loaded ?? defaultLayouts;
    });

    const handleWhenReady = (map) => {
        // map is ready
        MapObject = map.target;
    };

    useEffect(() => {
        const intervalId = setInterval(() => {
            if (MapObject) {
                MapObject.invalidateSize();
            }
        }, 1000);

        return () => {
            clearInterval(intervalId);
        };
    }, []);

    function MapSettingsButton() {
        const dispatch = useDispatch();
        const handleClick = () => {
            dispatch(setOpenMapSettingsDialog(true));
        };

        return <Fab size="small" color="primary" aria-label="Go home" onClick={()=>{handleClick()}}>
            <SettingsIcon />
        </Fab>;
    }

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
        if (Object.keys(satelliteDetails['name']).length !== 0) {

            const satelliteName = satelliteDetails['name'];
            const satelliteId = satelliteDetails['norad_id'];
            const latitude = satellitePosition['lat'];
            const longitude = satellitePosition['lon'];
            const altitude = satellitePosition['alt'];
            const velocity = satellitePosition['vel'];
            const paths = satellitePaths;
            const coverage = satelliteCoverage;

            // generate current positions for the group of satellites
            let currentPos = [];
            let currentCoverage = [];
            let currentFuturePaths = [];
            let currentPastPaths = [];

            // focus map on satellite, center on latitude only
            //let mapCoords = MapObject.getCenter();
            //MapObject.setView([latitude, longitude], MapObject.getZoom());

            if (paths) {
                // past path
                currentPastPaths.push(<Polyline
                    key={`past-path-${noradId}`}
                    positions={paths['past']}
                    pathOptions={{
                        color: pastOrbitLineColor,
                        weight: 2,
                        opacity: 1,
                        smoothFactor: 1,
                    }}
                />)

                // future path
                currentFuturePaths.push(<Polyline
                    key={`future-path-${noradId}`}
                    positions={paths['future']}
                    pathOptions={{
                        color: futureOrbitLineColor,
                        weight: 2,
                        opacity: 0.8,
                        dashArray: "3 3",
                        smoothFactor: 1,
                    }}
                />)
            }

            if (showTooltip) {
                currentPos.push(<Marker key={"marker-"+satelliteId} position={[latitude, longitude]}
                                        icon={satelliteIcon2}>
                    <ThemedLeafletTooltip direction="bottom" offset={[0, 10]} opacity={1} permanent>
                        {satelliteName} - {humanizeAltitude(altitude) + " km, " + humanizeVelocity(velocity) + " km/s"}
                    </ThemedLeafletTooltip>
                </Marker>);
            } else {
                currentPos.push(<Marker key={"marker-"+satelliteId} position={[latitude, longitude]}
                                        icon={satelliteIcon2}>
                </Marker>);
            }

            if (coverage) {
                //let coverage = [];
                //coverage = getSatelliteCoverageCircle(latitude, longitude, altitude, 360);
                currentCoverage.push(<Polyline
                    ref={coverageRef}
                    noClip={true}
                    key={"coverage-"+satelliteDetails['name']}
                    pathOptions={{
                        color: satelliteCoverageColor,
                        weight: 1,
                        fill: true,
                        fillOpacity: 0.2,
                    }}
                    positions={coverage}
                />);
            }

            setCurrentPastSatellitesPaths(currentPastPaths);
            setCurrentFutureSatellitesPaths(currentFuturePaths);
            setCurrentSatellitesPosition(currentPos);
            setCurrentSatellitesCoverage(currentCoverage);

        } else {
            //console.warn("No satellite data found for norad id: ", noradId, satelliteDetails);
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

    useEffect(() => {
        if (coverageRef.current) {
            // Fit the map to the polygon's bounds
            MapObject.fitBounds(coverageRef.current.getBounds(), {
                    padding: [30, 15],
                }
            );
        }
    }, [MapObject, satellitePosition, sliderTimeOffset, noradId]);

    useEffect(() => {
        // we do this here once onmount,
        // we set the norad id and group id, once only here
        dispatch(getTrackingStateFromBackend({ socket }))
            .unwrap()
            .then((response) => {
                    const noradId = response['value']['norad_id'];
                    const groupId = response['value']['group_id'];
                    dispatch(setSatelliteId(noradId));
                    dispatch(setSatGroupId(groupId))
            })
            .catch((error) => {
                enqueueSnackbar(`Failed to get tracking state: ${error}`, {
                    variant: 'error',
                });
            });

        return () => {
        };
    }, []);

    useEffect(() => {
        if (noradId) {
            dispatch(fetchSatellite({socket, noradId: noradId}));
        }

        return () => {

        };
    }, [noradId]);

    useEffect(()=>{
        satelliteUpdate(new Date());

        return ()=> {
        };

    },[satelliteDetails, satellitePosition, satellitePaths, satelliteCoverage, sliderTimeOffset, showTooltip,
        orbitProjectionDuration, tileLayerID, showPastOrbitPath, showFutureOrbitPath, showSatelliteCoverage,
        showSunIcon, showMoonIcon, showTerminatorLine, pastOrbitLineColor, futureOrbitLineColor,
        satelliteCoverageColor]);

    useEffect(() => {
        // zoom in and out a bit to fix the zoom factor issue
        if (MapObject) {
            const zoomLevel = MapObject.getZoom();
            const loc = MapObject.getCenter();
            setTimeout(() => {
                MapObject.setView([loc.lat, loc.lng], zoomLevel - 0.25);
                setTimeout(() => {
                    MapObject.setView([loc.lat, loc.lng], zoomLevel);
                }, 500);
            }, 0);
        }
        return () => {

        };
    }, [tileLayerID]);

    // pre-make the components
    let gridContents = [
        <StyledIslandParent key="map">
            <MapContainer
                center={[satellitePosition['lat'] || 0, satellitePosition['lon'] || 0]}
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
                <MapTitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>
                    Tracking {satelliteDetails['name'] || "-"} {(satellitePosition['alt']/1000).toFixed(2)} km, {satellitePosition['vel'].toFixed(2)} km/s
                </MapTitleBar>
                <MapEventComponent handleSetMapZoomLevel={handleSetMapZoomLevel}/>
                <TileLayer
                    url={getTileLayerById(tileLayerID)['url']}
                    attribution="Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL."
                />
                <Box sx={{ '& > :not(style)': { m: 1 } }} style={{right: 0, top: 30, position: 'absolute'}}>
                    <MapSettingsButton/>
                    <CenterHomeButton/>
                    <CenterMapButton/>
                    <FullscreenMapButton/>
                </Box>

                {sunPos && showSunIcon? <Marker position={sunPos} icon={sunIcon} opacity={0.5}></Marker>: null}
                {moonPos && showMoonIcon? <Marker position={moonPos} icon={moonIcon} opacity={0.5}></Marker>: null}

                {daySidePolygon.length>1 && showTerminatorLine && (
                    <Polygon
                        positions={daySidePolygon}
                        pathOptions={{
                            fillColor: 'black',
                            fillOpacity: 0.4,
                            color: 'white',
                            weight: 0,
                            smoothed: true,
                        }}
                    />
                )}

                {terminatorLine.length>1 && showTerminatorLine && (
                    <Polyline
                        positions={terminatorLine}
                        pathOptions={{
                            color: 'white',
                            weight: 1,
                            opacity: 0.2,
                            smoothFactor: 1,
                        }}
                    />
                )}

                {InternationalDateLinePolyline()}
                {location.lat && location.lon ?
                    <Marker position={[location.lat, location.lon]} icon={homeIcon} opacity={0.8}/> : null}
                {showPastOrbitPath? currentPastSatellitesPaths: null}
                {showFutureOrbitPath? currentFutureSatellitesPaths: null}
                {currentSatellitesPosition}
                {showSatelliteCoverage? currentSatellitesCoverage: null}
                <MapSettingsIslandDialog updateBackend={()=>{
                    const key = 'target-map-settings';
                    dispatch(setTargetMapSetting({socket, key: key}));
                }}/>
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
        <StyledIslandParentScrollbar key="info">
            <SatelliteInfoIsland/>
        </StyledIslandParentScrollbar>,
        <StyledIslandParentNoScrollbar key="passes">
        <NextPassesIsland/>
        </StyledIslandParentNoScrollbar>,
        <StyledIslandParentScrollbar key="satselector">
            <SatSelectorIsland initialNoradId={noradId} initialGroupId={groupId}/>
        </StyledIslandParentScrollbar>,
        <StyledIslandParentScrollbar key="video">
            <CameraView/>
        </StyledIslandParentScrollbar>,
        <StyledIslandParentScrollbar key="rotator-control">
            <RotatorControl/>
        </StyledIslandParentScrollbar>,
        <StyledIslandParentScrollbar key="rig-control">
            <RigControl/>
        </StyledIslandParentScrollbar>,
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
            draggableHandle={".react-grid-draggable"}
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
            draggableHandle={".react-grid-draggable"}
        >
            {gridContents}
        </ResponsiveReactGridLayout>;
    }

    return ResponsiveGridLayoutParent;
});

export default TargetSatelliteLayout;
