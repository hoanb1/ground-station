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

/**
 * Transcription Redux Slice
 *
 * Manages real-time audio transcription data from Google Gemini API.
 * Stores the last 500 words with timestamps and metadata.
 */

const initialState = {
    // Array of transcription entries: [{id, text, timestamp, language, sessionId}]
    entries: [],

    // Current word count across all entries
    wordCount: 0,

    // Maximum words to keep (500 words = ~3-5 minutes of speech)
    maxWords: 500,

    // Flag to indicate if transcription is actively receiving data
    isActive: false,

    // Last received timestamp
    lastUpdated: null,

    // Live accumulating transcription per session
    // {sessionId: {id, text, timestamp, language, startTime}}
    liveTranscription: {},
};

const transcriptionSlice = createSlice({
    name: 'transcription',
    initialState,
    reducers: {
        /**
         * Add a new transcription fragment
         * Continuously appends to live transcription, never-ending stream
         */
        addTranscription: (state, action) => {
            const { text, sessionId, language, is_final } = action.payload;
            const trimmedText = text.trim();

            console.log('[Redux] addTranscription called:', { text: trimmedText, sessionId, language, is_final });

            // Skip empty text
            if (!trimmedText) {
                console.log('[Redux] Skipping empty text');
                return;
            }

            // Initialize or update live transcription for this session
            if (!state.liveTranscription[sessionId]) {
                console.log('[Redux] Initializing new live transcription for session:', sessionId);
                state.liveTranscription[sessionId] = {
                    id: Date.now() + Math.random(),
                    segments: [{
                        text: trimmedText,
                        timestamp: Date.now(),
                    }],
                    timestamp: new Date().toISOString(),
                    startTime: new Date().toISOString(),
                    sessionId,
                    language: language || 'auto',
                };
            } else {
                console.log('[Redux] Appending to existing transcription. Adding segment:', trimmedText.length, 'chars');
                // Append new segment with timestamp
                state.liveTranscription[sessionId].segments.push({
                    text: trimmedText,
                    timestamp: Date.now(),
                });
                state.liveTranscription[sessionId].timestamp = new Date().toISOString();
                state.liveTranscription[sessionId].language = language || state.liveTranscription[sessionId].language;
            }

            console.log('[Redux] Live transcription updated. Total segments:', state.liveTranscription[sessionId].segments.length);

            state.lastUpdated = new Date().toISOString();
            state.isActive = true;

            // Clean up old sessions (older than 5 minutes)
            const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
            Object.keys(state.liveTranscription).forEach(sid => {
                const transcription = state.liveTranscription[sid];
                const lastUpdate = new Date(transcription.timestamp).getTime();
                if (lastUpdate < fiveMinutesAgo && sid !== sessionId) {
                    console.log('[Redux] Removing old transcription for session:', sid);
                    delete state.liveTranscription[sid];
                }
            });
        },

        /**
         * Clear all transcription entries and live transcriptions
         */
        clearTranscriptions: (state) => {
            state.entries = [];
            state.wordCount = 0;
            state.lastUpdated = null;
            state.isActive = false;
            state.liveTranscription = {}; // Clear all live transcriptions
        },

        /**
         * Set transcription active state
         */
        setTranscriptionActive: (state, action) => {
            state.isActive = action.payload;
        },

        /**
         * Update max words limit
         */
        setMaxWords: (state, action) => {
            state.maxWords = action.payload;

            // Trim if necessary
            while (state.wordCount > state.maxWords && state.entries.length > 1) {
                const removed = state.entries.pop();
                const removedWords = removed.text.split(/\s+/).length;
                state.wordCount -= removedWords;
            }
        },

        /**
         * Remove specific entry by ID
         */
        removeTranscription: (state, action) => {
            const id = action.payload;
            const index = state.entries.findIndex(entry => entry.id === id);

            if (index !== -1) {
                const removed = state.entries.splice(index, 1)[0];
                const removedWords = removed.text.split(/\s+/).length;
                state.wordCount -= removedWords;
            }
        },

        /**
         * Clear transcriptions for a specific session
         */
        clearSessionTranscriptions: (state, action) => {
            const sessionId = action.payload;
            const remainingEntries = state.entries.filter(entry => entry.sessionId !== sessionId);

            // Recalculate word count
            state.wordCount = remainingEntries.reduce((count, entry) => {
                return count + entry.text.split(/\s+/).length;
            }, 0);

            state.entries = remainingEntries;

            if (state.entries.length === 0) {
                state.isActive = false;
                state.lastUpdated = null;
            }
        },
    },
});

// Export actions
export const {
    addTranscription,
    clearTranscriptions,
    setTranscriptionActive,
    setMaxWords,
    removeTranscription,
    clearSessionTranscriptions,
} = transcriptionSlice.actions;

// Selectors
export const selectTranscriptionEntries = (state) => state.transcription.entries;
export const selectTranscriptionWordCount = (state) => state.transcription.wordCount;
export const selectTranscriptionIsActive = (state) => state.transcription.isActive;
export const selectTranscriptionLastUpdated = (state) => state.transcription.lastUpdated;
export const selectTranscriptionMaxWords = (state) => state.transcription.maxWords;

// Get all transcriptions as a single continuous text (newest first)
export const selectTranscriptionText = (state) => {
    return state.transcription.entries.map(entry => entry.text).join(' ');
};

// Get transcriptions for a specific session
export const selectSessionTranscriptions = (sessionId) => (state) => {
    return state.transcription.entries.filter(entry => entry.sessionId === sessionId);
};

// Get recent transcriptions (last N entries)
export const selectRecentTranscriptions = (count) => (state) => {
    return state.transcription.entries.slice(0, count);
};

export default transcriptionSlice.reducer;
