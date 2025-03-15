import * as React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import Typography from "@mui/material/Typography";
import {Alert, AlertTitle, Box, Button} from "@mui/material";
import Stack from "@mui/material/Stack";

const columns = [
    { field: 'friendlyname', headerName: 'Name', width: 150 },
    { field: 'added', headerName: 'Added', width: 400 },
];

const rows = [
    {id: 1, friendlyname: 'My weather sats', name: 'weather', added: new Date()},
    {id: 2, friendlyname: 'My Ham sats', name: 'Ham', added: new Date()},
    {
        id: 3,
        friendlyname: 'My cubesats',
        name: 'cubesats',
        added: new Date()
    },
    {
        id: 4,
        friendlyname: 'My zombie sats',
        name: 'zombie',
        added: new Date()
    },
];

const paginationModel = { page: 0, pageSize: 10 };

export default function SatelliteGroupsTable() {
    return (
        <Box elevation={3} sx={{ width: '100%', marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>Satellite groups</AlertTitle>
                Manage satellite groups
            </Alert>
            <DataGrid
                rows={rows}
                columns={columns}
                initialState={{ pagination: { paginationModel } }}
                pageSizeOptions={[5, 10]}
                checkboxSelection
                sx={{ border: 0, marginTop: 2 }}
            />
            <Stack direction="row" spacing={2}>
                <Button variant="contained">
                    Add
                </Button>
                <Button variant="contained">
                    Edit
                </Button>
                <Button variant="contained" color="error">
                    Delete
                </Button>
            </Stack>
        </Box>
    );
}