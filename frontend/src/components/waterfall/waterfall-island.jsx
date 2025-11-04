/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
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
    Button,
    Stack,
    Slider,
    useTheme,
} from '@mui/material';
import {useDispatch, useSelector} from "react-redux";
import { AutoScaleOnceIcon, AutoDBIcon } from '../common/custom-icons.jsx';
import {
    getClassNamesBasedOnGridEditing,
    humanizeFrequency,
    humanizeNumber,
    TitleBar,
    WaterfallStatusBarPaper
} from "../common/common.jsx";
import WaterfallAndBandscope from './waterfall-bandscope.jsx'
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
    setBiasT,
    setTunerAgc,
    setRtlAgc,
    setStartStreamingLoading,
    setAutoDBRange,
    setShowRightSideWaterFallAccessories,
    setShowLeftSideWaterFallAccessories,
    setFFTWindow,
    setSelectedSDRId,
    setSelectedOffsetValue,
    setFFTAveraging,
    setShowRotatorDottedLines,
    setAutoScalePreset,
    saveWaterfallSnapshot,
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
    setVfoInactive,
    setVfoActive,
    setFFTdataOverflow,
} from './waterfall-slice.jsx';
import { toast } from "../../utils/toast-with-timestamp.jsx";
import { useSocket } from "../common/socket.jsx";
import {frequencyBands} from "./bandplans.jsx";
import WaterfallStatusBar from "./waterfall-statusbar.jsx";
import WaterfallToolbar from "./waterfall-toolbar.jsx";
import WaterfallErrorDialog from "./waterfall-error-dialog.jsx";
import useWaterfallStream from "./waterfall-stream.jsx";
import { useTranslation } from 'react-i18next';
import { useWaterfallSnapshot } from "./waterfall-snapshot.js";

// Make a new worker
export const createExternalWorker = () => {

    try {
        console.info("Creating external worker for waterfall")
        return new Worker(new URL('./waterfall-worker.js', import.meta.url));
    }
    catch (error) {
        toast.error(`Failed to create waterfall worker: ${error.message}`);
    }
};


const MainWaterfallDisplay = React.memo(function MainWaterfallDisplay() {
    const { t } = useTranslation('waterfall');
    const theme = useTheme();
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const waterFallCanvasRef = useRef(null);
    const bandscopeCanvasRef = useRef(null);
    const dBAxisScopeCanvasRef = useRef(null);
    const waterFallLeftMarginCanvasRef = useRef(null);
    const workerRef = useRef(null);
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
    const eventMetrics = useRef({
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
        fftAveraging,
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
        vfoColors,
        vfoActive,
        fftDataOverflow,
        fftDataOverflowLimit,
        showRotatorDottedLines,
    } = useSelector((state) => state.waterfall);

    // Initialize waterfall snapshot hook
    const { captureSnapshot } = useWaterfallSnapshot({
        bandscopeCanvasRef,
        dBAxisScopeCanvasRef,
        waterFallLeftMarginCanvasRef,
        bandScopeHeight,
        frequencyScaleHeight,
        waterFallCanvasHeight,
        waterFallCanvasWidth,
    });

    // Expose captureSnapshot globally for recording
    useEffect(() => {
        window.captureWaterfallSnapshot = captureSnapshot;
        return () => {
            delete window.captureWaterfallSnapshot;
        };
    }, [captureSnapshot]);
    const centerFrequencyRef = useRef(centerFrequency);
    const sampleRateRef = useRef(sampleRate);

    const {
        lastRotatorEvent
    } = useSelector((state) => state.targetSatTrack);

    const targetFPSRef = useRef(targetFPS);
    const waterfallControlRef = useRef(null);
    const lastRotatorEventRef = useRef("");
    const [scrollFactor, setScrollFactor] = useState(1);
    const accumulatedRowsRef = useRef(0);
    const [bandscopeAxisYWidth, setBandscopeAxisYWidth] = useState(60);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Rolling window rate limiting
    const overflowRef = useRef(false);
    const lastAllowedUpdateRef = useRef(0);
    const allowedIntervalRef = useRef(1000 / fftDataOverflowLimit);

    // Rolling window for rate tracking and track last 1 second of timestamps
    const timestampWindowRef = useRef([]);
    const windowSizeMs = 1000;

    const handleZoomIn = useCallback(() => {
        if (waterfallControlRef.current) {
            waterfallControlRef.current.zoomOnXAxisOnly(0.5, window.innerWidth / 2);
        }
    }, []);

    const handleZoomOut = useCallback(() => {
        if (waterfallControlRef.current) {
            waterfallControlRef.current.zoomOnXAxisOnly(-0.5, window.innerWidth / 2);
        }
    }, []);

    const handleZoomReset = useCallback(() => {
        if (waterfallControlRef.current) {
            waterfallControlRef.current.resetCustomTransform();
        }
    }, []);

    const toggleRotatorDottedLines = useCallback((value) => {
        console.log("Toggle Rotator Dotted Lines", value);
        dispatch(setShowRotatorDottedLines(value));

        // Send the toggle command to the worker
        if (workerRef.current) {
            workerRef.current.postMessage({
                cmd: 'toggleRotatorDottedLines',
                show: value,
            });
        }
    }, []);

    const handleSetAutoScalePreset = useCallback((preset) => {
        console.log("Set Auto-Scale Preset:", preset);

        // Update Redux state
        dispatch(setAutoScalePreset(preset));

        // Send the preset to the worker
        if (workerRef.current) {
            workerRef.current.postMessage({
                cmd: 'setAutoScalePreset',
                preset: preset,
            });
        }
    }, [dispatch]);

    const takeSnapshot = useCallback(async () => {
        try {
            const compositeImage = await captureSnapshot(1620);
            if (!compositeImage) {
                return;
            }

            // Send snapshot to backend using Redux async thunk
            dispatch(saveWaterfallSnapshot({ socket, waterfallImage: compositeImage, snapshotName: '' }))
                .unwrap()
                .then(() => {
                    toast.success('Waterfall snapshot saved successfully', { autoClose: 3000 });
                })
                .catch((error) => {
                    console.error('Failed to save snapshot:', error);
                    toast.error('Failed to save snapshot');
                });
        } catch (error) {
            console.error('Error in takeSnapshot:', error);
            toast.error('Error capturing snapshot');
        }
    }, [socket, dispatch, captureSnapshot]);

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
                            //setEventMetrics(data);
                            eventMetrics.current = data;
                        } else if (type === 'status') {
                            // Optional: handle status updates from the worker
                            //console.log('Worker status:', status);
                        } else if (type === 'autoScaleResult') {
                            const { dbRange, stats } = data;
                            console.log('New dB range:', dbRange);
                            console.log('Analysis stats:', stats);

                            // Update your Redux store
                            dispatch(setDbRange(dbRange));
                        } else if (type === 'waterfallCaptured') {
                            // Convert blob to data URL in main thread
                            const blob = data.blob;
                            const reader = new FileReader();
                            reader.onloadend = function() {
                                // Store the captured canvas data URL in window for retrieval
                                window.waterfallCanvasDataURL = reader.result;
                            };
                            reader.onerror = function(error) {
                                console.error('FileReader error:', error);
                                window.waterfallCanvasDataURL = null;
                            };
                            reader.readAsDataURL(blob);
                        } else if (type === 'waterfallCaptureFailed') {
                            console.error('Waterfall capture failed:', data?.error);
                            window.waterfallCanvasDataURL = null;
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
                        colorMap: colorMap,
                        dbRange: dbRange,
                        fftSize: fftSize,
                        showRotatorDottedLines: showRotatorDottedLines,
                        theme: {
                            palette: {
                                background: {
                                    default: theme.palette.background.default,
                                    paper: theme.palette.background.paper,
                                    elevated: theme.palette.background.elevated,
                                },
                                border: {
                                    main: theme.palette.border.main,
                                    light: theme.palette.border.light,
                                    dark: theme.palette.border.dark,
                                },
                                overlay: {
                                    light: theme.palette.overlay.light,
                                    medium: theme.palette.overlay.medium,
                                    dark: theme.palette.overlay.dark,
                                },
                                text: {
                                    primary: theme.palette.text.primary,
                                    secondary: theme.palette.text.secondary,
                                }
                            }
                        }
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

    // Add event listener for waterfall canvas capture
    useEffect(() => {
        const handleCaptureCanvas = () => {
            if (workerRef.current) {
                // Request canvas capture from worker
                workerRef.current.postMessage({
                    cmd: 'captureWaterfallCanvas'
                });
            } else {
                console.error('Worker ref is not available');
            }
        };

        window.addEventListener('capture-waterfall-canvas', handleCaptureCanvas);

        return () => {
            window.removeEventListener('capture-waterfall-canvas', handleCaptureCanvas);
        };
    }, []);

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


    const { startStreaming, stopStreaming, playButtonEnabledOrNot } = useWaterfallStream({
        workerRef,
        targetFPSRef
    });

    useEffect(() => {
        if (!workerRef.current) return;

        workerRef.current.postMessage({
            cmd: 'updateConfig',
            colorMap,
            dbRange,
            fftSize,
            theme: {
                palette: {
                    background: {
                        default: theme.palette.background.default,
                        paper: theme.palette.background.paper,
                        elevated: theme.palette.background.elevated,
                    },
                    border: {
                        main: theme.palette.border.main,
                        light: theme.palette.border.light,
                        dark: theme.palette.border.dark,
                    },
                    overlay: {
                        light: theme.palette.overlay.light,
                        medium: theme.palette.overlay.medium,
                        dark: theme.palette.overlay.dark,
                    },
                    text: {
                        primary: theme.palette.text.primary,
                        secondary: theme.palette.text.secondary,
                    }
                }
            }
        });
    }, [colorMap, dbRange, fftSize, theme.palette.background, theme.palette.border, theme.palette.overlay, theme.palette.text]);

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
                workerRef.current.postMessage({ cmd: 'autoScaleDbRange' });
            }, 2000); // Update 2 seconds
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [isStreaming, autoDBRange]);

    const toggleLeftSide = () => dispatch(setShowLeftSideWaterFallAccessories(!showLeftSideWaterFallAccessories));
    const toggleRightSide = () => dispatch(setShowRightSideWaterFallAccessories(!showRightSideWaterFallAccessories));
    const toggleAutoRange = () => dispatch(setAutoDBRange(!autoDBRange));
    const autoScale = () => {
        if (workerRef.current) {
            workerRef.current.postMessage({ cmd: 'autoScaleDbRange' });
        }
    };
    const handleToggleVfo = (index) => {
        if (vfoActive[index]) {
            dispatch(setVfoInactive(index));
        } else {
            dispatch(setVfoActive(index));
        }
    };

    return (
        <div ref={mainWaterFallContainer}>
        <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>{t('main_title')}</TitleBar>
            <Box
                sx={{
                    display: 'flex',
                    gap: 1,
                    justifyContent: 'left',
                    flexWrap: 'wrap',
                }}
            >
                <WaterfallToolbar
                    startStreamingLoading={startStreamingLoading}
                    playButtonDisabled={playButtonEnabledOrNot()}
                    startStreaming={startStreaming}
                    stopStreaming={stopStreaming}
                    isStreaming={isStreaming}
                    showLeftSideWaterFallAccessories={showLeftSideWaterFallAccessories}
                    toggleLeftSideWaterFallAccessories={toggleLeftSide}
                    showRightSideWaterFallAccessories={showRightSideWaterFallAccessories}
                    toggleRightSideWaterFallAccessories={toggleRightSide}
                    autoDBRange={autoDBRange}
                    toggleAutoDBRange={toggleAutoRange}
                    autoScale={autoScale}
                    toggleFullscreen={toggleFullscreen}
                    isFullscreen={isFullscreen}
                    handleZoomIn={handleZoomIn}
                    handleZoomOut={handleZoomOut}
                    handleZoomReset={handleZoomReset}
                    vfoColors={vfoColors}
                    vfoActive={vfoActive}
                    toggleVfo={handleToggleVfo}
                    takeSnapshot={takeSnapshot}
                    fftDataOverflow={fftDataOverflow}
                    showRotatorDottedLines={showRotatorDottedLines}
                    toggleRotatorDottedLines={toggleRotatorDottedLines}
                    setAutoScalePreset={handleSetAutoScalePreset}
                />
            </Box>

            {/* Container for both bandscope and waterfall */}

            <Box
                sx={{
                    width: '100%',
                    height: '100%',
                    bgcolor: theme.palette.background.default,
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
                        className={"left-vertical-bar"}
                        sx={{
                            width: bandscopeAxisYWidth,
                            minWidth: bandscopeAxisYWidth,
                            maxWidth: bandscopeAxisYWidth,
                            height: '1000px',
                            position: 'relative',
                            //borderRight: '1px solid rgba(255, 255, 255, 0.2)',
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
                                backgroundColor: theme.palette.background.elevated,
                                display: 'block',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                perspective: '1000px',
                                borderRight: `1px solid ${theme.palette.border.light}`,
                            }}
                        />
                        <canvas
                            width={bandscopeAxisYWidth}
                            height={21}
                            style={{
                                width: '100%',
                                height: '21px',
                                backgroundColor: theme.palette.background.paper,
                                borderTop: `1px solid ${theme.palette.border.main}`,
                                borderRight: `1px solid ${theme.palette.border.light}`,
                                display: 'block',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                perspective: '1000px',
                            }}
                        />
                        <canvas
                            className={"waterfall-left-margin-canvas"}
                            ref={waterFallLeftMarginCanvasRef}
                            width={bandscopeAxisYWidth}
                            height={waterFallCanvasHeight}
                            style={{
                                width: '100%',
                                //height: `${dimensions['height'] - 230}px`,
                                height: `${waterFallCanvasHeight}px`,
                                display: 'block',
                                backgroundColor: theme.palette.background.paper,
                                borderRight: `1px solid ${theme.palette.border.light}`,
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                perspective: '1000px',
                            }}

                        />
                    </Box>

                    {/* Main visualization canvases */}
                    <WaterfallAndBandscope
                        ref={waterfallControlRef}
                        bandscopeCanvasRef={bandscopeCanvasRef}
                        waterFallCanvasRef={waterFallCanvasRef}
                        centerFrequency={centerFrequency}
                        sampleRate={sampleRate}
                        waterFallWindowHeight={dimensions['height']}
                        frequencyBands={frequencyBands}
                    />
                    <Box
                        className={'right-vertical-bar'}
                        sx={{
                            width: '50px',
                            minWidth: '50px',
                            maxWidth: '50px',
                            height: `calc(${dimensions['height']}px - 98px)`,
                            position: 'relative',
                            borderLeft: `1px solid ${theme.palette.border.main}`,
                            backgroundColor: theme.palette.background.paper,
                            display: showRightSideWaterFallAccessories ? 'flex' : 'none',
                            flexDirection: 'column',
                            flexShrink: 0,
                        }}
                    >
                        <Stack spacing={0}>
                            <Button
                                startIcon={<AutoScaleOnceIcon/>}
                                variant="filled"
                                disabled={!isStreaming}
                                color={autoDBRange? "success": "info"}
                                onClick={() => {
                                    workerRef.current.postMessage({ cmd: 'autoScaleDbRange' });
                                }}
                                title="Auto range dB scale once"
                                sx={{
                                    borderRadius: 0,
                                }}
                            >
                            </Button>
                            <Button
                                startIcon={<AutoDBIcon/>}
                                variant={autoDBRange ? "contained" : "filled"}
                                disabled={!isStreaming}
                                color={autoDBRange ? "success" : "info"}
                                onClick={() => dispatch(setAutoDBRange(!autoDBRange))}
                                title="Toggle automatic dB scale"
                                sx={{
                                    borderRadius: 0,
                                }}
                            >
                            </Button>
                        </Stack>
                        <Box sx={{
                            borderTop: `1px solid ${theme.palette.border.main}`,
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
                                },
                                '& .MuiSlider-valueLabel': {
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    fontFamily: 'Monospace',
                                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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

            <WaterfallErrorDialog
                open={errorMessage !== '' && errorDialogOpen}
                message={errorMessage}
                onClose={() => dispatch(setErrorDialogOpen(false))}
            />
            <WaterfallStatusBar isStreaming={isStreaming} eventMetrics={eventMetrics} centerFrequency={centerFrequency} sampleRate={sampleRate} gain={gain} />
        </div>
    );
});

export default MainWaterfallDisplay;