import {styled} from "@mui/material/styles";
import Paper from "@mui/material/Paper";
import {Polyline, Tooltip as LeafletTooltip} from "react-leaflet";
import React from "react";
import Tooltip from "@mui/material/Tooltip";
import {Box, Chip, Fab} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

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
    padding: '4px 8px',
    ...theme.typography.body2,
    position: 'absolute',
    borderRadius: '0px 0px 0px 0px',
    borderBottom: '1px solid #494949',
    zIndex: 400,
    top: 0,
    fontWeight: 'bold',
    textAlign: 'left',
    backgroundColor: "#1e261c",
}));

export const MapStatusBar = styled(Paper)(({ theme }) => ({
    width: '100%',
    height: '30px',
    padding: '4px 8px',
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
    padding: '4px 8px',
    ...theme.typography.body2,
    position: 'relative',
    borderRadius: '0px 0px 0px 0px',
    borderBottom: '1px solid #494949',
    textAlign: 'left',
    fontWeight: 'bold',
    backgroundColor: "#1f131f",
}));

export const ThemedLeafletTooltip = styled(LeafletTooltip)(({ theme }) => ({
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

export const humanizeDate = (isoString) => {
    const now = new Date();
    const pastDate = new Date(isoString);
    const diffInSeconds = Math.floor((now - pastDate) / 1000);

    const units = [
        {label: "year", seconds: 365 * 24 * 60 * 60},
        {label: "month", seconds: 30 * 24 * 60 * 60},
        {label: "day", seconds: 24 * 60 * 60},
        {label: "hour", seconds: 60 * 60},
        {label: "minute", seconds: 60},
        {label: "second", seconds: 1}
    ];

    for (let unit of units) {
        const count = Math.floor(diffInSeconds / unit.seconds);
        if (count >= 1) {
            return `${count} ${unit.label}${count > 1 ? "s" : ""} ago`;
        }
    }
    return "Just now";
};


export const humanizeFutureDateInMinutes = (isoString) => {
    const now = new Date();
    const futureDate = new Date(isoString);
    const diffInSeconds = Math.floor((futureDate - now) / 1000);

    if (diffInSeconds < 0) {
        return "In the past"; // Handle cases where the date is not in the future
    }

    const diffInMinutes = Math.ceil(diffInSeconds / 60);

    return `In ${diffInMinutes} minute${diffInMinutes > 1 ? "s" : ""}`;
};

export const betterDateTimes = (date) => {
    if (date) {
        return (
            <Tooltip title={date} arrow>
                    <span>
                        {humanizeDate(date)}
                    </span>
            </Tooltip>
        );
    } else {
        return "-";
    }
};


export function formatLegibleDateTime(isoString) {
    if (!isoString) return "-"; // Handle invalid or empty input

    const date = new Date(isoString);

    if (isNaN(date)) return "Invalid date"; // Handle invalid dates

    const options = {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false, // Optional: Use 12-hour format with AM/PM
    };

    return date.toLocaleString(undefined, options);
}

export function getTimeFromISO(isoString) {
    if (!isoString) return "-"; // Handle invalid or empty input

    const date = new Date(isoString);
    if (isNaN(date)) return "Invalid date"; // Handle invalid dates

    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");

    return `${hours}:${minutes}:${seconds}`;
}

export const MapArrowControls = function ({mapObject}) {

    return (
        <Box sx={{'& > :not(style)': {m: 1}}} style={{
            right: 15,
            bottom: 42,
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 500,
            width: 115,
        }}>
            <Fab size={"small"} variant="contained" color="primary" style={{margin: 0}}
                 onClick={() => mapObject.panBy([0, -100])}>
                <ArrowUpwardIcon/>
            </Fab>
            <Box sx={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 1,
                width: '100%',
                height: 15,
            }}>
                <Fab size={"small"} color="primary" onClick={() => mapObject.panBy([-100, 0])} style={{margin: 0, position: 'absolute', left: 0}}>
                    <ArrowBackIcon/>
                </Fab>
                <Fab size={"small"} color="primary" variant="contained" onClick={() => mapObject.panBy([100, 0])} style={{margin: 0, position: 'absolute', right: 0}}>
                    <ArrowForwardIcon/>
                </Fab>
            </Box>
            <Fab size={"small"} color="primary" variant="contained" style={{margin: 0}}
                 onClick={() => mapObject.panBy([0, 100])}>
                <ArrowDownwardIcon/>
            </Fab>
        </Box>
    );
}

export const betterStatusValue = (status) => {
    if (status) {
        if (status === "alive") {
            return (
                <Chip label="Alive" size="small" color="success" variant="outlined" />
            );
        } else if (status === "dead") {
            return (
                <Chip label="Dead" size="small" color="error" variant="outlined" />
            );
        } else {
            return (status);
        }
    } else {
        return "-";
    }
};

export const renderCountryFlags = (csvCodes) => {
    if (!csvCodes) return "-";

    const countryCodes = csvCodes.split(',').map(code => code.trim());
    return (
        <div style={{
            height: 19,

        }}>
            {countryCodes.map((countryCode, index) => (
                <Tooltip key={index} title={countryCode.toUpperCase()} arrow style={{paddingTop: 0,  height: 18}}>
                    <img
                        src={`https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`}
                        alt={countryCode}
                        style={{width: 30, height: 19, border: '1px #8a8a8a solid',  marginRight: 4,}}
                    />
                </Tooltip>
            ))}
        </div>
    );
};


export function humanizeFrequency(hertz, decimals = 2) {
    if (typeof hertz !== "number" || isNaN(hertz)) {
        return false;
    }

    if (hertz < 1) return `${hertz.toFixed(decimals)} Hz`;

    const units = ["Hz", "kHz", "MHz", "GHz", "THz", "PHz"];
    let unitIndex = 0;

    while (hertz >= 1000 && unitIndex < units.length - 1) {
        hertz /= 1000;
        unitIndex++;
    }

    return `${hertz.toFixed(decimals)} ${units[unitIndex]}`;
}

