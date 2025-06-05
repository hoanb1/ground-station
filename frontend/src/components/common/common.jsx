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


import {styled} from "@mui/material/styles";
import Paper from "@mui/material/Paper";
import {Polyline, Tooltip as LeafletTooltip} from "react-leaflet";
import React, {useEffect, useRef, useState} from "react";
import Tooltip from "@mui/material/Tooltip";
import {Box, Chip, Fab, Stack, Tab} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import Tabs from "@mui/material/Tabs";

export const SATELLITE_NUMBER_LIMIT = 50;

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

export const StyledIslandParentNoScrollbar = styled("div")(({ theme }) => ({
    padding: '0rem',
    border: '1px solid #424242',
    backgroundColor: "#1e1e1e",
    overflow: 'hidden',
    overflowY: 'hidden',
    overflowX: 'hidden',
}));

export const AntTabs = styled(Tabs)({
    borderBottom: '1px #4c4c4c solid',
    '& .MuiTabs-indicator': {
        backgroundColor: '#262626',
    },
});

export const AntTab = styled((props) => <Tab disableRipple {...props} />)(({ theme }) => ({
    '&.MuiTab-root': {
        fontSize: theme.typography.pxToRem(16),
    },
    '&.Mui-selected': {
        color: '#fff',
        fontWeight: theme.typography.fontWeightMedium,
        backgroundColor: '#262626',
        marginTop: '0px',
        //borderTop: '1px #071318 solid',
    },
    '&.Mui-focusVisible': {
        backgroundColor: '#d1eaff',
    },
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
    zIndex: 450,
    bottom: -1,
    textAlign: 'left',
    fontWeight: 'normal',
}));

export const WaterfallStatusBar = styled(Paper)(({ theme }) => ({
    width: '100%',
    height: '30px',
    padding: '4px 8px',
    ...theme.typography.body2,
    position: 'absolute',
    borderRadius: '0px 0px 0px 0px',
    borderTop: '1px solid #494949',
    zIndex: 450,
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

export const ThemedStackIsland = styled(Stack)(({theme}) => ({
    color: theme.palette.text.secondary,
    backgroundColor: "#1e1e1e",
    borderRadius: theme.shape.borderRadius,
    borderColor: theme.palette.background.paper,
    padding: theme.spacing(0),
    display: 'block',
    overflow: 'auto',
}));

export const ThemedSettingsDiv = styled('div')(({theme}) => ({
    backgroundColor: "#1e1e1e",
    fontsize: '0.9rem !important',
    height: "100%",
}));

export const SettingItem = styled('div')(({theme}) => ({
    padding: '0.2rem 0.1rem',
    fontsize: '0.9rem !important',
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
                opacity: 0.9,
                color: 'white',
                weight: 1,
                dashArray: '1, 5',
            }}
        />,
        <Polyline
            key={'second-date-line'}
            positions={dateLineCoordinates2}
            pathOptions={{
                opacity: 0.9,
                color: 'white',
                weight: 1,
                dashArray: '1, 5',
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


export const humanizeFutureDateInMinutes = (isoString, zeroPadding=2) => {
    const now = new Date();
    const futureDate = new Date(isoString);
    const diffInSeconds = Math.floor((futureDate - now) / 1000);

    if (diffInSeconds < 0) {
        return "In the past"; // Handle cases where the date is not in the future
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const remainingSeconds = diffInSeconds % 60;

    return `in ${formatWithZeros(diffInMinutes, zeroPadding)}m ${formatWithZeros(remainingSeconds, zeroPadding)}s`;
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
                <Chip sx={{ height: '18px' }} label="Alive" size="small" color="success" variant="outlined" />
            );
        } else if (status === "dead") {
            return (
                <Chip sx={{ height: '18px' }} label="Dead" size="small" color="error" variant="outlined" />
            );
        } else {
            return (<Chip sx={{ height: '18px' }} label={status} size="small" color="info" variant="outlined" />);
        }
    } else {
        return <Chip sx={{ height: '18px' }} label={"n/a"} size="small" color="info" variant="outlined" />;
    }
};

export function humanizeLatitude(latitude) {
    if (typeof latitude !== "number" || isNaN(latitude)) {
        return "-";
    }

    const direction = latitude >= 0 ? "N" : "S";
    return `${Math.abs(latitude).toFixed(4)}° ${direction}`;
}

export function humanizeLongitude(longitude) {
    if (typeof longitude !== "number" || isNaN(longitude)) {
        return "-";
    }

    const direction = longitude >= 0 ? "E" : "W";
    return `${Math.abs(longitude).toFixed(4)}° ${direction}`;
}

export function getMaidenhead(lat, lon) {
    let adjLon = lon + 180;
    let adjLat = lat + 90;
    // Field (first two letters)
    const A = Math.floor(adjLon / 20);
    const B = Math.floor(adjLat / 10);
    const field = String.fromCharCode(65 + A) + String.fromCharCode(65 + B);
    // Square (two digits)
    adjLon = adjLon - A * 20;
    adjLat = adjLat - B * 10;
    const C = Math.floor(adjLon / 2);
    const D = Math.floor(adjLat);
    const square = C.toString() + D.toString();
    // Subsquare (final two letters)
    adjLon = adjLon - C * 2;
    adjLat = adjLat - D;
    const E = Math.floor(adjLon * 12);
    const F = Math.floor(adjLat * 24);
    const subsquare = String.fromCharCode(97 + E) + String.fromCharCode(97 + F);
    return field + square + subsquare;
}

export const renderCountryFlagsCSV = (csvCodes) => {
    if (!csvCodes) return "-";

    const countryCodes = Array.isArray(csvCodes) ? csvCodes : csvCodes.split(',').map(code => code.trim());
    return (
        <div style={{
            height: 17,
        }}>
            {countryCodes.map((countryCode, index) => (
                <Tooltip key={index} title={countryCode.toUpperCase()} arrow style={{paddingTop: 0,  height: 18}}>
                    <img
                        src={`https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`}
                        alt={countryCode}
                        style={{width: 28, height: 17, border: '1px #8a8a8a solid',  marginRight: 4,}}
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
    let preciseHertz = hertz;

    while (preciseHertz >= 1000 && unitIndex < units.length - 1) {
        preciseHertz /= 1000;
        unitIndex++;
    }

    return `${preciseHertz.toFixed(decimals)} ${units[unitIndex]}`;
}

export function preciseHumanizeFrequency(hertz) {
    if (typeof hertz !== "number" || isNaN(hertz)) {
        return "Invalid frequency";
    }

    const units = ["Hz", "kHz", "MHz", "GHz", "THz", "PHz"];
    let unitIndex = 0;

    while (hertz >= 1000 && unitIndex < units.length - 1) {
        hertz /= 1000;
        unitIndex++;
    }

    let formatted = hertz.toFixed(4);
    formatted = formatted.replace(/\.?0+$/, '');

    return `${formatted} ${units[unitIndex]}`;
}


export function humanizeAltitude(meters, decimals = 2, unit = "km", showUnit=false) {
    if (typeof meters !== "number" || isNaN(meters)) {
        return "Invalid altitude";
    }

    const conversions = {
        m: meters,
        km: meters / 1000,
        mi: meters / 1609.34,
        ft: meters * 3.28084
    };

    return conversions[unit]?.toFixed(decimals) + (showUnit ? ` ${unit}` : "") || "Invalid unit" ;
}


export function humanizeVelocity(kmPerSecond, decimals = 2, unit = "km/s", showUnit=false) {
    if (typeof kmPerSecond !== "number" || isNaN(kmPerSecond)) {
        return "Invalid velocity";
    }

    const units = ["km/s", "km/h", "m/s", "mph"];
    const index = units.indexOf(unit);
    let velocities = [
        kmPerSecond,                          // km/s
        kmPerSecond * 3600,                   // km/h
        kmPerSecond * 1000,                   // m/s
        kmPerSecond * 2236.94                 // mph (1 km/s = 2236.94 mph)
    ];

    return `${velocities[index].toFixed(decimals)}` + (showUnit ? ` ${units[index]}` : "");
}

export function SimpleTruncatedHtml({ htmlString, className }) {
    return (
        <Tooltip
            title={<div dangerouslySetInnerHTML={{ __html: htmlString }} />}
            arrow
        >
            <div
                className={`truncate ${className || ""}`}
                dangerouslySetInnerHTML={{ __html: htmlString }}
            />
        </Tooltip>
    );
}

export const formatWithZeros = (num, length) => {
    return String(num).padStart(length, '0');
};


export function getClassNamesBasedOnGridEditing(gridEditing, stringList) {
    if (gridEditing) {
        return ["react-grid-draggable", ...stringList].join(" ");
    } else {
        return stringList.join(" ");
    }
}

export function humanizeNumber(number, decimals = 1) {
    if (typeof number !== 'number' || isNaN(number)) {
        return 'Invalid number';
    }

    const absNumber = Math.abs(number);
    const sign = number < 0 ? '-' : '';

    if (absNumber < 1000) {
        return sign + absNumber.toString();
    }

    const suffixes = ['', 'K', 'M', 'B', 'T'];
    const exponent = Math.min(Math.floor(Math.log10(absNumber) / 3), suffixes.length - 1);
    const scaledNumber = absNumber / Math.pow(1000, exponent);

    return sign + scaledNumber.toFixed(decimals) + suffixes[exponent];
}

export const getFrequencyBand = (frequency) => {
    // Input validation
    if (frequency === null || frequency === undefined) return 'Unknown';
    if (typeof frequency === 'string' && frequency.trim() === '') return 'Unknown';

    const freq = parseFloat(frequency);
    if (isNaN(freq) || freq <= 0) return 'Unknown';

    // Define bands in ascending order of frequency
    const BANDS = [
        {name: 'ELF', min: 3, max: 30},                // 3 Hz - 30 Hz
        {name: 'SLF', min: 30, max: 300},                  // 30 Hz - 300 Hz
        {name: 'ULF', min: 300, max: 3000},                // 300 Hz - 3 kHz
        {name: 'VLF', min: 3000, max: 30000},               // 3 kHz - 30 kHz
        {name: 'LF', min: 30000, max: 300000},                   // 30 kHz - 300 kHz
        {name: 'MF', min: 300000, max: 3000000},              // 300 kHz - 3 MHz
        {name: 'HF', min: 3000000, max: 30000000},              // 3 MHz - 30 MHz
        {name: 'VHF', min: 30000000, max: 300000000},      // 30 MHz - 300 MHz
        {name: 'UHF', min: 300000000, max: 1000000000},   // 300 MHz - 1 GHz
        {name: 'L Band', min: 1000000000, max: 2000000000},                      // 1 GHz - 2 GHz
        {name: 'S Band', min: 2000000000, max: 4000000000},                      // 2 GHz - 4 GHz
        {name: 'C Band', min: 4000000000, max: 8000000000},                      // 4 GHz - 8 GHz
        {name: 'X Band', min: 8000000000, max: 12000000000},                     // 8 GHz - 12 GHz
        {name: 'Ku Band', min: 12000000000, max: 18000000000},                   // 12 GHz - 18 GHz
        {name: 'K Band', min: 18000000000, max: 27000000000},                    // 18 GHz - 27 GHz
        {name: 'Ka Band', min: 27000000000, max: 40000000000},                   // 27 GHz - 40 GHz
        {name: 'V Band', min: 40000000000, max: 75000000000},                    // 40 GHz - 75 GHz
        {name: 'W Band', min: 75000000000, max: 110000000000},                   // 75 GHz - 110 GHz
        {name: 'mm Band', min: 110000000000, max: 300000000000},                 // 110 GHz - 300 GHz
    ];

    // Find the appropriate band
    for (const band of BANDS) {
        if (freq >= band.min && freq < band.max) {
            return band.name;
        }
    }

    // Handle frequencies outside our defined range
    if (freq < 3) return 'Below ELF';
    if (freq >= 300000000000) {
        if (freq < 3000000000000) return 'Terahertz';
        if (freq < 30000000000000) return 'Far Infrared';
        if (freq < 120000000000000) return 'Mid Infrared';
        if (freq < 400000000000000) return 'Near Infrared';
        if (freq < 790000000000000) return 'Visible Light';
        if (freq < 30000000000000000) return 'Ultraviolet';
        if (freq < 30000000000000000000) return 'X-rays';
        return 'Gamma rays';
    }

    return 'Unknown';
};

export const getBandColor = (band) => {
    const colors = {
        'HF': '#FF6B6B',
        'VHF': '#28716d',
        'UHF': '#1a4d59',
        'L': '#4d6a5c',
        'S': '#786948',
        'C': '#635c88',
        'X': '#885c6c',
        'Ku': '#4b7560',
        'K': '#7c2e8c',
        'Ka': '#433487'
    };
    return colors[band] || '#666666';
};
