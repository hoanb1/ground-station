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

// Example default Satellite object:
const defaultSatellite = {
    id: null,
    name: '',
    norad_id: '',
    status: '',
    countries: [],
    operator: '',
    transmitters: [],
    decayed: null,
    launched: null,
    deployed: null,
    updated: null,
};

export const submitTransmitter = createAsyncThunk(
    'satellites/submitTransmitter',
    async ({socket, transmitterData}, {rejectWithValue}) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'submit-transmitter', transmitterData, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to submit transmitter'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const deleteTransmitter = createAsyncThunk(
    'satellites/deleteTransmitter',
    async ({socket, transmitterId}, {rejectWithValue}) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'delete-transmitter', transmitterId, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to delete transmitter'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const fetchSatellites = createAsyncThunk(
    'satellites/fetchAll',
    async ({ socket, satGroupId }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_request', 'get-satellites-for-group-id', satGroupId, (res) => {
                    if (res.success) {
                        resolve(res.data);
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

export const fetchSatelliteGroups = createAsyncThunk(
    'satellites/fetchGroups',
    async ({socket}, {rejectWithValue}) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_request', 'get-satellite-groups', null, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to fetch satellite groups'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

const satellitesSlice = createSlice({
    name: 'satellites',
    initialState: {
        satellites: [],
        satellitesGroups: [],
        satGroupId: "",
        status: 'idle', // or 'loading', 'succeeded', 'failed'
        error: null,
        selected: [],
        loading: false,
        pageSize: 10,
        formValues: defaultSatellite,
        openSatelliteInfoDialog: false,
        clickedSatellite: defaultSatellite,
    },
    reducers: {
        setSatellites: (state, action) => {
            state.satellites = action.payload;
        },
        setLoading: (state, action) => {
            state.loading = action.payload;
        },
        setPageSize: (state, action) => {
            state.pageSize = action.payload;
        },
        setOpenDeleteConfirm: (state, action) => {
            state.openDeleteConfirm = action.payload;
        },
        setOpenSatelliteInfoDialog: (state, action) => {
            state.openSatelliteInfoDialog = action.payload;
        },
        setSelected: (state, action) => {
            state.selected = action.payload;
        },
        setFormValues: (state, action) => {
            state.formValues = {
                ...state.formValues,
                ...action.payload,
            };
        },
        resetFormValues: (state) => {
            state.formValues = defaultSatellite;
        },
        setError: (state, action) => {
            state.error = action.payload;
        },
        setStatus: (state, action) => {
            state.status = action.payload;
        },
        setSatGroupId: (state, action) => {
            state.satGroupId = action.payload;
        },
        setClickedSatellite: (state, action) => {
            state.clickedSatellite = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSatellites.pending, (state) => {
                state.status = 'loading';
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSatellites.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.loading = false;
                state.satellites = action.payload;
            })
            .addCase(fetchSatellites.rejected, (state, action) => {
                state.status = 'failed';
                state.loading = false;
                state.error = action.error?.message;
            })
            .addCase(fetchSatelliteGroups.pending, (state) => {
                state.status = 'loading';
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSatelliteGroups.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.loading = false;
                state.satellitesGroups = action.payload;
            })
            .addCase(fetchSatelliteGroups.rejected, (state, action) => {
                state.status = 'failed';
                state.loading = false;
                state.error = action.error?.message;
            })
            .addCase(submitTransmitter.pending, (state) => {
                state.status = 'loading';
                state.loading = true;
                state.error = null;
            })
            .addCase(submitTransmitter.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.loading = false;
            })
            .addCase(submitTransmitter.rejected, (state, action) => {
                state.status = 'failed';
                state.loading = false;
                state.error = action.error?.message;
            })
            .addCase(deleteTransmitter.pending, (state) => {
                state.status = 'loading';
                state.loading = true;
                state.error = null;
            })
            .addCase(deleteTransmitter.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.loading = false;
            })
            .addCase(deleteTransmitter.rejected, (state, action) => {
                state.status = 'failed';
                state.loading = false;
                state.error = action.error?.message;
            });
    },
});

export const {
    setSatellites,
    setLoading,
    setSatGroupId,
    setPageSize,
    setOpenDeleteConfirm,
    setOpenSatelliteInfoDialog,
    setClickedSatellite,
    setSelected,
    setFormValues,
    resetFormValues,
    setError,
    setStatus,
} = satellitesSlice.actions;

export default satellitesSlice.reducer;