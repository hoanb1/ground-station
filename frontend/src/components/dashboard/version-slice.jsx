import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchVersionInfo = createAsyncThunk(
    'version/fetchVersionInfo',
    async (_, { rejectWithValue }) => {
        try {
            const response = await fetch('/api/version');
            if (!response.ok) {
                throw new Error('Failed to fetch version info');
            }
            return await response.json();
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);

const versionSlice = createSlice({
    name: 'version',
    initialState: {
        data: null,
        loading: false,
        error: null,
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchVersionInfo.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchVersionInfo.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload;
            })
            .addCase(fetchVersionInfo.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    },
});

export default versionSlice.reducer;