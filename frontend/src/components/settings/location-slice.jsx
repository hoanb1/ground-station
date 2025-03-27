import {createSlice, createAsyncThunk} from '@reduxjs/toolkit';
import {enqueueSnackbar} from 'notistack';
import {getMaidenhead} from '../common/common.jsx'; // or wherever it's defined

// Example of async thunk that fetches location for the current user
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
                console.info("response", response);
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
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchLocationForUserId.pending, (state) => {
                state.locationLoading = true;
                state.error = null;
            })
            .addCase(fetchLocationForUserId.fulfilled, (state, action) => {
                state.locationLoading = false;
                if (!action.payload) {
                    // If no data was found, you can decide how to handle that:
                    return;
                }
                const data = action.payload;
                state.location = {
                    lat: parseFloat(data.lat),
                    lon: parseFloat(data.lon),
                };
                state.locationId = data.id;
                state.locationUserId = data.userid;
                state.qth = getMaidenhead(parseFloat(data.lat), parseFloat(data.lon));
            })
            .addCase(fetchLocationForUserId.rejected, (state, action) => {
                state.locationLoading = false;
                state.error = action.payload;
            })
            .addCase(storeLocation.pending, (state) => {
                state.locationLoading = true;
                state.error = null;
            })
            .addCase(storeLocation.fulfilled, (state, action) => {
                state.locationLoading = false;
                const payload = action.payload;
                state.location = action.payload;
                state.locationId = action.payload.id;
                state.locationUserId = action.payload.userid;
                state.qth = getMaidenhead(parseFloat(payload.lat), parseFloat(payload.lon));
            })
            .addCase(storeLocation.rejected, (state, action) => {
                state.locationLoading = false;
                state.error = action.payload;
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