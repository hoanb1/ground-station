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
import {Checkbox} from "@mui/material";
import {useMemo, useState} from "react";
import {GroundStationTinyLogo} from "./components/icons.jsx";

const providers = [{ id: 'credentials', name: 'Username and password' }];


const demoSession = {
    user: {
        name: 'Efstatios Goudelis',
        email: 'sgoudelis@nerv.home',
        image: 'https://avatars.githubusercontent.com/u/19550456',
    },
};

const BRANDING = {
    logo: (
        <img
            src="data:image/png;base64,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"
            alt="Ground Station"
            style={{ height: 48 }}
        />
    ),
    title: 'Ground Station',
};
// preview-end

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
            segment: 'settings/home',
            title: 'Home location',
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
