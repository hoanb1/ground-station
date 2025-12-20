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
    selectFontSizeMultiplier,
    clearTranscriptions
} from './transcription-slice';
import CloseIcon from '@mui/icons-material/Close';
import SubtitlesIcon from '@mui/icons-material/Subtitles';

/**
 * TranscriptionSubtitles Component
 *
 * Displays real-time transcriptions as a single continuously updating subtitle.
 * Shows live accumulating text that grows as fragments arrive.
 */
const TranscriptionSubtitles = ({ maxEntries = 2, autoFadeMs = 10000 }) => {
    const dispatch = useDispatch();
    const [visible, setVisible] = useState(true);

    // Get live transcription state
    const liveTranscription = useSelector((state) => state.transcription.liveTranscription);
    const isActive = useSelector(selectTranscriptionIsActive);
    const fontSizeMultiplier = useSelector(selectFontSizeMultiplier);

    // Get drawer state to adjust subtitle position
    const packetsDrawerOpen = useSelector((state) => state.waterfall.packetsDrawerOpen);
    const packetsDrawerHeight = useSelector((state) => state.waterfall.packetsDrawerHeight);

    // Calculate bottom position: status bar (30px) + drawer height (if open) + padding (40px)
    const statusBarHeight = 30;
    const padding = 40;
    const bottomPosition = statusBarHeight + (packetsDrawerOpen ? packetsDrawerHeight : 0) + padding;

    // Get the most recent live transcription (by timestamp)
    const currentTranscription = Object.values(liveTranscription).sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0] || null;

    // Don't render anything if no live transcription
    if (!currentTranscription || !currentTranscription.segments || currentTranscription.segments.length === 0) {
        return null;
    }

    // Get all segments and determine which are old (>5 seconds)
    const now = Date.now();
    const ageThreshold = 5000; // 5 seconds in milliseconds

    // Collect all segments from newest to oldest, limiting to last 50 words total
    const allText = currentTranscription.segments.map(s => s.text).join(' ');
    const words = allText.split(/\s+/);
    const displayWords = words.slice(-50);
    const displayText = displayWords.join(' ');

    // Build segments with age-based opacity
    // We'll render each segment separately with appropriate styling
    const segmentsToRender = currentTranscription.segments
        .map(segment => ({
            text: segment.text,
            isOld: (now - segment.timestamp) > ageThreshold
        }))
        // Only show segments that appear in the displayText (last 50 words)
        .filter(segment => displayText.includes(segment.text));

    return (
        <>
            {/* Single continuously updating subtitle */}
            <Fade in={visible} timeout={300}>
                <Box
                    sx={{
                        position: 'fixed',
                        bottom: `${bottomPosition}px`,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 1000,
                        width: { xs: '100%', sm: '100%', md: '95%' },
                        maxWidth: { md: '95%', lg: '92%', xl: '90%' },
                        pointerEvents: 'none',
                        px: { xs: 0, sm: 0, md: 2 },
                        transition: 'bottom 0.3s ease-out',
                    }}
                >
                    <Box
                        sx={{
                            backgroundColor: 'rgba(0, 0, 0, 0.65)',
                            borderRadius: { xs: 0, sm: 0, md: '8px' },
                            padding: { xs: '10px 16px', sm: '12px 24px' },
                            textAlign: 'left',
                            border: '2px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                            transition: 'all 0.15s ease-out',
                        }}
                    >
                        <Box
                            sx={{
                                color: 'white',
                                fontSize: {
                                    xs: `${0.75 * fontSizeMultiplier}rem`,
                                    sm: `${0.85 * fontSizeMultiplier}rem`,
                                    md: `${0.9 * fontSizeMultiplier}rem`
                                },
                                fontWeight: 600,
                                lineHeight: 1.6,
                                textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
                                letterSpacing: '0.3px',
                                fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                                wordBreak: 'break-word',
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}
                        >
                            <span style={{ opacity: 0.7, fontSize: '0.85em' }}>{new Date(currentTranscription.startTime).toLocaleTimeString()}: </span>
                            {segmentsToRender.map((segment, idx) => (
                                <span
                                    key={idx}
                                    style={{
                                        opacity: segment.isOld ? 0.4 : 1.0,
                                        transition: 'opacity 0.5s ease-out'
                                    }}
                                >
                                    {idx > 0 ? ' ' : ''}{segment.text}
                                </span>
                            ))}
                        </Box>
                    </Box>
                </Box>
            </Fade>
        </>
    );
};

export default TranscriptionSubtitles;
