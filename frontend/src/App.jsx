import * as React from 'react';
import { createTheme } from '@mui/material/styles';
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
import {Avatar, Checkbox} from "@mui/material";
import {useMemo, useState} from "react";
import {GroundStationTinyLogo, GSRetroLogo} from "./components/icons.jsx";
import {stringAvatar} from "./components/common.jsx";

const providers = [{ id: 'credentials', name: 'Username and password' }];


const demoSession = {
    user: {
        name: 'Efstatios Goudelis',
        email: 'sgoudelis@nerv.home',
        image: null,
    },
};

const BRANDING = {
    logo: (
        <img
            src={GSRetroLogo}
            alt="Ground Station"
            style={{ height: 48 }}
        />
    ),
    title: 'Ground Station',
};

export default function App(props) {
    const dashboardTheme = setupTheme();
    const [loggedIn, setLoggedIn] = useState(false);
    const [session, setSession] = useState(demoSession);

    const NAVIGATION = [
        {
            kind: 'header',
            title: 'Tracking',
        },
        {
            segment: '',
            title: 'Overview',
            icon: <PublicIcon />,
        },
        {
            segment: 'track',
            title: 'Track single satellite',
            icon: <GpsFixedIcon />,
        },
        { kind: 'divider' },
        {
            kind: 'header',
            title: 'Settings',
        },
        {
            segment: 'settings/preferences',
            title: 'Preferences',
            icon: <PreferenceVerticalIcon />,
        },
        {
            segment: 'settings/location',
            title: 'Location',
            icon: <AddHomeIcon />,
        },
        {
            segment: 'settings/rotor',
            title: 'Antenna rotor',
            icon: <SatelliteIcon/>,
        },
        {
            segment: 'settings/tles',
            title: 'Satellite and TLEs',
            icon: <Satellite03Icon />,
        },
        {
            segment: 'settings/maintenance',
            title: 'Maintenance',
            icon: <EngineeringIcon />,
        },
    ];
    const authentication = useMemo(() => {
        return {
            signIn: () => {
                setSession(demoSession);
            },
            signOut: () => {
                setSession(null);
            },
        };
    }, []);

    const signIn = async (provider, formData) => {
        return new Promise((resolve) => {
            setTimeout(() => {
                const email = formData?.get('email');
                const password = formData?.get('password');
                // preview-start
                // resolve({
                //     type: 'CredentialsSignin',
                //     error: 'Invalid credentials.',
                // });

                setLoggedIn(true);

                // preview-end
            }, 300);
        });
    };

    return (
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
                <SignInPage
                    sx={{
                        bgcolor: 'background.paper',
                        boxShadow: 1,
                        borderRadius: 2,
                        p: 2,
                        minWidth: 300,
                        '& main > .MuiBox-root': {
                            backgroundColor: '#1e1e1e',
                        },
                    }}
                    title={"Ground Station"}
                    subtitle={"Your own personal satellite tracking station"}
                    signIn={signIn}
                    providers={providers}
                    slotProps={{
                        emailField: {variant: 'standard', autoFocus: false},
                        passwordField: {variant: 'standard'},
                        submitButton: {variant: 'outlined'},
                        rememberMe: {
                            control: (
                                <Checkbox
                                    name="rememberme"
                                    value="true"
                                    color="primary"
                                    sx={{padding: 0.5, '& .MuiSvgIcon-root': {fontSize: 20}}}
                                />
                            ),
                            color: 'textSecondary',
                            label: 'Remember me',
                        },
                    }}
                />
            )}
        </ReactRouterAppProvider>
    );
}
