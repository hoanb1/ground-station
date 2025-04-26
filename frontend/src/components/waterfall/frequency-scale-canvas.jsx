import React, { useRef, useEffect, useState } from 'react';
import { humanizeFrequency } from "../common/common.jsx";

const FrequencyScale = ({ centerFrequency, sampleRate, containerWidth }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [actualWidth, setActualWidth] = useState(containerWidth || 300);
    const lastMeasuredWidthRef = useRef(0);

    // Calculate start and end frequencies
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;

    // Active polling approach to measure the container size
    useEffect(() => {
        if (!containerRef.current) return;

        // Function to measure the actual rendered width
        const measureContainerWidth = () => {
            if (!containerRef.current) return;

            // Get the actual client dimensions of the element
            const rect = containerRef.current.getBoundingClientRect();

            // Only update if width has changed significantly (avoid unnecessary redraws)
            if (Math.abs(rect.width - lastMeasuredWidthRef.current) > 1) {
                if (rect.width > 0) {
                    lastMeasuredWidthRef.current = rect.width;
                    setActualWidth(rect.width);
                }
            }
        };

        // Measure immediately
        measureContainerWidth();

        // Set up polling interval for continuous measurement
        const pollInterval = setInterval(measureContainerWidth, 250);

        // Handle window resize events
        const handleResize = () => {
            measureContainerWidth();
        };
        window.addEventListener('resize', handleResize);

        // Clean up on unmount
        return () => {
            clearInterval(pollInterval);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    // Draw the frequency scale on the canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const height = 20;

        // Set canvas width based on actual measured width
        canvas.width = actualWidth;
        canvas.height = height;

        // Clear the canvas
        ctx.fillStyle = 'rgba(36, 36, 36, 1)';
        ctx.fillRect(0, 0, canvas.width, height);

        // Calculate frequency range and tick spacing
        const freqRange = endFreq - startFreq;

        // Adaptive tick spacing based on container width
        const minPixelsPerMajorTick = 110; // Minimum pixels between major ticks
        const targetMajorTickCount = Math.max(2, Math.min(Math.floor(actualWidth / minPixelsPerMajorTick), 16));

        const approxStepSize = freqRange / targetMajorTickCount;
        const magnitude = 10 ** Math.floor(Math.log10(approxStepSize));

        let tickStep;
        if (approxStepSize / magnitude < 1.5) {
            tickStep = magnitude;
        } else if (approxStepSize / magnitude < 3) {
            tickStep = 2 * magnitude;
        } else if (approxStepSize / magnitude < 7.5) {
            tickStep = 5 * magnitude;
        } else {
            tickStep = 10 * magnitude;
        }
        console.info(`Tick step: ${tickStep}`);

        // Calculate where the first tick should be (round up to the next nice number)
        const firstTick = Math.ceil(startFreq / tickStep) * tickStep;

        // Minor ticks (if space allows)
        const minorTicksPerMajor = actualWidth > 500 ? 5 : (actualWidth > 300 ? 2 : 0);
        const minorStep = minorTicksPerMajor > 0 ? tickStep / minorTicksPerMajor : 0;

        // Determine actual major ticks (might be different from target due to rounding)
        const majorTicks = [];
        for (let freq = firstTick; freq <= endFreq + tickStep/10; freq += tickStep) {
            if (freq >= startFreq - tickStep/10) {
                majorTicks.push(freq);
            }
        }

        // Only draw labels if we have at least one major tick
        if (majorTicks.length > 0) {
            // Calculate available space per label
            const actualPixelsPerTick = actualWidth / majorTicks.length;

            // Determine font size based on available space
            const fontSizeBase = actualWidth < 250 ? 8 : 10;
            ctx.font = `bold ${fontSizeBase}px monospace`;

            // Draw minor and major ticks
            for (let freq = firstTick - (minorTicksPerMajor > 0 ? minorStep : 0);
                 freq <= endFreq + tickStep/10; // Small buffer to ensure we include the last tick
                 freq += minorStep > 0 ? minorStep : tickStep) {

                if (freq < startFreq - tickStep/10) continue;

                const isMajor = Math.abs(Math.round(freq / tickStep) * tickStep - freq) < tickStep / 100;
                const x = ((freq - startFreq) / freqRange) * canvas.width;

                if (isMajor) {
                    // Draw a major tick
                    ctx.beginPath();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 1;
                    ctx.moveTo(x, height - 8);
                    ctx.lineTo(x, height);
                    ctx.stroke();

                    // Calculate text width for a frequency label
                    const freqText = humanizeFrequency(freq);
                    const textWidth = ctx.measureText(freqText).width;

                    // Only draw text if we have enough space (text width plus padding fits)
                    if (actualPixelsPerTick >= (textWidth + 10)) {
                        // Draw frequency label
                        ctx.fillStyle = 'white';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        ctx.fillText(freqText, x, 4);
                    }
                } else if (minorStep > 0) {
                    // Draw minor tick
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                    ctx.lineWidth = 1;
                    ctx.moveTo(x, height - 4);
                    ctx.lineTo(x, height);
                    ctx.stroke();
                }
            }
        }

        // Draw the center frequency label
        const centerFontSize = actualWidth < 250 ? 10 : 11;
        ctx.font = `bold ${centerFontSize}px monospace`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Draw background for center frequency
        const centerText = humanizeFrequency(centerFrequency);
        const centerTextWidth = ctx.measureText(centerText).width;
        const padding = 4;

    }, [centerFrequency, sampleRate, actualWidth]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '20px',
                position: 'relative',
            }}
        >
            <canvas
                ref={canvasRef}
                width={actualWidth}
                height={20}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(36, 36, 36, 1)',
                    touchAction: 'pan-y',
                }}
            />
        </div>
    );
};

export default FrequencyScale;