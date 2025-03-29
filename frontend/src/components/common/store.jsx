import { configureStore } from '@reduxjs/toolkit';
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

export const store = configureStore({
    reducer: {
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
    },
});

export default store;
