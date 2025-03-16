import React, {useState} from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField
} from '@mui/material';

const UsersTable = () => {
    // Dummy data for users
    const rows = [
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
    ];

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
        // Optionally reset form values here
        setFormValues({
            fullName: '',
            email: '',
            password: '',
            status: '',
            addedWhen: '',
        });
    };

    const handleChange = (e) => {
        const {name, value} = e.target;
        setFormValues({...formValues, [name]: value});
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Process form submission here (e.g., add the new user to your data)
        console.log('Submitted user:', formValues);
        handleClose();
    };

    return (
        <Box sx={{ width: '100%' }}>
            <TableContainer component={Box}>
                <Table variant="outlined" aria-label="simple table">
                    <TableHead>
                        <TableRow>
                            <TableCell>Full Name</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Password</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Added When</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>{row.fullName}</TableCell>
                                <TableCell>{row.email}</TableCell>
                                <TableCell>{row.password}</TableCell>
                                <TableCell>{row.status}</TableCell>
                                <TableCell>{row.addedWhen.toLocaleDateString()}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {/* Stack for Add, Edit, Delete Buttons */}
                <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                    <Button variant="contained" onClick={handleClickOpen}>Add</Button>
                    <Button variant="contained">Edit</Button>
                    <Button variant="contained" color="error">
                        Delete
                    </Button>
                </Stack>
            </TableContainer>

            {/* Dialog with a Form */}
            <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
                <DialogTitle>Add New User</DialogTitle>
                <form onSubmit={handleSubmit}>
                    <DialogContent>
                        <TextField
                            autoFocus
                            margin="dense"
                            name="fullName"
                            label="Full Name"
                            type="text"
                            fullWidth
                            value={formValues.fullName}
                            onChange={handleChange}
                            required
                        />
                        <TextField
                            margin="dense"
                            name="email"
                            label="Email"
                            type="email"
                            fullWidth
                            value={formValues.email}
                            onChange={handleChange}
                            required
                        />
                        <TextField
                            margin="dense"
                            name="password"
                            label="Password"
                            type="password"
                            fullWidth
                            value={formValues.password}
                            onChange={handleChange}
                            required
                        />
                        <TextField
                            margin="dense"
                            name="status"
                            label="Status"
                            type="text"
                            fullWidth
                            value={formValues.status}
                            onChange={handleChange}
                            required
                        />
                        <TextField
                            margin="dense"
                            name="addedWhen"
                            label="Added When"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={formValues.addedWhen}
                            onChange={handleChange}
                            required
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleClose}>Cancel</Button>
                        <Button type="submit" variant="contained">Save</Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Box>
    );
};

export default UsersTable;