// GroupsTable.jsx
import React, { useEffect, useCallback } from 'react';
import {
    Box,
    Button,
    Alert,
    AlertTitle,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack, DialogContentText,
} from '@mui/material';
import { DataGrid, gridClasses } from '@mui/x-data-grid';
import { enqueueSnackbar } from 'notistack';
import { useSocket } from '../common/socket.jsx';
import { betterDateTimes } from '../common/common.jsx';
import { AddEditDialog } from './groups-dialog.jsx';

// Redux
import { useSelector, useDispatch } from 'react-redux';
import {
    fetchSatelliteGroups,
    deleteSatelliteGroups,
    setSelected,
    setSatGroup,
    setFormDialogOpen,
    setFormErrorStatus,
    setGroups,
    setDeleteConfirmDialogOpen,
} from './groups-slice.jsx';
import {setOpenDeleteConfirm} from "../hardware/rig-slice.jsx";

const GroupsTable = () => {
    const dispatch = useDispatch();
    const { socket } = useSocket();

    // Redux state
    const {
        groups,
        selected,
        formDialogOpen,
        deleteConfirmDialogOpen,
        satGroup,
        formErrorStatus,
        loading,
        error,
    } = useSelector((state) => state.satelliteGroups);

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
            renderCell: (params) => betterDateTimes(params.value),
        },
    ];

    // // Fetch data
    // useEffect(() => {
    //     dispatch(fetchSatelliteGroups({ socket }));
    // }, [dispatch, socket]);

    // Handle Add
    const handleAddClick = () => {
        dispatch(setSatGroup({})); // if you want to clear previous selections
        dispatch(setFormDialogOpen(true));
    };

    // Handle Edit
    const handleEditGroup = () => {
        if (selected.length !== 1) return;
        const singleRowId = selected[0];
        const rowData = groups.find((row) => row.id === singleRowId);
        console.info("selected", rowData);
        if (rowData) {
            dispatch(setSatGroup(rowData));
            dispatch(setFormDialogOpen(true));
        }
    };

    const handleDeleteGroup = () => {
        dispatch(deleteSatelliteGroups({socket, groupIds: selected}))
            .unwrap()
            .then(()=>{
                dispatch(setDeleteConfirmDialogOpen(false));
                enqueueSnackbar('Group(s) deleted successfully', { variant: 'success' });
            })
            .catch((err) => {
                enqueueSnackbar('Failed to delete group(s)', { variant: 'error' });
            });
    };

    const paginationModel = { page: 0, pageSize: 10 };

    const handleRowsCallback = useCallback((groups) => {
        dispatch(setGroups(groups));
    }, []);

    const handleDialogOpenCallback = useCallback((value) => {
        dispatch(setFormDialogOpen(value));
    }, []);

    return (
        <Box sx={{ width: '100%', marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>Satellite groups</AlertTitle>
                Manage satellite groups
            </Alert>

            <DataGrid
                rows={groups}
                columns={columns}
                loading={loading}
                initialState={{ pagination: { paginationModel } }}
                pageSizeOptions={[5, 10]}
                checkboxSelection
                onRowSelectionModelChange={(ids) => {
                    dispatch(setSelected(ids));
                }}
                selectionModel={selected}
                sx={{
                    border: 0,
                    marginTop: 2,
                    [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                        outline: 'none',
                    },
                }}
            />

            <Stack spacing={2} direction="row" sx={{ my: 2 }}>
                <Button variant="contained" onClick={handleAddClick}>
                    Add
                </Button>
                <Button
                    variant="contained"
                    onClick={handleEditGroup}
                    disabled={selected.length !== 1}
                >
                    Edit
                </Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={() => dispatch(setDeleteConfirmDialogOpen(true))}
                    disabled={selected.length === 0}
                >
                    Delete
                </Button>
            </Stack>

            {/* Example usage of Dialog */}
            {formDialogOpen && (
                <Dialog
                    open={formDialogOpen}
                    onClose={() => dispatch(setFormDialogOpen(false))}
                >
                    <DialogTitle>{satGroup.id ? 'Edit Group' : 'Add Group'}</DialogTitle>
                    <DialogContent>
                        <AddEditDialog
                            formDialogOpen={formDialogOpen}
                            handleRowsCallback={handleRowsCallback}
                            handleDialogOpenCallback={handleDialogOpenCallback}
                            satGroup={satGroup}
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => dispatch(setFormDialogOpen(false))}>
                            Close
                        </Button>
                    </DialogActions>
                </Dialog>
            )}

            <Dialog open={deleteConfirmDialogOpen} onClose={() => dispatch(setDeleteConfirmDialogOpen(false))}>
                <DialogTitle>Confirm Deletion</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete the selected rig(s)?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => dispatch(setDeleteConfirmDialogOpen(false))} color="error" variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            handleDeleteGroup();
                        }}
                        color="error"
                    >
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Example of an error alert */}
            {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {error}
                </Alert>
            )}
            {formErrorStatus && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    Some action failed. Check console or logs.
                </Alert>
            )}
        </Box>
    );
};

export default React.memo(GroupsTable);