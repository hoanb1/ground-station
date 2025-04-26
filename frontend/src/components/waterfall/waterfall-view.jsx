import React, {useEffect, useRef, useState, useCallback} from 'react';
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
    Divider,
} from '@mui/material';
import {TransformWrapper, TransformComponent} from "react-zoom-pan-pinch";
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
import {IconButton} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
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
    setBiasT,
    setTunerAgc,
    setRtlAgc,
} from './waterfall-slice.jsx'
import WaterFallSettingsDialog from "./waterfall-dialog.jsx";
import {enqueueSnackbar} from "notistack";


const MainWaterfallDisplay = React.memo(({deviceId = 0}) => {
    const {socket} = useSocket();
    const dispatch = useDispatch();
    const waterFallCanvasRef = useRef(null);
    const bandscopeCanvasRef = useRef(null); // New ref for bandscope canvas
    const dBAxisScopeCanvasRef = useRef(null);
    const frequencyBarScopeCanvasRef = useRef(null);
    const waterFallLeftMarginCanvasRef = useRef(null);
    const waterfallDataRef = useRef(new Array(1000).fill(-120));
    const animationFrameRef = useRef(null);
    const bandscopeAnimationFrameRef = useRef(null); // New ref for bandscope animation
    const visualSettingsRef = useRef({
        dbRange: [-120, 30],
        colorMap: 'magma',
        fftSize: 1024,
        sampleRate: 2000000,
        centerFrequency: 1000000000,
    });
    const colorCache = useRef(new Map());

    const lastFrameTimeRef = useRef(0);
    const lastBandscopeFrameTimeRef = useRef(0); // New ref for bandscope timing

    // Add state for tracking metrics
    const [eventMetrics, setEventMetrics] = useState({
        eventsPerSecond: 0,
        binsPerSecond: 0
    });

    // Add refs for tracking event count and bin count
    const eventCountRef = useRef(0);
    const binCountRef = useRef(0);
    const lastMetricUpdateRef = useRef(Date.now());
    const lastTimestampRef = useRef(null);
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
        gridEditable,
        biasT,
        tunerAgc,
        rtlAgc,
        fftWindow,
    } = useSelector((state) => state.waterfall);
    const targetFPSRef = useRef(targetFPS);
    const [scrollFactor, setScrollFactor] = useState(1);
    const accumulatedRowsRef = useRef(0);
    const [waterfallCanvasWidth, setWaterfallCanvasWidth] = useState(4096);
    const [bandscopeAxisYWidth, setBandscopeAxisYWidth] = useState(60);

    const cancelAnimations = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (bandscopeAnimationFrameRef.current) {
            cancelAnimationFrame(bandscopeAnimationFrameRef.current);
            bandscopeAnimationFrameRef.current = null;
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
        visualSettingsRef.current.sampleRate = sampleRate;
        visualSettingsRef.current.centerFrequency = centerFrequency;

    }, [dbRange, colorMap, centerFrequency, sampleRate]);

    useEffect(() => {
        // Initialize canvases
        if (waterFallCanvasRef.current) {
            const canvas = waterFallCanvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        if (bandscopeCanvasRef.current) {
            const canvas = bandscopeCanvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        socket.on('disconnect', () => {
            cancelAnimations();
            dispatch(setIsStreaming(false));
        });

        socket.on('sdr-error', (error) => {
            cancelAnimations();
            dispatch(setErrorMessage(error.message || 'Failed to connect to RTL-SDR'));
            dispatch(setIsStreaming(false));
            enqueueSnackbar(`Failed to connect to SDR: ${error.message}`, {
                variant: 'error'
            });
        });

        socket.on('sdr-status', (data) => {
            console.info(`sdr-status`, data);
        });

        socket.on('sdr-fft-data', (data) => {
            // Add new FFT data to the waterfall buffer
            waterfallDataRef.current.unshift(data);

            // Keep only the most recent rows based on canvas height
            if (waterFallCanvasRef.current && waterfallDataRef.current.length > waterFallCanvasRef.current.height) {
                waterfallDataRef.current = waterfallDataRef.current.slice(0, waterFallCanvasRef.current.height);
            }
        });

        drawBandscope();

        return () => {
            // Clean up animations
            cancelAnimations();

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
                fftSize,
                biasT,
                tunerAgc,
                rtlAgc,
                fftWindow,
            });
        }
    }, [centerFrequency, sampleRate, fftSize, gain, biasT, rtlAgc, tunerAgc, fftWindow]);

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
        socket.on('sdr-fft-data', (data) => {
            // Increment event counter
            eventCountRef.current += 1;

            // Add bin count
            binCountRef.current += data.length;

            // Your existing code
            waterfallDataRef.current.unshift(data);

            // Keep only the most recent rows based on canvas height
            if (waterFallCanvasRef.current && waterfallDataRef.current.length > waterFallCanvasRef.current.height) {
                waterfallDataRef.current = waterfallDataRef.current.slice(0, waterFallCanvasRef.current.height);
            }
        });

        return () => {
            cancelAnimations();
            socket.off('sdr-error');
            socket.off('sdr-fft-data');
            socket.off('sdr-status');
        };
    }, []);

    const startStreaming = () => {
        if (!isStreaming) {
            dispatch(setErrorMessage(''));
            // Configure RTL-SDR settings
            socket.emit('sdr_data', 'configure-rtlsdr', {
                deviceId,
                centerFrequency,
                sampleRate,
                gain,
                fftSize,
                biasT,
                tunerAgc,
                rtlAgc,
            });

            socket.emit('sdr_data', 'start-streaming');
            dispatch(setIsStreaming(true));

            // Start both rendering loops
            renderWaterfallLoop();
            renderBandscopeLoop();
        }
    };

    const stopStreaming = () => {
        if (isStreaming) {
            socket.emit('sdr_data', 'stop-streaming');
            dispatch(setIsStreaming(false));
            cancelAnimations();
        }
    };

    function renderWaterfallLoop(timestamp) {
        // Limit to targetFPSRef.current
        if (!lastFrameTimeRef.current || timestamp - lastFrameTimeRef.current >= 1000 / targetFPSRef.current) {
            drawWaterfall();
            lastFrameTimeRef.current = timestamp;
        }

        animationFrameRef.current = requestAnimationFrame(renderWaterfallLoop);
    }

    function renderBandscopeLoop(timestamp) {
        // Limit to targetFPSRef.current
        if (!lastBandscopeFrameTimeRef.current || timestamp - lastBandscopeFrameTimeRef.current >= 1000 / targetFPSRef.current) {
            drawBandscope();
            lastBandscopeFrameTimeRef.current = timestamp;
        }

        bandscopeAnimationFrameRef.current = requestAnimationFrame(renderBandscopeLoop);
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
        min = Math.floor(min);
        //max = Math.ceil(Math.max(max + 1, 0));
        max = Math.ceil(max);

        dispatch(setDbRange([min, max]));
    };

    function drawWaterfall() {
        const waterFallCanvas = waterFallCanvasRef.current;
        const waterFallLeftMarginCanvas = waterFallLeftMarginCanvasRef.current;

        if (!waterFallCanvas || waterfallDataRef.current.length === 0) {
            return;
        }

        accumulatedRowsRef.current += 1;

        // Only scroll the waterfall when we've accumulated enough rows
        if (accumulatedRowsRef.current >= scrollFactor) {
            accumulatedRowsRef.current = 0;

            const waterFallCtx = waterFallCanvas.getContext('2d');
            const waterFallLeftMarginCtx = waterFallLeftMarginCanvas.getContext('2d');

            // Move existing pixels DOWN (instead of up)
            waterFallCtx.drawImage(waterFallCanvas, 0, 0, waterFallCanvas.width, waterFallCanvas.height - 1, 0, 1, waterFallCanvas.width, waterFallCanvas.height - 1);

            // Get imageData for the new row only
            const imageData = waterFallCtx.createImageData(waterFallCanvas.width, 1);
            const data = imageData.data;

            if (waterfallDataRef.current.length > 0) {
                const fftRow = waterfallDataRef.current[0];

                // Calculate a scaling factor to fit all frequency bins to the available width
                const skipFactor = fftRow.length / (waterFallCanvas.width);

                // For each pixel position in the display width
                for (let x = 0; x < waterFallCanvas.width; x++) {
                    // Map canvas pixel to the appropriate FFT bin using scaling
                    const fftIndex = Math.min(Math.floor(x * skipFactor), fftRow.length - 1);
                    const amplitude = fftRow[fftIndex];

                    const rgb = getColorForPower(amplitude, visualSettingsRef.current.colorMap, visualSettingsRef.current.dbRange);

                    // Calculate position in the image data array
                    const pixelIndex = x * 4;
                    data[pixelIndex] = rgb.r;     // R
                    data[pixelIndex + 1] = rgb.g; // G
                    data[pixelIndex + 2] = rgb.b; // B
                    data[pixelIndex + 3] = 255;   // Alpha
                }

                // Put the new row at the TOP of the canvas
                waterFallCtx.putImageData(imageData, 0, 0);
            }
            updateWaterfallLeftMargin();
        }
    }


    function updateWaterfallLeftMargin() {
        if (!waterFallLeftMarginCanvasRef.current) return;

        const waterFallLeftMarginCanvas = waterFallLeftMarginCanvasRef.current;
        const waterFallLeftMarginCtx = waterFallLeftMarginCanvas.getContext('2d');

        // This part should run on EVERY frame, not just when minutes change
        // Move existing pixels DOWN by 1 pixel
        waterFallLeftMarginCtx.drawImage(
            waterFallLeftMarginCanvas,
            0, 0,
            waterFallLeftMarginCanvas.width, waterFallLeftMarginCanvas.height - 1,
            0, 1,
            waterFallLeftMarginCanvas.width, waterFallLeftMarginCanvas.height - 1
        );

        // Fill the top row with the background color
        waterFallLeftMarginCtx.fillStyle = 'rgba(28, 28, 28, 1)';
        waterFallLeftMarginCtx.fillRect(0, 0, waterFallLeftMarginCanvas.width, 1);

        const now = new Date();

        // Only update the timestamp itself when minutes change
        if (!lastTimestampRef.current ||
            now.getMinutes() !== lastTimestampRef.current.getMinutes() ||
            now.getHours() !== lastTimestampRef.current.getHours()) {

            // Format the time as HH:MM
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const timeString = `${hours}:${minutes}`;

            // Draw a more visible background for the timestamp
            waterFallLeftMarginCtx.fillStyle = 'rgba(28, 28, 28, 1)';
            waterFallLeftMarginCtx.fillRect(0, 0, bandscopeAxisYWidth, 14);

            // Draw the time text
            waterFallLeftMarginCtx.font = '12px monospace';
            waterFallLeftMarginCtx.fillStyle = 'rgba(255, 255, 255, 1)';
            waterFallLeftMarginCtx.textAlign = 'center';
            waterFallLeftMarginCtx.textBaseline = 'top';
            waterFallLeftMarginCtx.fillText(timeString, bandscopeAxisYWidth / 2, 2);

            // Update the last timestamp reference
            lastTimestampRef.current = now;
        }
    }


    function drawBandscope() {
        const bandScopeCanvas = bandscopeCanvasRef.current;
        const dBAxisCanvas = dBAxisScopeCanvasRef.current;

        if (!bandScopeCanvas || waterfallDataRef.current.length === 0) {
             return;
        }

        const bandScopeCtx = bandScopeCanvas.getContext('2d');
        const dBAxisCtx = dBAxisCanvas.getContext('2d');


        const width = bandScopeCanvas.width;
        const height = bandScopeCanvas.height;

        // Clear the canvas
        bandScopeCtx.fillStyle = 'black';
        bandScopeCtx.fillRect(0, 0, width, height);

        const [minDb, maxDb] = visualSettingsRef.current.dbRange;

        // Draw dB marks and labels
        bandScopeCtx.fillStyle = 'white';
        bandScopeCtx.font = '12px Monospace';
        bandScopeCtx.textAlign = 'right';

        // Calculate step size based on range
        const dbRange = maxDb - minDb;
        const steps = Math.min(6, dbRange); // Maximum 10 steps
        const stepSize = Math.ceil(dbRange / steps);

        for (let db = Math.ceil(minDb / stepSize) * stepSize; db <= maxDb; db += stepSize) {
            const y = height - ((db - minDb) / (maxDb - minDb)) * height;

            // Draw a horizontal dotted grid line
            bandScopeCtx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
            bandScopeCtx.setLineDash([2, 2]);
            bandScopeCtx.beginPath();
            bandScopeCtx.moveTo(0, y);
            bandScopeCtx.lineTo(width, y);
            bandScopeCtx.stroke();
            bandScopeCtx.setLineDash([]);
        }

        // Get the most recent FFT data
        const fftData = waterfallDataRef.current[0];

        // Draw the dB axis (y-axis)
        drawDbAxis(dBAxisCtx, width, height, visualSettingsRef.current.dbRange);

        // Draw the FFT data as a line graph
        drawFftLine(bandScopeCtx, fftData, width, height, visualSettingsRef.current.dbRange);
    }

    // Helper function to draw the dB axis
    function drawDbAxis(ctx, width, height, [minDb, maxDb]) {

        // Draw background for the axis area
        ctx.fillStyle = 'rgba(40, 40, 40, 0.7)';
        ctx.fillRect(0, 0, bandscopeAxisYWidth, height);

        // Draw vertical line to separate axis from the plot
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
        ctx.beginPath();
        ctx.moveTo(bandscopeAxisYWidth, 0);
        ctx.lineTo(bandscopeAxisYWidth, height);
        ctx.stroke();

        // Draw dB marks and labels
        ctx.fillStyle = 'white';
        ctx.font = '12px Monospace';
        ctx.textAlign = 'right';

        // Calculate step size based on range
        const dbRange = maxDb - minDb;
        const steps = Math.min(6, dbRange); // Maximum 10 steps
        const stepSize = Math.ceil(dbRange / steps);

        for (let db = Math.ceil(minDb / stepSize) * stepSize; db <= maxDb; db += stepSize) {
            const y = height - ((db - minDb) / (maxDb - minDb)) * height;

            // Draw a horizontal dotted grid line
            ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(bandscopeAxisYWidth, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw label
            ctx.fillText(`${db} dB`, bandscopeAxisYWidth - 5, y + 3);
        }

        // Draw frequency scale at the bottom
        const frequencyBarScopeCanvas = frequencyBarScopeCanvasRef.current;
        const frequencyBarScopeCtx = frequencyBarScopeCanvas.getContext('2d');
        drawFrequencyScale(frequencyBarScopeCtx, frequencyBarScopeCanvas.width);
    }

    // Helper function to draw the FFT data as a line
    function drawFftLine(ctx, fftData, width, height, [minDb, maxDb]) {
        const graphWidth = width;
        const skipFactor = fftData.length / graphWidth;

        // Get the current colormap from settings
        const currentColorMap = visualSettingsRef.current.colorMap;

        // Generate line color based on a "hot" point in the colormap (e.g., 80% intensity)
        // This gives a color that's representative of the colormap
        const lineColorPoint = 0.8; // Use 80% intensity for the line
        const lineRgb = getColorForPower(
            minDb + (maxDb - minDb) * lineColorPoint,
            currentColorMap,
            [minDb, maxDb]
        );

        // Create line color with proper opacity
        const lineColor = `rgba(${lineRgb.r}, ${lineRgb.g}, ${lineRgb.b}, 0.8)`;

        // Generate fill color based on the same colormap but with lower intensity
        const fillColorPoint = 0.7; // Use 50% intensity for fill base color
        const fillRgb = getColorForPower(
            minDb + (maxDb - minDb) * fillColorPoint,
            currentColorMap,
            [minDb, maxDb]
        );

        // Create fill color with low opacity
        const fillColor = `rgba(${fillRgb.r}, ${fillRgb.g}, ${fillRgb.b}, 0.3)`;

        // Set line style with generated color
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Draw the line path
        for (let x = 0; x < graphWidth; x++) {
            // Map canvas pixel to the appropriate FFT bin using scaling
            const fftIndex = Math.min(Math.floor(x * skipFactor), fftData.length - 1);
            const amplitude = fftData[fftIndex];

            // Normalize amplitude to canvas height using dB range
            const normalizedValue = Math.max(0, Math.min(1, (amplitude - minDb) / (maxDb - minDb)));
            const y = height - (normalizedValue * height);

            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        // Draw the line
        ctx.stroke();

        // Add fill below the line using the generated fill color
        ctx.fillStyle = fillColor;
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.fill();
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
                    jetRGB = {r: 0, g: 0, b: Math.floor(normalizedValue * 8 * 255)};
                } else if (normalizedValue < 0.375) {
                    jetRGB = {r: 0, g: Math.floor((normalizedValue - 0.125) * 4 * 255), b: 255};
                } else if (normalizedValue < 0.625) {
                    jetRGB = {
                        r: Math.floor((normalizedValue - 0.375) * 4 * 255),
                        g: 255,
                        b: Math.floor(255 - (normalizedValue - 0.375) * 4 * 255)
                    };
                } else if (normalizedValue < 0.875) {
                    jetRGB = {r: 255, g: Math.floor(255 - (normalizedValue - 0.625) * 4 * 255), b: 0};
                } else {
                    jetRGB = {r: Math.floor(255 - (normalizedValue - 0.875) * 8 * 255), g: 0, b: 0};
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

            case 'greyscale':
                // Default grayscale
                const intensity = Math.floor(normalizedValue * 255);
                const greyRGB = {r: intensity, g: intensity, b: intensity};
                colorCache.current.set(cacheKey, greyRGB);
                return greyRGB;
        }
    }

    // Draw frequency scale along the bottom
    const drawFrequencyScale = (ctx, width) => {
        const startFreq = visualSettingsRef.current.centerFrequency - visualSettingsRef.current.sampleRate / 2;
        const endFreq = visualSettingsRef.current.centerFrequency + visualSettingsRef.current.sampleRate / 2;
        const freqRange = endFreq - startFreq;

        const height = 25; // Height of the frequency scale area
        const tickHeight = 10; // Height of the frequency tick marks

        // Draw background for scale
        ctx.fillStyle = 'rgba(40, 40, 40, 0.7)';
        ctx.fillRect(0, ctx.canvas.height - height, width, height);

        // Calculate the appropriate interval for tick marks
        // We want roughly 8-12 tick marks across the width for readability
        const availableWidth = width;
        const targetTickCount = 10;

        // Calculate an interval in Hz based on frequency range
        let interval = freqRange / targetTickCount;

        // Round to a nice number (1, 2, or 5 × 10^n)
        const magnitude = Math.pow(10, Math.floor(Math.log10(interval)));
        const normalized = interval / magnitude;

        if (normalized < 1.5) interval = magnitude;
        else if (normalized < 3.5) interval = 2 * magnitude;
        else if (normalized < 7.5) interval = 5 * magnitude;
        else interval = 10 * magnitude;

        // Calculate the first tick position (round up to the nearest interval)
        const firstTick = Math.ceil(startFreq / interval) * interval;

        // Draw the tick marks and labels
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.7)';
        ctx.lineWidth = 1;
        ctx.fillStyle = 'white';
        ctx.font = '13px Monospace'; // Smaller font for tick labels
        ctx.textAlign = 'center';

        for (let freq = firstTick; freq <= endFreq; freq += interval) {
            // Calculate x position for this frequency
            const x = (((freq - startFreq) / freqRange) * availableWidth);

            // Draw the tick mark
            ctx.beginPath();
            ctx.moveTo(x, ctx.canvas.height - height);
            ctx.lineTo(x, ctx.canvas.height - height + tickHeight);
            ctx.stroke();

            // Draw the tick label (in MHz or kHz depending on frequency)
            if (interval >= 1e6) {
                // For intervals of 1MHz or more, show MHz with 1 decimal place
                ctx.fillText(humanizeFrequency(freq), x, ctx.canvas.height - height + tickHeight + 10);
            } else if (interval >= 1e3) {
                // For intervals of 1kHz or more, show kHz
                //ctx.fillText(`${(freq / 1e3).toFixed(0)}k`, x, ctx.canvas.height - height + tickHeight + 10);
                ctx.fillText(humanizeFrequency(freq), x, ctx.canvas.height - height + tickHeight + 10);
            } else {
                // For small intervals, just show Hz
                ctx.fillText(humanizeFrequency(freq), x, ctx.canvas.height - height + tickHeight + 10);
            }
        }
    };

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Waterfall &
                Spectrum</TitleBar>
            <Box
                sx={{
                    display: 'flex',
                    gap: 1,
                    justifyContent: 'left',
                    flexWrap: 'wrap',
                }}
            >
                <Paper elevation={3} sx={{
                    p: 0,
                    display: 'inline-block',
                    width: '100%',
                    borderBottom: '1px solid',
                    borderColor: '#434343',
                    paddingBottom: '0px',
                    borderRadius: 0,
                }}>
                    <ButtonGroup variant="contained" size="small">
                        <Button
                            startIcon={<PlayArrowIcon/>}
                            disabled={isStreaming}
                            color="primary"
                            onClick={startStreaming}
                            sx={{
                                borderRadius: 0,
                            }}
                        >
                            Start
                        </Button>
                        <Button
                            startIcon={<StopIcon/>}
                            disabled={!isStreaming}
                            color="error"
                            onClick={stopStreaming}
                            sx={{
                                borderRadius: 0,
                            }}
                        >
                            Stop
                        </Button>
                        <Button
                            startIcon={<HeightIcon/>}
                            disabled={!isStreaming}
                            color="secondary"
                            onClick={autoScaleDbRange}
                            sx={{
                                borderRadius: 0,
                            }}
                        >
                            Auto Range
                        </Button>
                    </ButtonGroup>
                </Paper>
            </Box>

            {/* Container for both bandscope and waterfall */}

            <Box
                sx={{
                    width: '100%',
                    height: '100%',
                    bgcolor: 'black',
                    position: 'relative',
                    borderRadius: 1,

                }}
            >
                <Box sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'row',
                }}>
                    {/* Left column - Y-axis canvases */}
                    <Box
                        sx={{
                            width: bandscopeAxisYWidth,
                            minWidth: bandscopeAxisYWidth,
                            maxWidth: bandscopeAxisYWidth,
                            height: '1000px',
                            position: 'relative',
                            borderRight: '1px solid rgba(255, 255, 255, 0.2)',
                            display: 'flex',
                            flexDirection: 'column',
                            flexShrink: 0,
                        }}
                    >
                        <canvas
                            ref={dBAxisScopeCanvasRef}
                            width={bandscopeAxisYWidth}
                            height={110}
                            style={{
                                width: '100%',
                                height: '110px',
                                backgroundColor: 'rgba(40, 40, 40, 0.7)',
                                display: 'block',
                            }}
                        />
                        <canvas
                            width={bandscopeAxisYWidth}
                            height={21}
                            style={{
                                width: '100%',
                                height: '21px',
                                backgroundColor: 'rgba(28, 28, 28, 1)',
                                borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                                display: 'block',
                            }}
                        />
                        <canvas
                            ref={waterFallLeftMarginCanvasRef}
                            width={bandscopeAxisYWidth}
                            height={900}
                            style={{
                                width: '100%',
                                height: 'calc(100% - 131px)',
                                display: 'block',
                            }}
                        />
                    </Box>

                    {/* Right column - Main visualization canvases */}
                    <WaterfallWithStrictXAxisZoom
                        bandscopeAxisYWidth={bandscopeAxisYWidth}
                        waterfallCanvasWidth={waterfallCanvasWidth}
                        bandscopeCanvasRef={bandscopeCanvasRef}
                        frequencyBarScopeCanvasRef={frequencyBarScopeCanvasRef}
                        waterFallCanvasRef={waterFallCanvasRef}
                    />
                </Box>
            </Box>

            <WaterfallStatusBar>
                {errorMessage ?
                    <Typography color="error" variant="body2" sx={{mb: 2}}>
                        Error: {errorMessage}
                    </Typography>
                    : isStreaming ?
                        `ffts/s: ${humanizeNumber(eventMetrics.eventsPerSecond)}, bins/s: ${humanizeNumber(eventMetrics.binsPerSecond)}, f: ${humanizeFrequency(centerFrequency)}, sr: ${humanizeFrequency(sampleRate)}, g: ${gain} dB`
                        : `stopped`
                }
            </WaterfallStatusBar>

            <WaterFallSettingsDialog/>
        </>
    );
});


const WaterfallWithStrictXAxisZoom = ({
                                          waterfallCanvasWidth,
                                          bandscopeAxisYWidth,
                                          bandscopeCanvasRef,
                                          frequencyBarScopeCanvasRef,
                                          waterFallCanvasRef
                                      }) => {
    const containerRef = useRef(null);
    const containerWidthRef = useRef(0);
    const [isMobile, setIsMobile] = useState(false);
    const scaleRef = useRef(1);
    const positionXRef = useRef(0);
    const isDraggingRef = useRef(false);
    const lastXRef = useRef(0);
    const lastPinchDistanceRef = useRef(0);
    const pinchCenterXRef = useRef(0);

    // State for React rendering
    const [customScale, setCustomScale] = useState(1);
    const [customPositionX, setCustomPositionX] = useState(0);

    // Function to recalculate position when container resizes
    const handleResize = useCallback(() => {
        if (!containerRef.current || scaleRef.current <= 1) return;

        const newWidth = containerRef.current.clientWidth;
        const oldWidth = containerWidthRef.current;

        if (oldWidth === 0 || newWidth === oldWidth) return;

        // Calculate new position based on scale and size change ratio
        // This keeps the visible content centered as the container resizes
        const centerPointRatio = 0.5; // Center of the view
        const oldCenterPoint = oldWidth * centerPointRatio;
        const newCenterPoint = newWidth * centerPointRatio;

        // Scale the center point positions
        const oldScaledCenter = (oldCenterPoint - positionXRef.current) / scaleRef.current;

        // Calculate new position to maintain the same content at center
        const newPositionX = newCenterPoint - (oldScaledCenter * scaleRef.current);

        // Apply constraints to keep within bounds
        const maxPanLeft = newWidth - (newWidth * scaleRef.current);
        positionXRef.current = Math.max(maxPanLeft, Math.min(0, newPositionX));

        // Update width reference
        containerWidthRef.current = newWidth;

        // Apply transform
        applyTransform();
        updateReactState();
    }, []);

    // Set up ResizeObserver to detect container size changes
    useEffect(() => {
        if (!containerRef.current) return;

        // Store initial width
        containerWidthRef.current = containerRef.current.clientWidth;

        // Create ResizeObserver
        const resizeObserver = new ResizeObserver(() => {
            handleResize();
        });

        // Start observing the container
        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, [handleResize]);

    // Apply transform directly to DOM element
    const applyTransform = useCallback(() => {
        if (containerRef.current) {
            containerRef.current.style.transform = `translateX(${positionXRef.current}px) scaleX(${scaleRef.current})`;
        }
    }, []);

    // Detect mobile devices
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Update React state for rendering (but not for calculations)
    const updateReactState = useCallback(() => {
        setCustomScale(scaleRef.current);
        setCustomPositionX(positionXRef.current);
    }, []);

    // Zoom functionality
    const zoomOnXAxisOnly = useCallback((deltaScale, centerX) => {
        const prevScale = scaleRef.current;
        const newScale = Math.max(1, Math.min(10, prevScale + deltaScale));

        // Exit if scale didn't change
        if (newScale === prevScale) return;

        const containerWidth = containerRef.current?.clientWidth || 0;
        containerWidthRef.current = containerWidth;

        // Calculate how far from left edge the center point is (as a ratio of scaled width)
        const mousePointRatio = (centerX - positionXRef.current) / (containerWidth * prevScale);

        // Calculate new position
        let newPositionX = 0;
        if (newScale === 1) {
            // Reset position at scale 1
            newPositionX = 0;
        } else {
            // Keep the point under mouse at the same relative position
            newPositionX = centerX - mousePointRatio * containerWidth * newScale;

            // Constrain to boundaries
            const maxPanLeft = containerWidth - (containerWidth * newScale);
            newPositionX = Math.max(maxPanLeft, Math.min(0, newPositionX));
        }

        // Update refs
        scaleRef.current = newScale;
        positionXRef.current = newPositionX;

        // Apply transform immediately
        applyTransform();
        updateReactState();
    }, [applyTransform, updateReactState]);

    // Panning functionality
    const panOnXAxisOnly = useCallback((deltaX) => {
        // Only allow panning if zoomed in
        if (scaleRef.current <= 1) {
            return;
        }

        const containerWidth = containerRef.current?.clientWidth || 0;

        // Calculate boundaries
        const scaledWidth = containerWidth * scaleRef.current;
        const maxPanLeft = containerWidth - scaledWidth;

        // Update position with constraints
        positionXRef.current = Math.max(
            maxPanLeft,
            Math.min(0, positionXRef.current + deltaX)
        );

        // Apply transform directly
        applyTransform();

        // Update React state for rendering purposes only
        updateReactState();
    }, [applyTransform, updateReactState]);

    // Reset to default state
    const resetCustomTransform = useCallback(() => {
        scaleRef.current = 1;
        positionXRef.current = 0;

        applyTransform();
        updateReactState();
    }, [applyTransform, updateReactState]);

    // Set up all event handlers
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Wheel event for zooming
        const handleWheel = (e) => {
            e.preventDefault();
            const deltaScale = -e.deltaY * 0.001;
            zoomOnXAxisOnly(deltaScale, e.offsetX);
        };

        // Mouse events for panning
        const handleMouseDown = (e) => {
            isDraggingRef.current = true;
            lastXRef.current = e.clientX;
            // Prevent text selection during drag
            e.preventDefault();
            // Set cursor to indicate dragging
            container.style.cursor = 'grabbing';
        };

        const handleMouseMove = (e) => {
            if (!isDraggingRef.current) return;

            const deltaX = e.clientX - lastXRef.current;
            lastXRef.current = e.clientX;

            // Call pan function with the delta
            panOnXAxisOnly(deltaX);
        };

        const handleMouseUp = () => {
            isDraggingRef.current = false;
            // Reset cursor
            if (container) {
                container.style.cursor = 'grab';
            }
        };

        // Touch events
        const handleTouchStart = (e) => {
            if (e.touches.length === 1) {
                isDraggingRef.current = true;
                lastXRef.current = e.touches[0].clientX;
                e.preventDefault();
            } else if (e.touches.length === 2) {
                // Pinch-to-zoom
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                lastPinchDistanceRef.current = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                pinchCenterXRef.current = (touch1.clientX + touch2.clientX) / 2;
                e.preventDefault();
            }
        };

        const handleTouchMove = (e) => {
            // Single touch = pan
            if (e.touches.length === 1 && isDraggingRef.current) {
                const deltaX = e.touches[0].clientX - lastXRef.current;
                lastXRef.current = e.touches[0].clientX;
                panOnXAxisOnly(deltaX);
                e.preventDefault();
            }
            // Two touches = pinch zoom
            else if (e.touches.length === 2) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );

                const deltaScale = (currentDistance - lastPinchDistanceRef.current) * 0.01;
                lastPinchDistanceRef.current = currentDistance;

                const currentCenterX = (touch1.clientX + touch2.clientX) / 2;
                pinchCenterXRef.current = currentCenterX;

                zoomOnXAxisOnly(deltaScale, pinchCenterXRef.current);
                e.preventDefault();
            }
        };

        const handleTouchEnd = () => {
            isDraggingRef.current = false;
        };

        // Set initial cursor
        container.style.cursor = 'grab';

        // Add all event listeners
        container.addEventListener('wheel', handleWheel, { passive: false });
        container.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        // For touch events, passive: false is critical for preventDefault to work
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleTouchEnd);

        // Cleanup
        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);

            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);

    // Set touch actions for mobile scrolling
    useEffect(() => {
        const canvases = [
            bandscopeCanvasRef.current,
            frequencyBarScopeCanvasRef.current,
            waterFallCanvasRef.current
        ];

        canvases.forEach(canvas => {
            if (canvas) {
                canvas.style.touchAction = 'none'; // Prevent default touch behaviors
            }
        });
    }, [bandscopeCanvasRef, frequencyBarScopeCanvasRef, waterFallCanvasRef]);

    return (
        <Box sx={{
            height: 'calc(100% - 90px)',
            width: '100%',
            overflow: 'hidden',
            touchAction: 'none', // Prevent default touch behaviors
            position: 'relative',
        }}>
            {/* Zoom controls */}
            <Box sx={{
                position: 'absolute',
                bottom: isMobile ? 20 : 10,
                right: isMobile ? 20 : 10,
                zIndex: 10,
                display: 'flex',
                gap: '5px',
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderRadius: '20px',
                padding: '5px',
            }}>
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={() => {
                        zoomOnXAxisOnly(0.1, window.innerWidth / 2);
                    }}
                    sx={{ color: 'white' }}
                >
                    <AddIcon />
                </IconButton>
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={() => {
                        zoomOnXAxisOnly(-0.1, window.innerWidth / 2);
                    }}
                    sx={{ color: 'white' }}
                >
                    <RemoveIcon />
                </IconButton>
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={resetCustomTransform}
                    sx={{ color: 'white' }}
                >
                    <RestartAltIcon />
                </IconButton>
            </Box>

            {/* Canvases */}
            <Box
                ref={containerRef}
                sx={{
                    width: '100%',
                    height: 'auto',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    transformOrigin: 'left center',
                    touchAction: 'none', // Prevent default touch behaviors
                }}
            >
                <canvas
                    ref={bandscopeCanvasRef}
                    width={waterfallCanvasWidth - bandscopeAxisYWidth}
                    height={110}
                    style={{
                        width: '100%',
                        height: '110px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                        display: 'block',
                        touchAction: 'none', // Prevent default touch behaviors
                    }}
                />
                <canvas
                    ref={frequencyBarScopeCanvasRef}
                    width={waterfallCanvasWidth - bandscopeAxisYWidth}
                    height={21}
                    style={{
                        width: '100%',
                        height: '21px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                        display: 'block',
                        touchAction: 'none', // Prevent default touch behaviors
                    }}
                />
                <canvas
                    ref={waterFallCanvasRef}
                    width={waterfallCanvasWidth - bandscopeAxisYWidth}
                    height={900}
                    style={{
                        width: '100%',
                        height: '700px',
                        display: 'block',
                        touchAction: 'none', // Prevent default touch behaviors
                    }}
                />
            </Box>
        </Box>
    );
};

export default MainWaterfallDisplay;