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

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    // Active decoder sessions (keyed by session_id)
    active: {},

    // Decoded output history (limited to last 100 items)
    outputs: [],

    // Recent errors (limited to last 20)
    errors: [],

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

            if (status === 'idle' || status === 'error') {
                // Remove from active decoders when idle or error
                if (state.active[session_id]) {
                    delete state.active[session_id];
                }
            } else {
                // Update or create active decoder entry
                if (!state.active[session_id]) {
                    state.active[session_id] = {
                        decoder_type,
                        session_id,
                        vfo,
                        started_at: timestamp,
                        progress: null,
                    };
                }

                state.active[session_id].status = status;
                state.active[session_id].mode = mode;
                state.active[session_id].vfo = vfo;
                state.active[session_id].last_update = timestamp;

                // Update progress if provided in the payload (including null to reset)
                if (progress !== undefined) {
                    state.active[session_id].progress = progress;
                }
            }
        },

        // Progress update
        decoderProgressUpdated: (state, action) => {
            const { session_id, progress, timestamp } = action.payload;

            if (state.active[session_id]) {
                state.active[session_id].progress = progress;
                state.active[session_id].last_update = timestamp;
            }
        },

        // Output received (completed decode)
        decoderOutputReceived: (state, action) => {
            const output = action.payload;

            // Add to outputs array (prepend for newest first)
            state.outputs.unshift({
                id: `output_${output.timestamp}`,
                ...output
            });

            // Limit to last 100 outputs
            if (state.outputs.length > 100) {
                state.outputs = state.outputs.slice(0, 100);
            }

            // Auto-select new output if gallery is open
            if (state.ui.showGallery) {
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
            const { session_id } = action.payload;

            if (state.active[session_id]) {
                delete state.active[session_id];
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
    selectOutput,
    setGalleryFilter,
    toggleGallery,
    setShowGallery,
    toggleDecoderPanel,
    setShowDecoderPanel,
} = decodersSlice.actions;

// Selectors
export const selectActiveDecoders = (state) => state.decoders.active;
export const selectDecoderBySession = (session_id) => (state) => state.decoders.active[session_id];
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

export default decodersSlice.reducer;
