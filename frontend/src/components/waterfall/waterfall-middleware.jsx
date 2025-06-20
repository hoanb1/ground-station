import { updateVFOParameters } from './waterfall-slice.jsx';

// You might want to pass the socket as a parameter or get it differently
let socketInstance = null;

// Function to set socket (call this when socket is initialized)
export const setSocketForMiddleware = (socket) => {
    socketInstance = socket;
};

const backendSyncMiddleware = (store) => (next) => (action) => {
    const result = next(action);
    const state = store.getState();

    // Use the socket from the module variable instead of state
    const socket = socketInstance;

    if (!socket) {
        console.warn('Socket not available for backend sync');
        return result;
    }

    // Handle VFO property changes
    if (action.type === 'waterfallState/setVFOProperty') {
        const { vfoNumber, updates } = action.payload;

        // Dispatch async thunk to update backend
        store.dispatch(updateVFOParameters({
            socket,
            vfoNumber,
            updates:
                {
                    vfoNumber: updates.vfoNumber,
                    frequency: updates.frequency,
                    bandwidth: state.waterfall.vfoMarkers[vfoNumber].bandwidth,
                    color: updates.color,
                    active: updates.active,
                    volume: updates.volume,
                    squelch: updates.squelch,
                },
        }));
    }

    // Handle selected VFO changes
    if (action.type === 'waterfallState/setSelectedVFO') {
        const selectedVFO = action.payload;

        if (selectedVFO === null) {
            store.dispatch(updateVFOParameters({
                socket,
                vfoNumber: 0,
                updates: { selected: false }
            }));
        } else {
            store.dispatch(updateVFOParameters({
                socket,
                vfoNumber: selectedVFO,
                updates: { selected: true }
            }));
        }
    }

    // Handle VFO activation
    if (action.type === 'waterfallState/setVfoActive') {
        const vfoNumber = action.payload;

        store.dispatch(updateVFOParameters({
            socket,
            vfoNumber,
            updates: { active: true }
        }));
    }

    // Handle VFO deactivation
    if (action.type === 'waterfallState/setVfoInactive') {
        const vfoNumber = action.payload;

        store.dispatch(updateVFOParameters({
            socket,
            vfoNumber,
            updates: { active: false }
        }));
    }

    // I can add more actions here based on type

    return result;
};

export default backendSyncMiddleware;