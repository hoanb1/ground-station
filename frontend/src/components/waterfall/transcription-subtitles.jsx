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
 * Displays real-time transcriptions as traditional multi-line subtitles.
 * Shows up to 3 lines, with the oldest line expiring when new text arrives.
 */
const TranscriptionSubtitles = ({ maxLines = 3, maxWordsPerLine = 20, autoFadeMs = 10000 }) => {
    const dispatch = useDispatch();
    const [visible, setVisible] = useState(true);
    const [lines, setLines] = useState([]);
    const [lastSegmentTimestamp, setLastSegmentTimestamp] = useState(null);

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

    // Build lines from segments when transcription updates
    useEffect(() => {
        if (!currentTranscription || !currentTranscription.segments || currentTranscription.segments.length === 0) {
            setLines([]);
            return;
        }

        // Get the timestamp of the most recent segment
        const latestSegmentTimestamp = currentTranscription.segments.reduce((latest, segment) => {
            const segmentTime = new Date(segment.timestamp).getTime();
            return segmentTime > latest ? segmentTime : latest;
        }, 0);

        // Check if more than 60 seconds have passed since last segment
        const now = Date.now();
        const shouldAddDash = lastSegmentTimestamp && (latestSegmentTimestamp - lastSegmentTimestamp > 60000);

        // Update last segment timestamp
        setLastSegmentTimestamp(latestSegmentTimestamp);

        // Build segments with their words and timestamps
        const segmentsWithWords = currentTranscription.segments.map(segment => ({
            words: segment.text.split(/\s+/).filter(w => w.length > 0),
            timestamp: new Date(segment.timestamp).getTime()
        }));

        // Flatten into array of {word, timestamp} objects
        const wordsWithTimestamps = [];
        segmentsWithWords.forEach(segment => {
            segment.words.forEach(word => {
                wordsWithTimestamps.push({
                    word: word,
                    timestamp: segment.timestamp
                });
            });
        });

        // Build lines by filling them up to maxWordsPerLine
        const newLines = [];
        let currentLineWords = [];
        let currentLineSegments = []; // Track segments in this line

        // If we should add a dash due to gap, and we have existing lines,
        // add it to the previous last line and force a new line
        if (shouldAddDash && lines.length > 0) {
            // Copy existing lines and add dash to the last one
            newLines.push(...lines.map((line, idx) =>
                idx === lines.length - 1
                    ? { ...line, text: line.text + ' —' }
                    : line
            ));
        }

        for (let i = 0; i < wordsWithTimestamps.length; i++) {
            const { word, timestamp } = wordsWithTimestamps[i];

            if (currentLineWords.length >= maxWordsPerLine) {
                // Current line is full, save it and start a new one
                newLines.push({
                    text: currentLineWords.join(' '),
                    segments: currentLineSegments,
                    id: `line-${i}-${Date.now()}`
                });
                currentLineWords = [word];
                currentLineSegments = [{ word, timestamp }];
            } else {
                currentLineWords.push(word);
                currentLineSegments.push({ word, timestamp });
            }
        }

        // Add the last line if it has content
        if (currentLineWords.length > 0) {
            newLines.push({
                text: currentLineWords.join(' '),
                segments: currentLineSegments,
                id: `line-${wordsWithTimestamps.length}-${Date.now()}`
            });
        }

        // Keep only the last maxLines lines
        const displayLines = newLines.slice(-maxLines);

        setLines(displayLines);
    }, [currentTranscription, maxLines, maxWordsPerLine]);

    // Force re-render every second to update color transitions
    useEffect(() => {
        const interval = setInterval(() => {
            // Force a re-render by updating state only if we have lines
            if (lines.length > 0) {
                setLines(prevLines => [...prevLines]);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [lines.length]);

    // Don't render anything if no lines
    if (lines.length === 0) {
        return null;
    }

    return (
        <>
            {/* Multi-line subtitle display */}
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
                            backgroundColor: 'rgba(0, 0, 0, 0.85)',
                            borderRadius: { xs: 0, sm: 0, md: '8px' },
                            padding: { xs: '10px 16px', sm: '12px 24px' },
                            textAlign: 'left',
                            border: '2px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                            transition: 'all 0.15s ease-out',
                        }}
                    >
                        {lines.map((line, lineIdx) => (
                            <Box
                                key={line.id}
                                sx={{
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
                                    mb: lineIdx < lines.length - 1 ? 0.5 : 0,
                                }}
                            >
                                {line.segments.map((segment, segIdx) => {
                                    const ageMs = Date.now() - segment.timestamp;
                                    const isRecent = ageMs < 5000; // Highlight for 5 seconds
                                    const color = isRecent ? 'white' : 'rgba(169, 169, 169, 1)';

                                    return (
                                        <Box
                                            key={`${line.id}-seg-${segIdx}`}
                                            component="span"
                                            sx={{
                                                color: color,
                                                transition: 'color 0.5s ease-out',
                                            }}
                                        >
                                            {segment.word}
                                            {segIdx < line.segments.length - 1 ? ' ' : ''}
                                        </Box>
                                    );
                                })}
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Fade>
        </>
    );
};

export default TranscriptionSubtitles;
