/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
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
import {GroundStationLogoGreenBlue, GroundStationTinyLogo, GSRetroLogo, TLEIcon} from "./components/common/icons.jsx";
import RadioIcon from '@mui/icons-material/Radio';
import SegmentIcon from '@mui/icons-material/Segment';
import InfoIcon from '@mui/icons-material/Info';
import MicrowaveIcon from '@mui/icons-material/Microwave';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import WavesIcon from '@mui/icons-material/Waves';
import CameraIcon from '@mui/icons-material/CameraAlt';
import toast, { Toaster, ToastBar } from 'react-hot-toast';
import PeopleIcon from '@mui/icons-material/People';
import { useSocket } from "./components/common/socket.jsx";
import { useAuth } from "./components/common/auth.jsx";
import { store, persistor } from './components/common/store.jsx';
import { fetchPreferences } from './components/settings/preferences-slice.jsx';
import { fetchLocationForUserId } from './components/settings/location-slice.jsx';
import { setSyncState } from './components/satellites/synchronize-slice.jsx';
import { setStatus } from "./components/hardware/rig-slice.jsx";
import {setSatelliteData, getTargetMapSettings, fetchNextPasses} from './components/target/target-slice.jsx';
import { fetchRigs } from './components/hardware/rig-slice.jsx'
import { fetchRotators } from './components/hardware/rotaror-slice.jsx'
import { fetchTLESources } from './components/satellites/sources-slice.jsx'
import { fetchSatelliteGroups } from './components/satellites/groups-slice.jsx';
import { fetchUsers } from './components/settings/users-slice.jsx';
import { getTrackingStateFromBackend } from './components/target/target-slice.jsx';
import { fetchCameras } from './components/hardware/camera-slice.jsx'
import { fetchSDRs } from './components/hardware/sdr-slice.jsx'
import { getOverviewMapSettings } from './components/overview/overview-slice.jsx';
import MainLayout from "./components/waterfall/main-layout.jsx";
import LoginForm from './components/common/login.jsx';
import {useDispatch, useSelector} from "react-redux";
import { AudioProvider, useAudio } from "./components/dashboard/audio-provider.jsx";
import { setUITrackerValues } from "./components/target/target-slice.jsx";
import { setSynchronizing } from "./components/satellites/synchronize-slice.jsx";
import VideocamIcon from '@mui/icons-material/Videocam';
import {fetchVersionInfo} from "./components/dashboard/version-slice.jsx";


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
    store.dispatch(fetchVersionInfo());
    store.dispatch(fetchPreferences({socket}));
    store.dispatch(fetchLocationForUserId({socket}));
    store.dispatch(fetchRigs({socket}));
    store.dispatch(fetchRotators({socket}));
    store.dispatch(fetchCameras({socket}));
    store.dispatch(fetchSDRs({socket}));
    store.dispatch(fetchTLESources({socket}));
    store.dispatch(fetchSatelliteGroups({socket}));
    //store.dispatch(fetchUsers({socket}));
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

    // // Use the audio context
    // const { initializeAudio, playAudioSamples, getAudioState } = useAudio();

    const authentication = useMemo(() => {
        return {
            signIn: () => {
                toast('user clicked on the sign in button', {
                    position: 'bottom-center',
                });
            },
            signOut: () => {
                logOut();
                toast.success('You have been logged out', {
                    position: 'bottom-center',
                });
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
                        toast.error(`Failed fetching next passes for satellite ${satelliteId}: ${error.message}`, {
                            position: 'top-right',
                            duration: 5000,
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
            icon: <WavesIcon />,
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
            icon: <VideocamIcon/>,
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
            icon: <TLEIcon/>,
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
        // {
        //     segment: 'settings/users',
        //     title: 'Users',
        //     icon: <PeopleIcon/>,
        // },
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

    // Socket event listeners
    useEffect(() => {
        if (socket) {
            socket.on('connect', async () => {
                console.log('Socket connected with ID:', socket.id);
                toast.success("Connected to backend!", {
                    position: 'bottom-center',
                });
                uponConnectionToBackEnd(socket);
            });

            socket.on("reconnect_attempt", (attempt) => {
                toast(`Not connected! Attempting to reconnect (${attempt})...`, {
                    position: 'bottom-center',
                    icon: 'ℹ️',
                });
            });

            socket.on("error", (error) => {
                toast.error(`Error occurred, ${error}`, {
                    position: 'bottom-center',
                });
            });

            socket.on('disconnect', () => {
                toast.error("Disconnected from backend!", {
                    position: 'bottom-center',
                });
            });

            socket.on("sat-sync-events", (data) => {
                store.dispatch(setSyncState(data));

                // if (data.success === false) {
                //     enqueueSnackbar("Satellite data synchronization failed", {
                //         variant: 'error',
                //         autoHideDuration: 4000,
                //     });
                //     dispatch(setSynchronizing(false));
                // }

                if (data.status === 'complete') {
                    toast.success("Satellite data synchronization completed successfully", {
                        position: 'bottom-center',
                        duration: 4000,
                    });
                    dispatch(setSynchronizing(false));
                }
            });

            socket.on("ui-tracker-state", (data) => {
                store.dispatch(setUITrackerValues(data))
            });

            socket.on("satellite-tracking", (data) => {
                store.dispatch(setSatelliteData(data));
                if (data['events']) {
                    data['events'].forEach(event => {
                        if (event.name === 'rotator_connected') {
                            toast.success("Rotator connected!", {position: 'bottom-center'});
                        } else if (event.name === 'rotator_disconnected') {
                            toast("Rotator disconnected!", {position: 'bottom-center', icon: 'ℹ️'});
                        } else if (event.name === 'rig_connected') {
                            toast.success("Rig connected!", {position: 'bottom-center'});
                        } else if (event.name === 'rig_disconnected') {
                            toast("Rig disconnected!", {position: 'bottom-center', icon: 'ℹ️'});
                        } else if (event.name === 'elevation_out_of_bounds') {
                            toast("Elevation of target is not reachable!", {position: 'top-right', icon: '⚠️'});
                        } else if (event.name === 'azimuth_out_of_bounds') {
                            toast("Azimuth of target is not reachable", {position: 'top-right', icon: '⚠️'});
                        } else if (event.name === 'minelevation_error') {
                            toast("Target is beyond the minimum elevation limit", {position: 'top-right', icon: '⚠️'});
                        } else if (event.name === 'norad_id_change') {
                            toast("Target satellite changed!", {position: 'bottom-center', icon: 'ℹ️'});
                        } else if (event.name === 'rotator_error') {
                            toast.error(event.error, {position: 'top-right'});
                        } else if (event.name === 'rig_error') {
                            toast.error(event.error, {position: 'top-right'});
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
            };
        }
    }, [socket]);


    return (
        <AudioProvider>
            <Toaster
                position="bottom-center"
                toastOptions={{
                    duration: 4000,
                    style: {
                        background: '#363636',
                        color: '#fff',
                    },
                    success: {
                        iconTheme: {
                            primary: '#4caf50',
                            secondary: '#fff',
                        },
                    },
                    error: {
                        iconTheme: {
                            primary: '#f44336',
                            secondary: '#fff',
                        },
                    },
                }}
            >
                {(t) => (
                    <ToastBar
                        toast={t}
                        style={{
                            ...t.style,
                            animation: t.visible
                                ? t.position?.includes('right')
                                    ? 'toast-enter-right 0.3s ease'
                                    : 'toast-enter 0.3s ease'
                                : t.position?.includes('right')
                                    ? 'toast-exit-right 0.3s ease forwards'
                                    : 'toast-exit 0.3s ease forwards',
                        }}
                    />
                )}
            </Toaster>
            <style>{`
                @keyframes toast-enter {
                    from {
                        transform: translateY(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                @keyframes toast-exit {
                    from {
                        transform: translateY(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateY(-100%);
                        opacity: 0;
                    }
                }

                @keyframes toast-enter-right {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }

                @keyframes toast-exit-right {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(120%);
                        opacity: 0;
                    }
                }
            `}</style>
            <ReactRouterAppProvider
                navigation={NAVIGATION}
                theme={dashboardTheme}
                authentication={authentication}
                session={session}
                branding={BRANDING}
            >
                {loggedIn ? <Outlet/> : <LoginForm/>}
            </ReactRouterAppProvider>
        </AudioProvider>
    );
}