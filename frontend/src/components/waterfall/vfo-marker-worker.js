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


let VFOOffscreenCanvas = null;
let VFOCanvasContext = null;

// Configuration constants (matches main thread)
const EDGE_HANDLE_HEIGHT = 20;
const EDGE_HANDLE_Y_OFFSET = 50;

// Message handler
self.onmessage = function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'INIT_CANVAS':
            initializeCanvas(data);
            break;
        case 'RENDER_VFO_MARKERS':
            renderVFOMarkers(data);
            break;
        case 'RESIZE_CANVAS':
            resizeCanvas(data);
            break;
        default:
            console.warn('Unknown message type:', type);
    }
};

/**
 * Initialize the OffscreenCanvas
 */
function initializeCanvas({ canvas, width, height }) {
    try {
        VFOOffscreenCanvas = canvas;
        VFOCanvasContext = VFOOffscreenCanvas.getContext('2d', {
            alpha: true,
            desynchronized: false,
            willReadFrequently: false, // true breaks Webview on android and Hermit browser
        });

        if (!VFOCanvasContext) {
            throw new Error('Failed to get 2D context from OffscreenCanvas');
        }

        // Set initial canvas dimensions
        VFOOffscreenCanvas.width = width;
        VFOOffscreenCanvas.height = height;

        self.postMessage({
            type: 'CANVAS_INITIALIZED',
            success: true
        });

        console.info('VFO canvas worker initialized');
    } catch (error) {
        self.postMessage({
            type: 'CANVAS_INITIALIZED',
            success: false,
            error: error.message
        });
    }
}

/**
 * Resize the canvas
 */
function resizeCanvas({ width, height }) {
    if (!VFOOffscreenCanvas || !VFOCanvasContext) {
        return;
    }

    VFOOffscreenCanvas.width = width;
    VFOOffscreenCanvas.height = height;

    self.postMessage({
        type: 'CANVAS_RESIZED',
        width,
        height
    });
}

/**
 * Format frequency to display in MHz
 */
function formatFrequency(freq) {
    return (freq / 1e6).toFixed(3);
}

/**
 * Calculate VFO marker positions and dimensions
 */
function calculateVFOPositions(marker, startFreq, freqRange, canvasWidth) {
    const bandwidth = marker.bandwidth || 3000;
    const mode = (marker.mode || 'USB').toUpperCase();

    // Calculate frequency range based on mode
    let markerLowFreq, markerHighFreq;

    if (mode === 'USB') {
        markerLowFreq = marker.frequency;
        markerHighFreq = marker.frequency + bandwidth;
    } else if (mode === 'LSB') {
        markerLowFreq = marker.frequency - bandwidth;
        markerHighFreq = marker.frequency;
    } else { // AM, FM, etc.
        markerLowFreq = marker.frequency - bandwidth / 2;
        markerHighFreq = marker.frequency + bandwidth / 2;
    }

    // Calculate x positions
    const centerX = ((marker.frequency - startFreq) / freqRange) * canvasWidth;

    let leftEdgeX, rightEdgeX;

    if (mode === 'USB') {
        leftEdgeX = centerX;
        rightEdgeX = ((markerHighFreq - startFreq) / freqRange) * canvasWidth;
    } else if (mode === 'LSB') {
        leftEdgeX = ((markerLowFreq - startFreq) / freqRange) * canvasWidth;
        rightEdgeX = centerX;
    } else { // AM, FM, etc.
        leftEdgeX = ((markerLowFreq - startFreq) / freqRange) * canvasWidth;
        rightEdgeX = ((markerHighFreq - startFreq) / freqRange) * canvasWidth;
    }

    // Ensure edges are within canvas bounds
    leftEdgeX = Math.max(0, leftEdgeX);
    rightEdgeX = Math.min(canvasWidth, rightEdgeX);

    return {
        centerX,
        leftEdgeX,
        rightEdgeX,
        markerLowFreq,
        markerHighFreq,
        bandwidth,
        mode
    };
}

/**
 * Draw a single VFO marker
 */
function drawVFOMarker(marker, markerIdx, isSelected, startFreq, endFreq, freqRange, canvasWidth, canvasHeight) {
    const positions = calculateVFOPositions(marker, startFreq, freqRange, canvasWidth);
    const { centerX, leftEdgeX, rightEdgeX, markerLowFreq, markerHighFreq, bandwidth, mode } = positions;

    // Skip if marker is outside visible range
    if (markerHighFreq < startFreq || markerLowFreq > endFreq) {
        return;
    }

    // Adjust opacity based on the selected state
    const areaOpacity = isSelected ? '33' : '15';
    const lineOpacity = isSelected ? 'FF' : '99';

    // Draw a shaded bandwidth area
    VFOCanvasContext.fillStyle = `${marker.color}${areaOpacity}`;
    VFOCanvasContext.fillRect(leftEdgeX, 0, rightEdgeX - leftEdgeX, canvasHeight);

    // Draw the center marker line
    VFOCanvasContext.beginPath();
    VFOCanvasContext.strokeStyle = `${marker.color}${lineOpacity}`;
    VFOCanvasContext.lineWidth = isSelected ? 2 : 1.5;
    VFOCanvasContext.moveTo(centerX, 0);
    VFOCanvasContext.lineTo(centerX, canvasHeight);
    VFOCanvasContext.stroke();

    // Draw bandwidth edge lines based on mode
    VFOCanvasContext.beginPath();
    VFOCanvasContext.strokeStyle = `${marker.color}${lineOpacity}`;
    VFOCanvasContext.lineWidth = isSelected ? 1.5 : 1;
    VFOCanvasContext.setLineDash([4, 4]); // Create dashed lines

    if (mode === 'USB') {
        // Only draw right edge for USB
        VFOCanvasContext.moveTo(rightEdgeX, 0);
        VFOCanvasContext.lineTo(rightEdgeX, canvasHeight);
    } else if (mode === 'LSB') {
        // Only draw left edge for LSB
        VFOCanvasContext.moveTo(leftEdgeX, 0);
        VFOCanvasContext.lineTo(leftEdgeX, canvasHeight);
    } else {
        // Draw both edges for other modes
        VFOCanvasContext.moveTo(leftEdgeX, 0);
        VFOCanvasContext.lineTo(leftEdgeX, canvasHeight);
        VFOCanvasContext.moveTo(rightEdgeX, 0);
        VFOCanvasContext.lineTo(rightEdgeX, canvasHeight);
    }

    VFOCanvasContext.stroke();
    VFOCanvasContext.setLineDash([]); // Reset to solid line

    // Draw edge handles
    drawEdgeHandles(mode, leftEdgeX, rightEdgeX, marker.color, lineOpacity, isSelected);

    // Draw frequency label
    drawFrequencyLabel(marker, centerX, bandwidth, mode, lineOpacity);
}

/**
 * Draw edge handles for VFO marker
 */
function drawEdgeHandles(mode, leftEdgeX, rightEdgeX, color, opacity, isSelected) {
    VFOCanvasContext.fillStyle = `${color}${opacity}`;

    const edgeHandleYPosition = EDGE_HANDLE_Y_OFFSET;
    const edgeHandleWidth = isSelected ? 14 : 6;

    if (mode === 'USB' || mode === 'AM' || mode === 'FM') {
        // Right edge handle
        VFOCanvasContext.beginPath();
        VFOCanvasContext.roundRect(
            rightEdgeX - edgeHandleWidth / 2,
            edgeHandleYPosition - EDGE_HANDLE_HEIGHT / 2,
            edgeHandleWidth,
            EDGE_HANDLE_HEIGHT,
            2
        );
        VFOCanvasContext.fill();
    }

    if (mode === 'LSB' || mode === 'AM' || mode === 'FM') {
        // Left edge handle
        VFOCanvasContext.beginPath();
        VFOCanvasContext.roundRect(
            leftEdgeX - edgeHandleWidth / 2,
            edgeHandleYPosition - EDGE_HANDLE_HEIGHT / 2,
            edgeHandleWidth,
            EDGE_HANDLE_HEIGHT,
            2
        );
        VFOCanvasContext.fill();
    }
}

/**
 * Draw frequency label for VFO marker
 */
function drawFrequencyLabel(marker, centerX, bandwidth, mode, opacity) {
    // Create label text
    const modeText = ` [${mode}]`;
    const bwText = mode === 'USB' || mode === 'LSB'
        ? `${(bandwidth / 1000).toFixed(1)}kHz`
        : `±${(bandwidth / 2000).toFixed(1)}kHz`;
    const labelText = `${marker.name}: ${formatFrequency(marker.frequency)} MHz${modeText} ${bwText}`;

    // Set font and measure text
    VFOCanvasContext.font = '12px Monospace';
    const textMetrics = VFOCanvasContext.measureText(labelText);
    const labelWidth = textMetrics.width + 10; // Add padding
    const labelHeight = 14;

    // Draw label background
    VFOCanvasContext.fillStyle = `${marker.color}${opacity}`;
    VFOCanvasContext.beginPath();
    VFOCanvasContext.roundRect(
        centerX - labelWidth / 2,
        5,
        labelWidth,
        labelHeight,
        2
    );
    VFOCanvasContext.fill();

    // Draw label text
    VFOCanvasContext.fillStyle = '#ffffff';
    VFOCanvasContext.textAlign = 'center';
    VFOCanvasContext.fillText(labelText, centerX, 16);
}

/**
 * Main rendering function
 */
function renderVFOMarkers(data) {
    const {
        vfoMarkers,
        vfoActive,
        selectedVFO,
        canvasWidth,
        canvasHeight,
        centerFrequency,
        sampleRate,
        actualWidth,
        containerWidth,
        currentPositionX
    } = data;

    if (!VFOOffscreenCanvas || !VFOCanvasContext) {
        console.error('Canvas not initialized');
        return;
    }

    // Update canvas dimensions if needed
    if (VFOOffscreenCanvas.width !== canvasWidth || VFOOffscreenCanvas.height !== canvasHeight) {
        VFOOffscreenCanvas.width = canvasWidth;
        VFOOffscreenCanvas.height = canvasHeight;
    }

    // Clear the canvas
    VFOCanvasContext.clearRect(0, 0, canvasWidth, canvasHeight);

    // Calculate frequency range
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;
    const freqRange = endFreq - startFreq;

    // Get active VFO keys and sort them so selected VFO is drawn last (on top)
    const vfoKeys = Object.keys(vfoActive).filter(key => vfoActive[key]);

    // Sort keys to put selected VFO at the end
    const sortedVfoKeys = vfoKeys.sort((a, b) => {
        if (parseInt(a) === selectedVFO) return 1;
        if (parseInt(b) === selectedVFO) return -1;
        return parseInt(a) - parseInt(b);
    });

    // Draw each marker in sorted order
    sortedVfoKeys.forEach(markerIdx => {
        const marker = vfoMarkers[markerIdx];
        if (!marker) return;

        const isSelected = parseInt(markerIdx) === selectedVFO;
        drawVFOMarker(marker, markerIdx, isSelected, startFreq, endFreq, freqRange, canvasWidth, canvasHeight);
    });

    // Notify main thread that rendering is complete
    self.postMessage({
        type: 'RENDER_COMPLETE',
        timestamp: performance.now()
    });
}

/**
 * Calculate visible frequency range (utility function for potential future use)
 */
function calculateVisibleFrequencyRange(centerFrequency, sampleRate, actualWidth, containerWidth, currentPositionX) {
    // When zoomed out, we see the full spectrum
    if (actualWidth <= containerWidth) {
        return {
            startFrequency: centerFrequency - sampleRate / 2,
            endFrequency: centerFrequency + sampleRate / 2,
            centerFrequency: centerFrequency,
            bandwidth: sampleRate
        };
    }

    // When zoomed in, calculate visible portion
    const visibleWidthRatio = containerWidth / actualWidth;
    const panOffsetRatio = -currentPositionX / actualWidth;

    const startRatio = Math.max(0, Math.min(1 - visibleWidthRatio, panOffsetRatio));
    const endRatio = Math.min(1, startRatio + visibleWidthRatio);

    const fullStartFreq = centerFrequency - sampleRate / 2;
    const fullEndFreq = centerFrequency + sampleRate / 2;
    const fullFreqRange = fullEndFreq - fullStartFreq;

    const visibleStartFreq = fullStartFreq + (startRatio * fullFreqRange);
    const visibleEndFreq = fullStartFreq + (endRatio * fullFreqRange);

    return {
        startFrequency: visibleStartFreq,
        endFrequency: visibleEndFreq,
        centerFrequency: (visibleStartFreq + visibleEndFreq) / 2,
        bandwidth: visibleEndFreq - visibleStartFreq
    };
}

// Error handling
self.onerror = function(error) {
    self.postMessage({
        type: 'ERROR',
        error: error.message,
        filename: error.filename,
        lineno: error.lineno
    });
};

// Handle unhandled promise rejections
self.onunhandledrejection = function(event) {
    self.postMessage({
        type: 'ERROR',
        error: 'Unhandled promise rejection: ' + event.reason
    });
};

console.log('VFO Renderer Worker initialized');

// Send ready signal to the main thread
self.postMessage({
    type: 'WORKER_READY',
    message: 'Worker has loaded and is ready to receive canvas'
});
