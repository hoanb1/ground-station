import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchSDRs = createAsyncThunk(
    'sdrs/fetchAll',
    async ({ socket }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_request', 'get-sdrs', null, (res) => {
                    if (res.success) {
                        resolve(res.data);
                    } else {
                        reject(new Error('Failed to fetch SDRs'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const deleteSDRs = createAsyncThunk(
    'sdrs/deleteSDRs',
    async ({ socket, selectedIds }, { rejectWithValue }) => {
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', 'delete-sdr', selectedIds, (response) => {
                    if (response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error('Failed to delete SDRs'));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

export const submitOrEditSDR = createAsyncThunk(
    'sdrs/submitOrEdit',
    async ({socket, formValues}, {rejectWithValue, dispatch}) => {
        const action = formValues.id ? 'edit-sdr' : 'submit-sdr';
        try {
            return await new Promise((resolve, reject) => {
                socket.emit('data_submission', action, formValues, (response) => {
                    if (response.success) {
                        dispatch(setOpenAddDialog(false));
                        resolve(response.data);
                    } else {
                        reject(new Error(`Failed to ${action === 'edit-sdr' ? 'edit' : 'add'} SDR`));
                    }
                });
            });
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

const defaultSDR = {
    id: null,
    name: '',
    device: '',
    host: '127.0.0.1',
    port: 1234,
    type: 'rtlsdrusb',
    serial: '',
    frequency_min: 0,
    frequency_max: 0,
};

const sdrsSlice = createSlice({
    name: 'sdrs',
    initialState: {
        selectedSDR: defaultSDR,
        selectedSDRId: "",
        sdrs: [],
        status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
        error: null,
        openDeleteConfirm: false,
        openAddDialog: false,
        selected: [],
        loading: false,
        pageSize: 10,
        formValues: defaultSDR,
    },
    reducers: {
        setSDRs: (state, action) => {
            state.sdrs = action.payload;
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
            state.formValues = defaultSDR;
        },
        setError: (state, action) => {
            state.error = action.payload;
        },
        setStatus: (state, action) => {
            state.status = action.payload;
        },
        setSelectedSDRId: (state, action) => {
            state.selectedSDRId = action.payload;
            state.selectedSDR = state.sdrs.find(sdr => sdr.id === action.payload);
        },
    },
    extraReducers: (builder) => {
        builder
            // When the thunk is pending, mark status/loading states
            .addCase(fetchSDRs.pending, (state) => {
                state.status = 'loading';
                state.loading = true;
                state.error = null;
            })
            // When the thunk completes successfully
            .addCase(fetchSDRs.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.loading = false;
                state.sdrs = action.payload; // the data returned by the thunk
            })
            // If the thunk fails
            .addCase(fetchSDRs.rejected, (state, action) => {
                state.status = 'failed';
                state.loading = false;
                state.error = action.payload;
            })
            // Pending: set loading, clear errors as needed
            .addCase(deleteSDRs.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.status = 'loading';
            })
            // Fulfilled: update the state with the new data from the server
            .addCase(deleteSDRs.fulfilled, (state, action) => {
                state.loading = false;
                state.status = 'succeeded';
                state.sdrs = action.payload; // Updated SDR list from server
                state.openDeleteConfirm = false;
            })
            // Rejected: store the error
            .addCase(deleteSDRs.rejected, (state, action) => {
                state.loading = false;
                state.status = 'failed';
                state.error = action.payload;
            })
            // Pending: set loading state and clear errors as needed
            .addCase(submitOrEditSDR.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.status = 'loading';
            })
            // Fulfilled: update the state and reset formValues
            .addCase(submitOrEditSDR.fulfilled, (state, action) => {
                state.loading = false;
                state.status = 'succeeded';
                state.sdrs = action.payload; // Add a new SDR or update existing
                state.formValues = defaultSDR; // Reset the form values
            })
            // Rejected: store the error message
            .addCase(submitOrEditSDR.rejected, (state, action) => {
                state.loading = false;
                state.status = 'failed';
                state.error = action.payload;
            })
    },
});

export const {
    setSDRs,
    setLoading,
    setPageSize,
    setOpenDeleteConfirm,
    setOpenAddDialog,
    setSelected,
    setFormValues,
    resetFormValues,
    setError,
    setStatus,
    setSelectedSDRId,
} = sdrsSlice.actions;

export default sdrsSlice.reducer;