import { createSlice } from '@reduxjs/toolkit';
import {createAsyncThunk} from '@reduxjs/toolkit';
import {useRef, useState} from "react";

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
        colorMap: 'greyscale',
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
        isStreaming: false,
        isPlaying: false,
        targetFPS: 10,
        settingsDialogOpen: false,
        autoDBRange: false,
        gridEditable: false,
        waterFallCanvasWidth: 4096,
        waterFallVisualWidth: 4096,
        waterFallScaleX: 1,
        waterFallPositionX: 0,
        expandedPanels: ['sdr', 'freqControl', 'fft'],
        selectedSDRId: "none",
        startStreamingLoading: false,
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
    },
    extraReducers: (builder) => {

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
} = waterfallSlice.actions;

export default waterfallSlice.reducer;