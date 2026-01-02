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
    Typography,
    Box,
    Stack,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Checkbox,
    FormControlLabel,
    Chip,
    Divider,
    IconButton,
    ListSubheader,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { 
    setMonitoredSatelliteDialogOpen,
    addMonitoredSatellite,
    updateMonitoredSatellite,
    setSatelliteId,
    setGroupId,
    setGroupOfSats,
    setSelectedFromSearch,
} from './scheduler-slice.jsx';
import { useSocket } from '../common/socket.jsx';
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

const MODULATION_TYPES = [
    { value: 'fm', label: 'FM (Frequency Modulation)' },
    { value: 'am', label: 'AM (Amplitude Modulation)' },
    { value: 'ssb', label: 'SSB (Single Sideband)' },
    { value: 'cw', label: 'CW (Continuous Wave)' },
    { value: 'fsk', label: 'FSK (Frequency Shift Keying)' },
    { value: 'psk', label: 'PSK (Phase Shift Keying)' },
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

// Helper function to determine band from frequency in Hz
const getBand = (frequencyHz) => {
    const freqMHz = frequencyHz / 1000000;
    if (freqMHz >= 30 && freqMHz < 300) return 'VHF';
    if (freqMHz >= 300 && freqMHz < 1000) return 'UHF';
    if (freqMHz >= 1000 && freqMHz < 2000) return 'L-Band';
    if (freqMHz >= 2000 && freqMHz < 4000) return 'S-Band';
    if (freqMHz >= 4000 && freqMHz < 8000) return 'C-Band';
    if (freqMHz >= 8000 && freqMHz < 12000) return 'X-Band';
    if (freqMHz < 30) return 'HF';
    return 'Other';
};

// Helper function to group transmitters by band
const groupTransmittersByBand = (transmitters) => {
    const bandOrder = ['HF', 'VHF', 'UHF', 'L-Band', 'S-Band', 'C-Band', 'X-Band', 'Other'];
    const grouped = {};

    transmitters.forEach(transmitter => {
        const band = getBand(transmitter.downlink_low || 0);
        if (!grouped[band]) {
            grouped[band] = [];
        }
        grouped[band].push(transmitter);
    });

    // Sort transmitters within each band by frequency
    Object.keys(grouped).forEach(band => {
        grouped[band].sort((a, b) => (a.downlink_low || 0) - (b.downlink_low || 0));
    });

    // Return bands in order
    return bandOrder
        .filter(band => grouped[band])
        .map(band => ({ band, transmitters: grouped[band] }));
};

export default function MonitoredSatelliteDialog() {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const open = useSelector((state) => state.scheduler?.monitoredSatelliteDialogOpen || false);
    const selectedMonitoredSatellite = useSelector((state) => state.scheduler?.selectedMonitoredSatellite);
    const sdrs = useSelector((state) => state.sdrs?.sdrs || []);
    const selectedSatelliteId = useSelector((state) => state.scheduler?.satelliteSelection?.satelliteId);
    const selectedGroupId = useSelector((state) => state.scheduler?.satelliteSelection?.groupId);
    const groupOfSats = useSelector((state) => state.scheduler?.satelliteSelection?.groupOfSats || []);
    const rotators = useSelector((state) => state.rotators?.rotators || []);
    const satGroups = useSelector((state) => state.scheduler?.satelliteSelection?.satGroups || []);

    const [formData, setFormData] = useState({
        enabled: true,
        satellite: { norad_id: '', name: '', group_id: '' },
        sdr: { id: '', name: '', sample_rate: 2000000 },
        tasks: [],
        rotator: { id: null, tracking_enabled: false },
        rig: { id: null, doppler_correction: false, vfo: 'VFO_A' },
        min_elevation: 20,
        lookahead_hours: 24,
    });

    const [expandedTasks, setExpandedTasks] = useState({});

    const selectedSatellite = groupOfSats.find(sat => sat.norad_id === selectedSatelliteId);
    const availableTransmitters = selectedSatellite?.transmitters || [];

    // Sync selectedGroupId from Redux into formData.satellite.group_id
    useEffect(() => {
        if (selectedGroupId && formData.satellite.norad_id) {
            console.log('*** MonitoredSatelliteDialog: useEffect syncing group_id:', selectedGroupId);
            setFormData((prev) => ({
                ...prev,
                satellite: {
                    ...prev.satellite,
                    group_id: selectedGroupId,
                },
            }));
        }
    }, [selectedGroupId, formData.satellite.norad_id]);

    useEffect(() => {
        if (selectedMonitoredSatellite) {
            setFormData(selectedMonitoredSatellite);
        } else {
            setFormData({
                enabled: true,
                satellite: { norad_id: '', name: '', group_id: '' },
                sdr: { id: '', name: '', sample_rate: 2000000 },
                tasks: [],
                rotator: { id: null, tracking_enabled: false },
                rig: { id: null, doppler_correction: false, vfo: 'VFO_A' },
                min_elevation: 20,
                lookahead_hours: 24,
            });
        }
    }, [selectedMonitoredSatellite, open]);

    // Clear satellite selection state when opening dialog
    useEffect(() => {
        if (open) {
            // Always clear satellite selection state to allow fresh initialization
            // The SatelliteSelector will reinitialize from initialSatellite prop
            dispatch(setSatelliteId(''));
            dispatch(setGroupId(''));
            dispatch(setGroupOfSats([]));
            dispatch(setSelectedFromSearch(false));
        }
    }, [open, dispatch]);

    const handleClose = () => {
        dispatch(setMonitoredSatelliteDialogOpen(false));
    };

    const handleSatelliteSelect = (satellite) => {
        console.log('*** MonitoredSatelliteDialog: handleSatelliteSelect - selectedGroupId:', selectedGroupId);
        setFormData((prev) => ({
            ...prev,
            satellite: {
                norad_id: satellite.norad_id,
                name: satellite.name,
                group_id: selectedGroupId || '',
            },
        }));
    };

    const handleAddTask = (taskType) => {
        let newTask;
        switch (taskType) {
            case 'decoder': {
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
            }
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
            case 'transcription':
                newTask = {
                    type: 'transcription',
                    config: {
                        transmitter_id: '',
                        modulation: 'fm',
                    },
                };
                break;
            default:
                return;
        }
        setFormData((prev) => {
            const newTasks = [...prev.tasks, newTask];
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

    const toggleTaskExpanded = (index) => {
        setExpandedTasks((prev) => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    const renderDecoderParameter = (taskIndex, paramKey, paramDef, currentParams) => {
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
                    label={<Typography variant="body2">{paramDef.label}</Typography>}
                />
            );
        }

        return null;
    };

    const getTaskSummary = (task) => {
        if (task.type === 'decoder') {
            const transmitter = availableTransmitters.find(t => t.id === task.config.transmitter_id);
            const transmitterName = transmitter?.description || 'No transmitter';
            const freqMHz = transmitter?.downlink_low ? `${(transmitter.downlink_low / 1000000).toFixed(3)} MHz` : '';
            const decoderType = DECODER_TYPES.find(d => d.value === task.config.decoder_type)?.label || task.config.decoder_type;

            if (task.config.decoder_type === 'none') {
                const parts = [transmitterName, freqMHz, 'No decoder'].filter(Boolean);
                return parts.join(' • ');
            }

            const parts = [transmitterName, freqMHz, decoderType].filter(Boolean);
            return parts.join(' • ');
        } else if (task.type === 'audio_recording') {
            const transmitter = availableTransmitters.find(t => t.id === task.config.transmitter_id);
            const transmitterName = transmitter?.description || 'No transmitter';
            const freqMHz = transmitter?.downlink_low ? `${(transmitter.downlink_low / 1000000).toFixed(3)} MHz` : '';
            const demodType = DEMODULATOR_TYPES.find(d => d.value === task.config.demodulator)?.label || task.config.demodulator?.toUpperCase();

            const parts = [transmitterName, freqMHz, demodType, 'WAV'].filter(Boolean);
            return parts.join(' • ');
        } else if (task.type === 'transcription') {
            const transmitter = availableTransmitters.find(t => t.id === task.config.transmitter_id);
            const transmitterName = transmitter?.description || 'No transmitter';
            const freqMHz = transmitter?.downlink_low ? `${(transmitter.downlink_low / 1000000).toFixed(3)} MHz` : '';
            const modType = MODULATION_TYPES.find(d => d.value === task.config.modulation)?.label || task.config.modulation?.toUpperCase();

            const parts = [transmitterName, freqMHz, modType, 'Transcription'].filter(Boolean);
            return parts.join(' • ');
        } else if (task.type === 'iq_recording') {
            return 'SigMF recording (cf32_le)';
        }
        return '';
    };

    const isFormValid = () => {
        return (
            formData.satellite.norad_id !== '' &&
            formData.sdr.id !== '' &&
            formData.min_elevation >= 0 &&
            formData.lookahead_hours > 0
        );
    };

    const handleSubmit = () => {
        if (!isFormValid()) return;
        
        if (selectedMonitoredSatellite) {
            // Update existing monitored satellite
            dispatch(updateMonitoredSatellite({
                ...formData,
                id: selectedMonitoredSatellite.id,
            }));
        } else {
            // Add new monitored satellite
            dispatch(addMonitoredSatellite({
                ...formData,
                id: `monitored-${Date.now()}`,
            }));
        }
        
        dispatch(setMonitoredSatelliteDialogOpen(false));
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
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
                {selectedMonitoredSatellite ? 'Edit Monitored Satellite' : 'Add Monitored Satellite'}
            </DialogTitle>

            <DialogContent dividers sx={{ bgcolor: 'background.paper', px: 3, py: 3 }}>
                <Stack spacing={3} sx={{ mt: 2 }}>
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
                                        When enabled, this satellite will automatically generate observations for matching passes
                                    </Typography>
                                </Box>
                            }
                        />
                    </Box>

                    <Divider />

                    {/* Satellite Selection */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            Satellite
                        </Typography>
                        <SatelliteSelector 
                            onSatelliteSelect={handleSatelliteSelect} 
                            showPassSelector={false}
                            initialSatellite={selectedMonitoredSatellite?.satellite}
                        />
                    </Box>

                    <Divider />

                    {/* Monitoring Criteria */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            Monitoring Criteria
                        </Typography>
                        <Stack spacing={2}>
                            <Box>
                                <TextField
                                    label="Minimum Elevation (degrees)"
                                    type="number"
                                    fullWidth
                                    value={formData.min_elevation}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            min_elevation: parseInt(e.target.value) || 0,
                                        }))
                                    }
                                    required
                                />
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                    Only passes with peak elevation above this threshold will be scheduled
                                </Typography>
                            </Box>
                            <Box>
                                <TextField
                                    label="Lookahead Window (hours)"
                                    type="number"
                                    fullWidth
                                    value={formData.lookahead_hours}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            lookahead_hours: parseInt(e.target.value) || 0,
                                        }))
                                    }
                                    required
                                />
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                    How far ahead to automatically generate observations
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>

                    <Divider />

                    {/* SDR Configuration */}
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

                            <FormControl fullWidth required>
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
                            </FormControl>
                        </Stack>
                    </Box>

                    <Divider />

                    {/* Tasks */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            Tasks
                        </Typography>
                        {formData.tasks.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                No tasks added yet. Add decoders, audio recording, transcription, or IQ recording.
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
                                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                                            transition: 'background-color 0.2s',
                                            cursor: !expandedTasks[index] ? 'pointer' : 'default',
                                            ...(!expandedTasks[index] && {
                                                '&:hover': {
                                                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                                                },
                                            }),
                                        }}
                                        onClick={(e) => {
                                            if (!expandedTasks[index] && !e.target.closest('button')) {
                                                toggleTaskExpanded(index);
                                            }
                                        }}
                                    >
                                        <Box>
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
                                                    sx={{ flex: 1 }}
                                                    onClick={() => expandedTasks[index] && toggleTaskExpanded(index)}
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
                                                        label={
                                                            task.type === 'decoder' ? 'Decoder' :
                                                            task.type === 'audio_recording' ? 'Audio Recording' :
                                                            task.type === 'transcription' ? 'Transcription' :
                                                            'IQ Recording'
                                                        }
                                                        size="small"
                                                        color={
                                                            task.type === 'decoder' ? 'primary' :
                                                            task.type === 'audio_recording' ? 'secondary' :
                                                            task.type === 'transcription' ? 'info' :
                                                            'default'
                                                        }
                                                        variant="filled"
                                                    />
                                                    {!expandedTasks[index] && (
                                                        <Typography
                                                            variant="body2"
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
                                                                            groupTransmittersByBand(availableTransmitters).map(({ band, transmitters }) => [
                                                                                <ListSubheader key={`header-${band}`}>{band}</ListSubheader>,
                                                                                ...transmitters.map((transmitter) => {
                                                                                    const freqMHz = transmitter.downlink_low
                                                                                        ? (transmitter.downlink_low / 1000000).toFixed(3)
                                                                                        : 'N/A';
                                                                                    return (
                                                                                        <MenuItem key={transmitter.id} value={transmitter.id}>
                                                                                            <Box>
                                                                                                <Typography variant="body2">
                                                                                                    {transmitter.description || 'Unknown'} - {freqMHz} MHz
                                                                                                </Typography>
                                                                                                <Typography variant="caption" color="text.secondary">
                                                                                                    {[
                                                                                                        transmitter.mode ? `Mode: ${transmitter.mode}` : null,
                                                                                                        transmitter.baud ? `Baud: ${transmitter.baud}` : null,
                                                                                                        transmitter.baudrate ? `Baudrate: ${transmitter.baudrate}` : null,
                                                                                                        transmitter.drift != null ? `Drift: ${transmitter.drift} Hz` : null,
                                                                                                    ].filter(Boolean).join(' • ') || 'No additional details'}
                                                                                                </Typography>
                                                                                            </Box>
                                                                                        </MenuItem>
                                                                                    );
                                                                                })
                                                                            ])
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
                                                                        groupTransmittersByBand(availableTransmitters).map(({ band, transmitters }) => [
                                                                            <ListSubheader key={`header-${band}`}>{band}</ListSubheader>,
                                                                            ...transmitters.map((transmitter) => {
                                                                                const freqMHz = transmitter.downlink_low
                                                                                    ? (transmitter.downlink_low / 1000000).toFixed(3)
                                                                                    : 'N/A';
                                                                                return (
                                                                                    <MenuItem key={transmitter.id} value={transmitter.id}>
                                                                                        <Box>
                                                                                            <Typography variant="body2">
                                                                                                {transmitter.description || 'Unknown'} - {freqMHz} MHz
                                                                                            </Typography>
                                                                                            <Typography variant="caption" color="text.secondary">
                                                                                                {[
                                                                                                    transmitter.mode ? `Mode: ${transmitter.mode}` : null,
                                                                                                    transmitter.baud ? `Baud: ${transmitter.baud}` : null,
                                                                                                    transmitter.drift != null ? `Drift: ${transmitter.drift} Hz` : null,
                                                                                                ].filter(Boolean).join(' • ') || 'No additional details'}
                                                                                            </Typography>
                                                                                        </Box>
                                                                                    </MenuItem>
                                                                                );
                                                                            })
                                                                        ])
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

                                                    {task.type === 'transcription' && (
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
                                                                        groupTransmittersByBand(availableTransmitters).map(({ band, transmitters }) => [
                                                                            <ListSubheader key={`header-${band}`}>{band}</ListSubheader>,
                                                                            ...transmitters.map((transmitter) => {
                                                                                const freqMHz = transmitter.downlink_low
                                                                                    ? (transmitter.downlink_low / 1000000).toFixed(3)
                                                                                    : 'N/A';
                                                                                return (
                                                                                    <MenuItem key={transmitter.id} value={transmitter.id}>
                                                                                        <Box>
                                                                                            <Typography variant="body2">
                                                                                                {transmitter.description || 'Unknown'} - {freqMHz} MHz
                                                                                            </Typography>
                                                                                            <Typography variant="caption" color="text.secondary">
                                                                                                {[
                                                                                                    transmitter.mode ? `Mode: ${transmitter.mode}` : null,
                                                                                                    transmitter.baud ? `Baud: ${transmitter.baud}` : null,
                                                                                                    transmitter.drift != null ? `Drift: ${transmitter.drift} Hz` : null,
                                                                                                ].filter(Boolean).join(' • ') || 'No additional details'}
                                                                                            </Typography>
                                                                                        </Box>
                                                                                    </MenuItem>
                                                                                );
                                                                            })
                                                                        ])
                                                                    )}
                                                                </Select>
                                                            </FormControl>

                                                            <FormControl fullWidth size="small">
                                                                <InputLabel>Modulation</InputLabel>
                                                                <Select
                                                                    value={task.config.modulation || 'fm'}
                                                                    onChange={(e) =>
                                                                        handleTaskConfigChange(
                                                                            index,
                                                                            'modulation',
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    label="Modulation"
                                                                >
                                                                    {MODULATION_TYPES.map((type) => (
                                                                        <MenuItem key={type.value} value={type.value}>
                                                                            {type.label}
                                                                        </MenuItem>
                                                                    ))}
                                                                </Select>
                                                            </FormControl>

                                                            <Typography variant="caption" color="text.secondary">
                                                                Audio transcription will be performed using the selected modulation type.
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
                                    </Box>
                                ))}
                            </Stack>
                        )}

                        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
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
                                onClick={() => handleAddTask('transcription')}
                            >
                                Transcription
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

                    <Divider />

                    {/* Rotator Selection */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            Rotator
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
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={!isFormValid()}
                    sx={{
                        '&.Mui-disabled': {
                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.400',
                            color: (theme) => theme.palette.mode === 'dark' ? 'grey.600' : 'grey.600',
                        },
                    }}
                >
                    {selectedMonitoredSatellite ? 'Update' : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
