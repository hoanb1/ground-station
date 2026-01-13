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
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Divider,
    CircularProgress,
    Chip,
} from '@mui/material';
import {
    InsertDriveFile as FileIcon,
    AudioFile as AudioIcon,
    Image as ImageIcon,
    VideoLibrary as VideoIcon,
    Description as TextIcon,
} from '@mui/icons-material';
import { useSocket } from '../common/socket.jsx';

const ObservationDataDialog = ({ open, onClose, observation }) => {
    const { socket } = useSocket();
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);

    // Fetch files when dialog opens
    useEffect(() => {
        if (!open || !observation?.id || !socket) {
            setFiles([]);
            return;
        }

        setLoading(true);

        // Listen for file browser response
        const handleFileBrowserState = (state) => {
            if (state.action === 'list-files') {
                // Filter files by session_id matching "internal:obs-{observation.id}"
                const sessionId = `internal:${observation.id}`;
                const matchingFiles = state.items.filter(file => file.session_id === sessionId);
                setFiles(matchingFiles);
                setLoading(false);
            }
        };

        socket.on('file_browser_state', handleFileBrowserState);

        // Request all files
        socket.emit('file_browser', 'list-files', {
            showRecordings: true,
            showSnapshots: true,
            showDecoded: true,
            showAudio: true,
            showTranscriptions: true,
        });

        return () => {
            socket.off('file_browser_state', handleFileBrowserState);
        };
    }, [open, observation?.id, socket]);

    const getFileIcon = (type) => {
        switch (type) {
            case 'audio':
                return <AudioIcon />;
            case 'snapshot':
                return <ImageIcon />;
            case 'recording':
                return <VideoIcon />;
            case 'transcription':
                return <TextIcon />;
            case 'decoded':
                return <TextIcon />;
            default:
                return <FileIcon />;
        }
    };

    const getFileTypeLabel = (type) => {
        const labels = {
            'audio': 'Audio Recording',
            'snapshot': 'Snapshot',
            'recording': 'IQ Recording',
            'transcription': 'Transcription',
            'decoded': 'Decoded Data',
        };
        return labels[type] || 'File';
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return 'N/A';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                Downloaded Data - {observation?.satellite?.name || 'Unknown'}
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        Observation ID: {observation?.id || 'N/A'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Status: {observation?.status || 'N/A'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Session ID: internal:{observation?.id || 'N/A'}
                    </Typography>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" sx={{ mb: 2 }}>
                    Data Files ({files.length})
                </Typography>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : files.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            No data files found for this observation.
                        </Typography>
                    </Box>
                ) : (
                    <List>
                        {files.map((file, index) => (
                            <ListItem key={index} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                <ListItemIcon>
                                    {getFileIcon(file.type)}
                                </ListItemIcon>
                                <ListItemText
                                    primary={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body1">{file.name || file.filename}</Typography>
                                            <Chip label={getFileTypeLabel(file.type)} size="small" />
                                        </Box>
                                    }
                                    secondary={`${formatFileSize(file.size)} • Created: ${new Date(file.created * 1000).toLocaleString()}`}
                                />
                            </ListItem>
                        ))}
                    </List>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} variant="contained">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ObservationDataDialog;
