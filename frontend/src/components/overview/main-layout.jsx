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


import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import {Responsive, WidthProvider} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'leaflet/dist/leaflet.css';
import {duration, styled} from "@mui/material/styles";
import OverviewSatelliteGroupSelector from "./satellite-selector.jsx";
import {
    StyledIslandParent,
    StyledIslandParentScrollbar,
    StyledIslandParentNoScrollbar,
} from "../common/common.jsx";
import {enqueueSnackbar} from "notistack";
import {useSocket} from "../common/socket.jsx";
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import {useDispatch, useSelector} from "react-redux";
import {
    setGridEditable,
    setMapZoomLevel,
} from './overview-slice.jsx';
import NextPassesGroupIsland from "./satellite-passes.jsx";
import WeatherDisplay from "./weather-card.jsx";
import OverviewSatelliteInfoCard from "./satellite-info.jsx";
import {setTrackingStateInBackend} from "../target/target-slice.jsx";
import SatelliteMapContainer from './overview-map.jsx';

const storageMapZoomValueKey = "overview-map-zoom-level";

// global callback for dashboard editing here
export let handleSetGridEditableOverview = function () {
};

export const gridLayoutStoreName = 'global-sat-track-layouts';


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

const GlobalSatelliteTrackLayout = React.memo(function () {
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
        selectedSatGroupId,
    } = useSelector(state => state.overviewSatTrack);
    const {
        trackingState,
        satelliteId: trackingSatelliteId,
        selectedRadioRig,
        selectedRotator,
        selectedTransmitter
    } = useSelector(state => state.targetSatTrack);
    const {location,} = useSelector((state) => state.location);
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
        "lg": [{
            "w": 8,
            "h": 17,
            "x": 0,
            "y": 0,
            "i": "map",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 3,
            "x": 10,
            "y": 0,
            "i": "satselector",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 8,
            "h": 9,
            "x": 0,
            "y": 17,
            "i": "passes",
            "minH": 7,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 5,
            "x": 10,
            "y": 3,
            "i": "weather",
            "minH": 5,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 17,
            "x": 8,
            "y": 0,
            "i": "sat-info",
            "minH": 7,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }],
        "xs": [{
            "w": 2,
            "h": 17,
            "x": 0,
            "y": 0,
            "i": "map",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 3,
            "x": 0,
            "y": 17,
            "i": "satselector",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 9,
            "x": 0,
            "y": 20,
            "i": "passes",
            "minH": 7,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 5,
            "x": 0,
            "y": 29,
            "i": "weather",
            "minH": 5,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 14,
            "x": 0,
            "y": 34,
            "i": "sat-info",
            "minH": 7,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }]
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

    const handleSetTrackingOnBackend = (noradId) => {
        const newTrackingState = {
            'norad_id': noradId,
            'group_id': selectedSatGroupId,
            'rotator_state': trackingState['rotator_state'],
            'rig_state': trackingState['rig_state'],
            'rig_id': selectedRadioRig,
            'rotator_id': selectedRotator,
            'transmitter_id': selectedTransmitter,
        };

        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {
                // Success handling
            })
            .catch((error) => {
                enqueueSnackbar(`Failed to start tracking with the rotator: ${error.message}`, {
                    variant: "error"
                });
            });
    };

    function handleLayoutsChange(currentLayout, allLayouts) {
        setLayouts(allLayouts);
        saveLayoutsToLocalStorage(allLayouts);
    }

    // pre-made ResponsiveGridLayout
    let gridContents = [
        <StyledIslandParent key="map">
            <SatelliteMapContainer handleSetTrackingOnBackend={handleSetTrackingOnBackend}/>
        </StyledIslandParent>,
        <StyledIslandParentScrollbar key={"satselector"}>
            <OverviewSatelliteGroupSelector/>
        </StyledIslandParentScrollbar>,
        <StyledIslandParentNoScrollbar key="passes">
            <NextPassesGroupIsland/>
        </StyledIslandParentNoScrollbar>,
        // <StyledIslandParentNoScrollbar key="weather">
        //     <WeatherDisplay latitude={location.lat} longitude={location.lon}/>
        // </StyledIslandParentNoScrollbar>,
        <StyledIslandParentNoScrollbar key="sat-info">
            <OverviewSatelliteInfoCard/>
        </StyledIslandParentNoScrollbar>,
    ];

    let ResponsiveGridLayoutParent = null;

    if (gridEditable === true) {
        ResponsiveGridLayoutParent =
            <ResponsiveReactGridLayout
                useCSSTransforms={true}
                className="layout"
                layouts={layouts}
                onLayoutChange={handleLayoutsChange}
                breakpoints={{lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0}}
                cols={{lg: 12, md: 10, sm: 6, xs: 2, xxs: 2}}
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
                useCSSTransforms={true}
                className="layout"
                layouts={layouts}
                onLayoutChange={handleLayoutsChange}
                breakpoints={{lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0}}
                cols={{lg: 12, md: 10, sm: 6, xs: 2, xxs: 2}}
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

export default GlobalSatelliteTrackLayout;
