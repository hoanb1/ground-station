/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
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


import React, {useState, useEffect, useCallback, useMemo, memo, useRef} from 'react';
import {Responsive, WidthProvider} from 'react-grid-layout';
import L from 'leaflet';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'leaflet/dist/leaflet.css';
import {Box, Fab, Slider} from "@mui/material";
import SatSelectorIsland from "./target-sat-selector.jsx";
import {
    StyledIslandParent,
    StyledIslandParentNoScrollbar,
    StyledIslandParentScrollbar,
} from "../common/common.jsx";
import {enqueueSnackbar} from "notistack";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {
    setSatGroupId,
    setMapZoomLevel,
    setGridEditable,
    getTrackingStateFromBackend,
    setSatelliteId,
} from './target-sat-slice.jsx'
import SatelliteInfoIsland from "./target-sat-info.jsx";
import NextPassesIsland from "./target-next-passes.jsx";
import CameraView from "../common/camera-view.jsx";
import {
    satellitePositionSelector,
    satelliteCoverageSelector,
    satelliteDetailsSelector,
    satelliteTrackingStateSelector,
    satellitePathsSelector,
    satelliteTransmittersSelector
} from './state-selectors.jsx';
import ControllerTabs from "../common/controller.jsx";
import TargetSatelliteMapContainer from './target-sat-map.jsx';


// global leaflet map object
let MapObject = null;
const storageMapZoomValueKey = "target-map-zoom-level";

// global callback for dashboard editing here
export let handleSetGridEditableTarget = function () {
};

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
    const {socket} = useSocket();
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

    const {location} = useSelector(state => state.location);
    const [currentPastSatellitesPaths, setCurrentPastSatellitesPaths] = useState([]);
    const [currentFutureSatellitesPaths, setCurrentFutureSatellitesPaths] = useState([]);
    const [currentSatellitesPosition, setCurrentSatellitesPosition] = useState([]);
    const [currentSatellitesCoverage, setCurrentSatellitesCoverage] = useState([]);
    const coverageRef = useRef(null);

    const ResponsiveReactGridLayout = useMemo(() => WidthProvider(Responsive), [gridEditable]);

    // default layout if none in localStorage
    const defaultLayouts = {
        "lg": [{
            "w": 7,
            "h": 18,
            "x": 0,
            "y": 0,
            "i": "map",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 3,
            "h": 11,
            "x": 7,
            "y": 4,
            "i": "info",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 7,
            "h": 7,
            "x": 0,
            "y": 18,
            "i": "passes",
            "minH": 6,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 3,
            "h": 4,
            "x": 7,
            "y": 0,
            "i": "satselector",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 3,
            "h": 10,
            "x": 7,
            "y": 15,
            "i": "video",
            "minH": 4,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 13,
            "x": 10,
            "y": 0,
            "i": "rotator-control",
            "minH": 6,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }],
        "md": [{
            "w": 6,
            "h": 17,
            "x": 0,
            "y": 0,
            "i": "map",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 4,
            "h": 11,
            "x": 6,
            "y": 15,
            "i": "info",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 6,
            "h": 9,
            "x": 0,
            "y": 17,
            "i": "passes",
            "minH": 6,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 4,
            "h": 5,
            "x": 6,
            "y": 0,
            "i": "satselector",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 4,
            "h": 10,
            "x": 6,
            "y": 5,
            "i": "video",
            "minH": 4,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 5,
            "h": 11,
            "x": 0,
            "y": 26,
            "i": "rotator-control",
            "minH": 6,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }],
        "sm": [{
            "w": 6,
            "h": 15,
            "x": 0,
            "y": 4,
            "i": "map",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 11,
            "x": 4,
            "y": 28,
            "i": "info",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 6,
            "h": 9,
            "x": 0,
            "y": 19,
            "i": "passes",
            "minH": 6,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 6,
            "h": 4,
            "x": 0,
            "y": 0,
            "i": "satselector",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 7,
            "x": 2,
            "y": 28,
            "i": "video",
            "minH": 4,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 11,
            "x": 0,
            "y": 28,
            "i": "rotator-control",
            "minH": 6,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }],
        "xs": [{
            "w": 2,
            "h": 15,
            "x": 0,
            "y": 4,
            "i": "map",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 11,
            "x": 0,
            "y": 28,
            "i": "info",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 9,
            "x": 0,
            "y": 19,
            "i": "passes",
            "minH": 6,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 4,
            "x": 0,
            "y": 0,
            "i": "satselector",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 11,
            "x": 0,
            "y": 39,
            "i": "video",
            "minH": 4,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 11,
            "x": 0,
            "y": 50,
            "i": "rotator-control",
            "minH": 6,
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }]
    };

    // globalize the callback
    handleSetGridEditableTarget = useCallback((value) => {
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

    function handleLayoutsChange(currentLayout, allLayouts) {
        setLayouts(allLayouts);
        saveLayoutsToLocalStorage(allLayouts);
    }

    useEffect(() => {
        // we do this here once onmount,
        // we set the norad id and group id, once only here
        dispatch(getTrackingStateFromBackend({socket}))
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

    // pre-make the components
    let gridContents = [
        <StyledIslandParent key="map">
            <TargetSatelliteMapContainer />
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
        // <StyledIslandParentScrollbar key="rotator-control">
        //     <ControllerTabs />
        // </StyledIslandParentScrollbar>,
    ];

    let ResponsiveGridLayoutParent = null;

    if (gridEditable === true) {
        ResponsiveGridLayoutParent = <ResponsiveReactGridLayout
            useCSSTransforms={true}
            className="layout"
            layouts={layouts}
            onLayoutChange={handleLayoutsChange}
            breakpoints={{lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0}}
            cols={{lg: 12, md: 10, sm: 6, xs: 2, xxs: 2}}
            rowHeight={30}
            isResizable={true}
            isDraggable={true}
            draggableHandle={".react-grid-draggable"}
        >
            {gridContents}
        </ResponsiveReactGridLayout>;
    } else {
        ResponsiveGridLayoutParent = <ResponsiveReactGridLayout
            useCSSTransforms={true}
            className="layout"
            layouts={layouts}
            onLayoutChange={handleLayoutsChange}
            breakpoints={{lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0}}
            cols={{lg: 12, md: 10, sm: 6, xs: 2, xxs: 2}}
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
