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



import {createSlice, createAsyncThunk} from '@reduxjs/toolkit';
import {enqueueSnackbar} from 'notistack';
import {getMaidenhead} from '../common/common.jsx'; // or wherever it's defined


export const fetchLocationForUserId = createAsyncThunk(
    'location/fetchLocationForUser',
    async ({socket}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit(
                'data_request',
                'get-location-for-user-id',
                null,
                (response) => {
                    if (response.success) {
                        if (response.data) {
                            resolve(response.data);
                        } else {
                            enqueueSnackbar('No location found in the backend, please set one', {
                                variant: 'info',
                            });
                            resolve(null); // or resolve({}) if no data
                        }
                    } else {
                        enqueueSnackbar('Failed to get location from backend', {
                            variant: 'error',
                        });
                        reject(rejectWithValue('Failed to get location'));
                    }
                }
            );
        });
    }
);


export const storeLocation = createAsyncThunk(
    'location/handleSetLocation',
    async ({socket, location, locationId}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_submission', 'submit-location-for-user-id',
                {...location, name: "home", userid: null, id: locationId}, (response) => {
                    if (response['success']) {
                        enqueueSnackbar('Location set successfully', {
                            variant: 'success',
                        });
                        resolve(response.data);
                    } else {
                        enqueueSnackbar('Failed to set location', {
                            variant: 'error',
                        });
                        reject(rejectWithValue('Failed to set location'));
                    }
                });
        });
    }
);


// Example slice
const locationSlice = createSlice({
    name: 'location',
    initialState: {
        locationSaving: false,
        locationLoading: false,
        location: {lat: 0, lon: 0},
        locationId: null,
        locationUserId: null,
        qth: '',       // e.g., maidenhead
        polylines: [],
        error: null,
    },
    reducers: {
        setLocation: (state, action) => {
            state.location = action.payload;
        },
        setLocationId: (state, action) => {
            state.locationId = action.payload;
        },
        setLocationUserId: (state, action) => {
            state.locationUserId = action.payload;
        },
        setQth: (state, action) => {
            state.qth = action.payload;
        },
        setPolylines: (state, action) => {
            state.polylines = action.payload;
        },
        setLocationLoading: (state, action) => {
            state.locationLoading = action.payload;
        },
        setLocationSaving: (state, action) => {
            state.locationSaving = action.payload;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchLocationForUserId.pending, (state) => {
                state.locationLoading = true;
                state.error = null;
            })
            .addCase(fetchLocationForUserId.fulfilled, (state, action) => {
                state.locationLoading = false;
                if (action.payload) {
                    const payload = action.payload;
                    state.location = action.payload;
                    state.locationId = action.payload.id;
                    state.locationUserId = action.payload.userid;
                    state.qth = getMaidenhead(parseFloat(payload.lat), parseFloat(payload.lon));
                }
            })
            .addCase(fetchLocationForUserId.rejected, (state, action) => {
                state.locationLoading = false;
                state.error = action.payload;
            })
            .addCase(storeLocation.pending, (state) => {
                state.error = null;
                state.locationSaving = true;
            })
            .addCase(storeLocation.fulfilled, (state, action) => {
                state.locationLoading = false;
                if (action.payload) {
                    const payload = action.payload;
                    state.location = action.payload;
                    state.locationId = action.payload.id;
                    state.locationUserId = action.payload.userid;
                    state.qth = getMaidenhead(parseFloat(payload.lat), parseFloat(payload.lon));
                    state.locationSaving = false;
                }
            })
            .addCase(storeLocation.rejected, (state, action) => {
                state.locationLoading = false;
                state.error = action.payload;
                state.locationSaving = false;
            });
    },
});

export const {
    setLocation,
    setLocationId,
    setLocationUserId,
    setQth,
    setPolylines,
    setLocationLoading,
} = locationSlice.actions;

export default locationSlice.reducer;