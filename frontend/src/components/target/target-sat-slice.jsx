import { createSlice } from '@reduxjs/toolkit';
import {createAsyncThunk} from '@reduxjs/toolkit';
import {enqueueSnackbar} from "notistack";


export const getTrackingStateFromBackend = createAsyncThunk(
    'targetSatTrack/getTrackingStateBackend',
    async ({socket}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_request', 'get-tracking-state', null, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue("Failed getting next passes"));
                }
            });
        });
    }
);


export const setTrackingStateInBackend = createAsyncThunk(
    'targetSatTrack/setTrackingStateBackend',
    async ({socket, data}, {getState, dispatch, rejectWithValue}) => {
        const state = getState();
        const {norad_id, tracking_state, group_id, rig_id, rotator_id, transmitter_id} = data;
        const trackState = {
            'name': 'satellite-tracking',
            'value': {
                'norad_id': norad_id,
                'tracking_state': tracking_state,
                'group_id': group_id,
                'rotator_id': rotator_id,
                'rig_id': rig_id,
                'transmitter_id': transmitter_id,
            }
        };

        return new Promise((resolve, reject) => {
            socket.emit('data_submission', 'set-tracking-state', trackState, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response));
                }
            });
        });
    }
);


export const fetchNextPasses = createAsyncThunk(
    'targetSatTrack/fetchNextPasses',
    async ({socket, noradId, hours}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_request', 'fetch-next-passes', {'norad_id': noradId, 'hours': hours}, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue("Failed getting next passes"));
                }
            });
        });
    }
);


export const fetchSatelliteGroups = createAsyncThunk(
    'targetSatTrack/fetchSatelliteGroups',
    async ({ socket }, { rejectWithValue }) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_request', 'get-satellite-groups', null, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response.message));
                }
            });
        });
    }
);


export const fetchSatellitesByGroupId = createAsyncThunk(
    'targetSatTrack/fetchSatellitesByGroupId',
    async ({ socket, groupId }, { rejectWithValue }) => {
        return new Promise((resolve, reject) => {
                socket.emit('data_request', 'get-satellites-for-group-id', groupId, (response) => {
                if (response.success) {
                    const satellites = response.data;
                    resolve({ satellites });
                } else {
                    reject(rejectWithValue(response.message));
                }
            });
        });
    }
);


export const fetchSatellite = createAsyncThunk(
    'satellites/fetchSatellite',
    async ({ socket, noradId }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_request', 'get-satellite', noradId, (response) => {
                    if (response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error('Failed to fetch satellites'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);


const targetSatTrackSlice = createSlice({
    name: 'targetSatTrack',
    initialState: {
        groupId: "",
        satelliteId: "",
        satGroups: [],
        groupOfSats: [],
        trackingState: {
            'norad_id': '',
            'tracking_state': 'idle',
            'group_id': '',
            'rig_id': 'none',
            'rotator_id': 'none',
            'transmitter_id': 'none'
        },
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
        showPastOrbitPath: true,
        showFutureOrbitPath: true,
        showSatelliteCoverage: true,
        showSunIcon: true,
        showMoonIcon: true,
        showTerminatorLine: true,
        showTooltip: true,
        currentSatellitesPosition: [],
        currentSatellitesCoverage: [],
        terminatorLine: [],
        daySidePolygon: [],
        pastOrbitLineColor: '#33c833',
        futureOrbitLineColor: '#e4971e',
        satelliteCoverageColor: '#FFFFFF',
        orbitProjectionDuration: 240,
        tileLayerID: 'satellite',
        mapZoomLevel: 2,
        sunPos: null,
        moonPos: null,
        gridEditable: false,
        sliderTimeOffset: 0,
        satelliteSelectOpen: false,
        satelliteGroupSelectOpen: false,
        uiTrackerDisabled: false,
        starting: true,
        selectedRadioRig: "",
        selectedRotator: "",
        openMapSettingsDialog: false,
        nextPassesHours: 6.0,
        selectedTransmitter: "",
        availableTransmitters: [],
    },
    reducers: {
        setLoading(state, action) {
            state.loading = action.payload;
        },
        setSatelliteData(state, action) {
            if (state.satelliteSelectOpen === true || state.satelliteGroupSelectOpen === true) {
                //console.info("select is open, NOT updating tracking state");
            } else {
                //console.info("select is close, updating tracking state");
                //state.groupId = action.payload['tracking_state']['group_id'];
                //state.satelliteId = action.payload['tracking_state']['norad_id'];
            }

            if (action.payload['tracking_state']) {
                state.trackingState = action.payload['tracking_state'];
                //state.groupId = action.payload['tracking_state']['group_id'];
                //state.satelliteId = action.payload['tracking_state']['norad_id'];
                //state.selectedRadioRig = action.payload['tracking_state']['rig_id'];
                //state.selectedRotator = action.payload['tracking_state']['rotator_id'];
            }

            if (action.payload['ui_tracker_state']) {
                state.satGroups = action.payload['ui_tracker_state']['groups'];
                state.groupOfSats = action.payload['ui_tracker_state']['satellites'];
                state.availableTransmitters = action.payload['ui_tracker_state']['transmitters'];
                state.satelliteId = action.payload['ui_tracker_state']['norad_id'];
                state.groupId = action.payload['ui_tracker_state']['group_id'];
                state.selectedRadioRig = action.payload['ui_tracker_state']['rig_id'];
                state.selectedRotator = action.payload['ui_tracker_state']['rotator_id'];
                state.selectedTransmitter = action.payload['ui_tracker_state']['transmitter_id'];
            }
            
            if (action.payload['events']) {
                if (action.payload['events']) {
                    action.payload['events'].forEach(event => {
                        if (event.name === 'rotator_connected') {
                            enqueueSnackbar("Rotator connected!", {variant: 'success'});
                        } else if (event.name === 'rotator_disconnected') {
                            enqueueSnackbar("Rotator disconnected!", {variant: 'warning'});
                        } else if (event.name === 'rig_connected') {
                            enqueueSnackbar("Rig connected!", {variant: 'success'});
                        } else if (event.name === 'rig_disconnected') {
                            enqueueSnackbar("Rig disconnected!", {variant: 'warning'});
                        } else if (event.name === 'elevation_out_of_bounds') {
                            enqueueSnackbar("Elevation of target is not reachable!", {variant: 'warning'});
                        } else if (event.name === 'azimuth_out_of_bounds') {
                            enqueueSnackbar("Azimuth of target is not reachable", {variant: 'warning'});
                        } else if (event.name === 'minelevation_error') {
                            enqueueSnackbar("Minimum elevation limit reached!", {variant: 'warning'});
                        }
                    });
                }
            }

            if (action.payload['satellite_data']) {
                state.satelliteData = {
                    details: action.payload['satellite_data']['details'],
                    position: action.payload['satellite_data']['position'],
                    transmitters: action.payload['satellite_data']['transmitters'],
                };
            }
        },
        setSatellitePasses(state, action) {
            state.satellitePasses = action.payload;
        },
        setSatGroupId(state, action) {
            state.groupId = action.payload;
        },
        setSatelliteId(state, action) {
            state.satelliteId = action.payload;
        },
        setShowPastOrbitPath(state, action) {
            state.showPastOrbitPath = action.payload;
        },
        setShowFutureOrbitPath(state, action) {
            state.showFutureOrbitPath = action.payload;
        },
        setShowSatelliteCoverage(state, action) {
            state.showSatelliteCoverage = action.payload;
        },
        setShowSunIcon(state, action) {
            state.showSunIcon = action.payload;
        },
        setShowMoonIcon(state, action) {
            state.showMoonIcon = action.payload;
        },
        setShowTerminatorLine(state, action) {
            state.showTerminatorLine = action.payload;
        },
        setShowTooltip(state, action) {
            state.showTooltip = action.payload;
        },
        setTerminatorLine(state, action) {
            state.terminatorLine = action.payload;
        },
        setDaySidePolygon(state, action) {
            state.daySidePolygon = action.payload;
        },
        setPastOrbitLineColor(state, action) {
            state.pastOrbitLineColor = action.payload;
        },
        setFutureOrbitLineColor(state, action) {
            state.futureOrbitLineColor = action.payload;
        },
        setSatelliteCoverageColor(state, action) {
            state.satelliteCoverageColor = action.payload;
        },
        setOrbitProjectionDuration(state, action) {
            state.orbitProjectionDuration = action.payload;
        },
        setTileLayerID(state, action) {
            state.tileLayerID = action.payload;
        },
        setMapZoomLevel(state, action) {
            state.mapZoomLevel = action.payload;
        },
        setSunPos(state, action) {
            state.sunPos = action.payload;
        },
        setMoonPos(state, action) {
            state.moonPos = action.payload;
        },
        setGridEditable(state, action) {
            state.gridEditable = action.payload;
        },
        setSliderTimeOffset(state, action) {
            state.sliderTimeOffset = action.payload;
        },
        setLocation(state, action) {
            state.location = action.payload;
        },
        setSatelliteSelectOpen(state, action) {
            state.satelliteSelectOpen = action.payload;
        },
        setSatelliteGroupSelectOpen(state, action) {
            state.satelliteGroupSelectOpen = action.payload;
        },
        setGroupOfSats(state, action) {
            state.groupOfSats = action.payload;
        },
        setUITrackerDisabled(state, action) {
            state.uiTrackerDisabled = action.payload;
        },
        setStarting(state, action) {
            state.c = action.payload;
        },
        setRadioRig(state, action) {
            state.selectedRadioRig = action.payload;
        },
        setRotator(state, action) {
            state.selectedRotator = action.payload;
        },
        setOpenMapSettingsDialog(state, action) {
            state.openMapSettingsDialog = action.payload;
        },
        setNextPassesHours(state, action) {
            state.nextPassesHours = action.payload;
        },
        setSelectedTransmitter(state, action) {
            state.selectedTransmitter = action.payload;
        },
        setAvailableTransmitters(state, action) {
            state.availableTransmitters = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(setTrackingStateInBackend.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(setTrackingStateInBackend.fulfilled, (state, action) => {
                state.loading = false;
                state.trackingState = action.payload;
                state.error = null;
            })
            .addCase(setTrackingStateInBackend.rejected, (state, action) => {
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
            })
            .addCase(fetchSatelliteGroups.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSatelliteGroups.fulfilled, (state, action) => {
                state.loading = false;
                state.satGroups = action.payload;
            })
            .addCase(fetchSatelliteGroups.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(fetchSatellitesByGroupId.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSatellitesByGroupId.fulfilled, (state, action) => {
                state.loading = false;
                const { satellites } = action.payload;
                state.groupOfSats = satellites;
            })
            .addCase(fetchSatellitesByGroupId.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(fetchSatellite.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSatellite.fulfilled, (state, action) => {
                state.loading = false;
                state.satelliteData = action.payload;
                state.error = null;
            })
            .addCase(fetchSatellite.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(getTrackingStateFromBackend.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getTrackingStateFromBackend.fulfilled, (state, action) => {
                state.loading = false;
                state.trackingState = action.payload['value'];
                state.selectedRadioRig = action.payload['value']['rig_id'];
                state.selectedRotator = action.payload['value']['rotator_id'];
                state.error = null;
            })
            .addCase(getTrackingStateFromBackend.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    }
});

export const {
    setSatelliteData,
    setSatellitePasses,
    setSatelliteId,
    setSatGroupId,
    setShowPastOrbitPath,
    setShowFutureOrbitPath,
    setShowSatelliteCoverage,
    setShowSunIcon,
    setShowMoonIcon,
    setShowTerminatorLine,
    setShowTooltip,
    setTerminatorLine,
    setDaySidePolygon,
    setPastOrbitLineColor,
    setFutureOrbitLineColor,
    setSatelliteCoverageColor,
    setOrbitProjectionDuration,
    setTileLayerID,
    setMapZoomLevel,
    setSunPos,
    setMoonPos,
    setGridEditable,
    setSliderTimeOffset,
    setLocation,
    setLoading,
    setSatelliteSelectOpen,
    setSatelliteGroupSelectOpen,
    setGroupOfSats,
    setUITrackerDisabled,
    setStarting,
    setRadioRig,
    setRotator,
    setOpenMapSettingsDialog,
    setNextPassesHours,
    setSelectedTransmitter,
    setAvailableTransmitters,
} = targetSatTrackSlice.actions;

export default targetSatTrackSlice.reducer;