import {createSlice, createAsyncThunk} from '@reduxjs/toolkit';


const rigsSlice = createSlice({
    name: 'dashboard',
    initialState: {
        isEditing: false,
    },
    reducers: {
        setIsEditing: (state, action) => {
            state.isEditing = action.payload;
        }
    },
});

export const {
    setIsEditing,
} = rigsSlice.actions;

export default rigsSlice.reducer;
