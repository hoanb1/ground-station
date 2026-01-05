/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
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

/**
 * Observation data structure:
 * {
 *   id: string (uuid),
 *   name: string (user-friendly name),
 *   enabled: boolean,
 *   satellite: {
 *     norad_id: string,
 *     name: string
 *   },
 *   pass: {
 *     event_start: ISO timestamp,
 *     event_end: ISO timestamp,
 *     peak_altitude: number,
 *     azimuth_at_start: number,
 *     azimuth_at_peak: number,
 *     azimuth_at_end: number
 *   } | null (null for geostationary),
 *   sdr: {
 *     id: string,
 *     name: string
 *   },
 *   transmitter: {
 *     id: string,
 *     frequency: number,
 *     mode: string,
 *     bandwidth: number
 *   },
 *   tasks: [
 *     {
 *       type: 'decoder',
 *       config: {
 *         decoder_type: string (e.g., 'afsk', 'gmsk', 'sstv'),
 *         vfo: number | null
 *       }
 *     },
 *     {
 *       type: 'audio_recording',
 *       config: {
 *         format: string ('wav', 'mp3'),
 *         vfo: number | null
 *       }
 *     },
 *     {
 *       type: 'iq_recording',
 *       config: {
 *         sample_rate: number,
 *         format: string ('complex_int16', 'complex_float32')
 *       }
 *     }
 *   ],
 *   rotator: {
 *     id: string | null,
 *     tracking_enabled: boolean
 *   },
 *   rig: {
 *     id: string | null,
 *     doppler_correction: boolean,
 *     vfo: string ('VFO_A', 'VFO_B')
 *   },
 *   created_at: ISO timestamp,
 *   updated_at: ISO timestamp,
 *   status: 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled'
 * }
 */

// Fetch all scheduled observations
export const fetchScheduledObservations = createAsyncThunk(
    'scheduler/fetchAll',
    async ({ socket }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_request', 'get-scheduled-observations', null, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to fetch scheduled observations'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Create a new scheduled observation
export const createScheduledObservation = createAsyncThunk(
    'scheduler/create',
    async ({ socket, observation }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'create-scheduled-observation', observation, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to create scheduled observation'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Update an existing scheduled observation
export const updateScheduledObservation = createAsyncThunk(
    'scheduler/update',
    async ({ socket, id, observation }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'update-scheduled-observation', { id, ...observation }, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to update scheduled observation'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Delete scheduled observation(s)
export const deleteScheduledObservations = createAsyncThunk(
    'scheduler/delete',
    async ({ socket, ids }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'delete-scheduled-observations', ids, (res) => {
                    if (res.success) {
                        resolve({ ids });
                    } else {
                        reject(new Error('Failed to delete scheduled observations'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Enable/disable observation
export const toggleObservationEnabled = createAsyncThunk(
    'scheduler/toggleEnabled',
    async ({ socket, id, enabled }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'toggle-observation-enabled', { id, enabled }, (res) => {
                    if (res.success) {
                        resolve({ id, enabled });
                    } else {
                        reject(new Error('Failed to toggle observation'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Cancel a running observation
export const cancelRunningObservation = createAsyncThunk(
    'scheduler/cancel',
    async ({ socket, id }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'cancel-observation', id, (res) => {
                    if (res.success) {
                        resolve({ id });
                    } else {
                        reject(new Error('Failed to cancel observation'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Fetch all monitored satellites
export const fetchMonitoredSatellites = createAsyncThunk(
    'scheduler/fetchMonitoredSatellites',
    async ({ socket }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_request', 'get-monitored-satellites', null, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to fetch monitored satellites'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Create a new monitored satellite
export const createMonitoredSatellite = createAsyncThunk(
    'scheduler/createMonitoredSatellite',
    async ({ socket, satellite }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'create-monitored-satellite', satellite, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to create monitored satellite'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Update an existing monitored satellite
export const updateMonitoredSatelliteAsync = createAsyncThunk(
    'scheduler/updateMonitoredSatelliteAsync',
    async ({ socket, id, satellite }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'update-monitored-satellite', { id, ...satellite }, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to update monitored satellite'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Fetch SDR parameters (gain values, antenna ports, etc.)
export const fetchSDRParameters = createAsyncThunk(
    'scheduler/fetchSDRParameters',
    async ({ socket, sdrId }, { rejectWithValue }) => {
        return await new Promise((resolve, reject) => {
            socket.emit('data_request', 'get-sdr-parameters', sdrId, (res) => {
                if (res.success) {
                    resolve({ sdrId, parameters: res.data, error: null });
                } else {
                    reject(rejectWithValue({ sdrId, error: res.error || 'Failed to fetch SDR parameters' }));
                }
            });
        });
    }
);

// Delete monitored satellite(s)
export const deleteMonitoredSatellitesAsync = createAsyncThunk(
    'scheduler/deleteMonitoredSatellitesAsync',
    async ({ socket, ids }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'delete-monitored-satellites', ids, (res) => {
                    if (res.success) {
                        resolve({ ids });
                    } else {
                        reject(new Error('Failed to delete monitored satellites'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Toggle monitored satellite enabled
export const toggleMonitoredSatelliteEnabledAsync = createAsyncThunk(
    'scheduler/toggleMonitoredSatelliteEnabledAsync',
    async ({ socket, id, enabled }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'toggle-monitored-satellite-enabled', { id, enabled }, (res) => {
                    if (res.success) {
                        resolve({ id, enabled });
                    } else {
                        reject(new Error('Failed to toggle monitored satellite'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Fetch next passes for a satellite
export const fetchNextPassesForScheduler = createAsyncThunk(
    'scheduler/fetchNextPasses',
    async ({ socket, noradId, hours = 72, minElevation = 0, forceRecalculate = false }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_request', 'fetch-next-passes', {
                    norad_id: noradId,
                    hours: hours,
                    min_elevation: minElevation,
                    force_recalculate: forceRecalculate
                }, (response) => {
                    if (response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error('Failed to fetch passes'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Sample data for development/testing
const SAMPLE_OBSERVATIONS = [
    {
        id: 'sample-1',
        name: 'ISS APRS Pass',
        enabled: true,
        satellite: { norad_id: 25544, name: 'ISS (ZARYA)', group_id: 'a27aed54-9163-4b9a-9827-aee9e26e8771' },
        pass: {
            event_start: new Date(Date.now() + 3600000).toISOString(),
            event_end: new Date(Date.now() + 4200000).toISOString(),
            peak_altitude: 45.2,
            azimuth_at_start: 230,
            azimuth_at_peak: 180,
            azimuth_at_end: 130,
        },
        sdr: { id: 'c9f55f19-ebfe-4098-a371-f624573ac544', name: 'BladeRF #0 [3229fe52..a5e92c51]', sample_rate: 2000000 },
        transmitter: { id: 'iss-aprs', frequency: 145825000, mode: 'FM', bandwidth: 12500 },
        tasks: [
            {
                type: 'decoder',
                config: {
                    decoder_type: 'afsk',
                    transmitter_id: 'iss-aprs',
                    parameters: { afsk_baudrate: 1200, afsk_af_carrier: 1700, afsk_deviation: 500, afsk_framing: 'ax25' }
                }
            },
            { type: 'audio_recording', config: { transmitter_id: 'iss-aprs', demodulator: 'fm' } }
        ],
        rotator: { id: null, tracking_enabled: false },
        rig: { id: null, doppler_correction: false, vfo: 'VFO_A' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'scheduled',
    },
    {
        id: 'sample-2',
        name: 'NOAA-18 APT',
        enabled: true,
        satellite: { norad_id: 28654, name: 'NOAA 18', group_id: '05442bbc-fb36-4fea-bde3-e45c03670e66' },
        pass: {
            event_start: new Date(Date.now() + 7200000).toISOString(),
            event_end: new Date(Date.now() + 8100000).toISOString(),
            peak_altitude: 72.8,
            azimuth_at_start: 15,
            azimuth_at_peak: 90,
            azimuth_at_end: 165,
        },
        sdr: { id: '62bb8dba-09fb-4eeb-a9a9-1740efcd6b7b', name: 'B210 IFQ95S6', sample_rate: 3000000 },
        transmitter: { id: 'noaa18-apt', frequency: 137912500, mode: 'FM', bandwidth: 34000 },
        tasks: [
            { type: 'iq_recording', config: {} },
            { type: 'audio_recording', config: { transmitter_id: 'noaa18-apt', demodulator: 'fm' } }
        ],
        rotator: { id: 'rot-1', tracking_enabled: true },
        rig: { id: null, doppler_correction: true, vfo: 'VFO_A' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'scheduled',
    },
    {
        id: 'sample-3',
        name: 'FO-29 LoRa Beacon',
        enabled: false,
        satellite: { norad_id: 24278, name: 'FO-29', group_id: '' },
        pass: {
            event_start: new Date(Date.now() + 10800000).toISOString(),
            event_end: new Date(Date.now() + 11700000).toISOString(),
            peak_altitude: 38.5,
            azimuth_at_start: 310,
            azimuth_at_peak: 0,
            azimuth_at_end: 50,
        },
        sdr: { id: 'hackrf-1', name: 'HackRF One', sample_rate: 2000000 },
        transmitter: { id: 'fo29-beacon', frequency: 435850000, mode: 'LoRa', bandwidth: 125000 },
        tasks: [
            {
                type: 'decoder',
                config: {
                    decoder_type: 'lora',
                    transmitter_id: 'fo29-beacon',
                    parameters: { lora_sf: 7, lora_bw: 125000, lora_cr: 1, lora_sync_word: [0x12], lora_preamble_len: 8, lora_fldro: false }
                }
            }
        ],
        rotator: { id: 'rot-1', tracking_enabled: true },
        rig: { id: null, doppler_correction: true, vfo: 'VFO_A' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'scheduled',
    },
];

const SAMPLE_MONITORED_SATELLITES = [
    {
        id: 'monitored-1',
        enabled: true,
        satellite: { norad_id: 25544, name: 'ISS (ZARYA)', group_id: 'a27aed54-9163-4b9a-9827-aee9e26e8771' },
        sdr: { id: 'c9f55f19-ebfe-4098-a371-f624573ac544', name: 'BladeRF #0 [3229fe52..a5e92c51]', sample_rate: 2000000 },
        tasks: [
            {
                type: 'decoder',
                config: {
                    decoder_type: 'afsk',
                    transmitter_id: 'iss-aprs',
                    parameters: { afsk_baudrate: 1200, afsk_af_carrier: 1700, afsk_deviation: 500, afsk_framing: 'ax25' }
                }
            },
            { type: 'audio_recording', config: {} }
        ],
        rotator: { id: null, tracking_enabled: false },
        rig: { id: null, doppler_correction: false, vfo: 'VFO_A' },
        min_elevation: 20,
        lookahead_hours: 24,
    },
    {
        id: 'monitored-2',
        enabled: true,
        satellite: { norad_id: 28654, name: 'NOAA 18', group_id: '05442bbc-fb36-4fea-bde3-e45c03670e66' },
        sdr: { id: '62bb8dba-09fb-4eeb-a9a9-1740efcd6b7b', name: 'B210 IFQ95S6', sample_rate: 3000000 },
        tasks: [
            { type: 'iq_recording', config: {} },
            { type: 'audio_recording', config: {} }
        ],
        rotator: { id: 'rot-1', tracking_enabled: true },
        rig: { id: null, doppler_correction: true, vfo: 'VFO_A' },
        min_elevation: 30,
        lookahead_hours: 48,
    },
];

const initialState = {
    observations: [],
    loading: false,
    error: null,
    selectedObservation: null,
    dialogOpen: false,
    // Monitored satellites for automatic observation generation
    monitoredSatellites: [],
    monitoredSatellitesLoading: false,
    selectedMonitoredSatellite: null,
    monitoredSatelliteDialogOpen: false,
    isSavingObservation: false,
    isSavingMonitoredSatellite: false,
    // SDR parameters (gain values, antenna ports) fetched when SDR is selected
    sdrParameters: {},
    sdrParametersLoading: false,
    sdrParametersError: {},
    columnVisibility: {
        name: true,
        satellite: true,
        pass_start: true,
        pass_end: true,
        sdr: true,
        transmitter: true,
        tasks: true,
        status: true,
        enabled: true,
    },
    // Satellite selection state for the dialog
    satelliteSelection: {
        satGroups: [],
        groupId: '',
        groupOfSats: [],
        satelliteId: '',
        searchOptions: [],
        searchLoading: false,
        selectedFromSearch: false,  // Track if satellite was selected from search
        passes: [],  // List of future passes for selected satellite
        passesLoading: false,
        selectedPassId: null,  // Selected pass ID
    },
    // Timeline view configuration
    timeline: {
        durationHours: 24,
        selectedSatelliteFilter: null,  // null = show all, or norad_id to filter
        isExpanded: true,  // Whether timeline is visible
    },
};

const schedulerSlice = createSlice({
    name: 'scheduler',
    initialState,
    reducers: {
        setSelectedObservation: (state, action) => {
            state.selectedObservation = action.payload;
        },
        setDialogOpen: (state, action) => {
            state.dialogOpen = action.payload;
        },
        setColumnVisibility: (state, action) => {
            state.columnVisibility = { ...state.columnVisibility, ...action.payload };
        },
        // Monitored satellites actions
        setSelectedMonitoredSatellite: (state, action) => {
            state.selectedMonitoredSatellite = action.payload;
        },
        setMonitoredSatelliteDialogOpen: (state, action) => {
            state.monitoredSatelliteDialogOpen = action.payload;
        },
        addMonitoredSatellite: (state, action) => {
            state.monitoredSatellites.push(action.payload);
        },
        updateMonitoredSatellite: (state, action) => {
            const index = state.monitoredSatellites.findIndex(sat => sat.id === action.payload.id);
            if (index !== -1) {
                state.monitoredSatellites[index] = action.payload;
            }
        },
        deleteMonitoredSatellites: (state, action) => {
            state.monitoredSatellites = state.monitoredSatellites.filter(
                sat => !action.payload.includes(sat.id)
            );
        },
        toggleMonitoredSatelliteEnabled: (state, action) => {
            const satellite = state.monitoredSatellites.find(sat => sat.id === action.payload.id);
            if (satellite) {
                satellite.enabled = action.payload.enabled;
            }
        },
        addObservation: (state, action) => {
            state.observations.push(action.payload);
        },
        updateObservation: (state, action) => {
            const index = state.observations.findIndex(obs => obs.id === action.payload.id);
            if (index !== -1) {
                state.observations[index] = action.payload;
            }
        },
        deleteObservations: (state, action) => {
            state.observations = state.observations.filter(
                obs => !action.payload.includes(obs.id)
            );
        },
        toggleObservationEnabledLocal: (state, action) => {
            const observation = state.observations.find(obs => obs.id === action.payload.id);
            if (observation) {
                observation.enabled = action.payload.enabled;
            }
        },
        // Dev actions for testing
        loadSampleData: (state) => {
            state.observations = SAMPLE_OBSERVATIONS;
            state.monitoredSatellites = SAMPLE_MONITORED_SATELLITES;
        },
        // Handle real-time observation status updates from socket
        observationStatusUpdated: (state, action) => {
            const { id, status } = action.payload;
            const observation = state.observations.find(obs => obs.id === id);
            if (observation) {
                observation.status = status;
            }
        },
        // Satellite selection actions
        setSatGroups: (state, action) => {
            state.satelliteSelection.satGroups = action.payload;
        },
        setGroupId: (state, action) => {
            state.satelliteSelection.groupId = action.payload;
        },
        setGroupOfSats: (state, action) => {
            state.satelliteSelection.groupOfSats = action.payload;
        },
        setSatelliteId: (state, action) => {
            state.satelliteSelection.satelliteId = action.payload;
        },
        setSearchOptions: (state, action) => {
            state.satelliteSelection.searchOptions = action.payload;
        },
        setSearchLoading: (state, action) => {
            state.satelliteSelection.searchLoading = action.payload;
        },
        setSelectedFromSearch: (state, action) => {
            state.satelliteSelection.selectedFromSearch = action.payload;
        },
        setSelectedPassId: (state, action) => {
            state.satelliteSelection.selectedPassId = action.payload;
        },
        // Timeline actions
        setTimelineDuration: (state, action) => {
            state.timeline.durationHours = action.payload;
        },
        setTimelineSatelliteFilter: (state, action) => {
            state.timeline.selectedSatelliteFilter = action.payload;
        },
        setTimelineExpanded: (state, action) => {
            state.timeline.isExpanded = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            // Fetch observations
            .addCase(fetchScheduledObservations.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchScheduledObservations.fulfilled, (state, action) => {
                state.loading = false;
                state.observations = action.payload;
            })
            .addCase(fetchScheduledObservations.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Create observation
            .addCase(createScheduledObservation.pending, (state) => {
                state.isSavingObservation = true;
            })
            .addCase(createScheduledObservation.fulfilled, (state, action) => {
                state.observations.push(action.payload);
                state.dialogOpen = false;
                state.isSavingObservation = false;
            })
            .addCase(createScheduledObservation.rejected, (state) => {
                state.isSavingObservation = false;
            })
            // Update observation
            .addCase(updateScheduledObservation.pending, (state) => {
                state.isSavingObservation = true;
            })
            .addCase(updateScheduledObservation.fulfilled, (state, action) => {
                const index = state.observations.findIndex(obs => obs.id === action.payload.id);
                if (index !== -1) {
                    state.observations[index] = action.payload;
                }
                state.dialogOpen = false;
                state.isSavingObservation = false;
            })
            .addCase(updateScheduledObservation.rejected, (state) => {
                state.isSavingObservation = false;
            })
            // Delete observations
            .addCase(deleteScheduledObservations.fulfilled, (state, action) => {
                state.observations = state.observations.filter(
                    obs => !action.payload.ids.includes(obs.id)
                );
            })
            // Toggle enabled
            .addCase(toggleObservationEnabled.fulfilled, (state, action) => {
                const observation = state.observations.find(obs => obs.id === action.payload.id);
                if (observation) {
                    observation.enabled = action.payload.enabled;
                }
            })
            // Cancel observation
            .addCase(cancelRunningObservation.fulfilled, (state, action) => {
                const observation = state.observations.find(obs => obs.id === action.payload.id);
                if (observation) {
                    observation.status = 'cancelled';
                }
            })
            // Fetch passes
            .addCase(fetchNextPassesForScheduler.pending, (state) => {
                state.satelliteSelection.passesLoading = true;
            })
            .addCase(fetchNextPassesForScheduler.fulfilled, (state, action) => {
                state.satelliteSelection.passesLoading = false;
                state.satelliteSelection.passes = action.payload;
            })
            .addCase(fetchNextPassesForScheduler.rejected, (state) => {
                state.satelliteSelection.passesLoading = false;
                state.satelliteSelection.passes = [];
            })
            // Fetch monitored satellites
            .addCase(fetchMonitoredSatellites.pending, (state) => {
                state.monitoredSatellitesLoading = true;
            })
            .addCase(fetchMonitoredSatellites.fulfilled, (state, action) => {
                state.monitoredSatellitesLoading = false;
                state.monitoredSatellites = action.payload;
            })
            .addCase(fetchMonitoredSatellites.rejected, (state) => {
                state.monitoredSatellitesLoading = false;
            })
            // Fetch SDR parameters
            .addCase(fetchSDRParameters.pending, (state, action) => {
                state.sdrParametersLoading = true;
                // Clear previous error for this SDR
                const sdrId = action.meta.arg.sdrId;
                if (sdrId && state.sdrParametersError[sdrId]) {
                    delete state.sdrParametersError[sdrId];
                }
            })
            .addCase(fetchSDRParameters.fulfilled, (state, action) => {
                state.sdrParametersLoading = false;
                const { sdrId, parameters } = action.payload;
                state.sdrParameters[sdrId] = parameters;
                // Clear any error for this SDR
                if (state.sdrParametersError[sdrId]) {
                    delete state.sdrParametersError[sdrId];
                }
            })
            .addCase(fetchSDRParameters.rejected, (state, action) => {
                state.sdrParametersLoading = false;
                const { sdrId, error } = action.payload || {};
                if (sdrId) {
                    state.sdrParametersError[sdrId] = error || 'Failed to fetch SDR parameters';
                }
            })
            // Create monitored satellite
            .addCase(createMonitoredSatellite.pending, (state) => {
                state.isSavingMonitoredSatellite = true;
            })
            .addCase(createMonitoredSatellite.fulfilled, (state, action) => {
                state.monitoredSatellites.push(action.payload);
                state.monitoredSatelliteDialogOpen = false;
                state.isSavingMonitoredSatellite = false;
            })
            .addCase(createMonitoredSatellite.rejected, (state) => {
                state.isSavingMonitoredSatellite = false;
            })
            // Update monitored satellite
            .addCase(updateMonitoredSatelliteAsync.pending, (state) => {
                state.isSavingMonitoredSatellite = true;
            })
            .addCase(updateMonitoredSatelliteAsync.fulfilled, (state, action) => {
                const index = state.monitoredSatellites.findIndex(sat => sat.id === action.payload.id);
                if (index !== -1) {
                    state.monitoredSatellites[index] = action.payload;
                }
                state.monitoredSatelliteDialogOpen = false;
                state.isSavingMonitoredSatellite = false;
            })
            .addCase(updateMonitoredSatelliteAsync.rejected, (state) => {
                state.isSavingMonitoredSatellite = false;
            })
            // Delete monitored satellites
            .addCase(deleteMonitoredSatellitesAsync.fulfilled, (state, action) => {
                state.monitoredSatellites = state.monitoredSatellites.filter(
                    sat => !action.payload.ids.includes(sat.id)
                );
            })
            // Toggle monitored satellite enabled
            .addCase(toggleMonitoredSatelliteEnabledAsync.fulfilled, (state, action) => {
                const satellite = state.monitoredSatellites.find(sat => sat.id === action.payload.id);
                if (satellite) {
                    satellite.enabled = action.payload.enabled;
                }
            });
    },
});

export const {
    setSelectedObservation,
    setDialogOpen,
    setColumnVisibility,
    observationStatusUpdated,
    setSelectedMonitoredSatellite,
    setMonitoredSatelliteDialogOpen,
    addMonitoredSatellite,
    updateMonitoredSatellite,
    deleteMonitoredSatellites,
    toggleMonitoredSatelliteEnabled,
    addObservation,
    updateObservation,
    deleteObservations,
    toggleObservationEnabledLocal,
    loadSampleData,
    setSatGroups,
    setGroupId,
    setGroupOfSats,
    setSatelliteId,
    setSearchOptions,
    setSearchLoading,
    setSelectedFromSearch,
    setSelectedPassId,
    setTimelineDuration,
    setTimelineSatelliteFilter,
    setTimelineExpanded,
} = schedulerSlice.actions;

export default schedulerSlice.reducer;
