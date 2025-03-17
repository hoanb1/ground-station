import * as React from 'react';
import {useEffect, useState} from 'react';
import {DataGrid} from '@mui/x-data-grid';
import Typography from "@mui/material/Typography";
import {
    Alert,
    AlertTitle,
    Box,
    Button,
    Stack,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField
} from "@mui/material";
import {useSocket} from "./socket.jsx";

const columns = [
    {field: 'friendlyname', headerName: 'Name', width: 150},
    {field: 'added', headerName: 'Added', width: 400},
];

const initialRows = [
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

const paginationModel = {page: 0, pageSize: 10};

const SatelliteGroupsTable = React.memo(function () {
    const [rows, setRows] = useState(initialRows);
    const [dialogOpen, setDialogOpen] = useState(false);
    const socket = useSocket();
    const [groups, setGroups] = useState([]);

    // Form state
    const [friendlyname, setFriendlyname] = useState('');
    const [added, setAdded] = useState(() => {
        // Format current date-time for datetime-local input
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const adjustedDate = new Date(now.getTime() - (offset * 60000));
        return adjustedDate.toISOString().slice(0, 16);
    });

    useEffect(() => {
        // fetch groups from backend
        console.info(`Fetching groups from backend... ${new Date().toISOString()}`);
        socket.emit("data_request", "satellite_groups", (response) => {
            console.log(response); // ok
        });

        return () => {

        };
    }, []);

    const handleAddClick = () => {
        // Clear previous values
        setFriendlyname('');
        setAdded('');
        setDialogOpen(true);
    };

    const handleDialogClose = () => {
        setDialogOpen(false);
    };

    const handleFormSubmit = (event) => {
        event.preventDefault();
        // Create a new row based on input values
        const newId = rows.length ? Math.max(...rows.map(r => r.id)) + 1 : 1;
        const newRow = {
            id: newId,
            friendlyname: friendlyname,
            added: new Date(added),
        };
        setRows(prev => [...prev, newRow]);
        setDialogOpen(false);
    };

    return (
        <Box sx={{width: '100%', marginTop: 0}}>
            <Alert severity="info">
                <AlertTitle>Satellite groups</AlertTitle>
                Manage satellite groups
            </Alert>
            <DataGrid
                rows={rows}
                columns={columns}
                initialState={{pagination: {paginationModel}}}
                pageSizeOptions={[5, 10]}
                checkboxSelection
                sx={{border: 0, marginTop: 2}}
            />
            <Stack direction="row" spacing={2} sx={{marginTop: 2}}>
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
            <Dialog open={dialogOpen} onClose={handleDialogClose}>
                <DialogTitle>Add a new Satellite Group</DialogTitle>
                <form onSubmit={handleFormSubmit}>
                    <DialogContent>
                        <TextField
                            margin="dense"
                            label="Name"
                            fullWidth
                            variant="outlined"
                            value={friendlyname}
                            onChange={(e) => setFriendlyname(e.target.value)}
                            required
                        />
                        <TextField
                            margin="dense"
                            label="Added"
                            type="datetime-local"
                            fullWidth
                            variant="outlined"
                            value={added}
                            onChange={(e) => setAdded(e.target.value)}
                            InputLabelProps={{
                                shrink: true,
                            }}
                            required
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleDialogClose}>Cancel</Button>
                        <Button type="submit" variant="contained">Add</Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Box>
    );
});

export default SatelliteGroupsTable;