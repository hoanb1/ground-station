import {createAsyncThunk, createSlice} from '@reduxjs/toolkit';

export const fetchSatelliteGroups = createAsyncThunk(
    'overviewGroups/fetchSatelliteGroupsOverview',
    async ({ socket }, { rejectWithValue }) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_request', 'get-satellite-groups', null, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue('Failed to get satellite groups'));
                }
            });
        });
    }
);


export const fetchSatellitesByGroupId = createAsyncThunk(
    'overviewGroups/fetchSatellitesByGroupIdOverview',
    async ({ socket, satGroupId }, { rejectWithValue }) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_request', 'get-satellites-for-group-id', satGroupId, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(
                        rejectWithValue(`Failed to set satellites for group id: ${satGroupId}`)
                    );
                }
            });
        });
    }
);


export const fetchNextPassesForGroup = createAsyncThunk(
    'overviewPasses/fetchNextPassesForGroup',
    async ({ socket, selectedSatGroupId, hours }, { rejectWithValue }) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_request', 'fetch-next-passes-for-group', {group_id: selectedSatGroupId, hours: hours}, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue('Failed getting next passes'));
                }
            });
        });
    }
);


const overviewSlice = createSlice({
    name: 'overviewSatTrack',
    initialState: {
        showPastOrbitPath: false,
        showFutureOrbitPath: false,
        showSatelliteCoverage: true,
        showSunIcon: true,
        showMoonIcon: true,
        showTerminatorLine: true,
        showTooltip: true,
        showGrid: false,
        gridEditable: false,
        selectedSatellites: [],
        currentPastSatellitesPaths: [],
        currentFutureSatellitesPaths: [],
        currentSatellitesPosition: [],
        currentSatellitesCoverage: [],
        terminatorLine: [],
        daySidePolygon: [],
        pastOrbitLineColor: '#33c833',
        futureOrbitLineColor: '#e4971e',
        satelliteCoverageColor: '#FFFFFF',
        orbitProjectionDuration: 60,
        tileLayerID: 'satellite',
        sunPos: null,
        moonPos: null,
        mapZoomLevel: 2,
        location: { lat: 0, lon: 0 },
        locationId: null,
        locationUserId: null,
        satelliteGroupId: null,
        satGroups: [],
        formGroupSelectError: false,
        selectedSatGroupId: "",
        passes: [],
        passesLoading: false,
        openMapSettingsDialog: false,
        nextPassesHours: 2.0,
    },
    reducers: {
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
        setGridEditable(state, action) {
            state.gridEditable = action.payload;
        },
        setSelectedSatellites(state, action) {
            state.selectedSatellites = action.payload;
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
        setSunPos(state, action) {
            state.sunPos = action.payload;
        },
        setMoonPos(state, action) {
            state.moonPos = action.payload;
        },
        setMapZoomLevel(state, action) {
            state.mapZoomLevel = action.payload;
        },
        setLocation(state, action) {
            state.location = action.payload;
        },
        setLocationId(state, action) {
            state.locationId = action.payload;
        },
        setLocationUserId(state, action) {
            state.locationUserId = action.payload;
        },
        setSatelliteGroupId(state, action) {
            state.satelliteGroupId = action.payload;
        },
        setSatGroups(state, action) {
            state.satGroups = action.payload;
        },
        setFormGroupSelectError(state, action) {
            state.formGroupSelectError = action.payload;
        },
        setSelectedSatGroupId(state, action) {
            state.selectedSatGroupId = action.payload;
        },
        setPasses(state, action) {
            state.passes = action.payload;
        },
        setPassesLoading(state, action) {
            state.loading = action.payload;
        },
        setOpenMapSettingsDialog(state, action) {
            state.openMapSettingsDialog = action.payload;
        },
        setNextPassesHours(state, action) {
            state.nextPassesHours = action.payload;
        },
        setShowGrid(state, action) {
            state.showGrid = action.payload;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSatelliteGroups.pending, (state) => {
                state.formGroupSelectError = false;
            })
            .addCase(fetchSatelliteGroups.fulfilled, (state, action) => {
                state.satGroups = action.payload;
            })
            .addCase(fetchSatelliteGroups.rejected, (state, action) => {
                state.formGroupSelectError = true;
            })
            .addCase(fetchSatellitesByGroupId.pending, (state) => {
                state.formGroupSelectError = false;
            })
            .addCase(fetchSatellitesByGroupId.fulfilled, (state, action) => {
                state.selectedSatellites = action.payload;
            })
            .addCase(fetchSatellitesByGroupId.rejected, (state, action) => {
                state.formGroupSelectError = true;
            })
            .addCase(fetchNextPassesForGroup.pending, (state) => {
                state.passesLoading = true;
            })
            .addCase(fetchNextPassesForGroup.fulfilled, (state, action) => {
                state.passes = action.payload;
                state.passesLoading = false;
            })
            .addCase(fetchNextPassesForGroup.rejected, (state, action) => {
                state.passesLoading = false;
                state.formGroupSelectError = true;
            });
    }
});

export const {
    setShowPastOrbitPath,
    setShowFutureOrbitPath,
    setShowSatelliteCoverage,
    setShowSunIcon,
    setShowMoonIcon,
    setShowTerminatorLine,
    setShowTooltip,
    setGridEditable,
    setSelectedSatellites,
    setPastOrbitLineColor,
    setFutureOrbitLineColor,
    setSatelliteCoverageColor,
    setOrbitProjectionDuration,
    setTileLayerID,
    setMapZoomLevel,
    setLocation,
    setLocationId,
    setLocationUserId,
    setSatelliteGroupId,
    setSatGroups,
    setFormGroupSelectError,
    setSelectedSatGroupId,
    setPasses,
    setPassesLoading,
    setOpenMapSettingsDialog,
    setNextPassesHours,
    setShowGrid,
} = overviewSlice.actions;

export default overviewSlice.reducer;