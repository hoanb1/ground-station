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


import React, { createContext, useState, useContext } from "react";
import {useSocket} from "./socket.jsx";
import { toast } from "react-toastify";

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
                toast.success('Logged in successfully', {
                    autoClose: 5000,
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
