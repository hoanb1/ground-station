import React, { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, MenuItem, Select } from '@mui/material';
import {DataGrid, gridClasses} from '@mui/x-data-grid';

const UsersTable = () => {
    const [users, setUsers] = useState([]);
    const [selectedRows, setSelectedRows] = useState([]);

    // Columns definition for DataGrid
    const columns = [
        { field: 'fullName', headerName: 'Full Name', flex: 1 },
        { field: 'email', headerName: 'Email', flex: 1 },
        { field: 'password', headerName: 'Password', flex: 1 },
        { field: 'status', headerName: 'Status', flex: 1 },
        {
            field: 'addedWhen',
            headerName: 'Added When',
            flex: 1,
        },
    ];

    // Dummy data for users
    const [rows, setRows] = useState([
        {
            id: 1,
            fullName: 'John Doe',
            email: 'john.doe@example.com',
            password: '********',
            status: 'Active',
            addedWhen: new Date(),
        },
        {
            id: 2,
            fullName: 'Jane Smith',
            email: 'jane.smith@example.com',
            password: '********',
            status: 'Inactive',
            addedWhen: new Date(),
        },
        {
            id: 3,
            fullName: 'Robert Brown',
            email: 'robert.brown@example.com',
            password: '********',
            status: 'Active',
            addedWhen: new Date(),
        },
    ]);

    // State to control dialog visibility
    const [open, setOpen] = useState(false);

    // Form state
    const [formValues, setFormValues] = useState({
        fullName: '',
        email: '',
        password: '',
        status: '',
        addedWhen: '',
    });

    const handleClickOpen = () => {
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
        setFormValues({
            fullName: '',
            email: '',
            password: '',
            status: '',
            addedWhen: '',
        });
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormValues({ ...formValues, [name]: value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Use some logic to add the new user to your data
        const newId = rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
        setRows((prevRows) => [
            ...prevRows,
            {
                id: newId,
                ...formValues,
                addedWhen: formValues.addedWhen || new Date(),
            },
        ]);
        handleClose();
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ height: 400, width: '100%' }}>
                <DataGrid
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
                <Button disabled={selectedRows.length !== 1} variant="contained">Edit</Button>
                <Button disabled={selectedRows.length < 1} variant="contained" color="error">Delete</Button>
            </Stack>

            {/* Dialog for Adding User */}
            <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
                <DialogTitle>Add New User</DialogTitle>
                <form onSubmit={handleSubmit}>
                    <DialogContent>
                        <TextField
                            autoComplete="new-password"
                            margin="dense"
                            name="fullName"
                            label="Full Name"
                            type="text"
                            fullWidth
                            value={formValues.fullName}
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
                        <Select
                            margin="dense"
                            name="status"
                            label="Status"
                            fullWidth
                            value={formValues.status}
                            onChange={handleChange}
                         variant={"filled"}>
                            <MenuItem value="Active">Active</MenuItem>
                            <MenuItem value="Inactive">Inactive</MenuItem>
                        </Select>

                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleClose}>Cancel</Button>
                        <Button type="submit" variant="contained" color="primary">
                            Add
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Box>
    );
};

export default UsersTable;