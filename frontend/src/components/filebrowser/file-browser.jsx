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

import React, { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    Box,
    CircularProgress,
    Alert,
    Grid,
    Card,
    CardMedia,
    CardContent,
    CardActions,
    Typography,
    Chip,
    IconButton,
    Tooltip,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Checkbox,
    ListItemText,
    OutlinedInput,
    Pagination,
    LinearProgress,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoIcon from '@mui/icons-material/Info';
import SortIcon from '@mui/icons-material/Sort';
import FilterListIcon from '@mui/icons-material/FilterList';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import RadioIcon from '@mui/icons-material/Radio';
import StorageIcon from '@mui/icons-material/Storage';
import { useSocket } from '../common/socket.jsx';
import {
    fetchFiles,
    handleFileChange,
    deleteRecording,
    deleteSnapshot,
    setSortBy,
    toggleSortOrder,
    toggleFilter,
    setPage,
} from './filebrowser-slice.jsx';
import { toast } from 'react-toastify';

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDuration(startTime, endTime) {
    if (!startTime) return null;

    // Clean up timestamps that may have both +00:00 and Z (invalid format)
    const cleanStart = typeof startTime === 'string' ? startTime.replace(/\+00:00Z$/, 'Z') : startTime;
    const cleanEnd = typeof endTime === 'string' ? endTime.replace(/\+00:00Z$/, 'Z') : endTime;

    const start = new Date(cleanStart);
    const end = cleanEnd ? new Date(cleanEnd) : new Date();

    // Check if dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.error('Invalid date in formatDuration:', { startTime, endTime });
        return null;
    }

    const diffMs = end - start;

    if (diffMs < 0) return null;

    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function FileBrowser() {
    const dispatch = useDispatch();
    const { socket } = useSocket();

    // Get timezone preference
    const timezone = useSelector((state) => {
        const tzPref = state.preferences?.preferences?.find(p => p.name === 'timezone');
        return tzPref?.value || 'UTC';
    });

    // Timezone-aware date formatting functions
    const formatDate = (isoDate) => {
        const date = new Date(isoDate);
        return date.toLocaleString('en-US', { timeZone: timezone });
    };

    const formatRelativeTime = (isoDate) => {
        const date = new Date(isoDate);
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'just now';
        if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays === 1) return 'yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
        return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
    };

    const {
        files,
        filesLoading,
        filesError,
        page,
        pageSize,
        total,
        sortBy,
        sortOrder,
        filters,
        diskUsage,
    } = useSelector((state) => state.filebrowser);

    const [selectedItem, setSelectedItem] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);

    // Fetch data when pagination, sorting, or filters change
    useEffect(() => {
        if (socket) {
            dispatch(fetchFiles({
                socket,
                page,
                pageSize,
                sortBy,
                sortOrder,
                showRecordings: filters.showRecordings,
                showSnapshots: filters.showSnapshots,
            }));
        }
    }, [socket, dispatch, page, pageSize, sortBy, sortOrder, filters.showRecordings, filters.showSnapshots]);

    // Listen for file change events from backend
    useEffect(() => {
        if (!socket) return;

        const handleFileChangeEvent = (data) => {
            console.log('File change event received:', data);
            dispatch(handleFileChange(data));

            // Refresh the unified list
            dispatch(fetchFiles({
                socket,
                page,
                pageSize,
                sortBy,
                sortOrder,
                showRecordings: filters.showRecordings,
                showSnapshots: filters.showSnapshots,
            }));
        };

        socket.on('file_change', handleFileChangeEvent);

        return () => {
            socket.off('file_change', handleFileChangeEvent);
        };
    }, [socket, dispatch]);

    // Files are already sorted and filtered by backend
    // Just add display properties for UI
    const displayItems = useMemo(() => {
        return files.map(item => {
            const isRecording = item.type === 'recording';
            const duration = isRecording && item.metadata?.start_time
                ? formatDuration(item.metadata.start_time, item.metadata.finalized_time)
                : null;

            return {
                ...item,
                displayName: item.name || item.filename,
                image: item.type === 'recording'
                    ? (item.recording_in_progress ? null : item.snapshot?.url)
                    : item.url,
                duration,
            };
        });
    }, [files]);

    const handleSortChange = (event) => {
        dispatch(setSortBy(event.target.value));
    };

    const handleRefresh = () => {
        if (socket) {
            dispatch(fetchFiles({
                socket,
                page,
                pageSize,
                sortBy,
                sortOrder,
                showRecordings: filters.showRecordings,
                showSnapshots: filters.showSnapshots,
            }));
        }
    };

    const handlePageChange = (event, value) => {
        dispatch(setPage(value));
    };

    const handleShowDetails = (item) => {
        setSelectedItem(item);
        setDetailsOpen(true);
    };

    const handleDelete = (item) => {
        setItemToDelete(item);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (itemToDelete && socket) {
            try {
                if (itemToDelete.type === 'recording') {
                    await dispatch(deleteRecording({ socket, name: itemToDelete.name })).unwrap();
                    toast.success(`Recording "${itemToDelete.name}" deleted successfully`);
                } else {
                    await dispatch(deleteSnapshot({ socket, filename: itemToDelete.filename })).unwrap();
                    toast.success(`Snapshot "${itemToDelete.name}" deleted successfully`);
                }
                setDeleteDialogOpen(false);
                setItemToDelete(null);
            } catch (error) {
                toast.error(`Failed to delete: ${error}`);
            }
        }
    };

    const handleDownload = (item) => {
        if (item.type === 'recording') {
            window.open(item.download_urls.data, '_blank');
            setTimeout(() => {
                window.open(item.download_urls.meta, '_blank');
            }, 100);
        } else {
            window.open(item.url, '_blank');
        }
    };

    const isLoading = filesLoading;
    const hasError = filesError;

    if (isLoading && files.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 2 }}>
            <Box sx={{
                mb: 2,
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'stretch', sm: 'center' },
                gap: 2
            }}>
                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 2,
                    flex: 1
                }}>
                    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
                        <InputLabel>Sort By</InputLabel>
                        <Select
                            value={sortBy}
                            label="Sort By"
                            onChange={handleSortChange}
                            startAdornment={<SortIcon sx={{ mr: 1, color: 'action.active' }} />}
                        >
                            <MenuItem value="created">Date Created</MenuItem>
                            <MenuItem value="modified">Date Modified</MenuItem>
                            <MenuItem value="name">Name</MenuItem>
                            <MenuItem value="size">Size</MenuItem>
                            <MenuItem value="sample_rate">Sample Rate</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 } }}>
                        <InputLabel>Filter</InputLabel>
                        <Select
                            multiple
                            value={Object.keys(filters).filter(key => filters[key])}
                            input={<OutlinedInput label="Filter" />}
                            renderValue={(selected) => {
                                const labels = {
                                    showRecordings: 'Recordings',
                                    showSnapshots: 'Snapshots',
                                };
                                return selected.map(s => labels[s]).join(', ');
                            }}
                            startAdornment={<FilterListIcon sx={{ mr: 1, color: 'action.active' }} />}
                        >
                            <MenuItem value="showRecordings" onClick={() => dispatch(toggleFilter('showRecordings'))}>
                                <Checkbox checked={filters.showRecordings} />
                                <ListItemText primary="Recordings" />
                            </MenuItem>
                            <MenuItem value="showSnapshots" onClick={() => dispatch(toggleFilter('showSnapshots'))}>
                                <Checkbox checked={filters.showSnapshots} />
                                <ListItemText primary="Snapshots" />
                            </MenuItem>
                        </Select>
                    </FormControl>
                </Box>

                <Box sx={{
                    display: 'flex',
                    gap: 1,
                    flexDirection: { xs: 'row', sm: 'row' },
                    justifyContent: { xs: 'space-between', sm: 'flex-end' }
                }}>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => dispatch(toggleSortOrder())}
                        sx={{ flex: { xs: 1, sm: 'initial' } }}
                    >
                        {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<RefreshIcon />}
                        onClick={handleRefresh}
                        sx={{ flex: { xs: 1, sm: 'initial' } }}
                    >
                        Refresh
                    </Button>
                </Box>
            </Box>

            {/* Storage Information */}
            {diskUsage && diskUsage.total > 0 && (
                <Box sx={{ mb: 2, p: 2, backgroundColor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <StorageIcon sx={{ mr: 1, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                            Storage: {formatBytes(diskUsage.used)} used of {formatBytes(diskUsage.total)} ({Math.round((diskUsage.used / diskUsage.total) * 100)}%)
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                            {formatBytes(diskUsage.available)} available
                        </Typography>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={(diskUsage.used / diskUsage.total) * 100}
                        sx={{
                            height: 8,
                            borderRadius: 1,
                            backgroundColor: 'action.hover',
                            '& .MuiLinearProgress-bar': {
                                backgroundColor: diskUsage.used / diskUsage.total > 0.9 ? 'error.main' : diskUsage.used / diskUsage.total > 0.7 ? 'warning.main' : 'primary.main',
                            },
                        }}
                    />
                </Box>
            )}

            {hasError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {filesError}
                </Alert>
            )}

            {displayItems.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                        No files found
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {!filters.showRecordings && !filters.showSnapshots
                            ? 'Enable at least one filter to see files'
                            : 'Take snapshots or record IQ data from the waterfall view'}
                    </Typography>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={handleRefresh}
                    >
                        Refresh
                    </Button>
                </Box>
            ) : (
                <Grid container spacing={2}>
                    {displayItems.map((item) => {
                        const isRecording = item.type === 'recording';
                        const key = isRecording ? item.name : item.filename;

                        return (
                            <Grid item xs={12} sm={6} md={4} lg={3} key={key}>
                                <Card
                                    sx={{
                                        cursor: 'pointer',
                                        '&:hover': {
                                            boxShadow: 4,
                                        },
                                    }}
                                    onClick={() => handleShowDetails(item)}
                                >
                                    {item.image ? (
                                        <Box sx={{ position: 'relative' }}>
                                            <CardMedia
                                                component="img"
                                                height="200"
                                                image={item.image}
                                                alt={item.displayName}
                                                sx={{
                                                    objectFit: 'cover',
                                                }}
                                            />
                                            {/* Type icon overlay (top-left) */}
                                            <Box
                                                sx={{
                                                    position: 'absolute',
                                                    top: 8,
                                                    left: 8,
                                                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                                    borderRadius: '50%',
                                                    width: 32,
                                                    height: 32,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                {isRecording ? (
                                                    <FiberManualRecordIcon
                                                        sx={{
                                                            color: item.recording_in_progress ? 'error.main' : 'error.main',
                                                            fontSize: 20,
                                                            animation: item.recording_in_progress ? 'pulse 2s infinite' : 'none',
                                                            '@keyframes pulse': {
                                                                '0%, 100%': { opacity: 1 },
                                                                '50%': { opacity: 0.4 },
                                                            },
                                                        }}
                                                    />
                                                ) : (
                                                    <CameraAltIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                                                )}
                                            </Box>
                                            {/* Recording in progress badge (top-right) */}
                                            {isRecording && item.recording_in_progress && (
                                                <Box
                                                    sx={{
                                                        position: 'absolute',
                                                        top: 8,
                                                        right: 8,
                                                        backgroundColor: 'error.main',
                                                        borderRadius: 1,
                                                        px: 1,
                                                        py: 0.5,
                                                    }}
                                                >
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            color: 'white',
                                                            fontWeight: 600,
                                                            fontSize: '0.7rem',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.5px',
                                                        }}
                                                    >
                                                        Recording
                                                    </Typography>
                                                </Box>
                                            )}
                                            {/* Duration overlay (bottom-left) - only for recordings */}
                                            {isRecording && item.metadata?.start_time && (
                                                <Box
                                                    sx={{
                                                        position: 'absolute',
                                                        bottom: 8,
                                                        left: 8,
                                                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                                        borderRadius: 1,
                                                        px: 1,
                                                        py: 0.5,
                                                    }}
                                                >
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            color: 'white',
                                                            fontWeight: 500,
                                                            fontSize: '0.75rem',
                                                            fontFamily: 'monospace',
                                                        }}
                                                    >
                                                        {formatDuration(item.metadata.start_time, item.metadata.finalized_time)}
                                                    </Typography>
                                                </Box>
                                            )}
                                            {/* Date overlay (bottom-right) */}
                                            <Box
                                                sx={{
                                                    position: 'absolute',
                                                    bottom: 8,
                                                    right: 8,
                                                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                                    borderRadius: 1,
                                                    px: 1,
                                                    py: 0.5,
                                                }}
                                            >
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: 'white',
                                                        fontWeight: 500,
                                                        fontSize: '0.75rem',
                                                    }}
                                                >
                                                    {formatRelativeTime(item.created)}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    ) : (
                                        /* Placeholder for recordings in progress */
                                        isRecording && item.recording_in_progress && (
                                            <Box
                                                sx={{
                                                    height: 200,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                                    position: 'relative',
                                                }}
                                            >
                                                <RadioIcon
                                                    sx={{
                                                        fontSize: 80,
                                                        color: 'error.main',
                                                        mb: 1,
                                                        animation: 'pulse 2s infinite',
                                                        '@keyframes pulse': {
                                                            '0%, 100%': { opacity: 0.6 },
                                                            '50%': { opacity: 1 },
                                                        },
                                                    }}
                                                />
                                                <Typography variant="h6" sx={{ color: 'error.main', fontWeight: 600 }}>
                                                    Recording in Progress
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1 }}>
                                                    Waterfall snapshot will be saved on stop
                                                </Typography>
                                                {/* Recording badge (top-right) */}
                                                <Box
                                                    sx={{
                                                        position: 'absolute',
                                                        top: 8,
                                                        right: 8,
                                                        backgroundColor: 'error.main',
                                                        borderRadius: 1,
                                                        px: 1,
                                                        py: 0.5,
                                                    }}
                                                >
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            color: 'white',
                                                            fontWeight: 600,
                                                            fontSize: '0.7rem',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.5px',
                                                        }}
                                                    >
                                                        Recording
                                                    </Typography>
                                                </Box>
                                                {/* Duration overlay (bottom-left) */}
                                                {item.metadata?.start_time && (
                                                    <Box
                                                        sx={{
                                                            position: 'absolute',
                                                            bottom: 8,
                                                            left: 8,
                                                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                                            borderRadius: 1,
                                                            px: 1,
                                                            py: 0.5,
                                                        }}
                                                    >
                                                        <Typography
                                                            variant="caption"
                                                            sx={{
                                                                color: 'white',
                                                                fontWeight: 500,
                                                                fontSize: '0.75rem',
                                                                fontFamily: 'monospace',
                                                            }}
                                                        >
                                                            {formatDuration(item.metadata.start_time, null)}
                                                        </Typography>
                                                    </Box>
                                                )}
                                                {/* Date overlay (bottom-right) */}
                                                <Box
                                                    sx={{
                                                        position: 'absolute',
                                                        bottom: 8,
                                                        right: 8,
                                                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                                        borderRadius: 1,
                                                        px: 1,
                                                        py: 0.5,
                                                    }}
                                                >
                                                    <Typography
                                                        variant="caption"
                                                        sx={{
                                                            color: 'white',
                                                            fontWeight: 500,
                                                            fontSize: '0.75rem',
                                                        }}
                                                    >
                                                        {formatRelativeTime(item.created)}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        )
                                    )}
                                    <CardContent sx={{ pb: 1 }}>
                                        <Tooltip title={item.displayName}>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontFamily: 'monospace',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {item.displayName}
                                            </Typography>
                                        </Tooltip>
                                        {isRecording ? (
                                            item.metadata?.description && (
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                                    {item.metadata.description}
                                                </Typography>
                                            )
                                        ) : (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                                Ground Station Waterfall Snapshot
                                            </Typography>
                                        )}
                                        <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                                            <Chip
                                                label={formatBytes(item.data_size || item.size)}
                                                size="small"
                                                variant="outlined"
                                            />
                                            {isRecording && item.metadata?.sample_rate && (
                                                <Chip
                                                    label={`${(item.metadata.sample_rate / 1e6).toFixed(2)} MHz`}
                                                    size="small"
                                                    variant="outlined"
                                                    color="primary"
                                                />
                                            )}
                                            {isRecording && item.duration && (
                                                <Chip
                                                    label={item.duration}
                                                    size="small"
                                                    variant="outlined"
                                                    color="error"
                                                    sx={{ fontFamily: 'monospace' }}
                                                />
                                            )}
                                            {!isRecording && item.width && item.height && (
                                                <Chip
                                                    label={`${item.width}×${item.height}`}
                                                    size="small"
                                                    variant="outlined"
                                                    color="primary"
                                                />
                                            )}
                                        </Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                            {formatDate(item.modified)}
                                        </Typography>
                                    </CardContent>
                                    <CardActions sx={{ pt: 0 }} onClick={(e) => e.stopPropagation()}>
                                        {isRecording && (
                                            <Tooltip title="View Details">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleShowDetails(item)}
                                                >
                                                    <InfoIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                        <Tooltip title="Download">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleDownload(item)}
                                            >
                                                <DownloadIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={item.recording_in_progress ? "Cannot delete active recording" : "Delete"}>
                                            <span>
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={() => handleDelete(item)}
                                                    disabled={item.recording_in_progress}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </CardActions>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            )}

            {/* Pagination Controls */}
            {displayItems.length > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                    <Pagination
                        count={Math.ceil(total / pageSize)}
                        page={page}
                        onChange={handlePageChange}
                        color="primary"
                        showFirstButton
                        showLastButton
                    />
                </Box>
            )}

            {/* Recording Details Dialog */}
            {selectedItem?.type === 'recording' && (
                <Dialog
                    open={detailsOpen}
                    onClose={() => setDetailsOpen(false)}
                    maxWidth="lg"
                    fullWidth
                >
                    <DialogTitle>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6">Recording Details</Typography>
                            <Box>
                                {selectedItem?.snapshot?.width && selectedItem?.snapshot?.height && (
                                    <Chip
                                        label={`${selectedItem.snapshot.width}×${selectedItem.snapshot.height}`}
                                        size="small"
                                        sx={{ mr: 1 }}
                                    />
                                )}
                                <Chip label={formatBytes(selectedItem?.data_size || 0)} size="small" />
                            </Box>
                        </Box>
                    </DialogTitle>
                    <DialogContent>
                        {selectedItem && (
                            <Box sx={{ mt: 1 }}>
                                {selectedItem.snapshot && (
                                    <Box sx={{ mb: 2, textAlign: 'center' }}>
                                        <img
                                            src={selectedItem.snapshot.url}
                                            alt={selectedItem.name}
                                            style={{ maxWidth: '100%', height: 'auto' }}
                                        />
                                    </Box>
                                )}

                                <Typography variant="subtitle2" gutterBottom>
                                    Name
                                </Typography>
                                <Typography variant="body2" sx={{ mb: 2, fontFamily: 'monospace' }}>
                                    {selectedItem.name}
                                </Typography>

                                <Typography variant="subtitle2" gutterBottom>
                                    Files
                                </Typography>
                                <Typography variant="body2" sx={{ mb: 2, fontFamily: 'monospace' }}>
                                    {selectedItem.data_file} ({formatBytes(selectedItem.data_size)})
                                    <br />
                                    {selectedItem.meta_file}
                                    {selectedItem.snapshot && (
                                        <>
                                            <br />
                                            {selectedItem.snapshot.filename} ({selectedItem.snapshot.width}×{selectedItem.snapshot.height})
                                        </>
                                    )}
                                </Typography>

                                {selectedItem.metadata && (
                                    <>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Metadata
                                        </Typography>
                                        <Box sx={{ mb: 2, fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                            {selectedItem.metadata.datatype && (
                                                <div>Data Type: {selectedItem.metadata.datatype}</div>
                                            )}
                                            {selectedItem.metadata.sample_rate && (
                                                <div>Sample Rate: {selectedItem.metadata.sample_rate} Hz</div>
                                            )}
                                            {selectedItem.metadata.version && (
                                                <div>SigMF Version: {selectedItem.metadata.version}</div>
                                            )}
                                            {selectedItem.metadata.recorder && (
                                                <div>Recorder: {selectedItem.metadata.recorder}</div>
                                            )}
                                            {selectedItem.metadata.description && (
                                                <div>Description: {selectedItem.metadata.description}</div>
                                            )}
                                        </Box>

                                        {selectedItem.metadata.captures?.length > 0 && (
                                            <>
                                                <Typography variant="subtitle2" gutterBottom>
                                                    Captures ({selectedItem.metadata.captures.length})
                                                </Typography>
                                                <Alert severity="info" sx={{ mb: 2 }}>
                                                    {JSON.stringify(selectedItem.metadata.captures, null, 2)}
                                                </Alert>
                                            </>
                                        )}
                                    </>
                                )}
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button
                            onClick={() => window.open(selectedItem?.download_urls.data, '_blank')}
                            startIcon={<DownloadIcon />}
                        >
                            Download Data
                        </Button>
                        <Button
                            onClick={() => window.open(selectedItem?.download_urls.meta, '_blank')}
                            startIcon={<DownloadIcon />}
                        >
                            Download Metadata
                        </Button>
                        {selectedItem?.snapshot && (
                            <Button
                                onClick={() => window.open(selectedItem.snapshot.url, '_blank')}
                                startIcon={<DownloadIcon />}
                            >
                                Download Snapshot
                            </Button>
                        )}
                        <Button onClick={() => setDetailsOpen(false)}>Close</Button>
                    </DialogActions>
                </Dialog>
            )}

            {/* Snapshot Preview Dialog */}
            {selectedItem?.type === 'snapshot' && (
                <Dialog
                    open={detailsOpen}
                    onClose={() => setDetailsOpen(false)}
                    maxWidth="lg"
                    fullWidth
                >
                    <DialogTitle>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6">{selectedItem?.name}</Typography>
                            <Box>
                                {selectedItem?.width && selectedItem?.height && (
                                    <Chip
                                        label={`${selectedItem.width}×${selectedItem.height}`}
                                        size="small"
                                        sx={{ mr: 1 }}
                                    />
                                )}
                                <Chip label={formatBytes(selectedItem?.size || 0)} size="small" />
                            </Box>
                        </Box>
                    </DialogTitle>
                    <DialogContent>
                        {selectedItem && (
                            <Box sx={{ textAlign: 'center' }}>
                                <img
                                    src={selectedItem.url}
                                    alt={selectedItem.name}
                                    style={{ maxWidth: '100%', height: 'auto' }}
                                />
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                                    Created: {formatDate(selectedItem.created)}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Modified: {formatDate(selectedItem.modified)}
                                </Typography>
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => handleDownload(selectedItem)} startIcon={<DownloadIcon />}>
                            Download
                        </Button>
                        <Button onClick={() => setDetailsOpen(false)}>Close</Button>
                    </DialogActions>
                </Dialog>
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
            >
                <DialogTitle>Delete {itemToDelete?.type === 'recording' ? 'Recording' : 'Snapshot'}</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        This action cannot be undone!
                    </Alert>
                    <Typography>
                        Are you sure you want to delete <strong>{itemToDelete?.displayName || itemToDelete?.name}</strong>?
                    </Typography>
                    {itemToDelete?.type === 'recording' && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            This will delete the data file, metadata file, and snapshot.
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button onClick={confirmDelete} color="error" variant="contained">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
