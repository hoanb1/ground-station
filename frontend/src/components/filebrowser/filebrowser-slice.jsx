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

// Unified async thunk to fetch all files (recordings and snapshots)
// Note: This now uses pub/sub model - it sends a request and the response comes via socket event
export const fetchFiles = createAsyncThunk(
    'filebrowser/fetchFiles',
    async ({ socket, page = 1, pageSize = 8, sortBy = 'created', sortOrder = 'desc', showRecordings = true, showSnapshots = true }, { rejectWithValue }) => {
        try {
            // Emit request without callback - response will come via 'file_browser_state' event
            socket.emit('file_browser', 'list-files', { page, pageSize, sortBy, sortOrder, showRecordings, showSnapshots });

            // Return pending state - actual data will be updated via socket listener
            return { pending: true };
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to fetch files');
        }
    }
);

// Legacy: Async thunk to fetch recordings list (kept for backward compatibility)
export const fetchRecordings = createAsyncThunk(
    'filebrowser/fetchRecordings',
    async ({ socket, page = 1, pageSize = 20 }, { rejectWithValue }) => {
        return new Promise((resolve, reject) => {
            socket.emit('file_browser', 'list-recordings', { page, pageSize }, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response.error || 'Failed to fetch recordings'));
                }
            });
        });
    }
);

// Legacy: Async thunk to fetch snapshots list (kept for backward compatibility)
export const fetchSnapshots = createAsyncThunk(
    'filebrowser/fetchSnapshots',
    async ({ socket, page = 1, pageSize = 20 }, { rejectWithValue }) => {
        return new Promise((resolve, reject) => {
            socket.emit('file_browser', 'list-snapshots', { page, pageSize }, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response.error || 'Failed to fetch snapshots'));
                }
            });
        });
    }
);

// Async thunk to delete a recording
// Note: This now uses pub/sub model - response comes via 'file_browser_state' event
export const deleteRecording = createAsyncThunk(
    'filebrowser/deleteRecording',
    async ({ socket, name }, { rejectWithValue }) => {
        try {
            // Emit request without callback - response will come via 'file_browser_state' event
            socket.emit('file_browser', 'delete-recording', { name });

            // Return the name for optimistic updates if needed
            return { name, pending: true };
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to delete recording');
        }
    }
);

// Async thunk to delete a snapshot
// Note: This now uses pub/sub model - response comes via 'file_browser_state' event
export const deleteSnapshot = createAsyncThunk(
    'filebrowser/deleteSnapshot',
    async ({ socket, filename }, { rejectWithValue }) => {
        try {
            // Emit request without callback - response will come via 'file_browser_state' event
            socket.emit('file_browser', 'delete-snapshot', { filename });

            // Return the filename for optimistic updates if needed
            return { filename, pending: true };
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to delete snapshot');
        }
    }
);

// Async thunk to get recording details
export const fetchRecordingDetails = createAsyncThunk(
    'filebrowser/fetchRecordingDetails',
    async ({ socket, name }, { rejectWithValue }) => {
        return new Promise((resolve, reject) => {
            socket.emit('file_browser', 'get-recording-details', { name }, (response) => {
                if (response.success) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue(response.error || 'Failed to fetch recording details'));
                }
            });
        });
    }
);

const initialState = {
    // Unified state
    files: [],
    filesLoading: false,
    filesError: null,
    page: 1,
    pageSize: 8,
    total: 0,
    sortBy: 'created',
    sortOrder: 'desc',
    filters: {
        showRecordings: true,
        showSnapshots: true,
    },
    diskUsage: {
        total: 0,
        used: 0,
        available: 0,
    },
    // Legacy state (kept for backward compatibility)
    recordings: [],
    snapshots: [],
    recordingsLoading: false,
    snapshotsLoading: false,
    recordingsError: null,
    snapshotsError: null,
    selectedRecording: null,
    selectedSnapshot: null,
    recordingsPage: 1,
    snapshotsPage: 1,
    recordingsPageSize: 5,
    snapshotsPageSize: 20,
    recordingsTotal: 0,
    snapshotsTotal: 0,
    unifiedSortBy: 'created',
    unifiedSortOrder: 'desc',
    viewMode: 'recordings',
};

const fileBrowserSlice = createSlice({
    name: 'filebrowser',
    initialState,
    reducers: {
        // Unified actions
        setSortBy: (state, action) => {
            state.sortBy = action.payload;
            state.unifiedSortBy = action.payload; // Keep legacy in sync
            state.page = 1; // Reset to first page when sort changes
        },
        toggleSortOrder: (state) => {
            state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
            state.unifiedSortOrder = state.sortOrder; // Keep legacy in sync
            state.page = 1; // Reset to first page when sort order changes
        },
        setPage: (state, action) => {
            state.page = action.payload;
        },
        setFilter: (state, action) => {
            const { filter, value } = action.payload;
            state.filters[filter] = value;
            state.page = 1; // Reset to first page when filter changes
        },
        toggleFilter: (state, action) => {
            const filter = action.payload;
            state.filters[filter] = !state.filters[filter];
            state.page = 1; // Reset to first page when filter changes
        },
        // Pagination actions
        setRecordingsPage: (state, action) => {
            state.recordingsPage = action.payload;
        },
        setSnapshotsPage: (state, action) => {
            state.snapshotsPage = action.payload;
        },
        // Legacy actions
        setViewMode: (state, action) => {
            state.viewMode = action.payload;
        },
        setRecordingsSortBy: (state, action) => {
            state.sortBy.recordings = action.payload;
        },
        setRecordingsSortOrder: (state, action) => {
            state.sortOrder.recordings = action.payload;
        },
        setSnapshotsSortBy: (state, action) => {
            state.sortBy.snapshots = action.payload;
        },
        setSnapshotsSortOrder: (state, action) => {
            state.sortOrder.snapshots = action.payload;
        },
        toggleRecordingsSortOrder: (state) => {
            state.sortOrder.recordings = state.sortOrder.recordings === 'asc' ? 'desc' : 'asc';
        },
        toggleSnapshotsSortOrder: (state) => {
            state.sortOrder.snapshots = state.sortOrder.snapshots === 'asc' ? 'desc' : 'asc';
        },
        setSelectedRecording: (state, action) => {
            state.selectedRecording = action.payload;
        },
        setSelectedSnapshot: (state, action) => {
            state.selectedSnapshot = action.payload;
        },
        clearSelectedRecording: (state) => {
            state.selectedRecording = null;
        },
        clearSelectedSnapshot: (state) => {
            state.selectedSnapshot = null;
        },
        // Action to handle file changes from backend (for Socket.IO listener)
        handleFileChange: (state, action) => {
            // This will be called when backend emits file change events
            // We'll trigger a refresh by setting a flag or directly updating the list
            const { type, data } = action.payload;
            if (type === 'recording_added') {
                state.recordings.unshift(data);
            } else if (type === 'recording_deleted') {
                state.recordings = state.recordings.filter(r => r.name !== data.name);
            } else if (type === 'snapshot_added') {
                state.snapshots.unshift(data);
            } else if (type === 'snapshot_deleted') {
                state.snapshots = state.snapshots.filter(s => s.filename !== data.filename);
            }
        },
    },
    extraReducers: (builder) => {
        // Unified fetchFiles
        builder.addCase(fetchFiles.pending, (state) => {
            state.filesLoading = true;
            state.filesError = null;
        });
        builder.addCase(fetchFiles.fulfilled, (state, action) => {
            // If this is just a pending state (pub/sub model), don't update data
            if (action.payload.pending) {
                // Keep loading true, actual data will come via socket event
                return;
            }

            state.filesLoading = false;
            state.files = action.payload.items || [];
            state.total = action.payload.total || 0;
            state.page = action.payload.page || state.page;
            // Don't update pageSize from response - it should only be set by user actions
            state.diskUsage = action.payload.diskUsage || { total: 0, used: 0, available: 0 };
        });
        builder.addCase(fetchFiles.rejected, (state, action) => {
            state.filesLoading = false;
            state.filesError = action.payload || 'Failed to fetch files';
        });

        // Legacy: Fetch recordings
        builder.addCase(fetchRecordings.pending, (state) => {
            state.recordingsLoading = true;
            state.recordingsError = null;
        });
        builder.addCase(fetchRecordings.fulfilled, (state, action) => {
            state.recordingsLoading = false;
            state.recordings = action.payload.items || action.payload;
            state.recordingsTotal = action.payload.total || action.payload.length;
            state.recordingsPage = action.payload.page || state.recordingsPage;
            state.recordingsPageSize = action.payload.pageSize || state.recordingsPageSize;
        });
        builder.addCase(fetchRecordings.rejected, (state, action) => {
            state.recordingsLoading = false;
            state.recordingsError = action.payload || 'Failed to fetch recordings';
        });

        // Fetch snapshots
        builder.addCase(fetchSnapshots.pending, (state) => {
            state.snapshotsLoading = true;
            state.snapshotsError = null;
        });
        builder.addCase(fetchSnapshots.fulfilled, (state, action) => {
            state.snapshotsLoading = false;
            state.snapshots = action.payload.items || action.payload;
            state.snapshotsTotal = action.payload.total || action.payload.length;
            state.snapshotsPage = action.payload.page || state.snapshotsPage;
            state.snapshotsPageSize = action.payload.pageSize || state.snapshotsPageSize;
        });
        builder.addCase(fetchSnapshots.rejected, (state, action) => {
            state.snapshotsLoading = false;
            state.snapshotsError = action.payload || 'Failed to fetch snapshots';
        });

        // Delete recording
        builder.addCase(deleteRecording.fulfilled, (state, action) => {
            // Update legacy state
            state.recordings = state.recordings.filter(r => r.name !== action.payload);
            // Update unified files state
            state.files = state.files.filter(f => !(f.type === 'recording' && f.name === action.payload));
            // Update total count
            state.total = Math.max(0, state.total - 1);
            if (state.selectedRecording?.name === action.payload) {
                state.selectedRecording = null;
            }
        });

        // Delete snapshot
        builder.addCase(deleteSnapshot.fulfilled, (state, action) => {
            // Update legacy state
            state.snapshots = state.snapshots.filter(s => s.filename !== action.payload);
            // Update unified files state
            state.files = state.files.filter(f => !(f.type === 'snapshot' && f.filename === action.payload));
            // Update total count
            state.total = Math.max(0, state.total - 1);
            if (state.selectedSnapshot?.filename === action.payload) {
                state.selectedSnapshot = null;
            }
        });

        // Fetch recording details
        builder.addCase(fetchRecordingDetails.fulfilled, (state, action) => {
            state.selectedRecording = action.payload;
        });
    },
});

export const {
    // Unified actions
    setSortBy,
    toggleSortOrder,
    setPage,
    setFilter,
    toggleFilter,
    // Legacy pagination actions
    setRecordingsPage,
    setSnapshotsPage,
    // Legacy actions
    setViewMode,
    setRecordingsSortBy,
    setRecordingsSortOrder,
    setSnapshotsSortBy,
    setSnapshotsSortOrder,
    toggleRecordingsSortOrder,
    toggleSnapshotsSortOrder,
    setSelectedRecording,
    setSelectedSnapshot,
    clearSelectedRecording,
    clearSelectedSnapshot,
    handleFileChange,
} = fileBrowserSlice.actions;

export default fileBrowserSlice.reducer;
