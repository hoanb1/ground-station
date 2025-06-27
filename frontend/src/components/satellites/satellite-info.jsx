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
import {useEffect, useState, useCallback} from "react";
import Grid from "@mui/material/Grid2";
import {
    DataGrid,
    GridActionsCellItem,
    GridToolbarContainer,
} from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import {useDispatch} from "react-redux";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import {submitTransmitter} from "./satellite-slice.jsx";
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


const SatelliteInfo = ({selectedSatellite}) => {
    const [rows, setRows] = useState([]);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [editingTransmitter, setEditingTransmitter] = useState(null);
    const [deletingTransmitter, setDeletingTransmitter] = useState(null);
    const [isNewTransmitter, setIsNewTransmitter] = useState(false);
    const dispatch = useDispatch();
    const {socket} = useSocket();

    useEffect(() => {
        if (selectedSatellite && selectedSatellite.transmitters) {
            // Map the transmitters data to rows with unique IDs
            const mappedRows = selectedSatellite.transmitters.map((transmitter, index) => ({
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
        }
    }, [selectedSatellite]);

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

    const handleDeleteConfirm = () => {
        if (deletingTransmitter) {
            const updatedRows = rows.filter((row) => row.id !== deletingTransmitter.id);
            setRows(updatedRows);
            saveTransmittersToBackend(updatedRows);
            setDeleteConfirmOpen(false);
            setDeletingTransmitter(null);
        }
    };

    const handleAddClick = () => {
        setEditingTransmitter(null);
        setIsNewTransmitter(true);
        setEditModalOpen(true);
    };

    const handleModalSave = (transmitterData) => {
        if (isNewTransmitter) {
            const newRows = [...rows, transmitterData];
            setRows(newRows);
            saveTransmittersToBackend(newRows);
        } else {
            const updatedRows = rows.map((row) =>
                row.id === transmitterData.id ? transmitterData : row
            );
            setRows(updatedRows);
            saveTransmittersToBackend(updatedRows);
        }
    };

    const saveTransmittersToBackend = useCallback((currentRows) => {
        if (!selectedSatellite || !selectedSatellite.norad_id) return;

        // Separate new and existing transmitters
        const newTransmitters = currentRows.filter(row => row.isNew);
        const existingTransmitters = currentRows.filter(row => !row.isNew);

        // Map rows back to transmitter format
        const transmitters = existingTransmitters.map(row => {
            // If we have the original data, use it as a base
            const base = row._original || {};

            return {
                ...base,
                description: row.description !== "-" ? row.description : null,
                type: row.type !== "-" ? row.type : null,
                status: row.status !== "-" ? row.status : null,
                alive: row.alive !== "-" ? row.alive : null,
                uplink_low: row.uplinkLow !== "-" ? row.uplinkLow : null,
                uplink_high: row.uplinkHigh !== "-" ? row.uplinkHigh : null,
                uplink_drift: row.uplinkDrift !== "-" ? row.uplinkDrift : null,
                downlink_low: row.downlinkLow !== "-" ? row.downlinkLow : null,
                downlink_high: row.downlinkHigh !== "-" ? row.downlinkHigh : null,
                downlink_drift: row.downlinkDrift !== "-" ? row.downlinkDrift : null,
                mode: row.mode !== "-" ? row.mode : null,
                uplink_mode: row.uplinkMode !== "-" ? row.uplinkMode : null,
                invert: row.invert !== "-" ? row.invert : null,
                baud: row.baud !== "-" ? row.baud : null,
            };
        });

        // Create new transmitter data
        const newTransmitterData = newTransmitters.map(row => ({
            norad_cat_id: selectedSatellite.norad_id,
            description: row.description !== "-" ? row.description : null,
            type: row.type !== "-" ? row.type : null,
            status: row.status !== "-" ? row.status : null,
            alive: row.alive !== "-" ? row.alive : null,
            uplink_low: row.uplinkLow !== "-" ? row.uplinkLow : null,
            uplink_high: row.uplinkHigh !== "-" ? row.uplinkHigh : null,
            uplink_drift: row.uplinkDrift !== "-" ? row.uplinkDrift : null,
            downlink_low: row.downlinkLow !== "-" ? row.downlinkLow : null,
            downlink_high: row.downlinkHigh !== "-" ? row.downlinkHigh : null,
            downlink_drift: row.downlinkDrift !== "-" ? row.downlinkDrift : null,
            mode: row.mode !== "-" ? row.mode : null,
            uplink_mode: row.uplinkMode !== "-" ? row.uplinkMode : null,
            invert: row.invert !== "-" ? row.invert : null,
            baud: row.baud !== "-" ? row.baud : null,
        }));

        if (newTransmitterData.length > 0) {
            // Update backend here
            dispatch(submitTransmitter({socket: socket, transmitterData: newTransmitterData[0]}));
        }
    }, [selectedSatellite, dispatch, socket]);

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
            {selectedSatellite ? (
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
                                    <strong>Name:</strong> <span>{selectedSatellite['name']}</span>
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
                                    <strong>NORAD ID:</strong> <span>{selectedSatellite['norad_id']}</span>
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
                                    <span>{betterStatusValue(selectedSatellite['status'])}</span>
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
                                    <span>{renderCountryFlagsCSV(selectedSatellite['countries'])}</span>
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
                                    <strong>Operator:</strong> <span>{selectedSatellite['operator'] || '-'}</span>
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
                                    <span>{betterDateTimes(selectedSatellite['launched'])}</span>
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
                                    <span>{betterDateTimes(selectedSatellite['deployed'])}</span>
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
                                    <span>{betterDateTimes(selectedSatellite['decayed'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                    }}
                                >
                                    <strong>Updated:</strong>
                                    <span>{betterDateTimes(selectedSatellite['updated'])}</span>
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
                                    src={`/satimages/${selectedSatellite['norad_id']}.png`}
                                    alt={`Satellite ${selectedSatellite['norad_id']}`}
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
                        {selectedSatellite['transmitters'] ? (
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
                        onClose={() => setEditModalOpen(false)}
                        transmitter={editingTransmitter}
                        onSave={handleModalSave}
                        satelliteId={selectedSatellite.norad_id}
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