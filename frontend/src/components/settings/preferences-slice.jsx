import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchPreferences = createAsyncThunk(
    'preferences/fetchPreferences',
    async ({socket}, {rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            socket.emit('data_request', 'fetch-preferences', (response) => {
                if (response['success']) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue('Could not fetch preferences'));
                }
            });
        });
    }
);


export const updatePreferences = createAsyncThunk(
    'preferences/updatePreferences',
    async ({ socket }, {getState, rejectWithValue}) => {
        return new Promise((resolve, reject) => {
            const preferences = getState().preferences;
            socket.emit('data_submission', 'update-preferences', [...preferences.preferences], (response) => {
                if (response['success']) {
                    resolve(response.data);
                } else {
                    reject(rejectWithValue('Failed to set preferences'));
                }
            });
        });
    }
);


const preferencesSlice = createSlice({
    name: 'preferences',
    initialState: {
        preferences: [
            {
                id: null,
                name: 'language',
                value: 'en_US',
            },
            {
                id: null,
                name: 'theme',
                value: 'dark',
            },
            {
                id: null,
                value: 'Europe/Athens',
                name: 'timezone',
            }
        ],
        status: 'idle',
        error: null,

    },
    reducers: {
        setPreference: (state, action) => {
            const {name, value} = action.payload;
            const preference = state.preferences.find((pref) => pref.name === name);
            if (preference) {
                preference.value = value;
            }
        },
    },
    extraReducers: (builder) => {
        builder
            // fetchPreferences
            .addCase(fetchPreferences.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(fetchPreferences.fulfilled, (state, action) => {
                state.status = 'succeeded';
                action.payload.forEach((preference) => {
                    const existingPreference = state.preferences.find((pref) => pref.name === preference.name);
                    if (existingPreference) {
                        existingPreference.value = preference.value;
                    }
                });
            })
            .addCase(fetchPreferences.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload;
            })
            .addCase(updatePreferences.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(updatePreferences.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.preferences = action.payload;
            })
            .addCase(updatePreferences.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload;
            });
    },
});


export const {
    setPreference,
} = preferencesSlice.actions;


export default preferencesSlice.reducer;