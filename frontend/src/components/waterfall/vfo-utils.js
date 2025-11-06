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

        if (mode === 'USB' || mode === 'CW') {
            ctx.moveTo(rightEdgeX, 0);
            ctx.lineTo(rightEdgeX, height);
        } else if (mode === 'LSB') {
            ctx.moveTo(leftEdgeX, 0);
            ctx.lineTo(leftEdgeX, height);
        } else {
            // Draw both edges for AM, FM, etc.
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

    drawVFOLabel: (ctx, centerX, labelText, color, opacity, isSelected) => {
        ctx.font = '12px Monospace';
        const textMetrics = ctx.measureText(labelText);

        // Add extra width for speaker icon (16px icon + 4px left padding + 8px right padding)
        const iconWidth = 28;
        const labelWidth = textMetrics.width + 10 + iconWidth;
        const labelHeight = 14;

        // Draw background
        ctx.fillStyle = `${color}${opacity}`;
        ctx.beginPath();
        ctx.roundRect(centerX - labelWidth / 2, 5, labelWidth, labelHeight, 2);
        ctx.fill();

        // Draw text (shifted left to make room for icon with padding)
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        const textOffset = -10;
        ctx.fillText(labelText, centerX + textOffset, 16);

        // Draw speaker icon (selected or muted) - scaled up by 1.5x
        // Position icon with more padding on the right side
        const iconX = centerX + (labelWidth / 2) - 20;
        const iconY = 7;

        if (isSelected) {
            // Draw active speaker icon
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
            // Draw muted speaker icon (with X) - scaled up
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
    }
};

/**
 * Get the icon width constant used in label calculations
 */
export const getVFOLabelIconWidth = () => 28;
