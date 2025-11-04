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
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from './settings-elements.jsx';
import Typography from '@mui/material/Typography';
import {
    Box,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Chip,
    CircularProgress,
    Alert,
    Pagination,
    Stack,
    IconButton,
    Tooltip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from "@mui/material";
import RefreshIcon from '@mui/icons-material/Refresh';
import SortIcon from '@mui/icons-material/Sort';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../common/socket.jsx';
import { fetchFiles, setPage } from '../filebrowser/filebrowser-slice.jsx';
import { fetchSDRs } from '../hardware/sdr-slice.jsx';

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
}

function formatRelativeTime(isoDate) {
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
}

const PlaybackAccordion = ({
    expanded,
    onAccordionChange,
    isStreaming,
    selectedPlaybackRecording,
    onRecordingSelect,
}) => {
    const { t } = useTranslation('waterfall');
    const dispatch = useDispatch();
    const { socket } = useSocket();

    const {
        files,
        filesLoading,
        filesError,
        page,
        pageSize,
        total,
    } = useSelector((state) => state.filebrowser);

    // Local state for sort options
    const [sortBy, setSortBy] = useState('modified');
    const [sortOrder, setSortOrder] = useState('desc');

    // Filter only recordings from files
    const recordings = useMemo(() => files.filter(f => f.type === 'recording'), [files]);

    // Fetch recordings and SDRs when component mounts or page/sort changes
    useEffect(() => {
        if (socket && expanded) {
            // Refresh SDRs to ensure SigMF Playback SDR is available
            dispatch(fetchSDRs({ socket }));

            dispatch(fetchFiles({
                socket,
                page,
                pageSize: 5,
                sortBy,
                sortOrder,
                showRecordings: true,
                showSnapshots: false,
            }));
        }
    }, [socket, dispatch, page, sortBy, sortOrder, expanded]);

    const handleRefresh = () => {
        if (socket) {
            dispatch(fetchFiles({
                socket,
                page,
                pageSize: 5,
                sortBy,
                sortOrder,
                showRecordings: true,
                showSnapshots: false,
            }));
        }
    };

    const handlePageChange = (event, value) => {
        dispatch(setPage(value));
    };

    const handleSortChange = (event) => {
        setSortBy(event.target.value);
    };

    const totalPages = Math.ceil(total / 5);

    return (
        <Accordion expanded={expanded} onChange={onAccordionChange}>
            <AccordionSummary
                sx={{
                    boxShadow: '-1px 4px 7px #00000059',
                }}
                aria-controls="panel-playback-content"
                id="panel-playback-header"
            >
                <Typography component="span">
                    {t('playback.title', 'IQ Playback')}
                </Typography>
            </AccordionSummary>
            <AccordionDetails
                sx={{
                    backgroundColor: 'background.elevated',
                    maxHeight: '500px',
                    overflowY: 'auto',
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            {t('playback.select_recording', 'Select a recording to playback')}
                        </Typography>
                        <Tooltip title={t('playback.refresh', 'Refresh recordings')}>
                            <span>
                                <IconButton size="small" onClick={handleRefresh} disabled={filesLoading}>
                                    <RefreshIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>

                    <FormControl size="small" fullWidth>
                        <InputLabel>Sort By</InputLabel>
                        <Select
                            value={sortBy}
                            label="Sort By"
                            onChange={handleSortChange}
                            startAdornment={<SortIcon sx={{ mr: 1, ml: 1, color: 'action.active' }} />}
                        >
                            <MenuItem value="modified">Date Modified</MenuItem>
                            <MenuItem value="created">Date Created</MenuItem>
                            <MenuItem value="name">Name</MenuItem>
                            <MenuItem value="size">Size</MenuItem>
                            <MenuItem value="sample_rate">Sample Rate</MenuItem>
                        </Select>
                    </FormControl>

                    {filesError && (
                        <Alert severity="error" sx={{ mb: 1 }}>
                            {filesError}
                        </Alert>
                    )}

                    {!filesError && recordings.length === 0 && !filesLoading && (
                        <Alert severity="info">
                            {t('playback.no_recordings', 'No recordings available. Record some IQ data first!')}
                        </Alert>
                    )}

                    {!filesError && (recordings.length > 0 || filesLoading) && (
                        <>
                            <List sx={{ width: '100%', p: 0 }}>
                                {recordings.map((recording) => {
                                    const isSelected = selectedPlaybackRecording?.name === recording.name;

                                    // Calculate duration from data size and sample rate
                                    let duration = null;
                                    const sampleRate = recording.metadata?.sample_rate;
                                    const dataSize = recording.data_size;
                                    if (sampleRate && dataSize) {
                                        // Each complex sample is 8 bytes (4 bytes I + 4 bytes Q for cf32_le)
                                        const numSamples = dataSize / 8;
                                        duration = numSamples / sampleRate;
                                    }

                                    return (
                                        <ListItem
                                            key={recording.name}
                                            disablePadding
                                            sx={{
                                                mb: 0.5,
                                                border: '1px solid',
                                                borderColor: isSelected ? 'primary.main' : 'border.main',
                                                borderRadius: 1,
                                                backgroundColor: isSelected ? 'primary.dark' : 'background.paper',
                                            }}
                                        >
                                            <ListItemButton
                                                onClick={() => onRecordingSelect(recording)}
                                                disabled={isStreaming && !isSelected}
                                                selected={isSelected}
                                                sx={{ py: 0.25, px: 1 }}
                                            >
                                                <ListItemText
                                                    primary={recording.name}
                                                    secondary={
                                                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                                                            {sampleRate && (
                                                                <Chip
                                                                    label={`${(sampleRate / 1e6).toFixed(2)} MS/s`}
                                                                    size="small"
                                                                    variant="outlined"
                                                                    color="primary"
                                                                    sx={{ height: '18px', fontSize: '0.7rem' }}
                                                                />
                                                            )}
                                                            {dataSize && (
                                                                <Chip
                                                                    label={formatBytes(dataSize)}
                                                                    size="small"
                                                                    variant="outlined"
                                                                    sx={{ height: '18px', fontSize: '0.7rem' }}
                                                                />
                                                            )}
                                                            {duration && (
                                                                <Chip
                                                                    label={formatDuration(duration)}
                                                                    size="small"
                                                                    variant="outlined"
                                                                    color="error"
                                                                    sx={{ height: '18px', fontSize: '0.7rem', fontFamily: 'monospace' }}
                                                                />
                                                            )}
                                                            {recording.created && (
                                                                <Chip
                                                                    label={formatRelativeTime(recording.created)}
                                                                    size="small"
                                                                    variant="outlined"
                                                                    color="success"
                                                                    sx={{ height: '18px', fontSize: '0.7rem' }}
                                                                />
                                                            )}
                                                        </Stack>
                                                    }
                                                    primaryTypographyProps={{
                                                        fontSize: '0.9rem',
                                                        fontWeight: isSelected ? 'bold' : 'normal',
                                                    }}
                                                    secondaryTypographyProps={{
                                                        component: 'div'
                                                    }}
                                                />
                                            </ListItemButton>
                                        </ListItem>
                                    );
                                })}
                            </List>

                            {filesLoading && (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                                    <CircularProgress size={20} />
                                </Box>
                            )}

                            {totalPages > 1 && (
                                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                                    <Pagination
                                        count={totalPages}
                                        page={page}
                                        onChange={handlePageChange}
                                        size="small"
                                        color="primary"
                                        disabled={filesLoading}
                                    />
                                </Box>
                            )}
                        </>
                    )}
                </Box>
            </AccordionDetails>
        </Accordion>
    );
};

export default PlaybackAccordion;
