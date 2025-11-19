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
 * Developed with the assistance of Claude (Anthropic AI Assistant)
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Async thunk to fetch satellite info from backend
export const fetchDetectedSatellite = createAsyncThunk(
    'decoders/fetchDetectedSatellite',
    async ({ socket, noradId }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_request', 'get-satellite', noradId, (response) => {
                    if (response.success) {
                        resolve({ noradId, data: response.data });
                    } else {
                        reject(new Error('Failed to fetch satellite'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

const initialState = {
    // Active decoder sessions (keyed by session_id)
    active: {},

    // Decoded output history (limited to last 100 items)
    outputs: [],

    // Recent errors (limited to last 20)
    errors: [],

    // Detected satellites (keyed by NORAD ID)
    detectedSatellites: {},

    // UI state
    ui: {
        selectedOutput: null,      // Currently viewing output ID
        galleryFilter: 'all',      // all, sstv, afsk, rtty, etc.
        showGallery: false,
        showDecoderPanel: false,
    }
};

export const decodersSlice = createSlice({
    name: 'decoders',
    initialState,
    reducers: {
        // Decoder status changed
        decoderStatusChanged: (state, action) => {
            const { session_id, status, mode, decoder_type, vfo, timestamp, progress } = action.payload;

            // Create unique key combining session_id and VFO number
            const decoderKey = vfo ? `${session_id}_vfo${vfo}` : session_id;

            if (status === 'idle' || status === 'error' || status === 'closed') {
                // Remove from active decoders when idle, error, or closed
                if (state.active[decoderKey]) {
                    delete state.active[decoderKey];
                }
            } else {
                // Update or create active decoder entry
                if (!state.active[decoderKey]) {
                    state.active[decoderKey] = {
                        decoder_type,
                        session_id,
                        vfo,
                        started_at: timestamp,
                        progress: null,
                    };
                }

                state.active[decoderKey].status = status;
                state.active[decoderKey].mode = mode;
                state.active[decoderKey].vfo = vfo;
                state.active[decoderKey].last_update = timestamp;

                // Update progress if provided in the payload (including null to reset)
                if (progress !== undefined) {
                    state.active[decoderKey].progress = progress;
                }
            }
        },

        // Progress update
        decoderProgressUpdated: (state, action) => {
            const { session_id, vfo, progress, timestamp } = action.payload;

            // Create unique key combining session_id and VFO number
            const decoderKey = vfo ? `${session_id}_vfo${vfo}` : session_id;

            if (state.active[decoderKey]) {
                state.active[decoderKey].progress = progress;
                state.active[decoderKey].last_update = timestamp;
            }
        },

        // Output received (completed decode)
        decoderOutputReceived: (state, action) => {
            const output = action.payload;

            // Special handling for Morse decoder - keep only latest output per session+VFO
            if (output.decoder_type === 'morse') {
                // Find and remove any existing Morse output for this session+VFO combination
                state.outputs = state.outputs.filter(
                    o => !(o.decoder_type === 'morse' && o.session_id === output.session_id && o.vfo === output.vfo)
                );

                // Add the new output with VFO in the ID
                const outputId = output.vfo
                    ? `output_${output.session_id}_vfo${output.vfo}_morse`
                    : `output_${output.session_id}_morse`;

                state.outputs.unshift({
                    id: outputId,
                    ...output
                });
            } else {
                // Normal handling for other decoders (SSTV, etc.)
                state.outputs.unshift({
                    id: `output_${output.timestamp}`,
                    ...output
                });
            }

            // Limit to last 100 outputs
            if (state.outputs.length > 100) {
                state.outputs = state.outputs.slice(0, 100);
            }

            // Auto-select new output if gallery is open (but not for Morse)
            if (state.ui.showGallery && output.decoder_type !== 'morse') {
                state.ui.selectedOutput = `output_${output.timestamp}`;
            }
        },

        // Error occurred
        decoderErrorOccurred: (state, action) => {
            const error = action.payload;

            // Add to errors array (prepend for newest first)
            state.errors.unshift({
                id: `error_${error.timestamp}`,
                ...error
            });

            // Limit to last 20 errors
            if (state.errors.length > 20) {
                state.errors = state.errors.slice(0, 20);
            }
        },

        // Clear decoder session (user stopped decoder)
        clearDecoderSession: (state, action) => {
            const { session_id, vfo } = action.payload;

            // Create unique key combining session_id and VFO number
            const decoderKey = vfo ? `${session_id}_vfo${vfo}` : session_id;

            if (state.active[decoderKey]) {
                delete state.active[decoderKey];
            }
        },

        // Clear all history
        clearDecoderHistory: (state) => {
            state.outputs = [];
            state.errors = [];
        },

        // Clear outputs only
        clearDecoderOutputs: (state) => {
            state.outputs = [];
        },

        // Clear errors only
        clearDecoderErrors: (state) => {
            state.errors = [];
        },

        // Delete specific output
        deleteOutput: (state, action) => {
            const { output_id } = action.payload;
            state.outputs = state.outputs.filter(output => output.id !== output_id);

            // Deselect if currently selected
            if (state.ui.selectedOutput === output_id) {
                state.ui.selectedOutput = null;
            }
        },

        // Clear outputs for a specific satellite (by NORAD ID)
        clearSatelliteOutputs: (state, action) => {
            const { noradId, outputIds } = action.payload;
            // Remove all output IDs that belong to this satellite
            if (outputIds && outputIds.length > 0) {
                state.outputs = state.outputs.filter(output => !outputIds.includes(output.id));
            }
        },

        // UI actions
        selectOutput: (state, action) => {
            state.ui.selectedOutput = action.payload;
        },

        setGalleryFilter: (state, action) => {
            state.ui.galleryFilter = action.payload;
        },

        toggleGallery: (state) => {
            state.ui.showGallery = !state.ui.showGallery;
        },

        setShowGallery: (state, action) => {
            state.ui.showGallery = action.payload;
        },

        toggleDecoderPanel: (state) => {
            state.ui.showDecoderPanel = !state.ui.showDecoderPanel;
        },

        setShowDecoderPanel: (state, action) => {
            state.ui.showDecoderPanel = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            // fetchDetectedSatellite cases
            .addCase(fetchDetectedSatellite.pending, (state, action) => {
                const { noradId } = action.meta.arg;
                if (!state.detectedSatellites[noradId]) {
                    state.detectedSatellites[noradId] = {
                        noradId,
                        loading: true,
                        error: null,
                        data: null,
                        lastSeen: Date.now(),
                        fetchedAt: null,
                    };
                }
                state.detectedSatellites[noradId].loading = true;
            })
            .addCase(fetchDetectedSatellite.fulfilled, (state, action) => {
                const { noradId, data } = action.payload;
                state.detectedSatellites[noradId] = {
                    noradId,
                    loading: false,
                    error: null,
                    data,
                    lastSeen: Date.now(),
                    fetchedAt: Date.now(),
                };
            })
            .addCase(fetchDetectedSatellite.rejected, (state, action) => {
                const { noradId } = action.meta.arg;
                if (state.detectedSatellites[noradId]) {
                    state.detectedSatellites[noradId].loading = false;
                    state.detectedSatellites[noradId].error = action.payload || 'Failed to fetch satellite';
                }
            });
    }
});

export const {
    decoderStatusChanged,
    decoderProgressUpdated,
    decoderOutputReceived,
    decoderErrorOccurred,
    clearDecoderSession,
    clearDecoderHistory,
    clearDecoderOutputs,
    clearDecoderErrors,
    deleteOutput,
    clearSatelliteOutputs,
    selectOutput,
    setGalleryFilter,
    toggleGallery,
    setShowGallery,
    toggleDecoderPanel,
    setShowDecoderPanel,
} = decodersSlice.actions;

// Selectors
export const selectActiveDecoders = (state) => state.decoders.active;
export const selectDecoderBySession = (session_id, vfo = null) => (state) => {
    const decoderKey = vfo ? `${session_id}_vfo${vfo}` : session_id;
    return state.decoders.active[decoderKey];
};
export const selectAllOutputs = (state) => state.decoders.outputs;
export const selectFilteredOutputs = (state) => {
    const { outputs, ui } = state.decoders;
    if (ui.galleryFilter === 'all') {
        return outputs;
    }
    return outputs.filter(output => output.decoder_type === ui.galleryFilter);
};
export const selectOutputById = (output_id) => (state) => {
    return state.decoders.outputs.find(output => output.id === output_id);
};
export const selectRecentErrors = (state) => state.decoders.errors;
export const selectDecoderUI = (state) => state.decoders.ui;
export const selectSelectedOutput = (state) => {
    const { outputs, ui } = state.decoders;
    if (!ui.selectedOutput) return null;
    return outputs.find(output => output.id === ui.selectedOutput);
};
export const selectDetectedSatellites = (state) => state.decoders.detectedSatellites;
export const selectDetectedSatelliteByNorad = (noradId) => (state) => {
    return state.decoders.detectedSatellites[noradId] || null;
};

export default decodersSlice.reducer;
