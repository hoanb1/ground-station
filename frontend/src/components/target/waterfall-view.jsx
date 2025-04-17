import React, { useEffect, useRef, useState } from 'react';
import {
    Box,
    Typography,
    Paper,
    CircularProgress,
    Slider,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Button,
    ButtonGroup
} from '@mui/material';
import {useDispatch, useSelector} from "react-redux";
import {getClassNamesBasedOnGridEditing, TitleBar} from "../common/common.jsx";
import { IconButton } from '@mui/material';

import StopIcon from '@mui/icons-material/Stop';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import {useSocket} from "../common/socket.jsx";
import {
    setColorMap,
    setColorMaps,
    setDbRange,
    setFFTSize,
    setFFTSizeOptions,
    setGain,
    setSampleRate,
    setCenterFrequency,
    setErrorMessage,
    setIsStreaming,
    setIsConnected,
    setTargetFPS,
    setIsPlaying, setSettingsDialogOpen,
} from './waterfall-slice.jsx'
import WaterFallSettingsDialog from "./waterfall-dialog.jsx";
import IQVisualizer from "./iq-visualizer.jsx";

const WaterfallDisplay = ({deviceId = 0}) => {
    const dispatch = useDispatch();
    const waterFallCanvasRef = useRef(null);
    const visualIQCanvasRef = useRef(null);
    const { socket } = useSocket();
    const waterfallDataRef = useRef([]);
    const animationFrameRef = useRef(null);
    const visualSettingsRef = useRef({
        dbRange: [-120, -20],
        colorMap: 'magma',
    });
    const colorCache = useRef(new Map());
    const lastFrameTimeRef = useRef(0);

    const {
        colorMap,
        colorMaps,
        dbRange,
        fftSizeOptions,
        fftSize,
        gain,
        sampleRate,
        centerFrequency,
        errorMessage,
        isStreaming,
        isConnected,
        targetFPS,
        isPlaying,
    } = useSelector((state) => state.waterfall);
    const {gridEditable} = useSelector((state) => state.targetSatTrack);
    const [samples, setSamples] = useState([]);

    // Effect to sync state to the ref
    useEffect(() => {
        visualSettingsRef.current.dbRange = dbRange;
        visualSettingsRef.current.colorMap = colorMap;
    }, [dbRange, colorMap]);


    useEffect(() => {
        // Initialize canvas
        if (waterFallCanvasRef.current) {
            const canvas = waterFallCanvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        if (socket.connected) {
            dispatch(setIsConnected(true));
            console.log('Connected to RTLSDR server');
        } else {
            console.warn("Can't connect to RTLSDR server. Make sure it's running and the server is accessible from this machine.")
        }

        socket.on('disconnect', () => {
            dispatch(setIsConnected(false));
            dispatch(setIsStreaming(false));
            setErrorMessage('Disconnected from RTLSDR server');
        });

        socket.on('error', (error) => {
            dispatch(setErrorMessage(error.message || 'Failed to connect to RTL-SDR'));
            dispatch(setIsStreaming(false));
        });

        socket.on('fftData', (data) => {
            // Add new FFT data to the waterfall buffer
            setSamples(data);
            waterfallDataRef.current.unshift(data);

            // Keep only the most recent rows based on canvas height
            if (waterFallCanvasRef.current && waterfallDataRef.current.length > waterFallCanvasRef.current.height) {
                waterfallDataRef.current = waterfallDataRef.current.slice(0, waterFallCanvasRef.current.height);
            }
        });

        return () => {
            // Clean up
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);


    const startStreaming = () => {
        if (isConnected && !isStreaming) {
            // Configure RTL-SDR settings
            socket.emit('configure_rtlsdr', {
                deviceId,
                centerFrequency,
                sampleRate,
                gain,
                fftSize
            });

            socket.emit('start_streaming');
            dispatch(setIsStreaming(true));

            // Start the rendering loop
            renderLoop();
        }
    };


    const stopStreaming = () => {
        if (isStreaming) {
            socket.emit('stop_streaming');
            dispatch(setIsStreaming(false));
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        }
    };


    function renderLoop(timestamp) {
        // Limit to targetFPS
        if (!lastFrameTimeRef.current || timestamp - lastFrameTimeRef.current >= 1000 / targetFPS) {
            drawWaterfall();
            lastFrameTimeRef.current = timestamp;
        }

        animationFrameRef.current = requestAnimationFrame(renderLoop);
    }


    // Add this function to your component
    const autoScaleDbRange = () => {
        if (waterfallDataRef.current.length === 0) return;

        // Find min and max values in recent data
        let min = Infinity;
        let max = -Infinity;

        // Look at the last 10 frames (or however many you want)
        const samplesToCheck = Math.min(10, waterfallDataRef.current.length);

        for (let i = 0; i < samplesToCheck; i++) {
            const row = waterfallDataRef.current[i];
            for (let j = 0; j < row.length; j++) {
                min = Math.min(min, row[j]);
                max = Math.max(max, row[j]);
            }
        }

        // Add some padding to the range
        min = Math.floor(min);
        max = Math.ceil(max);

        dispatch(setDbRange([min, max]));
    };


    // Call this periodically, for example:
    useEffect(() => {
        if (isStreaming) {
            const interval = setInterval(autoScaleDbRange, 1000); // Update every second
            return () => clearInterval(interval);
        }
    }, [isStreaming]);


    function drawWaterfall() {
        const canvas = waterFallCanvasRef.current;
        if (!canvas) {
            return;
        }

        const ctx = canvas.getContext('2d');

        // Move existing pixels DOWN (instead of up)
        // This line shifts the existing content downward
        ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height - 1, 0, 1, canvas.width, canvas.height - 1);

        // Get imageData for the new row only
        const imageData = ctx.createImageData(canvas.width, 1);
        const data = imageData.data;

        // Only process the newest FFT data (first row in your array)
        if (waterfallDataRef.current.length > 0) {
            const fftRow = waterfallDataRef.current[0];

            // Calculate scaling factor to fit all frequency bins to canvas width
            const skipFactor = fftRow.length / canvas.width;

            // Write directly to pixel data (much faster than fillRect)
            for (let x = 0; x < canvas.width; x++) {
                // Map canvas pixel to appropriate FFT bin using scaling
                const fftIndex = Math.min(Math.floor(x * skipFactor), fftRow.length - 1);
                const amplitude = fftRow[fftIndex];

                const rgb = getColorForPower(amplitude, visualSettingsRef.current.colorMap, visualSettingsRef.current.dbRange);

                // Each pixel uses 4 array positions (r,g,b,a)
                const pixelIndex = x * 4;
                data[pixelIndex] = rgb.r;     // R
                data[pixelIndex + 1] = rgb.g; // G
                data[pixelIndex + 2] = rgb.b; // B
                data[pixelIndex + 3] = 255;   // Alpha (fully opaque)
            }

            // Put the new row at the TOP of the canvas (instead of bottom)
            ctx.putImageData(imageData, 0, 0);
        }
    }


    // Get color based on power level and selected color map
    const getColorForPower = (powerDb, mapName, [minDb, maxDb]) => {
        // Round the power value to reduce cache size (e.g., to nearest 0.5 dB)
        const roundedPower = Math.round(powerDb * 2) / 2;

        // Create a cache key
        const cacheKey = `${roundedPower}-${mapName}-${minDb}-${maxDb}`;

        // Check if this color is already cached
        if (colorCache.current.has(cacheKey)) {
            return colorCache.current.get(cacheKey);
        }

        // If not in cache, calculate the color
        const normalizedValue = Math.max(0, Math.min(1, (roundedPower - minDb) / (maxDb - minDb)));

        // Apply selected color map
        switch (mapName) {
            case 'viridis':
                const viridisRGB = {
                    r: Math.floor(70 + 180 * normalizedValue),
                    g: Math.floor(normalizedValue < 0.5 ? 70 + 180 * normalizedValue * 2 : 250 - 80 * (normalizedValue - 0.5) * 2),
                    b: Math.floor(normalizedValue < 0.5 ? 130 + 120 * normalizedValue * 2 : 250 - 200 * (normalizedValue - 0.5) * 2)
                };
                colorCache.current.set(cacheKey, viridisRGB);
                return viridisRGB;
            case 'plasma':
                const plasmaRGB = {
                    r: Math.floor(20 + 230 * normalizedValue),
                    g: Math.floor(normalizedValue < 0.7 ? 20 + 180 * normalizedValue / 0.7 : 200 - 150 * (normalizedValue - 0.7) / 0.3),
                    b: Math.floor(normalizedValue < 0.5 ? 120 + 80 * normalizedValue / 0.5 : 200 - 200 * (normalizedValue - 0.5) / 0.5)
                };
                colorCache.current.set(cacheKey, plasmaRGB);
                return plasmaRGB;
            case 'inferno':
                const infernoRGB = {
                    r: Math.floor(normalizedValue < 0.5 ? 20 + 200 * normalizedValue / 0.5 : 220 + 35 * (normalizedValue - 0.5) / 0.5),
                    g: Math.floor(normalizedValue < 0.7 ? 10 + 120 * normalizedValue / 0.7 : 130 - 30 * (normalizedValue - 0.7) / 0.3),
                    b: Math.floor(normalizedValue < 0.3 ? 40 + 80 * normalizedValue / 0.3 : 120 - 120 * (normalizedValue - 0.3) / 0.7)
                };
                colorCache.current.set(cacheKey, infernoRGB);
                return infernoRGB;
            case 'magma':
                const magmaRGB = {
                    r: Math.floor(normalizedValue < 0.6 ? 30 + 170 * normalizedValue / 0.6 : 200 + 55 * (normalizedValue - 0.6) / 0.4),
                    g: Math.floor(normalizedValue < 0.7 ? 10 + 140 * normalizedValue / 0.7 : 150 + 50 * (normalizedValue - 0.7) / 0.3),
                    b: Math.floor(normalizedValue < 0.4 ? 100 + 70 * normalizedValue / 0.4 : 170 - 70 * (normalizedValue - 0.4) / 0.6)
                };
                colorCache.current.set(cacheKey, magmaRGB);
                return magmaRGB;

            case 'jet':
                // Classic jet colormap (blue -> cyan -> green -> yellow -> red)
                let jetRGB;
                if (normalizedValue < 0.125) {
                    jetRGB = { r: 0, g: 0, b: Math.floor(normalizedValue * 8 * 255) };
                } else if (normalizedValue < 0.375) {
                    jetRGB = { r: 0, g: Math.floor((normalizedValue - 0.125) * 4 * 255), b: 255 };
                } else if (normalizedValue < 0.625) {
                    jetRGB = { r: Math.floor((normalizedValue - 0.375) * 4 * 255), g: 255, b: Math.floor(255 - (normalizedValue - 0.375) * 4 * 255) };
                } else if (normalizedValue < 0.875) {
                    jetRGB = { r: 255, g: Math.floor(255 - (normalizedValue - 0.625) * 4 * 255), b: 0 };
                } else {
                    jetRGB = { r: Math.floor(255 - (normalizedValue - 0.875) * 8 * 255), g: 0, b: 0 };
                }

                colorCache.current.set(cacheKey, jetRGB);
                return jetRGB;

            default:
                // Default grayscale
                const intensity = Math.floor(normalizedValue * 255);
                const greyRGB = { r: intensity, g: intensity, b: intensity };
                colorCache.current.set(cacheKey, greyRGB);
                return greyRGB;
        }
    };


    // Draw frequency scale along the top
    const drawFrequencyScale = (ctx, width, centerFreq, sRate) => {
        const startFreq = centerFreq - sRate / 2;
        const endFreq = centerFreq + sRate / 2;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, 20);

        ctx.font = '10px Arial';
        ctx.fillStyle = 'white';

        // Draw center frequency
        ctx.textAlign = 'center';
        ctx.fillText(`${(centerFreq / 1e6).toFixed(3)} MHz`, width / 2, 12);

        // Draw start and end frequencies
        ctx.textAlign = 'left';
        ctx.fillText(`${(startFreq / 1e6).toFixed(3)} MHz`, 5, 12);

        ctx.textAlign = 'right';
        ctx.fillText(`${(endFreq / 1e6).toFixed(3)} MHz`, width - 5, 12);
    };

    return (
        <>
        <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Waterfall</TitleBar>
            {errorMessage && (
                <Typography color="error" variant="body2" sx={{ mb: 2 }}>
                    Error: {errorMessage}
                </Typography>
            )}
            <Box
                sx={{
                    display: 'flex',
                    gap: 1,
                    justifyContent: 'left',
                    flexWrap: 'wrap'
                }}
            >
                <Paper elevation={3} sx={{p: 0, display: 'inline-block', width: '100%', }}>
                    <ButtonGroup variant="filled" aria-label="Basic button group" sx={{borderRadius: 0}}>
                        <Button disabled={isStreaming}>
                            <PlayArrowIcon onClick={startStreaming}/>
                        </Button>
                        <Button disabled={!isStreaming}>
                            <StopIcon onClick={stopStreaming}/>
                        </Button>
                        <Button>
                            <SettingsIcon onClick={() => dispatch(setSettingsDialogOpen(true))}/>
                        </Button>
                    </ButtonGroup>
                </Paper>
            </Box>
            <Box
                sx={{
                    width: '100%',
                    height: '400px',
                    bgcolor: 'black',
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 1
                }}
            >
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <canvas
                        ref={waterFallCanvasRef}
                        width={800}
                        height={400}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>

            </Box>
            <WaterFallSettingsDialog/>
        </>
    );
};

export default WaterfallDisplay;