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
        const host = window.location.hostname;
        const backendURL = `ws://${host}:5000/ws`;
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
