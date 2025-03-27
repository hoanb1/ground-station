import { configureStore } from '@reduxjs/toolkit';
import rigsReducer from './hardware/rig-slice.jsx';
import rotatorsReducer from './hardware/rotaror-slice.jsx';
import tleSourcesReducer from './satellites/tle-sources-slice.jsx';

export const store = configureStore({
    reducer: {
        rigs: rigsReducer,
        rotators: rotatorsReducer,
        tleSources: tleSourcesReducer,
    },
});

export default store;
