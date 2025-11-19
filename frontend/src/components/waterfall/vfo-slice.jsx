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
import { getDefaultVFOConfig, DEMODULATORS, getDemodulatorConfig, getDecoderConfig, getEffectiveMode } from './vfo-config.js';

export const updateVFOParameters = createAsyncThunk(
    'vfo/updateVFOParameters',
    async ({socket, vfoNumber, updates}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_submission', 'update-vfo-parameters', {
                vfoNumber,
                ...updates
            }, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response.error));
                }
            });
        });
    }
);

// Create default VFO state using centralized config
const createDefaultVFO = (name) => {
    const defaults = getDefaultVFOConfig();
    return {
        name,
        frequency: null,
        color: null,
        lockedTransmitterId: null,
        frequencyOffset: 0,
        ...defaults
    };
};

const initialState = {
    vfoActive: {
        1: false,
        2: false,
        3: false,
        4: false,
    },
    vfoMarkers: {
        1: createDefaultVFO("VFO1"),
        2: createDefaultVFO("VFO2"),
        3: createDefaultVFO("VFO3"),
        4: createDefaultVFO("VFO4"),
    },
    maxVFOMarkers: 4,
    selectedVFO: null,
    streamingVFO: null,
    vfoColors: ['#FF0000', '#207820', '#144bff', '#9e129e'],
    selectedVFOTab: 0,
    errorMessage: null,
};

export const vfoSlice = createSlice({
    name: 'vfo',
    initialState: initialState,
    reducers: {
        enableVFO1: (state, action) => {
            state.vfoMarkers[0].active = true;
        },
        enableVFO2: (state, action) => {
            state.vfoMarkers[1].active = true;
        },
        enableVFO3: (state, action) => {
            state.vfoMarkers[2].active = true;
        },
        enableVFO4: (state, action) => {
            state.vfoMarkers[3].active = true;
        },
        disableVFO1: (state, action) => {
            state.vfoMarkers[0].active = false;
        },
        disableVFO2: (state, action) => {
            state.vfoMarkers[1].active = false;
        },
        disableVFO3: (state, action) => {
            state.vfoMarkers[2].active = false;
        },
        disableVFO4: (state, action) => {
            state.vfoMarkers[3].active = false;
        },
        setVFOProperty: (state, action) => {
            const {vfoNumber, updates} = action.payload;
            if (state.vfoMarkers[vfoNumber]) {
                const vfo = state.vfoMarkers[vfoNumber];

                // Apply all updates
                Object.entries(updates).forEach(([property, value]) => {
                    vfo[property] = value;
                });

                // If mode or decoder was changed, update bandwidth to default
                const modeChanged = updates.hasOwnProperty('mode');
                const decoderChanged = updates.hasOwnProperty('decoder');

                if (modeChanged || decoderChanged) {
                    // Determine the effective mode (considering decoder overrides)
                    const effectiveMode = getEffectiveMode(vfo.mode, vfo.decoder);
                    const demodConfig = getDemodulatorConfig(effectiveMode);

                    if (demodConfig && demodConfig.defaultBandwidth) {
                        vfo.bandwidth = demodConfig.defaultBandwidth;
                    }

                    // Check if decoder has its own default bandwidth (e.g., GMSK)
                    if (decoderChanged && vfo.decoder) {
                        const decoderConfig = getDecoderConfig(vfo.decoder);
                        if (decoderConfig && decoderConfig.defaultBandwidth) {
                            vfo.bandwidth = decoderConfig.defaultBandwidth;
                        }
                    }
                }
            }
        },
        setSelectedVFO(state, action) {
            state.selectedVFO = Number.isInteger(action.payload) ? parseInt(action.payload) : null;
        },
        setStreamingVFO(state, action) {
            state.streamingVFO = Number.isInteger(action.payload) ? parseInt(action.payload) : null;
        },
        setVfoActive: (state, action) => {
            const vfoNumber = action.payload;
            state.vfoActive[vfoNumber] = true;

            // Set bandwidth to defaultBandwidth for the current mode when activating VFO
            // Consider decoder config first (e.g., BPSK, GMSK), then demodulator config
            const vfo = state.vfoMarkers[vfoNumber];
            if (vfo) {
                // Check if decoder has its own default bandwidth (e.g., GMSK, BPSK)
                if (vfo.decoder && vfo.decoder !== 'none') {
                    const decoderConfig = getDecoderConfig(vfo.decoder);
                    if (decoderConfig && decoderConfig.defaultBandwidth) {
                        vfo.bandwidth = decoderConfig.defaultBandwidth;
                        return; // Use decoder bandwidth, skip demodulator check
                    }
                }

                // Otherwise, use demodulator default bandwidth
                if (vfo.mode) {
                    const demodConfig = getDemodulatorConfig(vfo.mode);
                    if (demodConfig && demodConfig.defaultBandwidth) {
                        vfo.bandwidth = demodConfig.defaultBandwidth;
                    }
                }
            }
        },
        setVfoInactive: (state, action) => {
            state.vfoActive[action.payload] = false;
        },
        setSelectedVFOTab: (state, action) => {
            state.selectedVFOTab = action.payload;
        },
        updateAllVFOStates: (state, action) => {
            // action.payload is an object with vfo_number as keys and VFO state objects as values
            const vfoStates = action.payload;

            Object.entries(vfoStates).forEach(([vfoNumber, vfoState]) => {
                const vfoNum = parseInt(vfoNumber);

                if (state.vfoMarkers[vfoNum]) {
                    // Map backend field names to frontend field names
                    state.vfoMarkers[vfoNum].frequency = vfoState.center_freq;
                    state.vfoMarkers[vfoNum].bandwidth = vfoState.bandwidth;
                    state.vfoMarkers[vfoNum].mode = vfoState.modulation;
                    state.vfoMarkers[vfoNum].volume = vfoState.volume;
                    state.vfoMarkers[vfoNum].squelch = vfoState.squelch;
                    // Note: lockedTransmitterId is UI-only, not synced from backend

                    // Update transcription fields if present
                    if (vfoState.transcription_enabled !== undefined) {
                        state.vfoMarkers[vfoNum].transcriptionEnabled = vfoState.transcription_enabled;
                    }
                    if (vfoState.transcription_model !== undefined) {
                        state.vfoMarkers[vfoNum].transcriptionModel = vfoState.transcription_model;
                    }
                    if (vfoState.transcription_language !== undefined) {
                        state.vfoMarkers[vfoNum].transcriptionLanguage = vfoState.transcription_language;
                    }

                    // FIX: Enforce mutual exclusivity between audio demodulators and data decoders
                    // When loading state from backend/storage, ensure that audio demod (mode) and
                    // data decoder are not both active simultaneously. This prevents the UI bug where
                    // both toggle groups appear selected on page load, requiring manual "none" click to unstick.
                    // If a decoder is active (not 'none'), force audio demod to 'NONE'
                    const currentDecoder = state.vfoMarkers[vfoNum].decoder;
                    if (currentDecoder && currentDecoder !== 'none') {
                        state.vfoMarkers[vfoNum].mode = 'NONE';
                    }

                    // Update active state
                    state.vfoActive[vfoNum] = vfoState.active;

                    // Update selected VFO if this VFO is selected
                    if (vfoState.selected) {
                        state.selectedVFO = vfoNum;
                    }
                }
            });
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(updateVFOParameters.pending, (state) => {
                state.errorMessage = null;
            })
            .addCase(updateVFOParameters.fulfilled, (state, action) => {
                // Successfully updated VFO parameters
            })
            .addCase(updateVFOParameters.rejected, (state, action) => {
                state.errorMessage = action.payload;
            });
    }
});

export const {
    setVFOProperty,
    enableVFO1,
    enableVFO2,
    enableVFO3,
    enableVFO4,
    disableVFO1,
    disableVFO2,
    disableVFO3,
    disableVFO4,
    setSelectedVFO,
    setStreamingVFO,
    setVfoActive,
    setVfoInactive,
    setSelectedVFOTab,
    updateAllVFOStates,
} = vfoSlice.actions;

export default vfoSlice.reducer;
