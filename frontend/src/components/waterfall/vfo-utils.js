/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
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

import {
    getBandwidthType,
    shouldShowBothEdges,
    formatBandwidthLabel,
    shouldShowDecoderStatus,
    shouldShowDecoderProgress,
    shouldShowDecoderMode,
    getTextDisplayConfig,
    getDemodulatorConfig,
    getDecoderConfig
} from './vfo-config.js';

/**
 * Drawing utilities for VFO markers on the waterfall canvas
 */

export const canvasDrawingUtils = {
    drawVFOArea: (ctx, leftEdgeX, rightEdgeX, height, color, opacity) => {
        ctx.fillStyle = `${color}${opacity}`;
        ctx.fillRect(leftEdgeX, 0, rightEdgeX - leftEdgeX, height);
    },

    drawVFOLine: (ctx, x, height, color, opacity, lineWidth) => {
        ctx.beginPath();
        ctx.strokeStyle = `${color}${opacity}`;
        ctx.lineWidth = lineWidth;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    },

    drawVFOEdges: (ctx, mode, leftEdgeX, rightEdgeX, height, color, opacity, lineWidth) => {
        ctx.beginPath();
        ctx.strokeStyle = `${color}${opacity}`;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([4, 4]);

        const bandwidthType = getBandwidthType(mode);

        if (bandwidthType === 'single-sided-upper') {
            // USB, CW - only right edge
            ctx.moveTo(rightEdgeX, 0);
            ctx.lineTo(rightEdgeX, height);
        } else if (bandwidthType === 'single-sided-lower') {
            // LSB - only left edge
            ctx.moveTo(leftEdgeX, 0);
            ctx.lineTo(leftEdgeX, height);
        } else {
            // Double-sided (AM, FM, etc.) - both edges
            ctx.moveTo(leftEdgeX, 0);
            ctx.lineTo(leftEdgeX, height);
            ctx.moveTo(rightEdgeX, 0);
            ctx.lineTo(rightEdgeX, height);
        }

        ctx.stroke();
        ctx.setLineDash([]);
    },

    drawVFOHandle: (ctx, x, y, width, height, color, opacity) => {
        ctx.fillStyle = `${color}${opacity}`;
        ctx.beginPath();
        ctx.roundRect(x - width / 2, y - height / 2, width, height, 2);
        ctx.fill();
    },

    drawVFOLabel: (ctx, centerX, labelText, color, opacity, isSelected, locked = false, decoderInfo = null, morseText = null, isStreaming = false, bpskOutputs = null) => {
        ctx.font = 'bold 12px Monospace';
        const textMetrics = ctx.measureText(labelText);

        // Add extra width for speaker icon (16px icon + 10px left padding + 8px right padding)
        const speakerIconWidth = 34;
        // Add extra width for lock icon if locked (reduced gap between lock and text)
        const lockIconWidth = locked ? 5 : 0;
        const labelWidth = textMetrics.width + 10 + speakerIconWidth + lockIconWidth;
        const labelHeight = 20; // Always use taller height
        const labelTop = 3; // Always start at same position

        // Draw background
        ctx.fillStyle = `${color}${opacity}`;
        ctx.beginPath();
        ctx.roundRect(centerX - labelWidth / 2, labelTop, labelWidth, labelHeight, 2);
        ctx.fill();

        // Draw lock icon on the left if locked
        if (locked) {
            const lockIconX = centerX - (labelWidth / 2) + 6;
            const lockIconY = 11;

            // Draw lock shackle (arc) - rotated 180 degrees (downward)
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(lockIconX + 4, lockIconY, 3.5, 0, Math.PI, true);
            ctx.stroke();

            // Draw lock body (rectangle) - 1px taller, added to top
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(lockIconX - 0.5, lockIconY + 1, 9, 7, 1);
            ctx.fill();
        }

        // Draw text (shifted to maintain consistent spacing with speaker icon)
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        // When not locked, shift text left to compensate for missing lock icon
        const textOffset = locked ? 0 : -10;
        const textY = 17; // Always use same text position
        ctx.fillText(labelText, centerX + textOffset, textY);

        // Draw speaker icon - depends solely on streaming state
        // Position icon with more padding on the right side
        const iconX = centerX + (labelWidth / 2) - 20;
        const iconY = 7;

        if (isStreaming) {
            // Draw active speaker icon with sound waves (audio is playing)
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            // Speaker body (trapezoid shape) - scaled up
            ctx.moveTo(iconX, iconY + 3);
            ctx.lineTo(iconX + 4.5, iconY + 3);
            ctx.lineTo(iconX + 7.5, iconY);
            ctx.lineTo(iconX + 7.5, iconY + 12);
            ctx.lineTo(iconX + 4.5, iconY + 9);
            ctx.lineTo(iconX, iconY + 9);
            ctx.closePath();
            ctx.fill();

            // Sound waves - scaled up
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(iconX + 9, iconY + 6, 3, -Math.PI/4, Math.PI/4);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(iconX + 9, iconY + 6, 6, -Math.PI/4, Math.PI/4);
            ctx.stroke();
        } else {
            // Draw muted speaker icon (with X) - not streaming
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            // Speaker body (trapezoid shape) - scaled up
            ctx.moveTo(iconX, iconY + 3);
            ctx.lineTo(iconX + 4.5, iconY + 3);
            ctx.lineTo(iconX + 7.5, iconY);
            ctx.lineTo(iconX + 7.5, iconY + 12);
            ctx.lineTo(iconX + 4.5, iconY + 9);
            ctx.lineTo(iconX, iconY + 9);
            ctx.closePath();
            ctx.fill();

            // Draw smaller X next to the speaker - vertically centered with 1px gap
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.3;
            const xSize = 2.5; // Half size of the X (smaller)
            const xCenterX = iconX + 12.5; // 1px gap from speaker edge (7.5 + 1 + offset)
            const xCenterY = iconY + 6;
            ctx.beginPath();
            ctx.moveTo(xCenterX - xSize, xCenterY - xSize);
            ctx.lineTo(xCenterX + xSize, xCenterY + xSize);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(xCenterX + xSize, xCenterY - xSize);
            ctx.lineTo(xCenterX - xSize, xCenterY + xSize);
            ctx.stroke();
        }

        // Draw secondary decoder label if decoder is active
        if (decoderInfo) {
            const secondaryLabelTop = labelTop + labelHeight + 2; // 2px gap below primary label
            const decoderType = decoderInfo.decoder_type;

            // Handle BPSK, FSK, GMSK, GFSK, and AFSK decoders with output info
            if (decoderType === 'bpsk' || decoderType === 'fsk' || decoderType === 'gmsk' || decoderType === 'gfsk' || decoderType === 'afsk') {
                const status = decoderInfo.status || 'processing';
                const outputCount = bpskOutputs?.count || 0;
                const baudrate = decoderInfo.info?.baudrate || 0;
                const framing = decoderInfo.info?.framing || 'unknown';

                // Format baudrate for compact display
                const formattedBaudrate = formatBaudrate(baudrate);

                // Template-based label: STATUS | DECODER BAUDRATE | FRAMING | PACKET_COUNT
                const fullText = `${status.toUpperCase()} | ${decoderType.toUpperCase()} ${formattedBaudrate} | ${framing.toUpperCase()} | ${outputCount} PKT`;

                ctx.font = '10px Monospace';
                const fullTextMetrics = ctx.measureText(fullText);
                const decoderLabelWidth = fullTextMetrics.width + 8;
                const decoderLabelHeight = 16;

                // Draw background
                ctx.fillStyle = `${color}${opacity}`;
                ctx.beginPath();
                ctx.roundRect(centerX - decoderLabelWidth / 2, secondaryLabelTop, decoderLabelWidth, decoderLabelHeight, 2);
                ctx.fill();

                // Draw text
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(fullText, centerX, secondaryLabelTop + 12);
            } else {
                // Check if this decoder has text output (like morse)
                const textDisplayConfig = getTextDisplayConfig(decoderType);

                if (textDisplayConfig) {
                    // Text-based decoder display (e.g., morse)
                    const staticPart = `${decoderType.toUpperCase()} | `;
                    const displayText = morseText || textDisplayConfig.placeholder;
                    const fullText = staticPart + displayText;

                    ctx.font = '10px Monospace';
                    const fullTextMetrics = ctx.measureText(fullText);
                    const decoderLabelWidth = fullTextMetrics.width + 8;
                    const decoderLabelHeight = 16;

                    // Draw background
                    ctx.fillStyle = `${color}${opacity}`;
                    ctx.beginPath();
                    ctx.roundRect(centerX - decoderLabelWidth / 2, secondaryLabelTop, decoderLabelWidth, decoderLabelHeight, 2);
                    ctx.fill();

                    // Draw text
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.fillText(fullText, centerX, secondaryLabelTop + 12);
                } else if (decoderType === 'lora') {
                    // LoRa-specific label format
                    const status = decoderInfo.status || 'listening';
                    const sf = decoderInfo.info?.spreading_factor;
                    const bw = decoderInfo.info?.bandwidth_khz;
                    const cr = decoderInfo.info?.coding_rate;

                    // Build LoRa parameters part
                    let loraParams;
                    if (sf !== null && bw !== null && cr !== null) {
                        loraParams = `SF${sf} BW${bw} CR${cr}`;
                    } else {
                        loraParams = 'DETECTING';
                    }

                    const decoderText = `${status.toUpperCase()} | ${loraParams}`;

                    ctx.font = '10px Monospace';
                    const decoderTextMetrics = ctx.measureText(decoderText);
                    const decoderLabelWidth = decoderTextMetrics.width + 8;
                    const decoderLabelHeight = 16;

                    // Draw background
                    ctx.fillStyle = `${color}${opacity}`;
                    ctx.beginPath();
                    ctx.roundRect(centerX - decoderLabelWidth / 2, secondaryLabelTop, decoderLabelWidth, decoderLabelHeight, 2);
                    ctx.fill();

                    // Draw text
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.fillText(decoderText, centerX, secondaryLabelTop + 12);
                } else {
                    // Standard decoder label (status/progress/mode)
                    const parts = [];
                    if (decoderType) parts.push(decoderType.toUpperCase());

                    if (shouldShowDecoderStatus(decoderType) && decoderInfo.status) {
                        parts.push(decoderInfo.status);
                    }
                    if (shouldShowDecoderMode(decoderType) && decoderInfo.mode) {
                        parts.push(decoderInfo.mode);
                    }
                    if (shouldShowDecoderProgress(decoderType) &&
                        decoderInfo.progress !== null &&
                        decoderInfo.progress !== undefined) {
                        parts.push(`${Math.round(decoderInfo.progress)}%`);
                    }

                    const decoderText = parts.join(' | ');

                    if (decoderText) {
                        ctx.font = '10px Monospace';
                        const decoderTextMetrics = ctx.measureText(decoderText);
                        const decoderLabelWidth = decoderTextMetrics.width + 8;
                        const decoderLabelHeight = 16;

                        // Draw background with same color scheme as primary label
                        ctx.fillStyle = `${color}${opacity}`;
                        ctx.beginPath();
                        ctx.roundRect(centerX - decoderLabelWidth / 2, secondaryLabelTop, decoderLabelWidth, decoderLabelHeight, 2);
                        ctx.fill();

                        // Draw text
                        ctx.fillStyle = '#ffffff';
                        ctx.textAlign = 'center';
                        ctx.fillText(decoderText, centerX, secondaryLabelTop + 12);
                    }
                }
            }
        }
    }
};

/**
 * Format baudrate for compact display
 * @param {number} baudrate - Baudrate in baud (e.g., 9600, 1200)
 * @returns {string} - Formatted string (e.g., "9k6", "1k2")
 */
export const formatBaudrate = (baudrate) => {
    if (!baudrate || baudrate === 0) return '0';

    if (baudrate >= 1000) {
        const kilobaud = baudrate / 1000;
        // Format as "Xk" with one decimal if needed, removing trailing .0
        const formatted = kilobaud.toFixed(1).replace('.0', '');
        return `${formatted}`.replace('.', 'k');
    }

    return `${baudrate}`;
};

/**
 * Get the icon width constant used in label calculations
 * @param {boolean} locked - Whether the VFO is locked (adds lock icon width)
 */
export const getVFOLabelIconWidth = (locked = false) => {
    const speakerIconWidth = 34;
    const lockIconWidth = locked ? 5 : 0;
    return speakerIconWidth + lockIconWidth;
};

/**
 * Calculate bandwidth change based on drag mode and frequency delta
 * @param {number} currentBandwidth - Current bandwidth in Hz
 * @param {number} freqDelta - Frequency change in Hz
 * @param {string} dragMode - 'leftEdge' or 'rightEdge'
 * @param {number} minBandwidth - Minimum allowed bandwidth
 * @param {number} maxBandwidth - Maximum allowed bandwidth
 * @returns {number} New bandwidth value
 */
export const calculateBandwidthChange = (currentBandwidth, freqDelta, dragMode, minBandwidth, maxBandwidth) => {
    let newBandwidth;
    if (dragMode === 'leftEdge') {
        newBandwidth = currentBandwidth - (2 * freqDelta);
    } else if (dragMode === 'rightEdge') {
        newBandwidth = currentBandwidth + (2 * freqDelta);
    } else {
        return currentBandwidth;
    }

    return Math.round(Math.max(minBandwidth, Math.min(maxBandwidth, newBandwidth)));
};

/**
 * Calculate VFO frequency bounds and positions based on mode
 * @param {Object} marker - VFO marker object
 * @param {number} startFreq - Start frequency of visible range
 * @param {number} freqRange - Total frequency range
 * @param {number} actualWidth - Actual canvas width
 * @returns {Object} Bounds and positions
 */
export const calculateVFOFrequencyBounds = (marker, startFreq, freqRange, actualWidth) => {
    const bandwidth = marker.bandwidth || 3000;
    const mode = marker.mode || 'FM';
    const bandwidthType = getBandwidthType(mode);

    let markerLowFreq, markerHighFreq, leftEdgeX, rightEdgeX;

    if (bandwidthType === 'single-sided-upper') {
        // USB, CW - bandwidth extends above center frequency
        markerLowFreq = marker.frequency;
        markerHighFreq = marker.frequency + bandwidth;
        leftEdgeX = ((marker.frequency - startFreq) / freqRange) * actualWidth;
        rightEdgeX = ((markerHighFreq - startFreq) / freqRange) * actualWidth;
    } else if (bandwidthType === 'single-sided-lower') {
        // LSB - bandwidth extends below center frequency
        markerLowFreq = marker.frequency - bandwidth;
        markerHighFreq = marker.frequency;
        leftEdgeX = ((markerLowFreq - startFreq) / freqRange) * actualWidth;
        rightEdgeX = ((marker.frequency - startFreq) / freqRange) * actualWidth;
    } else {
        // Double-sided (AM, FM, etc.) - bandwidth divided equally
        markerLowFreq = marker.frequency - bandwidth/2;
        markerHighFreq = marker.frequency + bandwidth/2;
        leftEdgeX = ((markerLowFreq - startFreq) / freqRange) * actualWidth;
        rightEdgeX = ((markerHighFreq - startFreq) / freqRange) * actualWidth;
    }

    // Ensure edges are within bounds
    leftEdgeX = Math.max(0, leftEdgeX);
    rightEdgeX = Math.min(actualWidth, rightEdgeX);

    return {
        markerLowFreq,
        markerHighFreq,
        leftEdgeX,
        rightEdgeX,
        centerX: ((marker.frequency - startFreq) / freqRange) * actualWidth,
        mode,
        bandwidth
    };
};

/**
 * Generate label text for VFO marker
 * @param {Object} marker - VFO marker object
 * @param {string} mode - VFO mode
 * @param {number} bandwidth - VFO bandwidth
 * @param {Function} formatFrequency - Function to format frequency
 * @returns {string} Label text
 */
export const generateVFOLabelText = (marker, mode, bandwidth, formatFrequency) => {
    // Show decoder mode if active, otherwise show audio demodulation mode
    let displayMode;
    if (marker.decoder && marker.decoder !== 'none') {
        const decoderConfig = getDecoderConfig(marker.decoder);
        displayMode = decoderConfig.displayName;
    } else {
        const demodConfig = getDemodulatorConfig(mode);
        displayMode = demodConfig ? demodConfig.displayName : mode;
    }
    const modeText = ` [${displayMode}]`;
    const bwText = formatBandwidthLabel(mode, bandwidth);
    return `${marker.name}: ${formatFrequency(marker.frequency)} MHz${modeText} ${bwText}`;
};

/**
 * Calculate visible frequency range considering zoom and pan
 * @param {number} centerFrequency - Center frequency
 * @param {number} sampleRate - Sample rate
 * @param {number} actualWidth - Actual canvas width
 * @param {number} containerWidth - Container width
 * @param {number} currentPositionX - Current pan position
 * @returns {Object} Visible frequency range
 */
export const getVisibleFrequencyRange = (centerFrequency, sampleRate, actualWidth, containerWidth, currentPositionX) => {
    // When zoomed out (actualWidth < containerWidth), we see the full spectrum
    if (actualWidth <= containerWidth) {
        return {
            startFrequency: centerFrequency - sampleRate / 2,
            endFrequency: centerFrequency + sampleRate / 2,
            centerFrequency: centerFrequency,
            bandwidth: sampleRate
        };
    }

    // When zoomed in (actualWidth > containerWidth), calculate visible portion
    const zoomFactor = actualWidth / containerWidth;

    // Calculate the visible width as a fraction of the total zoomed width
    const visibleWidthRatio = containerWidth / actualWidth;

    // Calculate the pan offset as a fraction of the total zoomed width
    // currentPositionX is negative when panned right
    const panOffsetRatio = -currentPositionX / actualWidth;

    // Calculate start and end ratios, ensuring they stay within bounds
    const startRatio = Math.max(0, Math.min(1 - visibleWidthRatio, panOffsetRatio));
    const endRatio = Math.min(1, startRatio + visibleWidthRatio);

    // Calculate the full frequency range
    const fullStartFreq = centerFrequency - sampleRate / 2;
    const fullEndFreq = centerFrequency + sampleRate / 2;
    const fullFreqRange = fullEndFreq - fullStartFreq;

    // Calculate visible frequency range
    const visibleStartFreq = fullStartFreq + (startRatio * fullFreqRange);
    const visibleEndFreq = fullStartFreq + (endRatio * fullFreqRange);

    return {
        startFrequency: visibleStartFreq,
        endFrequency: visibleEndFreq,
        centerFrequency: (visibleStartFreq + visibleEndFreq) / 2,
        bandwidth: visibleEndFreq - visibleStartFreq
    };
};

/**
 * Format frequency to MHz with 3 decimal places
 * @param {number} freq - Frequency in Hz
 * @returns {string} Formatted frequency
 */
export const formatFrequency = (freq) => {
    return (freq / 1e6).toFixed(3);
};
