import React, { createContext, useContext, useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { enqueueSnackbar } from 'notistack';

const AudioContext = createContext({
        audioEnabled: false,
        volume: 0.5,
        initializeAudio: () => {},
        playAudioSamples: () => {},
        setAudioVolume: () => {},
        stopAudio: () => {},
        getAudioState: () => ({})
    }
);

export const useAudio = () => {
    const context = useContext(AudioContext);
    if (!context) {
        throw new Error('useAudio must be used within an AudioProvider');
    }
    return context;
};

export const AudioProvider = ({ children }) => {
    // Audio context for Web Audio API
    const audioContextRef = useRef(null);
    const gainNodeRef = useRef(null);
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [volume, setVolume] = useState(0.5);

    // Audio buffering system
    const audioBufferQueue = useRef([]);
    const nextPlayTimeRef = useRef(0);
    const processingAudioRef = useRef(false);

    // Initialize audio context
    const initializeAudio = useCallback(async () => {
        try {
            // Use requestIdleCallback to create AudioContext when browser is idle
            await new Promise(resolve => {
                if (window.requestIdleCallback) {
                    window.requestIdleCallback(resolve);
                } else {
                    setTimeout(resolve, 0);
                }
            });

            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            gainNodeRef.current = audioContextRef.current.createGain();
            gainNodeRef.current.connect(audioContextRef.current.destination);
            gainNodeRef.current.gain.value = volume;

            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            nextPlayTimeRef.current = audioContextRef.current.currentTime;
            setAudioEnabled(true);
            enqueueSnackbar('Audio initialized successfully', { variant: 'success' });

        } catch (error) {
            console.error('Failed to initialize audio:', error);
            enqueueSnackbar(`Failed to initialize audio: ${error.message}`, { variant: 'error' });

            if (audioContextRef.current && gainNodeRef.current) {
                setAudioEnabled(true);
            }
        }
    }, [volume]);


    // Process audio buffer queue
    const processAudioQueue = useCallback(() => {
        if (!audioContextRef.current || processingAudioRef.current) {
            return;
        }

        processingAudioRef.current = true;

        // Process up to 3 buffers at once to maintain smooth playback
        const buffersToProcess = Math.min(3, audioBufferQueue.current.length);

        for (let i = 0; i < buffersToProcess; i++) {
            const audioBuffer = audioBufferQueue.current.shift();
            if (!audioBuffer) break;

            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(gainNodeRef.current);

            const currentTime = audioContextRef.current.currentTime;

            // If we're falling behind, reset timing with a small buffer
            if (nextPlayTimeRef.current < currentTime) {
                nextPlayTimeRef.current = currentTime + 0.05;
            }

            source.start(nextPlayTimeRef.current);
            nextPlayTimeRef.current += audioBuffer.duration;
        }

        processingAudioRef.current = false;

        // Schedule next processing if there are more buffers
        if (audioBufferQueue.current.length > 0) {
            requestAnimationFrame(processAudioQueue);
        }
    }, []);

    // Play audio samples with buffering
    const playAudioSamples = useCallback((audioData) => {
        if (!audioContextRef.current || !gainNodeRef.current) {
            return;
        }

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

        try {
            const { samples, sample_rate, channels = 1 } = audioData;

            if (!samples || samples.length === 0) {
                return;
            }

            // Create audio buffer
            const audioBuffer = audioContextRef.current.createBuffer(
                channels,
                samples.length,
                sample_rate
            );

            const channelData = audioBuffer.getChannelData(0);
            for (let i = 0; i < samples.length; i++) {
                channelData[i] = samples[i];
            }

            // Add to queue
            audioBufferQueue.current.push(audioBuffer);

            // Limit queue size to prevent memory issues
            if (audioBufferQueue.current.length > 10) {
                audioBufferQueue.current.shift(); // Remove oldest
            }

            // Start processing
            processAudioQueue();

        } catch (error) {
            console.error('Error playing audio:', error);
        }
    }, [audioEnabled, processAudioQueue]);

    // Set volume
    const setAudioVolume = useCallback((newVolume) => {
        setVolume(newVolume);
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = newVolume;
        }
    }, []);

    // Stop audio
    const stopAudio = useCallback(() => {
        audioBufferQueue.current = [];
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        setAudioEnabled(false);
    }, []);

    // Get audio context state
    const getAudioState = useCallback(() => {
        return {
            enabled: audioEnabled,
            volume: volume,
            contextState: audioContextRef.current?.state || 'closed',
            queueLength: audioBufferQueue.current.length
        };
    }, [audioEnabled, volume]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    // Memoize the context value to prevent unnecessary re-renders
    const value = useMemo(() => ({
        // State
        audioEnabled,
        volume,

        // Functions
        initializeAudio,
        playAudioSamples,
        setAudioVolume,
        stopAudio,
        getAudioState
    }), [audioEnabled, volume, initializeAudio, playAudioSamples, setAudioVolume, stopAudio, getAudioState]);

    return (
        <AudioContext.Provider value={value}>
            {children}
        </AudioContext.Provider>
    );
};