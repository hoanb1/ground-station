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



import { createSlice } from '@reduxjs/toolkit';
import {createAsyncThunk} from '@reduxjs/toolkit';
import {useRef, useState} from "react";
import {setSelectedTransmitter} from "../target/target-sat-slice.jsx";

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


const initialState = {
    colorMaps: [
        'viridis',
        'plasma',
        'inferno',
        'magma',
        'jet',
        'websdr',
        'cosmic',
        'greyscale',
    ],
    colorMap: 'cosmic',
    dbRange: [-80, -20],
    fftSizeOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
    fftSize: 8192,
    fftWindow: 'hanning',
    fftWindows: ['hanning', 'hamming', 'blackman', 'kaiser', 'bartlett'],
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
    waterFallCanvasWidth: isMobile? 4096: 8191,
    waterFallCanvasHeight: 800,
    waterFallVisualWidth: isMobile? 4096: 8191,
    bandScopeHeight: 110,
    frequencyScaleHeight: 20,
    waterFallScaleX: 1,
    waterFallPositionX: 0,
    showRightSideWaterFallAccessories: true,
    showLeftSideWaterFallAccessories: true,
    expandedPanels: ['sdr', 'freqControl', 'fft'],
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
    vfoMarkers: {
        1: {active: false, name: "VFO1", bandwidth: 4300, frequency: null, color: null, mode: 'fm'},
        2: {active: false, name: "VFO2", bandwidth: 10000, frequency: null, color: null, mode: 'fm'},
        3: {active: false, name: "VFO3", bandwidth: 5000, frequency: null, color: null, mode: 'fm'},
        4: {active: false, name: "VFO4", bandwidth: 20000, frequency: null, color: null, mode: 'fm'},
    },
    maxVFOMarkers: 4,
    selectedVFO: 1,
    vfoColors: ['#FF0000', '#207820', '#144bff', '#9e129e'],
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
        // Enable VFO1
        enableVFO1: (state, action) => {
            state.vfoMarkers[0].active = true;
        },
        // Enable VFO2
        enableVFO2: (state, action) => {
            state.vfoMarkers[1].active = true;
        },
        // Enable VFO3
        enableVFO3: (state, action) => {
            state.vfoMarkers[2].active = true;
        },
        // Enable VFO4
        enableVFO4: (state, action) => {
            state.vfoMarkers[3].active = true;
        },
        // Disable VFO1
        disableVFO1: (state, action) => {
            state.vfoMarkers[0].active = false;
        },
        // Disable VFO2
        disableVFO2: (state, action) => {
            state.vfoMarkers[1].active = false;
        },
        // Disable VFO3
        disableVFO3: (state, action) => {
            state.vfoMarkers[2].active = false;
        },
        // Disable VFO4
        disableVFO4: (state, action) => {
            state.vfoMarkers[3].active = false;
        },
        // Set VFO property
        setVFOProperty: (state, action) => {
            const {vfoNumber, updates} = action.payload;
            if (state.vfoMarkers[vfoNumber]) {
                Object.entries(updates).forEach(([property, value]) => {
                    state.vfoMarkers[vfoNumber][property] = value;
                });
            }
        },
        setSelectedVFO(state, action) {
            state.selectedVFO = action.payload;
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
            });
    }
});

export const {
    setColorMap,
    setColorMaps,
    setDbRange,
    setFFTSize,
    setFFTSizeOptions,
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
} = waterfallSlice.actions;

export default waterfallSlice.reducer;