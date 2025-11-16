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
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    Box,
    Typography,
    Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useSelector, useDispatch } from 'react-redux';
import { setDialogOpen } from './performance-slice.jsx';
import { useSocket } from '../common/socket.jsx';
import PerformanceFlow from './performance-flow.jsx';

const PerformanceMetricsDialog = () => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const open = useSelector((state) => state.performance.dialogOpen);
    const metrics = useSelector((state) => state.performance.latestMetrics);
    const connected = useSelector((state) => state.performance.connected);

    const handleClose = () => {
        dispatch(setDialogOpen(false));
        if (socket) {
            socket.emit('stop-monitoring');
        }
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="xl"
            fullWidth
            PaperProps={{
                sx: {
                    height: '90vh',
                    backgroundColor: (theme) => theme.palette.background?.paper || theme.palette.background.paper,
                    backgroundImage: 'none',
                }
            }}
        >
            <DialogTitle
                sx={{
                    borderBottom: 1,
                    borderColor: (theme) => theme.palette.border?.main || 'divider',
                    backgroundColor: (theme) => theme.palette.background?.elevated || theme.palette.background.default,
                }}
            >
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={2}>
                        <Typography variant="h6">Performance Metrics</Typography>
                        <Chip
                            label={connected ? 'Connected' : 'Disconnected'}
                            size="small"
                            color={connected ? 'success' : 'error'}
                        />
                    </Box>
                    <IconButton onClick={handleClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent
                dividers
                sx={{
                    backgroundColor: (theme) => theme.palette.background?.default || theme.palette.background.default,
                    borderColor: (theme) => theme.palette.border?.main || 'divider',
                    position: 'relative',
                    padding: 0,
                    height: 'calc(90vh - 80px)', // Account for title height
                }}
            >
                {!metrics ? (
                    <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                        <Typography variant="body1" color="text.secondary">
                            Waiting for metrics data...
                        </Typography>
                    </Box>
                ) : (
                    <PerformanceFlow metrics={metrics} />
                )}
            </DialogContent>
        </Dialog>
    );
};

export default PerformanceMetricsDialog;
