import * as React from 'react';
import { useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import Typography from "@mui/material/Typography";
import { Alert, AlertTitle, Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack } from "@mui/material";

const columns = [
    { field: 'friendlyname', headerName: 'Name', width: 150 },
    { field: 'url', headerName: 'URL', width: 600 },
    { field: 'added', headerName: 'Added', width: 400 },
];

const rows = [
    { id: 1, friendlyname: 'NOAA', name: 'noaa', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=tle', added: new Date() },
    { id: 2, friendlyname: 'GOES', name: 'goes', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=goes&FORMAT=tle', added: new Date() },
    { id: 3, friendlyname: 'SARSAT', name: 'sarsat', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=sarsat&FORMAT=tle', added: new Date() },
    { id: 4, friendlyname: 'Disaster Monitoring', name: 'dmc', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=dmc&FORMAT=tle', added: new Date() },
    { id: 5, friendlyname: 'Amateur', name: 'amateur', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle', added: new Date() },
    { id: 6, friendlyname: 'Molniya', name: 'molniya', url: "https://www.celestrak.org/NORAD/elements/gp.php?GROUP=molniya&FORMAT=tle", added: new Date() },
    { id: 7, friendlyname: 'GNSS', name: 'gnss', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=tle', added: new Date() },
    { id: 8, friendlyname: 'GPS operational', name: 'gps-ops', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle', added: new Date() },
    { id: 9, friendlyname: 'Galileo', name: 'galileo', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle', added: new Date() },
    { id: 10, friendlyname: 'Science', name: 'science', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=tle', added: new Date() },
    { id: 11, friendlyname: 'Engineering', name: 'engineering', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=engineering&FORMAT=tle', added: new Date() },
    { id: 12, friendlyname: 'SATNOGS', name: 'satnogs', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=satnogs&FORMAT=tle', added: new Date() },
    { id: 13, friendlyname: 'CubeSats', name: 'cubesat', url: 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=cubesat&FORMAT=tle', added: new Date() },
];

const paginationModel = { page: 0, pageSize: 10 };

export default function TLESourcesTable() {
    const [open, setOpen] = useState(false);
    const [formValues, setFormValues] = useState({
        friendlyname: '',
        url: '',
        added: new Date().toISOString().split('T')[0],
    });

    const handleAddClick = () => {
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormValues(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = () => {
        // Process the form values as needed, e.g., add a new row to the table
        console.log('Form Submitted:', formValues);
        // Close the dialog
        setOpen(false);
    };

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
                checkboxSelection
                sx={{ border: 0, marginTop: 2 }}
            />
            <Stack direction="row" spacing={2} sx={{ marginTop: 2 }}>
                <Button variant="contained" onClick={handleAddClick}>
                    Add
                </Button>
                <Button variant="contained">
                    Edit
                </Button>
                <Button variant="contained" color="error">
                    Delete
                </Button>
            </Stack>

            {/* Add TLE Source Dialog */}
            <Dialog open={open} onClose={handleClose}>
                <DialogTitle>Add TLE Source</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ marginTop: 1 }}>
                        <TextField
                            label="Name"
                            name="friendlyname"
                            value={formValues.friendlyname}
                            onChange={handleInputChange}
                            fullWidth
                        />
                        <TextField
                            label="URL"
                            name="url"
                            value={formValues.url}
                            onChange={handleInputChange}
                            fullWidth
                        />
                        <TextField
                            label="Added"
                            name="added"
                            type="date"
                            value={formValues.added}
                            onChange={handleInputChange}
                            fullWidth
                            InputLabelProps={{
                                shrink: true,
                            }}
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