import * as React from 'react';
import {useEffect, useState, Fragment, useCallback} from 'react';
import {DataGrid, gridClasses} from '@mui/x-data-grid';
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
} from "@mui/material";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";
import {betterDateTimes, humanizeDate} from "../common/common.jsx";
import {AddEditDialog} from "./satellite-group-dialog.jsx";


const SatelliteGroupsTable = React.memo(function () {
    const [rows, setRows] = useState([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const { socket } = useSocket();
    const [selectedRows, setSelectedRows] = useState([]);
    const [formErrorStatus, setFormErrorStatus] = useState(false);
    const [formDialogOpen, setFormDialogOpen] = useState(false);
    const [satGroup, setSatGroup] = useState({});
    const paginationModel = {page: 0, pageSize: 10};

    const columns = [
        {
            field: 'name',
            headerName: 'Name',
            width: 150,
            flex: 1,
        },
        {
            field: 'satellite_ids',
            headerName: 'Satellites',
            width: 300,
            flex: 3,
        },
        {
            field: 'added',
            headerName: 'Added',
            width: 200,
            flex: 4,
            align: 'right',
            headerAlign: 'right',
            renderCell: (params) => {
                return betterDateTimes(params.value);
            }
        },
    ];

    useEffect(() => {
        // fetch groups from backend
        socket.emit("data_request", "get-satellite-groups-user", (response) => {
            console.info("Received data for get-satellite-groups-user:", response);
            setRows(response.data);
        });

        return () => {

        };
    }, []);

    const handleAddClick = () => {
        setFormDialogOpen(true);
    };

    const handleEditGroup = function (event) {
        console.info("selectedRows", selectedRows);
        const singleRowId = selectedRows[0];
        const satGroup = rows.find(row => row.id === singleRowId);
        console.info("satGroup", satGroup);
        setSatGroup(satGroup);
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

    const handleRowsCallback = useCallback((rows) => {
        setRows(rows);
    }, []);

    const handleDialogOpenCallback = useCallback((value) => {
        setFormDialogOpen(value)
    }, []);

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
            <AddEditDialog
                formDialogOpen={formDialogOpen}
                handleRowsCallback={handleRowsCallback}
                handleDialogOpenCallback={handleDialogOpenCallback}
                satGroup={satGroup}
            />
        </Box>
    );
});

export default SatelliteGroupsTable;