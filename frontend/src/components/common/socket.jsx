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


import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import { useSnackbar } from 'notistack';
import { Manager } from "socket.io-client";

// Create the context
const SocketContext = createContext();

// Provider component
export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const { enqueueSnackbar } = useSnackbar();
    const [token, setToken] = useState(null);

    const handleTokenChange = useCallback((token) => {
        setToken(token);
    }, []);
    
    useEffect(() => {
        // Initialize socket connection (replace URL with your server's URL)
        console.info(import.meta.env.VITE_GS_BACKEND_PORT);
        //const port = import.meta.env.VITE_GS_BACKEND_PORT || 5000;
        const host = window.location.hostname;
        const port = window.location.port;
        // Determine protocol based on current page protocol
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const backendURL = `${protocol}://${host}:${port}/ws`;
        console.info("Connecting to backend at", backendURL);
        const manager = new Manager(backendURL);
        const newSocket = manager.socket("/");
        setSocket(newSocket);

        // Cleanup on unmount
        return () => {
            newSocket.close()
        };
    }, []);

    return (
        <SocketContext.Provider value={{socket, handleTokenChange}}>
            {children}
        </SocketContext.Provider>
    );
};

// Custom hook for using the socket in other components
export const useSocket = () => {
    return useContext(SocketContext);
};
