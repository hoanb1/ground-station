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

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchLibraryVersions = createAsyncThunk(
    'libraryVersions/fetchLibraryVersions',
    async ({socket}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_request', 'fetch_library_versions', null, (response) => {
                if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response?.error || 'Could not fetch library versions'));
                }
            });
        });
    }
);

const libraryVersionsSlice = createSlice({
    name: 'libraryVersions',
    initialState: {
        loading: false,
        error: null,
        categories: {},
        totalCount: 0,
    },
    reducers: {
        clearError: (state) => {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchLibraryVersions.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchLibraryVersions.fulfilled, (state, action) => {
                state.loading = false;
                state.categories = action.payload.categories || {};
                state.totalCount = action.payload.total_count || 0;
            })
            .addCase(fetchLibraryVersions.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload || 'Failed to fetch library versions';
            });
    },
});

export const { clearError } = libraryVersionsSlice.actions;
export default libraryVersionsSlice.reducer;
