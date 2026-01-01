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
import { useDispatch, useSelector } from 'react-redux';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Box,
    Typography,
    Divider,
    Chip,
    Stack,
    IconButton,
    Checkbox,
    FormControlLabel,
    Autocomplete,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { useSocket } from '../common/socket.jsx';
import {
    addObservation,
    updateObservation,
    setDialogOpen,
    setSatelliteId,
    setGroupId,
    setGroupOfSats,
    setSelectedFromSearch,
    setSelectedPassId,
} from './scheduler-slice.jsx';
import { fetchSDRs } from '../hardware/sdr-slice.jsx';
import { fetchSatellite } from '../satellites/satellite-slice.jsx';
import { SatelliteSelector } from './satellite-selector.jsx';
import { getDecoderParameters, getDecoderDefaultParameters } from '../waterfall/decoder-parameters.js';

const DECODER_TYPES = [
    { value: 'none', label: 'None' },
    { value: 'lora', label: 'LoRa' },
    { value: 'fsk', label: 'FSK' },
    { value: 'gmsk', label: 'GMSK' },
    { value: 'gfsk', label: 'GFSK' },
    { value: 'bpsk', label: 'BPSK' },
    { value: 'afsk', label: 'AFSK' },
    { value: 'sstv', label: 'SSTV' },
];

const DEMODULATOR_TYPES = [
    { value: 'fm', label: 'FM (Frequency Modulation)' },
    { value: 'am', label: 'AM (Amplitude Modulation)' },
    { value: 'usb', label: 'USB (Upper Sideband)' },
    { value: 'lsb', label: 'LSB (Lower Sideband)' },
    { value: 'cw', label: 'CW (Continuous Wave)' },
];

const SAMPLE_RATES = [
    { value: 500000, label: '500 kHz' },
    { value: 1000000, label: '1 MHz' },
    { value: 2000000, label: '2 MHz' },
    { value: 2400000, label: '2.4 MHz' },
    { value: 3000000, label: '3 MHz' },
    { value: 4000000, label: '4 MHz' },
    { value: 5000000, label: '5 MHz' },
    { value: 6000000, label: '6 MHz' },
    { value: 8000000, label: '8 MHz' },
    { value: 10000000, label: '10 MHz' },
    { value: 12000000, label: '12 MHz' },
    { value: 16000000, label: '16 MHz' },
];

const ObservationFormDialog = () => {
    const dispatch = useDispatch();
    const { socket } = useSocket();

    const open = useSelector((state) => state.scheduler?.dialogOpen || false);
    const selectedObservation = useSelector((state) => state.scheduler?.selectedObservation);
    const sdrs = useSelector((state) => state.sdrs?.sdrs || []);
    const selectedSatelliteId = useSelector((state) => state.scheduler?.satelliteSelection?.satelliteId);
    const groupOfSats = useSelector((state) => state.scheduler?.satelliteSelection?.groupOfSats || []);
    const rotators = useSelector((state) => state.rotators?.rotators || []);

    const [formData, setFormData] = useState({
        name: '',
        enabled: true,
        satellite: { norad_id: '', name: '' },
        pass: null,
        sdr: { id: '', name: '', sample_rate: 2000000 },
        transmitter: { id: '', frequency: 0, mode: '', bandwidth: 0 },
        tasks: [],
        rotator: { id: null, tracking_enabled: false },
        rig: { id: null, doppler_correction: false, vfo: 'VFO_A' },
    });

    // Get transmitters from selected satellite
    const selectedSatellite = groupOfSats.find(sat => sat.norad_id === selectedSatelliteId);
    const availableTransmitters = selectedSatellite?.transmitters || [];

    const [satelliteSearch, setSatelliteSearch] = useState('');
    const [satelliteOptions, setSatelliteOptions] = useState([]);
    const [passOptions, setPassOptions] = useState([]);
    const [expandedTasks, setExpandedTasks] = useState({});

    // Load SDRs on mount
    useEffect(() => {
        if (socket) {
            dispatch(fetchSDRs({ socket }));
        }
    }, [socket, dispatch]);

    // Populate form when editing
    useEffect(() => {
        if (selectedObservation) {
            setFormData(selectedObservation);
        } else {
            // Reset form for new observation
            setFormData({
                name: '',
                enabled: true,
                satellite: { norad_id: '', name: '' },
                pass: null,
                sdr: { id: '', name: '', sample_rate: 2000000 },
                transmitter: { id: '', frequency: 0, mode: '', bandwidth: 0 },
                tasks: [],
                rotator: { id: null, tracking_enabled: false },
                rig: { id: null, doppler_correction: false, vfo: 'VFO_A' },
            });
        }
    }, [selectedObservation]);

    // Clear satellite selection state when opening for new observation
    useEffect(() => {
        if (open && !selectedObservation) {
            dispatch(setSatelliteId(''));
            dispatch(setGroupId(''));
            dispatch(setGroupOfSats([]));
            dispatch(setSelectedFromSearch(false));
            dispatch(setSelectedPassId(null));
        }
    }, [open, selectedObservation, dispatch]);

    const handleClose = () => {
        dispatch(setDialogOpen(false));
    };

    const handleSave = () => {
        if (selectedObservation) {
            // Update existing observation
            dispatch(updateObservation({
                ...formData,
                id: selectedObservation.id,
                updated_at: new Date().toISOString(),
            }));
        } else {
            // Add new observation
            dispatch(addObservation({
                ...formData,
                id: `obs-${Date.now()}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'scheduled',
            }));
        }
        
        dispatch(setDialogOpen(false));
    };

    const handleAddTask = (taskType) => {
        let newTask;
        switch (taskType) {
            case 'decoder':
                const defaultDecoderType = 'none';
                newTask = {
                    type: 'decoder',
                    config: {
                        decoder_type: defaultDecoderType,
                        transmitter_id: '',
                        parameters: {}
                    },
                };
                break;
            case 'audio_recording':
                newTask = {
                    type: 'audio_recording',
                    config: {
                        transmitter_id: '',
                        demodulator: 'fm',
                    },
                };
                break;
            case 'iq_recording':
                newTask = {
                    type: 'iq_recording',
                    config: {},
                };
                break;
            default:
                return;
        }
        setFormData((prev) => {
            const newTasks = [...prev.tasks, newTask];
            // Add tasks collapsed by default
            setExpandedTasks((prevExpanded) => ({
                ...prevExpanded,
                [newTasks.length - 1]: false
            }));
            return {
                ...prev,
                tasks: newTasks,
            };
        });
    };

    const toggleTaskExpanded = (index) => {
        setExpandedTasks((prev) => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    const getTaskSummary = (task) => {
        if (task.type === 'decoder') {
            const transmitter = availableTransmitters.find(t => t.id === task.config.transmitter_id);
            const transmitterName = transmitter?.description || 'No transmitter';
            const freqMHz = transmitter?.downlink_low ? `${(transmitter.downlink_low / 1000000).toFixed(3)} MHz` : '';
            const decoderType = DECODER_TYPES.find(d => d.value === task.config.decoder_type)?.label || task.config.decoder_type;

            // If decoder type is 'none', show simpler summary
            if (task.config.decoder_type === 'none') {
                const parts = [transmitterName, freqMHz, 'No decoder'].filter(Boolean);
                return parts.join(' • ');
            }

            // Extract key parameters based on decoder type
            const params = task.config.parameters || {};
            const paramSummary = [];

            if (task.config.decoder_type === 'lora') {
                if (params.lora_sf) paramSummary.push(`SF${params.lora_sf}`);
                if (params.lora_bw) paramSummary.push(`BW${params.lora_bw / 1000}k`);
                if (params.lora_cr) paramSummary.push(`CR4/${params.lora_cr + 4}`);
            } else if (['fsk', 'gmsk', 'gfsk'].includes(task.config.decoder_type)) {
                const prefix = task.config.decoder_type;
                if (params[`${prefix}_baudrate`]) paramSummary.push(`${params[`${prefix}_baudrate`]} baud`);
                if (params[`${prefix}_framing`]) paramSummary.push(params[`${prefix}_framing`].toUpperCase());
            } else if (task.config.decoder_type === 'bpsk') {
                if (params.bpsk_baudrate) paramSummary.push(`${params.bpsk_baudrate} baud`);
                if (params.bpsk_differential) paramSummary.push('DBPSK');
                if (params.bpsk_framing) paramSummary.push(params.bpsk_framing.toUpperCase());
            } else if (task.config.decoder_type === 'afsk') {
                if (params.afsk_baudrate) paramSummary.push(`${params.afsk_baudrate} baud`);
                if (params.afsk_af_carrier) paramSummary.push(`${params.afsk_af_carrier}Hz carrier`);
            }

            const parts = [transmitterName, freqMHz, decoderType, ...paramSummary].filter(Boolean);
            return parts.join(' • ');
        } else if (task.type === 'audio_recording') {
            const transmitter = availableTransmitters.find(t => t.id === task.config.transmitter_id);
            const transmitterName = transmitter?.description || 'No transmitter';
            const freqMHz = transmitter?.downlink_low ? `${(transmitter.downlink_low / 1000000).toFixed(3)} MHz` : '';
            const demodType = DEMODULATOR_TYPES.find(d => d.value === task.config.demodulator)?.label || task.config.demodulator?.toUpperCase();
            
            const parts = [transmitterName, freqMHz, demodType, 'WAV'].filter(Boolean);
            return parts.join(' • ');
        } else if (task.type === 'iq_recording') {
            return 'SigMF recording (cf32_le)';
        }
        return '';
    };

    const handleRemoveTask = (index) => {
        setFormData((prev) => ({
            ...prev,
            tasks: prev.tasks.filter((_, i) => i !== index),
        }));
    };

    const handleTaskConfigChange = (index, field, value) => {
        setFormData((prev) => {
            const newTasks = [...prev.tasks];
            const currentTask = newTasks[index];

            // If changing decoder_type, reset parameters to defaults
            if (field === 'decoder_type' && currentTask.type === 'decoder') {
                newTasks[index] = {
                    ...currentTask,
                    config: {
                        ...currentTask.config,
                        decoder_type: value,
                        parameters: getDecoderDefaultParameters(value)
                    },
                };
            } else {
                newTasks[index] = {
                    ...currentTask,
                    config: {
                        ...currentTask.config,
                        [field]: value,
                    },
                };
            }
            return { ...prev, tasks: newTasks };
        });
    };

    const handleDecoderParameterChange = (taskIndex, paramKey, value) => {
        setFormData((prev) => {
            const newTasks = [...prev.tasks];
            newTasks[taskIndex] = {
                ...newTasks[taskIndex],
                config: {
                    ...newTasks[taskIndex].config,
                    parameters: {
                        ...newTasks[taskIndex].config.parameters,
                        [paramKey]: value,
                    },
                },
            };
            return { ...prev, tasks: newTasks };
        });
    };

    const renderDecoderParameter = (taskIndex, paramKey, paramDef, currentParams) => {
        // Check visibility condition
        if (paramDef.visibleWhen && !paramDef.visibleWhen(currentParams)) {
            return null;
        }

        const currentValue = currentParams[paramKey] ?? paramDef.default;

        if (paramDef.type === 'select') {
            // For null values, use a special string key that won't conflict with actual values
            const displayValue = currentValue === null ? '__auto__' : currentValue;
            
            return (
                <FormControl fullWidth size="small" key={paramKey}>
                    <InputLabel>{paramDef.label}</InputLabel>
                    <Select
                        value={displayValue}
                        onChange={(e) => {
                            const newValue = e.target.value === '__auto__' ? null : e.target.value;
                            handleDecoderParameterChange(taskIndex, paramKey, newValue);
                        }}
                        label={paramDef.label}
                    >
                        {paramDef.options.map((option) => (
                            <MenuItem
                                key={JSON.stringify(option.value)}
                                value={option.value === null ? '__auto__' : option.value}
                            >
                                {option.label}
                            </MenuItem>
                        ))}
                    </Select>
                    {paramDef.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                            {paramDef.description}
                        </Typography>
                    )}
                </FormControl>
            );
        } else if (paramDef.type === 'switch') {
            return (
                <FormControlLabel
                    key={paramKey}
                    control={
                        <Checkbox
                            checked={currentValue}
                            onChange={(e) => handleDecoderParameterChange(taskIndex, paramKey, e.target.checked)}
                        />
                    }
                    label={
                        <Box>
                            <Typography variant="body2">{paramDef.label}</Typography>
                            {paramDef.description && (
                                <Typography variant="caption" color="text.secondary">
                                    {paramDef.description}
                                </Typography>
                            )}
                        </Box>
                    }
                />
            );
        }

        return null;
    };

    // Calculate if all tasks fit within SDR bandwidth
    const validateTasksWithinBandwidth = () => {
        const sampleRate = formData.sdr.sample_rate;
        if (!sampleRate) return { valid: true, message: '', details: [] };

        // Collect all transmitter frequencies from tasks
        const frequencies = [];
        const details = [];

        formData.tasks.forEach((task, index) => {
            if (task.type === 'decoder' && task.config.transmitter_id) {
                const transmitter = availableTransmitters.find(t => t.id === task.config.transmitter_id);
                if (transmitter && transmitter.downlink_low) {
                    const bandwidth = transmitter.downlink_high && transmitter.downlink_low
                        ? transmitter.downlink_high - transmitter.downlink_low
                        : 0;

                    frequencies.push({
                        freq: transmitter.downlink_low,
                        bandwidth: bandwidth,
                        transmitter: transmitter
                    });

                    details.push({
                        taskIndex: index,
                        name: transmitter.description || 'Unknown',
                        freq: transmitter.downlink_low,
                        bandwidth: bandwidth
                    });
                }
            }
            // Audio and IQ recording don't add frequency constraints
        });

        if (frequencies.length === 0) {
            return { valid: true, message: '', details: [] };
        }

        // Find min and max frequencies including their bandwidths
        const minFreq = Math.min(...frequencies.map(f => f.freq - f.bandwidth / 2));
        const maxFreq = Math.max(...frequencies.map(f => f.freq + f.bandwidth / 2));
        const requiredBandwidth = maxFreq - minFreq;

        const valid = requiredBandwidth <= sampleRate;

        return {
            valid,
            message: valid
                ? ''
                : `Required bandwidth for the combination of transmitters you chose (${(requiredBandwidth / 1000000).toFixed(2)} MHz) exceeds the selected SDR sample rate (${(sampleRate / 1000000).toFixed(2)} MHz). Please increase sample rate or select transmitters closer in frequency.`,
            requiredBandwidth,
            sampleRate,
            details,
            minFreq,
            maxFreq
        };
    };

    const bandwidthValidation = validateTasksWithinBandwidth();

    const isFormValid = () => {
        return (
            formData.name.trim() !== '' &&
            formData.satellite.norad_id !== '' &&
            formData.sdr.id !== '' &&
            bandwidthValidation.valid
        );
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    minHeight: '70vh',
                    bgcolor: 'background.paper',
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    borderRadius: 2,
                },
            }}
        >
            <DialogTitle
                sx={{
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    py: 2.5,
                }}
            >
                {selectedObservation ? 'Edit Observation' : 'New Observation'}
            </DialogTitle>

            <DialogContent dividers sx={{ bgcolor: 'background.paper', px: 3, py: 3 }}>
                <Stack spacing={3}>
                    {/* Enabled Checkbox */}
                    <Box>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={formData.enabled}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            enabled: e.target.checked,
                                        }))
                                    }
                                />
                            }
                            label={
                                <Box>
                                    <Typography variant="body2">Enabled</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        When enabled, this observation will be executed at the scheduled time
                                    </Typography>
                                </Box>
                            }
                        />
                    </Box>

                    <Divider />

                    {/* Basic Info */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            Basic Information
                        </Typography>
                        <TextField
                            label="Observation Name"
                            fullWidth
                            value={formData.name}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, name: e.target.value }))
                            }
                            required
                        />
                    </Box>

                    <Divider />

                    {/* Satellite Selection */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            Satellite
                        </Typography>
                        <Typography variant="caption" color="text.secondary" paragraph>
                            Select a satellite using search or browse by group.
                        </Typography>
                        <SatelliteSelector
                            onSatelliteSelect={(satellite) => {
                                setFormData((prev) => ({
                                    ...prev,
                                    satellite: {
                                        norad_id: satellite.norad_id,
                                        name: satellite.name,
                                    },
                                }));
                            }}
                            onPassSelect={(pass) => {
                                if (pass) {
                                    setFormData((prev) => ({
                                        ...prev,
                                        pass: {
                                            event_start: pass.event_start,
                                            event_end: pass.event_end,
                                            peak_altitude: pass.peak_altitude,
                                            azimuth_at_start: pass.azimuth_at_start,
                                            azimuth_at_peak: pass.azimuth_at_peak,
                                            azimuth_at_end: pass.azimuth_at_end,
                                        },
                                    }));
                                } else {
                                    // No pass selected (continuous observation)
                                    setFormData((prev) => ({
                                        ...prev,
                                        pass: null,
                                    }));
                                }
                            }}
                        />
                    </Box>

                    <Divider />

                    {/* SDR */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            SDR Configuration
                        </Typography>
                        <Stack spacing={2}>
                            <FormControl fullWidth required>
                                <InputLabel>SDR</InputLabel>
                                <Select
                                    value={formData.sdr.id}
                                    onChange={(e) => {
                                        const selectedSdr = sdrs.find((s) => s.id === e.target.value);
                                        setFormData((prev) => ({
                                            ...prev,
                                            sdr: {
                                                ...prev.sdr,
                                                id: e.target.value,
                                                name: selectedSdr?.name || '',
                                            },
                                        }));
                                    }}
                                    label="SDR"
                                >
                                    {sdrs.map((sdr) => (
                                        <MenuItem key={sdr.id} value={sdr.id}>
                                            {sdr.name} ({sdr.type})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth required error={!bandwidthValidation.valid}>
                                <InputLabel>Sample Rate</InputLabel>
                                <Select
                                    value={formData.sdr.sample_rate}
                                    onChange={(e) => {
                                        setFormData((prev) => ({
                                            ...prev,
                                            sdr: {
                                                ...prev.sdr,
                                                sample_rate: e.target.value,
                                            },
                                        }));
                                    }}
                                    label="Sample Rate"
                                >
                                    {SAMPLE_RATES.map((rate) => (
                                        <MenuItem key={rate.value} value={rate.value}>
                                            {rate.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                                {!bandwidthValidation.valid && bandwidthValidation.details.length > 0 && (
                                    <Box sx={{ mt: 0.5 }}>
                                        <Typography variant="caption" color="error">
                                            {bandwidthValidation.message}
                                        </Typography>
                                        <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                                            ({(bandwidthValidation.maxFreq / 1000000).toFixed(3)} MHz - {(bandwidthValidation.minFreq / 1000000).toFixed(3)} MHz = {(bandwidthValidation.requiredBandwidth / 1000000).toFixed(2)} MHz)
                                        </Typography>
                                    </Box>
                                )}
                                {bandwidthValidation.valid && bandwidthValidation.requiredBandwidth > 0 && (
                                    <Typography variant="caption" color="success.main" sx={{ mt: 0.5 }}>
                                        ✓ All tasks fit within bandwidth (using {(bandwidthValidation.requiredBandwidth / 1000000).toFixed(2)} MHz of {(bandwidthValidation.sampleRate / 1000000).toFixed(2)} MHz)
                                    </Typography>
                                )}
                            </FormControl>
                        </Stack>
                    </Box>

                    <Divider />

                    {/* Tasks */}
                    <Box>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                            <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 'bold' }}>Tasks</Typography>
                            <Stack direction="row" spacing={1}>
                                <Button
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleAddTask('decoder')}
                                >
                                    Decoder
                                </Button>
                                <Button
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleAddTask('audio_recording')}
                                >
                                    Audio Recording
                                </Button>
                                <Button
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleAddTask('iq_recording')}
                                >
                                    IQ Recording
                                </Button>
                            </Stack>
                        </Box>

                        {formData.tasks.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">
                                No tasks added. Add decoders, audio recording, or IQ recording tasks.
                            </Typography>
                        ) : (
                            <Stack spacing={2}>
                                {formData.tasks.map((task, index) => (
                                    <Box
                                        key={index}
                                        sx={{
                                            p: 2,
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            borderRadius: 1,
                                            bgcolor: 'background.paper',
                                        }}
                                    >
                                        <Box
                                            display="flex"
                                            justifyContent="space-between"
                                            alignItems="center"
                                            mb={expandedTasks[index] ? 2 : 0}
                                        >
                                            <Box
                                                display="flex"
                                                alignItems="center"
                                                gap={1}
                                                sx={{ cursor: 'pointer', flex: 1 }}
                                                onClick={() => toggleTaskExpanded(index)}
                                            >
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        transform: expandedTasks[index] ? 'rotate(180deg)' : 'rotate(0deg)',
                                                        transition: 'transform 0.2s'
                                                    }}
                                                >
                                                    <ExpandMoreIcon fontSize="small" />
                                                </IconButton>
                                                <Chip
                                                    label={task.type === 'decoder' ? 'Decoder' : task.type === 'audio_recording' ? 'Audio Recording' : 'IQ Recording'}
                                                    size="small"
                                                    color={task.type === 'decoder' ? 'primary' : task.type === 'audio_recording' ? 'secondary' : 'default'}
                                                    variant="filled"
                                                />
                                                {!expandedTasks[index] && (
                                                    <Typography
                                                        variant="caption"
                                                        color="text.secondary"
                                                        sx={{ ml: 1 }}
                                                    >
                                                        {getTaskSummary(task)}
                                                    </Typography>
                                                )}
                                            </Box>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleRemoveTask(index)}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Box>

                                        {expandedTasks[index] && (
                                            <Stack spacing={2}>
                                            {task.type === 'decoder' && (() => {
                                                const decoderType = task.config.decoder_type;
                                                const decoderParams = getDecoderParameters(decoderType);
                                                const currentParams = task.config.parameters || {};

                                                return (
                                                    <>
                                                        <FormControl fullWidth size="small">
                                                            <InputLabel>Transmitter</InputLabel>
                                                            <Select
                                                                value={task.config.transmitter_id || ''}
                                                                onChange={(e) =>
                                                                    handleTaskConfigChange(
                                                                        index,
                                                                        'transmitter_id',
                                                                        e.target.value
                                                                    )
                                                                }
                                                                label="Transmitter"
                                                                disabled={availableTransmitters.length === 0}
                                                            >
                                                                {availableTransmitters.length === 0 ? (
                                                                    <MenuItem disabled value="">
                                                                        No transmitters available
                                                                    </MenuItem>
                                                                ) : (
                                                                    availableTransmitters.map((transmitter) => {
                                                                        const freqMHz = transmitter.downlink_low
                                                                            ? (transmitter.downlink_low / 1000000).toFixed(3)
                                                                            : 'N/A';
                                                                        return (
                                                                            <MenuItem key={transmitter.id} value={transmitter.id}>
                                                                                {transmitter.description || 'Unknown'} - {freqMHz} MHz ({transmitter.mode || 'N/A'})
                                                                            </MenuItem>
                                                                        );
                                                                    })
                                                                )}
                                                            </Select>
                                                        </FormControl>

                                                        <FormControl fullWidth size="small">
                                                            <InputLabel>Decoder Type</InputLabel>
                                                            <Select
                                                                value={decoderType}
                                                                onChange={(e) =>
                                                                    handleTaskConfigChange(
                                                                        index,
                                                                        'decoder_type',
                                                                        e.target.value
                                                                    )
                                                                }
                                                                label="Decoder Type"
                                                            >
                                                                {DECODER_TYPES.map((type) => (
                                                                    <MenuItem key={type.value} value={type.value}>
                                                                        {type.label}
                                                                    </MenuItem>
                                                                ))}
                                                            </Select>
                                                        </FormControl>

                                                        {Object.keys(decoderParams).length > 0 && (
                                                            <>
                                                                <Divider sx={{ my: 1 }}>
                                                                    <Chip label="Decoder Parameters" size="small" />
                                                                </Divider>
                                                                {Object.entries(decoderParams).map(([paramKey, paramDef]) =>
                                                                    renderDecoderParameter(index, paramKey, paramDef, currentParams)
                                                                )}
                                                            </>
                                                        )}
                                                    </>
                                                );
                                            })()}

                                            {task.type === 'audio_recording' && (
                                                <>
                                                    <FormControl fullWidth size="small">
                                                        <InputLabel>Transmitter</InputLabel>
                                                        <Select
                                                            value={task.config.transmitter_id || ''}
                                                            onChange={(e) =>
                                                                handleTaskConfigChange(
                                                                    index,
                                                                    'transmitter_id',
                                                                    e.target.value
                                                                )
                                                            }
                                                            label="Transmitter"
                                                            disabled={availableTransmitters.length === 0}
                                                        >
                                                            {availableTransmitters.length === 0 ? (
                                                                <MenuItem disabled value="">
                                                                    No transmitters available
                                                                </MenuItem>
                                                            ) : (
                                                                availableTransmitters.map((transmitter) => {
                                                                    const freqMHz = transmitter.downlink_low
                                                                        ? (transmitter.downlink_low / 1000000).toFixed(3)
                                                                        : 'N/A';
                                                                    return (
                                                                        <MenuItem key={transmitter.id} value={transmitter.id}>
                                                                            {transmitter.description || 'Unknown'} - {freqMHz} MHz ({transmitter.mode || 'N/A'})
                                                                        </MenuItem>
                                                                    );
                                                                })
                                                            )}
                                                        </Select>
                                                    </FormControl>

                                                    <FormControl fullWidth size="small">
                                                        <InputLabel>Demodulator</InputLabel>
                                                        <Select
                                                            value={task.config.demodulator || 'fm'}
                                                            onChange={(e) =>
                                                                handleTaskConfigChange(
                                                                    index,
                                                                    'demodulator',
                                                                    e.target.value
                                                                )
                                                            }
                                                            label="Demodulator"
                                                        >
                                                            {DEMODULATOR_TYPES.map((type) => (
                                                                <MenuItem key={type.value} value={type.value}>
                                                                    {type.label}
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>

                                                    <Typography variant="caption" color="text.secondary">
                                                        Audio will be recorded in WAV format (16-bit PCM, mono, 48kHz) after demodulation.
                                                    </Typography>
                                                </>
                                            )}

                                            {task.type === 'iq_recording' && (
                                                <Typography variant="caption" color="text.secondary">
                                                    IQ data will be recorded in SigMF format (cf32_le). The recording uses the SDR sample rate configured above.
                                                </Typography>
                                            )}
                                            </Stack>
                                        )}
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </Box>

                    <Divider />

                    {/* Rotator Selection */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            Rotator (Optional)
                        </Typography>
                        <Stack spacing={2}>
                            <FormControl fullWidth>
                                <InputLabel>Rotator</InputLabel>
                                <Select
                                    value={formData.rotator.id || '__none__'}
                                    onChange={(e) => {
                                        const value = e.target.value === '__none__' ? null : e.target.value;
                                        setFormData((prev) => ({
                                            ...prev,
                                            rotator: {
                                                id: value,
                                                tracking_enabled: value ? true : false,
                                            },
                                            rig: {
                                                ...prev.rig,
                                                doppler_correction: value ? true : false,
                                            },
                                        }));
                                    }}
                                    label="Rotator"
                                >
                                    <MenuItem value="__none__">
                                        <em>None</em>
                                    </MenuItem>
                                    {rotators.map((rotator) => (
                                        <MenuItem key={rotator.id} value={rotator.id}>
                                            {rotator.name}{rotator.type ? ` (${rotator.type})` : ''}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>
                    </Box>
                </Stack>
            </DialogContent>

            <DialogActions
                sx={{
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                    borderTop: (theme) => `1px solid ${theme.palette.divider}`,
                    px: 3,
                    py: 2.5,
                    gap: 2,
                }}
            >
                <Button
                    onClick={handleClose}
                    variant="outlined"
                    sx={{
                        borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.400',
                        '&:hover': {
                            borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.600' : 'grey.500',
                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
                        },
                    }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    disabled={!isFormValid()}
                    sx={{
                        '&.Mui-disabled': {
                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.400',
                            color: (theme) => theme.palette.mode === 'dark' ? 'grey.600' : 'grey.600',
                        },
                    }}
                >
                    {selectedObservation ? 'Update' : 'Create'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ObservationFormDialog;
