import * as React from 'react';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Typography from "@mui/material/Typography";
import {Alert, AlertTitle, Box, FormControl, InputLabel, ListSubheader, MenuItem, Select} from "@mui/material";
import {getSatellitesByGroupId, getSatellitesGroups, getAllSatellites, getSatelliteDataByNoradId} from './tles.jsx';
import {useEffect} from "react";
import {useSocket} from "./socket.jsx";


const columns = [
    { id: 'name', label: 'Name', minWidth: 170 },
    {
        id: 'noradid',
        label: 'NORAD ID',
        minWidth: 170,
        align: 'right',
        format: (value) => value,
    },
    {
        id: 'tleLine1',
        label: 'TLE line 1',
        minWidth: 170,
        align: 'right',
        format: (value) => value.toLocaleString('en-US'),
    },
    {
        id: 'tleLine2',
        label: 'TLE line 2',
        minWidth: 170,
        align: 'right',
        format: (value) => value.toFixed(2),
    },
];

export default function SatelliteTable() {
    const [page, setPage] = React.useState(0);
    const [rowsPerPage, setRowsPerPage] = React.useState(10);
    const [satGroups, setSatGroups] = React.useState(getSatellitesGroups());
    const [satellites, setSatellites] = React.useState([]);
    const [satGroupId, setSatGroupId] = React.useState(null);
    const socket = useSocket();

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(+event.target.value);
        setPage(0);
    };

    React.useEffect(() => {

        console.info(`Fetching satellites from backend... ${new Date().toISOString()}`);
        socket.emit("data_request", "get_satellites", null, (response) => {
            console.log(response); // ok
        });

        setSatellites(getSatellitesByGroupId(satGroupId))
        return () => {
            // Optional cleanup logic
        };
    }, [satGroups]);

    function handleOnGroupChange (event) {
        const groupId = event.target.value;
        setSatGroupId(groupId);
        if (groupId === null) {
            return null;
        } else {
            setSatellites(getSatellitesByGroupId(groupId));
        }
    }
    
    return (
        <Box elevation={3} sx={{ width: '100%', marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>Satellites</AlertTitle>
                Select one satellite group to see the satellites in it
            </Alert>
            <FormControl sx={{ minWidth: 200, marginTop: 2, marginBottom: 1 }} fullWidth variant={"filled"}>
                <InputLabel htmlFor="grouped-select">Select one of the satellite groups</InputLabel>
                <Select defaultValue="" id="grouped-select" label="Grouping" variant={"filled"} onChange={handleOnGroupChange}>
                    <ListSubheader>User defined satellite groups</ListSubheader>
                    {satGroups.map((group, index) => (
                        <MenuItem value={group.id} key={index}>
                            {group.name}
                        </MenuItem>
                    ))}
                    <ListSubheader>Build-in satellite groups</ListSubheader>
                    {satGroups.map((group, index) => (
                        <MenuItem value={group.id} key={index}>
                            {group.name}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
            <TableContainer sx={{ maxHeight: 600, marginTop: 2, minHeight: 600}}>
                <Table stickyHeader aria-label="sticky table">
                    <TableHead>
                        <TableRow>
                            {columns.map((column) => (
                                <TableCell
                                    key={column.id}
                                    align={column.align}
                                    style={{ minWidth: column.minWidth }}
                                >
                                    {column.label}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {satellites.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} align="center">
                                    No satellites available for the selected group.
                                </TableCell>
                            </TableRow>
                        ) : (
                            satellites
                                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                                .map((satellite) => {
                                    return (
                                        <TableRow hover role="checkbox" tabIndex={-1} key={satellite.noradid}>
                                            {columns.map((column) => {
                                                const value = satellite[column.id];
                                                return (
                                                    <TableCell key={column.id} align={column.align}>
                                                        {column.format && typeof value === 'number'
                                                            ? column.format(value)
                                                            : value}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    );
                                })
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination
                rowsPerPageOptions={[10, 25, 100]}
                component="div"
                count={satellites.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
            />
        </Box>
    );
}
