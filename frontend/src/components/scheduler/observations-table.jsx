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
    Typography,
    Paper,
    Alert,
    AlertTitle,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import {
    Delete as DeleteIcon,
    Edit as EditIcon,
    PlayArrow as PlayIcon,
    Stop as StopIcon,
    Add as AddIcon,
    ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import { darken, lighten } from '@mui/material/styles';
import { useSocket } from '../common/socket.jsx';
import {
    fetchScheduledObservations,
    deleteScheduledObservations,
    toggleObservationEnabledLocal,
    toggleObservationEnabled,
    cancelRunningObservation,
    setSelectedObservation,
    setDialogOpen,
} from './scheduler-slice.jsx';
import { TitleBar, getTimeFromISO, humanizeFutureDateInMinutes } from '../common/common.jsx';
import Button from '@mui/material/Button';
import ObservationsTimeline from './observations-timeline-svg.jsx';

const getStatusColor = (status) => {
    switch (status) {
        case 'scheduled':
            return 'info';
        case 'running':
            return 'success';
        case 'completed':
            return 'default';
        case 'failed':
            return 'error';
        case 'cancelled':
            return 'warning';
        default:
            return 'default';
    }
};

// Time formatter component that updates every second
const TimeFormatter = React.memo(function TimeFormatter({ value }) {
    const [, setForceUpdate] = useState(0);

    // Force component to update every second
    useEffect(() => {
        const interval = setInterval(() => {
            setForceUpdate(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    if (!value || value === '-') {
        return '-';
    }

    return `${getTimeFromISO(value)} (${humanizeFutureDateInMinutes(value)})`;
});

const ObservationsTable = () => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const [selectedIds, setSelectedIds] = useState([]);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);

    const observations = useSelector((state) => state.scheduler?.observations || []);
    const loading = useSelector((state) => state.scheduler?.loading || false);
    const columnVisibility = useSelector((state) => state.scheduler?.columnVisibility || {});

    useEffect(() => {
        if (socket) {
            dispatch(fetchScheduledObservations({ socket }));
        }
    }, [socket, dispatch]);

    const handleDelete = () => {
        if (selectedIds.length > 0 && socket) {
            dispatch(deleteScheduledObservations({ socket, ids: selectedIds }));
            setSelectedIds([]);
            setOpenDeleteConfirm(false);
        }
    };

    const handleEdit = (observation) => {
        dispatch(setSelectedObservation(observation));
        dispatch(setDialogOpen(true));
    };

    const handleClone = (observation) => {
        // Create a copy of the observation without id to treat it as new
        const { id, created_at, updated_at, status, ...observationData } = observation;
        const clonedObservation = {
            ...observationData,
            name: `${observation.name} (Copy)`,
        };
        dispatch(setSelectedObservation(clonedObservation));
        dispatch(setDialogOpen(true));
    };

    const handleAdd = () => {
        dispatch(setSelectedObservation(null));
        dispatch(setDialogOpen(true));
    };

    const handleToggleEnabled = (id, currentEnabled) => {
        if (socket) {
            dispatch(toggleObservationEnabled({ socket, id, enabled: !currentEnabled }));
        }
    };

    const handleCancel = (id) => {
        if (socket) {
            dispatch(cancelRunningObservation({ socket, id }));
        }
    };

    const columns = [
        {
            field: 'enabled',
            headerName: 'Enabled',
            width: 80,
            renderCell: (params) => (
                <Switch
                    checked={params.value}
                    onChange={() => handleToggleEnabled(params.row.id, params.value)}
                    disabled={params.row.status === 'running'}
                    size="small"
                />
            ),
        },
        {
            field: 'name',
            headerName: 'Name',
            flex: 1.5,
            minWidth: 200,
        },
        {
            field: 'satellite',
            headerName: 'Satellite',
            flex: 1.1,
            minWidth: 150,
            valueGetter: (value, row) => row.satellite?.name || '-',
        },
        {
            field: 'pass_start',
            headerName: 'Pass Start',
            flex: 1.3,
            minWidth: 220,
            valueGetter: (value, row) => row.pass?.event_start || '-',
            renderCell: (params) => {
                if (!params.row.pass) return 'Geostationary';
                return <TimeFormatter value={params.value} />;
            },
        },
        {
            field: 'pass_end',
            headerName: 'Pass End',
            flex: 1.3,
            minWidth: 220,
            valueGetter: (value, row) => row.pass?.event_end || '-',
            renderCell: (params) => {
                if (!params.row.pass) return 'Always visible';
                return <TimeFormatter value={params.value} />;
            },
        },
        {
            field: 'sdr',
            headerName: 'SDR',
            flex: 1.5,
            minWidth: 180,
            renderCell: (params) => {
                if (!params.row.sdr?.name) return '-';
                const sampleRateMHz = params.row.sdr.sample_rate
                    ? (params.row.sdr.sample_rate / 1000000).toFixed(1)
                    : '?';
                return (
                    <Typography variant="body2">
                        {params.row.sdr.name} ({sampleRateMHz} MS/s)
                    </Typography>
                );
            },
        },
        {
            field: 'tasks',
            headerName: 'Tasks',
            flex: 1.2,
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
        {
            field: 'status',
            headerName: 'Status',
            width: 120,
            renderCell: (params) => (
                <Chip
                    label={params.value}
                    color={getStatusColor(params.value)}
                    size="small"
                />
            ),
        },
    ];

    return (
        <Paper elevation={3} sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Timeline View */}
            <Box sx={{ flexShrink: 0 }}>
                <ObservationsTimeline />
            </Box>

            <Typography variant="subtitle1" gutterBottom sx={{ mt: 2, fontWeight: 600, color: 'text.primary' }}>
                Scheduled Observations
            </Typography>

            <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0 }}>
                <DataGrid
                    rows={observations}
                    columns={columns}
                    loading={loading}
                    checkboxSelection
                    disableSelectionOnClick
                    onRowSelectionModelChange={(newSelection) => {
                        setSelectedIds(newSelection);
                    }}
                    getRowClassName={(params) => {
                        // Check if observation is currently happening (between start and end time)
                        const now = new Date();
                        const startTime = params.row.pass?.event_start ? new Date(params.row.pass.event_start) : null;
                        const endTime = params.row.pass?.event_end ? new Date(params.row.pass.event_end) : null;

                        if (startTime && endTime && now >= startTime && now <= endTime) {
                            return 'status-running';
                        }

                        return `status-${params.row.status}`;
                    }}
                    columnVisibilityModel={columnVisibility}
                    initialState={{
                        pagination: {
                            paginationModel: { pageSize: 25 },
                        },
                        sorting: {
                            sortModel: [{ field: 'pass_start', sort: 'asc' }],
                        },
                    }}
                    pageSizeOptions={[10, 25, 50, {value: -1, label: 'All'}]}
                    localeText={{
                        noRowsLabel: 'No scheduled observations'
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
                        [`& .${gridClasses.row}.status-running`]: {
                            backgroundColor: (theme) => theme.palette.mode === 'dark'
                                ? darken(theme.palette.success.main, 0.7)
                                : lighten(theme.palette.success.main, 0.8),
                        },
                        [`& .${gridClasses.row}.status-failed`]: {
                            backgroundColor: (theme) => theme.palette.mode === 'dark'
                                ? darken(theme.palette.error.main, 0.7)
                                : lighten(theme.palette.error.main, 0.8),
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
                            const observation = observations.find(obs => obs.id === selectedIds[0]);
                            if (observation) handleEdit(observation);
                        }
                    }}
                    disabled={selectedIds.length !== 1}
                >
                    Edit
                </Button>
                <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => {
                        if (selectedIds.length === 1) {
                            const observation = observations.find(obs => obs.id === selectedIds[0]);
                            if (observation) handleClone(observation);
                        }
                    }}
                    disabled={selectedIds.length !== 1}
                >
                    Duplicate
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
                    Are you sure you want to delete {selectedIds.length} observation(s)? This action cannot be undone.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDeleteConfirm(false)} color="error" variant="outlined">
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={handleDelete} color="error">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

        </Paper>
    );
};

export default ObservationsTable;
