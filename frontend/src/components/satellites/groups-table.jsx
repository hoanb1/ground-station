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
import { toast } from 'react-toastify';
import { useSocket } from '../common/socket.jsx';
import { betterDateTimes } from '../common/common.jsx';
import { AddEditDialog } from './groups-dialog.jsx';
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
            flex: 5,
        },
        {
            field: 'added',
            headerName: 'Added',
            width: 200,
            flex: 1,
            align: 'right',
            headerAlign: 'right',
            renderCell: (params) => betterDateTimes(params.value),
        },
        {
            field: 'updated',
            headerName: 'Updated',
            width: 200,
            flex: 1,
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
                toast.success('Group(s) deleted successfully');
            })
            .catch((err) => {
                toast.error('Failed to delete group(s)');
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
                <AlertTitle>Satellite Groups</AlertTitle>
                Create and manage custom satellite groups to organize satellites by mission type, frequency band, or any criteria that suits your needs. Add, edit, or delete groups and assign satellites to them for easier filtering and tracking. Both system-defined and user-created groups are available for selection when browsing the satellite database. Groups help streamline satellite operations by categorizing satellites into logical collections.
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
                        Are you sure you want to delete the selected group(s)?
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