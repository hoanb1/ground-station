import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { enqueueSnackbar } from 'notistack';

export const startSatelliteSync = createAsyncThunk(
    'syncSatellite/start',
    async ({ socket }, { rejectWithValue }) => {
        try {
            // Emitting the socket event for synchronization
            return await new Promise((resolve, reject) => {
                socket.emit('data_request', 'sync-satellite-data', null, (response) => {
                    if (response.success === true) {
                        resolve('Satellite data synchronization initiated');
                    } else {
                        reject(response.error);
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error);
        }
    }
);

const syncSatelliteSlice = createSlice({
    name: 'syncSatellite',
    initialState: {
        progress: {},
        message: '',
        status: 'idle', // "idle", "loading", "succeeded", "failed"
        error: null,
    },
    reducers: {
        setProgress: (state, action) => {
            state.progress = action.payload;
        },
        setMessage: (state, action) => {
            state.message = action.payload;
        },
        setStatus: (state, action) => {
            state.status = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(startSatelliteSync.pending, (state) => {
                state.status = 'loading';
                state.error = null;
            })
            .addCase(startSatelliteSync.fulfilled, (state, action) => {
                state.status = 'succeeded';
                // Optionally store a message or other data
            })
            .addCase(startSatelliteSync.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload || 'Failed to synchronize satellites';
            });
    },
});

export const {
    setProgress,
    setMessage,
    setStatus
} = syncSatelliteSlice.actions;

export default syncSatelliteSlice.reducer;
