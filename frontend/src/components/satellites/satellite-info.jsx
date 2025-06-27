/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
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

import {Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, TextField, InputLabel} from "@mui/material";
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

function EditToolbar({onAddClick}) {
    return (
        <GridToolbarContainer>
            <Button
                color="primary"
                startIcon={<AddIcon />}
                onClick={onAddClick}
            >
                Add Transmitter
            </Button>
        </GridToolbarContainer>
    );
}

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

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    backgroundColor: '#1e1e1e',
                    color: '#ffffff'
                }
            }}
        >
            <DialogTitle sx={{ color: '#ffffff' }}>
                {isNew ? 'Add New Transmitter' : 'Edit Transmitter'}
            </DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
                    <Grid container spacing={3}>
                        <Grid xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Description"
                                value={formData.description}
                                onChange={handleChange('description')}
                                variant="outlined"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: '#ffffff',
                                        '& fieldset': { borderColor: '#444444' },
                                        '&:hover fieldset': { borderColor: '#666666' },
                                        '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                                    },
                                    '& .MuiInputLabel-root': { color: '#ffffff' },
                                }}
                            />
                        </Grid>
                        <Grid xs={12} md={6}>
                            <FormControl fullWidth variant="outlined">
                                <InputLabel sx={{ color: '#ffffff' }}>Type</InputLabel>
                                <Select
                                    value={formData.type}
                                    onChange={handleChange('type')}
                                    label="Type"
                                    sx={{
                                        color: '#ffffff',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#444444' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#666666' },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                                    }}
                                >
                                    {TYPE_OPTIONS.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid xs={12} md={6}>
                            <FormControl fullWidth variant="outlined">
                                <InputLabel sx={{ color: '#ffffff' }}>Status</InputLabel>
                                <Select
                                    value={formData.status}
                                    onChange={handleChange('status')}
                                    label="Status"
                                    sx={{
                                        color: '#ffffff',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#444444' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#666666' },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                                    }}
                                >
                                    {STATUS_OPTIONS.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid xs={12} md={6}>
                            <FormControl fullWidth variant="outlined">
                                <InputLabel sx={{ color: '#ffffff' }}>Alive</InputLabel>
                                <Select
                                    value={formData.alive}
                                    onChange={handleChange('alive')}
                                    label="Alive"
                                    sx={{
                                        color: '#ffffff',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#444444' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#666666' },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                                    }}
                                >
                                    {ALIVE_OPTIONS.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Uplink Low"
                                value={formData.uplinkLow}
                                onChange={handleChange('uplinkLow')}
                                variant="outlined"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: '#ffffff',
                                        '& fieldset': { borderColor: '#444444' },
                                        '&:hover fieldset': { borderColor: '#666666' },
                                        '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                                    },
                                    '& .MuiInputLabel-root': { color: '#ffffff' },
                                }}
                            />
                        </Grid>
                        <Grid xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Uplink High"
                                value={formData.uplinkHigh}
                                onChange={handleChange('uplinkHigh')}
                                variant="outlined"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: '#ffffff',
                                        '& fieldset': { borderColor: '#444444' },
                                        '&:hover fieldset': { borderColor: '#666666' },
                                        '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                                    },
                                    '& .MuiInputLabel-root': { color: '#ffffff' },
                                }}
                            />
                        </Grid>
                        <Grid xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Uplink Drift"
                                value={formData.uplinkDrift}
                                onChange={handleChange('uplinkDrift')}
                                variant="outlined"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: '#ffffff',
                                        '& fieldset': { borderColor: '#444444' },
                                        '&:hover fieldset': { borderColor: '#666666' },
                                        '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                                    },
                                    '& .MuiInputLabel-root': { color: '#ffffff' },
                                }}
                            />
                        </Grid>
                        <Grid xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Downlink Low"
                                value={formData.downlinkLow}
                                onChange={handleChange('downlinkLow')}
                                variant="outlined"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: '#ffffff',
                                        '& fieldset': { borderColor: '#444444' },
                                        '&:hover fieldset': { borderColor: '#666666' },
                                        '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                                    },
                                    '& .MuiInputLabel-root': { color: '#ffffff' },
                                }}
                            />
                        </Grid>
                        <Grid xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Downlink High"
                                value={formData.downlinkHigh}
                                onChange={handleChange('downlinkHigh')}
                                variant="outlined"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: '#ffffff',
                                        '& fieldset': { borderColor: '#444444' },
                                        '&:hover fieldset': { borderColor: '#666666' },
                                        '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                                    },
                                    '& .MuiInputLabel-root': { color: '#ffffff' },
                                }}
                            />
                        </Grid>
                        <Grid xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Downlink Drift"
                                value={formData.downlinkDrift}
                                onChange={handleChange('downlinkDrift')}
                                variant="outlined"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: '#ffffff',
                                        '& fieldset': { borderColor: '#444444' },
                                        '&:hover fieldset': { borderColor: '#666666' },
                                        '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                                    },
                                    '& .MuiInputLabel-root': { color: '#ffffff' },
                                }}
                            />
                        </Grid>
                        <Grid xs={12} md={6}>
                            <FormControl fullWidth variant="outlined">
                                <InputLabel sx={{ color: '#ffffff' }}>Mode</InputLabel>
                                <Select
                                    value={formData.mode}
                                    onChange={handleChange('mode')}
                                    label="Mode"
                                    sx={{
                                        color: '#ffffff',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#444444' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#666666' },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                                    }}
                                >
                                    {MODE_OPTIONS.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid xs={12} md={6}>
                            <FormControl fullWidth variant="outlined">
                                <InputLabel sx={{ color: '#ffffff' }}>Uplink Mode</InputLabel>
                                <Select
                                    value={formData.uplinkMode}
                                    onChange={handleChange('uplinkMode')}
                                    label="Uplink Mode"
                                    sx={{
                                        color: '#ffffff',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#444444' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#666666' },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                                    }}
                                >
                                    {MODE_OPTIONS.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid xs={12} md={6}>
                            <FormControl fullWidth variant="outlined">
                                <InputLabel sx={{ color: '#ffffff' }}>Invert</InputLabel>
                                <Select
                                    value={formData.invert}
                                    onChange={handleChange('invert')}
                                    label="Invert"
                                    sx={{
                                        color: '#ffffff',
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#444444' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#666666' },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#90caf9' },
                                    }}
                                >
                                    {INVERT_OPTIONS.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Baud"
                                value={formData.baud}
                                onChange={handleChange('baud')}
                                variant="outlined"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: '#ffffff',
                                        '& fieldset': { borderColor: '#444444' },
                                        '&:hover fieldset': { borderColor: '#666666' },
                                        '&.Mui-focused fieldset': { borderColor: '#90caf9' },
                                    },
                                    '& .MuiInputLabel-root': { color: '#ffffff' },
                                }}
                            />
                        </Grid>
                    </Grid>
                </Box>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
                <Button onClick={onClose} sx={{ color: '#ffffff' }}>
                    Cancel
                </Button>
                <Button onClick={handleSave} variant="contained" sx={{ ml: 2 }}>
                    {isNew ? 'Add' : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// Delete Confirmation Dialog Component
const DeleteConfirmDialog = ({ open, onClose, onConfirm, transmitterName }) => {
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

const SatelliteInfo = ({selectedSatellite}) => {
    const [rows, setRows] = useState([]);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [editingTransmitter, setEditingTransmitter] = useState(null);
    const [deletingTransmitter, setDeletingTransmitter] = useState(null);
    const [isNewTransmitter, setIsNewTransmitter] = useState(false);
    const dispatch = useDispatch();
    const {socket} = useSocket();

    useEffect(() => {
        if (selectedSatellite && selectedSatellite.transmitters) {
            // Map the transmitters data to rows with unique IDs
            const mappedRows = selectedSatellite.transmitters.map((transmitter, index) => ({
                id: transmitter.id || `existing-${index}`,
                description: transmitter.description || "-",
                type: transmitter.type || "-",
                status: transmitter.status || "-",
                alive: transmitter.alive || "-",
                uplinkLow: transmitter.uplink_low || "-",
                uplinkHigh: transmitter.uplink_high || "-",
                uplinkDrift: transmitter.uplink_drift || "-",
                downlinkLow: transmitter.downlink_low || "-",
                downlinkHigh: transmitter.downlink_high || "-",
                downlinkDrift: transmitter.downlink_drift || "-",
                mode: transmitter.mode || "-",
                uplinkMode: transmitter.uplink_mode || "-",
                invert: transmitter.invert || "-",
                baud: transmitter.baud || "-",
                // Keep the original data for reference
                _original: transmitter,
            }));
            setRows(mappedRows);
        }
    }, [selectedSatellite]);

    const handleEditClick = (id) => () => {
        const transmitter = rows.find(row => row.id === id);
        setEditingTransmitter(transmitter);
        setIsNewTransmitter(false);
        setEditModalOpen(true);
    };

    const handleDeleteClick = (id) => () => {
        const transmitter = rows.find(row => row.id === id);
        setDeletingTransmitter(transmitter);
        setDeleteConfirmOpen(true);
    };

    const handleDeleteConfirm = () => {
        if (deletingTransmitter) {
            const updatedRows = rows.filter((row) => row.id !== deletingTransmitter.id);
            setRows(updatedRows);
            saveTransmittersToBackend(updatedRows);
            setDeleteConfirmOpen(false);
            setDeletingTransmitter(null);
        }
    };

    const handleAddClick = () => {
        setEditingTransmitter(null);
        setIsNewTransmitter(true);
        setEditModalOpen(true);
    };

    const handleModalSave = (transmitterData) => {
        if (isNewTransmitter) {
            const newRows = [...rows, transmitterData];
            setRows(newRows);
            saveTransmittersToBackend(newRows);
        } else {
            const updatedRows = rows.map((row) =>
                row.id === transmitterData.id ? transmitterData : row
            );
            setRows(updatedRows);
            saveTransmittersToBackend(updatedRows);
        }
    };

    const saveTransmittersToBackend = useCallback((currentRows) => {
        if (!selectedSatellite || !selectedSatellite.norad_id) return;

        // Separate new and existing transmitters
        const newTransmitters = currentRows.filter(row => row.isNew);
        const existingTransmitters = currentRows.filter(row => !row.isNew);

        // Map rows back to transmitter format
        const transmitters = existingTransmitters.map(row => {
            // If we have the original data, use it as a base
            const base = row._original || {};

            return {
                ...base,
                description: row.description !== "-" ? row.description : null,
                type: row.type !== "-" ? row.type : null,
                status: row.status !== "-" ? row.status : null,
                alive: row.alive !== "-" ? row.alive : null,
                uplink_low: row.uplinkLow !== "-" ? row.uplinkLow : null,
                uplink_high: row.uplinkHigh !== "-" ? row.uplinkHigh : null,
                uplink_drift: row.uplinkDrift !== "-" ? row.uplinkDrift : null,
                downlink_low: row.downlinkLow !== "-" ? row.downlinkLow : null,
                downlink_high: row.downlinkHigh !== "-" ? row.downlinkHigh : null,
                downlink_drift: row.downlinkDrift !== "-" ? row.downlinkDrift : null,
                mode: row.mode !== "-" ? row.mode : null,
                uplink_mode: row.uplinkMode !== "-" ? row.uplinkMode : null,
                invert: row.invert !== "-" ? row.invert : null,
                baud: row.baud !== "-" ? row.baud : null,
            };
        });

        // Create new transmitter data
        const newTransmitterData = newTransmitters.map(row => ({
            norad_cat_id: selectedSatellite.norad_id,
            description: row.description !== "-" ? row.description : null,
            type: row.type !== "-" ? row.type : null,
            status: row.status !== "-" ? row.status : null,
            alive: row.alive !== "-" ? row.alive : null,
            uplink_low: row.uplinkLow !== "-" ? row.uplinkLow : null,
            uplink_high: row.uplinkHigh !== "-" ? row.uplinkHigh : null,
            uplink_drift: row.uplinkDrift !== "-" ? row.uplinkDrift : null,
            downlink_low: row.downlinkLow !== "-" ? row.downlinkLow : null,
            downlink_high: row.downlinkHigh !== "-" ? row.downlinkHigh : null,
            downlink_drift: row.downlinkDrift !== "-" ? row.downlinkDrift : null,
            mode: row.mode !== "-" ? row.mode : null,
            uplink_mode: row.uplinkMode !== "-" ? row.uplinkMode : null,
            invert: row.invert !== "-" ? row.invert : null,
            baud: row.baud !== "-" ? row.baud : null,
        }));

        if (newTransmitterData.length > 0) {
            // Update backend here
            dispatch(submitTransmitter({socket: socket, transmitterData: newTransmitterData[0]}));
        }
    }, [selectedSatellite, dispatch, socket]);

    const columns = [
        {field: "description", headerName: "Description", flex: 1},
        {field: "type", headerName: "Type", flex: 1},
        {field: "status", headerName: "Status", flex: 1},
        {field: "alive", headerName: "Alive", flex: 1},
        {field: "uplinkLow", headerName: "Uplink low", flex: 1},
        {field: "uplinkHigh", headerName: "Uplink high", flex: 1},
        {field: "uplinkDrift", headerName: "Uplink drift", flex: 1},
        {field: "downlinkLow", headerName: "Downlink low", flex: 1},
        {field: "downlinkHigh", headerName: "Downlink high", flex: 1},
        {field: "downlinkDrift", headerName: "Downlink drift", flex: 1},
        {field: "mode", headerName: "Mode", flex: 1},
        {field: "uplinkMode", headerName: "Uplink mode", flex: 1},
        {field: "invert", headerName: "Invert", flex: 1},
        {field: "baud", headerName: "Baud", flex: 1},
        {
            field: "actions",
            type: "actions",
            headerName: "Actions",
            width: 100,
            cellClassName: "actions",
            getActions: ({ id }) => {
                return [
                    <GridActionsCellItem
                        key="edit"
                        icon={<EditIcon />}
                        label="Edit"
                        onClick={handleEditClick(id)}
                    />,
                    <GridActionsCellItem
                        key="delete"
                        icon={<DeleteIcon />}
                        label="Delete"
                        onClick={handleDeleteClick(id)}
                    />,
                ];
            },
        },
    ];

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {selectedSatellite ? (
                <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                    <Grid
                        container
                        spacing={3}
                        sx={{
                            width: '100%',
                            flexDirection: {xs: 'column', md: 'row'},
                            flexShrink: 0,
                            mb: 2
                        }}
                    >
                        <Grid
                            sx={{
                                backgroundColor: '#1e1e1e',
                                borderRadius: '8px',
                                padding: 3,
                                minHeight: '300px',
                                color: '#ffffff',
                                width: {xs: '100%', md: '60%'},
                                mb: {xs: 3, md: 0},
                                boxSizing: 'border-box'
                            }}
                        >
                            <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Name:</strong> <span>{selectedSatellite['name']}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>NORAD ID:</strong> <span>{selectedSatellite['norad_id']}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Status:</strong>
                                    <span>{betterStatusValue(selectedSatellite['status'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Countries:</strong>
                                    <span>{renderCountryFlagsCSV(selectedSatellite['countries'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Operator:</strong> <span>{selectedSatellite['operator'] || '-'}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Launched:</strong>
                                    <span>{betterDateTimes(selectedSatellite['launched'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Deployed:</strong>
                                    <span>{betterDateTimes(selectedSatellite['deployed'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Decayed:</strong>
                                    <span>{betterDateTimes(selectedSatellite['decayed'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                    }}
                                >
                                    <strong>Updated:</strong>
                                    <span>{betterDateTimes(selectedSatellite['updated'])}</span>
                                </Box>
                            </Box>
                        </Grid>
                        <Grid
                            sx={{
                                textAlign: 'center',
                                minHeight: '300px',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                backgroundColor: '#1e1e1e',
                                borderRadius: '8px',
                                width: {xs: '100%', md: '36%'},
                                boxSizing: 'border-box'
                            }}
                        >
                            <Box sx={{textAlign: 'right'}}>
                                <img
                                    src={`/satimages/${selectedSatellite['norad_id']}.png`}
                                    alt={`Satellite ${selectedSatellite['norad_id']}`}
                                    style={{
                                        maxWidth: '100%',
                                        height: 'auto',
                                        border: '1px solid #444444',
                                        borderRadius: '4px',
                                    }}
                                />
                            </Box>
                        </Grid>
                    </Grid>

                    {/* Transmitters section with fixed height */}
                    <Box sx={{ flexShrink: 0 }}>
                        <Typography variant="h6" component="h3" sx={{ mb: 2 }}>
                            Transmitters
                        </Typography>
                        {selectedSatellite['transmitters'] ? (
                            <Box sx={{ height: '400px', width: '100%' }}>
                                <DataGrid
                                    rows={rows}
                                    columns={columns}
                                    slots={{
                                        toolbar: EditToolbar,
                                    }}
                                    slotProps={{
                                        toolbar: { onAddClick: handleAddClick },
                                    }}
                                    sx={{
                                        border: 'none',
                                        backgroundColor: '#1e1e1e',
                                        color: '#ffffff',
                                        height: '100%',
                                        '& .MuiDataGrid-columnHeaders': {
                                            backgroundColor: '#333333',
                                            color: '#ffffff',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            borderBottom: '1px solid #444444',
                                        },
                                        '& .MuiDataGrid-cell': {
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            borderBottom: '1px solid #444444',
                                        },
                                        '& .MuiDataGrid-row': {
                                            '&:nth-of-type(odd)': {
                                                backgroundColor: '#292929',
                                            },
                                            '&:hover': {
                                                backgroundColor: '#3a3a3a',
                                            },
                                        },
                                        '& .MuiDataGrid-footerContainer': {
                                            backgroundColor: '#121212',
                                            color: '#ffffff',
                                        },
                                        '& .MuiDataGrid-cell:focus': {
                                            outline: 'none',
                                        },
                                        '& .MuiDataGrid-selectedRowCount': {
                                            color: '#ffffff',
                                        },
                                        '& .MuiDataGrid-cellContent': {
                                            color: '#ffffff',
                                        },
                                    }}
                                />
                            </Box>
                        ) : (
                            <div style={{textAlign: 'center'}}>
                                <span>No Transmitters Available</span>
                            </div>
                        )}
                    </Box>

                    {/* Edit/Add Transmitter Modal */}
                    <TransmitterModal
                        open={editModalOpen}
                        onClose={() => setEditModalOpen(false)}
                        transmitter={editingTransmitter}
                        onSave={handleModalSave}
                        isNew={isNewTransmitter}
                    />

                    {/* Delete Confirmation Dialog */}
                    <DeleteConfirmDialog
                        open={deleteConfirmOpen}
                        onClose={() => {
                            setDeleteConfirmOpen(false);
                            setDeletingTransmitter(null);
                        }}
                        onConfirm={handleDeleteConfirm}
                        transmitterName={deletingTransmitter?.description || 'Unknown'}
                    />
                </Box>
            ) : (
                <span>No Satellite Data Available</span>
            )}
        </Box>
    );
};

export default SatelliteInfo;