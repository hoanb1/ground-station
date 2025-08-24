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


import * as React from 'react';
import Box from '@mui/material/Box';
import {
    Alert,
    AlertTitle,
    Button,
    DialogContentText,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    TextField
} from "@mui/material";
import Stack from "@mui/material/Stack";
import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from 'react-redux';
import {
    fetchRigs,
    deleteRigs,
    setSelected,
    submitOrEditRig,
    setOpenDeleteConfirm,
    setFormValues,
    setOpenAddDialog,
} from './rig-slice.jsx';
import {enqueueSnackbar} from "notistack";
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import {humanizeFrequency} from "../common/common.jsx";
import {useEffect} from "react";
import Paper from "@mui/material/Paper";


export default function RigTable() {
    const dispatch = useDispatch();
    const {socket} = useSocket();
    const {rigs, loading, selected, openDeleteConfirm, formValues, openAddDialog} = useSelector((state) => state.rigs);

    const defaultRig = {
        id: null,
        name: '',
        host: 'localhost',
        port: 4532,
        radiotype: 'rx',
        pttstatus: 'normal',
        vfotype: 'normal',
        lodown: 0,
        loup: 0,
    };
    const [pageSize, setPageSize] = React.useState(10);

    const columns = [
        {field: 'name', headerName: 'Name', flex: 1, minWidth: 150},
        {field: 'host', headerName: 'Host', flex: 1, minWidth: 150},
        {
            field: 'port',
            headerName: 'Port',
            type: 'number',
            flex: 1,
            minWidth: 80,
            align: 'right',
            headerAlign: 'right',
            valueFormatter: (value) => {
                return value;
            }
        },
        {field: 'radiotype', headerName: 'Radio Type', flex: 1, minWidth: 150},
        {field: 'pttstatus', headerName: 'PTT Status', flex: 1, minWidth: 150},
        {field: 'vfotype', headerName: 'VFO Type', flex: 1, minWidth: 50},
        {
            field: 'lodown', headerName: 'LO Down', type: 'string', flex: 1, minWidth: 60,
            valueFormatter: (value) => {
                return humanizeFrequency(value);
            }
        },
        {
            field: 'loup', headerName: 'LO Up', type: 'string', flex: 1, minWidth: 60,
            valueFormatter: (value) => {
                return humanizeFrequency(value);
            }
        },
    ];

    // useEffect(() => {
    //     dispatch(fetchRigs({socket}));
    // }, [dispatch]);

    function handleFormSubmit() {
        if (formValues.id) {
            dispatch(submitOrEditRig({socket, formValues}))
                .unwrap()
                .then(() => {
                    enqueueSnackbar('Rig edited successfully', {
                        variant: 'success',
                        autoHideDuration: 5000
                    });
                })
                .catch((error) => {
                    enqueueSnackbar('Error editing rig', {
                        variant: 'error',
                        autoHideDuration: 5000
                    })
                });
        } else {
            dispatch(submitOrEditRig({socket, formValues}))
                .unwrap()
                .then(() => {
                    enqueueSnackbar('Rig added successfully', {variant: 'success', autoHideDuration: 5000});
                })
                .catch((error) => {
                    enqueueSnackbar(`Error adding rig: ${error}`, {
                        variant: 'error',
                        autoHideDuration: 5000
                    })
                });
        }
        dispatch(setOpenAddDialog(false));
    }

    function handleDelete() {
        dispatch(deleteRigs({socket, selectedIds: selected}))
            .unwrap()
            .then(() => {
                dispatch(setSelected([]));
                dispatch(setOpenDeleteConfirm(false));
                enqueueSnackbar('Rig(s) deleted successfully', {
                    variant: 'success',
                    autoHideDuration: 5000
                });
            })
            .catch((error) => {
                enqueueSnackbar('Error deleting rig(s)', {
                    variant: 'error',
                    autoHideDuration: 5000
                });
            });
    }

    const handleChange = (e) => {
        const {name, value} = e.target;
        if (e.target.type === "number") {
            dispatch(setFormValues({...formValues, [name]: parseInt(value)}));
        } else {
            dispatch(setFormValues({...formValues, [name]: value}));
        }

    };

    return (
        <Paper elevation={3} sx={{padding: 2, marginTop: 0}}>
            <Alert severity="info">
                <AlertTitle>Radio Rig Control Setup</AlertTitle>
                Configure and manage radio transceiver connections for automated frequency control during satellite
                tracking. This system uses Hamlib, the industry-standard library supporting over 200 radio models
                including popular brands like Yaesu, Icom, Kenwood, Elecraft, FlexRadio, and many others. Radio control
                is supported exclusively through network connections - direct serial/USB connections are not supported.
                Rigctld handles client requests via TCP sockets, allowing multiple user programs to share one radio.
                Set up connection parameters including host address, port, radio type, PTT control, VFO configuration,
                and local oscillator offsets for uplink/downlink frequency compensation. Rigs integrate seamlessly
                with satellite tracking to automatically adjust frequencies based on Doppler shift calculations.
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <Box sx={{width: '100%'}}>
                    <DataGrid
                        loading={loading}
                        rows={rigs}
                        columns={columns}
                        checkboxSelection
                        disableSelectionOnClick
                        selectionModel={selected}
                        onRowSelectionModelChange={(selected) => {
                            dispatch(setSelected(selected));
                        }}
                        initialState={{
                            pagination: {paginationModel: {pageSize: 5}},
                            sorting: {
                                sortModel: [{field: 'name', sort: 'desc'}],
                            },
                        }}
                        pageSize={pageSize}
                        pageSizeOptions={[5, 10, 25, {value: -1, label: 'All'}]}
                        onPageSizeChange={(newPageSize) => setPageSize(newPageSize)}
                        rowsPerPageOptions={[5, 10, 25]}
                        getRowId={(row) => row.id}
                        sx={{
                            border: 0,
                            marginTop: 2,
                            [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                                outline: 'none',
                            },
                            [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]:
                                {
                                    outline: 'none',
                                },
                        }}
                    />
                    <Stack direction="row" spacing={2} style={{marginTop: 15}}>
                        <Button variant="contained" onClick={() => {
                            dispatch(setFormValues(defaultRig));
                            dispatch(setOpenAddDialog(true));
                        }}>
                            Add
                        </Button>
                        <Button variant="contained" disabled={selected.length !== 1} onClick={() => {
                            const rigToEdit = rigs.find((rig) => rig.id === selected[0]);
                            if (rigToEdit) {
                                dispatch(setFormValues(rigToEdit));
                                dispatch(setOpenAddDialog(true));
                            }
                        }}>
                            Edit
                        </Button>
                        <Button
                            variant="contained"
                            disabled={selected.length < 1}
                            color="error"
                            onClick={() => dispatch(setOpenDeleteConfirm(true))}
                        >
                            Delete
                        </Button>
                    </Stack>
                    <Dialog open={openAddDialog} onClose={() => dispatch(setOpenAddDialog(false))}>
                        <DialogTitle>Add Radio Rig</DialogTitle>
                        <DialogContent>
                            <TextField
                                autoFocus
                                name="name"
                                margin="dense"
                                label="Name"
                                type="text"
                                fullWidth
                                variant="filled"
                                value={formValues.name}
                                onChange={handleChange}
                            />
                            <TextField
                                name="host"
                                margin="dense"
                                label="Host"
                                type="text"
                                fullWidth
                                variant="filled"
                                value={formValues.host}
                                onChange={handleChange}
                            />
                            <TextField
                                name="port"
                                margin="dense"
                                label="Port"
                                type="number"
                                fullWidth
                                variant="filled"
                                value={formValues.port}
                                onChange={handleChange}
                            />
                            <FormControl margin="dense" fullWidth variant="filled">
                                <InputLabel>Radio Type</InputLabel>
                                <Select
                                    name="radiotype"
                                    value={formValues.radiotype}
                                    onChange={handleChange}
                                    variant={'filled'}>
                                    <MenuItem value="rx">RX</MenuItem>
                                </Select>
                            </FormControl>
                            <FormControl margin="dense" fullWidth variant="filled">
                                <InputLabel>PTT Status</InputLabel>
                                <Select
                                    name="pttstatus"
                                    value={formValues.pttstatus}
                                    onChange={handleChange}
                                    variant={'filled'}>
                                    <MenuItem value="normal">Normal</MenuItem>
                                </Select>
                            </FormControl>
                            <FormControl margin="dense" fullWidth variant="filled">
                                <InputLabel>VFO Type</InputLabel>
                                <Select
                                    name="vfotype"
                                    value={formValues.vfotype}
                                    onChange={handleChange}
                                    variant={'filled'}>
                                    <MenuItem value="normal">Normal</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField
                                margin="dense"
                                name="lodown"
                                label="LO Down"
                                type="number"
                                fullWidth
                                variant="filled"
                                value={formValues.lodown}
                                onChange={handleChange}
                            />
                            <TextField
                                margin="dense"
                                name="loup"
                                label="LO Up"
                                type="number"
                                fullWidth
                                variant="filled"
                                value={formValues.loup}
                                onChange={handleChange}
                            />
                        </DialogContent>
                        <DialogActions style={{padding: '0px 24px 20px 20px'}}>
                            <Button onClick={() => dispatch(setOpenAddDialog(false))} color="error" variant="outlined">
                                Cancel
                            </Button>
                            <Button onClick={() => handleFormSubmit()} color="success" variant="contained">
                                Submit
                            </Button>
                        </DialogActions>
                    </Dialog>
                    <Dialog open={openDeleteConfirm} onClose={() => dispatch(setOpenDeleteConfirm(false))}>
                        <DialogTitle>Confirm Deletion</DialogTitle>
                        <DialogContent>
                            <DialogContentText>
                                Are you sure you want to delete the selected rig(s)?
                            </DialogContentText>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => dispatch(setOpenDeleteConfirm(false))} color="error"
                                    variant="outlined">
                                Cancel
                            </Button>
                            <Button
                                variant="contained"
                                onClick={() => {
                                    handleDelete();
                                }}
                                color="error"
                            >
                                Confirm
                            </Button>
                        </DialogActions>
                    </Dialog>
                </Box>
            </Box>
        </Paper>
    );
}
