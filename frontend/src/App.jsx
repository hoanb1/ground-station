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
import EngineeringIcon from '@mui/icons-material/Engineering';
import {setupTheme} from './theme.js';

export default function App(props) {
    const dashboardTheme = setupTheme();

    const NAVIGATION = [
        {
            segment: '',
            title: 'Overview',
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
                    segment: 'preferences',
                    title: 'Preferences',
                    icon: <BuildIcon />,
                },
                {
                    segment: 'home',
                    title: 'Home location',
                    icon: <HomeIcon />,
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
                {
                    segment: 'maintenance',
                    title: 'Maintenance',
                    icon: <EngineeringIcon />,
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
