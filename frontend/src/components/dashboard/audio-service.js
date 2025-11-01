/**
 * Audio service for managing audio buffer flushing
 * This module provides a way for non-React code (like middleware) to trigger audio buffer flushes
 */

let flushCallback = null;

/**
 * Register the flush callback from the AudioProvider
 * @param {Function} callback - The flush function from AudioProvider
 */
export const registerFlushCallback = (callback) => {
    flushCallback = callback;
};

/**
 * Unregister the flush callback
 */
export const unregisterFlushCallback = () => {
    flushCallback = null;
};

/**
 * Flush audio buffers (to be called from middleware or other non-React code)
 */
export const flushAudioBuffers = () => {
    if (flushCallback) {
        flushCallback();
    }
};
