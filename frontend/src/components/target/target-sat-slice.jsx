import { createSlice } from '@reduxjs/toolkit';


import {createAsyncThunk} from '@reduxjs/toolkit';
import {useEffect} from "react";
import {enqueueSnackbar} from "notistack";

export const setTrackingStateBackend = createAsyncThunk(
    'targetSatTrack/setTrackingStateBackend',
    async ({socket, data}, {rejectWithValue}) => {
        const {noradId, state, groupId} = data;
        const trackState = {
            'name': 'satellite-tracking',
            'value': {
                'norad_id': noradId,
                'state': state,
                'group_id': groupId
            }
        };

        return new Promise((resolve, reject) => {
            socket.emit('data_submission', 'set-tracking-state', trackState, (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    console.log("set-tracking-state failed: ", response);
                    reject(rejectWithValue(response));
                }
            });
        });
    }
);


export const fetchNextPasses = createAsyncThunk(
    'targetSatTrack/fetchNextPasses',
    async ({socket, noradId}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_request', 'fetch-next-passes', noradId, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue("Failed getting next passes"));
                }
            });
        });
    }
);


const targetSatTrackSlice = createSlice({
    name: 'targetSatTrack',
    initialState: {
        groupId: null,
        satelliteId: null,
        trackingState: {},
        satelliteData: {
            position: {
                lat: 0,
                lng: 0,
                alt: 0,
                vel: 0,
                az: 0,
                el: 0,
            },
            details: {
                name: '',
                norad_id: '',
                name_other: '',
                alternative_name: '',
                operator: '',
                countries: '',
                tle1: "",
                tle2: "",
                launched: null,
                deployed: null,
                decayed: null,
                updated: null,
                status: '',
                website: '',
                is_geostationary: false,
            },
            transmitters: [],
        },
        satellitePasses: [],
        passesLoading: false,
        passesError: null,
        loading: false,
        error: null,
    },
    reducers: {
        setSatelliteData(state, action) {
            state.satelliteData = action.payload;
        },
        setSatellitePasses(state, action) {
            state.satellitePasses = action.payload;
        },
        setSatGroupId(state, action) {
            state.groupId = action.payload;
        },
        setSatelliteId(state, action) {
            state.satelliteId = action.payload;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(setTrackingStateBackend.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(setTrackingStateBackend.fulfilled, (state, action) => {
                state.loading = false;
                state.trackingState = action.payload['data'];
                state.groupId = action.payload['data']['value']['group_id'];
                state.satelliteId = action.payload['data']['value']['norad_id'];
                state.error = null;
            })
            .addCase(setTrackingStateBackend.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(fetchNextPasses.pending, (state) => {
                state.passesLoading = true;
                state.passesError = null;
            })
            .addCase(fetchNextPasses.fulfilled, (state, action) => {
                state.passesLoading = false;
                state.satellitePasses = action.payload;
                state.passesError = null;
            })
            .addCase(fetchNextPasses.rejected, (state, action) => {
                state.passesLoading = false;
                state.passesError = action.payload;
            });
    }
});

export const {
    setSatelliteData,
    setSatellitePasses,
    setSatelliteId,
    setSatGroupId
} = targetSatTrackSlice.actions;

export default targetSatTrackSlice.reducer;