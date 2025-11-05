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



import { createSlice } from '@reduxjs/toolkit';
import {createAsyncThunk} from '@reduxjs/toolkit';
import {useRef, useState} from "react";
import {setSelectedTransmitter} from "../target/target-slice.jsx";

// Mobile detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

export const getSDRConfigParameters = createAsyncThunk(
    'waterfall/getSDRConfigParameters',
    async ({socket, selectedSDRId}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_request', 'get-sdr-parameters', selectedSDRId, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response.error));
                }
            });
        });
    }
);

export const updateVFOParameters = createAsyncThunk(
    'waterfall/updateVFOParameters',
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

export const startRecording = createAsyncThunk(
    'waterfall/startRecording',
    async ({socket, recordingName, selectedSDRId}, {getState, rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            const state = getState();
            const targetNoradId = state.targetSatTrack?.trackingState?.norad_id || '';
            const targetSatelliteName = state.targetSatTrack?.satelliteData?.details?.name || '';

            socket.emit('sdr_data', 'start-recording', {
                recordingName,
                selectedSDRId,
                targetSatelliteNoradId: targetNoradId,
                targetSatelliteName: targetSatelliteName
            }, (response) => {
                if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response?.error || 'Failed to start recording'));
                }
            });
        });
    }
);

export const stopRecording = createAsyncThunk(
    'waterfall/stopRecording',
    async ({socket, selectedSDRId, waterfallImage}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit('sdr_data', 'stop-recording', {
                selectedSDRId,
                waterfallImage
            }, (response) => {
                if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response?.error || 'Failed to stop recording'));
                }
            });
        });
    }
);

export const saveWaterfallSnapshot = createAsyncThunk(
    'waterfall/saveWaterfallSnapshot',
    async ({socket, waterfallImage, snapshotName}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit('sdr_data', 'save-waterfall-snapshot', {
                waterfallImage,
                snapshotName: snapshotName || ''
            }, (response) => {
                if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response?.error || 'Failed to save waterfall snapshot'));
                }
            });
        });
    }
);

const initialState = {
    fftDataOverflow: false,
    fftDataOverflowLimit: 20,
    colorMaps: [
        'iceberg',
        'heat',
        'cosmic',
        'greyscale',
    ],
    colorMap: 'cosmic',
    dbRange: [-80, -20],
    //fftSizeOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
    fftSizeOptions: [1024, 2048, 4096, 8192, 16384, 32768, 65536],
    fftSize: 16384,
    fftWindow: 'hanning',
    fftWindows: ['hanning', 'hamming', 'blackman', 'kaiser', 'bartlett'],
    fftAveraging: 0,
    gain: "none",
    rtlGains: [0, 0.9, 1.4, 2.7, 3.7, 7.7, 8.7, 12.5, 14.4, 15.7, 16.6, 19.7, 20.7, 22.9, 25.4,
        28.0, 29.7, 32.8, 33.8, 36.4, 37.2, 38.6, 40.2, 42.1, 43.4, 43.9, 44.5, 48.0, 49.6],
    biasT: false,
    tunerAgc: false,
    rtlAgc: false,
    sampleRate: "none",
    centerFrequency: 100000000,
    selectedOffsetMode: "",
    selectedOffsetValue: 0,
    errorMessage: null,
    errorDialogOpen: false,
    isStreaming: false,
    isPlaying: false,
    targetFPS: 10,
    settingsDialogOpen: false,
    autoDBRange: false,
    gridEditable: false,
    //waterFallCanvasWidth: isMobile? 4096: 32767,
    //waterFallVisualWidth: isMobile? 4096: 32767,
    waterFallCanvasWidth: isMobile? 4096: 16384,
    waterFallVisualWidth: isMobile? 4096: 16384,
    //waterFallCanvasWidth: isMobile? 4096: 8192,
    //waterFallVisualWidth: isMobile? 4096: 8192,
    //waterFallCanvasWidth: isMobile? 4096: 8191,
    //waterFallVisualWidth: isMobile? 4096: 8191,
    //waterFallCanvasWidth: 4096,
    //waterFallVisualWidth: 4096,
    waterFallCanvasHeight: 1200,
    //bandScopeHeight: 125,
    bandScopeHeight: 140,
    frequencyScaleHeight: 20,
    waterFallScaleX: 1,
    waterFallPositionX: 0,
    showRightSideWaterFallAccessories: true,
    showLeftSideWaterFallAccessories: true,
    expandedPanels: ['recording', 'playback', 'sdr', 'freqControl', 'fft', 'vfo'],
    selectedSDRId: "none",
    selectedTransmitterId: "none",
    startStreamingLoading: false,
    gettingSDRParameters: false,
    gainValues: [],
    sampleRateValues: [],
    hasBiasT: false,
    hasTunerAgc: false,
    hasRtlAgc: false,
    fftSizeValues: [],
    fftWindowValues: [],
    antennasList: {
        'tx': [],
        'rx': [],
    },
    hasSoapyAgc: false,
    soapyAgc: false,
    selectedAntenna: 'none',
    bookmarks: [],
    vfoActive: {
        1: false,
        2: false,
        3: false,
        4: false,
    },
    vfoMarkers: {
        1: {name: "VFO1", bandwidth: 10000, frequency: null, color: null, mode: 'fm', volume: 50, squelch: -150, stepSize: 1000},
        2: {name: "VFO2", bandwidth: 10000, frequency: null, color: null, mode: 'fm', volume: 50, squelch: -150, stepSize: 1000},
        3: {name: "VFO3", bandwidth: 10000, frequency: null, color: null, mode: 'fm', volume: 50, squelch: -150, stepSize: 1000},
        4: {name: "VFO4", bandwidth: 10000, frequency: null, color: null, mode: 'fm', volume: 50, squelch: -150, stepSize: 1000},
    },
    maxVFOMarkers: 4,
    selectedVFO: null,
    vfoColors: ['#FF0000', '#207820', '#144bff', '#9e129e'],
    selectedVFOTab: 0,
    showRotatorDottedLines: true,
    autoScalePreset: 'weak',
    // Recording state
    isRecording: false,
    recordingDuration: 0,
    recordingStartTime: null, // ISO timestamp when recording started
    recordingName: '',
    // Playback state
    selectedPlaybackRecording: null, // Selected recording for playback
    playbackRecordingPath: '', // Path to the selected recording file
};

// Add these new reducers to your createSlice
export const waterfallSlice = createSlice({
    name: 'waterfallState',
    initialState: initialState,
    reducers: {
        setColorMap: (state, action) => {
            state.colorMap = action.payload;
        },
        setColorMaps: (state, action) => {
            state.colorMaps = action.payload;
        },
        setDbRange: (state, action) => {
            state.dbRange = action.payload;
        },
        setFFTSize: (state, action) => {
            state.fftSize = action.payload;
        },
        setFFTSizeOptions: (state, action) => {
            state.fftSizeOptions = action.payload;
        },
        setGain: (state, action) => {
            state.gain = action.payload;
        },
        setSampleRate: (state, action) => {
            state.sampleRate = action.payload;
        },
        setCenterFrequency: (state, action) => {
            state.centerFrequency = action.payload;
        },
        setSelectedOffsetMode: (state, action) => {
            state.selectedOffsetMode = action.payload;
        },
        setSelectedOffsetValue: (state, action) => {
            state.selectedOffsetValue = action.payload;
        },
        setErrorMessage: (state, action) => {
            state.errorMessage = action.payload;
        },
        setIsStreaming: (state, action) => {
            state.isStreaming = action.payload;
        },
        setTargetFPS: (state, action) => {
            state.targetFPS = action.payload;
        },
        setIsPlaying: (state, action) => {
            state.isPlaying = action.payload;
        },
        setSettingsDialogOpen: (state, action) => {
            state.settingsDialogOpen = action.payload;
        },
        setAutoDBRange: (state, action) => {
            state.autoDBRange = action.payload;
        },
        setGridEditable: (state, action) => {
            state.gridEditable = action.payload;
        },
        setBiasT: (state, action) => {
            state.biasT = action.payload;
        },
        setTunerAgc: (state, action) => {
            state.tunerAgc = action.payload;
        },
        setRtlAgc: (state, action) => {
            state.rtlAgc = action.payload;
        },
        setFFTWindow: (state, action) => {
            state.fftWindow = action.payload;
        },
        setWaterFallCanvasWidth: (state, action) => {
            state.waterFallCanvasWidth = action.payload;
        },
        setWaterFallVisualWidth: (state, action) => {
            state.waterFallVisualWidth = action.payload;
        },
        setWaterFallScaleX: (state, action) => {
            state.waterFallScaleX = action.payload;
        },
        setWaterFallPositionX: (state, action) => {
            state.waterFallPositionX = action.payload;
        },
        setExpandedPanels(state, action) {
            state.expandedPanels = action.payload;
        },
        setSelectedSDRId(state, action) {
            state.selectedSDRId = action.payload;
        },
        setStartStreamingLoading(state, action) {
            state.startStreamingLoading = action.payload;
        },
        setErrorDialogOpen(state, action) {
            state.errorDialogOpen = action.payload;
        },
        setWaterFallCanvasHeight(state, action) {
            state.waterFallCanvasHeight = action.payload;
        },
        setBandScopeHeight(state, action) {
            state.bandScopeHeight = action.payload;
        },
        setFrequencyScaleHeight(state, action) {
            state.frequencyScaleHeight = action.payload;
        },
        setShowRightSideWaterFallAccessories(state, action) {
            state.showRightSideWaterFallAccessories = action.payload;
        },
        setShowLeftSideWaterFallAccessories(state, action) {
            state.showLeftSideWaterFallAccessories = action.payload;
        },
        setBookMarks(state, action) {
            state.bookmarks = action.payload;
        },
        setSelectedAntenna(state, action) {
            state.selectedAntenna = action.payload;
        },
        setHasSoapyAgc(state, action) {
            state.hasSoapyAgc = action.payload;
        },
        setSoapyAgc(state, action) {
            state.soapyAgc = action.payload;
        },
        setSelectedTransmitterId(state, action) {
            state.selectedTransmitterId = action.payload;
        },
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
                Object.entries(updates).forEach(([property, value]) => {
                    state.vfoMarkers[vfoNumber][property] = value;
                });
            }
        },
        setSelectedVFO(state, action) {
            state.selectedVFO = Number.isInteger(action.payload) ? parseInt(action.payload) : null;
        },
        setVfoActive: (state, action) => {
            state.vfoActive[action.payload] = true;
        },
        setVfoInactive: (state, action) => {
            state.vfoActive[action.payload] = false;
        },
        setSelectedVFOTab: (state, action) => {
            state.selectedVFOTab = action.payload;
        },
        setFFTdataOverflow: (state, action) => {
            state.fftDataOverflow = action.payload;
        },
        setFFTAveraging: (state, action) => {
            state.fftAveraging = action.payload;
        },
        setShowRotatorDottedLines: (state, action) => {
            state.showRotatorDottedLines = action.payload;
        },
        setAutoScalePreset: (state, action) => {
            state.autoScalePreset = action.payload;
        },
        setIsRecording: (state, action) => {
            state.isRecording = action.payload;
        },
        setRecordingDuration: (state, action) => {
            state.recordingDuration = action.payload;
        },
        setRecordingName: (state, action) => {
            state.recordingName = action.payload;
        },
        setRecordingStartTime: (state, action) => {
            state.recordingStartTime = action.payload;
        },
        incrementRecordingDuration: (state) => {
            // Calculate duration from start time for accuracy
            if (state.recordingStartTime) {
                const now = new Date();
                const start = new Date(state.recordingStartTime);
                state.recordingDuration = Math.floor((now - start) / 1000);
            } else {
                // Fallback to simple increment if no start time
                state.recordingDuration += 1;
            }
        },
        setSelectedPlaybackRecording: (state, action) => {
            state.selectedPlaybackRecording = action.payload;
        },
        setPlaybackRecordingPath: (state, action) => {
            state.playbackRecordingPath = action.payload;
        },
        clearPlaybackRecording: (state) => {
            state.selectedPlaybackRecording = null;
            state.playbackRecordingPath = '';
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getSDRConfigParameters.pending, (state) => {
                state.gettingSDRParameters = true;
                state.errorMessage = null;
            })
            .addCase(getSDRConfigParameters.fulfilled, (state, action) => {
                state.gettingSDRParameters = false;
                state.gainValues = action.payload['gain_values'];
                state.sampleRateValues = action.payload['sample_rate_values'];
                state.hasBiasT = action.payload['has_bias_t'];
                state.hasTunerAgc = action.payload['has_tuner_agc'];
                state.hasRtlAgc = action.payload['has_rtl_agc'];
                state.fftSizeValues = action.payload['fft_size_values'];
                state.fftWindowValues = action.payload['fft_window_values'];
                state.antennasList = action.payload['antennas'];
                state.hasSoapyAgc = action.payload['has_soapy_agc'];
            })
            .addCase(getSDRConfigParameters.rejected, (state, action) => {
                state.gettingSDRParameters = false;
                state.errorMessage = action.payload;
            })
            .addCase(updateVFOParameters.pending, (state) => {
                state.errorMessage = null;
            })
            .addCase(updateVFOParameters.fulfilled, (state, action) => {
                // Successfully updated VFO parameters
            })
            .addCase(updateVFOParameters.rejected, (state, action) => {
                state.errorMessage = action.payload;
            })
            .addCase(startRecording.pending, (state) => {
                state.errorMessage = null;
            })
            .addCase(startRecording.fulfilled, (state, action) => {
                state.isRecording = true;
                state.recordingDuration = 0;
                state.recordingStartTime = new Date().toISOString();
            })
            .addCase(startRecording.rejected, (state, action) => {
                state.isRecording = false;
                state.errorMessage = action.payload;
            })
            .addCase(stopRecording.pending, (state) => {
                state.errorMessage = null;
            })
            .addCase(stopRecording.fulfilled, (state, action) => {
                state.isRecording = false;
                state.recordingDuration = 0;
                state.recordingStartTime = null;
            })
            .addCase(stopRecording.rejected, (state, action) => {
                state.errorMessage = action.payload;
            });
    }
});

export const {
    setFFTdataOverflow,
    setColorMap,
    setColorMaps,
    setDbRange,
    setFFTSize,
    setFFTSizeOptions,
    setFFTAveraging,
    setGain,
    setSampleRate,
    setCenterFrequency,
    setErrorMessage,
    setIsStreaming,
    setTargetFPS,
    setIsPlaying,
    setSettingsDialogOpen,
    setAutoDBRange,
    setGridEditable,
    setBiasT,
    setTunerAgc,
    setRtlAgc,
    setFFTWindow,
    setWaterFallCanvasWidth,
    setWaterFallVisualWidth,
    setWaterFallScaleX,
    setWaterFallPositionX,
    setExpandedPanels,
    setSelectedSDRId,
    setStartStreamingLoading,
    setErrorDialogOpen,
    setWaterFallCanvasHeight,
    setBandScopeHeight,
    setFrequencyScaleHeight,
    setShowRightSideWaterFallAccessories,
    setShowLeftSideWaterFallAccessories,
    setBookMarks,
    setSelectedAntenna,
    setHasSoapyAgc,
    setSoapyAgc,
    setSelectedTransmitterId,
    setSelectedOffsetMode,
    setSelectedOffsetValue,
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
    setVfoActive,
    setVfoInactive,
    setSelectedVFOTab,
    setShowRotatorDottedLines,
    setAutoScalePreset,
    setIsRecording,
    setRecordingDuration,
    setRecordingName,
    setRecordingStartTime,
    incrementRecordingDuration,
    setSelectedPlaybackRecording,
    setPlaybackRecordingPath,
    clearPlaybackRecording,
} = waterfallSlice.actions;

export default waterfallSlice.reducer;