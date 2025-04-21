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
    SettingsTabUsers, SettingsTabCamera,
    SettingsTabSDR
} from "./components/settings/settings.jsx";
import GlobalSatelliteTrackLayout from "./components/overview/overview-sat-layout.jsx";
import App from "./App.jsx";
import Layout from "./components/dashboard/dashboard-layout.jsx";
import TargetSatelliteLayout from "./components/target/target-sat-layout.jsx";
import MainWaterfallDisplay from "./components/waterfall/waterfall-view.jsx";
import {SocketProvider, useSocket} from './components/common/socket.jsx';
import {AuthProvider} from "./components/common/auth.jsx";
import { Provider as ReduxProvider} from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from './components/common/store.jsx';
import ErrorPage from './components/common/error-page.jsx';
import WaterfallLayout from "./components/waterfall/waterfall-layout.jsx";

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
                        errorElement: <ErrorPage />,
                        Component: GlobalSatelliteTrackLayout,
                    },
                    {
                        path: "track",
                        Component: TargetSatelliteLayout,
                    },
                    {
                        path: "waterfall",
                        Component: WaterfallLayout,
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
                            {
                                path: "cameras",
                                Component: SettingsTabCamera,
                            },
                            {
                                path: "sdrs",
                                Component: SettingsTabSDR,
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
        <ReduxProvider store={store}>
            <PersistGate loading={null} persistor={persistor}>
                <SocketProvider>
                    <AuthProvider>
                        <RouterProvider router={router} />
                    </AuthProvider>
                </SocketProvider>
            </PersistGate>
        </ReduxProvider>
    </StrictMode>
);
