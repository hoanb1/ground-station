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

import { store } from '../components/common/store.jsx';
import { fetchVersionInfo } from "../components/dashboard/version-slice.jsx";
import { fetchPreferences } from '../components/settings/preferences-slice.jsx';
import { fetchLocationForUserId } from '../components/settings/location-slice.jsx';
import { fetchRigs } from '../components/hardware/rig-slice.jsx';
import { fetchRotators } from '../components/hardware/rotaror-slice.jsx';
import { fetchCameras } from '../components/hardware/camera-slice.jsx';
import { fetchSDRs } from '../components/hardware/sdr-slice.jsx';
import { fetchTLESources } from '../components/satellites/sources-slice.jsx';
import { fetchSatelliteGroups } from '../components/satellites/groups-slice.jsx';
import { getTrackingStateFromBackend, getTargetMapSettings } from '../components/target/target-slice.jsx';
import { getOverviewMapSettings } from '../components/overview/overview-slice.jsx';
import { fetchScheduledObservations, fetchMonitoredSatellites } from '../components/scheduler/scheduler-slice.jsx';

/**
 * Initialize all application data from backend when connection is established
 * @param {Object} socket - Socket.IO connection instance
 */
export function initializeAppData(socket) {
    store.dispatch(fetchVersionInfo());
    store.dispatch(fetchPreferences({socket}));
    store.dispatch(fetchLocationForUserId({socket}));
    store.dispatch(fetchRigs({socket}));
    store.dispatch(fetchRotators({socket}));
    store.dispatch(fetchCameras({socket}));
    store.dispatch(fetchSDRs({socket}));
    store.dispatch(fetchTLESources({socket}));
    store.dispatch(fetchSatelliteGroups({socket}));
    store.dispatch(getTrackingStateFromBackend({socket}));
    store.dispatch(getOverviewMapSettings({socket}));
    store.dispatch(getTargetMapSettings({socket}));
    store.dispatch(fetchScheduledObservations({socket}));
    store.dispatch(fetchMonitoredSatellites({socket}));
}
