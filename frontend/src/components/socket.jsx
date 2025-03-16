import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useSnackbar } from 'notistack';
import { Manager } from "socket.io-client";

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
        console.info("Connecting to server at", backendURL);
        const manager = new Manager(backendURL);
        const newSocket = manager.socket("/"); // main namespace
        setSocket(newSocket);

        // Cleanup on unmount
        return () => {
            newSocket.close()
        };
    }, []);

    // To listen to the connection event
    useEffect(() => {
        if (socket) {
            socket.on('connect', () => {
                console.log('Socket connected with ID:', socket.id);
                enqueueSnackbar("Connected to server", {variant: 'success'});
            });

            socket.on("reconnect_attempt", (attempt) => {
                enqueueSnackbar(`Not connected! Attempting to reconnect (${attempt})...`, {variant: 'info'});
            });

            socket.on("error", (error) => {
                enqueueSnackbar(`Error occurred, ${error}`, {variant: 'error'});
            });

            socket.on('disconnect', () => {
                enqueueSnackbar("Disconnected from server", {variant: 'error'});
            })

            return () => {
                socket.off('connect');
                socket.off('reconnect_attempt');
                socket.off('error');
                socket.off('disconnect');
            };
        }
    }, [socket]);

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
