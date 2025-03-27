import { createSlice } from '@reduxjs/toolkit';

const rigTableSlice = createSlice({
    name: 'rigTable',
    initialState: {
        rigs: [],
        status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
        error: null,
        // Table-related states:
        order: 'asc',
        orderBy: 'name',
        selected: [],
        page: 0,
        rowsPerPage: 5,
    },
    reducers: {
        setRigs: (state, action) => {
            state.rigs = action.payload;
        },
        addRig: (state, action) => {
            state.rigs.push(action.payload);
        },
        removeRig: (state, action) => {
            const idToRemove = action.payload;
            state.rigs = state.rigs.filter((rig) => rig.id !== idToRemove);
        },
        updateRig: (state, action) => {
            const { id, updates } = action.payload;
            const index = state.rigs.findIndex((rig) => rig.id === id);
            if (index !== -1) {
                state.rigs[index] = { ...state.rigs[index], ...updates };
            }
        },
        // New table-related reducers:
        setOrder: (state, action) => {
            state.order = action.payload;
        },
        setOrderBy: (state, action) => {
            state.orderBy = action.payload;
        },
        setSelected: (state, action) => {
            state.selected = action.payload;
        },
        toggleSelected: (state, action) => {
            const id = action.payload;
            if (state.selected.includes(id)) {
                state.selected = state.selected.filter((sid) => sid !== id);
            } else {
                state.selected.push(id);
            }
        },
        setPage: (state, action) => {
            state.page = action.payload;
        },
        setRowsPerPage: (state, action) => {
            state.rowsPerPage = action.payload;
        },
    },
    extraReducers: (builder) => {

    },
});

export const {
    setRigs,
    addRig,
    removeRig,
    updateRig,
    setOrder,
    setOrderBy,
    setSelected,
    toggleSelected,
    setPage,
    setRowsPerPage,
} = rigTableSlice.actions;

export default rigTableSlice.reducer;