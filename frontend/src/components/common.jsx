import {styled} from "@mui/material/styles";
import Paper from "@mui/material/Paper";
import {Polyline, Tooltip} from "react-leaflet";
import React from "react";

export const StyledIslandParent = styled("div")(({ theme }) => ({
    padding: '0rem',
    border: '1px solid #424242',
    backgroundColor: "#1e1e1e",
    overflow: 'hidden',
}));

export const StyledIslandParentScrollbar = styled("div")(({ theme }) => ({
    padding: '0rem',
    border: '1px solid #424242',
    backgroundColor: "#1e1e1e",
    overflow: 'hidden',
    overflowY: 'hidden',
    overflowX: 'hidden',

}));

export const CODEC_JSON = {
    parse: (value) => {
        try {
            return JSON.parse(value);
        } catch {
            return { _error: 'parse failed' };
        }
    },
    stringify: (value) => JSON.stringify(value),
};

export const CODEC_BOOL = {
    parse: (value) => {
        return value === "1";
    },
    stringify: (value) => {
        try {
            return value === true? "1" : "0";
        } catch {
            return "0";
        }
    },
};

export const MapTitleBar = styled(Paper)(({ theme }) => ({
    width: '100%',
    height: '30px',
    padding: '4px 15px',
    ...theme.typography.body2,
    position: 'absolute',
    borderRadius: '0px 0px 0px 0px',
    borderBottom: '1px solid #494949',
    zIndex: 400,
    top: 0,
    fontWeight: 'bold',
    textAlign: 'left',
}));

export const MapStatusBar = styled(Paper)(({ theme }) => ({
    width: '100%',
    height: '30px',
    padding: '4px 15px',
    ...theme.typography.body2,
    position: 'absolute',
    borderRadius: '0px 0px 0px 0px',
    borderTop: '1px solid #494949',
    zIndex: 400,
    bottom: -1,
    textAlign: 'left',
    fontWeight: 'normal',
}));

export const TitleBar = styled(Paper)(({ theme }) => ({
    width: '100%',
    height: '30px',
    padding: '4px 15px',
    ...theme.typography.body2,
    position: 'relative',
    borderRadius: '0px 0px 0px 0px',
    borderBottom: '1px solid #494949',
    textAlign: 'left',
    fontWeight: 'bold',
}));

export const ThemedLeafletTooltip = styled(Tooltip)(({ theme }) => ({
    color: theme.palette.text.primary,
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    borderColor: theme.palette.background.paper,
}));

export function InternationalDateLinePolyline() {
    // Coordinates for the International Date Line
    const dateLineCoordinates1 = [
        [90, 180],
        [-90, 180],
    ];

    const dateLineCoordinates2 = [
        [90, -180],
        [-90, -180],
    ];

    return [
        <Polyline
            key={'first-date-line'}
            positions={dateLineCoordinates1}
            pathOptions={{
                opacity: 0.5,
                color: 'grey', // Customize the color
                weight: 1,    // Line thickness
                dashArray: '5, 5', // Dashed line effect
            }}
        />,
        <Polyline
            key={'second-date-line'}
            positions={dateLineCoordinates2}
            pathOptions={{
                opacity: 0.5,
                color: 'grey', // Customize the color
                weight: 1,    // Line thickness
                dashArray: '5, 5', // Dashed line effect
            }}
        />
    ];
}

function stringToColor(string) {
    let hash = 0;
    let i;

    for (i = 0; i < string.length; i += 1) {
        hash = string.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (i = 0; i < 3; i += 1) {
        const value = (hash >> (i * 8)) & 0xff;
        color += `00${value.toString(16)}`.slice(-2);
    }

    return color;
}

export function stringAvatar(name) {
    return {
        sx: {
            bgcolor: stringToColor(name),
        },
        children: `${name.split(' ')[0][0]}${name.split(' ')[1][0]}`,
    };
}
