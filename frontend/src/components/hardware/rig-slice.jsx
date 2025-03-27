import {createSlice, createAsyncThunk} from '@reduxjs/toolkit';

export const fetchRigs = createAsyncThunk(
    'rigs/fetchAll',
    async ({socket}, {rejectWithValue}) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_request', 'get-rigs', null, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to fetch rigs'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const deleteRigs = createAsyncThunk(
    'rigs/deleteRigs',
    async ({socket, selectedIds}, {rejectWithValue}) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'delete-rig', selectedIds, (response) => {
                    if (response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error('Failed to delete rigs'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const submitOrEditRig = createAsyncThunk(
    'rigs/submitOrEdit',
    async ({socket, formValues}, {rejectWithValue, dispatch}) => {
        const action = formValues.id ? 'edit-rig' : 'submit-rig';
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', action, formValues, (response) => {
                    if (response.success) {
                        dispatch(setOpenAddDialog(false));
                        resolve(response.data);
                    } else {
                        reject(new Error(`Failed to ${action === 'edit-rig' ? 'edit' : 'add'} rig`));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

const defaultRig = {
    id: null,
    name: '',
    host: 'localhost',
    port: 4532,
    radiotype: 'rx',
    pttstatus: 'normal',
    vfotype: 'normal',
    lodown: 0,
    loup: 0,
};

const rigsSlice = createSlice({
    name: 'rigs',
    initialState: {
        rigs: [],
        status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
        error: null,
        openDeleteConfirm: false,
        openAddDialog: false,
        selected: [],
        loading: false,
        pageSize: 10,
        formValues: defaultRig,
    },
    reducers: {
        setRigs: (state, action) => {
            state.rigs = action.payload;
        },
        setLoading: (state, action) => {
            state.loading = action.payload;
        },
        setPageSize: (state, action) => {
            state.pageSize = action.payload;
        },
        setOpenDeleteConfirm: (state, action) => {
            state.openDeleteConfirm = action.payload;
        },
        setOpenAddDialog: (state, action) => {
            state.openAddDialog = action.payload;
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
            state.formValues = defaultRig;
        },
        setError: (state, action) => {
            state.error = action.payload;
        },
        setStatus: (state, action) => {
            state.status = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchRigs.pending, (state) => {
                state.status = 'loading';
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchRigs.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.loading = false;
                state.rigs = action.payload;
            })
            .addCase(fetchRigs.rejected, (state, action) => {
                state.status = 'failed';
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(deleteRigs.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.status = 'loading';
            })
            .addCase(deleteRigs.fulfilled, (state, action) => {
                state.loading = false;
                state.status = 'succeeded';
                state.rigs = action.payload;
                state.openDeleteConfirm = false;
            })
            .addCase(deleteRigs.rejected, (state, action) => {
                state.loading = false;
                state.status = 'failed';
                state.error = action.payload;
            })
            .addCase(submitOrEditRig.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.status = 'loading';
            })
            .addCase(submitOrEditRig.fulfilled, (state, action) => {
                state.loading = false;
                state.status = 'succeeded';
                state.rigs = action.payload;
                state.formValues = defaultRig;
            })
            .addCase(submitOrEditRig.rejected, (state, action) => {
                state.loading = false;
                state.status = 'failed';
                state.error = action.payload;
            })
    },
});

export const {
    setRigs,
    setLoading,
    setPageSize,
    setOpenDeleteConfirm,
    setOpenAddDialog,
    setSelected,
    setFormValues,
    resetFormValues,
    setError,
    setStatus,
} = rigsSlice.actions;

export default rigsSlice.reducer;