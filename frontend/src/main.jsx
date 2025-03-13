import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import {BrowserRouter, createBrowserRouter, Route, RouterProvider, Routes} from "react-router";
import {
    SettingsTabLocation,
    SettingsTabRotor,
    SettingsTabPreferences,
    SettingsTabTLEs,
    SettingsTabMaintenance, SettingsTabRig
} from "./components/settings.jsx";
import GlobalSatelliteTrack from "./components/overview-sat-track.jsx";
import App from "./App.jsx";
import Layout from "./components/dashboard.jsx";
import TargetSatelliteTrack from "./components/target-sat-track.jsx";

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
                        path: "settings",
                        children: [
                            {
                                path: "",
                                Component: SettingsTabPreferences,
                            },
                            {
                                path: "preferences",
                                Component: SettingsTabPreferences,
                            },
                            {
                                path: "location",
                                Component: SettingsTabLocation,
                            },
                            {
                                path: "rig",
                                Component: SettingsTabRig,
                            },
                            {
                                path: "rotor",
                                Component: SettingsTabRotor,
                            },
                            {
                                path: "tles",
                                Component: SettingsTabTLEs,
                            },
                            {
                                path: "maintenance",
                                Component: SettingsTabMaintenance,
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
        <RouterProvider router={router} />
    </StrictMode>
);
