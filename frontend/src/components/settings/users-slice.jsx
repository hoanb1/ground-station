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


import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Default user object
const defaultUser = {
    id: null,
    fullname: '',
    email: '',
    password: '',
    status: 'active',
    added: '',
};

// Thunk to fetch all users
export const fetchUsers = createAsyncThunk(
    'users/fetchAll',
    async ({ socket }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_request', 'get-users', null, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to fetch users'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Thunk to delete selected users
export const deleteUsers = createAsyncThunk(
    'users/delete',
    async ({ socket, selectedIds }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'delete-user', selectedIds, (res) => {
                    if (res.success) {
                        resolve(res.data); // updated list or IDs
                    } else {
                        reject(new Error('Failed to delete users'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

// Thunk to add or edit a user
export const submitOrEditUser = createAsyncThunk(
    'users/submitOrEdit',
    async ({ socket, formValues }, { rejectWithValue }) => {
        const action = formValues.id ? 'edit-user' : 'submit-user';
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', action, formValues, (res) => {
                    if (res.success) {
                        resolve(res.data); // updated list or new user
                    } else {
                        reject(new Error(`Failed to ${action === 'edit-user' ? 'edit' : 'submit'} user`));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

const usersSlice = createSlice({
    name: 'users',
    initialState: {
        data: [],             // List of users
        loading: false,
        error: null,
        // Dialog controls
        openConfirmDialog: false,
        openUserDialog: false,
        // Selection
        selected: [],
        // Form
        formValues: defaultUser,
    },
    reducers: {
        setOpenConfirmDialog: (state, action) => {
            state.openConfirmDialog = action.payload;
        },
        setOpenUserDialog: (state, action) => {
            state.openUserDialog = action.payload;
        },
        setSelected: (state, action) => {
            state.selected = action.payload;
        },
        setFormValues: (state, action) => {
            state.formValues = {
                ...state.formValues,
                ...action.payload,
            };
        },
        resetFormValues: (state) => {
            state.formValues = defaultUser;
        },
    },
    extraReducers: (builder) => {
        builder
            // Fetch users
            .addCase(fetchUsers.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchUsers.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload;
            })
            .addCase(fetchUsers.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Delete users
            .addCase(deleteUsers.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(deleteUsers.fulfilled, (state, action) => {
                state.loading = false;
                // If the server returns a new list:
                state.data = action.payload;
                // Or, if it only returns IDs, filter them out:
                // const deletedIds = action.payload;
                // state.data = state.data.filter(u => !deletedIds.includes(u.id));
                state.openConfirmDialog = false;
            })
            .addCase(deleteUsers.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // Submit or Edit user
            .addCase(submitOrEditUser.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(submitOrEditUser.fulfilled, (state, action) => {
                state.loading = false;
                // If the server returns a fresh list:
                state.data = action.payload;
                // Or if it returns just the modified user, you could do something like:
                // const updatedUser = action.payload;
                // // Find index. If found, replace; otherwise, push new.
                // state.data = ...;
                state.openUserDialog = false;
            })
            .addCase(submitOrEditUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    },
});

export const {
    setOpenConfirmDialog,
    setOpenUserDialog,
    setSelected,
    setFormValues,
    resetFormValues,
} = usersSlice.actions;

export default usersSlice.reducer;