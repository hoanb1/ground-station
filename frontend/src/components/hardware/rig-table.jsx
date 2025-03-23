import * as React from 'react';
import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import { visuallyHidden } from '@mui/utils';
import {Button, DialogContentText, FormControl, InputLabel, MenuItem, Select, TextField} from "@mui/material";
import Stack from "@mui/material/Stack";
import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import {useEffect, useMemo, useState} from "react";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";
import {DataGrid, gridClasses} from "@mui/x-data-grid";


function descendingComparator(a, b, orderBy) {
    if (b[orderBy] < a[orderBy]) {
        return -1;
    }
    if (b[orderBy] > a[orderBy]) {
        return 1;
    }
    return 0;
}

function getComparator(order, orderBy) {
    return order === 'desc'
        ? (a, b) => descendingComparator(a, b, orderBy)
        : (a, b) => -descendingComparator(a, b, orderBy);
}

const headCells = [
    {
        id: 'name',
        numeric: false,
        disablePadding: true,
        label: 'Name',
    },
    {
        id: 'host',
        numeric: false,
        disablePadding: false,
        label: 'Host',
    },
    {
        id: 'port',
        numeric: true,
        disablePadding: false,
        label: 'Port',
    },
    {
        id: 'radiotype',
        numeric: false,
        disablePadding: false,
        label: 'Radio type',
    },
    {
        id: 'pttstatus',
        numeric: true,
        disablePadding: false,
        label: 'PTT status',
    },
    {
        id: 'vfotype',
        numeric: true,
        disablePadding: false,
        label: 'VFO type',
    },
    {
        id: 'lodown',
        numeric: true,
        disablePadding: false,
        label: 'LO down',
    },
    {
        id: 'loup',
        numeric: true,
        disablePadding: false,
        label: 'LO up',
    },
];

function EnhancedTableHead(props) {
    const { onSelectAllClick, order, orderBy, numSelected, rowCount, onRequestSort } =
        props;
    const createSortHandler = (property) => (event) => {
        onRequestSort(event, property);
    };

    return (
        <TableHead>
            <TableRow>
                <TableCell padding="checkbox">
                    <Checkbox
                        color="primary"
                        indeterminate={numSelected > 0 && numSelected < rowCount}
                        checked={rowCount > 0 && numSelected === rowCount}
                        onChange={onSelectAllClick}
                        inputProps={{
                            'aria-label': 'select all desserts',
                        }}
                    />
                </TableCell>
                {headCells.map((headCell) => (
                    <TableCell
                        style={{ fontWeight: 'bold' }}
                        key={headCell.id}
                        align={headCell.numeric ? 'right' : 'left'}
                        padding={headCell.disablePadding ? 'none' : 'normal'}
                        sortDirection={orderBy === headCell.id ? order : false}
                    >
                        <TableSortLabel
                            active={orderBy === headCell.id}
                            direction={orderBy === headCell.id ? order : 'asc'}
                            onClick={createSortHandler(headCell.id)}
                        >
                            {headCell.label}
                            {orderBy === headCell.id ? (
                                <Box component="span" sx={visuallyHidden}>
                                    {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                                </Box>
                            ) : null}
                        </TableSortLabel>
                    </TableCell>
                ))}
            </TableRow>
        </TableHead>
    );
}

EnhancedTableHead.propTypes = {
    numSelected: PropTypes.number.isRequired,
    onRequestSort: PropTypes.func.isRequired,
    onSelectAllClick: PropTypes.func.isRequired,
    order: PropTypes.oneOf(['asc', 'desc']).isRequired,
    orderBy: PropTypes.string.isRequired,
    rowCount: PropTypes.number.isRequired,
};

function EnhancedTableToolbar(props) {
    const { numSelected } = props;
    return (
        <Toolbar
            sx={[
                {
                    pl: { sm: 2 },
                    pr: { xs: 1, sm: 1 },
                },
                numSelected > 0 && {
                    bgcolor: (theme) =>
                        alpha(theme.palette.primary.main, theme.palette.action.activatedOpacity),
                },
            ]}
        >
            {numSelected > 0 ? (
                <Typography
                    sx={{ flex: '1 1 100%' }}
                    color="inherit"
                    variant="subtitle1"
                    component="div"
                >
                    {numSelected} selected
                </Typography>
            ) : (
                <Typography
                    sx={{ flex: '1 1 100%' }}
                    variant="h6"
                    id="tableTitle"
                    component="div"
                >
                    Rigs
                </Typography>
            )}
            {numSelected > 0 ? (
                <Tooltip title="Delete">
                    <IconButton>
                        <DeleteIcon />
                    </IconButton>
                </Tooltip>
            ) : (
                <Tooltip title="Filter list">
                    <IconButton>
                        <FilterListIcon />
                    </IconButton>
                </Tooltip>
            )}
        </Toolbar>
    );
}

EnhancedTableToolbar.propTypes = {
    numSelected: PropTypes.number.isRequired,
};

export default function RigTable() {
    const { socket } = useSocket();
    const [rigs, setRigs] = useState([]);
    const [selected, setSelected] = useState([]);
    const [pageSize, setPageSize] = useState(5);
    const [loading, setLoading] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [openAddDialog, setOpenAddDialog] = useState(false);
    const [formValues, setFormValues] = useState({
        name: '',
        host: 'localhost',
        port: 4532,
        radiotype: 'rx',
        pttstatus: 'normal',
        vfotype: 'normal',
        lodown: 0,
        loup: 0,
    });

    const columns = [
        { field: 'name', headerName: 'Name', flex: 1 },
        { field: 'host', headerName: 'Host', flex: 1 },
        { field: 'port', headerName: 'Port', type: 'number', flex: 1 },
        { field: 'radiotype', headerName: 'Radio Type', flex: 1 },
        { field: 'pttstatus', headerName: 'PTT Status', flex: 1 },
        { field: 'vfotype', headerName: 'VFO Type', flex: 1 },
        { field: 'lodown', headerName: 'LO Down', type: 'number', flex: 1 },
        { field: 'loup', headerName: 'LO Up', type: 'number', flex: 1 },
    ];

    useEffect(() => {
        setLoading(true);
        socket.emit('data_request', 'get-rigs', null, (response) => {
            if (response.success) {
                setRigs(response.data);
            } else {
                enqueueSnackbar('Failed to fetch rigs', {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
            setLoading(false);
        });

        return () => {
            // Cleanup if needed
        };
    }, [socket]);

    function handleAddNewRig() {
        setLoading(true);
        socket.emit('data_submission', 'submit-rig', formValues, (response) => {
            if (response.success) {
                setOpenAddDialog(false);
                setRigs(response.data);
                enqueueSnackbar('Rig added successfully', {
                    variant: 'success',
                    autoHideDuration: 5000,
                });
            } else {
                enqueueSnackbar('Failed to add rig', {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
            setLoading(false);
        });
    }

    function handleDelete() {
        // Example delete action
        enqueueSnackbar('Delete action triggered', { variant: 'info' });
    }

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormValues((prev) => ({ ...prev, [name]: value }));
    };

    return (
        <Box sx={{ width: '100%' }}>
            <DataGrid
                loading={loading}
                rows={rigs}
                columns={columns}
                checkboxSelection
                disableSelectionOnClick
                selectionModel={selected}
                onRowSelectionModelChange={(selected)=>{
                    setSelected(selected);
                }}
                pageSize={pageSize}
                onPageSizeChange={(newPageSize) => setPageSize(newPageSize)}
                rowsPerPageOptions={[5, 10, 25]}
                getRowId={(row) => row.id}
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

            <Stack direction="row" spacing={2} style={{marginTop: 15}}>
                <Button variant="contained" onClick={() => setOpenAddDialog(true)}>
                    Add
                </Button>
                <Button variant="contained" disabled={selected.length !== 1}>
                    Edit
                </Button>
                <Button
                    variant="contained"
                    disabled={selected.length < 1}
                    color="error"
                    onClick={() => setOpenDeleteConfirm(true)}
                >
                    Delete
                </Button>
            </Stack>

            {/* Dialog for adding new rigs */}
            <Dialog open={openAddDialog} onClose={() => setOpenAddDialog(false)}>
                <DialogTitle>Add Radio Rig</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        name="name"
                        margin="dense"
                        label="Name"
                        type="text"
                        fullWidth
                        variant="filled"
                        value={formValues.name}
                        onChange={handleChange}
                    />
                    <TextField
                        name="host"
                        margin="dense"
                        label="Host"
                        type="text"
                        fullWidth
                        variant="filled"
                        value={formValues.host}
                        onChange={handleChange}
                    />
                    <TextField
                        name="port"
                        margin="dense"
                        label="Port"
                        type="number"
                        fullWidth
                        variant="filled"
                        value={formValues.port}
                        onChange={handleChange}
                    />
                    <FormControl margin="dense" fullWidth variant="filled">
                        <InputLabel>Radio Type</InputLabel>
                        <Select
                            name="radiotype"
                            value={formValues.radiotype}
                            onChange={handleChange}
                         variant={'filled'}>
                            <MenuItem value="rx">RX</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl margin="dense" fullWidth variant="filled">
                        <InputLabel>PTT Status</InputLabel>
                        <Select
                            name="pttstatus"
                            value={formValues.pttstatus}
                            onChange={handleChange}
                         variant={'filled'}>
                            <MenuItem value="normal">Normal</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl margin="dense" fullWidth variant="filled">
                        <InputLabel>VFO Type</InputLabel>
                        <Select
                            name="vfotype"
                            value={formValues.vfotype}
                            onChange={handleChange}
                         variant={'filled'}>
                            <MenuItem value="normal">Normal</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        margin="dense"
                        name="lodown"
                        label="LO Down"
                        type="number"
                        fullWidth
                        variant="filled"
                        value={formValues.lodown}
                        onChange={handleChange}
                    />
                    <TextField
                        margin="dense"
                        name="loup"
                        label="LO Up"
                        type="number"
                        fullWidth
                        variant="filled"
                        value={formValues.loup}
                        onChange={handleChange}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenAddDialog(false)} color="primary">
                        Cancel
                    </Button>
                    <Button onClick={() => handleAddNewRig()} color="primary" variant="contained">
                        Submit
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)}>
                <DialogTitle>Confirm Deletion</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete the selected rig(s)?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDeleteConfirm(false)} color="primary">
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            handleDelete();
                            setOpenDeleteConfirm(false);
                        }}
                        color="error"
                    >
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
