import { updateVFOParameters, setVFOProperty } from './vfo-slice.jsx';
import { flushAudioBuffers } from '../dashboard/audio-service.js';
import { normalizeTransmitterMode } from './vfo-config.js';

// You might want to pass the socket as a parameter or get it differently
let socketInstance = null;

// Function to set socket (call this when socket is initialized)
export const setSocketForMiddleware = (socket) => {
    socketInstance = socket;
};

// Helper function to filter out UI-only fields before sending to backend
const filterUIOnlyFields = (vfoState) => {
    // frequencyOffset is UI-only (used for doppler offset calculations)
    // lockedTransmitterId is now sent to backend as locked_transmitter_id
    const { frequencyOffset, lockedTransmitterId, ...backendFields } = vfoState;

    // Convert camelCase to snake_case for backend
    if (lockedTransmitterId !== undefined) {
        backendFields.locked_transmitter_id = lockedTransmitterId;
    }

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

    // Don't sync to backend if not streaming (except when starting streaming)
    const isStreaming = state.waterfallState.isStreaming;
    if (!isStreaming && action.type !== 'waterfallState/setIsStreaming') {
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

                if (transmitter && transmitter.downlink_observed_freq) {
                    const newOffset = updates.frequencyOffset;
                    const finalFrequency = transmitter.downlink_observed_freq + newOffset;

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
        const satelliteData = action.payload?.satellite_data;

        // OPTION 1: Detect satellite changes and unlock all VFOs
        // When the target satellite changes, all locked VFOs should be unlocked because:
        // 1. The transmitter IDs from the old satellite won't exist in the new satellite's transmitter list
        // 2. Keeping VFOs locked to non-existent transmitters would cause them to stop tracking
        // 3. Users need to manually re-lock VFOs to transmitters of the new satellite
        if (satelliteData && satelliteData.details) {
            const currentNoradId = satelliteData.details.norad_id;
            const previousNoradId = state.targetSatTrack.satelliteData.details.norad_id;

            // Check if the satellite has changed (different NORAD ID)
            if (currentNoradId && previousNoradId && currentNoradId !== previousNoradId) {
                const vfoMarkers = state.vfo.vfoMarkers;

                console.log(`Satellite changed from ${previousNoradId} to ${currentNoradId} - unlocking all VFOs`);

                // Unlock all VFOs that are currently locked to transmitters
                Object.keys(vfoMarkers).forEach(vfoNumber => {
                    const vfoNum = parseInt(vfoNumber);
                    const vfo = vfoMarkers[vfoNum];

                    if (vfo.lockedTransmitterId) {
                        store.dispatch(setVFOProperty({
                            vfoNumber: vfoNum,
                            updates: {
                                lockedTransmitterId: null,
                                frequencyOffset: 0
                            },
                            skipBackendSync: true  // No need to sync UI-only fields to backend
                        }));

                        console.log(`VFO ${vfoNum} unlocked due to satellite change`);
                    }
                });

                // Early return - don't process frequency tracking for the old satellite's transmitters
                return result;
            }
        }

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

                    // OPTION 3: Defensive validation - unlock VFO if transmitter not found
                    // This handles edge cases where transmitter data becomes unavailable for reasons other
                    // than satellite changes (e.g., transmitter disabled, data corruption, etc.)
                    if (!transmitter) {
                        store.dispatch(setVFOProperty({
                            vfoNumber: vfoNum,
                            updates: {
                                lockedTransmitterId: null,
                                frequencyOffset: 0
                            },
                            skipBackendSync: true
                        }));

                        console.warn(`VFO ${vfoNum} unlocked: transmitter ID ${vfo.lockedTransmitterId} not found in current transmitter list`);
                        return;  // Skip frequency update for this VFO
                    }

                    if (transmitter.downlink_observed_freq) {
                        // Apply frequency offset (can be positive or negative)
                        const offset = vfo.frequencyOffset || 0;
                        const finalFrequency = transmitter.downlink_observed_freq + offset;

                        // Check if frequency has changed (to avoid unnecessary updates)
                        if (vfo.frequency !== finalFrequency) {
                            store.dispatch(setVFOProperty({
                                vfoNumber: vfoNum,
                                updates: { frequency: finalFrequency },
                                skipBackendSync: false
                            }));

                            const offsetStr = offset !== 0 ? ` (offset: ${offset >= 0 ? '+' : ''}${(offset / 1e3).toFixed(1)} kHz)` : '';
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
                            frequency: transmitter.downlink_observed_freq,
                            mode: normalizedMode || 'FM',
                            frequencyOffset: 0  // Reset offset when locking
                        },
                        skipBackendSync: false  // Send to backend
                    }));

                    console.log(`VFO ${vfoNumber} locked to transmitter "${transmitter.description}" at ${(transmitter.downlink_observed_freq / 1e6).toFixed(6)} MHz`);
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