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
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    IconButton,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    FormControlLabel,
    Switch,
    Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BuildIcon from '@mui/icons-material/Build';
import { useSocket } from '../common/socket.jsx';
import { toast } from 'react-toastify';

// Common SatDump satellite/pipeline configurations
const SATDUMP_PIPELINES = [
    { value: 'meteor_m2-x_lrpt', label: 'METEOR-M2 LRPT', category: 'METEOR' },
];

const BASEBAND_FORMATS = [
    { value: 'i16', label: 'Complex Int16 (i16)' },
    { value: 'i8', label: 'Complex Int8 (i8)' },
    { value: 'f32', label: 'Complex Float32 (f32)' },
    { value: 'w16', label: 'Complex Int16 WAV (w16)' },
    { value: 'w8', label: 'Complex Int8 WAV (w8)' },
];

export default function ProcessingDialog({ open, onClose, recording }) {
    const { socket } = useSocket();

    // Helper function to map SigMF data type to SatDump baseband format
    const getSatDumpFormat = (datatype) => {
        if (!datatype) return 'i16';

        // SigMF format: "c" or "r" + type + "_" + size
        // Examples: ci16_le, cf32_le, ci8, etc.
        const lower = datatype.toLowerCase();

        if (lower.includes('ci16') || lower.includes('c16')) return 'i16';
        if (lower.includes('ci8') || lower.includes('c8')) return 'i8';
        if (lower.includes('cf32') || lower.includes('c32')) return 'f32';
        if (lower.includes('cu8')) return 'i8';

        // Default to i16 if unknown
        return 'i16';
    };

    const [selectedPipeline, setSelectedPipeline] = useState('meteor_m2-x_lrpt');
    const [basebandFormat, setBasebandFormat] = useState('i16');
    const [samplerate, setSamplerate] = useState(0);
    const [finishProcessing, setFinishProcessing] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Update format and sample rate when recording changes
    useEffect(() => {
        if (recording?.metadata) {
            const detectedFormat = getSatDumpFormat(recording.metadata.datatype);
            const detectedSamplerate = recording.metadata.sample_rate || 0;

            console.log('Recording metadata:', {
                name: recording.name,
                datatype: recording.metadata.datatype,
                sample_rate: recording.metadata.sample_rate,
                detectedFormat,
                detectedSamplerate
            });

            setBasebandFormat(detectedFormat);
            setSamplerate(detectedSamplerate);
        }
    }, [recording]);

    if (!recording) return null;

    const handleSubmit = async () => {
        if (!socket) {
            toast.error('Not connected to server');
            return;
        }

        setSubmitting(true);

        try {
            // Extract base name without .sigmf-data or .sigmf-meta extensions
            let baseName = recording.name;
            if (baseName.endsWith('.sigmf-data')) {
                baseName = baseName.slice(0, -12);
            } else if (baseName.endsWith('.sigmf-meta')) {
                baseName = baseName.slice(0, -12);
            }

            // Build recording path - use .sigmf-data file (the actual IQ data)
            const recordingPath = `/recordings/${baseName}.sigmf-data`;

            // Generate output directory matching SatDump naming convention
            // Format: SATELLITE_TIMESTAMP.satdump_PIPELINE
            const outputDir = `/decoded/${baseName}.satdump_${selectedPipeline}`;

            // Prepare task arguments
            const taskArgs = [recordingPath, outputDir, selectedPipeline];
            const taskKwargs = {
                samplerate: Number(samplerate),
                baseband_format: basebandFormat,
                start_timestamp: recording.start_time ? Math.floor(new Date(recording.start_time).getTime() / 1000) : null,
                finish_processing: finishProcessing,
            };

            // Submit task via Socket.IO
            const response = await new Promise((resolve, reject) => {
                socket.emit(
                    'background_task:start',
                    {
                        task_name: 'satdump_process',
                        args: taskArgs,
                        kwargs: taskKwargs,
                        name: `SatDump: ${recording.name} (${selectedPipeline})`,
                    },
                    (response) => {
                        if (response.success) {
                            resolve(response);
                        } else {
                            reject(new Error(response.error || 'Unknown error'));
                        }
                    }
                );
            });

            toast.success(`Processing task started: ${response.task_id}`);
            onClose();
        } catch (error) {
            console.error('Error starting SatDump task:', error);
            toast.error(`Failed to start task: ${error.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BuildIcon color="primary" />
                        <Typography variant="h6">
                            Process IQ Recording
                        </Typography>
                    </Box>
                    <IconButton onClick={onClose}>
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {recording.name}
                </Typography>
            </DialogTitle>

            <DialogContent>
                <Box sx={{ pt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                        SatDump Processing
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Process this IQ recording using SatDump satellite decoder
                    </Typography>

                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Satellite / Pipeline</InputLabel>
                        <Select
                            value={selectedPipeline}
                            label="Satellite / Pipeline"
                            onChange={(e) => setSelectedPipeline(e.target.value)}
                        >
                            {['METEOR', 'NOAA', 'MetOp', 'FengYun', 'NASA EOS', 'JPSS', 'GOES', 'Elektro', 'PROBA'].map((category) => {
                                const categoryPipelines = SATDUMP_PIPELINES.filter(p => p.category === category);
                                if (categoryPipelines.length === 0) return null;
                                return [
                                    <MenuItem key={`header-${category}`} disabled sx={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                                        {category}
                                    </MenuItem>,
                                    ...categoryPipelines.map((pipeline) => (
                                        <MenuItem key={pipeline.value} value={pipeline.value} sx={{ pl: 4 }}>
                                            {pipeline.label}
                                        </MenuItem>
                                    ))
                                ];
                            })}
                        </Select>
                    </FormControl>

                    <FormControl fullWidth sx={{ mb: 2 }} disabled>
                        <InputLabel>Baseband Format</InputLabel>
                        <Select
                            value={basebandFormat}
                            label="Baseband Format"
                            onChange={(e) => setBasebandFormat(e.target.value)}
                        >
                            {BASEBAND_FORMATS.map((format) => (
                                <MenuItem key={format.value} value={format.value}>
                                    {format.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <TextField
                        fullWidth
                        label="Sample Rate (Hz)"
                        type="number"
                        value={samplerate}
                        onChange={(e) => setSamplerate(e.target.value)}
                        disabled
                        sx={{ mb: 2 }}
                    />

                    <FormControlLabel
                        control={
                            <Switch
                                checked={finishProcessing}
                                onChange={(e) => setFinishProcessing(e.target.checked)}
                            />
                        }
                        label="Generate products after decoding"
                    />

                    <Divider sx={{ my: 2 }} />

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Note:</strong> Processing will run in the background. You can monitor progress in the Tasks panel.
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            ⓘ Ensure the signal is centered at the recording's center frequency for a successful decoding.
                        </Typography>
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={submitting}
                    startIcon={<BuildIcon />}
                >
                    {submitting ? 'Starting...' : 'Start Processing'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
