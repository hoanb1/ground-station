import { createSlice } from '@reduxjs/toolkit';
import {createAsyncThunk} from '@reduxjs/toolkit';
import {useState} from "react";



const waterfallSlice = createSlice({
    name: 'waterfallState',
    initialState: {
        colorMaps: [
            'viridis',
            'plasma',
            'inferno',
            'magma',
            'jet'
        ],
        colorMap: 'inferno',
        dbRange: [-120, 0],
        fftSizeOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768],
        fftSize: 1024,
        gain: 20,
        sampleRate: 2048000,
        centerFrequency: 100000000,
        errorMessage: null,
        isStreaming: false,
        isConnected: false,
        isPlaying: false,
        targetFPS: 30,
        settingsDialogOpen: false,
        autoDBRange: false,

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
        setIsConnected: (state, action) => {
            state.isConnected = action.payload;
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
    setIsConnected,
    setTargetFPS,
    setIsPlaying,
    setSettingsDialogOpen,
    setAutoDBRange
} = waterfallSlice.actions;

export default waterfallSlice.reducer;