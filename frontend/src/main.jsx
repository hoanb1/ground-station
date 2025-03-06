import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import {BrowserRouter, createBrowserRouter, Route, RouterProvider, Routes} from "react-router";
import Dashboard from "./App.jsx";
import SettingsTabs from "./components/settings.jsx";
import TargetSatelliteGridLayout from "./components/sat-track.jsx";
import GlobalSatelliteTrack from "./components/global-sat-track.jsx";
import App from "./App.jsx";
import Layout from "./components/dashboard.jsx";

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
                        Component: TargetSatelliteGridLayout,
                    },
                    {
                        path: "settings",
                        Component: SettingsTabs,
                        children: [
                            {
                                path: "home",
                                Component: SettingsTabs,
                            },
                            {
                                path: "preferences",
                                Component: SettingsTabs,
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
