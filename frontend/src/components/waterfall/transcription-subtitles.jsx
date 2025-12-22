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

import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Box, IconButton, Tooltip, Fade, ToggleButtonGroup, ToggleButton, Grid } from '@mui/material';
import {
    selectFontSizeMultiplier,
    selectTextAlignment,
    clearTranscriptions,
    increaseFontSize,
    decreaseFontSize,
    setTextAlignment
} from './transcription-slice';
import ClearIcon from '@mui/icons-material/Clear';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import TextIncreaseIcon from '@mui/icons-material/TextIncrease';
import TextDecreaseIcon from '@mui/icons-material/TextDecrease';

/**
 * Single VFO Subtitle Component
 */
const VFOSubtitle = ({ vfoNumber, transcription, vfoColor, fontSizeMultiplier, textAlignment, maxLines, maxWordsPerLine }) => {
    const [lines, setLines] = useState([]);

    useEffect(() => {
        if (!transcription || !transcription.segments || transcription.segments.length === 0) {
            setLines([]);
            return;
        }

        // Build lines from segments
        const wordsWithTimestamps = [];
        transcription.segments.forEach(segment => {
            const words = segment.text.split(/\s+/).filter(w => w.length > 0);
            words.forEach(word => {
                wordsWithTimestamps.push({
                    word,
                    timestamp: new Date(segment.timestamp).getTime()
                });
            });
        });

        // Build lines by filling them up to maxWordsPerLine
        const newLines = [];
        let currentLineWords = [];
        let currentLineSegments = [];

        for (let i = 0; i < wordsWithTimestamps.length; i++) {
            const { word, timestamp } = wordsWithTimestamps[i];

            if (currentLineWords.length >= maxWordsPerLine) {
                newLines.push({
                    text: currentLineWords.join(' '),
                    segments: currentLineSegments,
                    id: `vfo${vfoNumber}-line-${i}-${Date.now()}`
                });
                currentLineWords = [word];
                currentLineSegments = [{ word, timestamp }];
            } else {
                currentLineWords.push(word);
                currentLineSegments.push({ word, timestamp });
            }
        }

        if (currentLineWords.length > 0) {
            newLines.push({
                text: currentLineWords.join(' '),
                segments: currentLineSegments,
                id: `vfo${vfoNumber}-line-${wordsWithTimestamps.length}-${Date.now()}`
            });
        }

        // Keep only the last maxLines lines
        const displayLines = newLines.slice(-maxLines);
        setLines(displayLines);
    }, [transcription, maxLines, maxWordsPerLine, vfoNumber]);

    // Force re-render every second to update color transitions
    useEffect(() => {
        const interval = setInterval(() => {
            if (lines.length > 0) {
                setLines(prevLines => [...prevLines]);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [lines.length]);

    if (lines.length === 0) {
        return null;
    }

    return (
        <Fade in={true} timeout={300}>
            <Box
                sx={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    pointerEvents: 'auto',
                }}
            >
                {/* Subtitle box */}
                <Box
                    sx={{
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        borderRadius: '8px',
                        padding: { xs: '10px 16px', sm: '12px 24px' },
                        textAlign: textAlignment,
                        border: `2px solid ${vfoColor}40`,
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                        transition: 'all 0.15s ease-out',
                        width: 'fit-content',
                        maxWidth: '100%',
                        minWidth: 'max-content',
                    }}
                >
                    {/* VFO Label */}
                    <Box
                        sx={{
                            fontSize: { xs: '0.65rem', sm: '0.7rem', md: '0.75rem' },
                            fontWeight: 700,
                            color: vfoColor,
                            mb: 0.5,
                            textAlign: 'center',
                            letterSpacing: '0.5px',
                        }}
                    >
                        VFO{vfoNumber}
                    </Box>

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
                                whiteSpace: 'nowrap',
                                mb: lineIdx < lines.length - 1 ? 0.5 : 0,
                            }}
                        >
                            {line.segments.map((segment, segIdx) => {
                                const ageMs = Date.now() - segment.timestamp;
                                const isRecent = ageMs < 5000;
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
    );
};

/**
 * TranscriptionSubtitles Component
 *
 * Displays separate subtitle overlays for each active VFO with responsive grid layout
 */
const TranscriptionSubtitles = ({ maxLines = 3, maxWordsPerLine = 20 }) => {
    const dispatch = useDispatch();

    // Get live transcription state
    const liveTranscription = useSelector((state) => state.transcription.liveTranscription);
    const fontSizeMultiplier = useSelector(selectFontSizeMultiplier);
    const textAlignment = useSelector(selectTextAlignment);

    // Get VFO colors from Redux
    const vfoColors = useSelector((state) => state.vfo.vfoColors);

    // Get drawer state to adjust subtitle position
    const packetsDrawerOpen = useSelector((state) => state.waterfall.packetsDrawerOpen);
    const packetsDrawerHeight = useSelector((state) => state.waterfall.packetsDrawerHeight);

    // Calculate bottom position
    const statusBarHeight = 30;
    const padding = 40;
    const bottomPosition = statusBarHeight + (packetsDrawerOpen ? packetsDrawerHeight : 0) + padding;

    // Get active VFOs (those with transcriptions)
    const activeVFOs = useMemo(() => {
        return Object.entries(liveTranscription)
            .filter(([_, transcription]) =>
                transcription &&
                transcription.segments &&
                transcription.segments.length > 0
            )
            .map(([_, transcription]) => ({
                vfoNumber: transcription.vfoNumber,
                transcription
            }))
            .sort((a, b) => a.vfoNumber - b.vfoNumber);
    }, [liveTranscription]);

    // Handlers
    const handleClear = (vfoNumber) => {
        dispatch(clearTranscriptions({ vfoNumber }));
    };

    const handleIncreaseFontSize = () => {
        dispatch(increaseFontSize());
    };

    const handleDecreaseFontSize = () => {
        dispatch(decreaseFontSize());
    };

    const handleSetAlignment = (alignment) => {
        dispatch(setTextAlignment(alignment));
    };

    if (activeVFOs.length === 0) {
        return null;
    }

    // Determine grid columns based on number of active VFOs and screen size
    // Mobile: full width (12)
    // Tablet: 2 columns if multiple VFOs (6), otherwise full width (12)
    // Desktop: always rows, full width (12)
    const gridColumnsXs = 12;
    const gridColumnsSm = activeVFOs.length === 1 ? 12 : 6;
    const gridColumnsMd = 12;

    return (
        <Box
            sx={{
                position: 'fixed',
                bottom: `${bottomPosition}px`,
                left: 0,
                right: 0,
                zIndex: 1000,
                pointerEvents: 'none',
                transition: 'bottom 0.3s ease-out',
                display: 'flex',
                justifyContent: 'center',
                px: 2,
            }}
        >
            <Box sx={{ width: '100%', maxWidth: '1600px' }}>
                {/* Single global toolbar */}
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 1,
                        mb: 2,
                        pointerEvents: 'auto',
                    }}
                >
                    <Box
                        sx={{
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                            borderRadius: '4px',
                            padding: '4px',
                            display: 'flex',
                            gap: 0.5,
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                    >
                        {/* Clear all button */}
                        <Tooltip title="Clear all subtitles">
                            <IconButton
                                size="small"
                                onClick={() => dispatch(clearTranscriptions())}
                                sx={{
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    '&:hover': { color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' }
                                }}
                            >
                                <ClearIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>

                        {/* Text alignment toggle */}
                        <ToggleButtonGroup
                            value={textAlignment}
                            exclusive
                            onChange={handleSetAlignment}
                            size="small"
                            sx={{
                                '& .MuiToggleButton-root': {
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    border: 'none',
                                    padding: '4px 8px',
                                    '&:hover': {
                                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                    },
                                    '&.Mui-selected': {
                                        color: 'white',
                                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                        '&:hover': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                        },
                                    },
                                },
                            }}
                        >
                            <ToggleButton value="left">
                                <FormatAlignLeftIcon fontSize="small" />
                            </ToggleButton>
                            <ToggleButton value="center">
                                <FormatAlignCenterIcon fontSize="small" />
                            </ToggleButton>
                            <ToggleButton value="right">
                                <FormatAlignRightIcon fontSize="small" />
                            </ToggleButton>
                        </ToggleButtonGroup>

                        {/* Font size controls */}
                        <Tooltip title="Decrease font size">
                            <IconButton
                                size="small"
                                onClick={handleDecreaseFontSize}
                                sx={{
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    '&:hover': { color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' }
                                }}
                            >
                                <TextDecreaseIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Increase font size">
                            <IconButton
                                size="small"
                                onClick={handleIncreaseFontSize}
                                sx={{
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    '&:hover': { color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' }
                                }}
                            >
                                <TextIncreaseIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Subtitle grid */}
                <Grid container spacing={2} justifyContent="center">
                    {activeVFOs.map(({ vfoNumber, transcription }) => (
                        <Grid
                            item
                            key={vfoNumber}
                            xs={gridColumnsXs}
                            sm={gridColumnsSm}
                            md={gridColumnsMd}
                            sx={{
                                display: 'flex',
                                justifyContent: 'center',
                            }}
                        >
                            <VFOSubtitle
                                vfoNumber={vfoNumber}
                                transcription={transcription}
                                vfoColor={vfoColors[vfoNumber - 1]}
                                fontSizeMultiplier={fontSizeMultiplier}
                                textAlignment={textAlignment}
                                maxLines={maxLines}
                                maxWordsPerLine={maxWordsPerLine}
                            />
                        </Grid>
                    ))}
                </Grid>
            </Box>
        </Box>
    );
};

export default TranscriptionSubtitles;
