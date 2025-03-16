import {Checkbox} from "@mui/material";
import {SignInPage} from "@toolpad/core";
import * as React from "react";
import {useMemo, useState} from "react";
import { useSocket } from './socket.jsx';
import { useSnackbar } from 'notistack';

export const demoSession = {
    user: {
        name: 'Efstatios Goudelis',
        email: 'sgoudelis@nerv.home',
        image: null,
    },
};

const LoginForm = ({handleSignedInCallback}) => {
    const [loggedIn, setLoggedIn] = useState(false);
    const [session, setSession] = useState(demoSession);
    const socket = useSocket();
    const { enqueueSnackbar } = useSnackbar();

    const providers = [{ id: 'credentials', name: 'Username and password' }];

    const signIn = async (provider, formData) => {
        return new Promise((resolve) => {
            setTimeout(() => {
                const email = formData?.get('email');
                const password = formData?.get('password');
                if (email === 'stratos.goudelis@gmail.com' && password === 'a') {
                    handleSignedInCallback(true, session);
                    resolve({
                        type: 'CredentialsSignin',
                    })

                } else {
                    resolve({
                        type: 'CredentialsSignin',
                        error: 'Invalid credentials.',
                    });
                }
            }, 300);
        });
    };

    return (
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
                submitButton: {variant: 'contained', color: 'primary'},
                rememberMe: {
                    control: (
                        <Checkbox
                            name="rememberme"
                            checked={true}
                            value={"true"}
                            color="primary"
                            sx={{padding: 0.5, '& .MuiSvgIcon-root': {fontSize: 20}}}
                        />
                    ),
                    color: 'textSecondary',
                    label: 'Remember me',
                },
            }}
        />
    );
};

export default LoginForm;



