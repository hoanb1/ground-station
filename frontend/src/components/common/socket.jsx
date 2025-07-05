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


import React, {createContext, useCallback, useContext, useEffect, useState, useRef} from 'react';
import { useSnackbar } from 'notistack';
import { Manager } from "socket.io-client";
import {setSocketForMiddleware} from '../waterfall/waterfall-middleware.jsx';

// Create the context
const SocketContext = createContext();

// Provider component
export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const { enqueueSnackbar } = useSnackbar();
    //const [collectStats, setCollectStats] = useState(import.meta.env.PROD);
    const [collectStats, setCollectStats] = useState(true);
    const [token, setToken] = useState(null);

    // Replace state with ref for traffic stats
    const trafficStatsRef = useRef({
        // Application Level Stats (since Socket.IO doesn't have built-in stats)
        engine: {
            bytesReceived: 0,
            bytesSent: 0,
            packetsReceived: 0,
            packetsSent: 0,
            upgradeAttempts: 0
        },
        // Transport Information
        transport: {
            name: 'connecting...',
            query: {},
            readyState: 'opening'
        },
        // Manager Information
        manager: {
            readyState: 'opening',
            reconnecting: false,
            reconnectAttempts: 0
        },
        // Calculated Rates (per second)
        rates: {
            bytesPerSecond: { sent: 0, received: 0 },
            packetsPerSecond: { sent: 0, received: 0 }
        },
        // Session Information
        session: {
            start: Date.now(),
            duration: 0,
            lastUpdate: Date.now()
        },
        // Collection status
        collecting: false
    });

    // Application-level traffic tracking (since Socket.IO doesn't provide built-in stats)
    const applicationStats = useRef({
        bytesReceived: 0,
        bytesSent: 0,
        messagesReceived: 0,
        messagesSent: 0
    });

    // Previous values for rate calculation
    const previousStats = useRef({
        bytesSent: 0,
        bytesReceived: 0,
        messagesSent: 0,
        messagesReceived: 0,
        timestamp: Date.now()
    });

    // Store original emit function
    const originalEmitRef = useRef(null);

    const handleTokenChange = useCallback((token) => {
        setToken(token);
    }, []);

    // Helper to calculate message size for both text and binary data
    const calculateMessageSize = useCallback((data) => {
        if (!collectStats) return 0;

        try {
            // Handle different data types
            if (data instanceof ArrayBuffer) {
                return data.byteLength;
            }

            if (data instanceof Uint8Array || data instanceof Int8Array ||
                data instanceof Uint16Array || data instanceof Int16Array ||
                data instanceof Uint32Array || data instanceof Int32Array ||
                data instanceof Float32Array || data instanceof Float64Array) {
                return data.byteLength;
            }

            if (data instanceof Blob) {
                return data.size;
            }

            if (data instanceof File) {
                return data.size;
            }

            // Handle Buffer objects (Node.js style)
            if (typeof Buffer !== 'undefined' && data instanceof Buffer) {
                return data.length;
            }

            // Handle arrays of data (common in Socket.IO)
            if (Array.isArray(data)) {
                return data.reduce((total, item) => {
                    return total + calculateMessageSize(item);
                }, 0);
            }

            // Handle objects that might contain binary data
            if (typeof data === 'object' && data !== null) {
                let totalSize = 0;

                for (const [key, value] of Object.entries(data)) {
                    // Add key size
                    totalSize += new Blob([key]).size;
                    // Add value size (recursive)
                    totalSize += calculateMessageSize(value);
                }

                return totalSize;
            }

            // Default case: serialize as JSON for text data
            const jsonString = JSON.stringify(data);
            return new Blob([jsonString]).size;

        } catch (error) {
            console.warn('Error calculating message size:', error);
            // Conservative fallback - assume moderate size for unknown data
            return 1024; // 1KB fallback
        }
    }, [collectStats]);

    // Track application-level traffic
    const trackApplicationTraffic = useCallback((type, size) => {
        if (!collectStats) return;

        if (type === 'sent') {
            applicationStats.current.bytesSent += size;
            applicationStats.current.messagesSent += 1;
        } else if (type === 'received') {
            applicationStats.current.bytesReceived += size;
            applicationStats.current.messagesReceived += 1;
        }
    }, [collectStats]);

    // Update traffic stats once per second
    useEffect(() => {
        if (!socket) return;

        const updateTrafficStats = () => {
            if (!socket.connected) {
                return;
            }

            const now = Date.now();
            const manager = socket.io;

            // Get current application stats (only if collecting)
            const currentStats = collectStats ? {
                bytesReceived: applicationStats.current.bytesReceived,
                bytesSent: applicationStats.current.bytesSent,
                packetsReceived: applicationStats.current.messagesReceived,
                packetsSent: applicationStats.current.messagesSent,
                upgradeAttempts: 0
            } : {
                bytesReceived: 0,
                bytesSent: 0,
                packetsReceived: 0,
                packetsSent: 0,
                upgradeAttempts: 0
            };

            // Get transport and manager info (always available)
            const transportInfo = {
                name: socket.io.engine?.transport?.name || 'unknown',
                query: socket.io.engine?.transport?.query || {},
                readyState: socket.io.engine?.readyState || 'unknown'
            };

            const managerInfo = {
                readyState: manager?.readyState || 'unknown',
                reconnecting: manager?.reconnecting || false,
                reconnectAttempts: manager?.reconnection ? manager._reconnectionAttempts || 0 : 0
            };

            // Calculate rates (only if collecting)
            const prev = previousStats.current;
            const timeDelta = (now - prev.timestamp) / 1000;

            let rates = {
                bytesPerSecond: { sent: 0, received: 0 },
                packetsPerSecond: { sent: 0, received: 0 }
            };

            if (collectStats && timeDelta > 0) {
                const bytesSentDiff = currentStats.bytesSent - prev.bytesSent;
                const bytesReceivedDiff = currentStats.bytesReceived - prev.bytesReceived;
                const messagesSentDiff = currentStats.packetsSent - prev.messagesSent;
                const messagesReceivedDiff = currentStats.packetsReceived - prev.messagesReceived;

                rates = {
                    bytesPerSecond: {
                        sent: Math.max(0, Math.round(bytesSentDiff / timeDelta)),
                        received: Math.max(0, Math.round(bytesReceivedDiff / timeDelta))
                    },
                    packetsPerSecond: {
                        sent: Math.max(0, Math.round(messagesSentDiff / timeDelta)),
                        received: Math.max(0, Math.round(messagesReceivedDiff / timeDelta))
                    }
                };
            }

            // Update ref directly (no re-render)
            trafficStatsRef.current = {
                engine: currentStats,
                transport: transportInfo,
                manager: managerInfo,
                rates: rates,
                session: {
                    start: trafficStatsRef.current.session.start,
                    duration: now - trafficStatsRef.current.session.start,
                    lastUpdate: now
                },
                collecting: collectStats
            };

            // Update previous values for next rate calculation (only if collecting)
            if (collectStats) {
                previousStats.current = {
                    bytesSent: currentStats.bytesSent,
                    bytesReceived: currentStats.bytesReceived,
                    messagesSent: currentStats.packetsSent,
                    messagesReceived: currentStats.packetsReceived,
                    timestamp: now
                };
            }
        };

        // Update immediately
        updateTrafficStats();

        // Then update every second
        const interval = setInterval(updateTrafficStats, 1000);

        return () => {
            clearInterval(interval);
        };
    }, [socket, collectStats]);

    // Track socket traffic at application level - controlled by collectStats flag
    useEffect(() => {
        if (!socket) return;

        // Store original emit function if not already stored
        if (!originalEmitRef.current) {
            originalEmitRef.current = socket.emit;
        }

        if (collectStats) {
            // Override emit to track outgoing messages
            socket.emit = function(...args) {
                const messageSize = calculateMessageSize(args);
                trackApplicationTraffic('sent', messageSize);
                return originalEmitRef.current.apply(this, args);
            };

            // Track all incoming messages using onAny
            const handleIncomingMessage = (eventName, ...args) => {
                const messageSize = calculateMessageSize([eventName, ...args]);
                trackApplicationTraffic('received', messageSize);
            };

            socket.onAny(handleIncomingMessage);

            return () => {
                // Remove the listener
                socket.offAny(handleIncomingMessage);
            };
        } else {
            // Restore original emit function when not collecting
            socket.emit = originalEmitRef.current;
        }
    }, [socket, collectStats, calculateMessageSize, trackApplicationTraffic]);

    // Reset stats when collectStats changes
    useEffect(() => {
        if (collectStats) {
            const now = Date.now();
            console.info('Starting traffic collection');

            // Reset application stats
            applicationStats.current = {
                bytesReceived: 0,
                bytesSent: 0,
                messagesReceived: 0,
                messagesSent: 0
            };

            // Reset previous stats for rate calculation
            previousStats.current = {
                bytesSent: 0,
                bytesReceived: 0,
                messagesSent: 0,
                messagesReceived: 0,
                timestamp: now
            };

            // Update session start time in ref
            trafficStatsRef.current = {
                ...trafficStatsRef.current,
                session: {
                    start: now,
                    duration: 0,
                    lastUpdate: now
                },
                collecting: true
            };
        } else {
            console.info('Stopping traffic collection');
            trafficStatsRef.current = {
                ...trafficStatsRef.current,
                collecting: false
            };
        }
    }, [collectStats]);

    // Get Socket.IO engine stats (for compatibility, but will use our application stats)
    const getSocketIOEngineStats = useCallback(() => {
        if (socket && socket.io) {
            const manager = socket.io;
            const engine = socket.io.engine;

            return {
                engine: {
                    bytesReceived: collectStats ? applicationStats.current.bytesReceived : 0,
                    bytesSent: collectStats ? applicationStats.current.bytesSent : 0,
                    packetsReceived: collectStats ? applicationStats.current.messagesReceived : 0,
                    packetsSent: collectStats ? applicationStats.current.messagesSent : 0,
                    upgradeAttempts: 0
                },
                transport: {
                    name: engine?.transport?.name || 'unknown',
                    query: engine?.transport?.query || {},
                    readyState: engine?.readyState || 'unknown'
                },
                manager: {
                    readyState: manager?.readyState || 'unknown',
                    reconnecting: manager?.reconnecting || false,
                    reconnectAttempts: manager?.reconnection ? manager._reconnectionAttempts || 0 : 0
                }
            };
        }
        return null;
    }, [socket, collectStats]);

    useEffect(() => {
        // Initialize socket connection
        const host = window.location.hostname;
        const port = window.location.port;
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const backendURL = `${protocol}://${host}:${port}/ws`;
        console.info("Connecting to backend at", backendURL);
        const manager = new Manager(backendURL);
        const newSocket = manager.socket("/");
        setSocket(newSocket);
        setSocketForMiddleware(newSocket);

        // Reset stats when socket connects
        newSocket.on('connect', () => {
            const now = Date.now();
            console.info('Socket connected - resetting traffic stats');

            // Reset application stats if collecting
            if (collectStats) {
                applicationStats.current = {
                    bytesReceived: 0,
                    bytesSent: 0,
                    messagesReceived: 0,
                    messagesSent: 0
                };

                // Reset previous stats for rate calculation
                previousStats.current = {
                    bytesSent: 0,
                    bytesReceived: 0,
                    messagesSent: 0,
                    messagesReceived: 0,
                    timestamp: now
                };
            }

            // Reset session start time in ref
            trafficStatsRef.current = {
                ...trafficStatsRef.current,
                session: {
                    start: now,
                    duration: 0,
                    lastUpdate: now
                },
                rates: {
                    bytesPerSecond: { sent: 0, received: 0 },
                    packetsPerSecond: { sent: 0, received: 0 }
                },
                transport: {
                    name: newSocket.io.engine?.transport?.name || 'websocket',
                    query: newSocket.io.engine?.transport?.query || {},
                    readyState: 'open'
                },
                manager: {
                    readyState: 'open',
                    reconnecting: false,
                    reconnectAttempts: 0
                },
                collecting: collectStats
            };
        });

        newSocket.on('disconnect', () => {
            console.info('Socket disconnected - updating traffic stats');
            trafficStatsRef.current = {
                ...trafficStatsRef.current,
                transport: {
                    ...trafficStatsRef.current.transport,
                    name: 'disconnected',
                    readyState: 'closed'
                },
                manager: {
                    ...trafficStatsRef.current.manager,
                    readyState: 'closed',
                    reconnecting: false
                },
                rates: {
                    bytesPerSecond: { sent: 0, received: 0 },
                    packetsPerSecond: { sent: 0, received: 0 }
                }
            };
        });

        // Listen for transport events
        newSocket.io.on('upgrade', () => {
            console.info('Socket.IO transport upgraded');
            trafficStatsRef.current = {
                ...trafficStatsRef.current,
                engine: {
                    ...trafficStatsRef.current.engine,
                    upgradeAttempts: trafficStatsRef.current.engine.upgradeAttempts + 1
                }
            };
        });

        newSocket.io.on('upgradeError', (error) => {
            console.warn('Socket.IO upgrade error:', error);
        });

        // Cleanup on unmount
        return () => {
            console.info('Closing socket connection');
            newSocket.close();
        };
    }, [collectStats]);

    return (
        <SocketContext.Provider value={{
            socket,
            handleTokenChange,
            trafficStatsRef,
            getSocketIOEngineStats,
            setCollectStats,
        }}>
            {children}
        </SocketContext.Provider>
    );
};

// Custom hook for using the socket in other components
export const useSocket = () => {
    return useContext(SocketContext);
};