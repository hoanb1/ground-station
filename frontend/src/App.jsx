import * as React from 'react';
import { createTheme } from '@mui/material/styles';
import {Outlet} from "react-router";
import PublicIcon from '@mui/icons-material/Public';
import SettingsIcon from '@mui/icons-material/Settings';
import {ReactRouterAppProvider} from "@toolpad/core/react-router";
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import HomeIcon from '@mui/icons-material/Home';
import BuildIcon from '@mui/icons-material/Build';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';

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

    const NAVIGATION = [
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
                {
                    segment: 'rotor',
                    title: 'Antenna rotor',
                    icon: <SettingsInputAntennaIcon />,
                },
                {
                    segment: 'tles',
                    title: 'Satellite and TLEs',
                    icon: <SatelliteAltIcon />,
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
