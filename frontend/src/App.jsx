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
import MicrowaveIcon from '@mui/icons-material/Microwave';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import WavesIcon from '@mui/icons-material/Waves';
import CameraIcon from '@mui/icons-material/CameraAlt';
import { closeSnackbar, enqueueSnackbar, SnackbarProvider } from 'notistack';
import PeopleIcon from '@mui/icons-material/People';
import { useSocket } from "./components/common/socket.jsx";
import { useAuth } from "./components/common/auth.jsx";
import { store, persistor } from './components/common/store.jsx';
import { fetchPreferences } from './components/settings/preferences-slice.jsx';
import { fetchLocationForUserId } from './components/settings/location-slice.jsx';
import { setSyncState } from './components/satellites/synchronize-slice.jsx';
import { setStatus } from "./components/hardware/rig-slice.jsx";
import {setSatelliteData, getTargetMapSettings, fetchNextPasses} from './components/target/target-sat-slice.jsx';
import { fetchRigs } from './components/hardware/rig-slice.jsx'
import { fetchRotators } from './components/hardware/rotaror-slice.jsx'
import { fetchTLESources } from './components/satellites/sources-slice.jsx'
import { fetchSatelliteGroups } from './components/satellites/groups-slice.jsx';
import { fetchUsers } from './components/settings/users-slice.jsx';
import { getTrackingStateFromBackend } from './components/target/target-sat-slice.jsx';
import { fetchCameras } from './components/hardware/camera-slice.jsx'
import { fetchSDRs } from './components/hardware/sdr-slice.jsx'
import { getOverviewMapSettings } from './components/overview/overview-sat-slice.jsx';
import WaterfallLayout from "./components/waterfall/waterfall-layout.jsx";
import LoginForm from './components/common/login.jsx';
import {useDispatch, useSelector} from "react-redux";
import { useAudio } from "./components/dashboard/dashboard-audio.jsx";
import {
    setUITrackerValues
} from "./components/target/target-sat-slice.jsx";

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
    store.dispatch(fetchRigs({socket}));
    store.dispatch(fetchRotators({socket}));
    store.dispatch(fetchCameras({socket}));
    store.dispatch(fetchSDRs({socket}));
    store.dispatch(fetchTLESources({socket}));
    store.dispatch(fetchSatelliteGroups({socket}));
    store.dispatch(fetchUsers({socket}));
    store.dispatch(getTrackingStateFromBackend({socket}));
    store.dispatch(getOverviewMapSettings({socket}));
    store.dispatch(getTargetMapSettings({socket}));
}

export default function App(props) {
    const { socket } = useSocket();
    const [loggedIn, setLoggedIn] = useState(true);
    const dashboardTheme = setupTheme();
    const { session, logIn, logOut } = useAuth();
    const {
        satelliteId,
        nextPassesHours,
    } = useSelector((state) => state.targetSatTrack);
    const dispatch = useDispatch();

    // Use the audio context
    const { initializeAudio, playAudioSamples } = useAudio();

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
    }, [logOut]);

    useEffect(() => {
        const fetchPasses = () => {
            if (satelliteId) {
                dispatch(fetchNextPasses({socket, noradId: satelliteId, hours: nextPassesHours}))
                    .unwrap()
                    .then(data => {
                        // Handle success if needed
                    })
                    .catch(error => {
                        enqueueSnackbar(`Failed fetching next passes for satellite ${satelliteId}: ${error.message}`, {
                            variant: 'error',
                            autoHideDuration: 5000,
                        })
                    });
            }
        };

        fetchPasses();

        const interval = setInterval(fetchPasses, 60 * 60 * 1000); // Every hour

        return () => {
            clearInterval(interval);
        };
    }, [satelliteId, socket, dispatch, nextPassesHours]);

    const NAVIGATION = [
        {
            kind: 'header',
            title: 'Tracking',
        },
        {
            segment: '',
            title: 'Birds eye view',
            icon: <PublicIcon/>,
        },
        {
            segment: 'track',
            title: 'Tracking console',
            icon: <GpsFixedIcon/>,
        },
        {
            segment: 'waterfall',
            title: 'Waterfall view',
            icon: <WavesIcon/>,
        },
        {kind: 'divider'},
        {
            kind: 'header',
            title: 'Hardware',
        },
        {
            segment: 'hardware/rig',
            title: 'Rigs',
            icon: <RadioIcon/>,
        },
        {
            segment: 'hardware/rotator',
            title: 'Rotators',
            icon: <SatelliteIcon/>,
        },
        {
            segment: 'hardware/cameras',
            title: 'Cameras',
            icon: <CameraIcon/>,
        },
        {
            segment: 'hardware/sdrs',
            title: 'SDRs',
            icon: <MicrowaveIcon/>,
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

    useEffect(() => {
        initializeAudio()
            .then(() => {
                console.log('Audio initialized successfully');
            })
            .catch(error => {
                console.error('Failed to initialize audio:', error);
            });

        return () => {

        };
    }, []);

    // Socket event listeners
    useEffect(() => {
        if (socket) {
            socket.on('connect', async () => {
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
                store.dispatch(setSyncState(data));

                if (data.success === false) {
                    enqueueSnackbar("Satellite data synchronization failed", {
                        variant: 'error',
                        autoHideDuration: 4000,
                    });
                }

                if (data.status === 'complete') {
                    enqueueSnackbar("Satellite data synchronization completed successfully", {
                        variant: 'success',
                        autoHideDuration: 4000,
                    });
                }
            });

            socket.on("audio-data", (data) => {
                playAudioSamples(data);
            });

            socket.on("ui-tracker-state", (data) => {
                store.dispatch(setUITrackerValues(data))
            });

            socket.on("satellite-tracking", (data) => {
                store.dispatch(setSatelliteData(data));
                if (data['events']) {
                    data['events'].forEach(event => {
                        if (event.name === 'rotator_connected') {
                            enqueueSnackbar("Rotator connected!", {variant: 'success'});
                        } else if (event.name === 'rotator_disconnected') {
                            enqueueSnackbar("Rotator disconnected!", {variant: 'info'});
                        } else if (event.name === 'rig_connected') {
                            enqueueSnackbar("Rig connected!", {variant: 'success'});
                        } else if (event.name === 'rig_disconnected') {
                            enqueueSnackbar("Rig disconnected!", {variant: 'info'});
                        } else if (event.name === 'elevation_out_of_bounds') {
                            enqueueSnackbar("Elevation of target is not reachable!", {variant: 'warning'});
                        } else if (event.name === 'azimuth_out_of_bounds') {
                            enqueueSnackbar("Azimuth of target is not reachable", {variant: 'warning'});
                        } else if (event.name === 'minelevation_error') {
                            enqueueSnackbar("Target is beyond the minimum elevation limit", {variant: 'warning'});
                        } else if (event.name === 'norad_id_change') {
                            enqueueSnackbar("Target satellite changed!", {variant: 'info'});
                        } else if (event.name === 'rotator_error') {
                            enqueueSnackbar(event.error, {variant: 'error'});
                        } else if (event.name === 'rig_error') {
                            enqueueSnackbar(event.error, {variant: 'error'});
                        }
                    });
                }
            });

            return () => {
                socket.off('connect');
                socket.off('reconnect_attempt');
                socket.off('error');
                socket.off('disconnect');
                socket.off("sat-sync-events");
                socket.off("satellite-tracking");
                socket.off("ui-tracker-state");
                socket.off("audio-data");
            };
        }
    }, [socket, initializeAudio, playAudioSamples]);

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
                {loggedIn ? <Outlet/> : <LoginForm/>}
            </ReactRouterAppProvider>
        </SnackbarProvider>
    );
}