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
    SimpleTruncatedHtml,
    getClassNamesBasedOnGridEditing,
} from "../common/common.jsx";
import {
    setGridEditable
} from './waterfall-slice.jsx';
import {enqueueSnackbar} from "notistack";
import {useSocket} from "../common/socket.jsx";
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import {useDispatch, useSelector} from "react-redux";
import SettingsIcon from "@mui/icons-material/Settings";
import Typography from "@mui/material/Typography";
import CoordinateGrid from "../common/mercator-grid.jsx";
import MainWaterfallDisplay from "./waterfall-view.jsx";
import WaterfallSettings from "./waterfall-settings.jsx";


// global callback for dashboard editing here
export let handleSetGridEditableWaterfall = function () {};

export const gridLayoutStoreName = 'waterfall-view-layouts';

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

const WaterfallLayout = React.memo(function () {

    const {socket} = useSocket();
    const dispatch = useDispatch();
    const {
        gridEditable,
    } = useSelector(state => state.waterfall);

    const ResponsiveReactGridLayout = useMemo(() => WidthProvider(Responsive), [gridEditable]);

    // Default layout if none in localStorage
    const defaultLayouts = {
        lg: [
            {
                i: 'waterfall',
                x: 0,
                y: 4,
                w: 10,
                h: 18,
                resizeHandles: ['se','ne','nw','sw','s','e','w'],
            },
            {
                i: 'settings',
                x: 11,
                y: 0,
                w: 2,
                h: 3,
                resizeHandles: ['se','ne','nw','sw','s','e','w'],
            },
        ]
    };

    // globalize the callback
    handleSetGridEditableWaterfall = useCallback((value) => {
        console.log("set grid editable to " + value);
        dispatch(setGridEditable(value));
    }, [gridEditable]);


    // we load any stored layouts from localStorage or fallback to default
    const [layouts, setLayouts] = useState(() => {
        const loaded = loadLayoutsFromLocalStorage();
        return loaded ?? defaultLayouts;
    });

    function handleLayoutsChange(currentLayout, allLayouts){
        setLayouts(allLayouts);
        saveLayoutsToLocalStorage(allLayouts);
    }

    // pre-made ResponsiveGridLayout
    let gridContents = [
        <StyledIslandParentScrollbar key="waterfall">
            <MainWaterfallDisplay/>
        </StyledIslandParentScrollbar>,
        <StyledIslandParentScrollbar key="settings">
            <WaterfallSettings/>
        </StyledIslandParentScrollbar>,
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

export default WaterfallLayout;
