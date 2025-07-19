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

import {gridLayoutStoreName as overviewGridLayoutName} from "../overview/overview-sat-layout.jsx";
import {gridLayoutStoreName as targetGridLayoutName} from "../target/target-sat-layout.jsx";
import {gridLayoutStoreName as waterfallGridLayoutName} from "../waterfall/waterfall-layout.jsx";
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

const MaintenanceForm = () => {
    const { socket } = useSocket();

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

    const clearSatelliteDataLocalStorage = () => {
        localStorage.setItem('target-satellite-noradid', null);
        localStorage.setItem('overview-selected-satellites', null);
    }

    const clearReduxPersistentState = () => {
        localStorage.setItem('persist:root', null);
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
                        window.location.reload();
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
                <AlertTitle>Maintenance</AlertTitle>
                Maintenance related functions
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <Grid container spacing={2} columns={16}>
                    <Grid size={8}>
                        Clear local browser layout data
                    </Grid>
                    <Grid size={8}>
                        <Button variant="contained" color="warning" onClick={clearLayoutLocalStorage}>
                            Clear layout
                        </Button>
                    </Grid>
                    <Grid size={8}>
                        Clear local browser satellite data
                    </Grid>
                    <Grid size={8}>
                        <Button variant="contained" color="warning" onClick={clearSatelliteDataLocalStorage}>
                            Clear satellite data
                        </Button>
                    </Grid>

                    <Grid size={8}>
                        Clear Redux persistent state
                    </Grid>
                    <Grid size={8}>
                        <Button variant="contained" color="warning" onClick={clearReduxPersistentState}>
                            Clear Redux persistent state
                        </Button>
                    </Grid>
                </Grid>

                <Divider sx={{ my: 3 }} />

                <Alert severity="warning">
                    <AlertTitle>Service Control</AlertTitle>
                    Restart or shutdown the entire Ground Station service
                </Alert>

                <Grid container spacing={2} columns={16} sx={{ mt: 1 }}>
                    <Grid size={8}>
                        Restart Ground Station Service
                        <Typography variant="body2" color="text.secondary">
                            Restarts all processes including SDR, tracker, and web server. All connections will be dropped.
                        </Typography>
                    </Grid>
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Button
                            variant="contained"
                            color="error"
                            startIcon={isRestarting ? <CircularProgress size={20} color="inherit" /> : <RestartAltIcon />}
                            onClick={() => setConfirmRestartOpen(true)}
                            disabled={isRestarting}
                        >
                            {isRestarting ? 'Restarting...' : 'Restart Service'}
                        </Button>
                    </Grid>

                    {restartMessage && (
                        <>
                            <Grid size={8}>
                                Restart Status
                            </Grid>
                            <Grid size={8}>
                                <Alert
                                    severity={restartMessage.includes('Failed') ? "error" : "warning"}
                                    sx={{ mt: 1 }}
                                >
                                    {restartMessage}
                                </Alert>
                            </Grid>
                        </>
                    )}
                </Grid>

                <Divider sx={{ my: 3 }} />

                <Alert severity="info">
                    <AlertTitle>Browser Feature Compatibility</AlertTitle>
                    Test browser compatibility for advanced features used in the waterfall display
                </Alert>

                <Grid container spacing={2} columns={16} sx={{ mt: 1 }}>
                    <Grid size={8}>
                        Web Workers Support
                        <Typography variant="body2" color="text.secondary">
                            Required for offloading waterfall processing
                        </Typography>
                    </Grid>
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        {getSupportIcon(workersSupported)}
                        <Typography sx={{ ml: 1 }}>
                            {workersSupported === null ? 'Not Tested' :
                                workersSupported ? 'Supported' : 'Not Supported'}
                        </Typography>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={testWebWorkers}
                            disabled={isTestingWorkers}
                            sx={{ ml: 2 }}
                        >
                            {isTestingWorkers ? <CircularProgress size={24} /> : 'Test now'}
                        </Button>
                    </Grid>

                    {workerTestResult && (
                        <>
                            <Grid size={8}>
                                Worker Test Result
                            </Grid>
                            <Grid size={8}>
                                <Typography
                                    color={workerTestResult.includes('Error') ? 'error' : 'success.main'}
                                >
                                    {workerTestResult}
                                </Typography>
                            </Grid>
                        </>
                    )}

                    <Grid size={8}>
                        OffscreenCanvas Support
                        <Typography variant="body2" color="text.secondary">
                            Required for high-performance waterfall rendering
                        </Typography>
                    </Grid>
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        {getSupportIcon(offscreenCanvasSupported)}
                        <Typography sx={{ ml: 1 }}>
                            {offscreenCanvasSupported === null ? 'Not Tested' :
                                offscreenCanvasSupported ? 'Supported' : 'Not Supported'}
                        </Typography>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={testOffscreenCanvas}
                            disabled={isTestingOffscreen}
                            sx={{ ml: 2 }}
                        >
                            {isTestingOffscreen ? <CircularProgress size={24} /> : 'Test now'}
                        </Button>
                    </Grid>

                    {offscreenTestResult && (
                        <>
                            <Grid size={8}>
                                OffscreenCanvas Test Result
                            </Grid>
                            <Grid size={8}>
                                <Typography
                                    color={offscreenTestResult.includes('Error') ? 'error' : 'success.main'}
                                >
                                    {offscreenTestResult}
                                </Typography>
                            </Grid>
                        </>
                    )}

                    <Grid size={8}>
                        Canvas Transfer Control Support
                        <Typography variant="body2" color="text.secondary">
                            Required for transferring canvas to workers
                        </Typography>
                    </Grid>
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        {getSupportIcon(offscreenTransferSupported)}
                        <Typography sx={{ ml: 1 }}>
                            {offscreenTransferSupported === null ? 'Not Tested' :
                                offscreenTransferSupported ? 'Supported' : 'Not Supported'}
                        </Typography>
                    </Grid>

                    <Grid size={8}>
                        OffscreenCanvas in Worker
                        <Typography variant="body2" color="text.secondary">
                            Tests creating OffscreenCanvas inside a worker
                        </Typography>
                    </Grid>
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        {getSupportIcon(offscreenInWorkerSupported)}
                        <Typography sx={{ ml: 1 }}>
                            {offscreenInWorkerSupported === null ? 'Not Tested' :
                                offscreenInWorkerSupported ? 'Supported' : 'Not Supported'}
                        </Typography>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={testOffscreenCanvasInWorker}
                            disabled={isTestingOffscreenInWorker}
                            sx={{ ml: 2 }}
                        >
                            {isTestingOffscreenInWorker ? <CircularProgress size={24} /> : 'Test now'}
                        </Button>
                    </Grid>

                    {offscreenInWorkerResult && (
                        <>
                            <Grid size={8}>
                                Worker OffscreenCanvas Test Result
                            </Grid>
                            <Grid size={8}>
                                <Typography
                                    color={offscreenInWorkerResult.includes('Error') || offscreenInWorkerResult.includes('not supported') ? 'error' : 'success.main'}
                                >
                                    {offscreenInWorkerResult}
                                </Typography>
                            </Grid>
                        </>
                    )}

                    <Grid size={8}>
                        Canvas Transfer to Worker
                        <Typography variant="body2" color="text.secondary">
                            Tests transferring canvas control to a worker
                        </Typography>
                    </Grid>
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        {getSupportIcon(canvasTransferToWorkerSupported)}
                        <Typography sx={{ ml: 1 }}>
                            {canvasTransferToWorkerSupported === null ? 'Not Tested' :
                                canvasTransferToWorkerSupported ? 'Supported' : 'Not Supported'}
                        </Typography>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={testCanvasTransferToWorker}
                            disabled={isTestingCanvasTransfer}
                            sx={{ ml: 2 }}
                        >
                            {isTestingCanvasTransfer ? <CircularProgress size={24} /> : 'Test now'}
                        </Button>
                    </Grid>

                    {canvasTransferResult && (
                        <>
                            <Grid size={8}>
                                Canvas Transfer Test Result
                            </Grid>
                            <Grid size={8}>
                                <Typography
                                    color={canvasTransferResult.includes('Error') || canvasTransferResult.includes('not supported') ? 'error' : 'success.main'}
                                >
                                    {canvasTransferResult}
                                </Typography>
                            </Grid>
                        </>
                    )}

                    {(workersSupported !== null || offscreenCanvasSupported !== null ||
                        offscreenTransferSupported !== null || offscreenInWorkerSupported !== null ||
                        canvasTransferToWorkerSupported !== null) && (
                        <Grid size={16}>
                            <Alert severity={
                                (workersSupported && offscreenCanvasSupported && offscreenTransferSupported &&
                                    offscreenInWorkerSupported && canvasTransferToWorkerSupported)
                                    ? 'success'
                                    : 'warning'
                            } sx={{ mt: 2 }}>
                                <AlertTitle>
                                    {(workersSupported && offscreenCanvasSupported && offscreenTransferSupported &&
                                        offscreenInWorkerSupported && canvasTransferToWorkerSupported)
                                        ? 'All features supported!'
                                        : 'Missing feature support'}
                                </AlertTitle>
                                {(workersSupported && offscreenCanvasSupported && offscreenTransferSupported &&
                                    offscreenInWorkerSupported && canvasTransferToWorkerSupported)
                                    ? 'Your browser supports all the features needed for optimal waterfall display performance.'
                                    : 'Your browser does not support all features needed for optimal waterfall display performance. The waterfall may still work but with reduced performance or functionality.'}
                            </Alert>
                        </Grid>
                    )}
                </Grid>


                {/* Confirmation Dialog */}
                <Dialog open={confirmRestartOpen} onClose={() => setConfirmRestartOpen(false)}>
                    <DialogTitle>Confirm Service Restart</DialogTitle>
                    <DialogContent>
                        <Typography paragraph>
                            This will restart the entire Ground Station service, including:
                        </Typography>
                        <ul>
                            <li>All SDR sessions will be terminated</li>
                            <li>Audio streams will be stopped</li>
                            <li>Tracker processes will be restarted</li>
                            <li>All WebSocket connections will be dropped</li>
                            <li>Hardware will be reinitialized</li>
                            <li>System daemons (dbus, avahi) will restart</li>
                        </ul>
                        <Typography paragraph>
                            Are you sure you want to proceed?
                        </Typography>

                        <Alert severity="info" sx={{ mt: 2 }}>
                            <AlertTitle>Deployment Note</AlertTitle>
                            <Typography variant="body2">
                                <strong>Docker deployment:</strong> The service will automatically restart after shutdown.
                            </Typography>
                            <Typography variant="body2">
                                <strong>Standalone/Development deployment:</strong> The service will only shutdown and must be manually restarted.
                            </Typography>
                        </Alert>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setConfirmRestartOpen(false)}>Cancel</Button>
                        <Button onClick={handleServiceRestart} color="error" variant="contained">
                            Yes, Restart Service
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </Paper>
    );
};

export default MaintenanceForm;