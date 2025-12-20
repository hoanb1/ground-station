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
};

const transcriptionSlice = createSlice({
    name: 'transcription',
    initialState,
    reducers: {
        /**
         * Add a new transcription entry
         * Automatically trims older entries if word count exceeds maxWords
         */
        addTranscription: (state, action) => {
            const { text, sessionId, language } = action.payload;

            // Create new entry
            const entry = {
                id: Date.now() + Math.random(), // Unique ID
                text: text.trim(),
                timestamp: new Date().toISOString(),
                sessionId,
                language: language || 'auto',
            };

            // Calculate word count for new entry
            const newWords = text.trim().split(/\s+/).length;

            // Add to beginning of array (newest first)
            state.entries.unshift(entry);
            state.wordCount += newWords;
            state.lastUpdated = entry.timestamp;
            state.isActive = true;

            // Trim old entries if we exceed maxWords
            while (state.wordCount > state.maxWords && state.entries.length > 1) {
                const removed = state.entries.pop();
                const removedWords = removed.text.split(/\s+/).length;
                state.wordCount -= removedWords;
            }
        },

        /**
         * Clear all transcription entries
         */
        clearTranscriptions: (state) => {
            state.entries = [];
            state.wordCount = 0;
            state.lastUpdated = null;
            state.isActive = false;
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
