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

import React from 'react';
import {
    Box,
    Typography,
    IconButton,
    Tooltip,
    Chip,
    Checkbox,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import InfoIcon from '@mui/icons-material/Info';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import SubjectIcon from '@mui/icons-material/Subject';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import { useTranslation } from 'react-i18next';

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function getLanguageFlag(langCode) {
    const flagMap = {
        'en': '🇬🇧', 'en-US': '🇺🇸', 'en-GB': '🇬🇧',
        'es': '🇪🇸', 'fr': '🇫🇷', 'de': '🇩🇪', 'it': '🇮🇹',
        'pt': '🇵🇹', 'pt-BR': '🇧🇷', 'pt-PT': '🇵🇹',
        'ru': '🇷🇺', 'zh': '🇨🇳', 'ja': '🇯🇵', 'ko': '🇰🇷',
    };
    return flagMap[langCode] || '🌐';
}

export default function FileTableView({
    filesByDay,
    selectionMode,
    selectedItems,
    onToggleSelection,
    onShowDetails,
    onDownload,
    onDelete,
    timezone,
}) {
    const { t } = useTranslation('filebrowser');

    const formatTime = (isoDate) => {
        const date = new Date(isoDate);
        return date.toLocaleTimeString('en-US', { timeZone: timezone });
    };

    const getTypeIcon = (item) => {
        if (item.type === 'recording') {
            return <FiberManualRecordIcon sx={{ color: item.recording_in_progress ? 'error.main' : 'error.main', fontSize: 20 }} />;
        } else if (item.type === 'decoded') {
            return <InsertDriveFileIcon sx={{ color: 'success.main', fontSize: 20 }} />;
        } else if (item.type === 'audio') {
            return <AudiotrackIcon sx={{ color: 'info.main', fontSize: 20 }} />;
        } else if (item.type === 'transcription') {
            return <SubjectIcon sx={{ color: 'secondary.main', fontSize: 20 }} />;
        } else {
            return <CameraAltIcon sx={{ color: 'primary.main', fontSize: 20 }} />;
        }
    };

    return (
        <Box>
            {filesByDay.map((dayGroup) => {
                return (
                    <Box key={dayGroup.dateKey} sx={{ mb: 3 }}>
                        <Box sx={{
                            p: 2,
                            backgroundColor: 'action.hover',
                            borderRadius: '4px 4px 0 0',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                {dayGroup.dateKey}
                            </Typography>
                            <Chip
                                label={`${dayGroup.files.length} file${dayGroup.files.length !== 1 ? 's' : ''}`}
                                size="small"
                                sx={{ ml: 2 }}
                            />
                        </Box>
                            <TableContainer component={Paper} elevation={0}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            {selectionMode && <TableCell padding="checkbox" sx={{ width: 50 }}></TableCell>}
                                            <TableCell sx={{ width: 50 }}></TableCell>
                                            <TableCell>Name</TableCell>
                                            <TableCell align="right">Size</TableCell>
                                            <TableCell align="right">Sample Rate</TableCell>
                                            <TableCell align="right">Duration</TableCell>
                                            <TableCell>Satellite/Type</TableCell>
                                            <TableCell>Time</TableCell>
                                            <TableCell align="right">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {dayGroup.files.map((item) => {
                                            const isRecording = item.type === 'recording';
                                            const key = isRecording ? item.name : item.filename;
                                            const isSelected = selectedItems.includes(key);

                                            return (
                                                <TableRow
                                                    key={key}
                                                    hover
                                                    selected={isSelected}
                                                    onClick={() => selectionMode ? onToggleSelection(item) : null}
                                                    sx={{
                                                        cursor: selectionMode ? 'pointer' : 'default',
                                                        height: 70, // Allow for two rows of content
                                                        '&:hover': selectionMode ? {} : {
                                                            backgroundColor: 'action.hover',
                                                        }
                                                    }}
                                                >
                                                    {selectionMode && (
                                                        <TableCell padding="checkbox">
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onChange={() => onToggleSelection(item)}
                                                            />
                                                        </TableCell>
                                                    )}
                                                    <TableCell>
                                                        <Tooltip title={item.type}>
                                                            {getTypeIcon(item)}
                                                        </Tooltip>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Box>
                                                            <Tooltip title={item.displayName}>
                                                                <Typography
                                                                    variant="body2"
                                                                    sx={{
                                                                        fontFamily: 'monospace',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        whiteSpace: 'nowrap',
                                                                        maxWidth: 300,
                                                                    }}
                                                                >
                                                                    {item.displayName}
                                                                </Typography>
                                                            </Tooltip>
                                                            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                                                                {isRecording && item.metadata?.description && (
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        {item.metadata.description}
                                                                    </Typography>
                                                                )}
                                                                {item.type === 'decoded' && item.decoder_type && (
                                                                    <Chip
                                                                        label={item.decoder_type}
                                                                        size="small"
                                                                        variant="outlined"
                                                                        color="success"
                                                                        sx={{ height: '18px', fontSize: '0.65rem' }}
                                                                    />
                                                                )}
                                                                {item.type === 'audio' && item.demodulator_type && (
                                                                    <Chip
                                                                        label={item.demodulator_type}
                                                                        size="small"
                                                                        variant="outlined"
                                                                        color="info"
                                                                        sx={{ height: '18px', fontSize: '0.65rem' }}
                                                                    />
                                                                )}
                                                                {item.type === 'audio' && item.vfo_number && (
                                                                    <Chip
                                                                        label={`VFO ${item.vfo_number}`}
                                                                        size="small"
                                                                        variant="outlined"
                                                                        sx={{ height: '18px', fontSize: '0.65rem' }}
                                                                    />
                                                                )}
                                                                {item.type === 'transcription' && item.provider && (
                                                                    <Chip
                                                                        label={item.provider}
                                                                        size="small"
                                                                        variant="outlined"
                                                                        color="secondary"
                                                                        sx={{ height: '18px', fontSize: '0.65rem' }}
                                                                    />
                                                                )}
                                                                {item.type === 'transcription' && item.language && (
                                                                    <Chip
                                                                        label={`${getLanguageFlag(item.language)} ${item.language.toUpperCase()}`}
                                                                        size="small"
                                                                        variant="outlined"
                                                                        sx={{ height: '18px', fontSize: '0.65rem' }}
                                                                    />
                                                                )}
                                                                {item.type === 'transcription' && item.vfo_number && (
                                                                    <Chip
                                                                        label={`VFO ${item.vfo_number}`}
                                                                        size="small"
                                                                        variant="outlined"
                                                                        sx={{ height: '18px', fontSize: '0.65rem' }}
                                                                    />
                                                                )}
                                                            </Box>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                            {formatBytes(item.data_size || item.size)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        {isRecording && item.metadata?.sample_rate ? (
                                                            <Typography variant="body2">
                                                                {(item.metadata.sample_rate / 1e6).toFixed(2)} MHz
                                                            </Typography>
                                                        ) : (
                                                            <Typography variant="body2" color="text.disabled">—</Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        {item.duration ? (
                                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                                {item.duration}
                                                            </Typography>
                                                        ) : item.type === 'audio' && item.duration_seconds ? (
                                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                                {Math.floor(item.duration_seconds / 60)}:{String(Math.floor(item.duration_seconds % 60)).padStart(2, '0')}
                                                            </Typography>
                                                        ) : (
                                                            <Typography variant="body2" color="text.disabled">—</Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {(isRecording && item.metadata?.target_satellite_name) ? (
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                <SatelliteAltIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                                                <Typography variant="body2">{item.metadata.target_satellite_name}</Typography>
                                                            </Box>
                                                        ) : (item.type === 'decoded' && item.satellite_name) ? (
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                <SatelliteAltIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                                                <Typography variant="body2">{item.satellite_name}</Typography>
                                                            </Box>
                                                        ) : item.type === 'decoded' && item.decoder_type ? (
                                                            <Typography variant="body2">{item.decoder_type}</Typography>
                                                        ) : item.type === 'audio' && item.demodulator_type ? (
                                                            <Typography variant="body2">{item.demodulator_type}</Typography>
                                                        ) : item.type === 'transcription' && item.provider ? (
                                                            <Typography variant="body2">{item.provider}</Typography>
                                                        ) : (
                                                            <Typography variant="body2" color="text.disabled">—</Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2">
                                                            {formatTime(item.created)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                                            <Tooltip title={t('actions.view_details', 'View Details')}>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => onShowDetails(item)}
                                                                >
                                                                    <InfoIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title={t('actions.download', 'Download')}>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => onDownload(item)}
                                                                >
                                                                    <DownloadIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title={(item.recording_in_progress || item.audioRecordingInProgress) ? t('actions.cannot_delete_active', 'Cannot delete active recording') : t('actions.delete', 'Delete')}>
                                                                <span>
                                                                    <IconButton
                                                                        size="small"
                                                                        color="error"
                                                                        onClick={() => onDelete(item)}
                                                                        disabled={item.recording_in_progress || item.audioRecordingInProgress}
                                                                    >
                                                                        <DeleteIcon fontSize="small" />
                                                                    </IconButton>
                                                                </span>
                                                            </Tooltip>
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                    </Box>
                );
            })}
        </Box>
    );
}
