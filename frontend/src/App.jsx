import * as React from 'react';
import {Outlet} from "react-router";
import PublicIcon from '@mui/icons-material/Public';
import {ReactRouterAppProvider} from "@toolpad/core/react-router";
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import EngineeringIcon from '@mui/icons-material/Engineering';
import {setupTheme} from './theme.js';
import AddHomeIcon from '@mui/icons-material/AddHome';
import {SatelliteIcon, Satellite03Icon, PreferenceVerticalIcon} from "hugeicons-react";
import {Alert, Avatar, Button, Checkbox} from "@mui/material";
import {useEffect, useMemo, useState} from "react";
import {GroundStationLogoGreenBlue, GroundStationTinyLogo, GSRetroLogo} from "./components/common/icons.jsx";
import RadioIcon from '@mui/icons-material/Radio';
import SegmentIcon from '@mui/icons-material/Segment';
import InfoIcon from '@mui/icons-material/Info';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import {closeSnackbar, enqueueSnackbar, SnackbarProvider} from 'notistack';
import PeopleIcon from '@mui/icons-material/People';
import {useSocket} from "./components/common/socket.jsx";
import {useAuth} from "./components/common/auth.jsx";
import store from './components/common/store.jsx';
import { fetchPreferences } from './components/settings/preferences-slice.jsx';
import { fetchLocationForUserId } from './components/settings/location-slice.jsx';
import {setMessage, setProgress} from './components/satellites/synchronize-slice.jsx';
import {setStatus} from "./components/hardware/rig-slice.jsx";
import { setSatelliteData } from './components/target-sat-slice.jsx';

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

function uponConnectionToBackEnd(socket) {
    // called when the connection to backend has been established to fill in the local state with information
    store.dispatch(fetchPreferences({socket}));
    store.dispatch(fetchLocationForUserId({socket}));
}

export default function App(props) {
    const { socket } = useSocket();
    const [loggedIn, setLoggedIn] = useState(false);
    const dashboardTheme = setupTheme();
    const { session, logIn, logOut } = useAuth();

    const authentication = useMemo(() => {
        return {
            signIn: () => {
                enqueueSnackbar('user clicked on the sign in button', {
                    variant: 'info',

                });
            },
            signOut: () => {
                logOut();
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

    // To listen to the connection event
    useEffect(() => {
        if (socket) {
            socket.on('connect', () => {
                console.log('Socket connected with ID:', socket.id);
                enqueueSnackbar("Connected to backend!", {variant: 'success'});
                uponConnectionToBackEnd(socket);
            });

            socket.on("reconnect_attempt", (attempt) => {
                enqueueSnackbar(`Not connected! Attempting to reconnect (${attempt})...`, {variant: 'info'});
            });

            socket.on("error", (error) => {
                enqueueSnackbar(`Error occurred, ${error}`, {variant: 'error'});
            });

            socket.on('disconnect', () => {
                enqueueSnackbar("Disconnected from backend!", {variant: 'error'});
            });

            socket.on("sat-sync-events", (data) => {
                store.dispatch(setProgress(data.progress));
                store.dispatch(setMessage(data.message));
                store.dispatch(setStatus(data.status));

                if (data.status === 'complete') {
                    enqueueSnackbar("Satellite data synchronization completed successfully", {
                        variant: 'success',
                        autoHideDuration: 4000,
                    });
                }
            });

            socket.on("satellite-tracking", (data) => {
                console.log("Received data for tracking data for satellite:", data);
                store.dispatch(setSatelliteData(data));
            });

            return () => {
                socket.off('connect');
                socket.off('reconnect_attempt');
                socket.off('error');
                socket.off('disconnect');
                socket.off("sat-sync-events");
                socket.off("satellite-tracking");
            };
        }
    }, [socket]);

    const action = snackbarId => (
        <>
            <Button size={"small"} variant={"text"} onClick={() => { closeSnackbar(snackbarId) }} style={{color: '#000000'}}>
                Dismiss
            </Button>
        </>
    );

    return (
        <SnackbarProvider maxSnack={5} autoHideDuration={4000} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}} action={action}>
            <ReactRouterAppProvider
                navigation={NAVIGATION}
                theme={dashboardTheme}
                authentication={authentication}
                session={session}
                branding={BRANDING}
            >
                <Outlet/>
            </ReactRouterAppProvider>
        </SnackbarProvider>
    );
}
