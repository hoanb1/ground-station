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

import React, { useEffect, useState } from 'react';
import {
    Box,
    Typography,
    Chip,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    CircularProgress,
    Alert,
    Divider,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export default function TranscriptionDialog({ open, onClose, transcription }) {
    const { t } = useTranslation('filebrowser');
    const [transcriptionText, setTranscriptionText] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Get timezone preference
    const timezone = useSelector((state) => {
        const tzPref = state.preferences?.preferences?.find(p => p.name === 'timezone');
        return tzPref?.value || 'UTC';
    });

    // Timezone-aware date formatting function
    const formatDate = (isoDate) => {
        if (!isoDate) return 'N/A';
        const date = new Date(isoDate);
        return date.toLocaleString('en-US', { timeZone: timezone });
    };

    // Load transcription text when dialog opens
    useEffect(() => {
        if (!open || !transcription?.url) {
            setTranscriptionText('');
            setError(null);
            return;
        }

        const loadTranscription = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(transcription.url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const text = await response.text();
                setTranscriptionText(text);
            } catch (err) {
                console.error('Error loading transcription:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadTranscription();
    }, [open, transcription?.url]);

    const handleDownload = () => {
        if (transcription?.url) {
            window.open(transcription.url, '_blank');
        }
    };

    if (!transcription) return null;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">Transcription Details</Typography>
                    <Box>
                        {transcription.provider && (
                            <Chip
                                label={transcription.provider}
                                size="small"
                                color="secondary"
                                sx={{ mr: 1, height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                            />
                        )}
                        {transcription.size && (
                            <Chip
                                label={formatBytes(transcription.size)}
                                size="small"
                                sx={{ height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                            />
                        )}
                    </Box>
                </Box>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mt: 1 }}>
                    {/* File Information */}
                    <Typography variant="subtitle2" gutterBottom>
                        Filename
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, fontFamily: 'monospace' }}>
                        {transcription.filename}
                    </Typography>

                    {/* Transcription Metadata */}
                    {transcription.metadata && (
                        <>
                            <Typography variant="subtitle2" gutterBottom>
                                Transcription Properties
                            </Typography>
                            <Box sx={{ mb: 2, fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                {transcription.provider && (
                                    <div>Provider: {transcription.provider}</div>
                                )}
                                {transcription.session_id && (
                                    <div>Session ID: {transcription.session_id}</div>
                                )}
                                {transcription.vfo_number && (
                                    <div>VFO: {transcription.vfo_number}</div>
                                )}
                                {transcription.language && (
                                    <div>Language: {transcription.language}</div>
                                )}
                                {transcription.translate_to && (
                                    <div>Translated To: {transcription.translate_to}</div>
                                )}
                            </Box>

                            {(transcription.started || transcription.ended) && (
                                <>
                                    <Typography variant="subtitle2" gutterBottom>
                                        Transcription Times
                                    </Typography>
                                    <Box sx={{ mb: 2, fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                        {transcription.started && (
                                            <div>Started: {formatDate(transcription.started)}</div>
                                        )}
                                        {transcription.ended && (
                                            <div>Ended: {formatDate(transcription.ended)}</div>
                                        )}
                                    </Box>
                                </>
                            )}
                        </>
                    )}

                    <Divider sx={{ my: 2 }} />

                    {/* Transcription Text */}
                    <Typography variant="subtitle2" gutterBottom>
                        Transcription Text
                    </Typography>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                            <CircularProgress />
                        </Box>
                    ) : error ? (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            Failed to load transcription: {error}
                        </Alert>
                    ) : (
                        <Box
                            sx={{
                                p: 2,
                                backgroundColor: 'background.default',
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider',
                                maxHeight: 400,
                                overflowY: 'auto',
                                fontFamily: 'monospace',
                                fontSize: '0.875rem',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                lineHeight: 1.6,
                            }}
                        >
                            {transcriptionText || 'No transcription text available'}
                        </Box>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={handleDownload}
                    startIcon={<DownloadIcon />}
                >
                    Download
                </Button>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}
