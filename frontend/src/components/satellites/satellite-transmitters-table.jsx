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

import {Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, Stack} from "@mui/material";
import Button from "@mui/material/Button";
import * as React from "react";
import {useState} from "react";
import {
    DataGrid,
    gridClasses,
} from "@mui/x-data-grid";
import {useDispatch, useSelector} from "react-redux";
import {deleteTransmitter} from "./satellite-slice.jsx";
import {useSocket} from "../common/socket.jsx";
import TransmitterModal from "./transmitter-modal.jsx";
import { useTranslation } from 'react-i18next';

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

const paginationModel = {page: 0, pageSize: 10};

const SatelliteTransmittersTable = ({ rows, setRows, clickedSatellite }) => {
    const { t } = useTranslation('satellites');
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [editingTransmitter, setEditingTransmitter] = useState(null);
    const [isNewTransmitter, setIsNewTransmitter] = useState(false);
    const [selected, setSelected] = useState([]);
    const dispatch = useDispatch();
    const {socket} = useSocket();

    const handleAddClick = () => {
        setEditingTransmitter(null);
        setIsNewTransmitter(true);
        setEditModalOpen(true);
    };

    const handleEditClick = () => {
        const singleRowId = selected[0];
        const transmitter = rows.find(row => row.id === singleRowId);
        setEditingTransmitter(transmitter);
        setIsNewTransmitter(false);
        setEditModalOpen(true);
    };

    const handleDeleteClick = () => {
        setDeleteConfirmOpen(true);
    };

    const handleDeleteConfirm = async () => {
        try {
            // Delete all selected transmitters
            for (const selectedId of selected) {
                const transmitter = rows.find(row => row.id === selectedId);
                if (transmitter && transmitter._original?.id) {
                    await dispatch(deleteTransmitter({
                        socket,
                        transmitterId: transmitter._original.id,
                        satelliteId: clickedSatellite.norad_id,
                    })).unwrap();
                }
            }

            // Refresh the transmitters list
            const updatedTransmitters = rows.filter(row => !selected.includes(row.id));
            setRows(updatedTransmitters);
            setSelected([]);

            console.log('Transmitters deleted successfully');
        } catch (error) {
            console.error('Failed to delete transmitters:', error);
        }

        // Close the dialog regardless of success/failure
        setDeleteConfirmOpen(false);
    };

    const handleModalClose = () => {
        setEditModalOpen(false);
        setEditingTransmitter(null);
        setIsNewTransmitter(false);
    };

    const columns = [
        {field: "description", headerName: t('satellite_info.transmitters.columns.description'), flex: 1.2, minWidth: 150},
        {field: "type", headerName: t('satellite_info.transmitters.columns.type'), flex: 0.8, minWidth: 80},
        {field: "status", headerName: t('satellite_info.transmitters.columns.status'), flex: 0.8, minWidth: 80},
        {field: "alive", headerName: t('satellite_info.transmitters.columns.alive'), flex: 0.8, minWidth: 80},
        {
            field: "uplinkLow",
            headerName: t('satellite_info.transmitters.columns.uplink_low'),
            flex: 1,
            minWidth: 120,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "uplinkHigh",
            headerName: t('satellite_info.transmitters.columns.uplink_high'),
            flex: 1,
            minWidth: 120,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "uplinkDrift",
            headerName: t('satellite_info.transmitters.columns.uplink_drift'),
            flex: 1,
            minWidth: 120,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "downlinkLow",
            headerName: t('satellite_info.transmitters.columns.downlink_low'),
            flex: 1,
            minWidth: 120,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "downlinkHigh",
            headerName: t('satellite_info.transmitters.columns.downlink_high'),
            flex: 1,
            minWidth: 120,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "downlinkDrift",
            headerName: t('satellite_info.transmitters.columns.downlink_drift'),
            flex: 1,
            minWidth: 120,
            renderCell: (params) => formatFrequency(params.value)
        },
        {field: "mode", headerName: t('satellite_info.transmitters.columns.mode'), flex: 0.8, minWidth: 100},
        {field: "uplinkMode", headerName: t('satellite_info.transmitters.columns.uplink_mode'), flex: 0.9, minWidth: 110},
        {field: "invert", headerName: t('satellite_info.transmitters.columns.invert'), flex: 0.6, minWidth: 70},
        {field: "baud", headerName: t('satellite_info.transmitters.columns.baud'), flex: 0.8, minWidth: 80},
    ];

    return (
        <Box sx={{flexShrink: 0}}>
            <Typography variant="h6" component="h3" sx={{mb: 2}}>
                {t('satellite_info.transmitters.title')}
            </Typography>
            {clickedSatellite['transmitters'] ? (
                <Box sx={{width: '100%'}}>
                    <DataGrid
                        rows={rows}
                        columns={columns}
                        initialState={{pagination: {paginationModel}}}
                        pageSizeOptions={[5, 10]}
                        checkboxSelection={true}
                        onRowSelectionModelChange={(newSelected) => {
                            setSelected(newSelected);
                        }}
                        sx={{
                            border: 'none',
                            backgroundColor: 'background.paper',
                            color: 'text.primary',
                            height: '100%',
                            [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                                outline: 'none',
                            },
                            [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]:
                                {
                                    outline: 'none',
                                },
                            '& .MuiDataGrid-columnHeaders': {
                                backgroundColor: 'background.elevated',
                                color: 'text.primary',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                borderBottom: '1px solid',
                            borderColor: 'border.main',
                            },
                            '& .MuiDataGrid-cell': {
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                borderBottom: '1px solid',
                                borderColor: (theme) => theme.palette.border.main,
                            },
                            '& .MuiDataGrid-row': {
                                '&:nth-of-type(odd)': {
                                    backgroundColor: (theme) => theme.palette.overlay.light,
                                },
                                '&:hover': {
                                    backgroundColor: (theme) => theme.palette.overlay.medium,
                                },
                            },
                            '& .MuiDataGrid-footerContainer': {
                                backgroundColor: (theme) => theme.palette.background.default,
                                color: (theme) => theme.palette.text.primary,
                            },
                            '& .MuiDataGrid-selectedRowCount': {
                                color: (theme) => theme.palette.text.primary,
                            },
                            '& .MuiDataGrid-cellContent': {
                                color: (theme) => theme.palette.text.primary,
                            },
                        }}
                    />
                    <Stack direction="row" spacing={2} sx={{marginTop: 2}}>
                        <Button variant="contained" onClick={handleAddClick}>
                            {t('satellite_info.transmitters.add')}
                        </Button>
                        <Button variant="contained" disabled={selected.length !== 1} onClick={handleEditClick}>
                            {t('satellite_info.transmitters.edit')}
                        </Button>
                        <Button variant="contained" color="error" disabled={selected.length < 1}
                                onClick={handleDeleteClick}>
                            {t('satellite_info.transmitters.delete')}
                        </Button>
                        <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                            <DialogTitle>{t('satellite_info.transmitters.delete_confirm_title')}</DialogTitle>
                            <DialogContent>{t('satellite_info.transmitters.delete_confirm_message')}</DialogContent>
                            <DialogActions>
                                <Button onClick={() => setDeleteConfirmOpen(false)}>{t('satellite_info.transmitters.cancel')}</Button>
                                <Button
                                    variant="contained"
                                    color="error"
                                    onClick={handleDeleteConfirm}
                                >
                                    {t('satellite_info.transmitters.delete')}
                                </Button>
                            </DialogActions>
                        </Dialog>
                    </Stack>
                </Box>
            ) : (
                <div style={{textAlign: 'center'}}>
                    <span>{t('satellite_info.transmitters.no_data')}</span>
                </div>
            )}

            {/* Edit/Add Transmitter Modal */}
            <TransmitterModal
                open={editModalOpen}
                onClose={handleModalClose}
                transmitter={editingTransmitter}
                satelliteId={clickedSatellite.norad_id}
                isNew={isNewTransmitter}
            />
        </Box>
    );
};

export default SatelliteTransmittersTable;
