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
    ListSubheader,
    CircularProgress,
    Backdrop,
    Menu,
    List,
    ListItemButton,
    ListItemText,
} from '@mui/material';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    ExpandMore as ExpandMoreIcon,
    Stop as StopIcon,
    CheckCircle as EnableIcon,
    Cancel as DisableIcon,
} from '@mui/icons-material';
import { useSocket } from '../common/socket.jsx';
import {
    addObservation,
    updateObservation,
    createScheduledObservation,
    updateScheduledObservation,
    setDialogOpen,
    setSatelliteId,
    setGroupId,
    setGroupOfSats,
    setSelectedFromSearch,
    setSelectedPassId,
    fetchSDRParameters,
    deleteScheduledObservations,
    toggleObservationEnabled,
    cancelRunningObservation,
} from './scheduler-slice.jsx';
import { fetchSDRs } from '../hardware/sdr-slice.jsx';
import { fetchSatellite } from '../satellites/satellite-slice.jsx';
import { SatelliteSelector } from './satellite-selector.jsx';
import { getDecoderParameters, getDecoderDefaultParameters } from '../waterfall/decoder-parameters.js';
import { DecoderConfigSuggestion } from './decoder-config-suggestion.jsx';

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

const ObservationFormDialog = () => {
    const dispatch = useDispatch();
    const { socket } = useSocket();

    const open = useSelector((state) => state.scheduler?.dialogOpen || false);
    const selectedObservation = useSelector((state) => state.scheduler?.selectedObservation);
    const sdrs = useSelector((state) => state.sdrs?.sdrs || []);
    const selectedSatelliteId = useSelector((state) => state.scheduler?.satelliteSelection?.satelliteId);
    const selectedGroupId = useSelector((state) => state.scheduler?.satelliteSelection?.groupId);
    const groupOfSats = useSelector((state) => state.scheduler?.satelliteSelection?.groupOfSats || []);
    const rotators = useSelector((state) => state.rotators?.rotators || []);
    const passes = useSelector((state) => state.scheduler?.satelliteSelection?.passes || []);
    const observations = useSelector((state) => state.scheduler?.observations || []);
    const sdrParameters = useSelector((state) => state.scheduler?.sdrParameters || {});
    const sdrParametersLoading = useSelector((state) => state.scheduler?.sdrParametersLoading || false);
    const sdrParametersError = useSelector((state) => state.scheduler?.sdrParametersError || {});
    const isSaving = useSelector((state) => state.scheduler?.isSavingObservation || false);

    const [formData, setFormData] = useState({
        name: '',
        enabled: true,
        satellite: { norad_id: '', name: '', group_id: '' },
        pass: null,
        sdr: { id: '', name: '', sample_rate: 2000000, gain: '', antenna_port: '', center_frequency: 0, auto_center_frequency: true },
        transmitter: { id: '', frequency: 0, mode: '', bandwidth: 0 },
        tasks: [],
        rotator: { id: null, tracking_enabled: false },
        rig: { id: null, doppler_correction: false, vfo: 'VFO_A' },
    });

    // Get transmitters from selected satellite
    const selectedSatellite = groupOfSats.find(sat => sat.norad_id === selectedSatelliteId);
    const availableTransmitters = selectedSatellite?.transmitters || [];

    // Check if we're waiting for transmitters to load
    const isLoadingTransmitters = selectedObservation && selectedSatelliteId && availableTransmitters.length === 0;

    // Debug logging for transmitter loading state
    React.useEffect(() => {
        if (selectedObservation) {
            console.log('[ObservationFormDialog] Loading state:', {
                isLoadingTransmitters,
                hasSelectedObservation: !!selectedObservation,
                selectedSatelliteId,
                groupOfSatsLength: groupOfSats.length,
                selectedSatellite: selectedSatellite ? { norad_id: selectedSatellite.norad_id, name: selectedSatellite.name, transmittersCount: selectedSatellite.transmitters?.length || 0 } : null,
                availableTransmittersLength: availableTransmitters.length,
            });
        }
    }, [isLoadingTransmitters, selectedObservation, selectedSatelliteId, groupOfSats.length, availableTransmitters.length, selectedSatellite]);

    const [satelliteSearch, setSatelliteSearch] = useState('');
    const [satelliteOptions, setSatelliteOptions] = useState([]);
    const [passOptions, setPassOptions] = useState([]);
    const [expandedTasks, setExpandedTasks] = useState({});
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [openCancelConfirm, setOpenCancelConfirm] = useState(false);
    const [transmitterMenuAnchor, setTransmitterMenuAnchor] = useState(null);

    // Determine if form should be disabled based on observation status
    const isFormDisabled = selectedObservation && 
        ['running', 'completed', 'failed', 'cancelled'].includes(selectedObservation.status?.toLowerCase());

    // Sync selectedGroupId from Redux into formData.satellite.group_id
    useEffect(() => {
        if (selectedGroupId) {
            setFormData((prev) => ({
                ...prev,
                satellite: {
                    ...prev.satellite,
                    group_id: selectedGroupId,
                },
            }));
        }
    }, [selectedGroupId]);

    // Load SDRs on mount
    useEffect(() => {
        if (socket) {
            dispatch(fetchSDRs({ socket }));
        }
    }, [socket, dispatch]);

    // Fetch SDR parameters when SDR is selected
    useEffect(() => {
        if (socket && formData.sdr.id) {
            dispatch(fetchSDRParameters({ socket, sdrId: formData.sdr.id }));
        }
    }, [socket, formData.sdr.id, dispatch]);

    // Calculate center frequency when tasks or sample rate changes (only if auto mode enabled)
    useEffect(() => {
        // Only auto-calculate if auto mode is enabled
        if (!formData.sdr.auto_center_frequency) return;

        const sampleRate = formData.sdr.sample_rate;
        if (!sampleRate) return;

        // Collect all transmitter frequencies from tasks
        const frequencies = [];
        formData.tasks.forEach((task) => {
            if (task.config.transmitter_id) {
                const transmitter = availableTransmitters.find(t => t.id === task.config.transmitter_id);
                if (transmitter && transmitter.downlink_low) {
                    frequencies.push(transmitter.downlink_low);
                }
            }
        });

        if (frequencies.length === 0) {
            setFormData((prev) => {
                if (prev.sdr.center_frequency !== 0) {
                    return {
                        ...prev,
                        sdr: {
                            ...prev.sdr,
                            center_frequency: 0,
                        },
                    };
                }
                return prev;
            });
            return;
        }

        // Calculate center frequency avoiding DC spike
        const minFreq = Math.min(...frequencies);
        const maxFreq = Math.max(...frequencies);
        const naiveCenter = (minFreq + maxFreq) / 2;

        // Offset by 1/4 of sample rate to avoid DC spike at center
        const dcOffset = sampleRate / 4;
        const centerFreq = Math.round(naiveCenter + dcOffset);

        setFormData((prev) => {
            if (prev.sdr.center_frequency !== centerFreq) {
                return {
                    ...prev,
                    sdr: {
                        ...prev.sdr,
                        center_frequency: centerFreq,
                    },
                };
            }
            return prev;
        });
    }, [formData.tasks, formData.sdr.sample_rate, formData.sdr.auto_center_frequency, availableTransmitters]);

    // Populate form when editing
    useEffect(() => {
        if (selectedObservation) {
            // Ensure auto_center_frequency exists for backward compatibility
            setFormData({
                ...selectedObservation,
                sdr: {
                    ...selectedObservation.sdr,
                    auto_center_frequency: selectedObservation.sdr?.auto_center_frequency ?? true,
                },
            });
        } else {
            // Reset form for new observation
            setFormData({
                name: '',
                enabled: true,
                satellite: { norad_id: '', name: '', group_id: '' },
                pass: null,
                sdr: { id: '', name: '', sample_rate: 2000000, gain: '', antenna_port: '', center_frequency: 0, auto_center_frequency: true },
                transmitter: { id: '', frequency: 0, mode: '', bandwidth: 0 },
                tasks: [],
                rotator: { id: null, tracking_enabled: false },
                rig: { id: null, doppler_correction: false, vfo: 'VFO_A' },
            });
            setExpandedTasks({});
        }
    }, [selectedObservation, open]);

    // Clear satellite selection state when opening dialog
    useEffect(() => {
        if (open) {
            console.log('[ObservationFormDialog] Dialog opened, clearing satellite selection state', {
                hasSelectedObservation: !!selectedObservation,
                observationId: selectedObservation?.id,
                satelliteName: selectedObservation?.satellite?.name,
                satelliteNoradId: selectedObservation?.satellite?.norad_id,
            });
            // Always clear satellite selection state to allow fresh initialization
            // The SatelliteSelector will reinitialize from initialSatellite prop
            dispatch(setSatelliteId(''));
            dispatch(setGroupId(''));
            dispatch(setGroupOfSats([]));
            dispatch(setSelectedFromSearch(false));
            dispatch(setSelectedPassId(null));
        }
    }, [open, dispatch]);

    const handleClose = () => {
        dispatch(setDialogOpen(false));
    };

    const handleDeleteClick = () => {
        setOpenDeleteConfirm(true);
    };

    const handleDeleteConfirm = () => {
        if (selectedObservation?.id && socket) {
            dispatch(deleteScheduledObservations({ socket, ids: [selectedObservation.id] }));
            setOpenDeleteConfirm(false);
            dispatch(setDialogOpen(false));
        }
    };

    const handleCancelClick = () => {
        setOpenCancelConfirm(true);
    };

    const handleCancelConfirm = () => {
        if (selectedObservation?.id && socket) {
            dispatch(cancelRunningObservation({ socket, id: selectedObservation.id }));
            // Update local formData to reflect the change immediately
            setFormData((prev) => ({
                ...prev,
                status: 'cancelled',
            }));
            setOpenCancelConfirm(false);
        }
    };

    const handleEnable = () => {
        if (selectedObservation?.id && socket) {
            dispatch(toggleObservationEnabled({ socket, id: selectedObservation.id, enabled: true }));
            // Update local formData to reflect the change immediately
            setFormData((prev) => ({
                ...prev,
                enabled: true,
            }));
        }
    };

    const handleDisable = () => {
        if (selectedObservation?.id && socket) {
            dispatch(toggleObservationEnabled({ socket, id: selectedObservation.id, enabled: false }));
            // Update local formData to reflect the change immediately
            setFormData((prev) => ({
                ...prev,
                enabled: false,
            }));
        }
    };

    const handleSave = () => {
        if (selectedObservation?.id) {
            // Update existing observation (has id)
            dispatch(updateScheduledObservation({
                socket,
                id: selectedObservation.id,
                observation: {
                    ...formData,
                    updated_at: new Date().toISOString(),
                }
            }));
        } else {
            // Add new observation (no id, either new or cloned)
            const newObservation = {
                ...formData,
                id: `obs-${Date.now()}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                status: 'scheduled',
            };
            dispatch(createScheduledObservation({
                socket,
                observation: newObservation
            }));
        }

        // Dialog will be closed automatically by the fulfilled reducer
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
                    config: {
                        transmitter_id: '',
                        enable_frequency_shift: false,
                        auto_fill_target_freq: false,
                        target_center_freq: '',
                    },
                };
                break;
            case 'transcription':
                newTask = {
                    type: 'transcription',
                    config: {
                        transmitter_id: '',
                        modulation: 'fm',
                        provider: 'gemini',
                        language: 'auto',
                        translate_to: 'none',
                    },
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
        } else if (task.type === 'transcription') {
            const transmitter = availableTransmitters.find(t => t.id === task.config.transmitter_id);
            const transmitterName = transmitter?.description || 'No transmitter';
            const freqMHz = transmitter?.downlink_low ? `${(transmitter.downlink_low / 1000000).toFixed(3)} MHz` : '';
            const modType = MODULATION_TYPES.find(d => d.value === task.config.modulation)?.label || task.config.modulation?.toUpperCase();
            const provider = (task.config.provider || 'gemini').charAt(0).toUpperCase() + (task.config.provider || 'gemini').slice(1);
            const sourceLang = task.config.language || 'auto';
            const targetLang = task.config.translate_to && task.config.translate_to !== 'none' ? `→${task.config.translate_to}` : '';

            const parts = [transmitterName, freqMHz, modType, provider, sourceLang + targetLang, 'Transcription'].filter(Boolean);
            return parts.join(' • ');
        } else if (task.type === 'iq_recording') {
            const transmitter = availableTransmitters.find(t => t.id === task.config.transmitter_id);
            const transmitterName = transmitter?.description || 'No transmitter';
            const freqMHz = transmitter?.downlink_low ? `${(transmitter.downlink_low / 1000000).toFixed(3)} MHz` : '';
            const extraInfo = [];
            if (task.config.enable_frequency_shift && task.config.target_center_freq) {
                const targetMHz = (task.config.target_center_freq / 1000000).toFixed(3);
                extraInfo.push(`Centered@${targetMHz}MHz`);
            }
            const parts = [transmitterName, freqMHz, ...extraInfo, 'SigMF (cf32_le)'].filter(Boolean);
            return parts.join(' • ');
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
                <FormControl fullWidth size="small" key={paramKey} disabled={isFormDisabled}>
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
                            disabled={isFormDisabled}
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
            if (task.config.transmitter_id) {
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
        // Check if CURRENT formData.pass is valid (exists in future passes or is null)
        const hasValidPass = !formData.pass || passes.some(p => {
            const passStartTime = new Date(p.event_start).getTime();
            const currentStartTime = new Date(formData.pass.event_start).getTime();
            return Math.abs(passStartTime - currentStartTime) < 1000;
        });

        // Check if selected pass conflicts with existing observations
        const conflictingObs = formData.pass && observations.find(obs => {
            // Skip the observation we're currently editing
            if (selectedObservation?.id && obs.id === selectedObservation.id) {
                return false;
            }
            if (!obs.pass) return false;
            const passStart = new Date(formData.pass.event_start);
            const passEnd = new Date(formData.pass.event_end);
            // Use task_start/task_end if available (actual execution window),
            // otherwise fall back to event_start/event_end (full visibility window)
            const obsStart = obs.task_start ? new Date(obs.task_start) : new Date(obs.pass.event_start);
            const obsEnd = obs.task_end ? new Date(obs.task_end) : new Date(obs.pass.event_end);
            // Check for any overlap
            const hasOverlap = (passStart < obsEnd && passEnd > obsStart);

            if (hasOverlap) {
                console.log('[FormValidation] Overlap detected:', {
                    newPass: { start: passStart.toISOString(), end: passEnd.toISOString() },
                    existingObs: {
                        name: obs.name,
                        start: obsStart.toISOString(),
                        end: obsEnd.toISOString()
                    }
                });
            }

            return hasOverlap;
        });
        const hasConflict = conflictingObs !== null && conflictingObs !== undefined;

        // Debug logging
        const validationChecks = {
            name: formData.name.trim() !== '',
            satellite: formData.satellite.norad_id !== '',
            sdr: formData.sdr.id !== '',
            gain: formData.sdr.gain !== '',
            antennaPort: formData.sdr.antenna_port !== '',
            bandwidth: bandwidthValidation.valid,
            hasValidPass: hasValidPass,
            hasConflict: hasConflict,
        };

        return (
            formData.name.trim() !== '' &&
            formData.satellite.norad_id !== '' &&
            formData.sdr.id !== '' &&
            formData.sdr.gain !== '' &&
            formData.sdr.antenna_port !== '' &&
            bandwidthValidation.valid &&
            hasValidPass &&  // Enable only if pass is valid (or null for continuous observation)
            !hasConflict  // Disable if pass conflicts with existing observation
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
            {/* Loading overlay while fetching transmitters */}
            {isLoadingTransmitters && (
                <Backdrop
                    open={isLoadingTransmitters}
                    sx={{
                        position: 'absolute',
                        zIndex: (theme) => theme.zIndex.drawer + 1,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    }}
                >
                    <CircularProgress color="primary" />
                </Backdrop>
            )}

            <DialogTitle
                sx={{
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    py: 2.5,
                }}
            >
                {selectedObservation?.id ? `Edit Observation: ${formData.name || 'Unnamed'}` : 'New Observation'}
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
                                    disabled={isFormDisabled}
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
                            size="small"
                            value={formData.name}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, name: e.target.value }))
                            }
                            required
                            disabled={isFormDisabled}
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
                            initialSatellite={selectedObservation?.satellite}
                            initialPass={selectedObservation?.pass}
                            currentObservationId={selectedObservation?.id}
                            onSatelliteSelect={(satellite) => {
                                setFormData((prev) => ({
                                    ...prev,
                                    satellite: {
                                        norad_id: satellite.norad_id,
                                        name: satellite.name,
                                        group_id: selectedGroupId || '',
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
                            disabled={isFormDisabled}
                        />
                    </Box>

                    <Divider />

                    {/* Rotator Selection */}
                    <Box>
                        <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            Rotator
                        </Typography>
                        <Stack spacing={2}>
                            <FormControl fullWidth size="small" disabled={isFormDisabled}>
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
                                            <Box>
                                                <Typography variant="body2">
                                                    {rotator.name}{rotator.type ? ` (${rotator.type})` : ''}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {[
                                                        rotator.host ? `${rotator.host}:${rotator.port}` : null,
                                                        rotator.min_azimuth != null && rotator.max_azimuth != null ? `Az: ${rotator.min_azimuth}° - ${rotator.max_azimuth}°` : null,
                                                        rotator.min_elevation != null && rotator.max_elevation != null ? `El: ${rotator.min_elevation}° - ${rotator.max_elevation}°` : null,
                                                    ].filter(Boolean).join(' • ') || 'No additional details'}
                                                </Typography>
                                            </Box>
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>
                    </Box>

                    <Divider />

                    {/* SDR */}
                    <Box sx={{ position: 'relative' }}>
                        <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            SDR Configuration
                        </Typography>
                        {sdrParametersLoading && (
                            <Box
                                sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: 'rgba(0, 0, 0, 0.3)',
                                    zIndex: 1,
                                    borderRadius: 1,
                                }}
                            >
                                <CircularProgress />
                            </Box>
                        )}
                        <Stack spacing={2}>
                            {sdrParametersError[formData.sdr.id] && (
                                <Box
                                    sx={{
                                        p: 1.5,
                                        bgcolor: 'error.main',
                                        color: 'error.contrastText',
                                        borderRadius: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                    }}
                                >
                                    <Typography variant="body2">
                                        ⚠ {sdrParametersError[formData.sdr.id]}
                                    </Typography>
                                </Box>
                            )}
                            <FormControl fullWidth size="small" required error={!!sdrParametersError[formData.sdr.id]} disabled={isFormDisabled}>
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
                                                gain: '',
                                                antenna_port: '',
                                            },
                                        }));
                                    }}
                                    label="SDR"
                                >
                                    {sdrs.filter(sdr => sdr.id !== 'sigmf-playback').map((sdr) => (
                                        <MenuItem key={sdr.id} value={sdr.id}>
                                            <Box>
                                                <Typography variant="body2">
                                                    {sdr.name} ({sdr.type})
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {[
                                                        sdr.driver ? `Driver: ${sdr.driver}` : null,
                                                        sdr.serial ? `Serial: ${sdr.serial}` : null,
                                                    ].filter(Boolean).join(' • ') || 'No additional details'}
                                                </Typography>
                                            </Box>
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth size="small" required error={!bandwidthValidation.valid} disabled={isFormDisabled || !formData.sdr.id || sdrParametersLoading}>
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
                                    {(sdrParameters[formData.sdr.id]?.sample_rate_values || SAMPLE_RATES.map(r => r.value)).map((rate) => {
                                        const rateValue = typeof rate === 'number' ? rate : rate.value;
                                        const rateLabel = rateValue >= 1000000
                                            ? `${(rateValue / 1000000).toFixed(rateValue % 1000000 === 0 ? 0 : 1)} MHz`
                                            : `${(rateValue / 1000).toFixed(0)} kHz`;
                                        return (
                                            <MenuItem key={rateValue} value={rateValue}>
                                                {rateLabel}
                                            </MenuItem>
                                        );
                                    })}
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
                                        ✓ All tasks fit within bandwidth
                                    </Typography>
                                )}
                            </FormControl>

                            <FormControl fullWidth size="small" required disabled={isFormDisabled || !formData.sdr.id || sdrParametersLoading} error={!!sdrParametersError[formData.sdr.id]}>
                                <InputLabel>Gain</InputLabel>
                                <Select
                                    value={
                                        formData.sdr.id && sdrParameters[formData.sdr.id]?.gain_values?.includes(formData.sdr.gain)
                                            ? formData.sdr.gain
                                            : ''
                                    }
                                    onChange={(e) => {
                                        setFormData((prev) => ({
                                            ...prev,
                                            sdr: {
                                                ...prev.sdr,
                                                gain: e.target.value,
                                            },
                                        }));
                                    }}
                                    label="Gain"
                                >
                                    {sdrParameters[formData.sdr.id]?.gain_values?.map((gain) => (
                                        <MenuItem key={gain} value={gain}>
                                            {gain} dB
                                        </MenuItem>
                                    )) || []}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth size="small" required disabled={isFormDisabled || !formData.sdr.id || sdrParametersLoading} error={!!sdrParametersError[formData.sdr.id]}>
                                <InputLabel>Antenna Port</InputLabel>
                                <Select
                                    value={
                                        formData.sdr.id && sdrParameters[formData.sdr.id]?.antennas?.rx?.includes(formData.sdr.antenna_port)
                                            ? formData.sdr.antenna_port
                                            : ''
                                    }
                                    onChange={(e) => {
                                        setFormData((prev) => ({
                                            ...prev,
                                            sdr: {
                                                ...prev.sdr,
                                                antenna_port: e.target.value,
                                            },
                                        }));
                                    }}
                                    label="Antenna Port"
                                >
                                    {sdrParameters[formData.sdr.id]?.antennas?.rx?.map((port) => (
                                        <MenuItem key={port} value={port}>
                                            {port}
                                        </MenuItem>
                                    )) || []}
                                </Select>
                            </FormControl>

                            <Box>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={formData.sdr.auto_center_frequency}
                                            onChange={(e) =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    sdr: {
                                                        ...prev.sdr,
                                                        auto_center_frequency: e.target.checked,
                                                    },
                                                }))
                                            }
                                            disabled={isFormDisabled}
                                        />
                                    }
                                    label={
                                        <Box>
                                            <Typography variant="body2">Auto-calculate Center Frequency</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Automatically optimize frequency to cover all transmitters and avoid DC spike
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </Box>

                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <TextField
                                    size="small"
                                    label="Center Frequency (Hz)"
                                    type="number"
                                    value={formData.sdr.center_frequency || ''}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value) || 0;
                                        setFormData((prev) => ({
                                            ...prev,
                                            sdr: {
                                                ...prev.sdr,
                                                center_frequency: value,
                                            },
                                        }));
                                    }}
                                    disabled={isFormDisabled || formData.sdr.auto_center_frequency}
                                    helperText={
                                        formData.sdr.auto_center_frequency
                                            ? `Auto-calculated: ${formData.sdr.center_frequency ? (formData.sdr.center_frequency / 1000000).toFixed(6) + ' MHz' : 'N/A'}`
                                            : 'Enter center frequency in Hz'
                                    }
                                    sx={{ flex: '1' }}
                                />

                                <Box sx={{ display: 'flex', flexDirection: 'column', flex: '1' }}>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={(e) => setTransmitterMenuAnchor(e.currentTarget)}
                                        disabled={isFormDisabled || formData.sdr.auto_center_frequency || availableTransmitters.length === 0}
                                        sx={{
                                            height: '40px',
                                            textTransform: 'none',
                                            justifyContent: 'flex-start',
                                            px: 2,
                                            borderColor: 'primary.main',
                                            color: 'primary.main',
                                            bgcolor: (theme) => theme.palette.mode === 'dark'
                                                ? 'rgba(144, 202, 249, 0.08)'
                                                : 'rgba(25, 118, 210, 0.04)',
                                            '&:hover': {
                                                bgcolor: (theme) => theme.palette.mode === 'dark'
                                                    ? 'rgba(144, 202, 249, 0.15)'
                                                    : 'rgba(25, 118, 210, 0.08)',
                                            }
                                        }}
                                    >
                                        ← Select from transmitter list
                                    </Button>
                                    <Menu
                                        anchorEl={transmitterMenuAnchor}
                                        open={Boolean(transmitterMenuAnchor)}
                                        onClose={() => setTransmitterMenuAnchor(null)}
                                        PaperProps={{
                                            sx: {
                                                maxHeight: 400,
                                                minWidth: 300,
                                            }
                                        }}
                                    >
                                        {availableTransmitters.length === 0 ? (
                                            <MenuItem disabled>
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
                                                        <MenuItem
                                                            key={transmitter.id}
                                                            onClick={() => {
                                                                if (transmitter?.downlink_low) {
                                                                    setFormData((prev) => ({
                                                                        ...prev,
                                                                        sdr: {
                                                                            ...prev.sdr,
                                                                            center_frequency: transmitter.downlink_low,
                                                                        },
                                                                    }));
                                                                    setTransmitterMenuAnchor(null);
                                                                }
                                                            }}
                                                        >
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                                                <Box
                                                                    sx={{
                                                                        width: 8,
                                                                        height: 8,
                                                                        borderRadius: '50%',
                                                                        backgroundColor: transmitter.alive ? '#4caf50' : '#f44336',
                                                                        boxShadow: transmitter.alive
                                                                            ? '0 0 6px rgba(76, 175, 80, 0.6)'
                                                                            : '0 0 6px rgba(244, 67, 54, 0.6)',
                                                                        flexShrink: 0,
                                                                    }}
                                                                />
                                                                <Box sx={{ flexGrow: 1 }}>
                                                                    <Typography variant="body2">
                                                                        {transmitter.description || 'Unknown'}
                                                                    </Typography>
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        {freqMHz} MHz
                                                                    </Typography>
                                                                </Box>
                                                            </Box>
                                                        </MenuItem>
                                                    );
                                                })
                                            ])
                                        )}
                                    </Menu>
                                </Box>
                            </Box>
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
                                    variant="outlined"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleAddTask('decoder')}
                                    disabled={isFormDisabled}
                                >
                                    Decoder
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleAddTask('audio_recording')}
                                    disabled={isFormDisabled}
                                >
                                    Audio Recording
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleAddTask('transcription')}
                                    disabled={isFormDisabled}
                                >
                                    Transcription
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleAddTask('iq_recording')}
                                    disabled={isFormDisabled}
                                >
                                    IQ Recording
                                </Button>
                            </Stack>
                        </Box>

                        {formData.tasks.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">
                                No tasks added. Add decoders, audio recording, transcription, or IQ recording tasks.
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
                                                    sx={{ minWidth: 130 }}
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
                                                disabled={isFormDisabled}
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
                                                        <FormControl fullWidth size="small" disabled={isFormDisabled}>
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
                                                                disabled={isFormDisabled || availableTransmitters.length === 0}
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
                                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                                                                        <Box
                                                                                            sx={{
                                                                                                width: 8,
                                                                                                height: 8,
                                                                                                borderRadius: '50%',
                                                                                                backgroundColor: transmitter.alive ? '#4caf50' : '#f44336',
                                                                                                boxShadow: transmitter.alive
                                                                                                    ? '0 0 6px rgba(76, 175, 80, 0.6)'
                                                                                                    : '0 0 6px rgba(244, 67, 54, 0.6)',
                                                                                                flexShrink: 0,
                                                                                            }}
                                                                                        />
                                                                                        <Box sx={{ flexGrow: 1 }}>
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
                                                                                    </Box>
                                                                                </MenuItem>
                                                                            );
                                                                        })
                                                                    ])
                                                                )}
                                                            </Select>
                                                        </FormControl>

                                                        <FormControl fullWidth size="small" disabled={isFormDisabled}>
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

                                                        {/* Decoder Configuration Suggestion */}
                                                        <DecoderConfigSuggestion
                                                            decoderType={decoderType}
                                                            satellite={formData.satellite.norad_id ? formData.satellite : null}
                                                            transmitter={
                                                                task.config.transmitter_id
                                                                    ? availableTransmitters.find(t => t.id === task.config.transmitter_id)
                                                                    : null
                                                            }
                                                            show={!!task.config.transmitter_id && decoderType !== 'none'}
                                                            onApply={(config) => {
                                                                // Apply the configuration to the decoder parameters
                                                                const newParams = { ...currentParams };
                                                                const prefix = decoderType;

                                                                // Map config fields to parameter keys based on decoder type
                                                                if (['gmsk', 'gfsk', 'fsk'].includes(decoderType)) {
                                                                    if (config.baudrate) newParams[`${prefix}_baudrate`] = config.baudrate;
                                                                    if (config.framing) newParams[`${prefix}_framing`] = config.framing;
                                                                    if (config.deviation !== null && config.deviation !== undefined) {
                                                                        newParams[`${prefix}_deviation`] = config.deviation;
                                                                    }
                                                                    // Apply framing-specific parameters (e.g., GEOSCAN frame_size)
                                                                    if (config.framing === 'geoscan' && config.framing_params?.frame_size) {
                                                                        newParams[`${prefix}_geoscan_frame_size`] = config.framing_params.frame_size;
                                                                    }
                                                                } else if (decoderType === 'bpsk') {
                                                                    if (config.baudrate) newParams.bpsk_baudrate = config.baudrate;
                                                                    if (config.framing) newParams.bpsk_framing = config.framing;
                                                                    if (config.differential !== null && config.differential !== undefined) {
                                                                        newParams.bpsk_differential = config.differential;
                                                                    }
                                                                    // Apply framing-specific parameters (e.g., GEOSCAN frame_size)
                                                                    if (config.framing === 'geoscan' && config.framing_params?.frame_size) {
                                                                        newParams.bpsk_geoscan_frame_size = config.framing_params.frame_size;
                                                                    }
                                                                } else if (decoderType === 'afsk') {
                                                                    if (config.baudrate) newParams.afsk_baudrate = config.baudrate;
                                                                    if (config.framing) newParams.afsk_framing = config.framing;
                                                                    if (config.deviation !== null && config.deviation !== undefined) {
                                                                        newParams.afsk_deviation = config.deviation;
                                                                    }
                                                                    if (config.af_carrier) newParams.afsk_af_carrier = config.af_carrier;
                                                                } else if (decoderType === 'lora') {
                                                                    if (config.sf) newParams.lora_sf = config.sf;
                                                                    if (config.bw) newParams.lora_bw = config.bw;
                                                                    if (config.cr) newParams.lora_cr = config.cr;
                                                                }

                                                                // Update the task parameters
                                                                setFormData((prev) => {
                                                                    const newTasks = [...prev.tasks];
                                                                    newTasks[index] = {
                                                                        ...newTasks[index],
                                                                        config: {
                                                                            ...newTasks[index].config,
                                                                            parameters: newParams,
                                                                        },
                                                                    };
                                                                    return { ...prev, tasks: newTasks };
                                                                });
                                                            }}
                                                        />

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
                                                    <FormControl fullWidth size="small" disabled={isFormDisabled}>
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
                                                            disabled={isFormDisabled || availableTransmitters.length === 0}
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
                                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                                                                    <Box
                                                                                        sx={{
                                                                                            width: 8,
                                                                                            height: 8,
                                                                                            borderRadius: '50%',
                                                                                            backgroundColor: transmitter.alive ? '#4caf50' : '#f44336',
                                                                                            boxShadow: transmitter.alive
                                                                                                ? '0 0 6px rgba(76, 175, 80, 0.6)'
                                                                                                : '0 0 6px rgba(244, 67, 54, 0.6)',
                                                                                            flexShrink: 0,
                                                                                        }}
                                                                                    />
                                                                                    <Box sx={{ flexGrow: 1 }}>
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
                                                                                </Box>
                                                                            </MenuItem>
                                                                        );
                                                                    })
                                                                ])
                                                            )}
                                                        </Select>
                                                    </FormControl>

                                                    <FormControl fullWidth size="small" disabled={isFormDisabled}>
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
                                                    <FormControl fullWidth size="small" disabled={isFormDisabled}>
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
                                                            disabled={isFormDisabled || availableTransmitters.length === 0}
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

                                                    <FormControl fullWidth size="small" disabled={isFormDisabled}>
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

                                                    <FormControl fullWidth size="small" disabled={isFormDisabled}>
                                                        <InputLabel>Provider</InputLabel>
                                                        <Select
                                                            value={task.config.provider || 'gemini'}
                                                            onChange={(e) =>
                                                                handleTaskConfigChange(
                                                                    index,
                                                                    'provider',
                                                                    e.target.value
                                                                )
                                                            }
                                                            label="Provider"
                                                        >
                                                            <MenuItem value="gemini">Gemini</MenuItem>
                                                            <MenuItem value="deepgram">Deepgram</MenuItem>
                                                        </Select>
                                                    </FormControl>

                                                    <FormControl fullWidth size="small" disabled={isFormDisabled}>
                                                        <InputLabel>Source Language</InputLabel>
                                                        <Select
                                                            value={task.config.language || 'auto'}
                                                            onChange={(e) =>
                                                                handleTaskConfigChange(
                                                                    index,
                                                                    'language',
                                                                    e.target.value
                                                                )
                                                            }
                                                            label="Source Language"
                                                        >
                                                            <MenuItem value="auto">🌐 Auto-detect</MenuItem>
                                                            <MenuItem value="en">🇬🇧 English</MenuItem>
                                                            <MenuItem value="el">🇬🇷 Greek</MenuItem>
                                                            <MenuItem value="es">🇪🇸 Spanish</MenuItem>
                                                            <MenuItem value="fr">🇫🇷 French</MenuItem>
                                                            <MenuItem value="de">🇩🇪 German</MenuItem>
                                                            <MenuItem value="it">🇮🇹 Italian</MenuItem>
                                                            <MenuItem value="pt">🇵🇹 Portuguese</MenuItem>
                                                            <MenuItem value="pt-BR">🇧🇷 Portuguese (Brazil)</MenuItem>
                                                            <MenuItem value="ru">🇷🇺 Russian</MenuItem>
                                                            <MenuItem value="uk">🇺🇦 Ukrainian</MenuItem>
                                                            <MenuItem value="ja">🇯🇵 Japanese</MenuItem>
                                                            <MenuItem value="zh">🇨🇳 Chinese</MenuItem>
                                                            <MenuItem value="ar">🇸🇦 Arabic</MenuItem>
                                                            <MenuItem value="tl">🇵🇭 Filipino</MenuItem>
                                                            <MenuItem value="tr">🇹🇷 Turkish</MenuItem>
                                                            <MenuItem value="sk">🇸🇰 Slovak</MenuItem>
                                                            <MenuItem value="hr">🇭🇷 Croatian</MenuItem>
                                                        </Select>
                                                    </FormControl>

                                                    <FormControl fullWidth size="small" disabled={isFormDisabled}>
                                                        <InputLabel>Translate To</InputLabel>
                                                        <Select
                                                            value={task.config.translate_to || 'none'}
                                                            onChange={(e) =>
                                                                handleTaskConfigChange(
                                                                    index,
                                                                    'translate_to',
                                                                    e.target.value
                                                                )
                                                            }
                                                            label="Translate To"
                                                        >
                                                            <MenuItem value="none">⭕ No Translation</MenuItem>
                                                            <MenuItem value="en">🇬🇧 English</MenuItem>
                                                            <MenuItem value="el">🇬🇷 Greek</MenuItem>
                                                            <MenuItem value="es">🇪🇸 Spanish</MenuItem>
                                                            <MenuItem value="fr">🇫🇷 French</MenuItem>
                                                            <MenuItem value="de">🇩🇪 German</MenuItem>
                                                            <MenuItem value="it">🇮🇹 Italian</MenuItem>
                                                            <MenuItem value="pt">🇵🇹 Portuguese</MenuItem>
                                                            <MenuItem value="pt-BR">🇧🇷 Portuguese (Brazil)</MenuItem>
                                                            <MenuItem value="ru">🇷🇺 Russian</MenuItem>
                                                            <MenuItem value="uk">🇺🇦 Ukrainian</MenuItem>
                                                            <MenuItem value="ja">🇯🇵 Japanese</MenuItem>
                                                            <MenuItem value="zh">🇨🇳 Chinese</MenuItem>
                                                            <MenuItem value="ar">🇸🇦 Arabic</MenuItem>
                                                            <MenuItem value="tl">🇵🇭 Filipino</MenuItem>
                                                            <MenuItem value="tr">🇹🇷 Turkish</MenuItem>
                                                            <MenuItem value="sk">🇸🇰 Slovak</MenuItem>
                                                            <MenuItem value="hr">🇭🇷 Croatian</MenuItem>
                                                        </Select>
                                                    </FormControl>

                                                    <Box>
                                                        <FormControlLabel
                                                            control={
                                                                <Checkbox
                                                                    checked={task.config.enable_frequency_shift || false}
                                                                    onChange={(e) => {
                                                                        handleTaskConfigChange(index, 'enable_frequency_shift', e.target.checked);
                                                                        // Reset related fields when disabling
                                                                        if (!e.target.checked) {
                                                                            handleTaskConfigChange(index, 'auto_fill_target_freq', false);
                                                                            handleTaskConfigChange(index, 'target_center_freq', '');
                                                                        }
                                                                    }}
                                                                    disabled={isFormDisabled}
                                                                />
                                                            }
                                                            label="Enable Frequency Shift"
                                                        />
                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mt: -0.5 }}>
                                                            Centers the signal at the target frequency. Avoids DC spike issues and required by some decoders.
                                                        </Typography>
                                                    </Box>

                                                    {task.config.enable_frequency_shift && (
                                                        <>
                                                            <FormControlLabel
                                                                control={
                                                                    <Checkbox
                                                                        checked={task.config.auto_fill_target_freq || false}
                                                                        onChange={(e) => {
                                                                            const autoFill = e.target.checked;
                                                                            handleTaskConfigChange(index, 'auto_fill_target_freq', autoFill);

                                                                            // Auto-fill immediately if enabled and transmitter is selected
                                                                            if (autoFill && task.config.transmitter_id) {
                                                                                const transmitter = availableTransmitters.find(t => t.id === task.config.transmitter_id);
                                                                                if (transmitter?.downlink_low) {
                                                                                    handleTaskConfigChange(index, 'target_center_freq', transmitter.downlink_low);
                                                                                }
                                                                            }
                                                                        }}
                                                                        disabled={isFormDisabled}
                                                                    />
                                                                }
                                                                label="Auto-fill from Transmitter Frequency"
                                                            />

                                                            <TextField
                                                                fullWidth
                                                                size="small"
                                                                label="Target Center Frequency (Hz)"
                                                                type="number"
                                                                value={task.config.target_center_freq || ''}
                                                                onChange={(e) =>
                                                                    handleTaskConfigChange(index, 'target_center_freq', parseFloat(e.target.value) || '')
                                                                }
                                                                disabled={isFormDisabled || task.config.auto_fill_target_freq}
                                                            />
                                                        </>
                                                    )}

                                                    <Typography variant="caption" color="text.secondary">
                                                        Audio transcription will be performed using the selected modulation type.
                                                    </Typography>
                                                </>
                                            )}

                                            {task.type === 'iq_recording' && (
                                                <>
                                                    <FormControl fullWidth size="small" disabled={isFormDisabled}>
                                                        <InputLabel>Transmitter</InputLabel>
                                                        <Select
                                                            value={task.config.transmitter_id || ''}
                                                            onChange={(e) => {
                                                                const transmitterId = e.target.value;
                                                                handleTaskConfigChange(index, 'transmitter_id', transmitterId);

                                                                // Auto-fill target frequency if checkbox is enabled
                                                                if (task.config.auto_fill_target_freq && transmitterId) {
                                                                    const transmitter = availableTransmitters.find(t => t.id === transmitterId);
                                                                    if (transmitter?.downlink_low) {
                                                                        handleTaskConfigChange(index, 'target_center_freq', transmitter.downlink_low);
                                                                    }
                                                                }
                                                            }}
                                                            label="Transmitter"
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

                                                    <Box>
                                                        <FormControlLabel
                                                            control={
                                                                <Checkbox
                                                                    checked={task.config.enable_frequency_shift || false}
                                                                    onChange={(e) => {
                                                                        handleTaskConfigChange(index, 'enable_frequency_shift', e.target.checked);
                                                                        // Reset related fields when disabling
                                                                        if (!e.target.checked) {
                                                                            handleTaskConfigChange(index, 'auto_fill_target_freq', false);
                                                                            handleTaskConfigChange(index, 'target_center_freq', '');
                                                                        }
                                                                    }}
                                                                    disabled={isFormDisabled}
                                                                />
                                                            }
                                                            label="Enable Frequency Shift"
                                                        />
                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4, mt: -0.5 }}>
                                                            Centers the signal at the target frequency. Avoids DC spike issues and required by some decoders.
                                                        </Typography>
                                                    </Box>

                                                    {task.config.enable_frequency_shift && (
                                                        <>
                                                            <FormControlLabel
                                                                control={
                                                                    <Checkbox
                                                                        checked={task.config.auto_fill_target_freq || false}
                                                                        onChange={(e) => {
                                                                            const autoFill = e.target.checked;
                                                                            handleTaskConfigChange(index, 'auto_fill_target_freq', autoFill);

                                                                            // Auto-fill immediately if enabled and transmitter is selected
                                                                            if (autoFill && task.config.transmitter_id) {
                                                                                const transmitter = availableTransmitters.find(t => t.id === task.config.transmitter_id);
                                                                                if (transmitter?.downlink_low) {
                                                                                    handleTaskConfigChange(index, 'target_center_freq', transmitter.downlink_low);
                                                                                }
                                                                            }
                                                                        }}
                                                                        disabled={isFormDisabled}
                                                                    />
                                                                }
                                                                label="Auto-fill from Transmitter Frequency"
                                                            />

                                                            <TextField
                                                                fullWidth
                                                                size="small"
                                                                label="Target Center Frequency (Hz)"
                                                                type="number"
                                                                value={task.config.target_center_freq || ''}
                                                                onChange={(e) =>
                                                                    handleTaskConfigChange(index, 'target_center_freq', parseFloat(e.target.value) || '')
                                                                }
                                                                disabled={isFormDisabled || task.config.auto_fill_target_freq}
                                                            />
                                                        </>
                                                    )}

                                                    <Typography variant="caption" color="text.secondary">
                                                        IQ data will be recorded in SigMF format (cf32_le).
                                                        {task.config.enable_frequency_shift
                                                            ? ' Frequency shifting will center the signal at the target frequency, avoiding DC offset issues.'
                                                            : ' The recording uses the SDR sample rate configured above.'}
                                                    </Typography>
                                                </>
                                            )}
                                            </Stack>
                                        )}
                                    </Box>
                                ))}
                            </Stack>
                        )}
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
                    display: 'flex',
                    justifyContent: 'space-between',
                }}
            >
                {/* Left side - action buttons (only shown when editing) */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                    {selectedObservation?.id && (
                        <>
                            <Button
                                onClick={handleDeleteClick}
                                variant="contained"
                                color="error"
                                startIcon={<DeleteIcon />}
                                size="small"
                            >
                                Delete
                            </Button>
                            <Button
                                onClick={handleCancelClick}
                                variant="contained"
                                color="warning"
                                startIcon={<StopIcon />}
                                size="small"
                                disabled={formData.status !== 'running' && formData.status !== 'scheduled'}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleEnable}
                                variant="contained"
                                color="success"
                                startIcon={<EnableIcon />}
                                size="small"
                                disabled={formData.status === 'running' || formData.enabled}
                            >
                                Enable
                            </Button>
                            <Button
                                onClick={handleDisable}
                                variant="contained"
                                color="secondary"
                                startIcon={<DisableIcon />}
                                size="small"
                                disabled={formData.status === 'running' || !formData.enabled}
                            >
                                Disable
                            </Button>
                        </>
                    )}
                </Box>

                {/* Right side - save/cancel buttons */}
                <Box sx={{ display: 'flex', gap: 2 }}>
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
                        disabled={!isFormValid() || isSaving || isFormDisabled}
                        startIcon={isSaving && <CircularProgress size={20} color="inherit" />}
                        sx={{
                            '&.Mui-disabled': {
                                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.400',
                                color: (theme) => theme.palette.mode === 'dark' ? 'grey.600' : 'grey.600',
                            },
                        }}
                    >
                        {isSaving ? 'Saving...' : (selectedObservation ? 'Update' : 'Create')}
                    </Button>
                </Box>
            </DialogActions>

            {/* Delete Confirmation Dialog */}
            <Dialog open={openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)}>
                <DialogTitle>Confirm Deletion</DialogTitle>
                <DialogContent>
                    Are you sure you want to delete the observation <strong>{selectedObservation?.satellite?.name || 'Unknown'}</strong>?
                    <br /><br />
                    This action cannot be undone.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDeleteConfirm(false)} variant="outlined">
                        Cancel
                    </Button>
                    <Button onClick={handleDeleteConfirm} variant="contained" color="error">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Cancel Confirmation Dialog */}
            <Dialog open={openCancelConfirm} onClose={() => setOpenCancelConfirm(false)}>
                <DialogTitle>Cancel Observation</DialogTitle>
                <DialogContent>
                    Are you sure you want to cancel the observation <strong>{selectedObservation?.satellite?.name || 'Unknown'}</strong>?
                    <br /><br />
                    This will immediately cancel the observation and remove all scheduled jobs.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenCancelConfirm(false)} variant="outlined">
                        Close
                    </Button>
                    <Button onClick={handleCancelConfirm} variant="contained" color="warning">
                        Cancel Observation
                    </Button>
                </DialogActions>
            </Dialog>
        </Dialog>
    );
};

export default ObservationFormDialog;
