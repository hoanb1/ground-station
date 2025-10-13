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

/* global process */

import {combineReducers, configureStore} from '@reduxjs/toolkit';
import { persistStore, persistReducer } from "redux-persist";
import storage from "redux-persist/lib/storage";
import rigsReducer from '../hardware/rig-slice.jsx';
import rotatorsReducer from '../hardware/rotaror-slice.jsx';
import tleSourcesReducer from '../satellites/sources-slice.jsx';
import satellitesReducer from '../satellites/satellite-slice.jsx';
import satelliteGroupReducer from '../satellites/groups-slice.jsx';
import locationReducer from '../settings/location-slice.jsx';
import synchronizeReducer from '../satellites/synchronize-slice.jsx';
import preferencesReducer from '../settings/preferences-slice.jsx';
import targetSatTrackReducer from '../target/target-slice.jsx'
import overviewSatTrackReducer from '../overview/overview-slice.jsx';
import dashboardReducer from '../dashboard/dashboard-slice.jsx';
import weatherReducer from '../overview/weather-slice.jsx';
import cameraReducer from '../hardware/camera-slice.jsx';
import waterfallReducer from '../waterfall/waterfall-slice.jsx';
import sdrsReducer from '../hardware/sdr-slice.jsx';
import versionReducer from "../dashboard/version-slice.jsx";
import backendSyncMiddleware from '../waterfall/waterfall-middleware.jsx';


// Persist configuration for waterfall slice
const waterfallPersistConfig = {
    key: 'waterfall',
    storage,
    whitelist: ['centerFrequency', 'colorMap', 'dbRange', 'gain', 'sampleRate', 'showRightSideWaterFallAccessories',
        'showLeftSideWaterFallAccessories', 'selectedAntenna', 'selectedSDRId', 'selectedOffsetMode', 
        'selectedOffsetValue', 'fftAveraging', 'showRotatorDottedLines']
};

// Persist configuration for the 'rigs' slice
const rigsPersistConfig = {
    key: 'rigs',
    storage,
    whitelist: []
};

// Persist configuration for the 'rotators' slice
const rotatorsPersistConfig = {
    key: 'rotators',
    storage,
    whitelist: []
};

// Persist configuration for the 'TLE sources' slice
const tleSourcesPersistConfig = {
    key: 'tleSources',
    storage,
    whitelist: []
};

// Persist configuration for satellites slice
const satellitesPersistConfig = {
    key: 'satellites',
    storage,
    whitelist: []
};

// Persist configuration for satellite groups slice
const satelliteGroupsPersistConfig = {
    key: 'satelliteGroups',
    storage,
    whitelist: []
};


// Persist configuration for location slice
const locationPersistConfig = {
    key: 'location',
    storage,
    whitelist: []
};

// Persist configuration for the 'synchronize' slice
const synchronizePersistConfig = {
    key: 'synchronize',
    storage,
    whitelist: []
};

// Persist configuration for the 'preferences' slice
const preferencesPersistConfig = {
    key: 'preferences',
    storage,
    whitelist: []
};

// Persist configuration for the target satellite tracking slice
const targetSatTrackPersistConfig = {
    key: 'targetSatTrack',
    storage,
    whitelist: ['']
};

// Persist configuration for overview satellite tracking slice
const overviewSatTrackPersistConfig = {
    key: 'overviewSatTrack',
    storage,
    whitelist: ['selectedSatGroupId', 'selectedSatelliteId']
};

// Persist configuration for the dashboard slice
const dashboardPersistConfig = {
    key: 'dashboard',
    storage,
    whitelist: []
};

// Persist configuration for weather slice
const weatherPersistConfig = {
    key: 'weather',
    storage,
    whitelist: []
};

// Persist configuration for camera slice
const cameraPersistConfig = {
    key: 'camera',
    storage,
    whitelist: ['selectedCameraId', 'selectedCamera']
};

// Persist configuration for SDR slice
const sdrPersistConfig = {
    key: 'sdr',
    storage,
    whitelist: []
};

// Persist configuration for VersionInfo slice
const versionInfoConfig = {
    key: 'version',
    storage,
    whitelist: []
};


// Wrap reducers with persistReducer
const persistedWaterfallReducer = persistReducer(waterfallPersistConfig, waterfallReducer);
const persistedRigsReducer = persistReducer(rigsPersistConfig, rigsReducer);
const persistedRotatorsReducer = persistReducer(rotatorsPersistConfig, rotatorsReducer);
const persistedTleSourcesReducer = persistReducer(tleSourcesPersistConfig, tleSourcesReducer);
const persistedSatellitesReducer = persistReducer(satellitesPersistConfig, satellitesReducer);
const persistedSatelliteGroupsReducer = persistReducer(satelliteGroupsPersistConfig, satelliteGroupReducer);
const persistedLocationReducer = persistReducer(locationPersistConfig, locationReducer);
const persistedSynchronizeReducer = persistReducer(synchronizePersistConfig, synchronizeReducer);
const persistedPreferencesReducer = persistReducer(preferencesPersistConfig, preferencesReducer);
const persistedTargetSatTrackReducer = persistReducer(targetSatTrackPersistConfig, targetSatTrackReducer);
const persistedOverviewSatTrackReducer = persistReducer(overviewSatTrackPersistConfig, overviewSatTrackReducer);
const persistedDashboardReducer = persistReducer(dashboardPersistConfig, dashboardReducer);
const persistedWeatherReducer = persistReducer(weatherPersistConfig, weatherReducer);
const persistedCameraReducer = persistReducer(cameraPersistConfig, cameraReducer);
const persistedSdrReducer = persistReducer(sdrPersistConfig, sdrsReducer);
const persistedVersionInfoReducer = persistReducer(versionInfoConfig, versionReducer);


export const store = configureStore({
    reducer: {
        waterfall: persistedWaterfallReducer,
        rigs: persistedRigsReducer,
        rotators: persistedRotatorsReducer,
        tleSources: persistedTleSourcesReducer,
        satellites: persistedSatellitesReducer,
        satelliteGroups: persistedSatelliteGroupsReducer,
        location: persistedLocationReducer,
        syncSatellite: persistedSynchronizeReducer,
        preferences: persistedPreferencesReducer,
        targetSatTrack: persistedTargetSatTrackReducer,
        overviewSatTrack: persistedOverviewSatTrackReducer,
        dashboard: persistedDashboardReducer,
        weather: persistedWeatherReducer,
        cameras: persistedCameraReducer,
        sdrs: persistedSdrReducer,
        version: persistedVersionInfoReducer,
    },
    devTools: process.env.NODE_ENV !== "production",
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            immutableCheck: { warnAfter: 256 },
            serializableCheck: {
                warnAfter: 256,
                ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
            },
        }).concat(backendSyncMiddleware),
});

//export default store;
export const persistor = persistStore(store);
