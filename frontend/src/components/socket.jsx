import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useSnackbar } from 'notistack';
import { Manager } from "socket.io-client";
import {Backdrop} from "@mui/material";
import CircularProgress from "@mui/material/CircularProgress";

// Create the context
const SocketContext = createContext();

// Provider component
export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const { enqueueSnackbar } = useSnackbar();

    useEffect(() => {
        // Initialize socket connection (replace URL with your server's URL)
        const host = window.location.hostname;
        const backendURL = `ws://${host}:5000/ws`;
        console.info("Connecting to backend at", backendURL);
        enqueueSnackbar(`Connecting to backend at ${backendURL}`, {
            variant: 'info',
            autoHideDuration: 2000,
        });
        const manager = new Manager(backendURL);
        const newSocket = manager.socket("/");
        setSocket(newSocket);

        // Cleanup on unmount
        return () => {
            newSocket.close()
        };
    }, []);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};

// Custom hook for using the socket in other components
export const useSocket = () => {
    return useContext(SocketContext);
};
