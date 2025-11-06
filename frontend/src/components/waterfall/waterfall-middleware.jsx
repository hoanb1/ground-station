import { updateVFOParameters } from './waterfall-slice.jsx';
import { flushAudioBuffers } from '../dashboard/audio-service.js';

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
        const { vfoNumber, updates, skipBackendSync } = action.payload;

        // Skip backend sync if this update came from the backend (e.g., frequency-only tracking updates)
        if (skipBackendSync) {
            return result;
        }

        // Get the complete VFO state and merge with updates
        const vfoState = state.waterfall.vfoMarkers[vfoNumber];
        const vfoActiveState = state.waterfall.vfoActive[vfoNumber];
        const isSelected = state.waterfall.selectedVFO === vfoNumber;

        // Dispatch async thunk to update backend with complete state
        store.dispatch(updateVFOParameters({
            socket,
            vfoNumber,
            updates: {
                vfoNumber: vfoNumber,
                ...vfoState,
                ...updates,
                active: vfoActiveState,
                selected: isSelected,
            },
        }));
    }

    // Handle selected VFO changes
    if (action.type === 'waterfallState/setSelectedVFO') {
        const selectedVFO = action.payload;

        // Flush audio buffers to minimize lag when switching VFOs
        flushAudioBuffers();

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
        const vfoState = state.waterfall.vfoMarkers[vfoNumber];
        const isSelected = state.waterfall.selectedVFO === vfoNumber;

        // Send complete VFO state when activating to ensure backend has all parameters
        store.dispatch(updateVFOParameters({
            socket,
            vfoNumber,
            updates: {
                vfoNumber: vfoNumber,
                ...vfoState,
                active: true,
                selected: isSelected,
            }
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

    // Handle streaming start - send all VFO data to backend
    if (action.type === 'waterfallState/setIsStreaming' && action.payload === true) {
        const vfoMarkers = state.waterfall.vfoMarkers;
        const vfoActive = state.waterfall.vfoActive;
        const selectedVFO = state.waterfall.selectedVFO;

        // Send each VFO's complete state to the backend
        Object.keys(vfoMarkers).forEach(vfoNumber => {
            const vfoNum = parseInt(vfoNumber);
            const vfoState = vfoMarkers[vfoNum];
            const isActive = vfoActive[vfoNum];
            const isSelected = selectedVFO === vfoNum;

            // Only send VFO data if the VFO has been initialized (frequency is not null)
            // and the VFO is active
            if (vfoState.frequency !== null && isActive) {
                store.dispatch(updateVFOParameters({
                    socket,
                    vfoNumber: vfoNum,
                    updates: {
                        vfoNumber: vfoNum,
                        ...vfoState,
                        active: isActive,
                        selected: isSelected,
                    },
                }));
            }
        });
    }

    // I can add more actions here based on type

    return result;
};

export default backendSyncMiddleware;