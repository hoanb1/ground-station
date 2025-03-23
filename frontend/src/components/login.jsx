import {Checkbox} from "@mui/material";
import {SignInPage} from "@toolpad/core";
import * as React from "react";
import {useEffect, useMemo, useState} from "react";
import { useSocket } from './socket.jsx';
import {enqueueSnackbar, useSnackbar} from 'notistack';
import { useAuth } from "./auth.jsx";


const LoginForm = ({handleSignedInCallback}) => {
    const socket = useSocket();
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(false);
    const { user, logIn, logOut } = useAuth();

    const providers = [{ id: 'credentials', name: 'Email and password' }];

    const signIn = async (provider, formData) => {
        console.info('signIn...', provider, formData);
        return new Promise((resolve) => {
            const email = formData?.get('email');
            const password = formData?.get('password');
            logIn(email, password, resolve);
        });
    };

    useEffect(() => {
        if (socket) {
            socket.on('connect', () => {
                setLoading(false);
            });

            socket.on("error", (error) => {
                setLoading(true);
            });

            socket.on('disconnect', () => {
                setLoading(true);
            });
        }
        return () => {
            if (socket) {
                socket.off('connect');
                socket.off('error');
                socket.off('disconnect');
            }
        };
    }, [socket]); // Dependencies array, update as necessary

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
                emailField: {variant: 'standard', autoFocus: false, disabled: loading},
                passwordField: {variant: 'standard', disabled: loading},
                submitButton: {variant: 'contained', color: 'primary', disabled: loading},
                rememberMe: {
                    control: (
                        <Checkbox
                            name="rememberme"
                            checked={true}
                            value={"true"}
                            color="primary"
                            disabled={loading}
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



