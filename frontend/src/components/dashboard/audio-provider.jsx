import React, { createContext, useContext, useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from '../../utils/toast-with-timestamp.jsx';
import { registerFlushCallback, unregisterFlushCallback } from './audio-service.js';

const AudioContext = createContext({
    audioEnabled: false,
    volume: 0.5,
    initializeAudio: () => {},
    playAudioSamples: () => {},
    setAudioVolume: () => {},
    stopAudio: () => {},
    getAudioState: () => {},
    flushAudioBuffers: () => {},
    getAudioBufferLength: () => 0
});

export const useAudio = () => {
    const context = useContext(AudioContext);
    if (!context) {
        throw new Error('useAudio must be used within an AudioProvider');
    }
    return context;
};

export const AudioProvider = ({ children }) => {
    // Audio context for Web Audio API (must stay in main thread)
    const audioContextRef = useRef(null);
    const gainNodeRef = useRef(null);
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [volume, setVolume] = useState(0.5);

    // Web Worker for audio processing
    const audioWorkerRef = useRef(null);
    const nextPlayTimeRef = useRef(0);

    // Initialize Web Worker using your existing worker file
    const initializeWorker = useCallback(() => {
        try {
            // Use your existing audio-worker.js file
            audioWorkerRef.current = new Worker(
                new URL('./audio-worker.js', import.meta.url),
                { type: 'module' }
            );

            audioWorkerRef.current.onmessage = (e) => {
                const { type, batch, status, error } = e.data;

                switch (type) {
                    case 'AUDIO_BATCH':
                        // Process the batch from your worker
                        batch.forEach(audioData => playProcessedAudio(audioData));
                        break;
                    case 'QUEUE_STATUS':
                        //console.log('Audio queue status:', status);
                        break;
                    case 'ERROR':
                        console.error('Audio worker error:', error);
                        break;
                }
            };

            audioWorkerRef.current.onerror = (error) => {
                console.error('Audio worker error:', error);
                toast.error('Audio worker failed');
            };

            console.log('Audio worker initialized from audio-worker.js');
        } catch (error) {
            console.warn('Failed to initialize audio worker, falling back to main thread:', error);
        }
    }, []);

    // Initialize audio context
    const initializeAudio = useCallback(async () => {
        try {
            await new Promise(resolve => {
                if (window.requestIdleCallback) {
                    window.requestIdleCallback(resolve);
                } else {
                    setTimeout(resolve, 0);
                }
            });

            // Configure AudioContext for low latency
            const contextOptions = {
                latencyHint: 'interactive', // Request lowest latency
                sampleRate: 44100
            };

            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)(contextOptions);
            gainNodeRef.current = audioContextRef.current.createGain();
            gainNodeRef.current.connect(audioContextRef.current.destination);
            gainNodeRef.current.gain.value = volume;

            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            nextPlayTimeRef.current = audioContextRef.current.currentTime;

            // Initialize worker after audio context is ready
            initializeWorker();

            setAudioEnabled(true);

            console.log(`Audio initialized - Base latency: ${audioContextRef.current.baseLatency}s, Output latency: ${audioContextRef.current.outputLatency}s`);

        } catch (error) {
            console.error('Failed to initialize audio:', error);
            toast.error(`Failed to initialize audio: ${error.message}`);
        }
    }, [volume, initializeWorker]);

    // Play processed audio from worker (main thread only)
    const playProcessedAudio = useCallback((processedData) => {
        if (!audioContextRef.current || !gainNodeRef.current) return;

        try {
            const { samples, sample_rate, channels } = processedData;

            // Calculate number of frames (samples per channel)
            const numFrames = channels === 2 ? samples.length / 2 : samples.length;

            const audioBuffer = audioContextRef.current.createBuffer(
                channels,
                numFrames,
                sample_rate
            );

            if (channels === 1) {
                // Mono: copy samples directly
                const channelData = audioBuffer.getChannelData(0);
                channelData.set(samples);
            } else if (channels === 2) {
                // Stereo: de-interleave L and R channels
                // Input format: [L0, R0, L1, R1, L2, R2, ...]
                const leftChannel = audioBuffer.getChannelData(0);
                const rightChannel = audioBuffer.getChannelData(1);

                for (let i = 0; i < numFrames; i++) {
                    leftChannel[i] = samples[i * 2];     // Even indices = left
                    rightChannel[i] = samples[i * 2 + 1]; // Odd indices = right
                }
            }

            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(gainNodeRef.current);

            const currentTime = audioContextRef.current.currentTime;

            // Schedule audio continuously without gaps
            if (nextPlayTimeRef.current < currentTime) {
                // If we're behind, start immediately
                nextPlayTimeRef.current = currentTime;
            }

            source.start(nextPlayTimeRef.current);

            // Next chunk starts exactly when this one ends (no gap)
            nextPlayTimeRef.current += audioBuffer.duration;

        } catch (error) {
            console.error('Error playing processed audio:', error);
        }
    }, []);

    // Play audio samples (now uses your existing worker)
    const playAudioSamples = useCallback((audioData) => {
        if (!audioContextRef.current || !gainNodeRef.current) return;

        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().then(() => {
                playAudioSamples(audioData);
            }).catch(err => {
                console.error('Failed to resume AudioContext:', err);
            });
            return;
        }

        if (!audioEnabled) {
            setAudioEnabled(true);
        }

        // Send to your existing worker for processing
        if (audioWorkerRef.current) {
            audioWorkerRef.current.postMessage({
                type: 'AUDIO_DATA',
                data: audioData
            });
        }
    }, [audioEnabled]);

    // Set volume
    const setAudioVolume = useCallback((newVolume) => {
        setVolume(newVolume);
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = newVolume;
        }
    }, []);

    // Stop audio
    const stopAudio = useCallback(() => {
        if (audioWorkerRef.current) {
            // Clear the queue before terminating
            audioWorkerRef.current.postMessage({ type: 'CLEAR_QUEUE' });
            audioWorkerRef.current.terminate();
            audioWorkerRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        setAudioEnabled(false);
    }, []);

    // Flush audio buffers (clear worker queue and reset audio scheduling)
    const flushAudioBuffers = useCallback(() => {
        // Clear the worker queue
        if (audioWorkerRef.current) {
            audioWorkerRef.current.postMessage({ type: 'CLEAR_QUEUE' });
        }

        // Reset the next play time to current time to cancel scheduled audio
        if (audioContextRef.current) {
            nextPlayTimeRef.current = audioContextRef.current.currentTime;
        }
    }, []);

    // Get audio context state
    const getAudioState = useCallback(() => {
        // Also get worker queue status
        if (audioWorkerRef.current) {
            audioWorkerRef.current.postMessage({ type: 'GET_QUEUE_STATUS' });
        }

        return {
            enabled: audioEnabled,
            volume: volume,
            contextState: audioContextRef.current?.state || 'closed',
            workerActive: !!audioWorkerRef.current
        };
    }, [audioEnabled, volume]);

    // Get browser audio buffer length in seconds
    const getAudioBufferLength = useCallback(() => {
        if (!audioContextRef.current) {
            return 0;
        }
        const currentTime = audioContextRef.current.currentTime;
        const bufferLength = Math.max(0, nextPlayTimeRef.current - currentTime);
        return bufferLength;
    }, []);

    // Register flush callback for use by middleware
    useEffect(() => {
        registerFlushCallback(flushAudioBuffers);
        return () => {
            unregisterFlushCallback();
        };
    }, [flushAudioBuffers]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (audioWorkerRef.current) {
                audioWorkerRef.current.postMessage({ type: 'CLEAR_QUEUE' });
                audioWorkerRef.current.terminate();
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    const value = useMemo(() => ({
        audioEnabled,
        volume,
        initializeAudio,
        playAudioSamples,
        setAudioVolume,
        stopAudio,
        getAudioState,
        flushAudioBuffers,
        getAudioBufferLength
    }), [audioEnabled, volume, initializeAudio, playAudioSamples, setAudioVolume, stopAudio, getAudioState, flushAudioBuffers, getAudioBufferLength]);

    return (
        <AudioContext.Provider value={value}>
            {children}
        </AudioContext.Provider>
    );
};