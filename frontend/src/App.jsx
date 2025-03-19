import * as React from 'react';
import {createTheme} from '@mui/material/styles';
import {Outlet} from "react-router";
import PublicIcon from '@mui/icons-material/Public';
import SettingsIcon from '@mui/icons-material/Settings';
import {ReactRouterAppProvider} from "@toolpad/core/react-router";
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import EngineeringIcon from '@mui/icons-material/Engineering';
import {setupTheme} from './theme.js';
import AddHomeIcon from '@mui/icons-material/AddHome';
import {SatelliteIcon, Satellite03Icon, PreferenceVerticalIcon} from "hugeicons-react";
import {SignInPage} from "@toolpad/core";
import {Alert, Avatar, Checkbox} from "@mui/material";
import {useMemo, useState} from "react";
import {GroundStationLogoGreenBlue, GroundStationTinyLogo, GSRetroLogo} from "./components/icons.jsx";
import {stringAvatar} from "./components/common.jsx";
import RadioIcon from '@mui/icons-material/Radio';
import SegmentIcon from '@mui/icons-material/Segment';
import InfoIcon from '@mui/icons-material/Info';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import LoginForm, {demoSession} from "./components/login.jsx";
import {SocketProvider} from './components/socket.jsx';
import NotificationBar from "./components/notification.jsx";
import {enqueueSnackbar, SnackbarProvider, useSnackbar} from 'notistack';
import PeopleIcon from '@mui/icons-material/People';

const BRANDING = {
    logo: (
        <img
            src={GroundStationLogoGreenBlue}
            alt="Ground Station"
            style={{height: 128}}
        />
    ),
    title: 'Ground Station',
};

export default function App(props) {
    const [loggedIn, setLoggedIn] = useState(true);
    const [session, setSession] = useState(demoSession);
    const dashboardTheme = setupTheme();

    const handleSignedInCallback = React.useCallback((value, session) => {
        setLoggedIn(value);
        setSession(session);
        enqueueSnackbar('You have been logged in', {variant: 'success'});
    }, []);

    const authentication = useMemo(() => {
        return {
            signIn: () => {
                setSession(demoSession);
                setLoggedIn(true);
                enqueueSnackbar('You have been logged in', {variant: 'success'});
            },
            signOut: () => {
                setSession(null);
                setLoggedIn(false);
                enqueueSnackbar('You have been logged out', {variant: 'success'});
            },
        };
    }, []);

    const NAVIGATION = [
        {
            kind: 'header',
            title: 'Tracking',
        },
        {
            segment: '',
            title: 'Overview',
            icon: <PublicIcon/>,
        },
        {
            segment: 'track',
            title: 'Track single satellite',
            icon: <GpsFixedIcon/>,
        },
        {kind: 'divider'},
        {
            kind: 'header',
            title: 'Hardware',
        },
        {
            segment: 'hardware/rig',
            title: 'Radio rigs',
            icon: <RadioIcon/>,
        },
        {
            segment: 'hardware/rotator',
            title: 'Antenna rotators',
            icon: <SatelliteIcon/>,
        },
        {kind: 'divider'},
        {
            kind: 'header',
            title: 'Satellites',
        },
        {
            segment: 'satellites/tlesources',
            title: 'TLE sources',
            icon: <SegmentIcon/>,
        },
        {
            segment: 'satellites/satellites',
            title: 'Satellites',
            icon: <Satellite03Icon/>,
        },
        {
            segment: 'satellites/groups',
            title: 'Groups',
            icon: <GroupWorkIcon/>,
        },
        {kind: 'divider'},
        {
            kind: 'header',
            title: 'Settings',
        },
        {
            segment: 'settings/preferences',
            title: 'Preferences',
            icon: <PreferenceVerticalIcon/>,
        },
        {
            segment: 'settings/location',
            title: 'Location',
            icon: <AddHomeIcon/>,
        },
        {
            segment: 'settings/users',
            title: 'Users',
            icon: <PeopleIcon/>,
        },
        {
            segment: 'settings/maintenance',
            title: 'Maintenance',
            icon: <EngineeringIcon/>,
        },
        {
            segment: 'settings/about',
            title: 'About',
            icon: <InfoIcon/>,
        },
    ];

    return (
        <SocketProvider>
                <ReactRouterAppProvider
                    navigation={NAVIGATION}
                    theme={dashboardTheme}
                    authentication={authentication}
                    session={session}
                    branding={BRANDING}
                >
                        {loggedIn ? (
                            <Outlet/>
                        ) : (
                            <LoginForm handleSignedInCallback={handleSignedInCallback}/>
                        )}
                </ReactRouterAppProvider>
        </SocketProvider>
    );
}
