import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useSnackbar } from 'notistack';

// Create the context
const SocketContext = createContext();

// Provider component
export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const { enqueueSnackbar } = useSnackbar();

    // To listen to the connection event
    useEffect(() => {
        if (socket) {
            socket.on('connect', () => {
                console.log('Socket connected with ID:', socket.id);
                enqueueSnackbar("Connected to server", {variant: 'success'});
            });

            socket.on('disconnect', () => {
                enqueueSnackbar("Disconnected from server", {variant: 'error'});
            })
            // Optional cleanup for the event listener
            return () => {
                socket.off('connect');

            };
        }
    }, [socket]);

    useEffect(() => {
        // Initialize socket connection (replace URL with your server's URL)
        const newSocket = io('ws://localhost:5000');
        setSocket(newSocket);

        // Cleanup on unmount
        return () => newSocket.close();
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
