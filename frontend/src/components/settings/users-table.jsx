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


import React, { useEffect } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem, DialogContentText
} from '@mui/material';
import {DataGrid, gridClasses} from '@mui/x-data-grid';
import { useSelector, useDispatch } from 'react-redux';
import toast from 'react-hot-toast';

// Import slice actions and thunks
import {
    setOpenConfirmDialog,
    setOpenUserDialog,
    setSelected,
    setFormValues,
    resetFormValues,
    fetchUsers,
    deleteUsers,
    submitOrEditUser,
} from './users-slice';
import { useSocket } from '../common/socket.jsx';
import {setOpenDeleteConfirm} from "../hardware/rig-slice.jsx";

const UsersTable = () => {
    const dispatch = useDispatch();
    const { socket } = useSocket();

    // Redux state
    const {
        data: rows,
        loading,
        error,
        openConfirmDialog,
        openUserDialog,
        selected,
        formValues,
    } = useSelector((state) => state.users);

    // DataGrid columns
    const columns = [
        { field: 'fullname', headerName: 'Full Name', flex: 1 },
        { field: 'email', headerName: 'Email', flex: 1 },
        { field: 'status', headerName: 'Status', flex: 1 },
        { field: 'added', headerName: 'Added', flex: 1 },
    ];

    // // Fetch initial data
    // useEffect(() => {
    //     dispatch(fetchUsers({ socket }))
    //         .unwrap()
    //         .catch(() => {
    //             enqueueSnackbar('Failed to get users', { variant: 'error' });
    //         });
    // }, [dispatch, socket]);

    // Handlers
    const handleClickOpen = () => {
        dispatch(setOpenUserDialog(true));
        dispatch(resetFormValues());
    };

    const handleClose = () => {
        dispatch(setOpenUserDialog(false));
        dispatch(resetFormValues());
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        dispatch(setFormValues({ [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        await dispatch(submitOrEditUser({ socket, formValues }))
            .unwrap()
            .then(() => {
                toast.success(
                    formValues.id ? 'User edited successfully' : 'User added successfully',
                    {position: 'bottom-center'}
                );
            })
            .catch((err) => {
                toast.error(err.message, {position: 'top-right'});
            });
    }

    const handleDeleteConfirm = () => {
        dispatch(setOpenConfirmDialog(true));
    };

    const handleDelete = () => {
        dispatch(setOpenConfirmDialog(false));
        try {
            dispatch(deleteUsers({ socket, selectedIds: selected }))
                .unwrap()
                .then(()=>{
                    toast.success('User(s) deleted successfully', {position: 'bottom-center'});
                })
                .catch((err) => {
                    toast.error('Failed to delete users(s)', {position: 'top-right'});
                });

        } catch (err) {
            toast.error('Failed to delete user(s)', {position: 'top-right'});
        }
    };

    return (
        <Box>
            <DataGrid
                rows={rows}
                columns={columns}
                loading={loading}
                getRowId={(row) => row.id}
                checkboxSelection
                disableSelectionOnClick
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
                    [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]:
                        {
                            outline: 'none',
                        },
                }}
            />
            <Stack direction="row" spacing={2} style={{marginTop: 15}}>
                <Button variant="contained" onClick={handleClickOpen}>
                    Add
                </Button>
                <Button
                    disabled={selected.length !== 1}
                    variant="contained"
                    onClick={() => {
                        const userToEdit = rows.find(row => row.id === selected[0]);
                        if (userToEdit) {
                            dispatch(setFormValues({
                                id: userToEdit.id,
                                fullname: userToEdit.fullname,
                                email: userToEdit.email,
                                password: '',
                                status: userToEdit.status,
                            }));
                            dispatch(setOpenUserDialog(true));
                        }
                    }}
                >
                    Edit
                </Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={handleDeleteConfirm}
                    disabled={!selected.length}
                    sx={{ ml: 2 }}
                >
                    Delete
                </Button>
            </Stack>

            <Dialog open={openConfirmDialog} onClose={() => dispatch(setOpenConfirmDialog(false))}>
                <DialogTitle>Confirm Deletion</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete the selected rig(s)?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => dispatch(setOpenConfirmDialog(false))} color="error" variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            handleDelete();
                        }}
                        color="error"
                    >
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={openUserDialog} onClose={handleClose} fullWidth maxWidth="sm">
                <DialogTitle>{formValues.id ? 'Edit' : 'Add'} User</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 2 }}>
                        <TextField
                            variant="filled"
                            label="Fullname"
                            name="fullname"
                            value={formValues.fullname || ''}
                            onChange={handleChange}
                            fullWidth
                        />
                        <TextField
                            variant="filled"
                            autoComplete="new-password"
                            label="Email"
                            name="email"
                            value={formValues.email || ''}
                            onChange={handleChange}
                            fullWidth
                        />
                        <TextField
                            variant="filled"
                            autoComplete="new-password"
                            label="Password"
                            name="password"
                            type="password"
                            value={formValues.password || ''}
                            onChange={handleChange}
                            fullWidth
                        />
                        <FormControl fullWidth variant="filled" sx={{ mt: 2 }}>
                            <InputLabel>Status</InputLabel>
                            <Select
                                label="Status"
                                name="status"
                                value={formValues.status || ''}
                                onChange={handleChange}
                             variant={'filled'}>
                                <MenuItem value="active">Active</MenuItem>
                                <MenuItem value="disabled">Disabled</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ padding: '0px 24px 20px 20px' }}>
                    <Button onClick={handleClose}>Cancel</Button>
                    <Button variant="contained" onClick={handleSubmit}>
                        {formValues.id ? 'Save Changes' : 'Add User'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default UsersTable;