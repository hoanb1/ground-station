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
 *
 */

import * as React from 'react';
import { useState } from "react";
import { Outlet } from "react-router";
import { ReactRouterAppProvider } from "@toolpad/core/react-router";
import { setupTheme } from './theme.js';
import { useSocket } from "./components/common/socket.jsx";
import { useAuth } from "./components/common/auth.jsx";
import LoginForm from './components/common/login.jsx';
import { AudioProvider } from "./components/dashboard/audio-provider.jsx";
import { ToastProvider } from "./components/common/toast-provider.jsx";
import { NAVIGATION } from "./config/navigation.jsx";
import { BRANDING } from "./config/branding.jsx";
import { socketEventHandlers } from "./hooks/socket-event-handlers.jsx";
import { appAuthentication } from "./hooks/app-authentication.jsx";
import { passFetching } from "./hooks/pass-fetching.jsx";

export default function App() {
    const { socket } = useSocket();
    const { session } = useAuth();
    const [loggedIn, setLoggedIn] = useState(true);
    const dashboardTheme = setupTheme();

    const authentication = appAuthentication();

    socketEventHandlers(socket);
    passFetching(socket);

    return (
        <AudioProvider>
            <ToastProvider>
                <ReactRouterAppProvider
                    navigation={NAVIGATION}
                    theme={dashboardTheme}
                    authentication={authentication}
                    session={session}
                    branding={BRANDING}
                >
                    {loggedIn ? <Outlet/> : <LoginForm/>}
                </ReactRouterAppProvider>
            </ToastProvider>
        </AudioProvider>
    );
}
