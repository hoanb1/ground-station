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

// Unified async thunk to fetch all files (recordings, snapshots, and decoded)
// Note: This now uses pub/sub model - it sends a request and the response comes via socket event
// Backend returns ALL files, frontend handles sorting and pagination
export const fetchFiles = createAsyncThunk(
    'filebrowser/fetchFiles',
    async ({ socket, showRecordings = true, showSnapshots = true, showDecoded = true }, { rejectWithValue }) => {
        try {
            // Emit request without callback - response will come via 'file_browser_state' event
            // No pagination or sorting params - backend returns all files
            socket.emit('file_browser', 'list-files', { showRecordings, showSnapshots, showDecoded });

            // Return pending state - actual data will be updated via socket listener
            return { pending: true };
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to fetch files');
        }
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

// Async thunk to delete a decoded file
// Note: This now uses pub/sub model - response comes via 'file_browser_state' event
export const deleteDecoded = createAsyncThunk(
    'filebrowser/deleteDecoded',
    async ({ socket, filename }, { rejectWithValue }) => {
        try {
            // Emit request without callback - response will come via 'file_browser_state' event
            socket.emit('file_browser', 'delete-decoded', { filename });

            // Return the filename for optimistic updates if needed
            return { filename, pending: true };
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to delete decoded file');
        }
    }
);

// Async thunk to delete multiple items (batch delete)
export const deleteBatch = createAsyncThunk(
    'filebrowser/deleteBatch',
    async ({ socket, items }, { rejectWithValue }) => {
        try {
            // Emit request without callback - response will come via 'file_browser_state' event
            socket.emit('file_browser', 'delete-batch', { items });

            // Return the items for optimistic updates if needed
            return { items, pending: true };
        } catch (error) {
            return rejectWithValue(error.message || 'Failed to delete items');
        }
    }
);

const initialState = {
    // All files (recordings, snapshots, and decoded)
    files: [],
    filesLoading: false,
    filesError: null,
    page: 1,
    pageSize: 10,
    total: 0,
    sortBy: 'created',
    sortOrder: 'desc',
    filters: {
        showRecordings: true,
        showSnapshots: true,
        showDecoded: true,
    },
    diskUsage: {
        total: 0,
        used: 0,
        available: 0,
    },
    // Multi-select state
    selectedItems: [], // Array of item keys (recording names or snapshot/decoded filenames)
    selectionMode: false, // Toggle for selection mode
    // New files indicator
    lastVisitedTimestamp: null, // ISO timestamp of when user last visited file browser
    hasNewFiles: false, // Flag indicating if new files were added since last visit
};

const fileBrowserSlice = createSlice({
    name: 'filebrowser',
    initialState,
    reducers: {
        setSortBy: (state, action) => {
            state.sortBy = action.payload;
            state.page = 1; // Reset to first page when sort changes
        },
        toggleSortOrder: (state) => {
            state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
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
        // Legacy action for backward compatibility - triggers refetch
        handleFileChange: (state, action) => {
            // This is called when backend emits file change events
            // The actual refetch is handled in component useEffect
        },
        // Multi-select actions
        toggleItemSelection: (state, action) => {
            const key = action.payload;
            const index = state.selectedItems.indexOf(key);
            if (index >= 0) {
                state.selectedItems.splice(index, 1);
            } else {
                state.selectedItems.push(key);
            }
        },
        selectAllItems: (state, action) => {
            // Payload contains all current displayable item keys
            state.selectedItems = action.payload;
        },
        clearSelection: (state) => {
            state.selectedItems = [];
        },
        toggleSelectionMode: (state) => {
            state.selectionMode = !state.selectionMode;
            if (!state.selectionMode) {
                state.selectedItems = [];
            }
        },
        // Mark file browser as visited - clears new files indicator
        markFileBrowserVisited: (state) => {
            state.lastVisitedTimestamp = new Date().toISOString();
            state.hasNewFiles = false;
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
            // Total is now the count of all files received
            state.total = (action.payload.items || []).length;
            state.diskUsage = action.payload.diskUsage || { total: 0, used: 0, available: 0 };

            // Check if there are new files since last visit
            if (state.lastVisitedTimestamp && state.files.length > 0) {
                const lastVisited = new Date(state.lastVisitedTimestamp);
                const hasNew = state.files.some(file => {
                    const fileCreated = new Date(file.created || file.start_time);
                    return fileCreated > lastVisited;
                });
                state.hasNewFiles = hasNew;
            }
        });
        builder.addCase(fetchFiles.rejected, (state, action) => {
            state.filesLoading = false;
            state.filesError = action.payload || 'Failed to fetch files';
        });

        // Delete recording - optimistic update
        builder.addCase(deleteRecording.fulfilled, (state, action) => {
            // Remove from files list
            state.files = state.files.filter(f => !(f.type === 'recording' && f.name === action.payload.name));
            // Update total count
            state.total = Math.max(0, state.total - 1);
        });

        // Delete snapshot - optimistic update
        builder.addCase(deleteSnapshot.fulfilled, (state, action) => {
            // Remove from files list
            state.files = state.files.filter(f => !(f.type === 'snapshot' && f.filename === action.payload.filename));
            // Update total count
            state.total = Math.max(0, state.total - 1);
        });

        // Delete decoded - optimistic update
        builder.addCase(deleteDecoded.fulfilled, (state, action) => {
            // Remove from files list
            state.files = state.files.filter(f => !(f.type === 'decoded' && f.filename === action.payload.filename));
            // Update total count
            state.total = Math.max(0, state.total - 1);
        });

        // Delete batch - optimistic update
        builder.addCase(deleteBatch.fulfilled, (state, action) => {
            const itemsToDelete = action.payload.items;
            // Remove all items in the batch
            state.files = state.files.filter(f => {
                const key = f.type === 'recording' ? f.name : f.filename;
                return !itemsToDelete.find(item =>
                    item.type === f.type && (
                        (item.type === 'recording' && item.name === key) ||
                        (item.type === 'snapshot' && item.filename === key) ||
                        (item.type === 'decoded' && item.filename === key)
                    )
                );
            });
            // Update total count
            state.total = Math.max(0, state.total - itemsToDelete.length);
            // Clear selection after batch delete
            state.selectedItems = [];
        });
    },
});

export const {
    setSortBy,
    toggleSortOrder,
    setPage,
    setFilter,
    toggleFilter,
    handleFileChange,
    toggleItemSelection,
    selectAllItems,
    clearSelection,
    toggleSelectionMode,
    markFileBrowserVisited,
} = fileBrowserSlice.actions;

export default fileBrowserSlice.reducer;
