/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */



let renderIntervalId = null;
let targetFPS = 30;

// Main message handler
self.onmessage = function(e) {
    const { cmd, data } = e.data;

    switch(cmd) {
        case 'start':
            startRendering(data.fps || targetFPS);
            break;

        case 'stop':
            stopRendering();
            break;

        case 'updateFPS':
            updateFPS(data.fps);
            break;

        case 'updateFFTData':
            // If we receive new FFT data, notify the main thread immediately
            self.postMessage({ type: 'render', immediate: true });
            break;

        default:
            console.error('Unknown command:', cmd);
    }
};

// Start the rendering cycle
function startRendering(fps) {
    // Clear any existing interval first
    stopRendering();

    targetFPS = fps;

    // Confirm start
    self.postMessage({ type: 'status', status: 'started', fps: targetFPS });
}

// Stop the rendering cycle
function stopRendering() {
    if (renderIntervalId) {
        clearInterval(renderIntervalId);
        renderIntervalId = null;
    }
    self.postMessage({ type: 'status', status: 'stopped' });
}

// Update FPS setting
function updateFPS(fps) {
    if (fps !== targetFPS) {
        targetFPS = fps;

        // Restart with new FPS if currently running
        if (renderIntervalId) {
            startRendering(targetFPS);
        }

        self.postMessage({ type: 'status', status: 'fpsUpdated', fps: targetFPS });
    }
}