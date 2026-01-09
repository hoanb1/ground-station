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
import { useDispatch, useSelector } from 'react-redux';
import { DataGrid, gridClasses } from '@mui/x-data-grid';
import {
    Box,
    Chip,
    IconButton,
    Tooltip,
    Switch,
    Stack,
    Button,
    Paper,
    Typography,
    Alert,
    AlertTitle,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControlLabel,
    Checkbox,
} from '@mui/material';
import {
    Delete as DeleteIcon,
    Edit as EditIcon,
    Add as AddIcon,
    Refresh as RefreshIcon,
    CheckCircle as EnableIcon,
    Cancel as DisableIcon,
} from '@mui/icons-material';
import { useSocket } from '../common/socket.jsx';
import {
    setSelectedMonitoredSatellite,
    setMonitoredSatelliteDialogOpen,
    deleteMonitoredSatellitesAsync,
    toggleMonitoredSatelliteEnabledAsync,
    fetchMonitoredSatellites,
} from './scheduler-slice.jsx';
import RegenerationPreviewDialog from './regeneration-preview-dialog.jsx';

const MonitoredSatellitesTable = () => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const [selectedIds, setSelectedIds] = useState([]);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [deleteObservations, setDeleteObservations] = useState(false);
    const [openRegenerateConfirm, setOpenRegenerateConfirm] = useState(false);
    const [openPreviewDialog, setOpenPreviewDialog] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    const monitoredSatellites = useSelector((state) => state.scheduler?.monitoredSatellites || []);
    const loading = useSelector((state) => state.scheduler?.monitoredSatellitesLoading || false);

    useEffect(() => {
        if (socket) {
            dispatch(fetchMonitoredSatellites({ socket }));
        }
    }, [socket, dispatch]);

    const handleDelete = () => {
        if (selectedIds.length > 0 && socket) {
            dispatch(deleteMonitoredSatellitesAsync({ socket, ids: selectedIds, deleteObservations }));
            setSelectedIds([]);
            setOpenDeleteConfirm(false);
            setDeleteObservations(false);
        }
    };

    const handleEdit = (monitoredSatellite) => {
        dispatch(setSelectedMonitoredSatellite(monitoredSatellite));
        dispatch(setMonitoredSatelliteDialogOpen(true));
    };

    const handleAdd = () => {
        dispatch(setSelectedMonitoredSatellite(null));
        dispatch(setMonitoredSatelliteDialogOpen(true));
    };

    const handleToggleEnabled = (id, currentEnabled) => {
        if (socket) {
            dispatch(toggleMonitoredSatelliteEnabledAsync({ socket, id, enabled: !currentEnabled }));
        }
    };

    const handleBulkEnable = () => {
        if (selectedIds.length > 0 && socket) {
            selectedIds.forEach(id => {
                dispatch(toggleMonitoredSatelliteEnabledAsync({ socket, id, enabled: true }));
            });
        }
    };

    const handleBulkDisable = () => {
        if (selectedIds.length > 0 && socket) {
            selectedIds.forEach(id => {
                dispatch(toggleMonitoredSatelliteEnabledAsync({ socket, id, enabled: false }));
            });
        }
    };

    const handleRegenerateClick = () => {
        // Start dry-run preview instead of showing confirmation
        if (selectedIds.length > 0 && socket) {
            setIsLoadingPreview(true);

            // For multiple satellites, run dry-run without specific ID
            const monitored_satellite_id = selectedIds.length === 1 ? selectedIds[0] : null;

            socket.emit('data_submission', 'regenerate-observations', {
                monitored_satellite_id,
                dry_run: true
            }, (response) => {
                setIsLoadingPreview(false);
                if (response.success && response.dry_run) {
                    setPreviewData(response);
                    setOpenPreviewDialog(true);
                } else {
                    console.error('Dry-run failed:', response.error);
                }
            });
        }
    };

    const handlePreviewConfirm = (conflictChoices) => {
        if (selectedIds.length > 0 && socket) {
            const monitored_satellite_id = selectedIds.length === 1 ? selectedIds[0] : null;

            socket.emit('data_submission', 'regenerate-observations', {
                monitored_satellite_id,
                dry_run: false,
                user_conflict_overrides: conflictChoices
            }, (response) => {
                if (response.success) {
                    console.log('Regeneration successful:', response.data);
                    setOpenPreviewDialog(false);
                    setPreviewData(null);
                } else {
                    console.error('Regeneration failed:', response.error);
                }
            });
        }
    };

    const columns = [
        {
            field: 'enabled',
            headerName: 'Enabled',
            width: 90,
            renderCell: (params) => (
                <Switch
                    checked={params.value}
                    onChange={() => handleToggleEnabled(params.row.id, params.value)}
                    size="small"
                />
            ),
        },
        {
            field: 'satellite',
            headerName: 'Satellite',
            flex: 1,
            minWidth: 150,
            valueGetter: (value, row) => row.satellite?.name || '-',
        },
        {
            field: 'min_elevation',
            headerName: 'Peak El.',
            width: 90,
            renderCell: (params) => (
                <Typography variant="body2">{params.value}°</Typography>
            ),
        },
        {
            field: 'task_start_elevation',
            headerName: 'Start El.',
            width: 90,
            renderCell: (params) => (
                <Typography variant="body2">{params.value !== undefined ? `${params.value}°` : '-'}</Typography>
            ),
        },
        {
            field: 'lookahead_hours',
            headerName: 'Lookahead',
            width: 110,
            renderCell: (params) => (
                <Typography variant="body2">{params.value}h</Typography>
            ),
        },
        {
            field: 'sdr',
            headerName: 'SDR',
            flex: 1.5,
            minWidth: 200,
            renderCell: (params) => {
                const sdr = params.row.sdr;
                if (!sdr) return '-';

                const freqMHz = sdr.center_frequency ? (sdr.center_frequency / 1000000).toFixed(2) : '?';
                const gain = (sdr.gain !== undefined && sdr.gain !== null && sdr.gain !== '') ? sdr.gain : '?';
                const antenna = sdr.antenna_port || '?';

                return (
                    <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                        {sdr.name} • {freqMHz}MHz • {gain}dB • {antenna}
                    </Typography>
                );
            },
        },
        {
            field: 'rotator',
            headerName: 'Rotator',
            width: 90,
            renderCell: (params) => {
                return params.value?.tracking_enabled ? (
                    <Chip label="Enabled" size="small" color="success" variant="outlined" />
                ) : (
                    <Typography variant="body2" color="text.secondary">-</Typography>
                );
            },
        },
        {
            field: 'tasks',
            headerName: 'Tasks',
            flex: 1,
            minWidth: 180,
            renderCell: (params) => {
                if (!params.value || params.value.length === 0) return '-';
                return (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ py: 0.5 }}>
                        {params.value.map((task, idx) => {
                            let label = '';
                            let color = 'default';

                            if (task.type === 'decoder') {
                                const decoderType = task.config.decoder_type || 'unknown';
                                const typeMap = {
                                    'lora': 'LoRa',
                                    'none': 'No Decoder'
                                };
                                label = typeMap[decoderType] || decoderType.toUpperCase();
                                color = 'primary';
                            } else if (task.type === 'audio_recording') {
                                label = 'Audio';
                                color = 'secondary';
                            } else if (task.type === 'transcription') {
                                label = 'Transcription';
                                color = 'info';
                            } else if (task.type === 'iq_recording') {
                                label = 'IQ';
                                color = 'default';
                            }

                            return (
                                <Chip
                                    key={idx}
                                    label={label}
                                    size="small"
                                    color={color}
                                    variant="filled"
                                />
                            );
                        })}
                    </Stack>
                );
            },
        },
    ];

    return (
        <Paper elevation={3} sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Typography variant="h6" gutterBottom>
                Monitored Satellites
            </Typography>

            <Alert severity="success" sx={{ mb: 2, flexShrink: 0 }}>
                <AlertTitle>Automatic Observation Generation</AlertTitle>
                Satellites in this list will automatically generate scheduled observations for all upcoming passes that meet the specified criteria (minimum elevation, lookahead window).
            </Alert>

            <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0, mt: 2 }}>
                <DataGrid
                    rows={monitoredSatellites}
                    columns={columns}
                    loading={loading}
                    checkboxSelection
                    disableSelectionOnClick
                    onRowSelectionModelChange={(newSelection) => {
                        setSelectedIds(newSelection);
                    }}
                    initialState={{
                        pagination: {
                            paginationModel: { pageSize: 10 },
                        },
                        sorting: {
                            sortModel: [{ field: 'satellite', sort: 'asc' }],
                        },
                    }}
                    pageSizeOptions={[5, 10, 25, {value: -1, label: 'All'}]}
                    localeText={{
                        noRowsLabel: 'No monitored satellites'
                    }}
                    sx={{
                        border: 0,
                        backgroundColor: 'background.paper',
                        [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                            outline: 'none',
                        },
                        [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]: {
                            outline: 'none',
                        },
                        '& .MuiDataGrid-overlay': {
                            fontSize: '0.875rem',
                            fontStyle: 'italic',
                            color: 'text.secondary',
                        },
                        '& .MuiDataGrid-cell': {
                            display: 'flex',
                            alignItems: 'center',
                        },
                    }}
                />
            </Box>

            {/* Actions below table */}
            <Stack direction="row" spacing={2} sx={{ marginTop: '15px', flexShrink: 0 }}>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleAdd}
                >
                    Add
                </Button>
                <Button
                    variant="contained"
                    startIcon={<EditIcon />}
                    onClick={() => {
                        if (selectedIds.length === 1) {
                            const monitoredSatellite = monitoredSatellites.find(ms => ms.id === selectedIds[0]);
                            if (monitoredSatellite) handleEdit(monitoredSatellite);
                        }
                    }}
                    disabled={selectedIds.length !== 1}
                >
                    Edit
                </Button>
                <Button
                    variant="contained"
                    color="success"
                    startIcon={<EnableIcon />}
                    onClick={handleBulkEnable}
                    disabled={selectedIds.length === 0}
                >
                    Enable
                </Button>
                <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<DisableIcon />}
                    onClick={handleBulkDisable}
                    disabled={selectedIds.length === 0}
                >
                    Disable
                </Button>
                <Button
                    variant="contained"
                    color="warning"
                    startIcon={<RefreshIcon />}
                    onClick={handleRegenerateClick}
                    disabled={selectedIds.length === 0 || isLoadingPreview}
                >
                    {isLoadingPreview ? 'Loading Preview...' : 'Re-Generate'}
                </Button>
                <Button
                    variant="contained"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setOpenDeleteConfirm(true)}
                    disabled={selectedIds.length === 0}
                >
                    Delete
                </Button>
            </Stack>

            {/* Delete Confirmation Dialog */}
            <Dialog open={openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)}>
                <DialogTitle>Confirm Deletion</DialogTitle>
                <DialogContent>
                    <Typography gutterBottom>
                        Are you sure you want to delete {selectedIds.length} monitored satellite(s)? This will stop automatic observation generation for these satellites.
                    </Typography>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={deleteObservations}
                                onChange={(e) => setDeleteObservations(e.target.checked)}
                                color="error"
                            />
                        }
                        label="Also delete all scheduled observations for these satellites"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        setOpenDeleteConfirm(false);
                        setDeleteObservations(false);
                    }} color="error" variant="outlined">
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={handleDelete} color="error">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Regeneration Preview Dialog */}
            <RegenerationPreviewDialog
                open={openPreviewDialog}
                onClose={() => {
                    setOpenPreviewDialog(false);
                    setPreviewData(null);
                }}
                previewData={previewData}
                onConfirm={handlePreviewConfirm}
            />
        </Paper>
    );
};

export default MonitoredSatellitesTable;
