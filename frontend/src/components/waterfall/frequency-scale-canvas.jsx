import React, { useRef, useEffect, useState } from 'react';
import {humanizeFrequency, preciseHumanizeFrequency} from "../common/common.jsx";

const getFrequencyScaleWidth = (element) => {
    // Get the actual client dimensions of the element
    return element.current.getBoundingClientRect();
}


const FrequencyScale = ({ centerFrequency, sampleRate, containerWidth }) => {
    const canvasRef = useRef(null);
    const frequencyScaleContainerRef = useRef(null);
    const [actualWidth, setActualWidth] = useState(4096);
    const lastMeasuredWidthRef = useRef(0);

    // Calculate start and end frequencies
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;

    const updateActualWidth = () => {
        // Get the actual client dimensions of the element
        const rect = getFrequencyScaleWidth(frequencyScaleContainerRef);

        // Only update if the width has changed significantly (avoid unnecessary redraws)
        if (Math.abs(rect.width - lastMeasuredWidthRef.current) > 1) {
            if (rect.width > 0) {
                lastMeasuredWidthRef.current = rect.width;
                setActualWidth(rect.width);
            }
        }
    }

    useEffect(() => {
        const interval = setInterval(() => {
            updateActualWidth();
        }, 250);

        return () => {
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        updateActualWidth();
    }, [containerWidth]);

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

        // IMPROVED: More adaptive tick spacing based on container width
        // Decrease minPixelsPerMajorTick as actualWidth increases
        let minPixelsPerMajorTick;
        if (actualWidth > 1200) {
            minPixelsPerMajorTick = 90; // More ticks for very wide displays
        } else if (actualWidth > 800) {
            minPixelsPerMajorTick = 100; // Medium density for wider displays
        } else {
            minPixelsPerMajorTick = 110; // Original spacing for smaller displays
        }

        // Increase maximum number of ticks for larger displays
        const maxTicks = Math.max(16, Math.min(24, Math.floor(actualWidth / 200)));
        const targetMajorTickCount = Math.max(2, Math.min(Math.floor(actualWidth / minPixelsPerMajorTick), maxTicks));

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

        // Calculate where the first tick should be (round up to the next nice number)
        const firstTick = Math.ceil(startFreq / tickStep) * tickStep;

        // IMPROVED: Adaptive minor ticks based on width
        let minorTicksPerMajor;
        if (actualWidth > 1000) {
            minorTicksPerMajor = 20; // More detail for very wide displays
        } else if (actualWidth > 700) {
            minorTicksPerMajor = 10; // Original setting for medium displays
        } else if (actualWidth > 300) {
            minorTicksPerMajor = 5; // Fewer ticks for smaller displays
        } else {
            minorTicksPerMajor = 2; // No minor ticks for very small displays
        }

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
            // This sets how much space each label needs to be displayed
            const actualPixelsPerTick = actualWidth / majorTicks.length;

            // Determine font size based on available space
            const fontSizeBase = Math.min(12, Math.max(8, Math.floor(actualWidth / 100 + 8)));
            ctx.font = `bold ${fontSizeBase}px monospace`;

            // Draw minor and major ticks
            for (let freq = firstTick - (minorTicksPerMajor > 0 ? minorStep : 0);
                 freq <= endFreq + tickStep/10; // Small buffer to ensure we include the last tick
                 freq += minorStep > 0 ? minorStep : tickStep) {

                if (freq < startFreq - tickStep/10) continue;

                const isBigTick = Math.abs(Math.round(freq / tickStep) * tickStep - freq) < tickStep / 100;
                const x = ((freq - startFreq) / freqRange) * canvas.width;

                if (isBigTick) {
                    // Draw a big tick
                    ctx.beginPath();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 1;
                    ctx.moveTo(x, height - 8);
                    ctx.lineTo(x, height);
                    ctx.stroke();

                    // Draw frequency label
                    const freqText = humanizeFrequency(freq);
                    ctx.fillStyle = 'white';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(freqText, x, 4);

                } else if (minorStep > 0) {
                    // Draw minor tick
                    // IMPROVED: Allow some minor ticks to have labels when there's room
                    const isLabeledMinor = actualWidth > 1000 &&
                        (minorTicksPerMajor <= 5 || freq % (tickStep / 2) < minorStep / 2);

                    ctx.beginPath();
                    ctx.strokeStyle = isLabeledMinor
                        ? 'rgba(255, 255, 255, 0.7)'
                        : 'rgba(255, 255, 255, 0.4)';
                    ctx.lineWidth = 1;
                    ctx.moveTo(x, isLabeledMinor ? height - 6 : height - 4);
                    ctx.lineTo(x, height);
                    ctx.stroke();

                    // Draw some labels on important minor ticks when there's a lot of space
                    if (isLabeledMinor && actualWidth > 1800) {
                        const minorFreqText = preciseHumanizeFrequency(freq);
                        const minorTextWidth = ctx.measureText(minorFreqText).width;

                        if (actualPixelsPerTick / (minorTicksPerMajor / 2) >= (minorTextWidth + 30)) {
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'top';
                            ctx.font = `bold ${fontSizeBase - 1}px monospace`;
                            ctx.fillText(minorFreqText, x, 4);
                        }
                    }
                }
            }
        }

    }, [centerFrequency, sampleRate, actualWidth]);

    return (
        <div
            ref={frequencyScaleContainerRef}
            style={{
                width: '100%',
                height: '20px',
                position: 'relative',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
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