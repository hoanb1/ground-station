/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */


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
    DialogActions, Slider, ToggleButton,
    ToggleButtonGroup,
} from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
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
import AlignHorizontalLeftIcon from '@mui/icons-material/AlignHorizontalLeft';
import AlignHorizontalRightIcon from '@mui/icons-material/AlignHorizontalRight';
import WaterfallWithStrictXAxisZoom from './waterfall-content.jsx'
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
    setBandScopeHeight,
    setAutoDBRange,
    setShowRightSideWaterFallAccessories,
    setShowLeftSideWaterFallAccessories, setFFTWindow, setSelectedSDRId, setSelectedOffsetValue,
} from './waterfall-slice.jsx'
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
    const bandscopeCanvasRef = useRef(null);
    const dBAxisScopeCanvasRef = useRef(null);
    const waterFallLeftMarginCanvasRef = useRef(null);
    const waterfallDataRef = useRef(new Array(1024).fill(-120));
    const animationFrameRef = useRef(null);
    const workerRef = useRef(null);
    const bandscopeAnimationFrameRef = useRef(null);
    const dottedLineImageDataRef = useRef(null);
    const visualSettingsRef = useRef({
        dbRange: [-120, 30],
        colorMap: 'magma',
        fftSize: 1024,
        sampleRate: 2000000,
        centerFrequency: 1000000000,
    });
    const colorCache = useRef(new Map());

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
    const mainWaterFallContainer = useRef(null);
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
        dBRange,
        soapyAgc,
        waterFallVisualWidth,
        waterFallCanvasWidth,
        waterFallCanvasHeight,
        bandScopeHeight,
        frequencyScaleHeight,
        selectedSDRId,
        startStreamingLoading,
        gettingSDRParameters,
        showRightSideWaterFallAccessories,
        showLeftSideWaterFallAccessories,
        selectedAntenna,
        selectedOffsetValue,
    } = useSelector((state) => state.waterfall);
    const centerFrequencyRef = useRef(centerFrequency);
    const sampleRateRef = useRef(sampleRate);
    const {
        lastRotatorEvent
    } = useSelector((state) => state.targetSatTrack);

    const targetFPSRef = useRef(targetFPS);
    const rotatorEventQueueRef = useRef([]);
    const [scrollFactor, setScrollFactor] = useState(1);
    const accumulatedRowsRef = useRef(0);
    const [bandscopeAxisYWidth, setBandscopeAxisYWidth] = useState(60);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [isFullscreen, setIsFullscreen] = useState(false);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            // Enter fullscreen
            if (mainWaterFallContainer.current.requestFullscreen) {
                mainWaterFallContainer.current.requestFullscreen();
            } else if (mainWaterFallContainer.current.mozRequestFullScreen) { /* Firefox */
                mainWaterFallContainer.current.mozRequestFullScreen();
            } else if (mainWaterFallContainer.current.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
                mainWaterFallContainer.current.webkitRequestFullscreen();
            } else if (mainWaterFallContainer.current.msRequestFullscreen) { /* IE/Edge */
                mainWaterFallContainer.current.msRequestFullscreen();
            }
            setIsFullscreen(true);
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { /* Firefox */
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { /* Chrome, Safari & Opera */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { /* IE/Edge */
                document.msExitFullscreen();
            }
            setIsFullscreen(false);
        }
    };

    // Add event listener for fullscreen change
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

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

    // Monitor rotator event changes
    useEffect(() => {
        rotatorEventQueueRef.current.push(lastRotatorEvent);
    }, [lastRotatorEvent]);

    // Update refs when Redux state changes
    useEffect(() => {
        centerFrequencyRef.current = centerFrequency;
    }, [centerFrequency]);

    useEffect(() => {
        sampleRateRef.current = sampleRate;
    }, [sampleRate]);

    // ResizeObserver for the main waterfall container
    useEffect(() => {
        if (!mainWaterFallContainer.current) {
            return;
        }
        const resizeObserver = new ResizeObserver(entries => {
            const {contentRect} = entries[0];
            setDimensions({width: contentRect.width, height: contentRect.height});
        });

        resizeObserver.observe(mainWaterFallContainer.current?.parentElement);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

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
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        if (bandscopeCanvasRef.current) {
            const canvas = bandscopeCanvasRef.current;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
            //dispatch(setIsStreaming(false));
            dispatch(setStartStreamingLoading(false));
            enqueueSnackbar(`Error occurred while streaming from SDR: ${error.message}`, {
                 variant: 'error'
            });
        });

        socket.on('sdr-config', (data) => {
            console.info(`sdr-config`, data);

            dispatch(setCenterFrequency(data['center_freq']));
            dispatch(setSampleRate(data['sample_rate']));
            dispatch(setGain(data['gain']));
            dispatch(setFFTSize(data['fft_size']));
            dispatch(setFFTWindow(data['fft_window']));
            dispatch(setBiasT(data['bias_t']));
            dispatch(setTunerAgc(data['tuner_agc']));
            dispatch(setRtlAgc(data['rtl_agc']));

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
            socket.off('sdr-config');
        };
    }, []);

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

            // Clean up the rotatorEventQueueRef from any previous events that might have accumulated
            rotatorEventQueueRef.current = [];

            // Set the loading flags and clear errors
            dispatch(setStartStreamingLoading(true));
            dispatch(setErrorMessage(''));

            // Send command to the backend to configure the SDR settings
            socket.emit('sdr_data', 'configure-sdr', {
                selectedSDRId: selectedSDRId,
                centerFrequency: centerFrequency,
                sampleRate: sampleRate,
                gain: gain,
                fftSize: fftSize,
                biasT: biasT,
                tunerAgc: tunerAgc,
                rtlAgc: rtlAgc,
                fftWindow: fftWindow,
                antenna: selectedAntenna,
                offsetFrequency: selectedOffsetValue,
                soapyAgc: soapyAgc,
            }, (response) => {
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

            const waterFallCtx = waterFallCanvas.getContext('2d', { alpha: true });

            // Enable image smoothing (anti-aliasing)
            waterFallCtx.imageSmoothingEnabled = true;
            waterFallCtx.imageSmoothingQuality = 'high'; // Options: 'low', 'medium', 'high'

            // Move existing pixels DOWN (instead of up)
            waterFallCtx.drawImage(
                waterFallCanvas,
                0, 0, waterFallCanvas.width, waterFallCanvas.height - 1,
                0, 1, waterFallCanvas.width, waterFallCanvas.height - 1
            );

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

                // Try to use createImageBitmap for better performance
                createImageBitmap(imageData)
                    .then(bitmap => {
                        waterFallCtx.drawImage(bitmap, 0, 0);
                        bitmap.close(); // Clean up the bitmap
                    })
                    .catch(() => {
                        // Fallback to putImageData if createImageBitmap is not supported
                        waterFallCtx.putImageData(imageData, 0, 0);
                    })
                    .finally(() => {
                        updateWaterfallLeftMargin();
                    });
            }
        }
    }

    function updateWaterfallLeftMargin() {
        if (!waterFallLeftMarginCanvasRef.current) {
            return;
        }

        const waterFallCanvas = waterFallCanvasRef.current;
        const waterFallCtx = waterFallCanvas.getContext('2d', { willReadFrequently: true });
        const waterFallLeftMarginCanvas = waterFallLeftMarginCanvasRef.current;
        const waterFallLeftMarginCtx = waterFallLeftMarginCanvas.getContext('2d', { willReadFrequently: true });

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

        const newRotatorEvent = rotatorEventQueueRef.current.pop();
        if (newRotatorEvent) {
            // Draw a more visible background for the timestamp
            waterFallLeftMarginCtx.fillStyle = 'rgba(28, 28, 28, 1)';
            waterFallLeftMarginCtx.fillRect(0, 0, bandscopeAxisYWidth, 14);

            // Draw the time text
            waterFallLeftMarginCtx.font = '12px monospace';
            waterFallLeftMarginCtx.fillStyle = 'rgba(255, 255, 255, 1)';
            waterFallLeftMarginCtx.textAlign = 'center';
            waterFallLeftMarginCtx.textBaseline = 'top';
            waterFallLeftMarginCtx.fillText(newRotatorEvent, bandscopeAxisYWidth / 2, 2);

            // Get or create the imageData for the dotted line
            let imageData;

            // Check if we have a cached imageData for the dotted line
            if (!dottedLineImageDataRef.current ||
                dottedLineImageDataRef.current.width !== waterFallCanvas.width) {
                // Create new ImageData if none exists or if width changed
                imageData = waterFallCtx.createImageData(waterFallCanvas.width, 1);
                dottedLineImageDataRef.current = imageData;

                // Pre-fill the dotted line pattern
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 32) { // Increase step to create dots
                    for (let j = 0; j < 4; j++) { // Dot width of 1 pixel
                        const idx = i + (j * 4);
                        if (idx < data.length) {
                            data[idx] = 255;     // R
                            data[idx + 1] = 255; // G
                            data[idx + 2] = 255; // B
                            data[idx + 3] = 100; // A
                        }
                    }
                }
            } else {
                // Reuse the cached imageData
                imageData = dottedLineImageDataRef.current;
            }

            // Draw the dotted line
            waterFallCtx.putImageData(imageData, 0, 0);
        }

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

        const bandScopeCtx = bandScopeCanvas.getContext('2d', { willReadFrequently: true });

        // Enable image smoothing (anti-aliasing)
        bandScopeCtx.imageSmoothingEnabled = true;
        bandScopeCtx.imageSmoothingQuality = 'high'; // Options: 'low', 'medium', 'high'

        const dBAxisCtx = dBAxisCanvas.getContext('2d', { willReadFrequently: true });

        // Enable image smoothing (anti-aliasing)
        dBAxisCtx.imageSmoothingEnabled = true;
        dBAxisCtx.imageSmoothingQuality = 'high'; // Options: 'low', 'medium', 'high'

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
            bandScopeCtx.setLineDash([5, 5]);
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
        <div ref={mainWaterFallContainer}>
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
                <Paper elevation={1} sx={{
                    p: 0,
                    display: 'inline-block',
                    width: '100%',
                    borderBottom: '1px solid',
                    borderColor: '#434343',
                    paddingBottom: '0px',
                    borderRadius: 0,
                }}>
                    <ButtonGroup variant="contained" size="small" sx={{
                        boxShadow: 'none',
                    }}>
                        <IconButton
                            loading={startStreamingLoading}
                            disabled={isStreaming || (selectedSDRId === "none") || gettingSDRParameters || (!sampleRate || !gain)}
                            color="primary"
                            onClick={startStreaming}
                            title="Start streaming"
                            sx={{
                                borderRadius: 0,
                            }}
                        >
                            <PlayArrowIcon/>
                        </IconButton>

                        <IconButton
                            disabled={!isStreaming}
                            color="error"
                            onClick={stopStreaming}
                            title="Stop streaming"
                            sx={{
                                borderRadius: 0,
                            }}
                        >
                            <StopIcon/>
                        </IconButton>

                        <IconButton
                            color={showLeftSideWaterFallAccessories ? "warning" : "default"}
                            onClick={() => dispatch(setShowLeftSideWaterFallAccessories(!showLeftSideWaterFallAccessories))}
                            size="small"
                            title="Toggle left side panel"
                            sx={{
                                borderRadius: 0,
                                backgroundColor: showLeftSideWaterFallAccessories ? 'rgba(25, 118, 210, 0.1)' : 'transparent',
                                '&:hover': {
                                    backgroundColor: showLeftSideWaterFallAccessories ? 'rgba(25, 118, 210, 0.2)' : 'rgba(0, 0, 0, 0.1)'
                                }
                            }}
                        >
                            <AlignHorizontalLeftIcon/>
                        </IconButton>

                        <IconButton
                            color={showRightSideWaterFallAccessories ? "warning" : "default"}
                            onClick={() => dispatch(setShowRightSideWaterFallAccessories(!showRightSideWaterFallAccessories))}
                            size="small"
                            title="Toggle right side panel"
                            sx={{
                                borderRadius: 0,
                                backgroundColor: showRightSideWaterFallAccessories ? 'rgba(25, 118, 210, 0.1)' : 'transparent',
                                '&:hover': {
                                    backgroundColor: showRightSideWaterFallAccessories ? 'rgba(25, 118, 210, 0.2)' : 'rgba(0, 0, 0, 0.1)'
                                }
                            }}
                        >
                            <AlignHorizontalRightIcon/>
                        </IconButton>
                        <IconButton
                            onClick={() => dispatch(setAutoDBRange(!autoDBRange))}
                            size="small"
                            color={autoDBRange ? "warning" : "primary"}
                            title="Toggle automatic dB range"
                            sx={{
                                borderRadius: 0,
                                backgroundColor: autoDBRange ? 'rgba(46, 125, 50, 0.1)' : 'transparent',
                                '&:hover': {
                                    backgroundColor: autoDBRange ? 'rgba(46, 125, 50, 0.2)' : 'rgba(25, 118, 210, 0.1)'
                                }
                            }}
                        >
                            <AutoGraphIcon/>
                        </IconButton>

                        <IconButton
                            onClick={() => autoScaleDbRange()}
                            size="small"
                            color={"primary"}
                            title="Auto scale dB range once"
                        >
                            <HeightIcon/>
                        </IconButton>

                        <IconButton
                            onClick={toggleFullscreen}
                            color="primary"
                            title="Toggle fullscreen"
                        >
                            {isFullscreen ? <FullscreenExitIcon/> : <FullscreenIcon/>}
                        </IconButton>

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
                            display: showLeftSideWaterFallAccessories ? 'inherit' : 'none',
                            flexDirection: 'column',
                            flexShrink: 0,
                        }}
                    >
                        <canvas
                            ref={dBAxisScopeCanvasRef}
                            width={bandscopeAxisYWidth}
                            height={bandScopeHeight}
                            style={{
                                width: '100%',
                                height: `${bandScopeHeight}px`,
                                backgroundColor: 'rgba(40, 40, 40, 0.7)',
                                display: 'block',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                perspective: '1000px',
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
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                perspective: '1000px',
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
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                perspective: '1000px',
                            }}

                        />
                    </Box>

                    {/* Right column - Main visualization canvases */}
                    <WaterfallWithStrictXAxisZoom
                        bandscopeCanvasRef={bandscopeCanvasRef}
                        waterFallCanvasRef={waterFallCanvasRef}
                        centerFrequency={centerFrequency}
                        sampleRate={sampleRate}
                        waterFallWindowHeight={dimensions['height']}
                    />

                    <Box
                        sx={{
                            width: '50px',
                            minWidth: '50px',
                            maxWidth: '50px',
                            height: `calc(${dimensions['height']}px - 98px)`,
                            position: 'relative',
                            borderLeft: '1px solid rgba(255, 255, 255, 0.2)',
                            backgroundColor: 'rgba(28, 28, 28, 1)',
                            display: showRightSideWaterFallAccessories ? 'flex' : 'none',
                            flexDirection: 'column',
                            flexShrink: 0,
                        }}
                    >
                        <Stack spacing={0}>
                            <Button
                                startIcon={<HeightIcon/>}
                                variant="filled"
                                disabled={!isStreaming}
                                color={autoDBRange? "success": "info"}
                                onClick={autoScaleDbRange}
                                title="Auto range dB scale once"
                                sx={{
                                    borderRadius: 0,
                                }}
                            >
                            </Button>
                            <Button
                                variant={autoDBRange ? "contained" : "filled"}
                                disabled={!isStreaming}
                                color={autoDBRange ? "success" : "info"}
                                onClick={() => dispatch(setAutoDBRange(!autoDBRange))}
                                title="Toggle automatic dB scale"
                                sx={{
                                    borderRadius: 0,
                                    minWidth: '40px',
                                    padding: '6px'
                                }}
                            >
                                Auto
                            </Button>
                        </Stack>
                        <Box sx={{
                            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                            p: 0,
                            m: 0
                        }}>
                            <Typography
                                variant="body2"
                                sx={{
                                    mt: 0.5,
                                    width: '100%',
                                    textAlign: 'center',
                                    fontFamily: 'Monospace'
                            }}>
                                {dbRange[1]}
                            </Typography>
                        </Box>
                        <Slider
                            disabled={!isStreaming}
                            orientation="vertical"
                            value={dbRange}
                            onChange={(e, newValue) => {
                                dispatch(setDbRange(newValue));
                            }}
                            min={-120}
                            max={30}
                            step={1}
                            valueLabelDisplay="auto"
                            sx={{
                                width: '22px',
                                margin: '0 auto',
                                '& .MuiSlider-thumb': {
                                    width: 25,
                                    height: 25,
                                },
                                '& .MuiSlider-track': {
                                    width: 10
                                },
                                '& .MuiSlider-rail': {
                                    width: 10
                                }
                            }}
                        />

                        <Box sx={{
                            p: 0,
                            m: 0
                        }}>
                            <Typography
                                variant="body2"
                                sx={{
                                    width: '100%',
                                    textAlign: 'center',
                                    fontFamily: 'Monospace'
                            }}>
                                {dbRange[0]}
                            </Typography>
                        </Box>

                    </Box>
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
        </div>
    );
});

export default MainWaterfallDisplay;