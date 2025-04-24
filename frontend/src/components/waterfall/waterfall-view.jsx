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
    ButtonGroup,
    Stack,
} from '@mui/material';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {useDispatch, useSelector} from "react-redux";
import {
    getClassNamesBasedOnGridEditing,
    humanizeFrequency,
    humanizeNumber,
    TitleBar,
    WaterfallStatusBar
} from "../common/common.jsx";
import { IconButton } from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import HeightIcon from '@mui/icons-material/Height';
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
    setTargetFPS,
    setIsPlaying,
    setSettingsDialogOpen,
    setGridEditable,
} from './waterfall-slice.jsx'
import WaterFallSettingsDialog from "./waterfall-dialog.jsx";
import {enqueueSnackbar} from "notistack";

const MainWaterfallDisplay = React.memo(({deviceId = 0}) => {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const waterFallCanvasRef = useRef(null);
    const canvasDataRef = useRef(null);
    const waterfallDataRef = useRef([]);
    const animationFrameRef = useRef(null);
    const visualSettingsRef = useRef({
        dbRange: [-120, -20],
        colorMap: 'magma',
    });
    const colorCache = useRef(new Map());

    const lastFrameTimeRef = useRef(0);
    
    // Add state for tracking metrics
    const [eventMetrics, setEventMetrics] = useState({
        eventsPerSecond: 0,
        binsPerSecond: 0
    });
    
    // Add refs for tracking event count and bin count
    const eventCountRef = useRef(0);
    const binCountRef = useRef(0);
    const lastMetricUpdateRef = useRef(Date.now());

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
        autoDBRange,
        gridEditable
    } = useSelector((state) => state.waterfall);
    const targetFPSRef = useRef(targetFPS);
    const [scrollFactor, setScrollFactor] = useState(1);
    const accumulatedRowsRef = useRef(0);

    const cancelWaterfallAnimation = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    }

    // Update the ref whenever the Redux state changes
    useEffect(() => {
        targetFPSRef.current = targetFPS;
    }, [targetFPS]);

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

    socket.on('disconnect', () => {
        cancelWaterfallAnimation();
        dispatch(setIsStreaming(false));
    });

    socket.on('sdr-error', (error) => {
        cancelWaterfallAnimation();
        dispatch(setErrorMessage(error.message || 'Failed to connect to RTL-SDR'));
        dispatch(setIsStreaming(false));
        enqueueSnackbar(`Failed to connect to SDR: ${error.message}`, {
            variant: 'error'
        });
    });

    socket.on('sdr-status', (data) => {
        console.info(`sdr-status`, data);
    })

    socket.on('sdr-fft-data', (data) => {
        // Add new FFT data to the waterfall buffer
        waterfallDataRef.current.unshift(data);

        // Keep only the most recent rows based on canvas height
        if (waterFallCanvasRef.current && waterfallDataRef.current.length > waterFallCanvasRef.current.height) {
            waterfallDataRef.current = waterfallDataRef.current.slice(0, waterFallCanvasRef.current.height);
        }
    });

    return () => {
        // Clean up waterfall animation
        cancelWaterfallAnimation();

        // Clean up socket listeners
        socket.off('sdr-error');
        socket.off('sdr-fft-data');
        socket.off('sdr-status');
    };

    }, []);

    useEffect(() => {
        // If we are streaming, configure RTL-SDR settings
        if (isStreaming) {
            socket.emit('sdr_data', 'configure-rtlsdr', {
                deviceId,
                centerFrequency,
                sampleRate,
                gain,
                fftSize
            });
        }
    }, [centerFrequency, sampleRate, fftSize, gain]);
    
    const startStreaming = () => {
        if (!isStreaming) {
            dispatch(setErrorMessage(''));
            // Configure RTL-SDR settings
            socket.emit('sdr_data', 'configure-rtlsdr', {
                deviceId,
                centerFrequency,
                sampleRate,
                gain,
                fftSize
            });

            socket.emit('sdr_data', 'start-streaming');
            dispatch(setIsStreaming(true));

            // Start the rendering loop
            renderLoop();
        }
    };

    const stopStreaming = () => {
        if (isStreaming) {
            socket.emit('sdr_data', 'stop-streaming');
            dispatch(setIsStreaming(false));
            cancelWaterfallAnimation();
        }
    };

    function renderLoop(timestamp) {
        // Limit to targetFPSRef.current
        if (!lastFrameTimeRef.current || timestamp - lastFrameTimeRef.current >= 1000 / targetFPSRef.current) {
            drawWaterfall();
            lastFrameTimeRef.current = timestamp;
        }

        animationFrameRef.current = requestAnimationFrame(renderLoop);
    }

    // Auto-scale the color range based on the recent FFT data
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
        min = Math.floor(min + 5);
        max = Math.ceil(Math.max(max + 1, 0));

        dispatch(setDbRange([min, max]));
    };

    // Call this periodically, for example:
    useEffect(() => {
        let interval;

        if (isStreaming && autoDBRange) {
            interval = setInterval(() => {
                autoScaleDbRange();
            }, 1000); // Update every second
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [isStreaming, autoDBRange]);
    
    function drawWaterfall() {
        const canvas = waterFallCanvasRef.current;
        if (!canvas || waterfallDataRef.current.length === 0) {
            return;
        }

        accumulatedRowsRef.current += 1;

        // Only scroll the waterfall when we've accumulated enough rows
        if (accumulatedRowsRef.current >= scrollFactor) {
            accumulatedRowsRef.current = 0;

            const ctx = canvas.getContext('2d');

            // Move existing pixels DOWN (instead of up)
            // This line shifts the existing content downward
            ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height - 1, 0, 1, canvas.width, canvas.height - 1);

            // Get imageData for the new row only
            const imageData = ctx.createImageData(canvas.width, 1);
            const data = imageData.data;

            // Only scroll the waterfall when we've accumulated enough rows
            if (waterfallDataRef.current.length > 0) {
                const fftRow = waterfallDataRef.current[0];

                // Calculate a scaling factor to fit all frequency bins to canvas width
                const skipFactor = fftRow.length / canvas.width;

                // Write directly to pixel data (much faster than fillRect)
                for (let x = 0; x < canvas.width; x++) {
                    // Map canvas pixel to the appropriate FFT bin using scaling
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
            //drawFrequencyScale(ctx, canvas.width, centerFrequency, sampleRate);
        }
    }


    // Get color based on power level and selected color map
    const getColorForPower = (powerDb, mapName, [minDb, maxDb]) => {
        // Round the power value to reduce cache size (e.g., to the nearest 0.5 dB)
        const roundedPower = Math.round(powerDb * 2) / 2;

        // Create a cache key
        const cacheKey = `${roundedPower}-${mapName}-${minDb}-${maxDb}`;

        // Check if this color is already cached
        if (colorCache.current.has(cacheKey)) {
            return colorCache.current.get(cacheKey);
        }

        // If not in cache, calculate the color
        const normalizedValue = Math.max(0, Math.min(1, (roundedPower - minDb) / (maxDb - minDb)));

        // apply selected color map
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

            case 'websdr':
                // Custom WebSDR colormap with blue -> purple -> magenta -> yellow
                let websdrRGB;
                if (normalizedValue < 0.25) {
                    // Dark blue to medium blue for very weak signals
                    const factor = normalizedValue / 0.25;
                    websdrRGB = {
                        r: 20 + Math.floor(factor * 40),
                        g: 20 + Math.floor(factor * 50),
                        b: 80 + Math.floor(factor * 100)
                    };
                } else if (normalizedValue < 0.5) {
                    // Medium blue to purple transition
                    const factor = (normalizedValue - 0.25) / 0.25;
                    websdrRGB = {
                        r: 60 + Math.floor(factor * 80),
                        g: 70 - Math.floor(factor * 20),
                        b: 180 + Math.floor(factor * 75)
                    };
                } else if (normalizedValue < 0.7) {
                    // Purple to bright magenta
                    const factor = (normalizedValue - 0.5) / 0.2;
                    websdrRGB = {
                        r: 140 + Math.floor(factor * 115),
                        g: 50 + Math.floor(factor * 40),
                        b: 255 - Math.floor(factor * 50)
                    };
                } else if (normalizedValue < 0.85) {
                    // Magenta to gold transition
                    const factor = (normalizedValue - 0.7) / 0.15;
                    websdrRGB = {
                        r: 255,
                        g: 90 + Math.floor(factor * 165),
                        b: 205 - Math.floor(factor * 205)
                    };
                } else {
                    // Gold to bright yellow for strongest signals
                    const factor = (normalizedValue - 0.85) / 0.15;
                    websdrRGB = {
                        r: 255,
                        g: 255,
                        b: Math.floor(factor * 130)
                    };
                }
                colorCache.current.set(cacheKey, websdrRGB);
                return websdrRGB;

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

            case 'cosmic':
                // Custom cosmic colormap with dark purple to yellow gradient based on provided colors
                // #070208 -> #100b56 -> #170d87 -> #7400cd -> #cb5cff -> #f9f9ae
                let cosmicRGB;
                if (normalizedValue < 0.2) {
                    // #070208 to #100b56
                    const factor = normalizedValue / 0.2;
                    cosmicRGB = {
                        r: 7 + Math.floor(factor * 9),
                        g: 2 + Math.floor(factor * 9),
                        b: 8 + Math.floor(factor * 78)
                    };
                } else if (normalizedValue < 0.4) {
                    // #100b56 to #170d87
                    const factor = (normalizedValue - 0.2) / 0.2;
                    cosmicRGB = {
                        r: 16 + Math.floor(factor * 7),
                        g: 11 + Math.floor(factor * 2),
                        b: 86 + Math.floor(factor * 49)
                    };
                } else if (normalizedValue < 0.6) {
                    // #170d87 to #7400cd
                    const factor = (normalizedValue - 0.4) / 0.2;
                    cosmicRGB = {
                        r: 23 + Math.floor(factor * 93),
                        g: 13 + Math.floor(factor * 0),
                        b: 135 + Math.floor(factor * 70)
                    };
                } else if (normalizedValue < 0.8) {
                    // #7400cd to #cb5cff
                    const factor = (normalizedValue - 0.6) / 0.2;
                    cosmicRGB = {
                        r: 116 + Math.floor(factor * 87),
                        g: 0 + Math.floor(factor * 92),
                        b: 205 + Math.floor(factor * 50)
                    };
                } else {
                    // #cb5cff to #f9f9ae
                    const factor = (normalizedValue - 0.8) / 0.2;
                    cosmicRGB = {
                        r: 203 + Math.floor(factor * 46),
                        g: 92 + Math.floor(factor * 167),
                        b: 255 - Math.floor(factor * 81)
                    };
                }

                colorCache.current.set(cacheKey, cosmicRGB);
                return cosmicRGB;

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

    // Effect to update the metrics every second
    useEffect(() => {
        const metricsInterval = setInterval(() => {
            const now = Date.now();
            const elapsedSeconds = (now - lastMetricUpdateRef.current) / 1000;
            
            if (elapsedSeconds > 0) {
                setEventMetrics({
                    eventsPerSecond: Math.round(eventCountRef.current / elapsedSeconds),
                    binsPerSecond: Math.round(binCountRef.current / elapsedSeconds)
                });
                
                // Reset counters
                eventCountRef.current = 0;
                binCountRef.current = 0;
                lastMetricUpdateRef.current = now;
            }
        }, 1000); // Update metrics every second
        
        return () => {
            clearInterval(metricsInterval);
        };
    }, []);

    // Update the sdr-fft-data event handler to count events and bins
    useEffect(() => {
        // ... your other socket event handlers

        socket.on('sdr-fft-data', (data) => {
            // Increment event counter
            eventCountRef.current += 1;
            
            // Add bin count (assume data is an array where each element is an FFT bin)
            binCountRef.current += data.length;
            
            // Your existing code
            waterfallDataRef.current.unshift(data);
            
            // Keep only the most recent rows based on canvas height
            if (waterFallCanvasRef.current && waterfallDataRef.current.length > waterFallCanvasRef.current.height) {
                waterfallDataRef.current = waterfallDataRef.current.slice(0, waterFallCanvasRef.current.height);
            }
        });

        return () => {
            // Clean up waterfall animation
            cancelWaterfallAnimation();
            
            // Clean up socket listeners
            socket.off('sdr-error');
            socket.off('sdr-fft-data');
            socket.off('sdr-status');
        };
    }, []);

    // Update your return statement to display the metrics
    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Waterfall</TitleBar>
            <Box
                sx={{
                    display: 'flex',
                    gap: 1,
                    justifyContent: 'left',
                    flexWrap: 'wrap'
                }}
            >
                <Paper elevation={3} sx={{p: 0, display: 'inline-block', width: '100%', }}>
                    <ButtonGroup variant="contained" size="small">
                        {/* Your existing buttons */}
                        <Button
                            startIcon={<PlayArrowIcon/>}
                            disabled={isStreaming}
                            color="primary"
                            onClick={startStreaming}
                        >
                            Start
                        </Button>
                        <Button
                            startIcon={<StopIcon/>}
                            disabled={!isStreaming}
                            color="primary"
                            onClick={stopStreaming}
                        >
                            Stop
                        </Button>
                        <Button
                            startIcon={<HeightIcon/>}
                            disabled={!isStreaming}
                            color="secondary"
                            onClick={autoScaleDbRange}
                        >
                            Auto Range
                        </Button>
                        <Button
                            startIcon={<SettingsIcon/>}
                            color="primary"
                            onClick={() => dispatch(setSettingsDialogOpen(true))}
                        >
                            Settings
                        </Button>
                    </ButtonGroup>
                    

                </Paper>
            </Box>
            
            <Box
                sx={{
                    width: '100%',
                    height: '100%',
                    bgcolor: 'black',
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 1
                }}
            >
                <TransformWrapper
                    limitToBounds={true}
                    disablePadding={true}
                    panning={{
                        disabled: true,
                        wheelPanning: false,
                        disabledAxisY: true,
                    }}
                    initialScale={1}
                    initialPositionX={0}
                    initialPositionY={0}
                    minScale={1}
                    maxScale={10}
                    wheel={{ step: 0.1 }}
                >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            <Box sx={{ 
                                position: 'absolute', 
                                top: 10, 
                                right: 10, 
                                zIndex: 10,
                                backgroundColor: 'rgba(0,0,0,0.5)',
                                borderRadius: '4px',
                                padding: '4px'
                            }}>
                                <ButtonGroup orientation="vertical" size="small">
                                    <IconButton onClick={() => zoomIn()} sx={{ color: 'white' }}>
                                        <ZoomInIcon />
                                    </IconButton>
                                    <IconButton onClick={() => zoomOut()} sx={{ color: 'white' }}>
                                        <ZoomOutIcon />
                                    </IconButton>
                                    <IconButton onClick={() => resetTransform()} sx={{ color: 'white' }}>
                                        <RestartAltIcon />
                                    </IconButton>
                                </ButtonGroup>
                            </Box>
                            <TransformComponent>
                                <div style={{position: 'relative', width: '100%', height: '100%'}}>
                                    <canvas
                                        ref={waterFallCanvasRef}
                                        width={2048}
                                        height={2000}
                                        style={{ width: '100%', height: '100%' }}
                                    />
                                </div>
                            </TransformComponent>
                        </>
                    )}
                </TransformWrapper>
            </Box>
            <WaterfallStatusBar>{errorMessage? <Typography color="error" variant="body2" sx={{ mb: 2 }}>
                Error: {errorMessage}
            </Typography>: isStreaming? `events/s: ${humanizeNumber(eventMetrics.eventsPerSecond)}, bins/s: ${humanizeNumber(eventMetrics.binsPerSecond)}, f: ${humanizeFrequency(centerFrequency)}, sr: ${humanizeFrequency(sampleRate)}, g: ${gain} dB`: `stopped`}


            </WaterfallStatusBar>

            <WaterFallSettingsDialog/>
        </>
    );
});

export default MainWaterfallDisplay;