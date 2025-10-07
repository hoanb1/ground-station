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
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import useWakeLock from './wake-lock-logic.jsx';
import toast from 'react-hot-toast';

// Define the default context value
const defaultWakeLockContext = {
    isSupported: false,
    isActive: false,
    activeRequests: 0,
    hasManualRequest: false,
    requestWakeLock: () => {
        console.warn('WakeLockProvider not found. Make sure to wrap your component with WakeLockProvider.');
    },
    releaseWakeLock: () => {
        console.warn('WakeLockProvider not found. Make sure to wrap your component with WakeLockProvider.');
    },
    forceRelease: () => {
        console.warn('WakeLockProvider not found. Make sure to wrap your component with WakeLockProvider.');
    },
    requestManualWakeLock: async () => {
        console.warn('WakeLockProvider not found. Make sure to wrap your component with WakeLockProvider.');
        return false;
    },
    releaseManualWakeLock: () => {
        console.warn('WakeLockProvider not found. Make sure to wrap your component with WakeLockProvider.');
    },
};

const WakeLockContext = createContext(defaultWakeLockContext);

export const WakeLockProvider = ({ children }) => {
    const [wakeLockRequests, setWakeLockRequests] = useState(new Set());
    const [hasManualRequest, setHasManualRequest] = useState(false);

    const shouldBeActive = wakeLockRequests.size > 0 || hasManualRequest;
    const wakeLock = useWakeLock(shouldBeActive);

    const requestWakeLock = useCallback((componentId, componentName = 'Unknown') => {
        setWakeLockRequests(prev => {
            const newSet = new Set([...prev, componentId]);

            // Show notification when first wake lock is requested
            if (prev.size === 0 && newSet.size === 1 && !hasManualRequest) {
                if (wakeLock.isSupported) {
                    toast(`Screen wake lock activated by ${componentName}`, {
                        icon: 'ℹ️',
                        duration: 3000,
                    });
                } else {
                    toast('Wake lock not supported on this device', {
                        icon: '⚠️',
                        duration: 5000,
                    });
                }
            }

            return newSet;
        });
    }, [wakeLock.isSupported, hasManualRequest]);

    const releaseWakeLock = useCallback((componentId, componentName = 'Unknown') => {
        setWakeLockRequests(prev => {
            const newSet = new Set(prev);
            newSet.delete(componentId);

            // Show notification when last wake lock is released
            if (prev.size > 0 && newSet.size === 0 && !hasManualRequest) {
                toast(`Screen wake lock released by ${componentName}`, {
                    icon: 'ℹ️',
                    duration: 2000,
                });
            }

            return newSet;
        });
    }, [hasManualRequest]);

    const requestManualWakeLock = useCallback(async () => {
        if (!wakeLock.isSupported) {
            toast('Wake lock not supported on this device', {
                icon: '⚠️',
                duration: 5000,
            });
            return false;
        }

        setHasManualRequest(true);
        toast.success('Screen wake lock activated', {
            duration: 2000,
        });
        return true;
    }, [wakeLock.isSupported]);

    const releaseManualWakeLock = useCallback(() => {
        setHasManualRequest(false);
        toast('Manual wake lock released', {
            icon: 'ℹ️',
            duration: 2000,
        });
    }, []);

    const forceRelease = useCallback(() => {
        setWakeLockRequests(new Set());
        setHasManualRequest(false);
        toast('Screen wake lock released', {
            icon: 'ℹ️',
            duration: 2000,
        });
    }, []);

    const contextValue = {
        isSupported: wakeLock.isSupported,
        isActive: wakeLock.isActive,
        activeRequests: wakeLockRequests.size,
        hasManualRequest,
        requestWakeLock,
        releaseWakeLock,
        forceRelease,
        requestManualWakeLock,
        releaseManualWakeLock,
    };

    return (
        <WakeLockContext.Provider value={contextValue}>
            {children}
        </WakeLockContext.Provider>
    );
};

export const useWakeLockContext = () => {
    const context = useContext(WakeLockContext);
    if (context === defaultWakeLockContext) {
        console.warn('useWakeLockContext is being used outside of WakeLockProvider');
    }
    return context;
};

// Convenience hook for components that want to request wake lock
export const useComponentWakeLock = (componentName = 'Component', shouldRequest = false) => {
    const { requestWakeLock, releaseWakeLock } = useWakeLockContext();
    const componentId = React.useId();

    React.useEffect(() => {
        if (shouldRequest) {
            requestWakeLock(componentId, componentName);
            return () => releaseWakeLock(componentId, componentName);
        }
    }, [componentId, componentName, shouldRequest, requestWakeLock, releaseWakeLock]);

    return { componentId, requestWakeLock, releaseWakeLock };
};