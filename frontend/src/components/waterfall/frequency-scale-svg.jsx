import React, { useEffect, useRef } from 'react';
import { humanizeFrequency } from "../common/common.jsx";

const FrequencyScale = ({ centerFrequency, sampleRate, containerWidth }) => {
    const containerRef = useRef(null);

    // Calculate start and end frequencies
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;
    const freqRange = endFreq - startFreq;

    useEffect(() => {
        if (!containerRef.current || !containerWidth) return;

        // Clear all existing content
        const container = containerRef.current;
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        // Aim for a major tick roughly every 100-150px
        const targetMajorTickCount = Math.max(3, Math.floor(containerWidth / 220));

        // Find a "nice" step size (1, 2, 5, 10, 20, 50, 100, etc.)
        const approxStepSize = freqRange / targetMajorTickCount;
        const magnitude = 10 ** Math.floor(Math.log10(approxStepSize));
        let tickStep;

        if (approxStepSize / magnitude < 1.5) tickStep = magnitude;
        else if (approxStepSize / magnitude < 3) tickStep = 2 * magnitude;
        else if (approxStepSize / magnitude < 7.5) tickStep = 5 * magnitude;
        else tickStep = 10 * magnitude;

        // Calculate where the first tick should be (round up to next nice number)
        const firstTick = Math.ceil(startFreq / tickStep) * tickStep;

        // Minor ticks (if space allows)
        const minorTicksPerMajor = containerWidth > 400 ? 5 : (containerWidth > 250 ? 2 : 0);
        const minorStep = minorTicksPerMajor > 0 ? tickStep / minorTicksPerMajor : 0;

        // Draw center frequency line
        const centerLine = document.createElement('div');
        centerLine.style.position = 'absolute';
        centerLine.style.top = '0px';
        centerLine.style.left = '50%';
        centerLine.style.height = '20px';
        centerLine.style.width = '1px';
        centerLine.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
        centerLine.style.zIndex = '3';
        centerLine.style.transform = 'translateX(-50%)';
        container.appendChild(centerLine);

        // Draw ticks and labels
        for (let freq = firstTick - (minorTicksPerMajor > 0 ? minorStep : 0);
             freq <= endFreq + tickStep/10; // Small buffer to ensure we include the last tick
             freq += minorStep > 0 ? minorStep : tickStep) {

            if (freq < startFreq - tickStep/10) continue;

            const isMajor = Math.abs(Math.round(freq / tickStep) * tickStep - freq) < tickStep / 100;
            const position = ((freq - startFreq) / freqRange) * 100; // As percentage

            const tick = document.createElement('div');
            tick.style.position = 'absolute';
            tick.style.bottom = '0px';
            tick.style.left = `${position}%`;
            tick.style.transform = 'translateX(-50%)';

            if (isMajor) {
                tick.style.height = '8px';
                tick.style.width = '1px';
                tick.style.backgroundColor = 'white';

                // Add label for major ticks
                const label = document.createElement('div');
                label.style.position = 'absolute';
                label.style.top = '2px';
                label.style.left = `${position}%`;
                label.style.transform = 'translateX(-50%)';
                label.style.color = 'white';
                label.style.fontSize = '10px';
                label.style.fontFamily = 'monospace';
                label.style.textShadow = '0px 0px 2px black';
                label.style.whiteSpace = 'nowrap';
                label.style.pointerEvents = 'none';
                label.style.zIndex = '2';
                label.textContent = humanizeFrequency(freq);
                container.appendChild(label);
            } else {
                tick.style.height = '4px';
                tick.style.width = '1px';
                tick.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
            }

            container.appendChild(tick);
        }

        // Draw center frequency label
        const centerLabel = document.createElement('div');
        centerLabel.style.position = 'absolute';
        centerLabel.style.top = '2px';
        centerLabel.style.left = '50%';
        centerLabel.style.transform = 'translateX(-50%)';
        centerLabel.style.color = '#ffcc00';
        centerLabel.style.fontSize = '11px';
        centerLabel.style.fontFamily = 'monospace';
        centerLabel.style.fontWeight = 'bold';
        centerLabel.style.textShadow = '0px 0px 3px black';
        centerLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        centerLabel.style.padding = '0 4px';
        centerLabel.style.borderRadius = '3px';
        centerLabel.style.zIndex = '4';
        centerLabel.style.whiteSpace = 'nowrap';
        centerLabel.style.pointerEvents = 'none';
        centerLabel.textContent = humanizeFrequency(centerFrequency);
        container.appendChild(centerLabel);

    }, [centerFrequency, sampleRate, containerWidth]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                height: '20px',
                backgroundColor: 'rgba(36, 36, 36, 1)',
                overflow: 'hidden',
                contain: 'layout paint style',
                isolation: 'isolate'
            }}
        />
    );
};

export default FrequencyScale;