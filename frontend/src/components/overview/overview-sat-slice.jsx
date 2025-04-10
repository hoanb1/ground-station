import {createAsyncThunk, createSlice} from '@reduxjs/toolkit';


function getCacheKeyForGroupId(groupId) {
    return `${groupId}_${Math.floor(Date.now() / (2 * 60 * 60 * 1000))}`;
}

export const fetchSatelliteData = createAsyncThunk(
    'overviewGroups/fetchSatelliteData',
    async ({ socket, noradId }, { rejectWithValue }) => {
        return await new Promise((resolve, reject) => {
            socket.emit('data_request', 'get-satellite', noradId, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error('Failed to fetch satellites'));
                }
            });
        });
    }
);


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
    async ({ socket, selectedSatGroupId, hours }, { getState, rejectWithValue }) => {
        return new Promise((resolve, reject) => {

            // let's check first if we have something cached
            const state = getState();
            const cacheKey = getCacheKeyForGroupId(selectedSatGroupId);
            if (cacheKey in state.overviewSatTrack.cachedPasses) {
                resolve(state.overviewSatTrack.cachedPasses[cacheKey]);
            }

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
        selectedSatelliteId: "",
        satelliteData: {
            position: {
                lat: 0,
                lon: 0,
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
        showPastOrbitPath: false,
        showFutureOrbitPath: false,
        showSatelliteCoverage: true,
        showSunIcon: true,
        showMoonIcon: true,
        showTerminatorLine: true,
        showTooltip: true,
        showGrid: true,
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
        mapZoomLevel: 2,
        satelliteGroupId: null,
        satGroups: [],
        formGroupSelectError: false,
        selectedSatGroupId: "",
        passes: [],
        cachedPasses: {},
        passesLoading: false,
        openMapSettingsDialog: false,
        nextPassesHours: 4.0,
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
        setMapZoomLevel(state, action) {
            state.mapZoomLevel = action.payload;
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
        },
        setSelectedSatelliteId(state, action) {
            state.selectedSatelliteId = action.payload;
        },
        setSatelliteData(state, action) {
            state.satelliteData = action.payload;
        },
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
                // cache the result for a few hours
                state.cachedPasses[getCacheKeyForGroupId(state.selectedSatGroupId)] = action.payload;
                state.passes = action.payload;
                state.passesLoading = false;
            })
            .addCase(fetchNextPassesForGroup.rejected, (state, action) => {
                state.passesLoading = false;
                state.formGroupSelectError = true;
            })
            .addCase(fetchSatelliteData.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSatelliteData.fulfilled, (state, action) => {
                state.loading = false;
                state.satelliteData = action.payload;
                state.error = null;
            })
            .addCase(fetchSatelliteData.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
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
    setSatelliteGroupId,
    setSatGroups,
    setFormGroupSelectError,
    setSelectedSatGroupId,
    setPasses,
    setPassesLoading,
    setOpenMapSettingsDialog,
    setNextPassesHours,
    setShowGrid,
    setSelectedSatelliteId,
    setSatelliteData,
} = overviewSlice.actions;

export default overviewSlice.reducer;