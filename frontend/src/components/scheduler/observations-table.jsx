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
import { DataGrid, gridClasses, useGridApiRef } from '@mui/x-data-grid';
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
    ToggleButton,
    ToggleButtonGroup,
} from '@mui/material';
import {
    Delete as DeleteIcon,
    Edit as EditIcon,
    PlayArrow as PlayIcon,
    Stop as StopIcon,
    Add as AddIcon,
    ContentCopy as ContentCopyIcon,
    CheckCircle as EnableIcon,
    Cancel as DisableIcon,
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
    toggleStatusFilter,
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
    const apiRef = useGridApiRef();
    const [selectedIds, setSelectedIds] = useState([]);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [openStopConfirm, setOpenStopConfirm] = useState(false);

    const allObservations = useSelector((state) => state.scheduler?.observations || []);
    const loading = useSelector((state) => state.scheduler?.loading || false);
    const columnVisibility = useSelector((state) => state.scheduler?.columnVisibility || {});
    const statusFilters = useSelector((state) => state.scheduler?.statusFilters || {});

    // Filter observations based on status filters
    const observations = allObservations.filter(obs => statusFilters[obs.status]);

    useEffect(() => {
        if (socket) {
            dispatch(fetchScheduledObservations({ socket }));
        }
    }, [socket, dispatch]);

    // Force row className re-evaluation every second to update colors in real-time
    useEffect(() => {
        const intervalId = setInterval(() => {
            const rowIds = apiRef.current.getAllRowIds();
            rowIds.forEach((rowId) => {
                const rowNode = apiRef.current.getRowNode(rowId);
                if (!rowNode) {
                    return;
                }
                // Trigger row update to force getRowClassName re-evaluation
                apiRef.current.updateRows([{
                    id: rowId,
                    _rowClassName: ''
                }]);
            });
        }, 1000);

        return () => {
            clearInterval(intervalId);
        };
    }, []);

    const handleDelete = () => {
        if (selectedIds.length > 0 && socket) {
            dispatch(deleteScheduledObservations({ socket, ids: selectedIds }));
            setSelectedIds([]);
            setOpenDeleteConfirm(false);
        }
    };

    const handleStop = () => {
        if (selectedIds.length > 0 && socket) {
            // Stop all selected observations
            selectedIds.forEach(id => {
                handleCancel(id);
            });
            setOpenStopConfirm(false);
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

    const handleBulkEnable = () => {
        if (selectedIds.length > 0 && socket) {
            selectedIds.forEach(id => {
                const observation = allObservations.find(obs => obs.id === id);
                // Only enable if not running
                if (observation && observation.status !== 'running') {
                    dispatch(toggleObservationEnabled({ socket, id, enabled: true }));
                }
            });
        }
    };

    const handleBulkDisable = () => {
        if (selectedIds.length > 0 && socket) {
            selectedIds.forEach(id => {
                const observation = allObservations.find(obs => obs.id === id);
                // Only disable if not running
                if (observation && observation.status !== 'running') {
                    dispatch(toggleObservationEnabled({ socket, id, enabled: false }));
                }
            });
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
            field: 'satellite',
            headerName: 'Satellite',
            flex: 1.1,
            minWidth: 150,
            valueGetter: (value, row) => row.satellite?.name || '-',
        },
        {
            field: 'pass_start',
            headerName: 'AOS',
            flex: 1.2,
            minWidth: 180,
            valueGetter: (value, row) => row.pass?.event_start || '-',
            renderCell: (params) => {
                if (!params.row.pass) return 'Geostationary';
                return <TimeFormatter value={params.value} />;
            },
        },
        {
            field: 'task_start',
            headerName: 'Task Start',
            flex: 1.2,
            minWidth: 180,
            valueGetter: (value, row) => row.task_start || row.pass?.event_start || '-',
            renderCell: (params) => {
                if (!params.row.pass) return '-';
                return <TimeFormatter value={params.value} />;
            },
        },
        {
            field: 'task_end',
            headerName: 'Task End',
            flex: 1.2,
            minWidth: 180,
            valueGetter: (value, row) => row.task_end || row.pass?.event_end || '-',
            renderCell: (params) => {
                if (!params.row.pass) return '-';
                return <TimeFormatter value={params.value} />;
            },
        },
        {
            field: 'pass_end',
            headerName: 'LOS',
            flex: 1.2,
            minWidth: 180,
            valueGetter: (value, row) => row.pass?.event_end || '-',
            renderCell: (params) => {
                if (!params.row.pass) return 'Always visible';
                return <TimeFormatter value={params.value} />;
            },
        },
        {
            field: 'sdr',
            headerName: 'SDR',
            flex: 1.8,
            minWidth: 220,
            renderCell: (params) => {
                const sdr = params.row.sdr;
                if (!sdr?.name) return '-';

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

            {/* Title and Status Filters */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2, mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    Scheduled Observations
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                    {Object.entries(statusFilters).map(([status, enabled]) => (
                        <Chip
                            key={status}
                            label={status.charAt(0).toUpperCase() + status.slice(1)}
                            color={enabled ? getStatusColor(status) : 'default'}
                            variant={enabled ? 'filled' : 'outlined'}
                            onClick={() => dispatch(toggleStatusFilter(status))}
                            size="small"
                            sx={{
                                cursor: 'pointer',
                                opacity: enabled ? 1 : 0.5,
                            }}
                        />
                    ))}
                </Stack>
            </Stack>

            <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0 }}>
                <DataGrid
                    apiRef={apiRef}
                    rows={observations}
                    columns={columns}
                    loading={loading}
                    checkboxSelection
                    disableSelectionOnClick
                    onRowSelectionModelChange={(newSelection) => {
                        setSelectedIds(newSelection);
                    }}
                    getRowClassName={(params) => {
                        // If cancelled, always show as cancelled regardless of time
                        if (params.row.status === 'cancelled') {
                            return 'status-cancelled';
                        }

                        // Check if satellite is currently visible (between AOS and LOS)
                        const now = new Date();
                        const aosTime = params.row.pass?.event_start ? new Date(params.row.pass.event_start) : null;
                        const losTime = params.row.pass?.event_end ? new Date(params.row.pass.event_end) : null;

                        // Satellite is currently visible (above horizon)
                        if (aosTime && losTime && now >= aosTime && now <= losTime) {
                            return 'status-running';
                        }

                        // Pass has completed (satellite has set below horizon)
                        if (losTime && now > losTime) {
                            return 'status-past';
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
                        [`& .${gridClasses.row}.status-past`]: {
                            backgroundColor: (theme) => theme.palette.mode === 'dark'
                                ? 'rgba(255, 255, 255, 0.05)'
                                : 'rgba(0, 0, 0, 0.04)',
                            opacity: 0.6,
                            textDecoration: 'line-through',
                        },
                        [`& .${gridClasses.row}.status-cancelled`]: {
                            backgroundColor: (theme) => theme.palette.mode === 'dark'
                                ? 'rgba(255, 255, 255, 0.05)'
                                : 'rgba(0, 0, 0, 0.04)',
                            opacity: 0.6,
                            textDecoration: 'line-through',
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
            <Stack direction="row" spacing={2} sx={{ marginTop: '15px', flexShrink: 0, flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    onClick={handleAdd}
                    sx={{
                        minWidth: 'auto',
                        px: { xs: 1, md: 2 }
                    }}
                >
                    <AddIcon sx={{ display: { xs: 'block', md: 'none' } }} />
                    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
                        <AddIcon sx={{ mr: 1 }} />
                        Add
                    </Box>
                </Button>
                <Button
                    variant="contained"
                    onClick={() => {
                        if (selectedIds.length === 1) {
                            const observation = allObservations.find(obs => obs.id === selectedIds[0]);
                            if (observation) handleEdit(observation);
                        }
                    }}
                    disabled={selectedIds.length !== 1}
                    sx={{
                        minWidth: 'auto',
                        px: { xs: 1, md: 2 }
                    }}
                >
                    <EditIcon sx={{ display: { xs: 'block', md: 'none' } }} />
                    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
                        <EditIcon sx={{ mr: 1 }} />
                        Edit
                    </Box>
                </Button>
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => {
                        if (selectedIds.length === 1) {
                            const observation = allObservations.find(obs => obs.id === selectedIds[0]);
                            if (observation) handleClone(observation);
                        }
                    }}
                    disabled={selectedIds.length !== 1}
                    sx={{
                        minWidth: 'auto',
                        px: { xs: 1, md: 2 }
                    }}
                >
                    <ContentCopyIcon sx={{ display: { xs: 'block', md: 'none' } }} />
                    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
                        <ContentCopyIcon sx={{ mr: 1 }} />
                        Duplicate
                    </Box>
                </Button>
                <Button
                    variant="contained"
                    color="success"
                    onClick={handleBulkEnable}
                    disabled={
                        selectedIds.length === 0 ||
                        selectedIds.every(id =>
                            allObservations.find(obs => obs.id === id && obs.status === 'running')
                        )
                    }
                    sx={{
                        minWidth: 'auto',
                        px: { xs: 1, md: 2 }
                    }}
                >
                    <EnableIcon sx={{ display: { xs: 'block', md: 'none' } }} />
                    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
                        <EnableIcon sx={{ mr: 1 }} />
                        Enable
                    </Box>
                </Button>
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={handleBulkDisable}
                    disabled={
                        selectedIds.length === 0 ||
                        selectedIds.every(id =>
                            allObservations.find(obs => obs.id === id && obs.status === 'running')
                        )
                    }
                    sx={{
                        minWidth: 'auto',
                        px: { xs: 1, md: 2 }
                    }}
                >
                    <DisableIcon sx={{ display: { xs: 'block', md: 'none' } }} />
                    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
                        <DisableIcon sx={{ mr: 1 }} />
                        Disable
                    </Box>
                </Button>
                <Button
                    variant="contained"
                    color="warning"
                    onClick={() => setOpenStopConfirm(true)}
                    disabled={
                        selectedIds.length === 0 ||
                        !selectedIds.some(id =>
                            allObservations.find(obs =>
                                obs.id === id &&
                                (obs.status === 'running' || obs.status === 'scheduled')
                            )
                        )
                    }
                    sx={{
                        minWidth: 'auto',
                        px: { xs: 1, md: 2 }
                    }}
                >
                    <StopIcon sx={{ display: { xs: 'block', md: 'none' } }} />
                    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
                        <StopIcon sx={{ mr: 1 }} />
                        Stop
                    </Box>
                </Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={() => setOpenDeleteConfirm(true)}
                    disabled={selectedIds.length === 0}
                    sx={{
                        minWidth: 'auto',
                        px: { xs: 1, md: 2 }
                    }}
                >
                    <DeleteIcon sx={{ display: { xs: 'block', md: 'none' } }} />
                    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
                        <DeleteIcon sx={{ mr: 1 }} />
                        Delete
                    </Box>
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

            {/* Stop Confirmation Dialog */}
            <Dialog open={openStopConfirm} onClose={() => setOpenStopConfirm(false)}>
                <DialogTitle>Stop Observation{selectedIds.length > 1 ? 's' : ''}</DialogTitle>
                <DialogContent>
                    {selectedIds.length === 1 ? (
                        (() => {
                            const obs = allObservations.find(o => o.id === selectedIds[0]);
                            return obs ? (
                                <>
                                    Are you sure you want to stop the observation <strong>{obs.satellite?.name || 'Unknown'}</strong>?
                                    <br /><br />
                                    This will immediately stop the observation and remove all scheduled jobs.
                                </>
                            ) : null;
                        })()
                    ) : (
                        <>
                            Are you sure you want to stop {selectedIds.length} observation(s)?
                            <br /><br />
                            This will immediately stop all selected observations and remove their scheduled jobs.
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenStopConfirm(false)} variant="outlined">
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={handleStop} color="warning">
                        Stop
                    </Button>
                </DialogActions>
            </Dialog>

        </Paper>
    );
};

export default ObservationsTable;
