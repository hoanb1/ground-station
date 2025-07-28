
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Box, Typography, Paper } from '@mui/material';
import { setVFOProperty } from './waterfall-slice.jsx';

const RotaryEncoder = ({
                           vfoNumber,
                           size = 200,
                           sensitivity = 1.0,
                           showFrequency = false,
                           style = {}
                       }) => {
    const dispatch = useDispatch();
    const { vfoMarkers, vfoActive } = useSelector(state => state.waterfall);

    const [isDragging, setIsDragging] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [lastAngle, setLastAngle] = useState(0);
    const containerRef = useRef(null);
    const lastTouchRef = useRef({ x: 0, y: 0 });
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const rotationAccumulator = useRef(0);

    // Get current VFO data based on the provided vfoNumber
    const currentVFO = vfoNumber && vfoMarkers[vfoNumber] ? vfoMarkers[vfoNumber] : null;
    const isVFOActive = vfoNumber && vfoActive[vfoNumber];
    const stepSize = currentVFO?.stepSize || 1000; // Default 1kHz step
    const currentFrequency = currentVFO?.frequency || 0;

    // Format frequency for display
    const formatFrequency = (freq) => {
        if (freq >= 1e6) {
            return `${(freq / 1e6).toFixed(3)} MHz`;
        } else if (freq >= 1e3) {
            return `${(freq / 1e3).toFixed(1)} kHz`;
        } else {
            return `${freq} Hz`;
        }
    };

    // Calculate angle from center point
    const calculateAngle = useCallback((x, y, centerX, centerY) => {
        const deltaX = x - centerX;
        const deltaY = y - centerY;
        return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    }, []);

    // Get center coordinates of the container
    const getCenter = useCallback(() => {
        if (!containerRef.current) return { x: size / 2, y: size / 2 };
        const rect = containerRef.current.getBoundingClientRect();
        return {
            x: rect.width / 2,
            y: rect.height / 2
        };
    }, [size]);

    // Handle frequency change based on rotation
    const handleFrequencyChange = useCallback((angleDelta) => {
        if (!currentVFO || !vfoNumber || !isVFOActive) return;

        // Accumulate small rotations to prevent loss of precision
        rotationAccumulator.current += angleDelta;

        // Only apply changes when we've accumulated enough rotation
        const threshold = 5; // degrees
        if (Math.abs(rotationAccumulator.current) >= threshold) {
            const steps = Math.round(rotationAccumulator.current / threshold);
            const frequencyChange = steps * stepSize * sensitivity;

            const newFrequency = Math.round(currentFrequency + frequencyChange);

            dispatch(setVFOProperty({
                vfoNumber: vfoNumber,
                updates: { frequency: newFrequency }
            }));

            // Reset accumulator after applying change
            rotationAccumulator.current = 0;
        }
    }, [currentVFO, vfoNumber, isVFOActive, stepSize, sensitivity, currentFrequency, dispatch]);

    // Mouse event handlers
    const handleMouseDown = useCallback((e) => {
        if (!isVFOActive) return; // Don't allow interaction if VFO is not active

        e.preventDefault();
        const rect = containerRef.current.getBoundingClientRect();
        const center = getCenter();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setIsDragging(true);
        setLastAngle(calculateAngle(x, y, center.x, center.y));
        lastMouseRef.current = { x, y };
    }, [isVFOActive, getCenter, calculateAngle]);

    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;

        e.preventDefault();
        const rect = containerRef.current.getBoundingClientRect();
        const center = getCenter();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const currentAngle = calculateAngle(x, y, center.x, center.y);
        let angleDelta = currentAngle - lastAngle;

        // Handle angle wraparound
        if (angleDelta > 180) angleDelta -= 360;
        if (angleDelta < -180) angleDelta += 360;

        setRotation(prev => prev + angleDelta);
        handleFrequencyChange(angleDelta);
        setLastAngle(currentAngle);
    }, [isDragging, getCenter, calculateAngle, lastAngle, handleFrequencyChange]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        rotationAccumulator.current = 0;
    }, []);

    // Touch event handlers
    const handleTouchStart = useCallback((e) => {
        if (!isVFOActive) return; // Don't allow interaction if VFO is not active

        e.preventDefault();
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        const rect = containerRef.current.getBoundingClientRect();
        const center = getCenter();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        setIsDragging(true);
        setLastAngle(calculateAngle(x, y, center.x, center.y));
        lastTouchRef.current = { x, y };
    }, [isVFOActive, getCenter, calculateAngle]);

    const handleTouchMove = useCallback((e) => {
        if (!isDragging || e.touches.length !== 1) return;

        e.preventDefault();
        const touch = e.touches[0];
        const rect = containerRef.current.getBoundingClientRect();
        const center = getCenter();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        const currentAngle = calculateAngle(x, y, center.x, center.y);
        let angleDelta = currentAngle - lastAngle;

        // Handle angle wraparound
        if (angleDelta > 180) angleDelta -= 360;
        if (angleDelta < -180) angleDelta += 360;

        setRotation(prev => prev + angleDelta);
        handleFrequencyChange(angleDelta);
        setLastAngle(currentAngle);
    }, [isDragging, getCenter, calculateAngle, lastAngle, handleFrequencyChange]);

    const handleTouchEnd = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        rotationAccumulator.current = 0;
    }, []);

    // Global event listeners for drag operations
    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('touchend', handleTouchEnd);

            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', handleTouchEnd);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

    // Show visual feedback when VFO is inactive
    const isDisabled = !currentVFO || !isVFOActive;

    return (
        <Box
            elevation={1}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                color: '#fff',
                opacity: isDisabled ? 0.5 : 1,
                ...style
            }}
        >
            {showFrequency && currentVFO && (
                <Box sx={{ mb: 1, textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ color: '#aaa' }}>
                        VFO {vfoNumber} - Step: {stepSize >= 1000 ? `${stepSize/1000}kHz` : `${stepSize}Hz`}
                    </Typography>
                    <Typography variant="h6" sx={{ fontFamily: 'monospace', color: currentVFO.color }}>
                        {formatFrequency(currentFrequency)}
                    </Typography>
                </Box>
            )}

            <Box
                ref={containerRef}
                sx={{
                    position: 'relative',
                    width: size,
                    height: size,
                    cursor: isDisabled ? 'not-allowed' : (isDragging ? 'grabbing' : 'grab'),
                    userSelect: 'none',
                    touchAction: 'none'
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
            >
                {/* Outer ring */}
                <svg
                    width={size}
                    height={size}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0
                    }}
                >
                    {/* Inner dial face */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={size * 0.48}
                        fill={isDisabled ? "#0a0a0a" : "#1a1a1a"}
                        stroke={isDisabled ? "#222" : "#333"}
                        strokeWidth="2"
                    />

                    {/* Larger thumb pit indicator - moved closer to edge */}
                    <g transform={`rotate(${rotation}  ${size / 2} ${size / 2})`}>
                        {/* Thumb pit - positioned closer to edge */}
                        <circle
                            cx={size / 2}
                            cy={size * 0.25}
                            r={size * 0.12}
                            fill={isDisabled ? '#0a0a0a' : '#111'}
                            stroke={isDisabled ? '#333' : '#555'}
                            strokeWidth="1"
                        />
                        {/* Inner shadow effect for the pit */}
                        <circle
                            cx={size / 2}
                            cy={size * 0.25}
                            r={size * 0.08}
                            fill={isDisabled ? '#050505' : '#080808'}
                        />
                        {/* Innermost darker area */}
                        <circle
                            cx={size / 2}
                            cy={size * 0.25}
                            r={size * 0.06}
                            fill={isDisabled ? '#030303' : '#060606'}
                        />
                    </g>
                </svg>

                {/* Knurled edge effect */}
                <Box
                    sx={{
                        position: 'relative',
                        top: '4%',
                        left: '4%',
                        width: '92%',
                        height: '92%',
                        borderRadius: '50%',
                        background: `
                            radial-gradient(circle at center, 
                                rgba(255,255,255,${isDisabled ? '0.05' : '0.1'}) 0%, 
                                rgba(255,255,255,${isDisabled ? '0.02' : '0.05'}) 40%, 
                                rgba(0,0,0,0.3) 100%
                            )
                        `,
                        pointerEvents: 'none'
                    }}
                />
            </Box>

            {!currentVFO && (
                <Typography variant="caption" sx={{ mt: 1, color: '#777', textAlign: 'center' }}>
                    VFO {vfoNumber} not configured
                </Typography>
            )}

        </Box>
    );
};

export default RotaryEncoder;