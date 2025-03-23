import * as React from 'react';
import Box from '@mui/material/Box';
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import Stack from "@mui/material/Stack";
import {Button, TextField} from "@mui/material";
import {useEffect, useState} from "react";
import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";


export default function AntennaRotatorTable() {
    const {socket} = useSocket();
    const defaultRotator = {
        id: null,
        name: '',
        host: 'localhost',
        port: 4532,
        minaz: 0,
        maxaz: 360,
        minel: 0,
        maxel: 90,
        aztype: 0,
        azendstop: 0,
    };
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [openAddDialog, setOpenAddDialog] = useState(false);
    const [selected, setSelected] = useState([]);
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [selectionModel, setSelectionModel] = useState([]);
    const [pageSize, setPageSize] = useState(10);
    const [formValues, setFormValues] = useState(defaultRotator)

    const columns = [
        { field: 'name', headerName: 'Name', flex: 1 },
        { field: 'host', headerName: 'Host', flex: 1 },
        { field: 'port', headerName: 'Port', type: 'number', flex: 1 },
        { field: 'minaz', headerName: 'Min Az', type: 'number', flex: 1 },
        { field: 'maxaz', headerName: 'Max Az', type: 'number', flex: 1 },
        { field: 'minel', headerName: 'Min El', type: 'number', flex: 1 },
        { field: 'maxel', headerName: 'Max El', type: 'number', flex: 1 },
        { field: 'aztype', headerName: 'Az Type', type: 'number', flex: 1 },
        { field: 'azendstop', headerName: 'Az Endstop', type: 'number', flex: 1 },
    ];

    useEffect(() => {
        setLoading(true);
        socket.emit('data_request', 'get-rotators', null, (response) => {
            console.log(response);
            if (response.success) {
                setRows(response.data);
            } else {
                enqueueSnackbar("Failed to fetch rotators", {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
            setLoading(false);
        })

        return () => {

        };
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormValues((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = () => {
        const action = formValues.id ? 'edit-rotator' : 'submit-rotator';
        socket.emit('data_submission', action, formValues, (response) => {
            if (response.success) {
                setOpenAddDialog(false);
                setRows(response.data);
            } else {
                enqueueSnackbar(`Failed to ${action === 'edit-rotator' ? 'edit' : 'add'} rotator`, {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
        });
    }

    const handleDelete = () => {
        socket.emit('data_submission', 'delete-rotator', selected, (response) => {
            if (response.success) {
                setOpenDeleteConfirm(false);
                setRows(response.data);
            } else {
                enqueueSnackbar(`Failed to delete rotator`, {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
        })
    };

    return (
        <Box sx={{ width: '100%' }}>
            <DataGrid
                loading={loading}
                rows={rows}
                columns={columns}
                checkboxSelection
                disableSelectionOnClick
                onRowSelectionModelChange={(selected)=>{
                    setSelected(selected);
                }}
                initialState={{
                    pagination: { paginationModel: { pageSize: 5 } },
                    sorting: {
                        sortModel: [{ field: 'name', sort: 'desc' }],
                    },
                }}
                selectionModel={selected}
                pageSize={pageSize}
                pageSizeOptions={[5, 10, 25, { value: -1, label: 'All' }]}
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
                <Button variant="contained" onClick={() => setOpenAddDialog(true)}>
                    Add
                </Button>
                <Dialog fullWidth={true} open={openAddDialog} onClose={() => setOpenAddDialog(false)}>
                    <DialogTitle>Add Antenna Rotator</DialogTitle>
                    <DialogContent>
                        <Stack spacing={2}>
                            <TextField name="name" label="Name" fullWidth variant="filled" onChange={handleChange}
                                       value={formValues.name}/>
                            <TextField name="host" label="Host" fullWidth variant="filled" onChange={handleChange}
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
                            <TextField name="azendstop" label="Az Endstop" type="number" fullWidth variant="filled"
                                       onChange={handleChange} value={formValues.azendstop}/>
                        </Stack>
                    </DialogContent>
                    <DialogActions style={{padding: '0px 24px 20px 20px'}}>
                        <Button onClick={() => setOpenAddDialog(false)} color="error" variant="outlined">
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
                        const selectedRow = rows.find(row => row.id === selected[0]);
                        if (selectedRow) {
                            setFormValues(selectedRow);
                            setOpenAddDialog(true);
                        }
                    }}
                >
                    Edit
                </Button>
                <Button
                    variant="contained"
                    disabled={selected.length < 1}
                    color="error"
                    onClick={() => setOpenDeleteConfirm(true)}
                >
                    Delete
                </Button>
                <Dialog
                    open={openDeleteConfirm}
                    onClose={() => setOpenDeleteConfirm(false)}
                >
                    <DialogTitle>Confirm Deletion</DialogTitle>
                    <DialogContent>
                        Are you sure you want to delete the selected item(s)?
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenDeleteConfirm(false)} color="error" variant="outlined">
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
    );
}
