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
import {
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from './settings-elements.jsx';
import Typography from '@mui/material/Typography';
import {
    Box,
    Button,
    TextField,
    Chip,
    Stack,
} from "@mui/material";
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import StopIcon from '@mui/icons-material/Stop';
import { useTranslation } from 'react-i18next';

const RecordingAccordion = ({
    expanded,
    onAccordionChange,
    isRecording,
    recordingDuration,
    recordingName,
    actualRecordingName,
    onRecordingNameChange,
    onStartRecording,
    onStopRecording,
    isStreaming,
    selectedSDRId,
}) => {
    const { t } = useTranslation('waterfall');
    const [localRecordingName, setLocalRecordingName] = useState(recordingName);
    const [recordingStartFilename, setRecordingStartFilename] = useState('');

    useEffect(() => {
        setLocalRecordingName(recordingName);
    }, [recordingName]);

    const formatDuration = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    const generateTimestamp = () => {
        const now = new Date();
        const date = now.toISOString().split('T')[0].replace(/-/g, '');
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
        return `${date}_${time}`;
    };

    const handleStartRecording = () => {
        const baseName = localRecordingName.trim() || 'unknown_recording';

        // Generate the actual filename with timestamp (matching backend logic)
        const timestamp = generateTimestamp();
        const actualFilename = `${baseName}_${timestamp}`;

        // Store the actual filename for display during recording
        setRecordingStartFilename(actualFilename);

        // Send the base name - backend will append timestamp
        onRecordingNameChange(baseName);
        onStartRecording();
    };

    const handleNameChange = (e) => {
        const value = e.target.value;
        setLocalRecordingName(value);
        onRecordingNameChange(value);
    };

    const canStartRecording = isStreaming && !isRecording && selectedSDRId !== "none";

    return (
        <Accordion expanded={expanded} onChange={onAccordionChange}>
            <AccordionSummary
                sx={{
                    boxShadow: '-1px 4px 7px #00000059',
                    backgroundColor: isRecording ? 'rgba(255, 0, 0, 0.1)' : 'inherit',
                }}
                aria-controls="panel-recording-content"
                id="panel-recording-header"
            >
                <Stack direction="row" spacing={1} alignItems="center" width="100%">
                    <Typography component="span">
                        {t('recording.title', 'IQ Recording')}
                    </Typography>
                    {isRecording && (
                        <Chip
                            icon={<FiberManualRecordIcon />}
                            label={formatDuration(recordingDuration)}
                            color="error"
                            size="small"
                            sx={{
                                animation: 'pulse 2s ease-in-out infinite',
                                '@keyframes pulse': {
                                    '0%, 100%': { opacity: 1 },
                                    '50%': { opacity: 0.6 },
                                },
                            }}
                        />
                    )}
                </Stack>
            </AccordionSummary>
            <AccordionDetails
                sx={{
                    backgroundColor: 'background.elevated',
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label={t('recording.filename', 'Recording Name')}
                        value={localRecordingName}
                        onChange={handleNameChange}
                        disabled={isRecording}
                        size="small"
                        fullWidth
                        variant="filled"
                        placeholder="unknown_recording"
                    />

                    <Box
                        sx={{
                            p: isRecording ? 2 : 1,
                            backgroundColor: isRecording ? 'rgba(255, 0, 0, 0.05)' : 'rgba(128, 128, 128, 0.05)',
                            borderRadius: 1,
                            border: isRecording ? '1px solid rgba(255, 0, 0, 0.3)' : '1px solid rgba(128, 128, 128, 0.2)',
                            opacity: isRecording ? 1 : 0.5,
                            transition: 'all 0.3s ease',
                        }}
                    >
                        <Stack spacing={isRecording ? 1 : 0.5}>
                            {isRecording && (
                                <Typography variant="body2" color="text.secondary">
                                    {t('recording.recording_in_progress', 'Recording in progress...')}
                                </Typography>
                            )}
                            <Typography
                                variant={isRecording ? "h4" : "h6"}
                                sx={{
                                    fontFamily: 'monospace',
                                    textAlign: 'center',
                                    transition: 'font-size 0.3s ease'
                                }}
                            >
                                {formatDuration(recordingDuration)}
                            </Typography>
                            {isRecording && (
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{
                                        textAlign: 'center',
                                        wordBreak: 'break-all',
                                        fontFamily: 'monospace'
                                    }}
                                >
                                    {recordingStartFilename}.sigmf-data
                                </Typography>
                            )}
                        </Stack>
                    </Box>

                    <Stack direction="row" spacing={1}>
                        <Button
                            variant="contained"
                            color="error"
                            startIcon={<FiberManualRecordIcon />}
                            onClick={handleStartRecording}
                            disabled={!canStartRecording}
                            fullWidth
                        >
                            {t('recording.start', 'RECORD')}
                        </Button>
                        <Button
                            variant="outlined"
                            color="inherit"
                            startIcon={<StopIcon />}
                            onClick={onStopRecording}
                            disabled={!isRecording}
                            fullWidth
                        >
                            {t('recording.stop', 'Stop')}
                        </Button>
                    </Stack>
                </Box>
            </AccordionDetails>
        </Accordion>
    );
};

export default RecordingAccordion;
