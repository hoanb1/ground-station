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
import {
    enableVFO1,
    enableVFO2,
    enableVFO3,
    enableVFO4,
    disableVFO1,
    disableVFO2,
    disableVFO3,
    disableVFO4,
    setVFOProperty,
} from './waterfall-slice.jsx';

import {enqueueSnackbar} from "notistack";
import { useStore } from 'react-redux';
import {v4 as uuidv4} from 'uuid';
import TuneIcon from "@mui/icons-material/Tune";

// Make a new worker
export const createExternalWorker = () => {

    try {
        console.info("Creating external worker for waterfall")
        return new Worker(new URL('./waterfall-worker.jsx', import.meta.url));
    }
    catch (error) {
        enqueueSnackbar(`Failed to create waterfall worker: ${error.message}`, {
            variant: 'error'
        });
    }
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
    const canvasTransferredRef = useRef(false);
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
        fftUpdatesPerSecond: 0,
        binsPerSecond: 0,
        totalUpdates: 0,
        timeElapsed: 0,
        renderWaterfallPerSecond: 0,
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
        vfoMarkers,
        maxVFOMarkers,
    } = useSelector((state) => state.waterfall);
    const centerFrequencyRef = useRef(centerFrequency);
    const sampleRateRef = useRef(sampleRate);

    const {
        lastRotatorEvent
    } = useSelector((state) => state.targetSatTrack);

    const targetFPSRef = useRef(targetFPS);
    const lastRotatorEventRef = useRef("");
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

    useEffect(() => {
        if (workerRef.current) {
            workerRef.current.postMessage({
                cmd: 'rotatorEvent',
                event: lastRotatorEvent,
            });
        }
    }, [lastRotatorEvent]);

    useEffect(() => {
        if (waterFallCanvasRef.current && !canvasTransferredRef.current) {
            try {
                // Create the offscreen canvas, if it gets called twice it won't work
                const waterfallOffscreenCanvas = waterFallCanvasRef.current.transferControlToOffscreen();
                const bandscopeOffscreenCanvas = bandscopeCanvasRef.current.transferControlToOffscreen();
                const dBAxisOffScreenCanvas = dBAxisScopeCanvasRef.current.transferControlToOffscreen();
                const waterfallLeftMarginCanvas = waterFallLeftMarginCanvasRef.current.transferControlToOffscreen();
                canvasTransferredRef.current = true;

                // Initialize the worker if it doesn't exist
                if (!workerRef.current) {
                    workerRef.current = createExternalWorker();

                    // Set up message handling from the worker
                    workerRef.current.onmessage = (event) => {
                        const { type, data } = event.data;

                        if (type === 'metrics') {
                            setEventMetrics(data);
                        } else if (type === 'status') {
                            // Optional: handle status updates from the worker
                            //console.log('Worker status:', status);
                        }
                    };
                } else {
                    console.info('Waterfall worker already exists');
                }

                // Transfer the canvases to the worker
                workerRef.current.postMessage({
                    cmd: 'initCanvas',
                    waterfallCanvas: waterfallOffscreenCanvas,
                    bandscopeCanvas: bandscopeOffscreenCanvas,
                    dBAxisCanvas: dBAxisOffScreenCanvas,
                    waterfallLeftMarginCanvas: waterfallLeftMarginCanvas,
                    config: {
                        width: waterFallCanvasWidth,
                        height: waterFallCanvasHeight,
                        colorMap,
                        dbRange,
                        fftSize
                    }
                }, [waterfallOffscreenCanvas, bandscopeOffscreenCanvas, dBAxisOffScreenCanvas, waterfallLeftMarginCanvas]);

                console.log('Canvases successfully transferred');

            } catch (error) {
                console.error('Canvases transfer failed:', error);
                // Reset the flag if transfer failed
                canvasTransferredRef.current = false;
            }
        }

        return () => {
            // // Clean up
            // if (workerRef.current) {
            //     workerRef.current.postMessage({ cmd: 'releaseCanvas' });
            // }

            // We don't want to clean up the worker or reset the transfer flag
            // in the cleanup function since StrictMode will call this
            // and then immediately call the effect again

            // Only clean up when component is actually unmounting
            // We can't easily detect this in the cleanup function,
            // so we'll handle it elsewhere
        };
    }, []);

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


    useEffect(() => {

        socket.on('disconnect', () => {
            cancelAnimations();
            dispatch(setIsStreaming(false));
        });

        socket.on('sdr-config-error', (error) => {
            //console.error(`sdr-config-error`, error);

            dispatch(setErrorMessage(error.message));
            dispatch(setErrorDialogOpen(true));
            dispatch(setStartStreamingLoading(false));
            enqueueSnackbar(`Failed to configure SDR: ${error.message}`, {
                variant: 'error'
            });
        });

        socket.on('sdr-error', (error) => {
            //console.error(`sdr-error`, error);

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
            //console.info(`sdr-config`, data);

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
            //console.info(`sdr-status`, data);

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
                workerRef.current.postMessage({
                    cmd: 'updateFFTData',
                    fft: floatArray,
                    immediate: true,
                });
            }
        });

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

    useEffect(() => {
        if (!workerRef.current) return;

        workerRef.current.postMessage({
            cmd: 'updateConfig',
            colorMap,
            dbRange,
            fftSize
        });
    }, [colorMap, dbRange, fftSize]);

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

    // Configure SDR and start streaming
    const startStreaming = () => {

        if (!isStreaming) {
            // Clean up last rotator event
            lastRotatorEventRef.current = "";

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
                    //setTimeout(() => autoScaleDbRange(), 1500);
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
                            sx={{
                                borderRadius: 0,
                            }}
                            onClick={() => autoScaleDbRange()}
                            size="small"
                            color="primary"
                            title="Auto scale dB range once"
                        >
                            <HeightIcon/>
                        </IconButton>

                        <IconButton
                            sx={{
                                borderRadius: 0,
                            }}
                            onClick={toggleFullscreen}
                            color="primary"
                            title="Toggle fullscreen"
                        >
                            {isFullscreen ? <FullscreenExitIcon/> : <FullscreenIcon/>}
                        </IconButton>

                        <IconButton
                            sx={{
                                borderRadius: 0,
                                width: 40,
                                fontSize: '1.25rem',
                                fontFamily: "Monospace",
                                fontWeight: "bold",
                                color: '#FF0000',
                                backgroundColor: vfoMarkers[1]['active'] ? 'rgba(255,0,0,0.1)' : 'transparent',
                                '&:hover': {
                                    backgroundColor: vfoMarkers[1]['active'] ? 'rgba(255,0,0,0.2)' : 'rgba(0,0,0,0.1)'
                                }
                            }}
                            onClick={() => {
                                const vfoColor = '#FF0000';
                                if (vfoMarkers[1]['active']) {
                                    dispatch(setVFOProperty({
                                        vfoNumber: 1, updates: {
                                            frequency: centerFrequency,
                                            color: vfoColor,
                                            active: false,
                                        }
                                    }));
                                } else {
                                    dispatch(setVFOProperty({
                                        vfoNumber: 1, updates: {
                                            frequency: centerFrequency,
                                            color: vfoColor,
                                            active: true,
                                        }
                                    }));
                                }
                            }}
                            color={vfoMarkers[1]['active'] ? "warning" : "primary"}
                            title="Toggle VFO 1"
                        >
                            1
                        </IconButton>

                        <IconButton
                            sx={{
                                borderRadius: 0,
                                width: 40,
                                fontSize: '1.25rem',
                                fontFamily: "Monospace",
                                fontWeight: "bold",
                                color: '#1d6a1d',
                                backgroundColor: vfoMarkers[2]['active'] ? 'rgba(0,255,0,0.1)' : 'transparent',
                                '&:hover': {
                                    backgroundColor: vfoMarkers[2]['active'] ? 'rgba(0,255,0,0.2)' : 'rgba(0,0,0,0.1)'
                                }
                            }}
                            onClick={() => {
                                const vfoColor = '#1d6a1d';
                                if (vfoMarkers[2]['active']) {
                                    dispatch(setVFOProperty({
                                        vfoNumber: 2, updates: {
                                            frequency: centerFrequency,
                                            color: vfoColor,
                                            active: false,
                                        }
                                    }));
                                } else {
                                    dispatch(setVFOProperty({
                                        vfoNumber: 2, updates: {
                                            frequency: centerFrequency,
                                            color: vfoColor,
                                            active: true,
                                        }
                                    }));
                                }
                            }}
                            color={vfoMarkers[2]['active'] ? "warning" : "primary"}
                            title="Toggle VFO 2"
                        >
                            2
                        </IconButton>

                        <IconButton
                            sx={{
                                borderRadius: 0,
                                width: 40,
                                fontSize: '1.25rem',
                                fontFamily: "Monospace",
                                fontWeight: "bold",
                                color: '#4d4df6',
                                backgroundColor: vfoMarkers[3]['active'] ? 'rgba(0,0,255,0.1)' : 'transparent',
                                '&:hover': {
                                    backgroundColor: vfoMarkers[3]['active'] ? 'rgba(0,0,255,0.2)' : 'rgba(0,0,0,0.1)'
                                }
                            }}
                            onClick={() => {
                                const vfoColor = '#4d4df6';
                                if (vfoMarkers[3]['active']) {
                                    dispatch(setVFOProperty({
                                        vfoNumber: 3, updates: {
                                            frequency: centerFrequency,
                                            color: vfoColor,
                                            active: false,
                                        }
                                    }));
                                } else {
                                    dispatch(setVFOProperty({
                                        vfoNumber: 3, updates: {
                                            frequency: centerFrequency,
                                            color: vfoColor,
                                            active: true,
                                        }
                                    }));
                                }
                            }}
                            color={vfoMarkers[3]['active'] ? "warning" : "primary"}
                            title="Toggle VFO 3"
                        >
                            3
                        </IconButton>

                        <IconButton
                            sx={{
                                borderRadius: 0,
                                width: 40,
                                fontSize: '1.25rem',
                                fontFamily: "Monospace",
                                fontWeight: "bold",
                                color: '#a500a5',
                                backgroundColor: vfoMarkers[4]['active'] ? 'rgba(255,0,255,0.1)' : 'transparent',
                                '&:hover': {
                                    backgroundColor: vfoMarkers[4]['active'] ? 'rgba(255,0,255,0.2)' : 'rgba(0,0,0,0.1)'
                                }
                            }}
                            onClick={() => {
                                const vfoColor = '#a500a5';
                                if (vfoMarkers[4]['active']) {
                                    dispatch(setVFOProperty({
                                        vfoNumber: 4, updates: {
                                            frequency: centerFrequency,
                                            color: vfoColor,
                                            active: false,
                                        }
                                    }));
                                } else {
                                    dispatch(setVFOProperty({
                                        vfoNumber: 4, updates: {
                                            frequency: centerFrequency,
                                            color: vfoColor,
                                            active: true,
                                        }
                                    }));
                                }
                            }}
                            color={vfoMarkers[4]['active'] ? "warning" : "primary"}
                            title="Toggle VFO 4"
                        >
                            4
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
                                height: `${dimensions['height']-230}px`,
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
                    `FPS: ${eventMetrics.renderWaterfallPerSecond}, FFTs/s: ${humanizeNumber(eventMetrics.fftUpdatesPerSecond)}, bins/s: ${humanizeNumber(eventMetrics.binsPerSecond)}, f: ${humanizeFrequency(centerFrequency)}, sr: ${humanizeFrequency(sampleRate)}, g: ${gain} dB`
                    : `stopped`
                }
            </WaterfallStatusBar>
        </div>
    );
});

export default MainWaterfallDisplay;