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

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Box, Typography, Chip, Tooltip, useTheme, IconButton } from '@mui/material';
import { DataGrid, gridClasses } from '@mui/x-data-grid';
import { useSelector, useDispatch } from 'react-redux';
import { getNoradFromCallsign } from '../../utils/satellite-lookup';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { alpha } from '@mui/material/styles';
import { setPacketsDrawerOpen, setPacketsDrawerHeight } from './waterfall-slice';
import TelemetryViewerDialog from '../filebrowser/telemetry-viewer-dialog.jsx';
import { toast } from 'react-toastify';

const DecodedPacketsDrawer = () => {
    const theme = useTheme();
    const dispatch = useDispatch();
    const { outputs } = useSelector((state) => state.decoders);
    const { packetsDrawerOpen, packetsDrawerHeight } = useSelector((state) => state.waterfall);

    const [isDragging, setIsDragging] = useState(false);
    const [dragStartY, setDragStartY] = useState(0);
    const [dragStartHeight, setDragStartHeight] = useState(packetsDrawerHeight);
    const [hasDragged, setHasDragged] = useState(false); // Track if user actually dragged
    const drawerRef = useRef(null);

    // Telemetry viewer state
    const [telemetryDialogOpen, setTelemetryDialogOpen] = useState(false);
    const [telemetryFile, setTelemetryFile] = useState(null);
    const [telemetryMetadata, setTelemetryMetadata] = useState(null);

    const minHeight = 150;
    const maxHeight = 600;

    // Convert outputs to table rows (limit to 100 most recent)
    const rows = useMemo(() => {
        return outputs
            .filter(output =>
                output.output?.callsigns?.from &&
                output.output?.callsigns?.to
            )
            .slice(-100) // Take last 100 entries
            .map(output => {
                const fromCallsign = output.output.callsigns.from;
                const noradId = getNoradFromCallsign(fromCallsign);

                return {
                    id: output.id,
                    timestamp: new Date(output.timestamp * 1000),
                    satelliteName: output.output.satellite?.name || '-',
                    noradId: output.output.satellite?.norad_id || noradId,
                    from: fromCallsign,
                    to: output.output.callsigns.to,
                    decoderType: output.decoder_type,
                    parser: output.output.telemetry?.parser || '-',
                    packetLength: output.output.packet_length,
                    vfo: output.vfo,
                    hasTelemetry: !!output.output.telemetry,
                    telemetry: output.output.telemetry,
                    parameters: output.output.parameters,
                    // File paths for telemetry viewer
                    filename: output.output.filename,
                    filepath: output.output.filepath,
                    metadataFilepath: output.output.metadata_filepath,
                    output: output.output, // Keep full output for handler
                };
            })
            .reverse(); // Most recent first
    }, [outputs]);

    // Handler to open telemetry viewer
    const handleOpenTelemetry = async (row) => {
        try {
            // Convert filepath from 'data/decoded/file.bin' to '/decoded/file.bin' (same as backend)
            const filename = row.filename;
            const metadataFilename = filename.replace('.bin', '.json');
            const fileUrl = `/decoded/${filename}`;
            const metadataUrl = `/decoded/${metadataFilename}`;

            // Fetch metadata from the metadata URL
            const response = await fetch(metadataUrl);

            if (!response.ok) {
                throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
            }

            const metadata = await response.json();

            // Set state to open dialog
            setTelemetryFile({
                filename: filename,
                url: fileUrl,
                type: 'decoded'
            });
            setTelemetryMetadata(metadata);
            setTelemetryDialogOpen(true);
        } catch (error) {
            toast.error(`Failed to load telemetry: ${error.message}`);
        }
    };

    const columns = [
        {
            field: 'timestamp',
            headerName: 'Time',
            minWidth: 100,
            flex: 1,
            valueFormatter: (value) => {
                return value.toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            }
        },
        {
            field: 'satelliteName',
            headerName: 'Satellite',
            minWidth: 120,
            flex: 1.5,
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <span>{params.value}</span>
                    {params.row.noradId && (
                        <span style={{ color: 'text.disabled' }}>
                            ({params.row.noradId})
                        </span>
                    )}
                </Box>
            )
        },
        {
            field: 'from',
            headerName: 'From',
            minWidth: 100,
            flex: 1,
            renderCell: (params) => (
                <span style={{ color: theme.palette.primary.main }}>
                    {params.value}
                </span>
            )
        },
        {
            field: 'to',
            headerName: 'To',
            minWidth: 100,
            flex: 1,
            renderCell: (params) => (
                <span style={{ color: theme.palette.secondary.main }}>
                    {params.value}
                </span>
            )
        },
        {
            field: 'decoderType',
            headerName: 'Decoder',
            minWidth: 80,
            flex: 0.8,
            align: 'center',
            headerAlign: 'center',
            renderCell: (params) => (
                <Chip
                    label={params.value}
                    size="small"
                    sx={{
                        height: '20px',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        backgroundColor: alpha(theme.palette.primary.main, 0.15),
                        border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                        color: 'primary.main',
                    }}
                />
            )
        },
        {
            field: 'parser',
            headerName: 'Parser',
            minWidth: 100,
            flex: 1,
            align: 'center',
            headerAlign: 'center',
            renderCell: (params) => (
                <Chip
                    label={params.value}
                    size="small"
                    sx={{
                        height: '20px',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        backgroundColor: alpha(theme.palette.secondary.main, 0.15),
                        border: `1px solid ${alpha(theme.palette.secondary.main, 0.3)}`,
                        color: 'secondary.main',
                    }}
                />
            )
        },
        {
            field: 'packetLength',
            headerName: 'Size',
            minWidth: 70,
            flex: 0.6,
            align: 'center',
            headerAlign: 'center',
            valueFormatter: (value) => `${value}B`
        },
        {
            field: 'vfo',
            headerName: 'VFO',
            minWidth: 60,
            flex: 0.5,
            align: 'center',
            headerAlign: 'center',
            renderCell: (params) => params.value ? (
                <Chip
                    label={`VFO${params.value}`}
                    size="small"
                    sx={{
                        height: '20px',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        backgroundColor: alpha(theme.palette.info.main, 0.15),
                        border: `1px solid ${alpha(theme.palette.info.main, 0.3)}`,
                        color: 'info.main',
                    }}
                />
            ) : '-'
        },
        {
            field: 'hasTelemetry',
            headerName: 'TLM',
            minWidth: 60,
            flex: 0.5,
            align: 'center',
            headerAlign: 'center',
            renderCell: (params) => params.value ? (
                <Tooltip
                    title={
                        <Box sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                            <div>Parser: {params.row.telemetry.parser}</div>
                            <div>PID: {params.row.telemetry.frame?.pid}</div>
                            <div>Format: {params.row.telemetry.data?.format || 'parsed'}</div>
                            {params.row.telemetry.data?.hex && (
                                <div>Payload: {params.row.telemetry.data.hex.substring(0, 32)}...</div>
                            )}
                        </Box>
                    }
                    placement="top"
                >
                    <Chip
                        label="✓"
                        size="small"
                        sx={{
                            height: '20px',
                            width: '30px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            backgroundColor: alpha(theme.palette.success.main, 0.15),
                            border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
                            color: 'success.main',
                        }}
                    />
                </Tooltip>
            ) : '-'
        },
        {
            field: 'parameters',
            headerName: 'Parameters',
            minWidth: 120,
            flex: 1.5,
            renderCell: (params) => (
                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: 'text.disabled' }}>
                    {params.value || '-'}
                </Typography>
            )
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 80,
            sortable: false,
            align: 'center',
            headerAlign: 'center',
            renderCell: (params) => (
                <Tooltip title="View telemetry data">
                    <IconButton
                        size="small"
                        onClick={() => handleOpenTelemetry(params.row)}
                        sx={{
                            padding: '4px',
                            '&:hover': {
                                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                            }
                        }}
                    >
                        <FolderOpenIcon sx={{ fontSize: '1rem' }} />
                    </IconButton>
                </Tooltip>
            )
        },
    ];

    const handleToggle = () => {
        // Only toggle if user didn't drag
        if (!hasDragged) {
            dispatch(setPacketsDrawerOpen(!packetsDrawerOpen));
        }
    };

    // Mouse down on handle to start dragging
    const handleMouseDown = (e) => {
        if (packetsDrawerOpen) {
            setIsDragging(true);
            setHasDragged(false); // Reset drag flag
            setDragStartY(e.clientY);
            setDragStartHeight(packetsDrawerHeight);
            e.preventDefault();
        }
    };

    // Mouse move while dragging
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDragging) {
                const deltaY = dragStartY - e.clientY; // Inverted because drawer grows upward
                const newHeight = Math.min(maxHeight, Math.max(minHeight, dragStartHeight + deltaY));

                // If moved more than 5px, consider it a drag
                if (Math.abs(deltaY) > 5) {
                    setHasDragged(true);
                }

                dispatch(setPacketsDrawerHeight(newHeight));
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            // Reset hasDragged after a short delay to allow onClick to check it
            setTimeout(() => setHasDragged(false), 100);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStartY, dragStartHeight, dispatch]);

    return (
        <Box
            ref={drawerRef}
            className="decoded-packets-drawer-container"
            sx={{
                position: 'relative',
                width: '100%',
                borderTop: `1px solid ${theme.palette.border.main}`,
                backgroundColor: theme.palette.background.paper,
                minHeight: '32px',
            }}
        >
            {/* Handle */}
            <Box
                className="decoded-packets-drawer-handle"
                onMouseDown={handleMouseDown}
                onClick={handleToggle}
                sx={{
                    height: '32px',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    backgroundColor: theme.palette.background.paper,
                    borderBottom: packetsDrawerOpen ? `1px solid ${theme.palette.border.main}` : 'none',
                    cursor: packetsDrawerOpen ? 'ns-resize' : 'pointer',
                    userSelect: 'none',
                    transition: 'background-color 0.2s',
                    '&:hover': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.08),
                    },
                }}
            >
                <DragIndicatorIcon sx={{ fontSize: '1rem', color: 'text.disabled' }} />
                {packetsDrawerOpen ? (
                    <KeyboardArrowDownIcon sx={{ fontSize: '1.2rem', color: 'text.secondary' }} />
                ) : (
                    <KeyboardArrowUpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary' }} />
                )}
                <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.5px' }}>
                    PACKETS
                </Typography>
                {packetsDrawerOpen ? (
                    <KeyboardArrowDownIcon sx={{ fontSize: '1.2rem', color: 'text.secondary' }} />
                ) : (
                    <KeyboardArrowUpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary' }} />
                )}
                <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem', color: 'text.disabled', ml: 0.5 }}>
                    ({rows.length})
                </Typography>
            </Box>

            {/* Drawer content */}
            <Box
                sx={{
                    height: packetsDrawerOpen ? `${packetsDrawerHeight}px` : '0px',
                    overflow: 'hidden',
                    backgroundColor: theme.palette.background.paper,
                }}
            >
                <Box sx={{ height: '100%', width: '100%' }}>
                    <DataGrid
                        rows={rows}
                        columns={columns}
                        density="compact"
                        disableRowSelectionOnClick
                        hideFooter
                        initialState={{
                            sorting: {
                                sortModel: [{ field: 'timestamp', sort: 'desc' }],
                            },
                        }}
                        localeText={{
                            noRowsLabel: 'No decoded packets yet',
                        }}
                        sx={{
                            border: 0,
                            backgroundColor: theme.palette.background.paper,
                            [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                                outline: 'none',
                            },
                            [`& .${gridClasses.columnHeader}`]: {
                                backgroundColor: theme.palette.background.default,
                                '&:focus, &:focus-within': {
                                    outline: 'none',
                                },
                            },
                            '& .MuiDataGrid-overlay': {
                                fontSize: '0.875rem',
                                fontStyle: 'italic',
                                color: 'text.secondary',
                            },
                        }}
                    />
                </Box>
            </Box>

            {/* Telemetry Viewer Dialog */}
            <TelemetryViewerDialog
                open={telemetryDialogOpen}
                onClose={() => setTelemetryDialogOpen(false)}
                file={telemetryFile}
                metadata={telemetryMetadata}
            />
        </Box>
    );
};

export default DecodedPacketsDrawer;
