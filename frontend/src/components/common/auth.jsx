// src/context/AuthContext.js
import React, { createContext, useState, useContext } from "react";
import {useSocket} from "./socket.jsx";
import {enqueueSnackbar} from "notistack";

// Create an AuthContext for managing authentication
const AuthContext = createContext(null);

export const useAuth = () => {
    return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
    const { socket, handleTokenChange } = useSocket();
    const [session, setSession] = useState({
        user: {
            name: null,
            email: null,
            image: null,
            token: true,
        }
    });

    const logIn = (email, password, resolve) => {
        socket.emit('auth_request', 'login', {email, password}, (response) => {
            if (response.success && response.token) {
                setSession({ user: {...response.user, token: response.token} });
                handleTokenChange(response.token);
                enqueueSnackbar('Logged in successfully', {
                    variant: 'success',
                    autoHideDuration: 5000,
                })
                resolve();
            } else {
                setSession({
                    user: {
                        name: null,
                        email: null,
                        image: null,
                        token: null,
                    }
                });
                resolve({
                    type: 'CredentialsSignin',
                    error: 'Invalid credentials.',
                });
            }
        });
    };

    const logOut = () => {
        setSession({
            user: {
                name: null,
                email: null,
                image: null,
                token: null,
            }
        });
    };

    return (
        <AuthContext.Provider value={{ session, logIn, logOut }}>
            {children}
        </AuthContext.Provider>
    );
};
