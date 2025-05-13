/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
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



import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const startSatelliteSync = createAsyncThunk(
    'syncSatellite/start',
    async ({ socket }, { rejectWithValue }) => {
        try {
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
        progress: 0,
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
