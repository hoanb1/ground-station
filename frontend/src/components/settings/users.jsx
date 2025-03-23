import React, {useEffect, useState} from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    MenuItem,
    Select,
    FormControl, InputLabel
} from '@mui/material';
import {DataGrid, gridClasses} from '@mui/x-data-grid';
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";

const UsersTable = () => {
    const { socket } = useSocket();
    const [rows, setRows] = useState([]);
    const [selectedRows, setSelectedRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openConfirmDialog, setOpenConfirmDialog] = useState(false);

    // Columns definition for DataGrid
    const columns = [
        { field: 'fullname', headerName: 'Full Name', flex: 1 },
        { field: 'email', headerName: 'Email', flex: 1 },
        { field: 'status', headerName: 'Status', flex: 1 },
        {
            field: 'added',
            headerName: 'Added',
            flex: 1,
        },
    ];

    // State to control dialog visibility
    const [open, setOpen] = useState(false);

    // Form state
    const [formValues, setFormValues] = useState({
        fullname: '',
        email: '',
        password: '',
        status: 'active',
    });

    const handleClickOpen = () => {
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
        setFormValues({
            fullname: '',
            email: '',
            password: '',
            status: '',
        });
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormValues({ ...formValues, [name]: value });
    };

    const handleDelete = (e) => {
        socket.emit("data_submission", "delete-user", selectedRows, (response) => {
            if (response['success']) {
                enqueueSnackbar('User deleted successfully', {
                    variant: 'success',
                    autoHideDuration: 5000,
                })
                setRows(response['data']);
            } else {
                enqueueSnackbar('Failed to delete user', {})
            }
        })
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setLoading(true);

        if (formValues.id) {
            socket.emit("data_submission", 'edit-user', formValues, (response) => {
                if (response['success']) {
                    enqueueSnackbar('User edited successfully', {
                        variant: 'success',
                        autoHideDuration: 5000,
                    })
                    setRows(response['data']);
                    handleClose();
                } else {
                    enqueueSnackbar('Failed to edited user', {
                        variant: 'error',
                        autoHideDuration: 5000,
                    })
                }
                setLoading(false);
            });

        } else {
            socket.emit("data_submission", 'submit-user', formValues, (response) => {
                if (response['success']) {
                    enqueueSnackbar('User added successfully', {
                        variant: 'success',
                        autoHideDuration: 5000,
                    })
                    setRows(response['data']);
                    handleClose();
                } else {
                    enqueueSnackbar('Failed to added user', {
                        variant: 'error',
                        autoHideDuration: 5000,
                    })
                }
                setLoading(false);
            });
        }
    };

    useEffect(() => {
        setLoading(true);
        socket.emit("data_request", "get-users", null, (response) => {
            if (response['success']) {
                console.log("Received users data", response);
                setRows(response['data']);
            } else {
                enqueueSnackbar('Failed to get users', {
                    variant: 'error',
                    autoHideDuration: 5000,
                })
            }
            setLoading(false);
        });
        return () => {
            // Cleanup logic (optional)
        };
    }, []);

    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ height: 400, width: '100%' }}>
                <DataGrid
                    loading={loading}
                    checkboxSelection={true}
                    columns={columns}
                    rows={rows}
                    pageSizeOptions={[5, 10]}
                    onRowSelectionModelChange={(selected) => {
                        setSelectedRows(selected);
                    }}
                    initialState={{
                        pagination: { paginationModel: { pageSize: 5 } },
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
            </Box>

            {/* Add, Edit, Delete Buttons */}
            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                <Button variant="contained" onClick={handleClickOpen}>Add</Button>
                <Button
                    disabled={selectedRows.length !== 1}
                    variant="contained"
                    onClick={() => {
                        const userToEdit = rows.find(row => row.id === selectedRows[0]);
                        if (userToEdit) {
                            setFormValues({
                                id: userToEdit.id,
                                fullname: userToEdit.fullname,
                                email: userToEdit.email,
                                password: '', // Password should typically not be pre-filled for security reasons
                                status: userToEdit.status,
                            });
                            setOpen(true);
                        }
                    }}
                >
                    Edit
                </Button>
                <Button
                    disabled={selectedRows.length < 1}
                    variant="contained"
                    color="error"
                    onClick={() => setOpenConfirmDialog(true)}
                >
                    Delete
                </Button>
                <Dialog
                    open={openConfirmDialog}
                    onClose={() => setOpenConfirmDialog(false)}
                >
                    <DialogTitle>Confirm Delete</DialogTitle>
                    <DialogContent>
                        Are you sure you want to delete the selected users?
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenConfirmDialog(false)}>Cancel</Button>
                        <Button
                            onClick={() => {
                                handleDelete();
                                setOpenConfirmDialog(false);
                            }}
                            color="error"
                            variant="contained"
                        >
                            Delete
                        </Button>
                    </DialogActions>
                </Dialog>
            </Stack>

            {/* Dialog for Adding and Editing User */}
            <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
                <DialogTitle>Add New User</DialogTitle>
                <form onSubmit={handleSubmit}>
                    <DialogContent>
                        <Stack spacing={2} sx={{ marginTop: 1 }}>
                            <TextField
                                autoComplete="new-password"
                                margin="dense"
                                name="fullname"
                                label="Full Name"
                                type="text"
                                fullWidth
                                value={formValues.fullname}
                                onChange={handleChange}
                                variant={"filled"}
                            />
                            <TextField
                                autoComplete="new-password"
                                margin="dense"
                                name="email"
                                label="Email"
                                type="email"
                                fullWidth
                                value={formValues.email}
                                onChange={handleChange}
                                variant={"filled"}
                            />
                            <TextField
                                autoComplete="new-password"
                                margin="dense"
                                name="password"
                                label="Password"
                                type="password"
                                fullWidth
                                value={formValues.password}
                                onChange={handleChange}
                                variant={"filled"}
                            />
                            <FormControl fullWidth variant="filled">
                                <InputLabel id="status-label">Status</InputLabel>
                                <Select
                                    label="Status"
                                    name="status"
                                    value={formValues.status || ''}
                                    onChange={handleChange}
                                 variant={'filled'}>
                                    <MenuItem value="active">Active</MenuItem>
                                    <MenuItem value="inactive">Inactive</MenuItem>
                                </Select>
                            </FormControl>
                        </Stack>
                    </DialogContent>
                    <DialogActions style={{padding: '20px 20px 20px 20px'}}>
                        <Button onClick={handleClose}>Cancel</Button>
                        <Button type="submit" variant="contained" color="primary"  disabled={loading}>
                            Submit
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Box>
    );
};

export default UsersTable;