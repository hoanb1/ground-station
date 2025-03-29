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
import {enqueueSnackbar} from "notistack";
import {useSocket} from "../common/socket.jsx";
import {setFormValues, setOpenAddDialog, setOpenDeleteConfirm, setSelected} from "./sources-slice.jsx"
import SynchronizeTLEsCard from "./sychronize-card.jsx";

const columns = [
    {field: 'name', headerName: 'Name', width: 150},
    {field: 'identifier', headerName: 'ID', width: 150},
    {field: 'url', headerName: 'URL', width: 600},
    {field: 'format', headerName: 'Format', width: 80},
    {
        field: 'added',
        headerName: 'Added',
        width: 400,
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
        identifier: '',
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
            .then(() => {
                enqueueSnackbar("TLE sources deleted successfully", {
                    variant: 'success',
                    autoHideDuration: 4000,
                })
            })
            .catch((error) => {
                enqueueSnackbar("Failed to delete TLE sources: " + error, {
                    variant: 'error',
                    autoHideDuration: 5000,
                })
            })
        dispatch(setOpenDeleteConfirm(false));
    };

    const handleSubmit = () => {
        if (formValues.id === null) {
            dispatch(submitOrEditTLESource({socket, formValues}))
                .unwrap()
                .then(() => {
                    enqueueSnackbar("TLE source added successfully", {
                        variant: 'success',
                        autoHideDuration: 4000,
                    })
                })
                .catch((error) => {
                    enqueueSnackbar("Failed to add TLE source: " + error, {
                        variant: 'error',
                    })
                });
        } else {
            dispatch(submitOrEditTLESource({socket, formValues}))
                .unwrap()
                .then(() => {
                    enqueueSnackbar("TLE source updated successfully", {
                        variant: 'success',
                        autoHideDuration: 4000,
                    })
                })
                .catch((error) => {
                    enqueueSnackbar("Failed to update TLE source: " + error, {})
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
                <AlertTitle>TLE sources</AlertTitle>
                TLE sources are loaded from Celestrak.org in TLE format
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
                        <DialogContent>Are you sure you want to delete the selected TLE sources?</DialogContent>
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
                            <TextField
                                label="Name"
                                name="name"
                                variant={"filled"}
                                value={formValues.name}
                                onChange={handleInputChange}
                                fullWidth
                            />
                            <TextField
                                label="ID"
                                name="identifier"
                                variant={"filled"}
                                value={formValues.identifier}
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