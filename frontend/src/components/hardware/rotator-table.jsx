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
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import Stack from "@mui/material/Stack";
import {Alert, AlertTitle, Button, TextField} from "@mui/material";
import {useEffect, useState} from "react";
import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import {useSocket} from "../common/socket.jsx";
import toast from 'react-hot-toast';
import {useDispatch, useSelector} from 'react-redux';
import {
    deleteRotators,
    fetchRotators,
    submitOrEditRotator,
    setOpenDeleteConfirm,
    setOpenAddDialog,
    setFormValues,
} from './rotaror-slice.jsx';
import Paper from "@mui/material/Paper";


export default function AntennaRotatorTable() {
    const {socket} = useSocket();
    const dispatch = useDispatch();
    const [selected, setSelected] = useState([]);
    const [pageSize, setPageSize] = useState(10);
    const {
        loading,
        rotators,
        status,
        error,
        openAddDialog,
        openDeleteConfirm,
        formValues
    } = useSelector((state) => state.rotators);

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
        {field: 'minaz', headerName: 'Min AZ', type: 'number', flex: 1, minWidth: 80},
        {field: 'maxaz', headerName: 'Max AZ', type: 'number', flex: 1, minWidth: 80},
        {field: 'minel', headerName: 'Min EL', type: 'number', flex: 1, minWidth: 80},
        {field: 'maxel', headerName: 'Max EL', type: 'number', flex: 1, minWidth: 80},
        {field: 'aztype', headerName: 'AZ Type', type: 'number', flex: 1, minWidth: 80},
        {field: 'azendstop', headerName: 'AZ Endstop', type: 'number', flex: 1, minWidth: 80},
    ];

    // useEffect(() => {
    //     // Only dispatch if the socket is ready
    //     if (socket) {
    //         dispatch(fetchRotators({socket}));
    //     }
    // }, [dispatch, socket]);

    const handleChange = (e) => {
        const {name, value} = e.target;
        dispatch(setFormValues({...formValues, [name]: value}));
    };

    const handleSubmit = () => {
        dispatch(submitOrEditRotator({socket, formValues}))
            .unwrap()
            .then(() => {
                toast.success('Rotator saved successfully', {position: 'bottom-center'});
                setOpenAddDialog(false);
            })
            .catch((err) => {
                toast.error(err.message, {position: 'top-right'});
            });
    }

    const handleDelete = () => {
        dispatch(deleteRotators({socket, selectedIds: selected}))
            .unwrap()
            .then(() => {
                toast.success('Rotator(s) deleted successfully', {position: 'bottom-center'});
                dispatch(setOpenDeleteConfirm(false));
            })
            .catch((err) => {
                toast.error(err.message, {position: 'top-right'});
            });
    };

    return (
        <Paper elevation={3} sx={{padding: 2, marginTop: 0}}>
            <Alert severity="info">
                <AlertTitle>Antenna Rotator Control Setup</AlertTitle>
                Configure and manage antenna rotator systems for automated satellite tracking. This system uses Hamlib,
                supporting a wide range of rotator controllers including Yaesu G-5500, Alfa SPID, M2 RC2800,
                Hy-Gain DCU-1, and many others. Define connection parameters, azimuth and elevation limits,
                rotation types, and endstop configurations to ensure safe operation within your antenna system's
                mechanical constraints. Rotators integrate seamlessly with satellite tracking to automatically
                position antennas for optimal signal reception throughout satellite passes, with real-time status
                monitoring and safety limit enforcement.
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <Box sx={{width: '100%'}}>
                    <DataGrid
                        loading={loading}
                        rows={rotators}
                        columns={columns}
                        checkboxSelection
                        disableSelectionOnClick
                        onRowSelectionModelChange={(selected) => {
                            setSelected(selected);
                        }}
                        initialState={{
                            pagination: {paginationModel: {pageSize: 5}},
                            sorting: {
                                sortModel: [{field: 'name', sort: 'desc'}],
                            },
                        }}
                        selectionModel={selected}
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
                        <Button variant="contained" onClick={() => dispatch(setOpenAddDialog(true))}>
                            Add
                        </Button>
                        <Dialog fullWidth={true} open={openAddDialog} onClose={() => dispatch(setOpenAddDialog(false))}>
                            <DialogTitle>Add Antenna Rotator</DialogTitle>
                            <DialogContent>
                                <Stack spacing={2}>
                                    <TextField name="name" label="Name" fullWidth variant="filled"
                                               onChange={handleChange}
                                               value={formValues.name}/>
                                    <TextField name="host" label="Host" fullWidth variant="filled"
                                               onChange={handleChange}
                                               value={formValues.host}/>
                                    <TextField name="port" label="Port" type="number" fullWidth variant="filled"
                                               onChange={handleChange} value={formValues.port}/>
                                    <TextField name="minaz" label="Min Az" type="number" fullWidth variant="filled"
                                               onChange={handleChange} value={formValues.minaz}/>
                                    <TextField name="maxaz" label="Max Az" type="number" fullWidth variant="filled"
                                               onChange={handleChange} value={formValues.maxaz}/>
                                    <TextField name="minel" label="Min El" type="number" fullWidth variant="filled"
                                               onChange={handleChange} value={formValues.minel}/>
                                    <TextField name="maxel" label="Max El" type="number" fullWidth variant="filled"
                                               onChange={handleChange} value={formValues.maxel}/>
                                    <TextField name="aztype" label="Az Type" type="number" fullWidth variant="filled"
                                               onChange={handleChange} value={formValues.aztype}/>
                                    <TextField name="azendstop" label="Az Endstop" type="number" fullWidth
                                               variant="filled"
                                               onChange={handleChange} value={formValues.azendstop}/>
                                </Stack>
                            </DialogContent>
                            <DialogActions style={{padding: '0px 24px 20px 20px'}}>
                                <Button onClick={() => dispatch(setOpenAddDialog(false))} color="error"
                                        variant="outlined">
                                    Cancel
                                </Button>
                                <Button
                                    color="success"
                                    variant="contained"
                                    onClick={handleSubmit}
                                >
                                    Submit
                                </Button>
                            </DialogActions>
                        </Dialog>
                        <Button
                            variant="contained"
                            disabled={selected.length !== 1}
                            onClick={() => {
                                const selectedRow = rotators.find(row => row.id === selected[0]);
                                if (selectedRow) {
                                    dispatch(setFormValues(selectedRow));
                                    dispatch(setOpenAddDialog(true));
                                }
                            }}
                        >
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
                        <Dialog
                            open={openDeleteConfirm}
                            onClose={() => dispatch(setOpenDeleteConfirm(false))}
                        >
                            <DialogTitle>Confirm Deletion</DialogTitle>
                            <DialogContent>
                                Are you sure you want to delete the selected item(s)?
                            </DialogContent>
                            <DialogActions>
                                <Button onClick={() => dispatch(setOpenDeleteConfirm(false))} color="error"
                                        variant="outlined">
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={handleDelete}
                                    color="error"
                                >
                                    Delete
                                </Button>
                            </DialogActions>
                        </Dialog>
                    </Stack>
                </Box>
            </Box>
        </Paper>

    );
}
