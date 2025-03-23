import * as React from 'react';
import {useEffect, useState} from 'react';
import {DataGrid, gridClasses} from '@mui/x-data-grid';
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
import {enqueueSnackbar} from "notistack";
import {betterDateTimes, humanizeDate} from "./common.jsx";

const paginationModel = {page: 0, pageSize: 10};

const SatelliteGroupsTable = React.memo(function () {
    const defaultFormValues = {id: null, name: ''};
    const [rows, setRows] = useState([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const { socket } = useSocket();
    const [groups, setGroups] = useState([]);
    const [selectedRows, setSelectedRows] = useState([]);
    const [formDialogOpen, setFormDialogOpen] = useState(false);
    const [formDialogValues, setFormDialogValues] = useState(defaultFormValues);
    const [formErrorStatus, setFormErrorStatus] = useState(false);

    const columns = [
        {
            field: 'name',
            headerName: 'Name',
            width: 150
        },
        {
            field: 'added',
            headerName: 'Added',
            width: 200,
            align: 'right',
            headerAlign: 'right',
            renderCell: (params) => {
                return betterDateTimes(params.value);
            }
        },
    ];

    // form state
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
        socket.emit("data_request", "get-satellite-groups-user", (response) => {
            setRows(response.data);
        });

        return () => {

        };
    }, []);

    const handleAddClick = () => {
        // Clear previous values
        setFriendlyname('');
        setAdded('');
        setFormDialogOpen(true);
    };

    const handleDialogClose = () => {
        setFormDialogOpen(false);
    };

    const handleFormSubmit = (event) => {
        event.preventDefault();

        let cmd = null;
        let newRow = {};
        if(formDialogValues.id === null) {
            cmd = 'submit-satellite-group';
            // create a new row based on input values
            newRow = {
                name: formDialogValues.name,
            };
        } else if (formDialogValues.id) {
            newRow = {
                id: formDialogValues.id,
                name: formDialogValues.name,
            };
            cmd = 'edit-satellite-group';
        }

        socket.emit("data_submission", cmd, newRow, (response) => {
            if (response.success === true) {
                setRows(response.data)
                setFormDialogOpen(false);
            } else {
                enqueueSnackbar("Error adding satellite group", {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
        });
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormDialogValues(prev => ({ ...prev, [name]: value }));
    };

    const handleEditGroup = function (event) {
        const singleRowId = selectedRows[0];
        setFormDialogValues({...rows.find(r => r.id === singleRowId), id: singleRowId});
        setFormDialogOpen(true);
    }

    const handleDeleteGroup = function (event) {
        socket.emit("data_submission", "delete-satellite-group", selectedRows, (response) => {
            if (response.success === true) {
                setRows(response.data);
                setFormErrorStatus(false);
            } else {
                console.error(response.error);
                enqueueSnackbar("Failed to delete group: " + response.error, {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
                setFormErrorStatus(true);
            }
        });
    }

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
                onRowSelectionModelChange={(selected) => {
                    setSelectedRows(selected);
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
                <Button variant="contained" disabled={selectedRows.length !== 1} onClick={handleEditGroup}>
                    Edit
                </Button>
                <Button variant="contained" color="error" disabled={selectedRows.length < 1}
                        onClick={() => setDialogOpen(true)}>
                    Delete
                </Button>
                <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
                    <DialogTitle>Confirm Delete</DialogTitle>
                    <DialogContent>
                        Are you sure you want to delete the selected group(s)?
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => {
                                handleDeleteGroup();
                                setDialogOpen(false);
                            }}
                            color="error"
                            variant="contained"
                        >
                            Confirm
                        </Button>
                    </DialogActions>
                </Dialog>
            </Stack>
            <Dialog open={formDialogOpen} onClose={handleDialogClose}>
                <DialogTitle>Add a new satellite group</DialogTitle>
                <form onSubmit={handleFormSubmit}>
                    <DialogContent>
                        <TextField
                            error={formErrorStatus}
                            name="name"
                            margin="dense"
                            label="Name"
                            fullWidth
                            variant={"filled"}
                            value={formDialogValues.name}
                            onChange={handleInputChange}
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