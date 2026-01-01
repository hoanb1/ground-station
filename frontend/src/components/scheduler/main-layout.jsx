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

import React, { useEffect } from 'react';
import { Box, Button, IconButton, Tooltip } from '@mui/material';
import { BugReport as BugReportIcon } from '@mui/icons-material';
import { useDispatch } from 'react-redux';
import { useSocket } from '../common/socket.jsx';
import ObservationsTable from './observations-table.jsx';
import MonitoredSatellitesTable from './monitored-satellites-table.jsx';
import ObservationFormDialog from './observation-form-dialog.jsx';
import MonitoredSatelliteDialog from './monitored-satellite-dialog.jsx';
import { observationStatusUpdated, loadSampleData } from './scheduler-slice.jsx';

export default function ScheduledObservationsLayout() {
    const dispatch = useDispatch();
    const { socket } = useSocket();

    // Listen for real-time observation status updates
    useEffect(() => {
        if (!socket) return;

        const handleStatusUpdate = (data) => {
            dispatch(observationStatusUpdated(data));
        };

        socket.on('observation-status-update', handleStatusUpdate);

        return () => {
            socket.off('observation-status-update', handleStatusUpdate);
        };
    }, [socket, dispatch]);

    return (
        <Box
            sx={{
                height: '100%',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                p: 2,
                gap: 2,
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            {/* Dev Button - Load Sample Data */}
            <Tooltip title="Load sample data for testing">
                <IconButton
                    onClick={() => dispatch(loadSampleData())}
                    sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        zIndex: 1000,
                        bgcolor: 'background.paper',
                        '&:hover': {
                            bgcolor: 'action.hover',
                        },
                    }}
                    size="small"
                >
                    <BugReportIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            {/* Monitored Satellites - Top Section */}
            <Box sx={{ height: '50%', minHeight: '450px', maxHeight: '600px' }}>
                <MonitoredSatellitesTable />
            </Box>

            {/* Scheduled Observations - Bottom Section */}
            <Box sx={{ flexGrow: 1, minHeight: '300px', overflow: 'hidden' }}>
                <ObservationsTable />
            </Box>

            <ObservationFormDialog />
            <MonitoredSatelliteDialog />
        </Box>
    );
}
