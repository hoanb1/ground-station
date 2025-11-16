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

export default decodersSlice.reducer;
