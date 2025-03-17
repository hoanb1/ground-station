import * as React from 'react';
import {useEffect, useState} from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Alert, AlertTitle, Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack } from "@mui/material";
import {useSocket} from "./socket.jsx";

const columns = [
    { field: 'name', headerName: 'Name', width: 150 },
    { field: 'identifier', headerName: 'ID', width: 150 },
    { field: 'url', headerName: 'URL', width: 600 },
    { field: 'added', headerName: 'Added', width: 400 },
];

const paginationModel = { page: 0, pageSize: 10 };

export default function TLESourcesTable() {
    const socket = useSocket();
    const [rows, setRows] = useState([]);
    const [formDialogOpen, setFormDialogOpen] = useState(false);
    const [selectedRows, setSelectedRows] = useState([]);
    const defaultFormValues = {
        id: null,
        identifier: '',
        name: '',
        url: '',
    };
    const [formDialogValues, setFormDialogValues] = useState(defaultFormValues);

    const handleAddClick = () => {
        setFormDialogValues(defaultFormValues);
        setFormDialogOpen(true);
    };

    const handleClose = () => {
        setFormDialogOpen(false);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormDialogValues(prev => ({ ...prev, [name]: value }));
    };

    const handleEditClick = (e) => {
        const singleRowId = selectedRows[0];
        setFormDialogValues({...rows.find(r => r.id === singleRowId), id: singleRowId});
        setFormDialogOpen(true);
    };

    const handleDeleteClick = (e) => {
        socket.emit("data_submission", "delete-tle-sources", selectedRows, (response) => {
            if (response.success === true) {
                setRows(response.data);
            } else {
                console.error(response.error);
            }
        });
    };

    const handleSubmit = () => {
        let cmd = null;
        if(formDialogValues.id === null) {
            cmd = 'submit-tle-sources';
        } else if (formDialogValues.id) {
            cmd = 'edit-tle-source';
        }

        socket.emit("data_submission", cmd, {...formDialogValues}, (response) => {
            if (response.success === true) {
                setFormDialogOpen(false);
                setRows(response.data);
            } else {
                console.error(response.error);
            }
        });
    };

    useEffect(() => {
        console.info(`Fetching TLE sources from backend... ${new Date().toISOString()}`);
        socket.emit("data_request", "get-tle-sources", null, (response) => {
            setRows(response.data);
        });

        return () => {

        };
    }, []);
    
    return (
        <Box sx={{ width: '100%', marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>TLE sources</AlertTitle>
                TLE sources are loaded from Celestrak.org in TLE format
            </Alert>
            <DataGrid
                rows={rows}
                columns={columns}
                initialState={{ pagination: { paginationModel } }}
                pageSizeOptions={[5, 10]}
                checkboxSelection={true}
                onRowSelectionModelChange={(selected) => {
                    setSelectedRows(selected);
                }}
                sx={{ border: 0, marginTop: 2 }}
            />
            <Stack direction="row" spacing={2} sx={{ marginTop: 2 }}>
                <Button variant="contained" onClick={handleAddClick}>
                    Add
                </Button>
                <Button variant="contained" disabled={selectedRows.length !== 1} onClick={handleEditClick}>
                    Edit
                </Button>
                <Button variant="contained" color="error" onClick={handleDeleteClick}>
                    Delete
                </Button>
            </Stack>

            {/* Add TLE Source Dialog */}
            <Dialog open={formDialogOpen} onClose={handleClose} sx={{ minWidth: 400 }} fullWidth maxWidth="sm">
                <DialogTitle>Add TLE Source</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ marginTop: 1 }}>
                        <TextField
                            label="Name"
                            name="name"
                            value={formDialogValues.name}
                            onChange={handleInputChange}
                            fullWidth
                        />
                        <TextField
                            label="ID"
                            name="identifier"
                            value={formDialogValues.identifier}
                            onChange={handleInputChange}
                            fullWidth
                        />
                        <TextField
                            label="URL"
                            name="url"
                            value={formDialogValues.url}
                            onChange={handleInputChange}
                            fullWidth
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>Cancel</Button>
                    <Button variant="contained" onClick={handleSubmit}>Submit</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}