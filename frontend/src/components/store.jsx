import { configureStore } from '@reduxjs/toolkit';
import rigsReducer from './hardware/rig-slice.jsx';
import rotatorsReducer from './hardware/rotaror-slice.jsx';
import tleSourcesReducer from './satellites/tle-sources-slice.jsx';
import satellitesReducer from './satellites/satellite-slice.jsx';
import usersReducer from './settings/users-slice.jsx';

export const store = configureStore({
    reducer: {
        rigs: rigsReducer,
        rotators: rotatorsReducer,
        tleSources: tleSourcesReducer,
        satellites: satellitesReducer,
        users: usersReducer,
    },
});

export default store;
