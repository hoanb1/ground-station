/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
    MapContainer,
    TileLayer,
    Marker,
    Polyline,
    Polygon,
    CircleMarker,
    Rectangle,
    useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {Box, Fab, useTheme} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus';
import SettingsIcon from '@mui/icons-material/Settings';
import {useDispatch, useSelector} from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    setOpenMapSettingsDialog,
    setMapZoomLevel,
    setSelectedSatelliteId,
    setSelectedSatellitePositions,
    setOverviewMapSetting,
} from './overview-slice.jsx';
import {getTileLayerById} from '../common/tile-layers.jsx';
import {homeIcon, satelliteIcon2, moonIcon, sunIcon} from '../common/dataurl-icons.jsx';
import {
    MapTitleBar,
    MapStatusBar,
    InternationalDateLinePolyline,
    MapArrowControls,
    SimpleTruncatedHtml,
    getClassNamesBasedOnGridEditing,
} from '../common/common.jsx';
import MapSettingsIslandDialog from './map-settings-dialog.jsx';
import CoordinateGrid from '../common/mercator-grid.jsx';
import SatelliteTrackSuggestion from './map-target-button.jsx';
import {
    calculateSatelliteAzEl,
    getSatelliteCoverageCircle,
    getSatelliteLatLon,
    getSatellitePaths,
    isSatelliteVisible,
} from '../common/tracking-logic.jsx';

import {setSatelliteData} from './overview-slice.jsx';

import SatelliteMarker from './map-tooltip.jsx';
import createTerminatorLine from '../common/terminator-line.jsx';
import {getSunMoonCoords} from '../common/sunmoon.jsx';
import {useSocket} from '../common/socket.jsx';
import {store} from '../common/store.jsx';

const viewSatelliteLimit = 100;

let MapObject = null;

// -------------------------------------------------
// Leaflet icon path fix for React
// -------------------------------------------------
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
});

const storageMapZoomValueKey = 'overview-map-zoom-level';

const SatelliteMapContainer = ({handleSetTrackingOnBackend}) => {
    const {socket} = useSocket();
    const dispatch = useDispatch();
    const { t } = useTranslation('overview');
    const theme = useTheme();
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
        selectedSatGroupId,
    } = useSelector((state) => state.overviewSatTrack);

    const {
        trackingState,
        satelliteId: trackingSatelliteId,
        selectedRadioRig,
        selectedRotator,
        selectedTransmitter,
        selectedSatellitePositions,
    } = useSelector((state) => state.targetSatTrack);
    const [currentPastSatellitesPaths, setCurrentPastSatellitesPaths] = useState([]);
    const [currentFutureSatellitesPaths, setCurrentFutureSatellitesPaths] = useState([]);
    const [currentSatellitesPosition, setCurrentSatellitesPosition] = useState([]);
    const [currentSatellitesCoverage, setCurrentSatellitesCoverage] = useState([]);
    const [currentCrosshairs, setCurrentCrosshairs] = useState([]);
    const [terminatorLine, setTerminatorLine] = useState([]);
    const [daySidePolygon, setDaySidePolygon] = useState([]);
    const [sunPos, setSunPos] = useState(null);
    const [moonPos, setMoonPos] = useState(null);
    const {location} = useSelector((state) => state.location);
    const updateTimeRef = useRef(null);
    const controlsBoxRef = useRef(null);
    const arrowControlsRef = useRef(null);

    const handleSetMapZoomLevel = useCallback(
        (zoomLevel) => {
            dispatch(setMapZoomLevel(zoomLevel));
        },
        [dispatch]
    );

    // Subscribe to map events
    function MapEventComponent({handleSetMapZoomLevel}) {
        const mapEvents = useMapEvents({
            zoomend: () => {
                const mapZoom = mapEvents.getZoom();
                handleSetMapZoomLevel(mapZoom);
                localStorage.setItem(storageMapZoomValueKey, mapZoom);
            },
            click: (e) => {
                const target = e.originalEvent?.target;
                if (
                    (controlsBoxRef.current && target && controlsBoxRef.current.contains(target)) ||
                    (arrowControlsRef.current && target && arrowControlsRef.current.contains(target))
                ) {
                    return;
                }
                dispatch(setSelectedSatelliteId(null));
            },
        });
        return null;
    }

    function CenterHomeButton() {
        const { t } = useTranslation('overview');
        const targetCoordinates = [location.lat, location.lon];
        const handleClick = () => {
            MapObject.setView(targetCoordinates, MapObject.getZoom());
        };
        return (
            <Fab size="small" color="primary" aria-label={t('map_controls.go_home')} onClick={handleClick}>
                <HomeIcon/>
            </Fab>
        );
    }

    function CenterMapButton() {
        const { t } = useTranslation('overview');
        const targetCoordinates = [0, 0];
        const handleClick = () => {
            MapObject.setView(targetCoordinates, MapObject.getZoom());
        };
        return (
            <Fab size="small" color="primary" aria-label={t('map_controls.go_to_center')} onClick={handleClick}>
                <FilterCenterFocusIcon/>
            </Fab>
        );
    }

    function FullscreenMapButton() {
        const { t } = useTranslation('overview');
        const handleMapFullscreen = () => {
            MapObject.toggleFullscreen();
        };
        return (
            <Fab size="small" color="primary" aria-label={t('map_controls.go_fullscreen')} onClick={handleMapFullscreen}>
                <FullscreenIcon/>
            </Fab>
        );
    }

    function MapSettingsButton() {
        const { t } = useTranslation('overview');
        const handleClick = () => {
            dispatch(setOpenMapSettingsDialog(true));
        };

        return (
            <Fab size="small" color="primary" aria-label={t('map_controls.map_settings')} onClick={handleClick}>
                <SettingsIcon/>
            </Fab>
        );
    }

    function satelliteUpdate(now) {
        let currentPos = [];
        let currentCoverage = [];
        let currentCrosshair = [];
        let currentFuturePaths = [];
        let currentPastPaths = [];
        let satIndex = 0;
        let selectedSatPos = {};

        selectedSatellites.forEach((satellite) => {
            try {
                if (satIndex++ >= viewSatelliteLimit) {
                    return;
                }

                let noradId = satellite['norad_id'];
                let [lat, lon, altitude, velocity] = getSatelliteLatLon(
                    satellite['norad_id'],
                    satellite['tle1'],
                    satellite['tle2'],
                    now
                );

                // Let's also update the satellite info island with the new position data we have
                let [az, el, range] = calculateSatelliteAzEl(
                    satellite['tle1'],
                    satellite['tle2'],
                    {
                        lat: location['lat'],
                        lon: location['lon'],
                        alt: location['alt'],
                    },
                    now
                );

                // Accumulate the selected satellite position
                selectedSatPos[noradId] = {az, el, range};

                if (selectedSatelliteId === satellite['norad_id']) {
                    // Get the recent state
                    const recentSatData = store.getState().overviewSatTrack.satelliteData;

                    // Update state
                    dispatch(
                        setSatelliteData({
                            ...recentSatData,
                            position: {
                                lat: lat,
                                lon: lon,
                                alt: altitude * 1000,
                                vel: velocity,
                                az: az,
                                el: el,
                            },
                        })
                    );
                }

                if (selectedSatelliteId === noradId) {
                    // calculate paths
                    let paths = getSatellitePaths(
                        [satellite['tle1'], satellite['tle2']],
                        orbitProjectionDuration
                    );

                    // past path
                    currentPastPaths.push(
                        <Polyline
                            key={`past-path-${noradId}`}
                            positions={paths.past}
                            pathOptions={{
                                color: pastOrbitLineColor,
                                weight: 2,
                                opacity: 0.5,
                                smoothFactor: 1,
                            }}
                        />
                    );

                    // future path
                    currentFuturePaths.push(
                        <Polyline
                            key={`future-path-${noradId}`}
                            positions={paths.future}
                            pathOptions={{
                                color: futureOrbitLineColor,
                                weight: 2,
                                opacity: 1,
                                dashArray: '2 4',
                                smoothFactor: 1,
                            }}
                        />
                    );
                }

                const onMarkerMouseClick = (event, noradId) => {
                    dispatch(setSelectedSatelliteId(noradId));
                };

                const markerEventHandlers = {
                    //mouseover: (event) => (onMarkerMouseOver(event, satellite['norad_id'])),
                    //mouseout: (event) => (onMarkerMouseOver(event, satellite['norad_id'])),
                    click: (event) => onMarkerMouseClick(event, satellite['norad_id']),
                };

                const isVisible = isSatelliteVisible(satellite['tle1'], satellite['tle2'], now, location);

                // Crosshairs for tracking satellite - always shown when the satellite is being tracked
                if (trackingSatelliteId === noradId) {
                    const crosshairColor = theme.palette.secondary.main;

                    // Create a custom square icon using DivIcon for pixel-perfect square
                    const squareIcon = L.divIcon({
                        className: 'custom-square-marker',
                        html: `<div style="width: 30px; height: 30px; border: 2px solid ${crosshairColor}; opacity: 0.8; box-sizing: border-box;">` +
                            '</div>',
                        iconSize: [30, 30],
                        iconAnchor: [15, 15],
                    });

                    currentCrosshair.push(
                        <React.Fragment key={`crosshair-${noradId}`}>
                            <Marker
                                position={[lat, lon]}
                                icon={squareIcon}
                                interactive={false}
                            />
                            {/* Horizontal line crossing the entire map */}
                            <Polyline
                                positions={[
                                    [lat, -180],
                                    [lat, 180],
                                ]}
                                pathOptions={{
                                    color: crosshairColor,
                                    weight: 1,
                                    opacity: 1,
                                    smoothFactor: 1,
                                }}
                            />
                            {/* Vertical line crossing the entire map */}
                            <Polyline
                                positions={[
                                    [-90, lon],
                                    [90, lon],
                                ]}
                                pathOptions={{
                                    color: crosshairColor,
                                    weight: 1,
                                    opacity: 1,
                                    smoothFactor: 1,
                                }}
                            />
                        </React.Fragment>
                    );
                }

                // If the satellite is visible, draw the coverage circle
                if (isVisible && showSatelliteCoverage) {
                    let coverage = getSatelliteCoverageCircle(lat, lon, altitude, 360);
                    currentCoverage.push(
                        <Polyline
                            noClip={true}
                            key={'coverage-' + satellite['name']}
                            pathOptions={{
                                color: selectedSatelliteId === noradId ? 'white' : satelliteCoverageColor,
                                fillColor: satelliteCoverageColor,
                                weight: selectedSatelliteId === noradId ? 2 : 1,
                                fill: true,
                                opacity: 1,
                                fillOpacity: selectedSatelliteId === noradId ? 0.5 : 0.1,
                                dashArray: '1 2',
                            }}
                            positions={coverage}
                        />
                    );
                } else {
                    // If the satellite is selected, draw the coverage circle
                    if (selectedSatelliteId === noradId) {
                        let coverage = getSatelliteCoverageCircle(lat, lon, altitude, 360);
                        currentCoverage.push(
                            <Polyline
                                noClip={true}
                                key={'coverage-' + satellite['name']}
                                pathOptions={{
                                    color: 'white',
                                    fillColor: satelliteCoverageColor,
                                    weight: 2,
                                    fill: true,
                                    opacity: 1,
                                    fillOpacity: 0.5,
                                    dashArray: '',
                                }}
                                positions={coverage}
                            />
                        );
                    }
                }

                if (showTooltip || selectedSatelliteId === noradId || trackingSatelliteId === noradId) {
                    currentPos.push(
                        <SatelliteMarker
                            key={`satellite-marker-${satellite.norad_id}`}
                            satellite={satellite}
                            position={[lat, lon]}
                            altitude={altitude}
                            velocity={velocity}
                            trackingSatelliteId={trackingSatelliteId}
                            selectedSatelliteId={selectedSatelliteId}
                            markerEventHandlers={markerEventHandlers}
                            satelliteIcon={satelliteIcon2}
                            opacity={1}
                            handleSetTrackingOnBackend={handleSetTrackingOnBackend}
                        />
                    );
                } else if (isVisible) {
                    currentPos.push(
                        <Marker
                            key={'marker-' + satellite['norad_id']}
                            position={[lat, lon]}
                            icon={satelliteIcon2}
                            eventHandlers={markerEventHandlers}
                            opacity={1}
                        ></Marker>
                    );
                } else {
                    currentPos.push(
                        <Marker
                            key={'marker-' + satellite['norad_id']}
                            position={[lat, lon]}
                            icon={satelliteIcon2}
                            eventHandlers={markerEventHandlers}
                            opacity={0.6}
                        ></Marker>
                    );
                }
            } catch (e) {
                console.error(
                    `Error while updating satellite ${satellite['name']} (${satellite['norad_id']}): ${e}`
                );
            }
        });

        setCurrentPastSatellitesPaths(currentPastPaths);
        setCurrentFutureSatellitesPaths(currentFuturePaths);
        setCurrentSatellitesPosition(currentPos);
        setCurrentSatellitesCoverage(currentCoverage);
        setCurrentCrosshairs(currentCrosshair);

        // Day/night boundary
        const terminatorLine = createTerminatorLine().reverse();
        setTerminatorLine(terminatorLine);

        // Day side polygon
        const dayPoly = [...terminatorLine];
        dayPoly.push(dayPoly[dayPoly.length - 1]);
        setDaySidePolygon(dayPoly);

        // Sun and moon position
        const [sunPos, moonPos] = getSunMoonCoords();
        setSunPos(sunPos);
        setMoonPos(moonPos);

        dispatch(setSelectedSatellitePositions(selectedSatPos));
    }

    // Update the satellites position, day/night terminator every 3 seconds
    useEffect(() => {
        // Clear the interval
        if (updateTimeRef.current) {
            clearTimeout(updateTimeRef.current);
        }

        // Call for an update
        satelliteUpdate(new Date());

        // Recreate the interval
        updateTimeRef.current = setInterval(() => {
            satelliteUpdate(new Date());
        }, 3000);

        return () => {
            clearInterval(updateTimeRef.current);
        };
    }, [
        selectedSatellites,
        showPastOrbitPath,
        showFutureOrbitPath,
        showSatelliteCoverage,
        showSunIcon,
        showMoonIcon,
        showTerminatorLine,
        pastOrbitLineColor,
        futureOrbitLineColor,
        satelliteCoverageColor,
        orbitProjectionDuration,
        mapZoomLevel,
        showTooltip,
        selectedSatelliteId,
        trackingSatelliteId,
    ]);

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

    // On the component mount, load the map zoom level from localStorage
    useEffect(() => {
        const savedZoomLevel = localStorage.getItem(storageMapZoomValueKey);
        const initialMapZoom = savedZoomLevel ? parseFloat(savedZoomLevel) : 1;
        dispatch(setMapZoomLevel(initialMapZoom));
        return () => {
        };
    }, []);

    const handleWhenReady = (map) => {
        // map is ready
        MapObject = map.target;
        setInterval(() => {
            if (MapObject) {
                try {
                    MapObject.invalidateSize();
                } catch (e) {
                    console.error(`Error while updating map: ${e}`);
                }
            }
        }, 1000);
    };

    return (
        <>
            <MapTitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ['window-title-bar'])}>
                {t('title')}
            </MapTitleBar>
            <MapContainer
                fullscreenControl={true}
                center={[0, 0]}
                zoom={mapZoomLevel}
                style={{width: '100%', height: 'calc(100% - 60px)'}}
                dragging={false}
                scrollWheelZoom={false}
                maxZoom={10}
                minZoom={0}
                whenReady={handleWhenReady}
                zoomSnap={0.25}
                zoomDelta={0.25}
                keyboard={false}
                bounceAtZoomLimits={false}
                closePopupOnClick={false}
            >
                <MapEventComponent handleSetMapZoomLevel={handleSetMapZoomLevel}/>
                <TileLayer url={getTileLayerById(tileLayerID)['url']}/>

                <Box
                    ref={controlsBoxRef}
                    sx={{'& > :not(style)': {m: 1}}}
                    style={{right: 5, top: 5, position: 'absolute'}}
                >
                    <MapSettingsButton/>
                    <CenterHomeButton/>
                    <CenterMapButton/>
                    <FullscreenMapButton/>
                </Box>

                <MapSettingsIslandDialog
                    updateBackend={() => {
                        const key = 'overview-map-settings';
                        dispatch(setOverviewMapSetting({socket, key: key}));
                    }}
                />

                {sunPos && showSunIcon ? <Marker position={sunPos} icon={sunIcon} opacity={0.5}/> : null}

                {moonPos && showMoonIcon ? (
                    <Marker position={moonPos} icon={moonIcon} opacity={0.5}/>
                ) : null}

                {daySidePolygon.length > 1 && showTerminatorLine && (
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

                {terminatorLine.length > 1 && showTerminatorLine && (
                    <Polyline
                        positions={terminatorLine}
                        pathOptions={{
                            color: 'white',
                            weight: 1,
                            opacity: 0.1,
                        }}
                    />
                )}

                {InternationalDateLinePolyline()}

                <Marker position={[location.lat, location.lon]} icon={homeIcon} opacity={0.8}/>

                {showPastOrbitPath ? currentPastSatellitesPaths : null}
                {showFutureOrbitPath ? currentFutureSatellitesPaths : null}
                {currentSatellitesPosition}
                {currentSatellitesCoverage}
                {currentCrosshairs}

                {/* Wrap MapArrowControls with a container to detect clicks */}
                <div ref={arrowControlsRef}>
                    <MapArrowControls mapObject={MapObject}/>
                </div>

                {showGrid && (
                    <CoordinateGrid
                        latInterval={15}
                        lngInterval={15}
                        latColor="white"
                        lngColor="white"
                        weight={1}
                        opacity={0.5}
                        showLabels={false}
                    />
                )}

                {/*<SatelliteTrackSuggestion*/}
                {/*    selectedSatelliteId={selectedSatelliteId}*/}
                {/*    trackingSatelliteId={trackingSatelliteId}*/}
                {/*    selectedSatellite={selectedSatellites.find((sat) => sat.norad_id === selectedSatelliteId)}*/}
                {/*    handleSetTrackingOnBackend={handleSetTrackingOnBackend}*/}
                {/*/>*/}
            </MapContainer>
            <MapStatusBar>
                <SimpleTruncatedHtml
                    className={'attribution'}
                    htmlString={`<a href="https://leafletjs.com" title="A JavaScript library for interactive maps" target="_blank" rel="noopener noreferrer">Leaflet</a> | ${getTileLayerById(tileLayerID)['attribution']}`}
                />
            </MapStatusBar>
        </>
    );
};

export default SatelliteMapContainer;
