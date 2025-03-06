import * as React from 'react';
import { createTheme } from '@mui/material/styles';
import {BrowserRouter, Routes, Route, Outlet} from "react-router";
import PublicIcon from '@mui/icons-material/Public';
import SettingsIcon from '@mui/icons-material/Settings';
import {ReactRouterAppProvider} from "@toolpad/core/react-router";
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import Chip from "@mui/material/Chip";
import CallMadeIcon from '@mui/icons-material/CallMade';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import {Menu, MenuItem} from "@mui/material";
import IconButton from "@mui/material/IconButton";
import HomeIcon from '@mui/icons-material/Home';
import BuildIcon from '@mui/icons-material/Build';


const dashboardTheme = createTheme({
    cssVariables: {
        colorSchemeSelector: 'data-toolpad-color-scheme',
    },
    colorSchemes: { light: true, dark: true },
    breakpoints: {
        values: {
            xs: 0,
            sm: 600,
            md: 600,
            lg: 1200,
            xl: 1536,
        },
    },
});

export default function App(props) {
    const [popoverAnchorEl, setPopoverAnchorEl] = React.useState(null);
    const isPopoverOpen = Boolean(popoverAnchorEl);
    const popoverId = isPopoverOpen ? 'simple-popover' : undefined;


    const handlePopoverButtonClick = (event) => {
        event.stopPropagation();
        setPopoverAnchorEl(event.currentTarget);
    };

    const handlePopoverClose = (event) => {
        event.stopPropagation();
        setPopoverAnchorEl(null);
    };

    const popoverMenuAction = (
        <React.Fragment>
            <IconButton aria-describedby={popoverId} onClick={handlePopoverButtonClick}>
                <MoreHorizIcon />
            </IconButton>
            <Menu
                id={popoverId}
                open={isPopoverOpen}
                anchorEl={popoverAnchorEl}
                onClose={handlePopoverClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                disableAutoFocus
                disableAutoFocusItem
            >
                <MenuItem onClick={handlePopoverClose}>New call</MenuItem>
                <MenuItem onClick={handlePopoverClose}>Mark all as read</MenuItem>
            </Menu>
        </React.Fragment>
    );

    const NAVIGATION = [
        {
            kind: 'header',
            title: 'Main items',
        },
        {
            segment: '',
            title: 'Globe',
            icon: <PublicIcon />,
        },
        {
            segment: 'track',
            title: 'Track',
            icon: <GpsFixedIcon />,
        },
        {
            segment: 'settings',
            title: 'Settings',
            icon: <SettingsIcon />,
            action: popoverMenuAction,
            children: [
                {
                    segment: 'home',
                    title: 'Home',
                    icon: <HomeIcon />,
                },
                {
                    segment: 'preferences',
                    title: 'Preferences',
                    icon: <BuildIcon />,
                },
            ],
        },
    ];

    return (
        <ReactRouterAppProvider navigation={NAVIGATION} theme={dashboardTheme}>
            <Outlet />
        </ReactRouterAppProvider>
    );
}
