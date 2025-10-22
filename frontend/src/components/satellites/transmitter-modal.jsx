
import {Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, TextField, InputLabel, Tooltip} from "@mui/material";
import Button from "@mui/material/Button";
import * as React from "react";
import {useEffect, useState, useCallback} from "react";
import Grid from "@mui/material/Grid2";
import {
    DataGrid,
    GridActionsCellItem,
    GridToolbarContainer,
} from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import {useDispatch, useSelector} from "react-redux";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import {
    submitTransmitter,
    editTransmitter,
    setClickedSatelliteTransmitters,
} from "./satellite-slice.jsx";
import {useSocket} from "../common/socket.jsx";


// Define the dropdown options
const STATUS_OPTIONS = [
    {name: "active", value: "active"},
    {name: "inactive", value: "inactive"},
    {name: "dead", value: "dead"},
    {name: "alive", value: "alive"}
];
const TYPE_OPTIONS = [
    {name: "Telemetry", value: "Telemetry"},
    {name: "Transmitter", value: "Transmitter"},
    {name: "Beacon", value: "Beacon"},
    {name: "Transponder", value: "Transponder"}
];
const ALIVE_OPTIONS = [
    {name: "true", value: true},
    {name: "false", value: false}
];
const INVERT_OPTIONS = [
    {name: "true", value: true},
    {name: "false", value: false},
];
const MODE_OPTIONS = [
    {name: "FM", value: "FM"},
    {name: "AM", value: "AM"},
    {name: "SSB", value: "SSB"},
    {name: "CW", value: "CW"},
    {name: "AFSK", value: "AFSK"},
    {name: "PSK", value: "PSK"},
    {name: "BPSK", value: "BPSK"},
    {name: "QPSK", value: "QPSK"},
    {name: "FSK", value: "FSK"},
    {name: "GMSK", value: "GMSK"}
];


// Transmitter Edit/Add Modal Component
const TransmitterModal = ({ open, onClose, transmitter, satelliteId, isNew = false }) => {
    const dispatch = useDispatch();
    const {socket} = useSocket();
    const { loading, error } = useSelector(state => state.satellites);

    const [formData, setFormData] = useState({
        description: "",
        type: "",
        status: "",
        alive: "",
        uplinkLow: "",
        uplinkHigh: "",
        uplinkDrift: "",
        downlinkLow: "",
        downlinkHigh: "",
        downlinkDrift: "",
        mode: "",
        uplinkMode: "",
        invert: "",
        baud: "",
    });

    const [validationErrors, setValidationErrors] = useState({});

    useEffect(() => {
        if (transmitter) {
            setFormData({
                description: transmitter.description === "-" ? "" : transmitter.description || "",
                type: transmitter.type === "-" ? "" : transmitter.type || "",
                status: transmitter.status === "-" ? "" : transmitter.status || "",
                alive: transmitter.alive === "-" ? "" : transmitter.alive || "",
                uplinkLow: transmitter.uplinkLow === "-" ? "" : transmitter.uplinkLow || "",
                uplinkHigh: transmitter.uplinkHigh === "-" ? "" : transmitter.uplinkHigh || "",
                uplinkDrift: transmitter.uplinkDrift === "-" ? "" : transmitter.uplinkDrift || "",
                downlinkLow: transmitter.downlinkLow === "-" ? "" : transmitter.downlinkLow || "",
                downlinkHigh: transmitter.downlinkHigh === "-" ? "" : transmitter.downlinkHigh || "",
                downlinkDrift: transmitter.downlinkDrift === "-" ? "" : transmitter.downlinkDrift || "",
                mode: transmitter.mode === "-" ? "" : transmitter.mode || "",
                uplinkMode: transmitter.uplinkMode === "-" ? "" : transmitter.uplinkMode || "",
                invert: transmitter.invert === "-" ? "" : transmitter.invert || "",
                baud: transmitter.baud === "-" ? "" : transmitter.baud || "",
            });
        } else {
            // Reset form for new transmitter
            setFormData({
                description: "",
                type: "",
                status: "",
                alive: "",
                uplinkLow: "",
                uplinkHigh: "",
                uplinkDrift: "",
                downlinkLow: "",
                downlinkHigh: "",
                downlinkDrift: "",
                mode: "",
                uplinkMode: "",
                invert: "",
                baud: "",
            });
        }
        // Clear validation errors when modal opens/closes
        setValidationErrors({});
    }, [transmitter, open]);

    const handleChange = (field) => (event) => {
        setFormData(prev => ({
            ...prev,
            [field]: event.target.value
        }));

        // Clear validation error for this field when user starts typing
        if (validationErrors[field]) {
            setValidationErrors(prev => ({
                ...prev,
                [field]: false
            }));
        }
    };

    const validateForm = () => {
        const errors = {};

        // Required fields
        if (!formData.description.trim()) {
            errors.description = true;
        }
        if (!formData.type) {
            errors.type = true;
        }
        if (!formData.status) {
            errors.status = true;
        }
        if (formData.alive === "" || formData.alive === null || formData.alive === undefined) {
            errors.alive = true;
        }

        // At least one uplink or downlink value must be provided
        const hasUplink = formData.uplinkLow || formData.uplinkHigh;
        const hasDownlink = formData.downlinkLow || formData.downlinkHigh;

        if (!hasUplink && !hasDownlink) {
            errors.uplinkLow = true;
            errors.uplinkHigh = true;
            errors.downlinkLow = true;
            errors.downlinkHigh = true;
        }

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) {
            return;
        }

        const processedData = {
            ...formData,
            // Convert empty strings back to "-" for display
            description: formData.description || "-",
            type: formData.type || "-",
            status: formData.status || "-",
            alive: formData.alive || "-",
            uplinkLow: formData.uplinkLow || "-",
            uplinkHigh: formData.uplinkHigh || "-",
            uplinkDrift: formData.uplinkDrift || "-",
            downlinkLow: formData.downlinkLow || "-",
            downlinkHigh: formData.downlinkHigh || "-",
            downlinkDrift: formData.downlinkDrift || "-",
            mode: formData.mode || "-",
            uplinkMode: formData.uplinkMode || "-",
            invert: formData.invert || false,
            baud: formData.baud || "-",
        };

        const transmitterData = {
            ...processedData,
            satelliteId: satelliteId,
            ...(isNew ? {} : { id: transmitter.id })
        };

        try {
            if (isNew) {
                const result = await dispatch(submitTransmitter({
                    socket,
                    transmitterData
                })).unwrap();

                // Update the transmitters with the response
                dispatch(setClickedSatelliteTransmitters(result));
            } else {
                const result = await dispatch(editTransmitter({
                    socket,
                    transmitterData
                })).unwrap();

                // Update the transmitters with the response
                dispatch(setClickedSatelliteTransmitters(result));
            }

            // Close modal on successful submission
            onClose();

        } catch (error) {
            // Error is handled by Redux state, modal stays open for user to retry
            console.error('Failed to submit transmitter:', error);
        }
    };

    const getFieldSx = (fieldName) => ({
        '& .MuiOutlinedInput-root': {
            color: '#ffffff',
            backgroundColor: '#2a2a2a',
            '& fieldset': {
                borderColor: validationErrors[fieldName] ? '#f44336' : '#555555',
                borderWidth: validationErrors[fieldName] ? '2px' : '1px'
            },
            '&:hover fieldset': {
                borderColor: validationErrors[fieldName] ? '#f44336' : '#777777',
                borderWidth: validationErrors[fieldName] ? '2px' : '1px'
            },
            '&.Mui-focused fieldset': {
                borderColor: validationErrors[fieldName] ? '#f44336' : '#90caf9',
                borderWidth: '2px'
            },
        },
        '& .MuiInputLabel-root': {
            color: validationErrors[fieldName] ? '#f44336' : '#cccccc',
            '&.Mui-focused': { color: validationErrors[fieldName] ? '#f44336' : '#90caf9' }
        },
        '& .MuiSelect-select': {
            color: '#ffffff',
        },
        '& .MuiSelect-icon': {
            color: '#cccccc',
        },
        mb: 2.5
    });

    const getSelectSx = (fieldName) => ({
        color: '#ffffff',
        '& .MuiOutlinedInput-notchedOutline': {
            borderColor: validationErrors[fieldName] ? '#f44336' : '#555555',
            borderWidth: validationErrors[fieldName] ? '2px' : '1px'
        },
        '& .MuiSelect-icon': { color: '#cccccc' },
        '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: validationErrors[fieldName] ? '#f44336' : '#777777',
            borderWidth: validationErrors[fieldName] ? '2px' : '1px'
        },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: validationErrors[fieldName] ? '#f44336' : '#90caf9',
            borderWidth: '2px'
        },
    });

    const getInputLabelSx = (fieldName) => ({
        color: validationErrors[fieldName] ? '#f44336' : '#cccccc',
        '&.Mui-focused': { color: validationErrors[fieldName] ? '#f44336' : '#90caf9' }
    });

    const hasFrequencyErrors = validationErrors.uplinkLow || validationErrors.uplinkHigh ||
        validationErrors.downlinkLow || validationErrors.downlinkHigh;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    backgroundColor: '#1a1a1a',
                    color: '#ffffff',
                    border: '1px solid #333333',
                    borderRadius: 2,
                    minHeight: '600px'
                }
            }}
        >
            <DialogTitle
                sx={{
                    color: '#ffffff',
                    backgroundColor: '#262626',
                    borderBottom: '1px solid #444444',
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    py: 2.5
                }}
            >
                {isNew ? 'Add New Transmitter' : 'Edit Transmitter'}
            </DialogTitle>
            <DialogContent sx={{ backgroundColor: '#1a1a1a', px: 3, py: 3 }}>
                {error && (
                    <Box sx={{
                        mb: 2,
                        p: 2,
                        backgroundColor: '#d32f2f',
                        borderRadius: 1,
                        color: '#ffffff'
                    }}>
                        <Typography variant="body2">
                            Error: {error}
                        </Typography>
                    </Box>
                )}

                {Object.keys(validationErrors).length > 0 && (
                    <Box sx={{
                        mt: 2,
                        mb: 2,
                        p: 2,
                        backgroundColor: '#d32f2f',
                        borderRadius: 1,
                        color: '#ffffff'
                    }}>
                        <Typography variant="body2">
                            Please fill in all required fields. {hasFrequencyErrors && 'At least one uplink or downlink frequency must be provided.'}
                        </Typography>
                    </Box>
                )}

                <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 0 }}>

                    {/* Basic Information Section */}
                    <Typography variant="h6" sx={{ color: '#90caf9', mb: 2, fontWeight: 'bold' }}>
                        Basic Information
                    </Typography>

                    <TextField
                        fullWidth
                        label="Description"
                        value={formData.description}
                        onChange={handleChange('description')}
                        variant="filled"
                        placeholder="Enter transmitter description"
                        sx={getFieldSx('description')}
                        disabled={loading}
                        error={validationErrors.description}
                        required
                    />

                    <Box sx={{ display: 'flex', gap: 2, mb: 2.5 }}>
                        <FormControl fullWidth variant="outlined" error={validationErrors.type}>
                            <InputLabel sx={getInputLabelSx('type')}>Type *</InputLabel>
                            <Select
                                value={formData.type}
                                onChange={handleChange('type')}
                                label="Type *"
                                disabled={loading}
                                sx={getSelectSx('type')}
                                MenuProps={{
                                    PaperProps: {
                                        sx: {
                                            backgroundColor: '#2a2a2a',
                                            '& .MuiMenuItem-root': {
                                                color: '#ffffff',
                                                '&:hover': { backgroundColor: '#3a3a3a' }
                                            }
                                        }
                                    }
                                }}
                                variant={'filled'}
                                required>
                                {TYPE_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth variant="outlined" error={validationErrors.status}>
                            <InputLabel sx={getInputLabelSx('status')}>Status *</InputLabel>
                            <Select
                                value={formData.status}
                                onChange={handleChange('status')}
                                label="Status *"
                                disabled={loading}
                                sx={getSelectSx('status')}
                                MenuProps={{
                                    PaperProps: {
                                        sx: {
                                            backgroundColor: '#2a2a2a',
                                            '& .MuiMenuItem-root': {
                                                color: '#ffffff',
                                                '&:hover': { backgroundColor: '#3a3a3a' }
                                            }
                                        }
                                    }
                                }}
                                variant={'filled'}
                                required>
                                {STATUS_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    <FormControl fullWidth variant="outlined" sx={{ mb: 3 }} error={validationErrors.alive}>
                        <InputLabel sx={getInputLabelSx('alive')}>Alive *</InputLabel>
                        <Select
                            value={formData.alive}
                            onChange={handleChange('alive')}
                            label="Alive *"
                            disabled={loading}
                            sx={getSelectSx('alive')}
                            MenuProps={{
                                PaperProps: {
                                    sx: {
                                        backgroundColor: '#2a2a2a',
                                        '& .MuiMenuItem-root': {
                                            color: '#ffffff',
                                            '&:hover': { backgroundColor: '#3a3a3a' }
                                        }
                                    }
                                }}
                            }
                            variant={'filled'}
                            required>
                            {ALIVE_OPTIONS.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {/* Uplink Frequencies Section */}
                    <Typography variant="h6" sx={{ color: '#90caf9', mb: 2, fontWeight: 'bold' }}>
                        Uplink Frequencies
                    </Typography>

                    <TextField
                        fullWidth
                        label="Uplink Low (Hz)"
                        value={formData.uplinkLow}
                        onChange={handleChange('uplinkLow')}
                        variant="filled"
                        type="number"
                        placeholder="e.g., 435000000"
                        sx={getFieldSx('uplinkLow')}
                        disabled={loading}
                        error={validationErrors.uplinkLow}
                    />

                    <TextField
                        fullWidth
                        label="Uplink High (Hz)"
                        value={formData.uplinkHigh}
                        onChange={handleChange('uplinkHigh')}
                        variant="filled"
                        type="number"
                        placeholder="e.g., 438000000"
                        sx={getFieldSx('uplinkHigh')}
                        disabled={loading}
                        error={validationErrors.uplinkHigh}
                    />

                    <TextField
                        fullWidth
                        label="Uplink Drift (Hz)"
                        value={formData.uplinkDrift}
                        onChange={handleChange('uplinkDrift')}
                        variant="filled"
                        type="number"
                        placeholder="e.g., 1000"
                        sx={{ ...getFieldSx('uplinkDrift'), mb: 3 }}
                        disabled={loading}
                    />

                    {/* Downlink Frequencies Section */}
                    <Typography variant="h6" sx={{ color: '#90caf9', mb: 2, fontWeight: 'bold' }}>
                        Downlink Frequencies
                    </Typography>

                    <TextField
                        fullWidth
                        label="Downlink Low (Hz)"
                        value={formData.downlinkLow}
                        onChange={handleChange('downlinkLow')}
                        variant="filled"
                        type="number"
                        placeholder="e.g., 145800000"
                        sx={getFieldSx('downlinkLow')}
                        disabled={loading}
                        error={validationErrors.downlinkLow}
                    />

                    <TextField
                        fullWidth
                        label="Downlink High (Hz)"
                        value={formData.downlinkHigh}
                        onChange={handleChange('downlinkHigh')}
                        variant="filled"
                        type="number"
                        placeholder="e.g., 145900000"
                        sx={getFieldSx('downlinkHigh')}
                        disabled={loading}
                        error={validationErrors.downlinkHigh}
                    />

                    <TextField
                        fullWidth
                        label="Downlink Drift (Hz)"
                        value={formData.downlinkDrift}
                        onChange={handleChange('downlinkDrift')}
                        variant="filled"
                        type="number"
                        placeholder="e.g., 500"
                        sx={{ ...getFieldSx('downlinkDrift'), mb: 3 }}
                        disabled={loading}
                    />

                    {/* Transmission Settings Section */}
                    <Typography variant="h6" sx={{ color: '#90caf9', mb: 2, fontWeight: 'bold' }}>
                        Transmission Settings
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 2, mb: 2.5 }}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={getInputLabelSx('mode')}>Downlink mode</InputLabel>
                            <Select
                                value={formData.mode}
                                onChange={handleChange('mode')}
                                label="Downlink mode"
                                disabled={loading}
                                sx={getSelectSx('mode')}
                                MenuProps={{
                                    PaperProps: {
                                        sx: {
                                            backgroundColor: '#2a2a2a',
                                            '& .MuiMenuItem-root': {
                                                color: '#ffffff',
                                                '&:hover': { backgroundColor: '#3a3a3a' }
                                            }
                                        }
                                    }
                                }}
                                variant={'filled'}>
                                {MODE_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={getInputLabelSx('uplinkMode')}>Uplink mode</InputLabel>
                            <Select
                                value={formData.uplinkMode}
                                onChange={handleChange('uplinkMode')}
                                label="Uplink mode"
                                disabled={loading}
                                sx={getSelectSx('uplinkMode')}
                                MenuProps={{
                                    PaperProps: {
                                        sx: {
                                            backgroundColor: '#2a2a2a',
                                            '& .MuiMenuItem-root': {
                                                color: '#ffffff',
                                                '&:hover': { backgroundColor: '#3a3a3a' }
                                            }
                                        }
                                    }
                                }}
                                variant={'filled'}>
                                {MODE_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2, mb: 0 }}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={getInputLabelSx('invert')}>Invert</InputLabel>
                            <Select
                                value={formData.invert}
                                onChange={handleChange('invert')}
                                label="Invert"
                                disabled={loading}
                                sx={getSelectSx('invert')}
                                MenuProps={{
                                    PaperProps: {
                                        sx: {
                                            backgroundColor: '#2a2a2a',
                                            '& .MuiMenuItem-root': {
                                                color: '#ffffff',
                                                '&:hover': { backgroundColor: '#3a3a3a' }
                                            }
                                        }
                                    }
                                }}
                                variant={'filled'}>
                                {INVERT_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <TextField
                            fullWidth
                            label="Baud Rate"
                            value={formData.baud}
                            onChange={handleChange('baud')}
                            variant="filled"
                            type="number"
                            placeholder="e.g., 9600"
                            disabled={loading}
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    color: '#ffffff',
                                    backgroundColor: '#2a2a2a',
                                    '& fieldset': { borderColor: '#555555' },
                                    '&:hover fieldset': { borderColor: '#777777' },
                                    '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                                },
                                '& .MuiInputLabel-root': {
                                    color: '#cccccc',
                                    '&.Mui-focused': { color: '#90caf9' }
                                },
                            }}
                        />
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions sx={{
                backgroundColor: '#262626',
                borderTop: '1px solid #444444',
                px: 3,
                py: 2.5,
                gap: 2
            }}>
                <Button
                    onClick={onClose}
                    variant="outlined"
                    disabled={loading}
                    sx={{
                        color: '#ffffff',
                        borderColor: '#666666',
                        '&:hover': {
                            borderColor: '#888888',
                            backgroundColor: '#333333'
                        }
                    }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    disabled={loading}
                    sx={{
                        backgroundColor: '#1976d2',
                        '&:hover': { backgroundColor: '#1565c0' },
                        '&.Mui-disabled': {
                            backgroundColor: '#555555',
                            color: '#aaaaaa'
                        }
                    }}
                >
                    {loading ?
                        (isNew ? 'Adding...' : 'Saving...') :
                        (isNew ? 'Add Transmitter' : 'Save Changes')
                    }
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// Delete Confirmation Dialog Component
export const DeleteConfirmDialog = ({ open, onClose, onConfirm, transmitterName }) => {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    backgroundColor: '#1e1e1e',
                    color: '#ffffff'
                }
            }}
        >
            <DialogTitle sx={{ color: '#ffffff' }}>
                Confirm Delete
            </DialogTitle>
            <DialogContent>
                <Typography sx={{ color: '#ffffff' }}>
                    Are you sure you want to delete the transmitter "{transmitterName}"?
                </Typography>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
                <Button onClick={onClose} sx={{ color: '#ffffff' }}>
                    Cancel
                </Button>
                <Button onClick={onConfirm} variant="contained" color="error" sx={{ ml: 2 }}>
                    Delete
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default TransmitterModal;