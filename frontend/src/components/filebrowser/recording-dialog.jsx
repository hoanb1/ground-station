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

import React from 'react';
import {
    Box,
    Typography,
    Chip,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
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

export default function RecordingDialog({ open, onClose, recording }) {
    const { t } = useTranslation('filebrowser');

    // Get timezone preference
    const timezone = useSelector((state) => {
        const tzPref = state.preferences?.preferences?.find(p => p.name === 'timezone');
        return tzPref?.value || 'UTC';
    });

    // Timezone-aware date formatting function
    const formatDate = (isoDate) => {
        const date = new Date(isoDate);
        return date.toLocaleString('en-US', { timeZone: timezone });
    };

    if (!recording) return null;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
        >
            <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">Recording Details</Typography>
                    <Box>
                        {recording?.snapshot?.width && recording?.snapshot?.height && (
                            <Chip
                                label={`${recording.snapshot.width}×${recording.snapshot.height}`}
                                size="small"
                                sx={{ mr: 1, height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                            />
                        )}
                        <Chip label={formatBytes(recording?.data_size || 0)} size="small" sx={{ height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }} />
                    </Box>
                </Box>
            </DialogTitle>
            <DialogContent>
                {recording && (
                    <Box sx={{ mt: 1 }}>
                        {recording.snapshot && (
                            <Box sx={{ mb: 2, textAlign: 'center' }}>
                                <img
                                    src={recording.snapshot.url}
                                    alt={recording.name}
                                    style={{ maxWidth: '100%', height: 'auto' }}
                                />
                            </Box>
                        )}

                        <Typography variant="subtitle2" gutterBottom>
                            Name
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2, fontFamily: 'monospace' }}>
                            {recording.name}
                        </Typography>

                        <Typography variant="subtitle2" gutterBottom>
                            Files
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2, fontFamily: 'monospace' }}>
                            {recording.data_file} ({formatBytes(recording.data_size)})
                            <br />
                            {recording.meta_file}
                            {recording.snapshot && (
                                <>
                                    <br />
                                    {recording.snapshot.filename} ({recording.snapshot.width}×{recording.snapshot.height})
                                </>
                            )}
                        </Typography>

                        {recording.metadata && (
                            <>
                                {(recording.metadata.target_satellite_name || recording.metadata.target_satellite_norad_id) && (
                                    <>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Target Satellite
                                        </Typography>
                                        <Box sx={{ mb: 2, fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                            {recording.metadata.target_satellite_name && (
                                                <div>Name: {recording.metadata.target_satellite_name}</div>
                                            )}
                                            {recording.metadata.target_satellite_norad_id && (
                                                <div>NORAD ID: {recording.metadata.target_satellite_norad_id}</div>
                                            )}
                                        </Box>
                                    </>
                                )}

                                <Typography variant="subtitle2" gutterBottom>
                                    Metadata
                                </Typography>
                                <Box sx={{ mb: 2, fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                    {recording.metadata.datatype && (
                                        <div>Data Type: {recording.metadata.datatype}</div>
                                    )}
                                    {recording.metadata.sample_rate && (
                                        <div>Sample Rate: {recording.metadata.sample_rate} Hz</div>
                                    )}
                                    {recording.metadata.start_time && (
                                        <div>Start Time: {formatDate(recording.metadata.start_time)}</div>
                                    )}
                                    {recording.metadata.finalized_time && (
                                        <div>End Time: {formatDate(recording.metadata.finalized_time)}</div>
                                    )}
                                    {recording.metadata.version && (
                                        <div>SigMF Version: {recording.metadata.version}</div>
                                    )}
                                    {recording.metadata.recorder && (
                                        <div>Recorder: {recording.metadata.recorder}</div>
                                    )}
                                    {recording.metadata.description && (
                                        <div>Description: {recording.metadata.description}</div>
                                    )}
                                </Box>

                                {recording.metadata.captures?.length > 0 && (
                                    <>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Capture Segments ({recording.metadata.captures.length})
                                        </Typography>
                                        <Stack spacing={1} sx={{ mb: 2 }}>
                                            {recording.metadata.captures.map((capture, index) => (
                                                <Box
                                                    key={index}
                                                    sx={{
                                                        p: 1.5,
                                                        border: '1px solid',
                                                        borderColor: 'divider',
                                                        borderRadius: 1,
                                                        backgroundColor: 'background.paper',
                                                    }}
                                                >
                                                    <Typography variant="caption" sx={{ fontWeight: 'bold', mb: 0.5, display: 'block' }}>
                                                        Segment {index + 1}
                                                    </Typography>
                                                    <Box sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                        {Object.entries(capture).map(([key, value]) => (
                                                            <Box key={key} sx={{ display: 'flex', gap: 1, py: 0.25 }}>
                                                                <Box component="span" sx={{ color: 'text.secondary', minWidth: '140px' }}>
                                                                    {key}:
                                                                </Box>
                                                                <Box component="span" sx={{ wordBreak: 'break-word' }}>
                                                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                                </Box>
                                                            </Box>
                                                        ))}
                                                    </Box>
                                                </Box>
                                            ))}
                                        </Stack>
                                    </>
                                )}
                            </>
                        )}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => window.open(recording?.download_urls.data, '_blank')}
                    startIcon={<DownloadIcon />}
                >
                    Download Data
                </Button>
                <Button
                    onClick={() => window.open(recording?.download_urls.meta, '_blank')}
                    startIcon={<DownloadIcon />}
                >
                    Download Metadata
                </Button>
                {recording?.snapshot && (
                    <Button
                        onClick={() => window.open(recording.snapshot.url, '_blank')}
                        startIcon={<DownloadIcon />}
                    >
                        Download Snapshot
                    </Button>
                )}
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}
