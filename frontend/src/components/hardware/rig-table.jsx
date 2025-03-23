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
    const [order, setOrder] = useState('asc');
    const [orderBy, setOrderBy] = useState('name');
    const [selected, setSelected] = useState([]);
    const [page, setPage] = useState(0);
    const [dense, setDense] = useState(false);
    const [rowsPerPage, setRowsPerPage] = useState(5);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [openAddDialog, setOpenAddDialog] = useState(false);
    const [formValues, setFormValues] = useState({
        name: "",
        host: "localhost",
        port: 4532,
        radiotype: "rx",
        pttstatus: "normal",
        vfotype: "normal",
        lodown: 0,
        loup: 0,
    });

    const handleRequestSort = (event, property) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleSelectAllClick = (event) => {
        if (event.target.checked) {
            const newSelected = rigs.map((n) => n.id);
            setSelected(newSelected);
            return;
        }
        setSelected([]);
    };

    const handleClick = (event, id) => {
        const selectedIndex = selected.indexOf(id);
        let newSelected = [];

        if (selectedIndex === -1) {
            newSelected = newSelected.concat(selected, id);
        } else if (selectedIndex === 0) {
            newSelected = newSelected.concat(selected.slice(1));
        } else if (selectedIndex === selected.length - 1) {
            newSelected = newSelected.concat(selected.slice(0, -1));
        } else if (selectedIndex > 0) {
            newSelected = newSelected.concat(
                selected.slice(0, selectedIndex),
                selected.slice(selectedIndex + 1),
            );
        }
        setSelected(newSelected);
    };

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    // Avoid a layout jump when reaching the last page with empty rows.
    const emptyRows =
        page > 0 ? Math.max(0, (1 + page) * rowsPerPage - rigs.length) : 0;

    const visibleRows = useMemo(
        () =>
            [...rigs]
                .sort(getComparator(order, orderBy))
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
        [order, orderBy, page, rowsPerPage],
    );

    function handleDelete() {

    }

    useEffect(() => {
        socket.emit('data_request', 'get-rigs', null, (response) => {
            if (response.success === true) {
                setRigs(response.data);
            } else {
                enqueueSnackbar('Failed to add rig', {
                    variant: 'error',
                    autoHideDuration: 5000
                });
            }
        });

        return () => {
            // Cleanup logic goes here
        };
    }, []);

    function handleAddNewRig() {
        socket.emit('data_submission', 'submit-rig', formValues, (response) => {
            if (response.success === true) {
                setOpenAddDialog(false);
                setRigs(response.data);
                enqueueSnackbar('Rig added successfully', {
                    variant: 'success',
                    autoHideDuration: 5000
                });
            } else {
                enqueueSnackbar('Failed to add rig', {
                    variant: 'error',
                    autoHideDuration: 5000
                });
            }
        });
    }

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormValues({ ...formValues, [name]: value });
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Paper sx={{ width: '100%', mb: 2 }}>
                <EnhancedTableToolbar numSelected={selected.length} />
                <TableContainer>
                    <Table
                        sx={{ minWidth: 750 }}
                        aria-labelledby="tableTitle"
                        size={'medium'}
                    >
                        <EnhancedTableHead
                            numSelected={selected.length}
                            order={order}
                            orderBy={orderBy}
                            onSelectAllClick={handleSelectAllClick}
                            onRequestSort={handleRequestSort}
                            rowCount={rigs.length}
                        />
                        <TableBody>
                            {visibleRows.map((row, index) => {
                                const isItemSelected = selected.includes(row.id);
                                const labelId = `enhanced-table-checkbox-${index}`;

                                return (
                                    <TableRow
                                        hover
                                        onClick={(event) => handleClick(event, row.id)}
                                        role="checkbox"
                                        aria-checked={isItemSelected}
                                        tabIndex={-1}
                                        key={row.id}
                                        selected={isItemSelected}
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                color="primary"
                                                checked={isItemSelected}
                                                inputProps={{
                                                    'aria-labelledby': labelId,
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell
                                            component="th"
                                            id={labelId}
                                            scope="row"
                                            padding="none"
                                        >
                                            {row.name}
                                        </TableCell>
                                        <TableCell align="left">{row.host}</TableCell>
                                        <TableCell align="right">{row.port}</TableCell>
                                        <TableCell align="left">{row.radiotype}</TableCell>
                                        <TableCell align="right">{row.pttstatus}</TableCell>
                                        <TableCell align="right">{row.vfotype}</TableCell>
                                        <TableCell align="right">{row.lodown}</TableCell>
                                        <TableCell align="right">{row.loup}</TableCell>
                                    </TableRow>
                                );
                            })}
                            {emptyRows > 0 && (
                                <TableRow
                                    style={{
                                        height: (dense ? 33 : 53) * emptyRows,
                                    }}
                                >
                                    <TableCell colSpan={6} />
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination
                    rowsPerPageOptions={[5, 10, 25]}
                    component="div"
                    count={rigs.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                />
            </Paper>
            <Stack direction="row" spacing={2}>
                <Button variant="contained" onClick={() => setOpenAddDialog(true)}>
                    Add
                </Button>
                <Dialog open={openAddDialog} onClose={() => setOpenAddDialog(false)}>
                    <DialogTitle>Add Radio Rig</DialogTitle>
                    <DialogContent>
                        <TextField
                            autoFocus
                            name="name"
                            margin="dense"
                            id="name"
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
                            id="host"
                            label="Host"
                            type="text"
                            fullWidth
                            value={formValues.host}
                            variant="filled"
                            onChange={handleChange}
                        />
                        <TextField
                            name="port"
                            margin="dense"
                            id="port"
                            label="Port"
                            type="number"
                            value={formValues.port}
                            fullWidth
                            variant="filled"
                            onChange={handleChange}
                        />
                        <FormControl margin="dense" fullWidth variant="filled">
                            <InputLabel htmlFor="radiotype">Radio Type</InputLabel>
                            <Select
                                name="radiotype"
                                id="radiotype"
                                label="Radio Type"
                                value={formValues.radiotype}
                                onChange={handleChange}
                             variant={'filled'}>
                                <MenuItem value="rx">RX</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl style={{marginTop: 5}} fullWidth variant="filled">
                            <InputLabel htmlFor="grouped-select">PTT status</InputLabel>
                            <Select
                                id="pttstatus"
                                label="PTT Status"
                                name="pttstatus"
                                value={'normal'}
                                onChange={handleChange}
                             variant={'filled'}>
                                <MenuItem value={"normal"}>Normal</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl margin="dense" fullWidth variant="filled">
                            <InputLabel htmlFor="vfotype">VFO Type</InputLabel>
                            <Select
                                id="vfotype"
                                name="vfotype"
                                value={formValues.vfotype}
                                variant="filled"
                                onChange={handleChange}
                            >
                                <MenuItem value="normal">Normal</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField
                            margin="dense"
                            id="lodown"
                            name="lodown"
                            label="Frequency of local oscillator on the downconverter if used"
                            type="number"
                            onChange={handleChange}
                            fullWidth
                            variant="filled"
                            value={formValues.lodown}
                        />
                        <TextField
                            name="loup"
                            margin="dense"
                            id="loup"
                            label="Frequency of local oscillator on the upconverter if used"
                            type="number"
                            onChange={handleChange}
                            fullWidth
                            variant="filled"
                            value={formValues.loup}
                        />
                    </DialogContent>
                    <DialogActions style={{margin: '0px 20px 20px 0px'}}>
                        <Button onClick={() => setOpenAddDialog(false)} color="primary">
                            Cancel
                        </Button>
                        <Button onClick={() => handleAddNewRig()} color="primary" variant="contained">
                            Submit
                        </Button>
                    </DialogActions>
                </Dialog>
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
                <Dialog
                    open={openDeleteConfirm}
                    onClose={() => setOpenDeleteConfirm(false)}
                >
                    <DialogTitle>{"Confirm Deletion"}</DialogTitle>
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
            </Stack>
        </Box>
    );
}