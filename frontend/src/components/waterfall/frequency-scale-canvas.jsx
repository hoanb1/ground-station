import React, { useRef, useEffect, useState } from 'react';
import { humanizeFrequency } from "../common/common.jsx";

const FrequencyScale = ({ centerFrequency, sampleRate, containerWidth }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [actualWidth, setActualWidth] = useState(containerWidth);

    // Calculate start and end frequencies
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;

    // Set up ResizeObserver to track container width changes
    useEffect(() => {
        if (!containerRef.current) return;

        // Create ResizeObserver instance
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Get the actual width of the container from the content rectangle
                const width = entry.contentRect.width;

                // Update the actual width state
                if (width > 0) {
                    setActualWidth(width);
                    console.log('Container size changed:', width);
                }
            }
        });

        // Start observing the container
        resizeObserver.observe(containerRef.current);

        // Clean up observer on component unmount
        return () => {
            resizeObserver.disconnect();
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
        // Calculate how many major ticks can fit well based on available space
        const minPixelsPerMajorTick = 180; // Minimum pixels between major ticks
        const targetMajorTickCount = Math.max(2, Math.min(Math.floor(actualWidth / minPixelsPerMajorTick), 8));

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
        const minorTicksPerMajor = actualWidth > 500 ? 5 : (actualWidth > 300 ? 2 : 0);
        const minorStep = minorTicksPerMajor > 0 ? tickStep / minorTicksPerMajor : 0;

        // Draw center frequency line
        // const centerX = canvas.width / 2;
        // ctx.beginPath();
        // ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        // ctx.lineWidth = 1;
        // ctx.moveTo(centerX, 0);
        // ctx.lineTo(centerX, height);
        // ctx.stroke();

        // Determine font size based on available space
        // Scale font size down a bit for very narrow containers
        const fontSizeBase = actualWidth < 250 ? 8 : 10;
        ctx.font = `${fontSizeBase}px monospace`;

        // Draw minor and major ticks
        for (let freq = firstTick - (minorTicksPerMajor > 0 ? minorStep : 0);
             freq <= endFreq + tickStep/10; // Small buffer to ensure we include the last tick
             freq += minorStep > 0 ? minorStep : tickStep) {

            if (freq < startFreq - tickStep/10) continue;

            const isMajor = Math.abs(Math.round(freq / tickStep) * tickStep - freq) < tickStep / 100;
            const x = ((freq - startFreq) / freqRange) * canvas.width;

            if (isMajor) {
                // Draw major tick
                ctx.beginPath();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1;
                ctx.moveTo(x, height - 8);
                ctx.lineTo(x, height);
                ctx.stroke();

                // Calculate text width for frequency label
                const freqText = humanizeFrequency(freq);
                const textWidth = ctx.measureText(freqText).width;

                // Calculate pixels available per tick based on actual major tick count
                const pixelsPerTick = actualWidth / targetMajorTickCount;

                // Only draw text if we have enough space (text width plus padding fits)
                if (pixelsPerTick >= (textWidth + 10)) {
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

        // Draw center frequency label
        const centerFontSize = actualWidth < 250 ? 10 : 11;
        ctx.font = `bold ${centerFontSize}px monospace`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Draw background for center frequency
        const centerText = humanizeFrequency(centerFrequency);
        const centerTextWidth = ctx.measureText(centerText).width;
        const padding = 4;

        //ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        //ctx.fillRect(
        //    centerX - centerTextWidth/2 - padding,
        //    2,
        //    centerTextWidth + padding * 2,
        //    16
        //);

        // Draw center frequency text
        //ctx.fillStyle = '#ffcc00';
        //ctx.fillText(centerText, centerX, 5);

    }, [centerFrequency, sampleRate, actualWidth]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '20px'
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
                    backgroundColor: 'rgba(36, 36, 36, 1)'
                }}
            />
        </div>
    );
};

export default FrequencyScale;