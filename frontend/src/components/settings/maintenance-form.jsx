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

import {gridLayoutStoreName as overviewGridLayoutName} from "../overview/main-layout.jsx";
import {gridLayoutStoreName as targetGridLayoutName} from "../target/main-layout.jsx";
import {gridLayoutStoreName as waterfallGridLayoutName} from "../waterfall/main-layout.jsx";
import Paper from "@mui/material/Paper";
import {Alert, AlertTitle, Box, Button, Divider, Typography, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions} from "@mui/material";
import Grid from "@mui/material/Grid2";
import React, {useState} from "react";
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import InfoIcon from '@mui/icons-material/Info';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import { useSocket } from "../common/socket.jsx";
import { useTranslation } from 'react-i18next';

const MaintenanceForm = () => {
    const { socket } = useSocket();
    const { t } = useTranslation('settings');

    // Feature detection states
    const [workersSupported, setWorkersSupported] = useState(null);
    const [offscreenCanvasSupported, setOffscreenCanvasSupported] = useState(null);
    const [offscreenTransferSupported, setOffscreenTransferSupported] = useState(null);
    const [offscreenInWorkerSupported, setOffscreenInWorkerSupported] = useState(null);
    const [canvasTransferToWorkerSupported, setCanvasTransferToWorkerSupported] = useState(null);

    // Test status states
    const [isTestingWorkers, setIsTestingWorkers] = useState(false);
    const [isTestingOffscreen, setIsTestingOffscreen] = useState(false);
    const [isTestingOffscreenInWorker, setIsTestingOffscreenInWorker] = useState(false);
    const [isTestingCanvasTransfer, setIsTestingCanvasTransfer] = useState(false);

    // Test result states
    const [workerTestResult, setWorkerTestResult] = useState(null);
    const [offscreenTestResult, setOffscreenTestResult] = useState(null);
    const [offscreenInWorkerResult, setOffscreenInWorkerResult] = useState(null);
    const [canvasTransferResult, setCanvasTransferResult] = useState(null);

    // Service restart states
    const [isRestarting, setIsRestarting] = useState(false);
    const [restartMessage, setRestartMessage] = useState('');
    const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);

    // Maintenance functions
    const clearLayoutLocalStorage = () => {
        localStorage.setItem(overviewGridLayoutName, null);
        localStorage.setItem(targetGridLayoutName, null);
        localStorage.setItem(waterfallGridLayoutName, null);
    }

    const clearReduxPersistentState = () => {
        // Clear all Redux persist keys
        const persistKeys = [
            'persist:waterfall',
            'persist:rigs',
            'persist:rotators',
            'persist:tleSources',
            'persist:satellites',
            'persist:satelliteGroups',
            'persist:location',
            'persist:synchronize',
            'persist:preferences',
            'persist:targetSatTrack',
            'persist:overviewSatTrack',
            'persist:dashboard',
            'persist:weather',
            'persist:camera',
            'persist:sdr',
            'persist:version',
            'persist:filebrowser',
            'persist:root'
        ];

        persistKeys.forEach(key => {
            localStorage.removeItem(key);
        });
    }

    const clearFileBrowserPersist = () => {
        localStorage.removeItem('persist:filebrowser');
    }

    const clearWaterfallPersist = () => {
        localStorage.removeItem('persist:waterfall');
    }

    const clearPreferencesPersist = () => {
        localStorage.removeItem('persist:preferences');
    }

    const clearOverviewSatTrackPersist = () => {
        localStorage.removeItem('persist:overviewSatTrack');
    }

    const clearCameraPersist = () => {
        localStorage.removeItem('persist:camera');
    }

    // Service restart function
    const handleServiceRestart = () => {
        setConfirmRestartOpen(false);
        setIsRestarting(true);
        setRestartMessage('Initiating service restart...');

        socket.emit("service_control", "restart_service", null, (response) => {
            if (response.status === "success") {
                setRestartMessage('Service is restarting. All connections will be terminated.');

                // Start countdown
                let countdown = 15;
                const countdownInterval = setInterval(() => {
                    setRestartMessage(`Service restarting... Page will reload in ${countdown} seconds`);
                    countdown--;

                    if (countdown <= 0) {
                        clearInterval(countdownInterval);
                    }
                }, 1000);
            } else {
                console.error('Service restart failed:', response.error);
                setRestartMessage(`Failed to restart service: ${response.error}`);
                setIsRestarting(false);
            }
        });
    };

    // Test transfer support once
    React.useEffect(() => {
        if (typeof document !== 'undefined') {
            const testCanvas = document.createElement('canvas');
            setOffscreenTransferSupported(typeof testCanvas.transferControlToOffscreen === 'function');
        }
    }, []);

    // Auto-trigger all tests 1 second after component load
    React.useEffect(() => {
        const timer = setTimeout(() => {
            // Trigger all 4 tests simultaneously
            testWebWorkers();
            testOffscreenCanvas();
            testOffscreenCanvasInWorker();
            testCanvasTransferToWorker();
        }, 1000);

        // Cleanup timer on component unmount
        return () => clearTimeout(timer);
    }, []);

    // Test functions
    const testWebWorkers = () => {
        setIsTestingWorkers(true);
        setWorkerTestResult(null);

        if (typeof Worker !== 'undefined') {
            try {
                // Create a simple worker from a blob
                const workerBlob = new Blob([
                    'self.onmessage = function(e) { self.postMessage("Worker received: " + e.data); };'
                ], { type: 'application/javascript' });

                const workerURL = URL.createObjectURL(workerBlob);
                const worker = new Worker(workerURL);

                worker.onmessage = function(e) {
                    setWorkerTestResult(e.data);
                    setWorkersSupported(true);
                    URL.revokeObjectURL(workerURL);
                    worker.terminate();
                    setIsTestingWorkers(false);
                };

                worker.onerror = function(error) {
                    setWorkerTestResult(`Error: ${error.message}`);
                    setWorkersSupported(false);
                    URL.revokeObjectURL(workerURL);
                    worker.terminate();
                    setIsTestingWorkers(false);
                };

                worker.postMessage('Hello from maintenance page');
            } catch (error) {
                setWorkerTestResult(`Error creating Web Worker: ${error.message}`);
                setWorkersSupported(false);
                setIsTestingWorkers(false);
            }
        } else {
            setWorkerTestResult('Web Workers are not supported in this browser');
            setWorkersSupported(false);
            setIsTestingWorkers(false);
        }
    };

    const testOffscreenCanvas = () => {
        setIsTestingOffscreen(true);
        setOffscreenTestResult(null);

        if (typeof OffscreenCanvas !== 'undefined') {
            try {
                // Create a simple offscreen canvas and draw something
                const offscreenCanvas = new OffscreenCanvas(100, 100);
                const ctx = offscreenCanvas.getContext('2d');
                ctx.fillStyle = 'green';
                ctx.fillRect(0, 0, 100, 100);

                // Test successful
                setOffscreenCanvasSupported(true);
                setOffscreenTestResult('OffscreenCanvas successfully created and drawn to');
                setIsTestingOffscreen(false);
            } catch (error) {
                setOffscreenCanvasSupported(false);
                setOffscreenTestResult(`Error: ${error.message}`);
                setIsTestingOffscreen(false);
            }
        } else {
            setOffscreenCanvasSupported(false);
            setOffscreenTestResult('OffscreenCanvas is not supported in this browser');
            setIsTestingOffscreen(false);
        }
    };

    const testOffscreenCanvasInWorker = () => {
        setIsTestingOffscreenInWorker(true);
        setOffscreenInWorkerResult(null);

        if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
            setOffscreenInWorkerSupported(false);
            setOffscreenInWorkerResult('Either Web Workers or OffscreenCanvas is not supported in this browser');
            setIsTestingOffscreenInWorker(false);
            return;
        }

        try {
            // Create worker code as a blob
            const workerCode = `
                self.onmessage = function(e) {
                    try {
                        // Try to create an OffscreenCanvas in the worker
                        const offscreenCanvas = new OffscreenCanvas(200, 200);
                        const ctx = offscreenCanvas.getContext('2d');
                        
                        // Draw a simple pattern
                        ctx.fillStyle = 'blue';
                        ctx.fillRect(0, 0, 200, 200);
                        ctx.fillStyle = 'red';
                        ctx.fillRect(50, 50, 100, 100);
                        
                        // Try to create a bitmap from the canvas
                        offscreenCanvas.convertToBlob()
                            .then(blob => {
                                // If we get here, it worked!
                                self.postMessage({
                                    success: true,
                                    message: 'OffscreenCanvas works in worker and created a blob of ' + blob.size + ' bytes'
                                });
                            })
                            .catch(error => {
                                self.postMessage({
                                    success: false,
                                    message: 'OffscreenCanvas created but convertToBlob failed: ' + error.message
                                });
                            });
                    } catch (error) {
                        self.postMessage({
                            success: false,
                            message: 'Error using OffscreenCanvas in worker: ' + error.message
                        });
                    }
                };
            `;

            const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
            const workerURL = URL.createObjectURL(workerBlob);
            const worker = new Worker(workerURL);

            worker.onmessage = function(e) {
                const { success, message } = e.data;
                setOffscreenInWorkerSupported(success);
                setOffscreenInWorkerResult(message);
                URL.revokeObjectURL(workerURL);
                worker.terminate();
                setIsTestingOffscreenInWorker(false);
            };

            worker.onerror = function(error) {
                setOffscreenInWorkerSupported(false);
                setOffscreenInWorkerResult(`Worker error: ${error.message}`);
                URL.revokeObjectURL(workerURL);
                worker.terminate();
                setIsTestingOffscreenInWorker(false);
            };

            // Start the test
            worker.postMessage('start');
        } catch (error) {
            setOffscreenInWorkerSupported(false);
            setOffscreenInWorkerResult(`Error setting up worker: ${error.message}`);
            setIsTestingOffscreenInWorker(false);
        }
    };

    const testCanvasTransferToWorker = () => {
        setIsTestingCanvasTransfer(true);
        setCanvasTransferResult(null);

        // Perform real-time feature detection
        const workersDetected = typeof Worker !== 'undefined';
        let transferDetected = false;

        if (typeof document !== 'undefined') {
            try {
                const testCanvas = document.createElement('canvas');
                transferDetected = typeof testCanvas.transferControlToOffscreen === 'function';
            } catch (e) {
                transferDetected = false;
            }
        }

        if (!workersDetected || !transferDetected) {
            setCanvasTransferToWorkerSupported(false);
            setCanvasTransferResult('Either Web Workers or transferControlToOffscreen is not supported');
            setIsTestingCanvasTransfer(false);
            return;
        }

        try {
            // Create a canvas element
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;

            // Add to DOM temporarily - important for some browsers
            document.body.appendChild(canvas);

            // Create worker code
            const workerCode = `
                self.onmessage = function(e) {
                    try {
                        const offscreenCanvas = e.data.canvas;
                        const ctx = offscreenCanvas.getContext('2d');
                        
                        // Draw something on the transferred canvas
                        ctx.fillStyle = 'purple';
                        ctx.fillRect(0, 0, 200, 200);
                        ctx.fillStyle = 'yellow';
                        ctx.fillRect(50, 50, 100, 100);
                        
                        self.postMessage({
                            success: true,
                            message: 'Successfully used transferred canvas in worker'
                        });
                    } catch (error) {
                        self.postMessage({
                            success: false,
                            message: 'Error using transferred canvas: ' + error.message
                        });
                    }
                };
            `;

            const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
            const workerURL = URL.createObjectURL(workerBlob);
            const worker = new Worker(workerURL);

            worker.onmessage = function(e) {
                const { success, message } = e.data;
                setCanvasTransferToWorkerSupported(success);
                setCanvasTransferResult(message);
                URL.revokeObjectURL(workerURL);
                worker.terminate();

                // Clean up the test canvas
                if (document.body.contains(canvas)) {
                    document.body.removeChild(canvas);
                }

                setIsTestingCanvasTransfer(false);
            };

            worker.onerror = function(error) {
                setCanvasTransferToWorkerSupported(false);
                setCanvasTransferResult(`Worker error: ${error.message}`);
                URL.revokeObjectURL(workerURL);
                worker.terminate();

                // Clean up the test canvas
                if (document.body.contains(canvas)) {
                    document.body.removeChild(canvas);
                }

                setIsTestingCanvasTransfer(false);
            };

            // Transfer the canvas to the worker
            const offscreenCanvas = canvas.transferControlToOffscreen();
            worker.postMessage({ canvas: offscreenCanvas }, [offscreenCanvas]);
        } catch (error) {
            // Clean up any canvas that might have been created
            const canvases = document.querySelectorAll('canvas');
            canvases.forEach(canvas => {
                if (!canvas.parentElement || canvas.parentElement === document.body) {
                    document.body.removeChild(canvas);
                }
            });

            setCanvasTransferToWorkerSupported(false);
            setCanvasTransferResult(`Error transferring canvas: ${error.message}`);
            setIsTestingCanvasTransfer(false);
        }
    };

    // Test transfer support once
    React.useEffect(() => {
        if (typeof document !== 'undefined') {
            const testCanvas = document.createElement('canvas');
            setOffscreenTransferSupported(typeof testCanvas.transferControlToOffscreen === 'function');
        }
    }, []);

    const getSupportIcon = (supported) => {
        if (supported === null) return <InfoIcon color="info" />;
        return supported ? <CheckCircleIcon color="success" /> : <CancelIcon color="error" />;
    };

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0  }}>
            <Alert severity="info">
                <AlertTitle>{t('maintenance.title')}</AlertTitle>
                {t('maintenance.subtitle')}
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <Grid container spacing={3}>
                    {/* Left Column - Storage & Settings Management */}
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Paper elevation={1} sx={{ p: 2, height: '100%' }}>
                            <Typography variant="h6" gutterBottom>
                                Storage & Settings Management
                            </Typography>
                            <Divider sx={{ mb: 2 }} />

                            <Grid container spacing={2} columns={16}>
                                <Grid size={16}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        Grid Layout Storage
                                    </Typography>
                                </Grid>
                                <Grid size={10}>
                                    {t('maintenance.clear_layout')}
                                </Grid>
                                <Grid size={6}>
                                    <Button
                                        variant="contained"
                                        color="warning"
                                        onClick={clearLayoutLocalStorage}
                                        fullWidth
                                        size="small"
                                    >
                                        {t('maintenance.clear_layout_button')}
                                    </Button>
                                </Grid>

                                <Grid size={16}>
                                    <Divider sx={{ my: 2 }} />
                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                        Redux Persistent Settings
                                    </Typography>
                                </Grid>

                                <Grid size={16}>
                                    <Alert severity="warning" sx={{ mb: 2 }}>
                                        <AlertTitle>Clear All Redux Settings</AlertTitle>
                                        This will reset all application settings below to their defaults. Use individual buttons to clear specific settings only.
                                    </Alert>
                                </Grid>

                                <Grid size={10}>
                                    {t('maintenance.clear_redux')}
                                    <Typography variant="body2" color="text.secondary">
                                        Clears all Redux persistent data (all settings below)
                                    </Typography>
                                </Grid>
                                <Grid size={6}>
                                    <Button
                                        variant="contained"
                                        color="error"
                                        onClick={clearReduxPersistentState}
                                        fullWidth
                                        size="small"
                                    >
                                        {t('maintenance.clear_redux_button')}
                                    </Button>
                                </Grid>

                                <Grid size={16}>
                                    <Divider sx={{ my: 2 }} />
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Or clear individual settings:
                                    </Typography>
                                </Grid>

                                <Grid size={10}>
                                    Clear File Browser Settings
                                    <Typography variant="body2" color="text.secondary">
                                        Resets page size, sorting, filters, and view mode
                                    </Typography>
                                </Grid>
                                <Grid size={6}>
                                    <Button
                                        variant="outlined"
                                        color="warning"
                                        onClick={clearFileBrowserPersist}
                                        fullWidth
                                        size="small"
                                    >
                                        Clear
                                    </Button>
                                </Grid>

                                <Grid size={10}>
                                    Clear Waterfall Settings
                                    <Typography variant="body2" color="text.secondary">
                                        Resets frequency, gain, sample rate, colormap, FFT settings, VFO markers
                                    </Typography>
                                </Grid>
                                <Grid size={6}>
                                    <Button
                                        variant="outlined"
                                        color="warning"
                                        onClick={clearWaterfallPersist}
                                        fullWidth
                                        size="small"
                                    >
                                        Clear
                                    </Button>
                                </Grid>

                                <Grid size={10}>
                                    Clear Preferences
                                    <Typography variant="body2" color="text.secondary">
                                        Resets all user preferences like timezone, theme, etc.
                                    </Typography>
                                </Grid>
                                <Grid size={6}>
                                    <Button
                                        variant="outlined"
                                        color="warning"
                                        onClick={clearPreferencesPersist}
                                        fullWidth
                                        size="small"
                                    >
                                        Clear
                                    </Button>
                                </Grid>

                                <Grid size={10}>
                                    Clear Overview Satellite Selection
                                    <Typography variant="body2" color="text.secondary">
                                        Resets selected satellite group and satellite in overview page
                                    </Typography>
                                </Grid>
                                <Grid size={6}>
                                    <Button
                                        variant="outlined"
                                        color="warning"
                                        onClick={clearOverviewSatTrackPersist}
                                        fullWidth
                                        size="small"
                                    >
                                        Clear
                                    </Button>
                                </Grid>

                                <Grid size={10}>
                                    Clear Camera Selection
                                    <Typography variant="body2" color="text.secondary">
                                        Resets selected camera and camera ID
                                    </Typography>
                                </Grid>
                                <Grid size={6}>
                                    <Button
                                        variant="outlined"
                                        color="warning"
                                        onClick={clearCameraPersist}
                                        fullWidth
                                        size="small"
                                    >
                                        Clear
                                    </Button>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>

                    {/* Right Column - Service Control & Browser Features */}
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Paper elevation={1} sx={{ p: 2, height: '100%' }}>
                            <Typography variant="h6" gutterBottom>
                                Service Control
                            </Typography>
                            <Divider sx={{ mb: 2 }} />

                            <Alert severity="warning" sx={{ mb: 2 }}>
                                <AlertTitle>{t('maintenance.service_control_title')}</AlertTitle>
                                {t('maintenance.service_control_subtitle')}
                            </Alert>

                            <Grid container spacing={2} columns={16}>
                                <Grid size={10}>
                                    {t('maintenance.restart_service')}
                                    <Typography variant="body2" color="text.secondary">
                                        {t('maintenance.restart_service_description')}
                                    </Typography>
                                </Grid>
                                <Grid size={6} sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Button
                                        variant="contained"
                                        color="error"
                                        startIcon={isRestarting ? <CircularProgress size={20} color="inherit" /> : <RestartAltIcon />}
                                        onClick={() => setConfirmRestartOpen(true)}
                                        disabled={isRestarting}
                                        fullWidth
                                        size="small"
                                    >
                                        {isRestarting ? t('maintenance.restarting') : t('maintenance.restart_service_button')}
                                    </Button>
                                </Grid>

                                {restartMessage && (
                                    <>
                                        <Grid size={16}>
                                            <Alert
                                                severity={restartMessage.includes('Failed') ? "error" : "warning"}
                                                sx={{ mt: 1 }}
                                            >
                                                {restartMessage}
                                            </Alert>
                                        </Grid>
                                    </>
                                )}

                                <Grid size={16}>
                                    <Divider sx={{ my: 2 }} />
                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                        Browser Features & Diagnostics
                                    </Typography>
                                </Grid>

                                <Grid size={16}>
                                    <Alert severity="info" size="small">
                                        {t('maintenance.browser_features_subtitle')}
                                    </Alert>
                                </Grid>

                                <Grid size={12}>
                                    <Typography variant="body2" fontWeight="medium">
                                        {t('maintenance.web_workers')}
                                    </Typography>
                                </Grid>
                                <Grid size={4} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                                    {getSupportIcon(workersSupported)}
                                    {isTestingWorkers && <CircularProgress size={16} />}
                                </Grid>

                                <Grid size={12}>
                                    <Typography variant="body2" fontWeight="medium">
                                        {t('maintenance.offscreen_canvas')}
                                    </Typography>
                                </Grid>
                                <Grid size={4} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                                    {getSupportIcon(offscreenCanvasSupported)}
                                    {isTestingOffscreen && <CircularProgress size={16} />}
                                </Grid>

                                <Grid size={12}>
                                    <Typography variant="body2" fontWeight="medium">
                                        Canvas Transfer to Offscreen
                                    </Typography>
                                </Grid>
                                <Grid size={4} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                                    {getSupportIcon(offscreenTransferSupported)}
                                </Grid>

                                <Grid size={12}>
                                    <Typography variant="body2" fontWeight="medium">
                                        {t('maintenance.offscreen_in_worker')}
                                    </Typography>
                                </Grid>
                                <Grid size={4} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                                    {getSupportIcon(offscreenInWorkerSupported)}
                                    {isTestingOffscreenInWorker && <CircularProgress size={16} />}
                                </Grid>

                                <Grid size={12}>
                                    <Typography variant="body2" fontWeight="medium">
                                        Canvas Transfer to Worker
                                    </Typography>
                                </Grid>
                                <Grid size={4} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                                    {getSupportIcon(canvasTransferToWorkerSupported)}
                                    {isTestingCanvasTransfer && <CircularProgress size={16} />}
                                </Grid>

                                {(workersSupported !== null || offscreenCanvasSupported !== null ||
                                    offscreenTransferSupported !== null || offscreenInWorkerSupported !== null ||
                                    canvasTransferToWorkerSupported !== null) && (
                                    <Grid size={16}>
                                        <Alert severity={
                                            (workersSupported && offscreenCanvasSupported && offscreenTransferSupported &&
                                                offscreenInWorkerSupported && canvasTransferToWorkerSupported)
                                                ? 'success'
                                                : 'warning'
                                        } sx={{ mt: 1 }} size="small">
                                            {(workersSupported && offscreenCanvasSupported && offscreenTransferSupported &&
                                                offscreenInWorkerSupported && canvasTransferToWorkerSupported)
                                                ? t('maintenance.all_features_message')
                                                : t('maintenance.missing_features_message')}
                                        </Alert>
                                    </Grid>
                                )}
                            </Grid>
                        </Paper>
                    </Grid>
                </Grid>

                {/* Canvas Debug Information - Full Width Row with Two Columns */}
                <Grid container spacing={3} sx={{ mt: 1 }}>
                    <Grid size={12}>
                        <Paper elevation={1} sx={{ p: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Canvas Rendering Debug Information
                            </Typography>
                            <Divider sx={{ mb: 2 }} />
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Information about canvas rendering environment for debugging text distortion issues
                            </Typography>

                            <Grid container spacing={2} columns={16}>
                    <Grid size={8}>
                        Device Pixel Ratio
                        <Typography variant="body2" color="text.secondary">
                            Scale factor between CSS pixels and physical pixels
                        </Typography>
                    </Grid>
                    <Grid size={8}>
                        <Typography variant="h6" color="primary">
                            {window.devicePixelRatio || 'N/A'}
                        </Typography>
                    </Grid>

                    <Grid size={8}>
                        Window Inner Dimensions
                        <Typography variant="body2" color="text.secondary">
                            Viewport width and height in CSS pixels
                        </Typography>
                    </Grid>
                    <Grid size={8}>
                        <Typography variant="body1">
                            {window.innerWidth} × {window.innerHeight} px
                        </Typography>
                    </Grid>

                    <Grid size={8}>
                        Screen Resolution
                        <Typography variant="body2" color="text.secondary">
                            Physical screen dimensions
                        </Typography>
                    </Grid>
                    <Grid size={8}>
                        <Typography variant="body1">
                            {window.screen.width} × {window.screen.height} px
                        </Typography>
                    </Grid>

                    <Grid size={8}>
                        Available Screen Space
                        <Typography variant="body2" color="text.secondary">
                            Screen size minus OS toolbars/taskbar
                        </Typography>
                    </Grid>
                    <Grid size={8}>
                        <Typography variant="body1">
                            {window.screen.availWidth} × {window.screen.availHeight} px
                        </Typography>
                    </Grid>

                    <Grid size={8}>
                        Color Depth
                        <Typography variant="body2" color="text.secondary">
                            Bits per pixel for color representation
                        </Typography>
                    </Grid>
                    <Grid size={8}>
                        <Typography variant="body1">
                            {window.screen.colorDepth} bits
                        </Typography>
                    </Grid>

                    <Grid size={8}>
                        User Agent
                        <Typography variant="body2" color="text.secondary">
                            Browser identification string
                        </Typography>
                    </Grid>
                    <Grid size={8}>
                        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                            {navigator.userAgent}
                        </Typography>
                    </Grid>

                    <Grid size={8}>
                        Platform
                        <Typography variant="body2" color="text.secondary">
                            Operating system platform
                        </Typography>
                    </Grid>
                    <Grid size={8}>
                        <Typography variant="body1">
                            {navigator.platform}
                        </Typography>
                    </Grid>

                    <Grid size={8}>
                        Hardware Concurrency
                        <Typography variant="body2" color="text.secondary">
                            Number of logical processor cores
                        </Typography>
                    </Grid>
                    <Grid size={8}>
                        <Typography variant="body1">
                            {navigator.hardwareConcurrency || 'N/A'} cores
                        </Typography>
                    </Grid>

                    <Grid size={8}>
                        Max Touch Points
                        <Typography variant="body2" color="text.secondary">
                            Maximum simultaneous touch points supported
                        </Typography>
                    </Grid>
                    <Grid size={8}>
                        <Typography variant="body1">
                            {navigator.maxTouchPoints || 0}
                        </Typography>
                    </Grid>

                                <Grid size={8}>
                                    Language
                                    <Typography variant="body2" color="text.secondary">
                                        Browser language setting
                                    </Typography>
                                </Grid>
                                <Grid size={8}>
                                    <Typography variant="body1">
                                        {navigator.language}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>
                </Grid>

                {/* Confirmation Dialog */}
                <Dialog open={confirmRestartOpen} onClose={() => setConfirmRestartOpen(false)}>
                    <DialogTitle>{t('maintenance.confirm_restart_title')}</DialogTitle>
                    <DialogContent>
                        <Typography paragraph>
                            {t('maintenance.confirm_restart_message')}
                        </Typography>
                        <ul>
                            <li>{t('maintenance.restart_item_1')}</li>
                            <li>{t('maintenance.restart_item_2')}</li>
                            <li>{t('maintenance.restart_item_3')}</li>
                            <li>{t('maintenance.restart_item_4')}</li>
                            <li>{t('maintenance.restart_item_5')}</li>
                            <li>{t('maintenance.restart_item_6')}</li>
                        </ul>
                        <Typography paragraph>
                            {t('maintenance.confirm_restart_question')}
                        </Typography>

                        <Alert severity="info" sx={{ mt: 2 }}>
                            <AlertTitle>{t('maintenance.deployment_note')}</AlertTitle>
                            <Typography variant="body2">
                                <strong>Docker deployment:</strong> {t('maintenance.deployment_docker')}
                            </Typography>
                            <Typography variant="body2">
                                <strong>Standalone/Development deployment:</strong> {t('maintenance.deployment_standalone')}
                            </Typography>
                        </Alert>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setConfirmRestartOpen(false)}>{t('maintenance.cancel')}</Button>
                        <Button onClick={handleServiceRestart} color="error" variant="contained">
                            {t('maintenance.yes_restart')}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </Paper>
    );
};

export default MaintenanceForm;