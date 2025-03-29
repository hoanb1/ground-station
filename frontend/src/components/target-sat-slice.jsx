import { createSlice } from '@reduxjs/toolkit';

const targetSatTrackSlice = createSlice({
    name: 'targetSatTrack',
    initialState: {
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
            transmitters: [

            ],
        },
        satellitePasses: [

        ]
    },
    reducers: {
        setSatelliteData(state, action) {
            state.satelliteData = action.payload;
        },
        setSatellitePasses(state, action) {
            state.satellitePasses = action.payload;
        },
    },
});

export const {
    setSatelliteData,
    setSatellitePasses
} = targetSatTrackSlice.actions;

export default targetSatTrackSlice.reducer;