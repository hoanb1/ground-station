import React, { useRef, useEffect } from 'react';
import { humanizeFrequency } from "../common/common.jsx";

const FrequencyScale = ({ centerFrequency, sampleRate, containerWidth }) => {
    const canvasRef = useRef(null);

    // Calculate start and end frequencies
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;

    // Draw the frequency scale on the canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const height = 20;

        // Set canvas width based on container
        canvas.width = containerWidth;
        canvas.height = height;

        // Clear the canvas
        ctx.fillStyle = 'rgba(36, 36, 36, 1)';
        ctx.fillRect(0, 0, canvas.width, height);

        // Calculate frequency range and tick spacing
        const freqRange = endFreq - startFreq;

        // Determine a good tick step size
        const targetMajorTickCount = Math.max(3, Math.floor(containerWidth / 220));
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
        const centerX = canvas.width / 2;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.stroke();

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

                // Draw frequency label
                ctx.font = '10px monospace';
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(humanizeFrequency(freq), x, 2);
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
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#ffcc00';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Draw background for center frequency
        const centerText = humanizeFrequency(centerFrequency);
        const centerTextWidth = ctx.measureText(centerText).width;
        const padding = 4;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(
            centerX - centerTextWidth/2 - padding,
            2,
            centerTextWidth + padding * 2,
            16
        );

        // Draw center frequency text
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(centerText, centerX, 2);

    }, [centerFrequency, sampleRate, containerWidth]);

    return (
        <canvas
            ref={canvasRef}
            width={containerWidth}
            height={20}
            style={{
                display: 'block',
                width: '100%',
                height: '20px',
                backgroundColor: 'rgba(36, 36, 36, 1)'
            }}
        />
    );
};

export default FrequencyScale;