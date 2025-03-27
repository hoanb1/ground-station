import { configureStore } from '@reduxjs/toolkit';
import rigsReducer from './hardware/rig-slice.jsx';
import rotatorsReducer from './hardware/rotaror-slice.jsx';

export const store = configureStore({
    reducer: {
        rigs: rigsReducer,
        rotators: rotatorsReducer,
    },
});

export default store;
