import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import {BrowserRouter, createBrowserRouter, Route, RouterProvider, Routes} from "react-router";
import {
    SettingsTabLocation,
    SettingsTabRotator,
    SettingsTabPreferences,
    SettingsTabSatellites,
    SettingsTabMaintenance,
    SettingsTabRig,
    SettingsTabTLESources,
    SettingsTabAbout,
    SettingsTabSatelliteGroups,
    SettingsTabUsers
} from "./components/settings/settings.jsx";
import GlobalSatelliteTrack from "./components/overview-sat-track.jsx";
import App from "./App.jsx";
import Layout from "./components/common/dashboard.jsx";
import TargetSatelliteTrack from "./components/target-sat-track.jsx";
import {SocketProvider, useSocket} from './components/common/socket.jsx';
import {AuthProvider} from "./components/common/auth.jsx";

const router = createBrowserRouter([
    {
        Component: App, // root layout route
        children: [
            {
                path: "/",
                Component: Layout,
                children: [
                    {
                        path: "",
                        Component: GlobalSatelliteTrack,
                    },
                    {
                        path: "track",
                        Component: TargetSatelliteTrack,
                    },
                    {
                        path: "satellites",
                        children: [
                            {
                                path: "tlesources",
                                Component: SettingsTabTLESources,
                            },
                            {
                                path: "satellites",
                                Component: SettingsTabSatellites,
                            },
                            {
                                path: "groups",
                                Component: SettingsTabSatelliteGroups,
                            },
                        ],
                    },
                    {
                        path: "settings",
                        children: [
                            {
                                path: "preferences",
                                Component: SettingsTabPreferences,
                            },
                            {
                                path: "location",
                                Component: SettingsTabLocation,
                            },
                            {
                                path: "users",
                                Component: SettingsTabUsers,
                            },
                            {
                                path: "maintenance",
                                Component: SettingsTabMaintenance,
                            },
                            {
                                path: "about",
                                Component: SettingsTabAbout,
                            },
                        ],
                    },
                    {
                        path: "hardware",
                        children: [
                            {
                                path: "rig",
                                Component: SettingsTabRig,
                            },
                            {
                                path: "rotator",
                                Component: SettingsTabRotator,
                            },
                        ],
                    },
                ],
            },
        ],
    },
]);

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <SocketProvider >
            <AuthProvider>
                <RouterProvider router={router} />
            </AuthProvider>
        </SocketProvider>
    </StrictMode>
);
