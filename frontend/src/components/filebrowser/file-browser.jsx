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
    Stack,
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
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import DeselectIcon from '@mui/icons-material/Deselect';
import DataObjectIcon from '@mui/icons-material/DataObject';
import { useSocket } from '../common/socket.jsx';
import {
    fetchFiles,
    handleFileChange,
    deleteRecording,
    deleteSnapshot,
    deleteDecoded,
    deleteBatch,
    setSortBy,
    toggleSortOrder,
    toggleFilter,
    setPage,
    toggleItemSelection,
    selectAllItems,
    clearSelection,
    toggleSelectionMode,
} from './filebrowser-slice.jsx';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import RecordingDialog from './recording-dialog.jsx';
import TelemetryViewerDialog from './telemetry-viewer-dialog.jsx';

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
    const { t } = useTranslation('filebrowser');

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

        if (diffSecs < 60) return t('humanize.date.just_now', { ns: 'common', defaultValue: 'just now' });
        if (diffMins === 1) return t('humanize.date.minute_ago', { ns: 'common', count: diffMins, defaultValue: '1 minute ago' });
        if (diffMins < 60) return t('humanize.date.minutes_ago', { ns: 'common', count: diffMins, defaultValue: `${diffMins} minutes ago` });
        if (diffHours === 1) return t('humanize.date.hour_ago', { ns: 'common', count: diffHours, defaultValue: '1 hour ago' });
        if (diffHours < 24) return t('humanize.date.hours_ago', { ns: 'common', count: diffHours, defaultValue: `${diffHours} hours ago` });
        if (diffDays === 1) return t('humanize.date.day_ago', { ns: 'common', count: diffDays, defaultValue: '1 day ago' });
        if (diffDays < 7) return t('humanize.date.days_ago', { ns: 'common', count: diffDays, defaultValue: `${diffDays} days ago` });

        const weeks = Math.floor(diffDays / 7);
        if (diffDays < 30) {
            if (weeks === 1) return t('humanize.date.week_ago', { ns: 'common', count: weeks, defaultValue: '1 week ago' });
            return t('humanize.date.weeks_ago', { ns: 'common', count: weeks, defaultValue: `${weeks} weeks ago` });
        }

        const months = Math.floor(diffDays / 30);
        if (diffDays < 365) {
            if (months === 1) return t('humanize.date.month_ago', { ns: 'common', count: months, defaultValue: '1 month ago' });
            return t('humanize.date.months_ago', { ns: 'common', count: months, defaultValue: `${months} months ago` });
        }

        const years = Math.floor(diffDays / 365);
        if (years === 1) return t('humanize.date.year_ago', { ns: 'common', count: years, defaultValue: '1 year ago' });
        return t('humanize.date.years_ago', { ns: 'common', count: years, defaultValue: `${years} years ago` });
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
        selectedItems,
        selectionMode,
    } = useSelector((state) => state.filebrowser);

    const [selectedItem, setSelectedItem] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
    const [telemetryViewerOpen, setTelemetryViewerOpen] = useState(false);
    const [telemetryFile, setTelemetryFile] = useState(null);
    const [telemetryMetadata, setTelemetryMetadata] = useState(null);

    // Fetch data when filters change (not pagination/sorting - those are handled in UI)
    useEffect(() => {
        if (socket) {
            dispatch(fetchFiles({
                socket,
                showRecordings: filters.showRecordings,
                showSnapshots: filters.showSnapshots,
                showDecoded: filters.showDecoded,
            }));
        }
    }, [socket, dispatch, filters.showRecordings, filters.showSnapshots, filters.showDecoded]);

    // Listen for file browser state updates to trigger refetch (global handler in socket-event-handlers.jsx updates Redux)
    useEffect(() => {
        if (!socket) return;

        const handleFileBrowserState = (state) => {
            // Global handler already updated Redux state for 'list-files'
            // Here we only handle actions that need refetch
            switch (state.action) {
                case 'delete-recording':
                case 'delete-snapshot':
                case 'delete-decoded':
                case 'delete-batch':
                case 'recording-started':
                case 'recording-stopped':
                case 'snapshot-saved':
                case 'decoded-saved':
                    // Refetch files to show updated list using current filter state from Redux
                    dispatch(fetchFiles({
                        socket,
                        showRecordings: filters.showRecordings,
                        showSnapshots: filters.showSnapshots,
                        showDecoded: filters.showDecoded,
                    }));

                    // Show toast for batch delete
                    if (state.action === 'delete-batch') {
                        if (state.success_count > 0) {
                            toast.success(state.message);
                        }
                        if (state.failed_count > 0) {
                            toast.warning(t('toast.batch_delete_partial', 'Some items could not be deleted'));
                        }
                    }
                    break;
            }
        };

        socket.on('file_browser_state', handleFileBrowserState);

        return () => {
            socket.off('file_browser_state', handleFileBrowserState);
        };
    }, [socket, dispatch, filters.showRecordings, filters.showSnapshots, t]);

    // Legacy: Listen for file change events from backend
    useEffect(() => {
        if (!socket) return;

        const handleFileChangeEvent = (data) => {
            console.log('File change event received:', data);
            dispatch(handleFileChange(data));

            // Refresh the unified list using current filter state from Redux
            dispatch(fetchFiles({
                socket,
                showRecordings: filters.showRecordings,
                showSnapshots: filters.showSnapshots,
                showDecoded: filters.showDecoded,
            }));
        };

        socket.on('file_change', handleFileChangeEvent);

        return () => {
            socket.off('file_change', handleFileChangeEvent);
        };
    }, [socket, dispatch, filters.showRecordings, filters.showSnapshots, filters.showDecoded]);

    // Sort, paginate, and format files in the frontend
    const displayItems = useMemo(() => {
        // First, add display properties
        let processedFiles = files.map(item => {
            const isRecording = item.type === 'recording';
            const duration = isRecording && item.metadata?.start_time
                ? formatDuration(item.metadata.start_time, item.metadata.finalized_time)
                : null;

            // Determine if decoded file is an image
            const isImage = item.type === 'decoded' && item.file_type &&
                ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(item.file_type.toLowerCase());

            return {
                ...item,
                displayName: item.name || item.filename,
                image: item.type === 'recording'
                    ? (item.recording_in_progress ? null : item.snapshot?.url)
                    : (item.type === 'snapshot' || isImage ? item.url : null),
                duration,
            };
        });

        // Apply sorting
        const reverse = sortOrder === 'desc';
        processedFiles.sort((a, b) => {
            let aVal, bVal;

            if (sortBy === 'name') {
                aVal = a.displayName;
                bVal = b.displayName;
                return reverse
                    ? bVal.localeCompare(aVal)
                    : aVal.localeCompare(bVal);
            } else if (sortBy === 'size') {
                aVal = a.data_size || a.size || 0;
                bVal = b.data_size || b.size || 0;
            } else if (sortBy === 'created') {
                aVal = new Date(a.created).getTime();
                bVal = new Date(b.created).getTime();
            } else if (sortBy === 'modified') {
                aVal = new Date(a.modified).getTime();
                bVal = new Date(b.modified).getTime();
            } else if (sortBy === 'sample_rate') {
                aVal = a.metadata?.sample_rate || 0;
                bVal = b.metadata?.sample_rate || 0;
            } else {
                return 0;
            }

            return reverse ? bVal - aVal : aVal - bVal;
        });

        // Apply pagination
        const startIdx = (page - 1) * pageSize;
        const endIdx = startIdx + pageSize;
        return processedFiles.slice(startIdx, endIdx);
    }, [files, sortBy, sortOrder, page, pageSize]);

    const handleSortChange = (event) => {
        dispatch(setSortBy(event.target.value));
    };

    const handleRefresh = () => {
        if (socket) {
            dispatch(fetchFiles({
                socket,
                showRecordings: filters.showRecordings,
                showSnapshots: filters.showSnapshots,
                showDecoded: filters.showDecoded,
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
                    // Success toast will be shown by socket event listener
                } else if (itemToDelete.type === 'snapshot') {
                    await dispatch(deleteSnapshot({ socket, filename: itemToDelete.filename })).unwrap();
                    // Success toast will be shown by socket event listener
                } else if (itemToDelete.type === 'decoded') {
                    await dispatch(deleteDecoded({ socket, filename: itemToDelete.filename })).unwrap();
                    // Success toast will be shown by socket event listener
                }

                // No need to refetch - socket event will trigger refetch automatically

                setDeleteDialogOpen(false);
                setItemToDelete(null);
            } catch (error) {
                // Error will be shown by socket error event listener, but show local toast too
                toast.error(t('toast.delete_failed', 'Failed to delete: {{error}}', { error }));
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

    const handleViewTelemetry = async (item) => {
        if (item.type !== 'decoded') return;

        try {
            // Fetch metadata JSON file
            const metadataUrl = item.url.replace('.bin', '.json');
            const response = await fetch(metadataUrl);
            const metadata = await response.json();

            setTelemetryFile(item);
            setTelemetryMetadata(metadata);
            setTelemetryViewerOpen(true);
        } catch (error) {
            toast.error(`Failed to load telemetry metadata: ${error.message}`);
        }
    };

    const handleToggleSelection = (item) => {
        const key = item.type === 'recording' ? item.name : item.filename;
        dispatch(toggleItemSelection(key));
    };

    const handleSelectAll = () => {
        const allKeys = displayItems.map(item =>
            item.type === 'recording' ? item.name : item.filename
        );
        dispatch(selectAllItems(allKeys));
    };

    const handleClearSelection = () => {
        dispatch(clearSelection());
    };

    const handleToggleSelectionMode = () => {
        dispatch(toggleSelectionMode());
    };

    const handleBatchDelete = () => {
        if (selectedItems.length > 0) {
            setBatchDeleteDialogOpen(true);
        }
    };

    const confirmBatchDelete = async () => {
        if (selectedItems.length > 0 && socket) {
            try {
                // Build items array from selected keys
                const itemsToDelete = files
                    .filter(f => {
                        const key = f.type === 'recording' ? f.name : f.filename;
                        return selectedItems.includes(key);
                    })
                    .map(f => ({
                        type: f.type,
                        name: f.type === 'recording' ? f.name : undefined,
                        filename: (f.type === 'snapshot' || f.type === 'decoded') ? f.filename : undefined,
                    }));

                await dispatch(deleteBatch({ socket, items: itemsToDelete })).unwrap();
                setBatchDeleteDialogOpen(false);
            } catch (error) {
                toast.error(t('toast.batch_delete_failed', 'Failed to delete items: {{error}}', { error }));
            }
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
                        <InputLabel>{t('sort_by', 'Sort By')}</InputLabel>
                        <Select
                            value={sortBy}
                            label={t('sort_by', 'Sort By')}
                            onChange={handleSortChange}
                            startAdornment={<SortIcon sx={{ mr: 1, color: 'action.active' }} />}
                        >
                            <MenuItem value="created">{t('sort.created', 'Date Created')}</MenuItem>
                            <MenuItem value="modified">{t('sort.modified', 'Date Modified')}</MenuItem>
                            <MenuItem value="name">{t('sort.name', 'Name')}</MenuItem>
                            <MenuItem value="size">{t('sort.size', 'Size')}</MenuItem>
                            <MenuItem value="sample_rate">{t('sort.sample_rate', 'Sample Rate')}</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 } }}>
                        <InputLabel>{t('filter', 'Filter')}</InputLabel>
                        <Select
                            multiple
                            value={Object.keys(filters).filter(key => filters[key])}
                            input={<OutlinedInput label={t('filter', 'Filter')} />}
                            renderValue={(selected) => {
                                const labels = {
                                    showRecordings: t('filters.recordings', 'Recordings'),
                                    showSnapshots: t('filters.snapshots', 'Snapshots'),
                                    showDecoded: t('filters.decoded', 'Decoded'),
                                };
                                return selected.map(s => labels[s]).join(', ');
                            }}
                            startAdornment={<FilterListIcon sx={{ mr: 1, color: 'action.active' }} />}
                        >
                            <MenuItem value="showRecordings" onClick={() => dispatch(toggleFilter('showRecordings'))}>
                                <Checkbox checked={filters.showRecordings} />
                                <ListItemText primary={t('filters.recordings', 'Recordings')} />
                            </MenuItem>
                            <MenuItem value="showSnapshots" onClick={() => dispatch(toggleFilter('showSnapshots'))}>
                                <Checkbox checked={filters.showSnapshots} />
                                <ListItemText primary={t('filters.snapshots', 'Snapshots')} />
                            </MenuItem>
                            <MenuItem value="showDecoded" onClick={() => dispatch(toggleFilter('showDecoded'))}>
                                <Checkbox checked={filters.showDecoded} />
                                <ListItemText primary={t('filters.decoded', 'Decoded')} />
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
                        {sortOrder === 'asc' ? t('sort_order.ascending', 'Ascending') : t('sort_order.descending', 'Descending')}
                    </Button>
                    <Button
                        variant={selectionMode ? "contained" : "outlined"}
                        size="small"
                        startIcon={selectionMode ? <CheckBoxIcon /> : <CheckBoxOutlineBlankIcon />}
                        onClick={handleToggleSelectionMode}
                        sx={{ flex: { xs: 1, sm: 'initial' } }}
                    >
                        {selectionMode ? t('selection.exit', 'Exit Select') : t('selection.select', 'Select')}
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<RefreshIcon />}
                        onClick={handleRefresh}
                        sx={{ flex: { xs: 1, sm: 'initial' } }}
                    >
                        {t('refresh', 'Refresh')}
                    </Button>
                </Box>
            </Box>

            {/* Bulk Action Toolbar */}
            {selectionMode && (
                <Box sx={{
                    mb: 2,
                    p: 2,
                    backgroundColor: 'primary.main',
                    color: 'primary.contrastText',
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 2
                }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {selectedItems.length === 0
                            ? t('selection.no_items', 'No items selected')
                            : t('selection.count', '{{count}} item(s) selected', { count: selectedItems.length })
                        }
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<SelectAllIcon />}
                            onClick={handleSelectAll}
                            disabled={selectedItems.length === displayItems.length}
                            sx={{
                                color: 'primary.contrastText',
                                borderColor: 'primary.contrastText',
                                '&:hover': {
                                    borderColor: 'primary.contrastText',
                                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                }
                            }}
                        >
                            {t('selection.select_all', 'Select All')}
                        </Button>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<DeselectIcon />}
                            onClick={handleClearSelection}
                            disabled={selectedItems.length === 0}
                            sx={{
                                color: 'primary.contrastText',
                                borderColor: 'primary.contrastText',
                                '&:hover': {
                                    borderColor: 'primary.contrastText',
                                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                }
                            }}
                        >
                            {t('selection.clear', 'Clear')}
                        </Button>
                        <Button
                            variant="contained"
                            size="small"
                            color="error"
                            startIcon={<DeleteIcon />}
                            onClick={handleBatchDelete}
                            disabled={selectedItems.length === 0}
                        >
                            {t('selection.delete', 'Delete Selected')}
                        </Button>
                    </Box>
                </Box>
            )}

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
                            {files.length > 0 && (
                                <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                                    ({files.filter(f => f.type === 'recording').length}R / {files.filter(f => f.type === 'snapshot').length}S / {files.filter(f => f.type === 'decoded').length}D)
                                </Typography>
                            )}
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
                        {t('no_files.title', 'No files found')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {!filters.showRecordings && !filters.showSnapshots && !filters.showDecoded
                            ? t('no_files.message_filter', 'Enable at least one filter to see files')
                            : t('no_files.message_empty', 'Take snapshots or record IQ data from the waterfall view')}
                    </Typography>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={handleRefresh}
                    >
                        {t('refresh', 'Refresh')}
                    </Button>
                </Box>
            ) : (
                <Grid container spacing={2}>
                    {displayItems.map((item) => {
                        const isRecording = item.type === 'recording';
                        const key = isRecording ? item.name : item.filename;
                        const isSelected = selectedItems.includes(key);

                        return (
                            <Grid item xs={12} sm={6} md={4} lg={3} key={key}>
                                <Card
                                    sx={{
                                        cursor: 'pointer',
                                        position: 'relative',
                                        border: selectionMode && isSelected ? 2 : 0,
                                        borderColor: 'primary.main',
                                        '&:hover': {
                                            boxShadow: 4,
                                        },
                                    }}
                                    onClick={() => selectionMode ? handleToggleSelection(item) : handleShowDetails(item)}
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
                                            {/* Selection checkbox overlay (top-left when in selection mode) */}
                                            {selectionMode && (
                                                <Box
                                                    sx={{
                                                        position: 'absolute',
                                                        top: 8,
                                                        left: 8,
                                                        backgroundColor: isSelected ? 'primary.main' : 'rgba(255, 255, 255, 0.9)',
                                                        borderRadius: 1,
                                                        width: 32,
                                                        height: 32,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        zIndex: 10,
                                                    }}
                                                >
                                                    {isSelected ? (
                                                        <CheckBoxIcon sx={{ color: 'primary.contrastText', fontSize: 24 }} />
                                                    ) : (
                                                        <CheckBoxOutlineBlankIcon sx={{ color: 'text.secondary', fontSize: 24 }} />
                                                    )}
                                                </Box>
                                            )}
                                            {/* Type icon overlay (top-left) - hidden in selection mode */}
                                            {!selectionMode && (
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
                                                    ) : item.type === 'decoded' ? (
                                                        <DataObjectIcon sx={{ color: 'success.main', fontSize: 20 }} />
                                                    ) : (
                                                        <CameraAltIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                                                    )}
                                                </Box>
                                            )}
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
                                                        {t('recording.in_progress', 'Recording')}
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
                                                        px: 0.5,
                                                        pt: 0.125,
                                                        pb: 0.25,
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
                                                    px: 0.5,
                                                    pt: 0.125,
                                                    pb: 0.25,
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
                                        /* Placeholder for recordings without snapshots */
                                        <Box
                                            sx={{
                                                height: 200,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: isRecording && item.recording_in_progress
                                                    ? 'rgba(244, 67, 54, 0.1)'
                                                    : 'action.hover',
                                                position: 'relative',
                                            }}
                                        >
                                            {/* Selection checkbox overlay (top-left when in selection mode) */}
                                            {selectionMode && (
                                                <Box
                                                    sx={{
                                                        position: 'absolute',
                                                        top: 8,
                                                        left: 8,
                                                        backgroundColor: isSelected ? 'primary.main' : 'rgba(255, 255, 255, 0.9)',
                                                        borderRadius: 1,
                                                        width: 32,
                                                        height: 32,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        zIndex: 10,
                                                    }}
                                                >
                                                    {isSelected ? (
                                                        <CheckBoxIcon sx={{ color: 'primary.contrastText', fontSize: 24 }} />
                                                    ) : (
                                                        <CheckBoxOutlineBlankIcon sx={{ color: 'text.secondary', fontSize: 24 }} />
                                                    )}
                                                </Box>
                                            )}
                                            {isRecording && item.recording_in_progress ? (
                                                <>
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
                                                        {t('recording.in_progress_message', 'Recording in Progress')}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1 }}>
                                                        {t('recording.snapshot_message', 'Waterfall snapshot will be saved on stop')}
                                                    </Typography>
                                                </>
                                            ) : (
                                                <>
                                                    {isRecording ? (
                                                        <FiberManualRecordIcon
                                                            sx={{
                                                                fontSize: 80,
                                                                color: 'text.disabled',
                                                                mb: 1,
                                                            }}
                                                        />
                                                    ) : item.type === 'decoded' ? (
                                                        <DataObjectIcon
                                                            sx={{
                                                                fontSize: 80,
                                                                color: 'success.main',
                                                                mb: 1,
                                                            }}
                                                        />
                                                    ) : (
                                                        <CameraAltIcon
                                                            sx={{
                                                                fontSize: 80,
                                                                color: 'text.disabled',
                                                                mb: 1,
                                                            }}
                                                        />
                                                    )}
                                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                        {item.type === 'decoded'
                                                            ? (item.decoder_type ? `${item.decoder_type} file` : 'Decoded file')
                                                            : 'No snapshot available'}
                                                    </Typography>
                                                </>
                                            )}
                                            {/* Type icon overlay (top-left) - hidden in selection mode */}
                                            {!selectionMode && (
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
                                                    ) : item.type === 'decoded' ? (
                                                        <DataObjectIcon sx={{ color: 'success.main', fontSize: 20 }} />
                                                    ) : (
                                                        <CameraAltIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                                                    )}
                                                </Box>
                                            )}
                                            {/* Recording badge (top-right) */}
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
                                                        {t('recording.in_progress', 'Recording')}
                                                    </Typography>
                                                </Box>
                                            )}
                                            {/* Duration overlay (bottom-left) */}
                                            {isRecording && item.metadata?.start_time && (
                                                <Box
                                                    sx={{
                                                        position: 'absolute',
                                                        bottom: 8,
                                                        left: 8,
                                                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                                        borderRadius: 1,
                                                        px: 0.5,
                                                        pt: 0.125,
                                                        pb: 0.25,
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
                                                        {formatDuration(item.metadata.start_time, item.recording_in_progress ? null : item.metadata.finalized_time)}
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
                                                    px: 0.5,
                                                    pt: 0.125,
                                                    pb: 0.25,
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
                                        ) : item.type === 'decoded' ? (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                                {item.decoder_type ? `${item.decoder_type} decoded output` : 'Decoded file'}
                                            </Typography>
                                        ) : (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                                {t('snapshot.description', 'Ground Station Waterfall Snapshot')}
                                            </Typography>
                                        )}
                                        <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                                            <Chip
                                                label={formatBytes(item.data_size || item.size)}
                                                size="small"
                                                variant="outlined"
                                                sx={{ height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                                            />
                                            {isRecording && item.metadata?.sample_rate && (
                                                <Chip
                                                    label={`${(item.metadata.sample_rate / 1e6).toFixed(2)} MHz`}
                                                    size="small"
                                                    variant="outlined"
                                                    color="primary"
                                                    sx={{ height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                                                />
                                            )}
                                            {isRecording && item.metadata?.target_satellite_name && (
                                                <Chip
                                                    label={item.metadata.target_satellite_name}
                                                    size="small"
                                                    variant="outlined"
                                                    color="secondary"
                                                    icon={<SatelliteAltIcon />}
                                                    sx={{ height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 }, '& .MuiChip-icon': { fontSize: '0.85rem' } }}
                                                />
                                            )}
                                            {isRecording && item.duration && (
                                                <Chip
                                                    label={item.duration}
                                                    size="small"
                                                    variant="outlined"
                                                    color="error"
                                                    sx={{ height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 }, fontFamily: 'monospace' }}
                                                />
                                            )}
                                            {!isRecording && item.width && item.height && (
                                                <Chip
                                                    label={`${item.width}×${item.height}`}
                                                    size="small"
                                                    variant="outlined"
                                                    color="primary"
                                                    sx={{ height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                                                />
                                            )}
                                            {item.type === 'decoded' && item.decoder_type && (
                                                <Chip
                                                    label={item.decoder_type}
                                                    size="small"
                                                    variant="outlined"
                                                    color="success"
                                                    sx={{ height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                                                />
                                            )}
                                        </Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                            {formatDate(item.modified)}
                                        </Typography>
                                    </CardContent>
                                    <CardActions sx={{ pt: 0 }} onClick={(e) => e.stopPropagation()}>
                                        {isRecording && (
                                            <Tooltip title={t('actions.view_details', 'View Details')}>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleShowDetails(item)}
                                                >
                                                    <InfoIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                        {item.type === 'decoded' && (
                                            <Tooltip title="View Telemetry">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleViewTelemetry(item)}
                                                    color="primary"
                                                >
                                                    <DataObjectIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                        <Tooltip title={t('actions.download', 'Download')}>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleDownload(item)}
                                            >
                                                <DownloadIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={item.recording_in_progress ? t('actions.cannot_delete_active', 'Cannot delete active recording') : t('actions.delete', 'Delete')}>
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
            {total > pageSize && (
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
                <RecordingDialog
                    open={detailsOpen}
                    onClose={() => setDetailsOpen(false)}
                    recording={selectedItem}
                />
            )}

            {/* Snapshot Preview Dialog */}
            {(selectedItem?.type === 'snapshot' || selectedItem?.type === 'decoded') && (
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
                                {selectedItem?.type === 'decoded' && selectedItem?.decoder_type && (
                                    <Chip
                                        label={selectedItem.decoder_type}
                                        size="small"
                                        color="success"
                                        sx={{ mr: 1, height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                                    />
                                )}
                                {selectedItem?.width && selectedItem?.height && (
                                    <Chip
                                        label={`${selectedItem.width}×${selectedItem.height}`}
                                        size="small"
                                        sx={{ mr: 1, height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                                    />
                                )}
                                <Chip label={formatBytes(selectedItem?.size || 0)} size="small" sx={{ height: '20px', fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }} />
                            </Box>
                        </Box>
                    </DialogTitle>
                    <DialogContent>
                        {selectedItem && (
                            <Box sx={{ textAlign: 'center' }}>
                                {selectedItem.type === 'snapshot' || (selectedItem.file_type && ['.png', '.jpg', '.jpeg'].includes(selectedItem.file_type)) ? (
                                    <img
                                        src={selectedItem.url}
                                        alt={selectedItem.name}
                                        style={{ maxWidth: '100%', height: 'auto' }}
                                    />
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        Preview not available for this file type.
                                    </Typography>
                                )}
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
                <DialogTitle>
                    {itemToDelete?.type === 'recording'
                        ? t('delete_dialog.title_recording', 'Delete Recording')
                        : itemToDelete?.type === 'decoded'
                        ? t('delete_dialog.title_decoded', 'Delete Decoded File')
                        : t('delete_dialog.title_snapshot', 'Delete Snapshot')}
                </DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        {t('delete_dialog.warning', 'This action cannot be undone!')}
                    </Alert>
                    <Typography>
                        {t('delete_dialog.confirm', 'Are you sure you want to delete')} <strong>{itemToDelete?.displayName || itemToDelete?.name}</strong>?
                    </Typography>
                    {itemToDelete?.type === 'recording' && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            {t('recording.delete_message', 'This will delete the data file, metadata file, and snapshot.')}
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>{t('delete_dialog.cancel', 'Cancel')}</Button>
                    <Button onClick={confirmDelete} color="error" variant="contained">
                        {t('delete_dialog.delete', 'Delete')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Batch Delete Confirmation Dialog */}
            <Dialog
                open={batchDeleteDialogOpen}
                onClose={() => setBatchDeleteDialogOpen(false)}
            >
                <DialogTitle>{t('batch_delete_dialog.title', 'Delete Multiple Items')}</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        {t('delete_dialog.warning', 'This action cannot be undone!')}
                    </Alert>
                    <Typography>
                        {t('batch_delete_dialog.confirm', 'Are you sure you want to delete {{count}} item(s)?', { count: selectedItems.length })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {t('batch_delete_dialog.message', 'This will permanently delete all selected recordings and snapshots.')}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBatchDeleteDialogOpen(false)}>{t('delete_dialog.cancel', 'Cancel')}</Button>
                    <Button onClick={confirmBatchDelete} color="error" variant="contained">
                        {t('delete_dialog.delete', 'Delete')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Telemetry Viewer Dialog */}
            <TelemetryViewerDialog
                open={telemetryViewerOpen}
                onClose={() => setTelemetryViewerOpen(false)}
                file={telemetryFile}
                metadata={telemetryMetadata}
            />
        </Box>
    );
}
