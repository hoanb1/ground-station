import { useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSocket } from '../common/socket.jsx';
import {
    setCenterFrequency,
    setSampleRate,
    setGain,
    setFFTSize,
    setFFTWindow,
    setBiasT,
    setTunerAgc,
    setRtlAgc,
    setFFTAveraging,
    setIsStreaming,
    setErrorMessage,
    setErrorDialogOpen,
    setStartStreamingLoading,
    setFFTdataOverflow,
    stopRecording
} from './waterfall-slice.jsx';
import { toast } from '../../utils/toast-with-timestamp.jsx';

const useWaterfallStream = ({ workerRef, targetFPSRef }) => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const {
        selectedSDRId,
        centerFrequency,
        sampleRate,
        gain,
        fftSize,
        biasT,
        tunerAgc,
        rtlAgc,
        fftWindow,
        selectedAntenna,
        selectedOffsetValue,
        soapyAgc,
        fftAveraging,
        isStreaming,
        gettingSDRParameters,
        autoDBRange,
        playbackRecordingPath,
        isRecording,
    } = useSelector((state) => state.waterfall);

    const {
        vfoActive,
    } = useSelector((state) => state.vfo);

    const animationFrameRef = useRef(null);
    const bandscopeAnimationFrameRef = useRef(null);
    const timestampWindowRef = useRef([]);
    const overflowRef = useRef(false);
    const allowedIntervalRef = useRef(0);
    const lastAllowedUpdateRef = useRef(0);
    const windowSizeMs = 1000;
    const fftDataOverflowLimit = 60;

    const cancelAnimations = useCallback(() => {
        if (workerRef.current) {
            workerRef.current.postMessage({ cmd: 'stop' });
        }
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (bandscopeAnimationFrameRef.current) {
            cancelAnimationFrame(bandscopeAnimationFrameRef.current);
            bandscopeAnimationFrameRef.current = null;
        }
    }, [workerRef]);

    useEffect(() => {
        // Note: sdr-config-error, sdr-error, sdr-config, and sdr-status are now handled
        // in the parent-level socket event handler (hooks/socket-event-handlers.jsx)
        // to ensure messages are always received even when this component unmounts

        socket.on('disconnect', () => {
            cancelAnimations();
            dispatch(setIsStreaming(false));
        });

        socket.on('sdr-fft-data', (binaryData) => {
            const now = performance.now();
            timestampWindowRef.current.push(now);
            const cutoffTime = now - windowSizeMs;
            while (timestampWindowRef.current.length > 0 && timestampWindowRef.current[0] < cutoffTime) {
                timestampWindowRef.current.shift();
            }
            const currentRate = timestampWindowRef.current.length;
            const shouldOverflow = currentRate > fftDataOverflowLimit;
            if (shouldOverflow !== overflowRef.current) {
                overflowRef.current = shouldOverflow;
                dispatch(setFFTdataOverflow(shouldOverflow));
                allowedIntervalRef.current = 1000 / fftDataOverflowLimit;
            }
            if (overflowRef.current) {
                const timeSinceLastAllowed = now - lastAllowedUpdateRef.current;
                if (timeSinceLastAllowed < allowedIntervalRef.current) {
                    timestampWindowRef.current.pop();
                    return;
                }
                lastAllowedUpdateRef.current = now;
            }
            const floatArray = new Float32Array(binaryData);
            if (workerRef.current) {
                workerRef.current.postMessage({
                    cmd: 'updateFFTData',
                    fft: floatArray,
                    immediate: true,
                });
            }
        });

        return () => {
            cancelAnimations();
            socket.off('sdr-fft-data');
        };
    }, [socket, cancelAnimations, dispatch, workerRef]);

    // Effect to handle cleanup when streaming stops (from parent handler or local stop)
    useEffect(() => {
        if (!isStreaming) {
            cancelAnimations();
        }
    }, [isStreaming, cancelAnimations]);

    const startStreaming = useCallback(() => {
        if (!isStreaming) {
            // Toolbar play button should only handle real SDRs, not SigmfPlayback
            if (selectedSDRId === "sigmf-playback") {
                toast.error('Use the playback controls to play recordings');
                return;
            }

            dispatch(setStartStreamingLoading(true));
            dispatch(setErrorMessage(''));

            socket.emit('sdr_data', 'configure-sdr', {
                selectedSDRId,
                centerFrequency,
                sampleRate,
                gain,
                fftSize,
                biasT,
                tunerAgc,
                rtlAgc,
                fftWindow,
                antenna: selectedAntenna,
                offsetFrequency: selectedOffsetValue,
                soapyAgc,
                fftAveraging,
            }, (response) => {
                if (response['success']) {
                    socket.emit('sdr_data', 'start-streaming', { selectedSDRId });
                    if (workerRef.current) {
                        workerRef.current.postMessage({
                            cmd: 'start',
                            data: { fps: targetFPSRef.current }
                        });
                    }
                }
            });
        }
    }, [isStreaming, dispatch, socket, selectedSDRId, centerFrequency, sampleRate, gain, fftSize, biasT, tunerAgc, rtlAgc, fftWindow, selectedAntenna, selectedOffsetValue, soapyAgc, fftAveraging, workerRef, targetFPSRef]);

    const stopStreaming = useCallback(async () => {
        if (isStreaming) {
            // If recording is active, stop it first
            if (isRecording) {
                try {
                    // Capture waterfall snapshot
                    let waterfallImage = null;
                    try {
                        if (window.captureWaterfallSnapshot) {
                            waterfallImage = await window.captureWaterfallSnapshot(1620);
                        }
                    } catch (captureError) {
                        console.error('Error capturing waterfall:', captureError);
                    }

                    // Stop recording and wait for it to complete
                    await dispatch(stopRecording({ socket, selectedSDRId, waterfallImage })).unwrap();
                    console.log('Recording stopped successfully before stopping stream');
                } catch (error) {
                    console.error('Error stopping recording:', error);
                    toast.error(`Failed to stop recording: ${error}`);
                }
            }

            // Now stop streaming
            socket.emit('sdr_data', 'stop-streaming', { selectedSDRId });
            dispatch(setIsStreaming(false));
            cancelAnimations();
        }
    }, [isStreaming, isRecording, socket, selectedSDRId, dispatch, cancelAnimations]);

    const playButtonEnabledOrNot = useCallback(() => {
        const isStreamingActive = isStreaming;
        const noSDRSelected = selectedSDRId === 'none';
        const isSigmfPlayback = selectedSDRId === 'sigmf-playback';
        const isLoadingParameters = gettingSDRParameters;
        const missingRequiredParameters = !sampleRate || gain === null || gain === undefined || sampleRate === 'none' || gain === 'none' || selectedAntenna === 'none';
        return isStreamingActive || noSDRSelected || isSigmfPlayback || isLoadingParameters || missingRequiredParameters;
    }, [isStreaming, selectedSDRId, gettingSDRParameters, sampleRate, gain, selectedAntenna]);

    return { startStreaming, stopStreaming, playButtonEnabledOrNot };
};

export default useWaterfallStream;
