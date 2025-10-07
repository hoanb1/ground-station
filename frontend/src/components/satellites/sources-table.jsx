
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
import {useEffect, useState} from 'react';
import {DataGrid, gridClasses} from '@mui/x-data-grid';
import {
    Alert,
    AlertTitle,
    Box,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Stack, Select, MenuItem, FormControl, InputLabel,
} from "@mui/material";
import {useDispatch, useSelector} from 'react-redux';
import {fetchTLESources,  submitOrEditTLESource, deleteTLESources} from './sources-slice.jsx';
import {betterDateTimes} from "../common/common.jsx";
import toast from 'react-hot-toast';
import {useSocket} from "../common/socket.jsx";
import {setFormValues, setOpenAddDialog, setOpenDeleteConfirm, setSelected} from "./sources-slice.jsx"
import SynchronizeTLEsCard from "./sychronize-card.jsx";

const columns = [
    {field: 'name', headerName: 'Name', width: 150},
    {field: 'url', headerName: 'URL', flex: 2},
    {field: 'format', headerName: 'Format', width: 90},
    {
        field: 'added',
        headerName: 'Added',
        flex: 1,
        align: 'right',
        headerAlign: 'right',
        width: 100,
        renderCell: (params) => {
            return betterDateTimes(params.value);
        }
    },
    {
        field: 'updated',
        headerName: 'Updated',
        flex: 1,
        width: 100,
        align: 'right',
        headerAlign: 'right',
        renderCell: (params) => {
            return betterDateTimes(params.value);
        }
    },
];

const paginationModel = {page: 0, pageSize: 10};

export default function SourcesTable() {
    const dispatch = useDispatch();
    const {socket} = useSocket();
    const {tleSources, loading, formValues, openDeleteConfirm, openAddDialog, selected} = useSelector((state) => state.tleSources);
    const defaultFormValues = {
        id: null,
        name: '',
        url: '',
        format: '3le',
    };

    const handleAddClick = () => {
        dispatch(setFormValues(defaultFormValues));
        dispatch(setOpenAddDialog(true));
    };

    const handleClose = () => {
        dispatch(setOpenAddDialog(false));
    };

    const handleInputChange = (e) => {
        const {name, value} = e.target;
        dispatch(setFormValues({...formValues, [name]: value}));
    };

    const handleEditClick = (e) => {
        const singleRowId = selected[0];
        dispatch(setFormValues({...tleSources.find(r => r.id === singleRowId), id: singleRowId}));
        dispatch(setOpenAddDialog(true));
    };

    const handleDeleteClick = () => {
        dispatch(deleteTLESources({socket, selectedIds: selected}))
            .unwrap()
            .then((data) => {
                toast.success(data.message, {
                    duration: 4000,
                })
            })
            .catch((error) => {
                toast.error("Failed to delete TLE sources: " + error, {
                    duration: 5000,
                })
            })
        dispatch(setOpenDeleteConfirm(false));
    };

    const handleSubmit = () => {
        if (formValues.id === null) {
            dispatch(submitOrEditTLESource({socket, formValues}))
                .unwrap()
                .then(() => {
                    toast.success("TLE source added successfully", {
                        duration: 4000,
                    })
                })
                .catch((error) => {
                    toast.error("Failed to add TLE source: " + error)
                });
        } else {
            dispatch(submitOrEditTLESource({socket, formValues}))
                .unwrap()
                .then(() => {
                    toast.success("TLE source updated successfully", {
                        duration: 4000,
                    })
                })
                .catch((error) => {
                    toast.error("Failed to update TLE source: " + error)
                });
        }
        dispatch(setOpenAddDialog(false));
    };

    // useEffect(() => {
    //     dispatch(fetchTLESources({socket}));
    // }, [dispatch]);

    return (
        <Box sx={{width: '100%', marginTop: 0}}>
            <Alert severity="info">
                <AlertTitle>TLE Data Sources</AlertTitle>
                This page manages TLE (Two-Line Element) data sources for satellite tracking. You can add, edit, and delete custom TLE sources in 3LE format from various providers including Celestrak.org and other TLE data sources. The system automatically fetches orbital data from configured URLs and combines it with frequency information from the SatNOGS API. Use the synchronization controls to update all sources with the latest satellite data. Sources are stored locally and timestamps show when each source was added and last updated.
            </Alert>
            <SynchronizeTLEsCard/>
            <Box sx={{marginTop: 4}}>
                <DataGrid
                    loading={loading}
                    rows={tleSources}
                    columns={columns}
                    initialState={{pagination: {paginationModel}}}
                    pageSizeOptions={[5, 10]}
                    checkboxSelection={true}
                    onRowSelectionModelChange={(selected) => {
                        dispatch(setSelected(selected));
                    }}
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
                <Stack direction="row" spacing={2} sx={{marginTop: 2}}>
                    <Button variant="contained" onClick={handleAddClick}>
                        Add
                    </Button>
                    <Button variant="contained" disabled={selected.length !== 1} onClick={handleEditClick}>
                        Edit
                    </Button>
                    <Button variant="contained" color="error" disabled={selected.length < 1}
                            onClick={() => dispatch(setOpenDeleteConfirm(true))}>
                        Delete
                    </Button>
                    <Dialog open={openDeleteConfirm} onClose={() => dispatch(setOpenDeleteConfirm(false))}>
                        <DialogTitle>Confirm Deletion</DialogTitle>
                        <DialogContent>
                            <p>Are you sure you want to delete the selected TLE sources? This action will permanently delete:</p>
                            <ul>
                                <li>The TLE source(s)</li>
                                <li>All satellites sourced from the selected TLE source(s)</li>
                                <li>The corresponding satellite group</li>
                            </ul>
                            <p><strong>This action cannot be undone.</strong></p>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => dispatch(setOpenDeleteConfirm(false))}>Cancel</Button>
                            <Button
                                variant="contained"
                                color="error"
                                onClick={handleDeleteClick}
                            >
                                Delete
                            </Button>
                        </DialogActions>
                    </Dialog>
                </Stack>
                <Dialog open={openAddDialog} onClose={handleClose} sx={{minWidth: 400}} fullWidth maxWidth="sm">
                    <DialogTitle>{formValues.id ? 'Edit' : 'Add'} TLE Source</DialogTitle>
                    <DialogContent>
                        <Stack spacing={2} sx={{marginTop: 1}}>
                            <Alert severity="warning" sx={{marginBottom: 2}}>
                                <AlertTitle>Performance Notice</AlertTitle>
                                TLE sources with hundreds of satellites will cause performance issues in the UI.
                                The application will work (even with thousands of satellites in a single TLE) but the UI
                                performance will <b>suffer</b> especially when the number is high (in the thousands).
                                For optimal performance, select updated sources that contain a small or
                                specific group of satellites instead of generic TLE sources that contain
                                vast groups of satellites (such as the Active list from Celestrak).
                            </Alert>
                            <TextField
                                label="Name"
                                name="name"
                                variant={"filled"}
                                value={formValues.name}
                                onChange={handleInputChange}
                                fullWidth
                            />
                            <TextField
                                label="URL"
                                name="url"
                                variant={"filled"}
                                value={formValues.url}
                                onChange={handleInputChange}
                                fullWidth
                            />
                            <FormControl fullWidth variant="filled">
                                <InputLabel id="format-label">Format</InputLabel>
                                <Select
                                    label="Format"
                                    name="format"
                                    value={formValues.format || ''}
                                    onChange={handleInputChange}
                                    variant={'filled'}>
                                    <MenuItem value="3le">3LE</MenuItem>
                                </Select>
                            </FormControl>
                        </Stack>
                    </DialogContent>
                    <DialogActions style={{margin: '0px 20px 20px 20px'}}>
                        <Button onClick={handleClose} color={"error"} variant={"outlined"}>Cancel</Button>
                        <Button variant="contained" onClick={handleSubmit}
                                color={"success"}>{formValues.id ? 'Edit' : 'Submit'}</Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </Box>
    );
}