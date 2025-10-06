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
    setFFTdataOverflow
} from './waterfall-slice.jsx';
import toast from 'react-hot-toast';

const WaterfallStream = ({ workerRef, targetFPSRef }) => {
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
        vfoActive,
    } = useSelector((state) => state.waterfall);

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
        socket.on('disconnect', () => {
            cancelAnimations();
            dispatch(setIsStreaming(false));
        });

        socket.on('sdr-config-error', (error) => {
            dispatch(setErrorMessage(error.message));
            dispatch(setErrorDialogOpen(true));
            dispatch(setStartStreamingLoading(false));
            toast.error(`Failed to configure SDR: ${error.message}`, { position: 'top-right' });
        });

        socket.on('sdr-error', (error) => {
            cancelAnimations();
            dispatch(setErrorMessage(error.message));
            dispatch(setErrorDialogOpen(true));
            dispatch(setStartStreamingLoading(false));
        });

        socket.on('sdr-config', (data) => {
            dispatch(setCenterFrequency(data['center_freq']));
            dispatch(setSampleRate(data['sample_rate']));
            dispatch(setGain(data['gain']));
            dispatch(setFFTSize(data['fft_size']));
            dispatch(setFFTWindow(data['fft_window']));
            dispatch(setBiasT(data['bias_t']));
            dispatch(setTunerAgc(data['tuner_agc']));
            dispatch(setRtlAgc(data['rtl_agc']));
            dispatch(setFFTAveraging(data['fft_averaging']));
        });

        socket.on('sdr-status', (data) => {
            if (data['streaming'] === true) {
                dispatch(setIsStreaming(true));
                dispatch(setStartStreamingLoading(false));
            } else if (data['streaming'] === false) {
                cancelAnimations();
                dispatch(setIsStreaming(false));
                dispatch(setStartStreamingLoading(false));
            }
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
            socket.off('sdr-config-error');
            socket.off('sdr-error');
            socket.off('sdr-fft-data');
            socket.off('sdr-status');
            socket.off('sdr-config');
        };
    }, [socket, cancelAnimations, dispatch, workerRef]);

    const startStreaming = useCallback(() => {
        if (!isStreaming) {
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

    const stopStreaming = useCallback(() => {
        if (isStreaming) {
            socket.emit('sdr_data', 'stop-streaming', { selectedSDRId });
            dispatch(setIsStreaming(false));
            cancelAnimations();
        }
    }, [isStreaming, socket, selectedSDRId, dispatch, cancelAnimations]);

    const playButtonEnabledOrNot = useCallback(() => {
        const isStreamingActive = isStreaming;
        const noSDRSelected = selectedSDRId === 'none';
        const isLoadingParameters = gettingSDRParameters;
        const missingRequiredParameters = !sampleRate || !gain || sampleRate === 'none' || gain === 'none' || selectedAntenna === 'none';
        return isStreamingActive || noSDRSelected || isLoadingParameters || missingRequiredParameters;
    }, [isStreaming, selectedSDRId, gettingSDRParameters, sampleRate, gain, selectedAntenna]);

    return { startStreaming, stopStreaming, playButtonEnabledOrNot };
};

export default WaterfallStream;
