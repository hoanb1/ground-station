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
            'jet',
            'websdr',
            'cosmic',
            'greyscale',
        ],
        colorMap: 'cosmic',
        dbRange: [-80, -20],
        fftSizeOptions: [256, 512, 1024, 2048, 4096, 8192, 16384],
        fftSize: 4096,
        gain: 20,
        sampleRate: 2048000,
        centerFrequency: 100000000,
        errorMessage: null,
        isStreaming: false,
        isPlaying: false,
        targetFPS: 15,
        settingsDialogOpen: false,
        autoDBRange: false,
        gridEditable: false,
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
} = waterfallSlice.actions;

export default waterfallSlice.reducer;