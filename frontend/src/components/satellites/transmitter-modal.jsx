import {Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, TextField, InputLabel, Tooltip} from "@mui/material";
import {betterDateTimes, betterStatusValue, renderCountryFlagsCSV} from "../common/common.jsx";
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
import {useDispatch} from "react-redux";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import {submitTransmitter} from "./satellite-slice.jsx";
import {useSocket} from "../common/socket.jsx";


// Define the dropdown options
const STATUS_OPTIONS = [
    {name: "active", value: "active"},
    {name: "inactive", value: "inactive"},
    {name: "dead", value: "dead"}
];
const TYPE_OPTIONS = [
    {name: "Telemetry", value: "Telemetry"},
    {name: "Transmitter", value: "Transmitter"},
    {name: "Beacon", value: "Beacon"}
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
const TransmitterModal = ({ open, onClose, transmitter, onSave, isNew = false }) => {
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
    }, [transmitter, open]);

    const handleChange = (field) => (event) => {
        setFormData(prev => ({
            ...prev,
            [field]: event.target.value
        }));
    };

    const handleSave = () => {
        const updatedData = {
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
            invert: formData.invert || "-",
            baud: formData.baud || "-",
        };

        if (isNew) {
            onSave({ ...updatedData, id: `new-${Date.now()}`, isNew: true });
        } else {
            onSave({ ...transmitter, ...updatedData });
        }
        onClose();
    };

    const fieldSx = {
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
        '& .MuiSelect-select': {
            color: '#ffffff',
        },
        '& .MuiSelect-icon': {
            color: '#cccccc',
        },
        mb: 2.5
    };

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
                {isNew ? '📡 Add New Transmitter' : '✏️ Edit Transmitter'}
            </DialogTitle>
            <DialogContent sx={{ backgroundColor: '#1a1a1a', px: 3, py: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                    {/* Basic Information Section */}
                    <Typography variant="h6" sx={{ color: '#90caf9', mb: 2, fontWeight: 'bold' }}>
                        📋 Basic Information
                    </Typography>

                    <TextField
                        fullWidth
                        label="Description"
                        value={formData.description}
                        onChange={handleChange('description')}
                        variant="outlined"
                        placeholder="Enter transmitter description"
                        sx={fieldSx}
                    />

                    <Box sx={{ display: 'flex', gap: 2, mb: 2.5 }}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={{ color: '#cccccc', '&.Mui-focused': { color: '#90caf9' } }}>Type</InputLabel>
                            <Select
                                value={formData.type}
                                onChange={handleChange('type')}
                                label="Type"
                                sx={{
                                    color: '#ffffff',
                                    backgroundColor: '#2a2a2a',
                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#555555' },
                                    '& .MuiSelect-icon': { color: '#cccccc' },
                                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#777777' },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                                }}
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
                            >
                                {TYPE_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={{ color: '#cccccc', '&.Mui-focused': { color: '#90caf9' } }}>Status</InputLabel>
                            <Select
                                value={formData.status}
                                onChange={handleChange('status')}
                                label="Status"
                                sx={{
                                    color: '#ffffff',
                                    backgroundColor: '#2a2a2a',
                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#555555' },
                                    '& .MuiSelect-icon': { color: '#cccccc' },
                                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#777777' },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                                }}
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
                            >
                                {STATUS_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    <FormControl fullWidth variant="outlined" sx={{ mb: 3 }}>
                        <InputLabel sx={{ color: '#cccccc', '&.Mui-focused': { color: '#90caf9' } }}>Alive</InputLabel>
                        <Select
                            value={formData.alive}
                            onChange={handleChange('alive')}
                            label="Alive"
                            sx={{
                                color: '#ffffff',
                                backgroundColor: '#2a2a2a',
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#555555' },
                                '& .MuiSelect-icon': { color: '#cccccc' },
                                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#777777' },
                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                            }}
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
                        >
                            {ALIVE_OPTIONS.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {/* Uplink Frequencies Section */}
                    <Typography variant="h6" sx={{ color: '#90caf9', mb: 2, fontWeight: 'bold' }}>
                        📡 Uplink Frequencies
                    </Typography>

                    <TextField
                        fullWidth
                        label="Uplink Low (Hz)"
                        value={formData.uplinkLow}
                        onChange={handleChange('uplinkLow')}
                        variant="outlined"
                        type="number"
                        placeholder="e.g., 435000000"
                        sx={fieldSx}
                    />

                    <TextField
                        fullWidth
                        label="Uplink High (Hz)"
                        value={formData.uplinkHigh}
                        onChange={handleChange('uplinkHigh')}
                        variant="outlined"
                        type="number"
                        placeholder="e.g., 438000000"
                        sx={fieldSx}
                    />

                    <TextField
                        fullWidth
                        label="Uplink Drift (Hz)"
                        value={formData.uplinkDrift}
                        onChange={handleChange('uplinkDrift')}
                        variant="outlined"
                        type="number"
                        placeholder="e.g., 1000"
                        sx={{ ...fieldSx, mb: 3 }}
                    />

                    {/* Downlink Frequencies Section */}
                    <Typography variant="h6" sx={{ color: '#90caf9', mb: 2, fontWeight: 'bold' }}>
                        📻 Downlink Frequencies
                    </Typography>

                    <TextField
                        fullWidth
                        label="Downlink Low (Hz)"
                        value={formData.downlinkLow}
                        onChange={handleChange('downlinkLow')}
                        variant="outlined"
                        type="number"
                        placeholder="e.g., 145800000"
                        sx={fieldSx}
                    />

                    <TextField
                        fullWidth
                        label="Downlink High (Hz)"
                        value={formData.downlinkHigh}
                        onChange={handleChange('downlinkHigh')}
                        variant="outlined"
                        type="number"
                        placeholder="e.g., 145900000"
                        sx={fieldSx}
                    />

                    <TextField
                        fullWidth
                        label="Downlink Drift (Hz)"
                        value={formData.downlinkDrift}
                        onChange={handleChange('downlinkDrift')}
                        variant="outlined"
                        type="number"
                        placeholder="e.g., 500"
                        sx={{ ...fieldSx, mb: 3 }}
                    />

                    {/* Transmission Settings Section */}
                    <Typography variant="h6" sx={{ color: '#90caf9', mb: 2, fontWeight: 'bold' }}>
                        ⚙️ Transmission Settings
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 2, mb: 2.5 }}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={{ color: '#cccccc', '&.Mui-focused': { color: '#90caf9' } }}>Mode</InputLabel>
                            <Select
                                value={formData.mode}
                                onChange={handleChange('mode')}
                                label="Mode"
                                sx={{
                                    color: '#ffffff',
                                    backgroundColor: '#2a2a2a',
                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#555555' },
                                    '& .MuiSelect-icon': { color: '#cccccc' },
                                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#777777' },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                                }}
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
                            >
                                {MODE_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={{ color: '#cccccc', '&.Mui-focused': { color: '#90caf9' } }}>Uplink Mode</InputLabel>
                            <Select
                                value={formData.uplinkMode}
                                onChange={handleChange('uplinkMode')}
                                label="Uplink Mode"
                                sx={{
                                    color: '#ffffff',
                                    backgroundColor: '#2a2a2a',
                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#555555' },
                                    '& .MuiSelect-icon': { color: '#cccccc' },
                                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#777777' },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                                }}
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
                            >
                                {MODE_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2, mb: 0 }}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={{ color: '#cccccc', '&.Mui-focused': { color: '#90caf9' } }}>Invert</InputLabel>
                            <Select
                                value={formData.invert}
                                onChange={handleChange('invert')}
                                label="Invert"
                                sx={{
                                    color: '#ffffff',
                                    backgroundColor: '#2a2a2a',
                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#555555' },
                                    '& .MuiSelect-icon': { color: '#cccccc' },
                                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#777777' },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                                }}
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
                            >
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
                            variant="outlined"
                            type="number"
                            placeholder="e.g., 9600"
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
                    sx={{
                        backgroundColor: '#1976d2',
                        '&:hover': { backgroundColor: '#1565c0' }
                    }}
                >
                    {isNew ? '✅ Add Transmitter' : '💾 Save Changes'}
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