/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
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

import {Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, TextField, InputLabel, Tooltip} from "@mui/material";
import {betterDateTimes, betterStatusValue, renderCountryFlagsCSV} from "../common/common.jsx";
import Button from "@mui/material/Button";
import * as React from "react";
import {useEffect, useState} from "react";
import Grid from "@mui/material/Grid2";
import {
    DataGrid,
    GridActionsCellItem,
    GridToolbarContainer,
} from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import {useDispatch, useSelector} from "react-redux";
import {
    deleteTransmitter,
    setClickedSatellite,
    setClickedSatelliteTransmitters
} from "./satellite-slice.jsx";
import {useSocket} from "../common/socket.jsx";
import TransmitterModal, {DeleteConfirmDialog} from "./transmitter-modal.jsx";

function EditToolbar({onAddClick}) {
    return (
        <GridToolbarContainer>
            <Button
                color="primary"
                startIcon={<AddIcon />}
                onClick={onAddClick}
            >
                Add Transmitter
            </Button>
        </GridToolbarContainer>
    );
}

// Frequency formatting function
const formatFrequency = (frequency) => {
    if (!frequency || frequency === "-" || isNaN(parseFloat(frequency))) {
        return "-";
    }

    const freq = parseFloat(frequency);

    if (freq >= 1000000000) {
        // GHz range
        const ghz = (freq / 1000000000).toFixed(3);
        return (
            <Tooltip title={`${freq.toLocaleString()} Hz`} arrow>
                <span>{ghz} GHz</span>
            </Tooltip>
        );
    } else if (freq >= 1000000) {
        // MHz range
        const mhz = (freq / 1000000).toFixed(3);
        return (
            <Tooltip title={`${freq.toLocaleString()} Hz`} arrow>
                <span>{mhz} MHz</span>
            </Tooltip>
        );
    } else if (freq >= 1000) {
        // kHz range
        const khz = (freq / 1000).toFixed(3);
        return (
            <Tooltip title={`${freq.toLocaleString()} Hz`} arrow>
                <span>{khz} kHz</span>
            </Tooltip>
        );
    } else {
        // Hz range
        return (
            <Tooltip title={`${freq.toLocaleString()} Hz`} arrow>
                <span>{freq} Hz</span>
            </Tooltip>
        );
    }
};


const SatelliteInfo = () => {
    const [rows, setRows] = useState([]);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [editingTransmitter, setEditingTransmitter] = useState(null);
    const [deletingTransmitter, setDeletingTransmitter] = useState(null);
    const [isNewTransmitter, setIsNewTransmitter] = useState(false);
    const dispatch = useDispatch();
    const {socket} = useSocket();

    // Get clickedSatellite from Redux store
    const clickedSatellite = useSelector(state => state.satellites.clickedSatellite);

    useEffect(() => {
        if (clickedSatellite && clickedSatellite.transmitters) {
            // Map the transmitters data to rows with unique IDs
            const mappedRows = clickedSatellite.transmitters.map((transmitter, index) => ({
                id: transmitter.id || `existing-${index}`,
                description: transmitter.description || "-",
                type: transmitter.type || "-",
                status: transmitter.status || "-",
                alive: transmitter.alive || "-",
                uplinkLow: transmitter.uplink_low || "-",
                uplinkHigh: transmitter.uplink_high || "-",
                uplinkDrift: transmitter.uplink_drift || "-",
                downlinkLow: transmitter.downlink_low || "-",
                downlinkHigh: transmitter.downlink_high || "-",
                downlinkDrift: transmitter.downlink_drift || "-",
                mode: transmitter.mode || "-",
                uplinkMode: transmitter.uplink_mode || "-",
                invert: transmitter.invert || "-",
                baud: transmitter.baud || "-",
                // Keep the original data for reference
                _original: transmitter,
            }));
            setRows(mappedRows);
        } else {
            setRows([]);
        }
    }, [clickedSatellite]);

    const handleEditClick = (id) => () => {
        const transmitter = rows.find(row => row.id === id);
        setEditingTransmitter(transmitter);
        setIsNewTransmitter(false);
        setEditModalOpen(true);
    };

    const handleDeleteClick = (id) => () => {
        const transmitter = rows.find(row => row.id === id);
        setDeletingTransmitter(transmitter);
        setDeleteConfirmOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (deletingTransmitter && deletingTransmitter._original?.id) {
            try {
                // Dispatch delete action to backend
                const result = await dispatch(deleteTransmitter({
                    socket,
                    transmitterId: deletingTransmitter._original.id,
                    satelliteId: clickedSatellite.norad_id,
                })).unwrap();

                dispatch(setClickedSatelliteTransmitters(result));

                console.log('Transmitter deleted successfully');
            } catch (error) {
                console.error('Failed to delete transmitter:', error);
            }
        }

        // Close the dialog regardless of success/failure
        setDeleteConfirmOpen(false);
        setDeletingTransmitter(null);
    };

    const handleAddClick = () => {
        setEditingTransmitter(null);
        setIsNewTransmitter(true);
        setEditModalOpen(true);
    };

    const handleModalClose = () => {
        setEditModalOpen(false);
        setEditingTransmitter(null);
        setIsNewTransmitter(false);
    };

    const columns = [
        {field: "description", headerName: "Description", flex: 1},
        {field: "type", headerName: "Type", flex: 1},
        {field: "status", headerName: "Status", flex: 1},
        {field: "alive", headerName: "Alive", flex: 1},
        {
            field: "uplinkLow",
            headerName: "Uplink low",
            flex: 1,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "uplinkHigh",
            headerName: "Uplink high",
            flex: 1,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "uplinkDrift",
            headerName: "Uplink drift",
            flex: 1,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "downlinkLow",
            headerName: "Downlink low",
            flex: 1,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "downlinkHigh",
            headerName: "Downlink high",
            flex: 1,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "downlinkDrift",
            headerName: "Downlink drift",
            flex: 1,
            renderCell: (params) => formatFrequency(params.value)
        },
        {field: "mode", headerName: "Mode", flex: 1},
        {field: "uplinkMode", headerName: "Uplink mode", flex: 1},
        {field: "invert", headerName: "Invert", flex: 1},
        {field: "baud", headerName: "Baud", flex: 1},
        {
            field: "actions",
            type: "actions",
            headerName: "Actions",
            width: 100,
            cellClassName: "actions",
            getActions: ({ id }) => {
                return [
                    <GridActionsCellItem
                        key="edit"
                        icon={<EditIcon />}
                        label="Edit"
                        onClick={handleEditClick(id)}
                    />,
                    <GridActionsCellItem
                        key="delete"
                        icon={<DeleteIcon />}
                        label="Delete"
                        onClick={handleDeleteClick(id)}
                    />,
                ];
            },
        },
    ];

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {clickedSatellite && clickedSatellite.name ? (
                <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                    <Grid
                        container
                        spacing={3}
                        sx={{
                            width: '100%',
                            flexDirection: {xs: 'column', md: 'row'},
                            flexShrink: 0,
                            mb: 2
                        }}
                    >
                        <Grid
                            sx={{
                                backgroundColor: '#1e1e1e',
                                borderRadius: '8px',
                                padding: 3,
                                minHeight: '300px',
                                color: '#ffffff',
                                width: {xs: '100%', md: '60%'},
                                mb: {xs: 3, md: 0},
                                boxSizing: 'border-box'
                            }}
                        >
                            <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Name:</strong> <span>{clickedSatellite['name']}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>NORAD ID:</strong> <span>{clickedSatellite['norad_id']}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Status:</strong>
                                    <span>{betterStatusValue(clickedSatellite['status'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Countries:</strong>
                                    <span>{renderCountryFlagsCSV(clickedSatellite['countries'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Operator:</strong> <span>{clickedSatellite['operator'] || '-'}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Launched:</strong>
                                    <span>{betterDateTimes(clickedSatellite['launched'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Deployed:</strong>
                                    <span>{betterDateTimes(clickedSatellite['deployed'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Decayed:</strong>
                                    <span>{betterDateTimes(clickedSatellite['decayed'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Updated:</strong>
                                    <span>{betterDateTimes(clickedSatellite['updated'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Website:</strong>
                                    <span>
                                        {clickedSatellite['website'] ? (
                                            <a href={clickedSatellite['website']} target="_blank" rel="noopener noreferrer" style={{color: '#fff'}}>
                                                {clickedSatellite['website']}
                                            </a>
                                        ) : '-'}
                                    </span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid #444444',
                                    }}
                                >
                                    <strong>Citation:</strong>
                                    <span>
                                        {clickedSatellite['citation'] ? (
                                            <a href={clickedSatellite['citation']} target="_blank" rel="noopener noreferrer" style={{color: '#fff'}}>
                                                {clickedSatellite['citation']}
                                            </a>
                                        ) : '-'}
                                    </span>
                                </Box>
                            </Box>
                        </Grid>
                        <Grid
                            sx={{
                                textAlign: 'center',
                                minHeight: '300px',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                backgroundColor: '#1e1e1e',
                                borderRadius: '8px',
                                width: {xs: '100%', md: '36%'},
                                boxSizing: 'border-box'
                            }}
                        >
                            <Box sx={{textAlign: 'right'}}>
                                <img
                                    src={`/satimages/${clickedSatellite['norad_id']}.png`}
                                    alt={`Satellite ${clickedSatellite['norad_id']}`}
                                    style={{
                                        maxWidth: '100%',
                                        height: 'auto',
                                        border: '1px solid #444444',
                                        borderRadius: '4px',
                                    }}
                                />
                            </Box>
                        </Grid>
                    </Grid>

                    {/* Transmitters section with fixed height */}
                    <Box sx={{ flexShrink: 0 }}>
                        <Typography variant="h6" component="h3" sx={{ mb: 2 }}>
                            Transmitters
                        </Typography>
                        {clickedSatellite['transmitters'] ? (
                            <Box sx={{ height: '400px', width: '100%' }}>
                                <DataGrid
                                    rows={rows}
                                    columns={columns}
                                    slots={{
                                        toolbar: EditToolbar,
                                    }}
                                    slotProps={{
                                        toolbar: { onAddClick: handleAddClick },
                                    }}
                                    sx={{
                                        border: 'none',
                                        backgroundColor: '#1e1e1e',
                                        color: '#ffffff',
                                        height: '100%',
                                        '& .MuiDataGrid-columnHeaders': {
                                            backgroundColor: '#333333',
                                            color: '#ffffff',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            borderBottom: '1px solid #444444',
                                        },
                                        '& .MuiDataGrid-cell': {
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            borderBottom: '1px solid #444444',
                                        },
                                        '& .MuiDataGrid-row': {
                                            '&:nth-of-type(odd)': {
                                                backgroundColor: '#292929',
                                            },
                                            '&:hover': {
                                                backgroundColor: '#3a3a3a',
                                            },
                                        },
                                        '& .MuiDataGrid-footerContainer': {
                                            backgroundColor: '#121212',
                                            color: '#ffffff',
                                        },
                                        '& .MuiDataGrid-cell:focus': {
                                            outline: 'none',
                                        },
                                        '& .MuiDataGrid-selectedRowCount': {
                                            color: '#ffffff',
                                        },
                                        '& .MuiDataGrid-cellContent': {
                                            color: '#ffffff',
                                        },
                                    }}
                                />
                            </Box>
                        ) : (
                            <div style={{textAlign: 'center'}}>
                                <span>No Transmitters Available</span>
                            </div>
                        )}
                    </Box>

                    {/* Edit/Add Transmitter Modal */}
                    <TransmitterModal
                        open={editModalOpen}
                        onClose={handleModalClose}
                        transmitter={editingTransmitter}
                        satelliteId={clickedSatellite.norad_id}
                        isNew={isNewTransmitter}
                    />

                    {/* Delete Confirmation Dialog */}
                    <DeleteConfirmDialog
                        open={deleteConfirmOpen}
                        onClose={() => {
                            setDeleteConfirmOpen(false);
                            setDeletingTransmitter(null);
                        }}
                        onConfirm={handleDeleteConfirm}
                        transmitterName={deletingTransmitter?.description || 'Unknown'}
                    />
                </Box>
            ) : (
                <span>No Satellite Data Available</span>
            )}
        </Box>
    );
};

export default SatelliteInfo;