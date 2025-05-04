import { createSlice } from '@reduxjs/toolkit';
import {createAsyncThunk} from '@reduxjs/toolkit';
import {useRef, useState} from "react";



export const getSDRConfigParameters = createAsyncThunk(
    'waterfall/getSDRConfigParameters',
    async ({socket, selectedSDRId}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_request', 'get-sdr-parameters', selectedSDRId, (response) => {
                console.info(response);
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response.error));
                }
            });
        });
    }
);


const waterfallSlice = createSlice({
    name: 'waterfallState',
    initialState: {
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
        fftSize: 16384,
        fftWindow: 'hanning',
        fftWindows: ['hanning', 'hamming', 'blackman', 'kaiser', 'bartlett'],
        gain: 25.4,
        rtlGains: [0, 0.9, 1.4, 2.7, 3.7, 7.7, 8.7, 12.5, 14.4, 15.7, 16.6, 19.7, 20.7, 22.9, 25.4,
            28.0, 29.7, 32.8, 33.8, 36.4, 37.2, 38.6, 40.2, 42.1, 43.4, 43.9, 44.5, 48.0, 49.6],
        biasT: false,
        tunerAgc: false,
        rtlAgc: false,
        sampleRate: 2048000,
        centerFrequency: 100000000,
        errorMessage: null,
        errorDialogOpen: false,
        isStreaming: false,
        isPlaying: false,
        targetFPS: 10,
        settingsDialogOpen: false,
        autoDBRange: false,
        gridEditable: false,
        waterFallCanvasWidth: 8192,
        waterFallCanvasHeight: 900,
        waterFallVisualWidth: 8192,
        waterFallScaleX: 1,
        waterFallPositionX: 0,
        expandedPanels: ['sdr', 'freqControl', 'fft'],
        selectedSDRId: "none",
        startStreamingLoading: false,
        gettingSDRParameters: false,
        gainValues: [],
        sampleRateValues: [],
        hasBiasT: false,
        hasTunerAgc: false,
        hasRtlAgc: false,
        fftSizeValues: [],
        fftWindowValues: [],
    },
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
} = waterfallSlice.actions;

export default waterfallSlice.reducer;