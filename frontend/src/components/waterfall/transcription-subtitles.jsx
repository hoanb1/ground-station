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
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeMuteIcon from '@mui/icons-material/VolumeMute';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

/**
 * Language code to emoji flag mapping
 * Using Unicode regional indicator symbols
 */
const getLanguageFlag = (languageCode) => {
    if (!languageCode || languageCode === 'auto' || languageCode === 'unknown') {
        return '🌐'; // Globe for unknown/auto
    }

    const lowerCode = languageCode.toLowerCase();

    // Handle regional variants (e.g., pt-br, en-us, zh-cn)
    const regionalMapping = {
        'pt-br': 'br', // Brazilian Portuguese
        'pt-pt': 'pt', // European Portuguese
        'en-us': 'us', // American English
        'en-gb': 'gb', // British English
        'en-au': 'au', // Australian English
        'en-ca': 'ca', // Canadian English
        'es-mx': 'mx', // Mexican Spanish
        'es-es': 'es', // European Spanish
        'zh-cn': 'cn', // Simplified Chinese
        'zh-tw': 'tw', // Traditional Chinese
        'fr-ca': 'ca', // Canadian French
        'fr-fr': 'fr', // European French
    };

    // Check regional mapping first
    if (regionalMapping[lowerCode]) {
        const countryCode = regionalMapping[lowerCode];
        const codePoints = [...countryCode.toUpperCase()].map(char =>
            0x1F1E6 + char.charCodeAt(0) - 'A'.charCodeAt(0)
        );
        return String.fromCodePoint(...codePoints);
    }

    // Map language codes to country codes (approximate)
    const languageToCountry = {
        'en': 'gb', // English -> UK flag
        'es': 'es', // Spanish
        'fr': 'fr', // French
        'de': 'de', // German
        'it': 'it', // Italian
        'pt': 'pt', // Portuguese
        'ru': 'ru', // Russian
        'zh': 'cn', // Chinese
        'ja': 'jp', // Japanese
        'ko': 'kr', // Korean
        'ar': 'sa', // Arabic
        'el': 'gr', // Greek
        'nl': 'nl', // Dutch
        'sv': 'se', // Swedish
        'no': 'no', // Norwegian
        'da': 'dk', // Danish
        'fi': 'fi', // Finnish
        'pl': 'pl', // Polish
        'tr': 'tr', // Turkish
        'hi': 'in', // Hindi
        'th': 'th', // Thai
        'vi': 'vn', // Vietnamese
        'id': 'id', // Indonesian
        'ms': 'my', // Malay
        'uk': 'ua', // Ukrainian
        'cs': 'cz', // Czech
        'ro': 'ro', // Romanian
        'hu': 'hu', // Hungarian
        'he': 'il', // Hebrew
    };

    const countryCode = languageToCountry[lowerCode] || lowerCode.split('-')[0]; // Fallback to first part before hyphen

    // Convert country code to flag emoji
    // Regional indicator symbols: 🇦 = U+1F1E6, 🇿 = U+1F1FF
    try {
        const codePoints = [...countryCode.toUpperCase()].map(char =>
            0x1F1E6 + char.charCodeAt(0) - 'A'.charCodeAt(0)
        );
        return String.fromCodePoint(...codePoints);
    } catch (e) {
        return '🌐'; // Fallback to globe if conversion fails
    }
};

/**
 * Single VFO Subtitle Component
 */
const VFOSubtitle = ({ vfoNumber, transcription, vfoColor, fontSizeMultiplier, textAlignment, maxLines, maxWordsPerLine, onClear, onIncreaseFontSize, onDecreaseFontSize, onSetAlignment, isStreaming, isMuted, translateTo, sourceLang }) => {
    const [lines, setLines] = useState([]);

    // Debug translation settings
    console.log(`[VFO${vfoNumber} Subtitle] translateTo:`, translateTo, 'sourceLang:', sourceLang, 'transcription.language:', transcription.language);

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
                        padding: { xs: '8px 12px', sm: '10px 16px' },
                        textAlign: textAlignment,
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                        transition: 'all 0.15s ease-out',
                        width: { xs: '100%', sm: 'fit-content' },
                        maxWidth: '100%',
                        minWidth: { xs: 'auto', sm: 'max-content' },
                    }}
                >
                    {/* Header with VFO label and controls */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            mb: 0.5,
                            gap: 2,
                        }}
                    >
                        {/* VFO Label with Speaker Icon and Language Info - Left */}
                        <Box
                            sx={{
                                fontSize: { xs: '0.65rem', sm: '0.7rem', md: '0.75rem' },
                                fontWeight: 700,
                                color: vfoColor,
                                letterSpacing: '0.5px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                            }}
                        >
                            <span>VFO{vfoNumber}</span>

                            {/* Speaker Icon - three states like VFO marker */}
                            {!isStreaming ? (
                                <VolumeMuteIcon sx={{ fontSize: '0.9rem', color: '#888888' }} />
                            ) : isMuted ? (
                                <VolumeMuteIcon sx={{ fontSize: '0.9rem', color: '#00ff00' }} />
                            ) : (
                                <VolumeUpIcon sx={{ fontSize: '0.9rem', color: '#00ff00' }} />
                            )}

                            {/* Language Display Logic:
                                - When NOT translating: show detected language from transcription
                                - When translating: show source → target with arrow
                            */}
                            {translateTo && translateTo !== 'none' ? (
                                // Translation mode: show source → target
                                <>
                                    {/* Source Language */}
                                    <span style={{ fontSize: '1rem', lineHeight: 1 }}>
                                        {getLanguageFlag(sourceLang)}
                                    </span>
                                    <span style={{
                                        fontSize: '0.6rem',
                                        opacity: 0.7,
                                        fontWeight: 400,
                                        textTransform: 'uppercase'
                                    }}>
                                        {sourceLang === 'auto' ? 'AUTO' : sourceLang}
                                    </span>

                                    {/* Arrow */}
                                    <ArrowForwardIcon sx={{ fontSize: '0.8rem', opacity: 0.7 }} />

                                    {/* Target Language */}
                                    <span style={{ fontSize: '1rem', lineHeight: 1 }}>
                                        {getLanguageFlag(translateTo)}
                                    </span>
                                    <span style={{
                                        fontSize: '0.6rem',
                                        opacity: 0.7,
                                        fontWeight: 400,
                                        textTransform: 'uppercase'
                                    }}>
                                        {translateTo}
                                    </span>
                                </>
                            ) : (
                                // No translation: show detected language
                                transcription.language && transcription.language !== 'auto' && transcription.language !== 'unknown' && (
                                    <>
                                        <span style={{ fontSize: '1rem', lineHeight: 1 }}>
                                            {getLanguageFlag(transcription.language)}
                                        </span>
                                        <span style={{
                                            fontSize: '0.6rem',
                                            opacity: 0.7,
                                            fontWeight: 400,
                                            textTransform: 'uppercase'
                                        }}>
                                            {transcription.language}
                                        </span>
                                    </>
                                )
                            )}
                        </Box>

                        {/* Controls - Right */}
                        <Box
                            sx={{
                                display: 'flex',
                                gap: 0.25,
                                alignItems: 'center',
                            }}
                        >
                            {/* Text alignment toggle */}
                            <ToggleButtonGroup
                                value={textAlignment}
                                exclusive
                                onChange={onSetAlignment}
                                size="small"
                                sx={{
                                    height: '24px',
                                    '& .MuiToggleButton-root': {
                                        color: 'rgba(255, 255, 255, 0.6)',
                                        border: 'none',
                                        padding: '2px 4px',
                                        minWidth: 'unset',
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
                                    <FormatAlignLeftIcon sx={{ fontSize: '0.9rem' }} />
                                </ToggleButton>
                                <ToggleButton value="center">
                                    <FormatAlignCenterIcon sx={{ fontSize: '0.9rem' }} />
                                </ToggleButton>
                                <ToggleButton value="right">
                                    <FormatAlignRightIcon sx={{ fontSize: '0.9rem' }} />
                                </ToggleButton>
                            </ToggleButtonGroup>

                            {/* Font size controls */}
                            <Tooltip title="Decrease font size">
                                <IconButton
                                    size="small"
                                    onClick={onDecreaseFontSize}
                                    sx={{
                                        color: 'rgba(255, 255, 255, 0.6)',
                                        padding: '2px',
                                        '&:hover': { color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' }
                                    }}
                                >
                                    <TextDecreaseIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Increase font size">
                                <IconButton
                                    size="small"
                                    onClick={onIncreaseFontSize}
                                    sx={{
                                        color: 'rgba(255, 255, 255, 0.6)',
                                        padding: '2px',
                                        '&:hover': { color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' }
                                    }}
                                >
                                    <TextIncreaseIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>

                            {/* Clear button - rightmost */}
                            <Tooltip title="Clear subtitles">
                                <IconButton
                                    size="small"
                                    onClick={() => onClear(vfoNumber)}
                                    sx={{
                                        color: 'rgba(255, 255, 255, 0.6)',
                                        padding: '2px',
                                        '&:hover': { color: 'white', backgroundColor: 'rgba(255, 255, 255, 0.1)' }
                                    }}
                                >
                                    <ClearIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
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
                                whiteSpace: { xs: 'normal', sm: 'nowrap' },
                                wordWrap: { xs: 'break-word', sm: 'normal' },
                                overflowWrap: { xs: 'break-word', sm: 'normal' },
                                mb: lineIdx < lines.length - 1 ? 0.5 : 0,
                            }}
                        >
                            {line.segments.map((segment, segIdx) => {
                                const ageMs = Date.now() - segment.timestamp;
                                const isRecent = ageMs < 10000;
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

    // Get global subtitle settings
    const fontSizeMultiplier = useSelector((state) => state.transcription.fontSizeMultiplier);
    const textAlignment = useSelector((state) => state.transcription.textAlignment);

    // Get VFO data from Redux
    const vfoColors = useSelector((state) => state.vfo.vfoColors);
    const vfoMarkers = useSelector((state) => state.vfo.vfoMarkers);
    const streamingVFOs = useSelector((state) => state.vfo.streamingVFOs);
    const vfoMuted = useSelector((state) => state.vfo.vfoMuted);

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

    // Handlers - now global
    const handleClear = (vfoNumber) => {
        dispatch(clearTranscriptions({ vfoNumber }));
    };

    const handleIncreaseFontSize = () => {
        dispatch(increaseFontSize());
    };

    const handleDecreaseFontSize = () => {
        dispatch(decreaseFontSize());
    };

    const handleSetAlignment = (event, alignment) => {
        if (alignment !== null) {
            dispatch(setTextAlignment({ alignment }));
        }
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
                bottom: '40px',
                left: 0,
                right: 0,
                zIndex: 1000,
                pointerEvents: 'none',
                display: 'flex',
                justifyContent: 'center',
                px: 2,
            }}
        >
            <Box sx={{ width: '100%', maxWidth: '1600px' }}>
                {/* Subtitle grid */}
                <Grid container spacing={2} justifyContent="center">
                    {activeVFOs.map(({ vfoNumber, transcription }) => {
                        const vfoMarker = vfoMarkers[vfoNumber]; // vfoMarkers is an object with keys 1, 2, 3, 4
                        const translateTo = vfoMarker?.transcriptionTranslateTo || 'none';
                        const sourceLang = vfoMarker?.transcriptionLanguage || 'auto';

                        console.log(`[TranscriptionSubtitles] VFO${vfoNumber} marker:`, vfoMarker, 'translateTo:', translateTo, 'sourceLang:', sourceLang);

                        return (
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
                                    onClear={handleClear}
                                    onIncreaseFontSize={handleIncreaseFontSize}
                                    onDecreaseFontSize={handleDecreaseFontSize}
                                    onSetAlignment={handleSetAlignment}
                                    isStreaming={streamingVFOs.includes(vfoNumber)}
                                    isMuted={vfoMuted[vfoNumber]}
                                    translateTo={translateTo}
                                    sourceLang={sourceLang}
                                />
                            </Grid>
                        );
                    })}
                </Grid>
            </Box>
        </Box>
    );
};

export default TranscriptionSubtitles;
