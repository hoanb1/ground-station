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

import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Box, IconButton, Tooltip, Fade } from '@mui/material';
import {
    selectRecentTranscriptions,
    selectTranscriptionIsActive,
    clearTranscriptions
} from './transcription-slice';
import CloseIcon from '@mui/icons-material/Close';
import SubtitlesIcon from '@mui/icons-material/Subtitles';

/**
 * TranscriptionSubtitles Component
 *
 * Displays real-time transcriptions as subtitles overlayed on the waterfall canvas.
 * Styled like video subtitles with semi-transparent background and auto-fade.
 */
const TranscriptionSubtitles = ({ maxEntries = 2, autoFadeMs = 10000 }) => {
    const dispatch = useDispatch();
    const [visible, setVisible] = useState(true);
    const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());

    // Get recent transcriptions (last N entries)
    const recentTranscriptions = useSelector(selectRecentTranscriptions(maxEntries));
    const isActive = useSelector(selectTranscriptionIsActive);

    // Update timestamp when new transcriptions arrive
    useEffect(() => {
        if (recentTranscriptions.length > 0) {
            setLastUpdateTime(Date.now());
            setVisible(true);
        }
    }, [recentTranscriptions]);

    // Auto-fade subtitles after N seconds of inactivity
    useEffect(() => {
        if (!autoFadeMs || recentTranscriptions.length === 0) return;

        const timer = setTimeout(() => {
            setVisible(false);
        }, autoFadeMs);

        return () => clearTimeout(timer);
    }, [lastUpdateTime, autoFadeMs, recentTranscriptions.length]);

    const handleClear = () => {
        dispatch(clearTranscriptions());
    };

    const handleToggleVisibility = () => {
        setVisible(!visible);
    };

    // Don't render anything if no transcriptions
    if (recentTranscriptions.length === 0) {
        return null;
    }

    return (
        <>
            {/* Subtitle overlay */}
            <Fade in={visible} timeout={300}>
                <Box
                    sx={{
                        position: 'fixed',
                        bottom: '70px', // Fixed position from browser viewport bottom
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 1000,
                        maxWidth: '90%',
                        width: 'auto',
                        minWidth: '300px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        pointerEvents: 'none', // Allow clicks to pass through to canvas
                    }}
                >
                    {recentTranscriptions.map((entry, index) => {
                        // Same opacity for all entries
                        const opacity = 1.0;

                        return (
                            <Fade
                                key={entry.id}
                                in={true}
                                timeout={500}
                                style={{ transitionDelay: `${index * 100}ms` }}
                            >
                                <Box
                                    sx={{
                                        backgroundColor: `rgba(0, 0, 0, 0.5)`,
                                        backdropFilter: 'blur(12px)',
                                        borderRadius: '8px',
                                        padding: '12px 24px',
                                        textAlign: 'center',
                                        border: '2px solid rgba(255, 255, 255, 0.1)',
                                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                                        transition: 'opacity 0.3s ease-in-out',
                                    }}
                                >
                                    <Box
                                        sx={{
                                            color: 'white',
                                            fontSize: index === 0 ? '1.1rem' : '0.95rem',
                                            fontWeight: index === 0 ? 600 : 500,
                                            lineHeight: 1.6,
                                            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
                                            letterSpacing: '0.3px',
                                            fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                                        }}
                                    >
                                        {entry.language && entry.language !== 'auto' && entry.language !== 'unknown' && (
                                            <span style={{ opacity: 0.7, fontSize: '0.85em' }}>{entry.language.toUpperCase()}, </span>
                                        )}
                                        <span style={{ opacity: 0.7, fontSize: '0.85em' }}>{new Date(entry.timestamp).toLocaleTimeString()}: </span>
                                        {entry.text}
                                    </Box>
                                </Box>
                            </Fade>
                        );
                    })}
                </Box>
            </Fade>
        </>
    );
};

export default TranscriptionSubtitles;
