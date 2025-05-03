import React, {useEffect, useRef, useState, useCallback} from 'react';
import {
    Box,
    Typography,
    Paper,
    Button,
    ButtonGroup,
    Stack,
    Divider,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
} from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
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
    setErrorDialogOpen,
    setIsStreaming,
    setTargetFPS,
    setIsPlaying,
    setSettingsDialogOpen,
    setGridEditable,
    setBiasT,
    setTunerAgc,
    setRtlAgc,
    setWaterFallCanvasWidth,
    setWaterFallVisualWidth,
    setWaterFallScaleX,
    setWaterFallPositionX,
    setStartStreamingLoading,
    setWaterFallCanvasHeight,
} from './waterfall-slice.jsx'
import WaterFallSettingsDialog from "./waterfall-dialog.jsx";
import {enqueueSnackbar} from "notistack";
import FrequencyScale from "./frequency-scale-canvas.jsx";
import {getColorForPower} from "./waterfall-colors.jsx";


export const createExternalWorker = () => {
    return new Worker(new URL('./waterfall-worker.jsx', import.meta.url));
};

const MainWaterfallDisplay = React.memo(() => {
    const {socket} = useSocket();
    const dispatch = useDispatch();
    const waterFallCanvasRef = useRef(null);
    const bandscopeCanvasRef = useRef(null); // New ref for bandscope canvas
    const dBAxisScopeCanvasRef = useRef(null);
    const waterFallLeftMarginCanvasRef = useRef(null);
    const waterfallDataRef = useRef(new Array(1024).fill(-120));
    const animationFrameRef = useRef(null);
    const workerRef = useRef(null);
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
        errorDialogOpen,
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
        waterFallVisualWidth,
        waterFallCanvasWidth,
        waterFallCanvasHeight,
        selectedSDRId,
        startStreamingLoading,
        gettingSDRParameters,
    } = useSelector((state) => state.waterfall);
    const targetFPSRef = useRef(targetFPS);
    const [scrollFactor, setScrollFactor] = useState(1);
    const accumulatedRowsRef = useRef(0);
    const [bandscopeAxisYWidth, setBandscopeAxisYWidth] = useState(60);

    const cancelAnimations = () => {
        // Stop the worker
        if (workerRef.current) {
            workerRef.current.postMessage({cmd: 'stop'});
        }

        // Clear any leftover animation frames
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

    // Initialize the worker when the component mounts
    useEffect(() => {
        // Create the worker
        const worker = createExternalWorker();

        // Set up a message handler
        worker.onmessage = (e) => {
            const {type, immediate, status} = e.data;

            if (type === 'render') {
                // Draw waterfall and bandscope
                if (waterFallCanvasRef.current) {
                    drawWaterfall();
                }

                if (bandscopeCanvasRef.current) {
                    drawBandscope();
                }
            } else if (type === 'status') {
                // Optional: handle status updates from the worker
                console.log('Worker status:', status);
            }
        };

        // Store the worker reference
        workerRef.current = worker;

        // If we're already streaming, start the worker
        if (isStreaming) {
            worker.postMessage({
                cmd: 'start',
                data: {fps: targetFPSRef.current}
            });
        }

        // Clean up when component unmounts
        return () => {
            if (workerRef.current) {
                workerRef.current.postMessage({cmd: 'stop'});
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

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

        socket.on('sdr-config-error', (error) => {
            console.error(`sdr-config-error`, error);
            dispatch(setErrorMessage(error.message));
            dispatch(setErrorDialogOpen(true));
            dispatch(setStartStreamingLoading(false));
            enqueueSnackbar(`Failed to configure SDR: ${error.message}`, {
                variant: 'error'
            });
        });

        socket.on('sdr-error', (error) => {
            console.error(`sdr-error`, error);
            cancelAnimations();
            dispatch(setErrorMessage(error.message));
            dispatch(setErrorDialogOpen(true));
            dispatch(setIsStreaming(false));
            dispatch(setStartStreamingLoading(false));
            enqueueSnackbar(`Error occurred while streaming from SDR: ${error.message}`, {
                 variant: 'error'
            });
        });

        socket.on('sdr-status', (data) => {
            console.info(`sdr-status`, data);
            if (data['streaming'] === true) {
                dispatch(setIsStreaming(true));
                dispatch(setStartStreamingLoading(false));
            } else if (data['streaming'] === false) {
                cancelAnimations();
                dispatch(setIsStreaming(false));
                dispatch(setStartStreamingLoading(false));
            }
        });

        // Modify the socket event handler for FFT data
        socket.on('sdr-fft-data', (binaryData) => {
            const floatArray = new Float32Array(binaryData);

            // Increment event counter
            eventCountRef.current += 1;

            // Add bin count
            binCountRef.current += floatArray.length;

            // Add new FFT data to the waterfall buffer
            waterfallDataRef.current.unshift(floatArray);

                // Keep only the most recent rows based on canvas height
            if (waterFallCanvasRef.current && waterfallDataRef.current.length > waterFallCanvasRef.current.height) {
                waterfallDataRef.current = waterfallDataRef.current.slice(0, waterFallCanvasRef.current.height);
            }

            // Notify the worker that new data is available
            if (workerRef.current) {
                workerRef.current.postMessage({cmd: 'updateFFTData'});
            }
        });

        drawBandscope();

        return () => {
            // Cleanup animations
            cancelAnimations();

            // Clean up socket listeners
            socket.off('sdr-config-error');
            socket.off('sdr-error');
            socket.off('sdr-fft-data');
            socket.off('sdr-status');
        };
    }, []);

    useEffect(() => {
        // If we are streaming, configure RTL-SDR settings
        if (isStreaming) {
            socket.emit('sdr_data', 'configure-rtlsdr', {
                selectedSDRId,
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

    // Update the worker when FPS changes
    useEffect(() => {
        targetFPSRef.current = targetFPS;

        if (workerRef.current && isStreaming) {
            workerRef.current.postMessage({
                cmd: 'updateFPS',
                data: {fps: targetFPS}
            });
        }
    }, [targetFPS]);

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

    // Configure SDR and start streaming
    const startStreaming = () => {

        if (!isStreaming) {
            dispatch(setStartStreamingLoading(true));
            dispatch(setErrorMessage(''));

            // Configure RTL-SDR settings
            socket.emit('sdr_data', 'configure-rtlsdr', {
                selectedSDRId,
                centerFrequency,
                sampleRate,
                gain,
                fftSize,
                biasT,
                tunerAgc,
                rtlAgc,
                fftWindow,
            }, (response) => {
                // Check response
                if (response['success']) {
                    // Start streaming after configuration is acknowledged
                    socket.emit('sdr_data', 'start-streaming', {selectedSDRId});

                    // Start the worker
                    if (workerRef.current) {
                        workerRef.current.postMessage({
                            cmd: 'start',
                            data: {fps: targetFPSRef.current}
                        });
                    }
                    // auto range the dB scale
                    setTimeout(() => autoScaleDbRange(), 1500);
                }
            });
        }
    };

    const stopStreaming = () => {
        if (isStreaming) {
            socket.emit('sdr_data', 'stop-streaming', {selectedSDRId});
            dispatch(setIsStreaming(false));
            cancelAnimations();
        }
    };

    const autoScaleDbRange = () => {
        if (waterfallDataRef.current.length === 0) {
            return;
        }

        // Collect all values from recent frames
        const allValues = [];
        const samplesToCheck = Math.min(10, waterfallDataRef.current.length);

        for (let i = 0; i < samplesToCheck; i++) {
            const row = waterfallDataRef.current[i];
            allValues.push(...row);
        }

        // Calculate mean and standard deviation
        const sum = allValues.reduce((acc, val) => acc + val, 0);
        const mean = sum / allValues.length;

        const squaredDiffs = allValues.map(val => (val - mean) ** 2);
        const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / allValues.length;
        const stdDev = Math.sqrt(variance);

        // Filter out values more than X standard deviations from the mean
        const stdDevMultiplier = 4.5; // Adjust this value as needed
        const filteredValues = allValues.filter(val =>
            Math.abs(val - mean) <= stdDevMultiplier * stdDev
        );

        let min = Math.min(...filteredValues);
        let max = Math.max(...filteredValues);

        // Add some padding to the range
        min = Math.floor(min);
        max = Math.ceil(max);

        dispatch(setDbRange([min, max]));
    };


    function drawWaterfall() {
        const waterFallCanvas = waterFallCanvasRef.current;

        if (!waterFallCanvas || waterfallDataRef.current.length === 0) {
            return;
        }

        accumulatedRowsRef.current += 1;

        // Only scroll the waterfall when we've accumulated enough rows
        if (accumulatedRowsRef.current >= scrollFactor) {
            accumulatedRowsRef.current = 0;

            const waterFallCtx = waterFallCanvas.getContext('2d');

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

                    const rgb = getColorForPower(
                        amplitude,
                        visualSettingsRef.current.colorMap,
                        visualSettingsRef.current.dbRange,
                        colorCache
                    );

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
        if (!waterFallLeftMarginCanvasRef.current) {
            return;
        };

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

        // Calculate seconds since the epoch and check if divisible by 15
        const currentSeconds = Math.floor(now.getTime() / 1000);
        const shouldUpdate = !lastTimestampRef.current ||
            currentSeconds % 15 === 0 ||
            (lastTimestampRef.current.getMinutes() !== now.getMinutes()) ||
            (lastTimestampRef.current.getHours() !== now.getHours());

        // Update the timestamp every 15 seconds
        if (shouldUpdate) {
            // Format the time as HH:MM:SS
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const timeString = `${hours}:${minutes}:${seconds}`;

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
            [minDb, maxDb],
            colorCache,
        );

        // Create line color with proper opacity
        const lineColor = `rgba(${lineRgb.r}, ${lineRgb.g}, ${lineRgb.b}, 0.8)`;

        // Generate fill color based on the same colormap but with lower intensity
        const fillColorPoint = 0.7; // Use 50% intensity for fill base color
        const fillRgb = getColorForPower(
            minDb + (maxDb - minDb) * fillColorPoint,
            currentColorMap,
            [minDb, maxDb],
            colorCache,
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
                            loading={startStreamingLoading}
                            disabled={isStreaming || (selectedSDRId === "none") || gettingSDRParameters || (!sampleRate || !gain)}
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
                                borderRight: '1px solid #535353',
                                display: 'block',
                            }}
                        />
                        <canvas
                            ref={waterFallLeftMarginCanvasRef}
                            width={bandscopeAxisYWidth}
                            height={waterFallCanvasHeight}
                            style={{
                                width: '100%',
                                height: `${waterFallCanvasHeight}px`,
                                display: 'block',
                                backgroundColor: 'rgba(28, 28, 28, 1)',
                                borderRight: '1px solid #535353',
                            }}

                        />
                    </Box>

                    {/* Right column - Main visualization canvases */}
                    <WaterfallWithStrictXAxisZoom
                        bandscopeCanvasRef={bandscopeCanvasRef}
                        waterFallCanvasRef={waterFallCanvasRef}
                        centerFrequency={centerFrequency}
                        sampleRate={sampleRate}
                    />
                </Box>
            </Box>

            <Dialog
                open={errorMessage !== '' && errorDialogOpen}
                onClose={() => dispatch(setErrorDialogOpen(false))}
                aria-labelledby="error-dialog-title"
                aria-describedby="error-dialog-description"
                PaperProps={{
                    style: {
                        backgroundColor: '#ffebee',
                        border: '1px solid #ef9a9a'
                    }
                }}
            >
                <DialogTitle
                    id="error-dialog-title"
                    sx={{
                        color: '#c62828',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                    }}
                >
                    <ErrorIcon color="error"/>
                    Error Occurred
                </DialogTitle>
                <DialogContent>
                    <DialogContentText
                        id="error-dialog-description"
                        sx={{
                            color: '#d32f2f'
                        }}
                    >
                        {errorMessage}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => dispatch(setErrorDialogOpen(false))}
                        variant="contained"
                        color="error"
                    >
                        Close
                    </Button>
                </DialogActions>
            </Dialog>

            <WaterfallStatusBar>
                {isStreaming ?
                    `FFTs/s: ${humanizeNumber(eventMetrics.eventsPerSecond)}, bins/s: ${humanizeNumber(eventMetrics.binsPerSecond)}, f: ${humanizeFrequency(centerFrequency)}, sr: ${humanizeFrequency(sampleRate)}, g: ${gain} dB`
                    : `stopped`
                }
            </WaterfallStatusBar>

            <WaterFallSettingsDialog/>
        </>
    );
});


const WaterfallWithStrictXAxisZoom = ({
                                          bandscopeCanvasRef,
                                          waterFallCanvasRef,
                                          centerFrequency,
                                          sampleRate,
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
    const dispatch = useDispatch();

    const {
        waterFallVisualWidth,
        waterFallCanvasWidth,
        waterFallCanvasHeight,
        waterFallScaleX,
        waterFallPositionX,
    } = useSelector((state) => state.waterfall);
    // State for React rendering
    const [customScale, setCustomScale] = useState(1);
    const [customPositionX, setCustomPositionX] = useState(0);
    const [visualContainerWidth, setVisualContainerWidth] = useState(waterFallCanvasWidth);

    // Function to recalculate position when the container resizes
    const handleResize = useCallback(() => {
        console.log("handleResize main waterfall container");
        if (!containerRef.current || scaleRef.current <= 1) return;

        const newWidth = containerRef.current.clientWidth;
        const oldWidth = containerWidthRef.current;

        if (oldWidth === 0 || newWidth === oldWidth) return;

        // Calculate a new position based on scale and size change ratio
        // This keeps the visible content centered as the container resizes
        const centerPointRatio = 0.5; // Center of the view
        const oldCenterPoint = oldWidth * centerPointRatio;
        const newCenterPoint = newWidth * centerPointRatio;

        // Scale the center point positions
        const oldScaledCenter = (oldCenterPoint - positionXRef.current) / scaleRef.current;

        // Calculate the position to maintain the same content at center
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

    // Calculate the visual width including CSS transforms
    function getScaledWidth(element, scaleX) {
        return element.getBoundingClientRect().width;
    }

    // Apply transform directly to a DOM element
    const applyTransform = useCallback(() => {
        if (containerRef.current) {
            containerRef.current.style.transform = `translateX(${positionXRef.current}px) scaleX(${scaleRef.current})`;
            const newVisualWidth = getScaledWidth(containerRef.current, scaleRef.current);
            setVisualContainerWidth(newVisualWidth);
            dispatch(setWaterFallVisualWidth(newVisualWidth));
        }
    }, []);

    const checkMobile = () => {
        setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768);
    };

    useEffect(() => {
        // Detect mobile devices
        checkMobile();
        window.addEventListener('resize', checkMobile);

        // Set positionX and scaleX values from Redux
        scaleRef.current = waterFallScaleX;
        positionXRef.current = waterFallPositionX;

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

        // Exit if the scale didn't change
        if (newScale === prevScale) return;

        const containerWidth = containerRef.current?.clientWidth || 0;
        containerWidthRef.current = containerWidth;

        // Calculate how far from the left edge the center point is (as a ratio of scaled width)
        const mousePointRatio = (centerX - positionXRef.current) / (containerWidth * prevScale);

        // Calculate a new position
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

        // Set the values on Redux
        dispatch(setWaterFallScaleX(newScale));
        dispatch(setWaterFallPositionX(newPositionX));

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

    // Reset to the default state
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
            //e.preventDefault();
            // Only zoom when shift key is pressed
            if (!e.shiftKey) {
                return;
            }
            const deltaScale = -e.deltaY * 0.01;
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
                //e.preventDefault();
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
                //e.preventDefault();
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
        container.addEventListener('wheel', handleWheel, {passive: false});
        container.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        // For touch events, passive: false is critical for preventDefault to work
        container.addEventListener('touchstart', handleTouchStart, {passive: false});
        container.addEventListener('touchmove', handleTouchMove, {passive: false});
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
            waterFallCanvasRef.current
        ];

        canvases.forEach(canvas => {
            if (canvas) {
                canvas.style.touchAction = 'pan-y';
            }
        });
    }, [bandscopeCanvasRef, waterFallCanvasRef]);

    return (
        <Box sx={{
            height: 'calc(100% - 90px)',
            width: '100%',
            overflow: 'hidden',
            touchAction: 'pan-y',
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
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '20px',
                padding: '5px',
            }}>
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={() => {
                        zoomOnXAxisOnly(0.3, window.innerWidth / 2);
                    }}
                    sx={{color: 'white'}}
                >
                    <AddIcon/>
                </IconButton>
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={() => {
                        zoomOnXAxisOnly(-0.3, window.innerWidth / 2);
                    }}
                    sx={{color: 'white'}}
                >
                    <RemoveIcon/>
                </IconButton>
                <IconButton
                    size={isMobile ? "medium" : "small"}
                    onClick={resetCustomTransform}
                    sx={{color: 'white'}}
                >
                    <RestartAltIcon/>
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
                    touchAction: 'pan-y',
                }}
            >
                <canvas
                    ref={bandscopeCanvasRef}
                    width={waterFallCanvasWidth}
                    height={110}
                    style={{
                        width: '100%',
                        height: '110px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                        display: 'block',
                        touchAction: 'pan-y',
                    }}
                />
                <FrequencyScale
                    centerFrequency={centerFrequency}
                    containerWidth={visualContainerWidth}
                    sampleRate={sampleRate}
                />
                <canvas
                    ref={waterFallCanvasRef}
                    width={waterFallCanvasWidth}
                    height={waterFallCanvasHeight}
                    style={{
                        width: '100%',
                        height: `${waterFallCanvasHeight}px`,
                        display: 'block',
                        touchAction: 'pan-y',
                    }}
                />
            </Box>
        </Box>
    );
};

export default MainWaterfallDisplay;