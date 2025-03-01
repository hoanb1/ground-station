import * as React from 'react';
import { createTheme } from '@mui/material/styles';
import {BrowserRouter, Routes, Route, Outlet} from "react-router";
import PublicIcon from '@mui/icons-material/Public';
import SettingsIcon from '@mui/icons-material/Settings';
import {ReactRouterAppProvider} from "@toolpad/core/react-router";


const NAVIGATION = [
    {
        kind: 'header',
        title: 'Main items',
    },
    {
        segment: '',
        title: 'Track',
        icon: <PublicIcon />,
    },
    {
        segment: 'settings',
        title: 'Settings',
        icon: <SettingsIcon />,
    },
];

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
    return (
        <ReactRouterAppProvider navigation={NAVIGATION} theme={dashboardTheme}>
            <Outlet />
        </ReactRouterAppProvider>
    );
}
