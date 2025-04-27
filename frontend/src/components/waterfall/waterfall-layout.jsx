import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'leaflet-fullscreen/dist/Leaflet.fullscreen.js';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'leaflet/dist/leaflet.css';
import {
    StyledIslandParentScrollbar,
} from "../common/common.jsx";
import {
    setGridEditable
} from './waterfall-slice.jsx';
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
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
        lg: [{
            "w": 10,
            "h": 23,
            "x": 0,
            "y": 0,
            "i": "waterfall",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 18,
            "x": 10,
            "y": 0,
            "i": "settings",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }],
        md: [{
            "w": 10,
            "h": 21,
            "x": 0,
            "y": 0,
            "i": "waterfall",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 10,
            "h": 11,
            "x": 0,
            "y": 21,
            "i": "settings",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }],
        sm: [{
            "w": 6,
            "h": 21,
            "x": 0,
            "y": 0,
            "i": "waterfall",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 21,
            "x": 4,
            "y": 21,
            "i": "settings",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }],
        xs: [{
            "w": 2,
            "h": 21,
            "x": 0,
            "y": 7,
            "i": "waterfall",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 7,
            "x": 0,
            "y": 0,
            "i": "settings",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }],
        xxs: [{
            "w": 2,
            "h": 21,
            "x": 0,
            "y": 0,
            "i": "waterfall",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }, {
            "w": 2,
            "h": 21,
            "x": 0,
            "y": 21,
            "i": "settings",
            "moved": false,
            "static": false,
            "resizeHandles": ["se", "ne", "nw", "sw", "s", "e", "w"]
        }]
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
