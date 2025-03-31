import {combineReducers, configureStore} from '@reduxjs/toolkit';
import { persistStore, persistReducer } from "redux-persist";
import storage from "redux-persist/lib/storage";
import rigsReducer from '../hardware/rig-slice.jsx';
import rotatorsReducer from '../hardware/rotaror-slice.jsx';
import tleSourcesReducer from '../satellites/sources-slice.jsx';
import satellitesReducer from '../satellites/satellite-slice.jsx';
import usersReducer from '../settings/users-slice.jsx';
import satelliteGroupReducer from '../satellites/groups-slice.jsx';
import locationReducer from '../settings/location-slice.jsx';
import synchronizeReducer from '../satellites/synchronize-slice.jsx';
import preferencesReducer from '../settings/preferences-slice.jsx';
import targetSatTrackReducer from '../target/target-sat-slice.jsx'
import overviewSatTrackReducer from '../overview/overview-sat-slice.jsx'


const persistConfig = {
    key: "root",
    storage,
    whitelist: ['preferences', 'overviewSatTrack', 'targetSatTrack'],
};

const rootReducer = combineReducers({
    rigs: rigsReducer,
    rotators: rotatorsReducer,
    tleSources: tleSourcesReducer,
    satellites: satellitesReducer,
    satelliteGroups: satelliteGroupReducer,
    users: usersReducer,
    location: locationReducer,
    syncSatellite: synchronizeReducer,
    preferences: preferencesReducer,
    targetSatTrack: targetSatTrackReducer,
    overviewSatTrack: overviewSatTrackReducer
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
    reducer: persistedReducer,
    devTools: process.env.NODE_ENV !== "production",
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            immutableCheck: { warnAfter: 256 },
            serializableCheck: {
                warnAfter: 256,
                ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
            },
        }),
});

//export default store;
export const persistor = persistStore(store);
