import React, { useEffect, useRef } from 'react';

const IQVisualizer = ({ samples, options }) => {
    const iQVisualCanvasRef = useRef(null);

    useEffect(() => {
        if (samples && iQVisualCanvasRef.current) {
            visualizeIQSamples(samples, iQVisualCanvasRef.current, options);
        }
    }, [samples, options]);

    return (
        <div className="iq-visualizer">
            <h3>IQ Visualization</h3>
            <canvas
                ref={iQVisualCanvasRef}
                width={400}
                height={400}
                style={{ background: 'black', borderRadius: '5px' }}
            />
            <div className="visualization-controls">
                <label>
                    <input
                        type="checkbox"
                        checked={options?.timeColors}
                        onChange={() => setOptions(prev => ({ ...prev, timeColors: !prev.timeColors }))}
                    />
                    Time Colors
                </label>
                {/* Add more controls for other options */}
            </div>
        </div>
    );
};

function visualizeIQSamples(samples, canvasElement, options = {}) {
    // Get canvas context
    const ctx = canvasElement.getContext('2d');
    const width = canvasElement.width;
    const height = canvasElement.height;
    
    // Default options
    const defaults = {
        maxPoints: 2000,        // Maximum points to plot
        persistence: 0.7,       // 0-1: higher values show more history
        timeColors: true,       // Color points based on time
        drawTrails: false,      // Connect points with lines
        autoScale: true,        // Automatically scale to fit
        scale: 100,             // Scale if autoScale is false
        drawVectors: false      // Draw vectors from origin to points
    };
    
    // Merge defaults with provided options
    const opts = {...defaults, ...options};
    
    // Clear canvas with persistence
    if (opts.persistence < 1) {
        ctx.fillStyle = `rgba(0, 0, 0, ${1 - opts.persistence})`;
        ctx.fillRect(0, 0, width, height);
    } else {
        // If full persistence, only clear once
        if (!canvasElement._initialized) {
            ctx.clearRect(0, 0, width, height);
            canvasElement._initialized = true;
        }
    }
    
    // Set up coordinate system with origin at center
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Determine scale based on data if autoScale is enabled
    let scale = opts.scale;
    if (opts.autoScale) {
        const maxMagnitude = Math.max(
            ...samples.real.map((r, i) => Math.sqrt(r*r + samples.imag[i]*samples.imag[i]))
        );
        scale = Math.min(width, height) / (2.5 * maxMagnitude);
    }
    
    // Draw axes
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();
    
    // Draw unit circle (0 dB reference)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, scale, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Number of samples to display
    const numSamples = Math.min(opts.maxPoints, samples.real.length);
    const step = Math.max(1, Math.floor(samples.real.length / numSamples));
    
    // Prepare for drawing trails if enabled
    if (opts.drawTrails) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 160, 255, 0.5)';
        ctx.lineWidth = 1.5;
    }
    
    // Draw samples
    for (let i = 0; i < numSamples; i++) {
        const idx = i * step;
        const x = centerX + samples.real[idx] * scale;
        const y = centerY - samples.imag[idx] * scale; // Negative because canvas Y is inverted
        
        // Draw trails if enabled
        if (opts.drawTrails) {
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        // Color based on time if enabled
        if (opts.timeColors) {
            const hue = (i / numSamples) * 360;
            ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.7)`;
        } else {
            ctx.fillStyle = 'rgba(0, 120, 255, 0.7)';
        }
        
        // Draw the point
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw vector from origin if enabled
        if (opts.drawVectors) {
            ctx.strokeStyle = `rgba(255, 255, 255, 0.1)`;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    }
    
    // Complete the trail if enabled
    if (opts.drawTrails) {
        ctx.stroke();
    }
    
    // Add magnitude and phase indicators for mouse position
    canvasElement.onmousemove = (e) => {
        const rect = canvasElement.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Convert to IQ coordinate system
        const i = (mouseX - centerX) / scale;
        const q = -(mouseY - centerY) / scale; // Invert Y axis
        
        // Calculate magnitude and phase
        const magnitude = Math.sqrt(i*i + q*q);
        const phase = Math.atan2(q, i) * 180 / Math.PI; // in degrees
        
        // Display near mouse pointer
        ctx.fillStyle = '#fff';
        ctx.font = '12px monospace';
        ctx.fillText(`I: ${i.toFixed(3)}`, mouseX + 10, mouseY - 20);
        ctx.fillText(`Q: ${q.toFixed(3)}`, mouseX + 10, mouseY - 5);
        ctx.fillText(`Mag: ${magnitude.toFixed(3)}`, mouseX + 10, mouseY + 10);
        ctx.fillText(`Phase: ${phase.toFixed(1)}°`, mouseX + 10, mouseY + 25);
    };
}

export default IQVisualizer;