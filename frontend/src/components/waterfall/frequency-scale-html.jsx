import React, {useMemo, useEffect, useCallback, useRef} from 'react';
import {humanizeFrequency} from "../common/common.jsx";

const FrequencyScaleHtml = ({centerFrequency, sampleRate, containerWidth}) => {
    const containerRef = useRef(null);
    const resizeObserver = useRef(null);

    // Calculate start and end frequencies 
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;
    const freqRange = endFreq - startFreq;

    // Calculate a nice rounded step size based on frequency range and container width
    const {ticks, majorTicks, tickStep} = useMemo(() => {
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

        // Calculate where the first tick should be (round up to the next nice number)
        const firstTick = Math.ceil(startFreq / tickStep) * tickStep;

        // Generate all ticks
        const ticks = [];
        const majorTicks = [];

        // Minor ticks (if space allows)
        const minorTicksPerMajor = containerWidth > 400 ? 5 : (containerWidth > 250 ? 2 : 0);
        const minorStep = minorTicksPerMajor > 0 ? tickStep / minorTicksPerMajor : 0;

        // Add minor and major ticks
        for (let freq = firstTick - (minorTicksPerMajor > 0 ? minorStep : 0);
             freq <= endFreq + tickStep / 10; // Small buffer to ensure we include the last tick
             freq += minorStep > 0 ? minorStep : tickStep) {

            if (freq < startFreq - tickStep / 10) continue;

            const isMajor = Math.abs(Math.round(freq / tickStep) * tickStep - freq) < tickStep / 100;

            if (isMajor) {
                majorTicks.push({
                    frequency: freq,
                    position: ((freq - startFreq) / freqRange) * 100,
                    label: humanizeFrequency(freq)
                });
            } else if (minorStep > 0) {
                ticks.push({
                    frequency: freq,
                    position: ((freq - startFreq) / freqRange) * 100
                });
            }
        }

        return {ticks, majorTicks, tickStep};
    }, [startFreq, endFreq, freqRange, containerWidth]);

    const handleResize = useCallback((entries) => {
        const [entry] = entries;
        if (entry && entry.contentRect) {
            console.log('Container size changed:', entry.contentRect);
        }
    }, []);

    useEffect(() => {
        if (containerRef.current) {
            resizeObserver.current = new ResizeObserver(handleResize);
            resizeObserver.current.observe(containerRef.current);
        }

        return () => {
            if (resizeObserver.current) {
                resizeObserver.current.disconnect();
            }
        };
    }, [handleResize]);

    return (
        <div ref={containerRef} style={{
            position: 'relative',
            width: '100%',
            height: '20px',
            backgroundColor: 'rgba(36, 36, 36, 1)',
            overflow: 'hidden',
            userSelect: 'none'
        }}>
            {/* Minor ticks */}
            {ticks.map((tick, index) => (
                <div key={`minor-${index}`} style={{
                    position: 'absolute',
                    left: `${tick.position}%`,
                    bottom: '0px',
                    height: '4px',
                    width: '1px',
                    backgroundColor: 'rgba(255, 255, 255, 0.4)',
                    marginLeft: '-0.5px'
                }}/>
            ))}

            {/* Major ticks with labels */}
            {majorTicks.map((tick, index) => (
                <React.Fragment key={`major-${index}`}>
                    {/* Tick mark */}
                    <div style={{
                        position: 'absolute',
                        left: `${tick.position}%`,
                        bottom: '0px',
                        height: '8px',
                        width: '1px',
                        backgroundColor: 'white',
                        marginLeft: '-0.5px'
                    }}/>

                    {/* Label with a fixed span and fixed width */}
                    <span style={{
                        position: 'absolute',
                        left: `${tick.position}%`,
                        top: '2px',
                        marginLeft: '-25px', /* Half of the fixed width */
                        display: 'inline-block',
                        width: '50px',
                        color: 'white',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        textShadow: '0px 0px 2px black',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        textAlign: 'center',
                        padding: '0 2px',
                        borderRadius: '2px',
                        zIndex: 2
                    }}>
                        {tick.label}
                    </span>
                </React.Fragment>
            ))}
        </div>
    );
};

export default FrequencyScaleHtml;