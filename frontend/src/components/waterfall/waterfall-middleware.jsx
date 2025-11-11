import { updateVFOParameters, setVFOProperty } from './vfo-slice.jsx';
import { flushAudioBuffers } from '../dashboard/audio-service.js';

// You might want to pass the socket as a parameter or get it differently
let socketInstance = null;

// Function to set socket (call this when socket is initialized)
export const setSocketForMiddleware = (socket) => {
    socketInstance = socket;
};

// Helper function to normalize transmitter modes for VFO demodulation
const normalizeTransmitterMode = (mode) => {
    if (!mode) return null;

    const modeNormalized = mode.toLowerCase();

    // Digital modes (FSK/AFSK/PSK/BPSK/QPSK/GMSK) are transmitted over FM carriers
    if (['fsk', 'afsk', 'psk', 'bpsk', 'qpsk', 'gmsk', 'gmsk usp', 'fmn'].includes(modeNormalized)) {
        return 'FM';
    }

    // Keep FM_STEREO as-is if explicitly specified
    if (modeNormalized === 'fm_stereo') {
        return 'FM_STEREO';
    }

    return mode.toUpperCase();
};

// Helper function to filter out UI-only fields before sending to backend
const filterUIOnlyFields = (vfoState) => {
    const { lockedTransmitterId, frequencyOffset, ...backendFields } = vfoState;
    return backendFields;
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
    if (action.type === 'vfo/setVFOProperty') {
        const { vfoNumber, updates, skipBackendSync } = action.payload;

        // Skip backend sync if this update came from the backend (e.g., frequency-only tracking updates)
        if (skipBackendSync) {
            return result;
        }

        // Handle frequencyOffset changes for locked VFOs
        const updateKeys = Object.keys(updates);
        const isOnlyOffsetChange = updateKeys.length === 1 && updateKeys[0] === 'frequencyOffset';

        if (isOnlyOffsetChange) {
            // Check if this VFO is locked to a transmitter
            const vfoState = state.vfo.vfoMarkers[vfoNumber];

            if (vfoState && vfoState.lockedTransmitterId) {
                // VFO is locked - immediately calculate and send new frequency with offset
                const transmitters = state.targetSatTrack.rigData.transmitters || [];
                const transmitter = transmitters.find(tx => tx.id === vfoState.lockedTransmitterId);

                if (transmitter && transmitter.observed_freq) {
                    const newOffset = updates.frequencyOffset;
                    const finalFrequency = transmitter.observed_freq + newOffset;

                    // Immediately dispatch frequency update to backend
                    store.dispatch(setVFOProperty({
                        vfoNumber: vfoNumber,
                        updates: { frequency: finalFrequency },
                        skipBackendSync: false  // Send to backend for demodulation
                    }));
                }
            }

            // Don't sync offset itself to backend - just update local state
            return result;
        }

        // Get the complete VFO state and merge with updates
        const vfoState = state.vfo.vfoMarkers[vfoNumber];
        const vfoActiveState = state.vfo.vfoActive[vfoNumber];
        const isSelected = state.vfo.selectedVFO === vfoNumber;

        // Filter out UI-only fields before sending to backend
        const backendVfoState = filterUIOnlyFields(vfoState);
        const backendUpdates = filterUIOnlyFields(updates);

        // Dispatch async thunk to update backend with complete state
        store.dispatch(updateVFOParameters({
            socket,
            vfoNumber,
            updates: {
                vfoNumber: vfoNumber,
                ...backendVfoState,
                ...backendUpdates,
                active: vfoActiveState,
                selected: isSelected,
            },
        }));
    }

    // Handle selected VFO changes
    if (action.type === 'vfo/setSelectedVFO') {
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
    if (action.type === 'vfo/setVfoActive') {
        const vfoNumber = action.payload;
        const vfoState = state.vfo.vfoMarkers[vfoNumber];
        const isSelected = state.vfo.selectedVFO === vfoNumber;

        // Filter out UI-only fields before sending to backend
        const backendVfoState = filterUIOnlyFields(vfoState);

        // Send complete VFO state when activating to ensure backend has all parameters
        store.dispatch(updateVFOParameters({
            socket,
            vfoNumber,
            updates: {
                vfoNumber: vfoNumber,
                ...backendVfoState,
                active: true,
                selected: isSelected,
            }
        }));
    }

    // Handle VFO deactivation
    if (action.type === 'vfo/setVfoInactive') {
        const vfoNumber = action.payload;

        store.dispatch(updateVFOParameters({
            socket,
            vfoNumber,
            updates: { active: false }
        }));
    }

    // Handle streaming start - send all VFO data to backend
    if (action.type === 'waterfallState/setIsStreaming' && action.payload === true) {
        const vfoMarkers = state.vfo.vfoMarkers;
        const vfoActive = state.vfo.vfoActive;
        const selectedVFO = state.vfo.selectedVFO;

        // Send each VFO's complete state to the backend
        Object.keys(vfoMarkers).forEach(vfoNumber => {
            const vfoNum = parseInt(vfoNumber);
            const vfoState = vfoMarkers[vfoNum];
            const isActive = vfoActive[vfoNum];
            const isSelected = selectedVFO === vfoNum;

            // Only send VFO data if the VFO has been initialized (frequency is not null)
            // and the VFO is active
            if (vfoState.frequency !== null && isActive) {
                // Filter out UI-only fields before sending to backend
                const backendVfoState = filterUIOnlyFields(vfoState);

                store.dispatch(updateVFOParameters({
                    socket,
                    vfoNumber: vfoNum,
                    updates: {
                        vfoNumber: vfoNum,
                        ...backendVfoState,
                        active: isActive,
                        selected: isSelected,
                    },
                }));
            }
        });
    }

    // Handle satellite tracking data updates - track doppler-corrected frequencies for locked VFOs
    if (action.type === 'targetSatTrack/setSatelliteData') {
        const rigData = action.payload?.rig_data;

        if (rigData && rigData.transmitters && rigData.transmitters.length > 0) {
            const vfoMarkers = state.vfo.vfoMarkers;

            // Check each VFO to see if it's locked to a transmitter
            Object.keys(vfoMarkers).forEach(vfoNumber => {
                const vfoNum = parseInt(vfoNumber);
                const vfo = vfoMarkers[vfoNum];

                // Only update if VFO is locked to a transmitter
                if (vfo.lockedTransmitterId) {
                    // Find the transmitter this VFO is locked to
                    const transmitter = rigData.transmitters.find(tx => tx.id === vfo.lockedTransmitterId);

                    if (transmitter && transmitter.observed_freq) {
                        // Apply frequency offset (can be positive or negative)
                        const offset = vfo.frequencyOffset || 0;
                        const finalFrequency = transmitter.observed_freq + offset;

                        // Check if frequency has changed (to avoid unnecessary updates)
                        if (vfo.frequency !== finalFrequency) {
                            // Update VFO frequency to match transmitter's doppler-corrected frequency + offset
                            store.dispatch(setVFOProperty({
                                vfoNumber: vfoNum,
                                updates: { frequency: finalFrequency },
                                skipBackendSync: false  // Send to backend for demodulation
                            }));

                            const offsetStr = offset !== 0 ? ` (offset: ${offset >= 0 ? '+' : ''}${(offset / 1e3).toFixed(1)} kHz)` : '';
                            console.log(`VFO ${vfoNum} tracking transmitter "${transmitter.description}" at ${(finalFrequency / 1e6).toFixed(6)} MHz${offsetStr}`);
                        }
                    }
                }
            });
        }
    }

    // Handle VFO lock to transmitter - set initial frequency and mode, reset offset when unlocking
    if (action.type === 'vfo/setVFOProperty') {
        const { vfoNumber, updates } = action.payload;

        // Check if lockedTransmitterId was just changed
        if (updates.lockedTransmitterId !== undefined) {
            const transmitterId = updates.lockedTransmitterId;

            if (transmitterId) {
                // VFO was just locked to a transmitter
                const transmitters = state.targetSatTrack.rigData.transmitters || [];
                const transmitter = transmitters.find(tx => tx.id === transmitterId);

                if (transmitter) {
                    // Set initial frequency and mode, reset offset
                    const normalizedMode = normalizeTransmitterMode(transmitter.mode);

                    store.dispatch(setVFOProperty({
                        vfoNumber: vfoNumber,
                        updates: {
                            frequency: transmitter.observed_freq,
                            mode: normalizedMode || 'FM',
                            frequencyOffset: 0  // Reset offset when locking
                        },
                        skipBackendSync: false  // Send to backend
                    }));

                    console.log(`VFO ${vfoNumber} locked to transmitter "${transmitter.description}" at ${(transmitter.observed_freq / 1e6).toFixed(6)} MHz`);
                }
            } else {
                // VFO was just unlocked (transmitterId is null)
                // Reset frequency offset
                store.dispatch(setVFOProperty({
                    vfoNumber: vfoNumber,
                    updates: {
                        frequencyOffset: 0  // Reset offset when unlocking
                    },
                    skipBackendSync: true  // No need to send offset to backend
                }));

                console.log(`VFO ${vfoNumber} unlocked, offset reset to 0`);
            }
        }
    }

    // I can add more actions here based on type

    return result;
};

export default backendSyncMiddleware;