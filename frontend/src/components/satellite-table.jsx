import * as React from 'react';
import {Alert, AlertTitle, Box, FormControl, InputLabel, ListSubheader, MenuItem, Select} from "@mui/material";
import {useEffect, useState} from "react";
import {useSocket} from "./socket.jsx";
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import CircularProgress from "@mui/material/CircularProgress";
import {enqueueSnackbar} from "notistack";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import {Chip} from "@mui/material"
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import {betterDateTimes, humanizeDate, betterStatusValue, renderCountryFlags, humanizeFrequency} from './common.jsx';



const SatelliteInfoModal = ({ open, handleClose, selectedSatellite }) => {
    return (
        <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
            <DialogTitle>Satellite Information</DialogTitle>
            <DialogContent>
                {selectedSatellite ? (
                    <Box>
                        <TableContainer>
                            <Table>
                                <TableBody>
                                    <TableRow>
                                        <TableCell><strong>Name</strong></TableCell>
                                        <TableCell>{selectedSatellite['name']}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell><strong>NORAD ID</strong></TableCell>
                                        <TableCell>{selectedSatellite['norad_id']}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell><strong>Status</strong></TableCell>
                                        <TableCell>{betterStatusValue(selectedSatellite['status'])}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell><strong>Countries</strong></TableCell>
                                        <TableCell>{renderCountryFlags(selectedSatellite['countries'])}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell><strong>Operator</strong></TableCell>
                                        <TableCell>{selectedSatellite['operator'] || '-'}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell><strong>Launched</strong></TableCell>
                                        <TableCell>{betterDateTimes(selectedSatellite['launched'])}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell><strong>Deployed</strong></TableCell>
                                        <TableCell>{betterDateTimes(selectedSatellite['deployed'])}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell><strong>Decayed</strong></TableCell>
                                        <TableCell>{betterDateTimes(selectedSatellite['decayed'])}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell><strong>Updated</strong></TableCell>
                                        <TableCell>{betterDateTimes(selectedSatellite['updated'])}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>

                        {/* Existing transmitters table remains unchanged */}
                        <Box mt={2}>
                            <h3>Transmitters</h3>
                            {selectedSatellite['transmitters'] && selectedSatellite['transmitters'].length ? (
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow style={{fontWeight: 'bold', backgroundColor: '#121212' }}>
                                                <TableCell><strong>Description</strong></TableCell>
                                                <TableCell><strong>Type</strong></TableCell>
                                                <TableCell><strong>Status</strong></TableCell>
                                                <TableCell><strong>Alive</strong></TableCell>
                                                <TableCell><strong>Uplink low</strong></TableCell>
                                                <TableCell><strong>Uplink high</strong></TableCell>
                                                <TableCell><strong>Uplink drift</strong></TableCell>
                                                <TableCell><strong>Downlink low</strong></TableCell>
                                                <TableCell><strong>Downlink high</strong></TableCell>
                                                <TableCell><strong>Downlink drift</strong></TableCell>
                                                <TableCell><strong>Mode</strong></TableCell>
                                                <TableCell><strong>Uplink mode</strong></TableCell>
                                                <TableCell><strong>Invert</strong></TableCell>
                                                <TableCell><strong>Baud</strong></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {selectedSatellite['transmitters'].map((transmitter, index) => (
                                                <TableRow key={index}>
                                                    <TableCell>{transmitter['description']}</TableCell>
                                                    <TableCell>{transmitter['type']}</TableCell>
                                                    <TableCell>{transmitter['status']}</TableCell>
                                                    <TableCell>{transmitter['alive'] || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['uplink_low']) || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['uplink_high']) || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['uplink_drift']) || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['downlink_low']) || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['downlink_high']) || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['downlink_drift']) || "-"}</TableCell>
                                                    <TableCell>{transmitter['mode'] || "-"}</TableCell>
                                                    <TableCell>{transmitter['uplink_mode'] || "-"}</TableCell>
                                                    <TableCell>{transmitter['invert'] || "-"}</TableCell>
                                                    <TableCell>{transmitter['baud'] || "-"}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : (
                                <div style={{textAlign: 'center'}}>
                                    <span>No Transmitters Available</span>
                                </div>
                            )}
                        </Box>
                    </Box>
                ) : (
                    <span>No Satellite Data Available</span>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} color="primary">Close</Button>
            </DialogActions>
        </Dialog>
    );
};




const SatelliteTable = React.memo(function () {
    const [page, setPage] = useState(0);
    const [satGroups, setSatGroups] = useState([]);
    const [satellites, setSatellites] = useState([]);
    const [satGroupId, setSatGroupId] = useState("");
    const [selectedRows, setSelectedRows] = useState([]);
    const socket = useSocket();
    const [loading, setLoading] = useState(true);
    const [satelliteInfoDialogOpen, setSatelliteInfoDialogOpen] = useState(false);
    const [clickedSatellite, setClickedSatellite] = useState({});


    const columns = [
        {
            field: 'name',
            headerName: 'Name',
            width: 200,
        },
        {
            field: 'norad_id',
            headerName: 'NORAD ID',
            width: 100,
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 100,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => {
                return betterStatusValue(params.value);
            },
        },
        {
            field: 'countries',
            headerName: 'Countries',
            width: 100,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => {
                return renderCountryFlags(params.value);
            },
        },
        {
            field: 'operator',
            headerName: 'Operator',
            width: 100,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => {
                if (params.value !== "None") {
                    return params.value;
                } else {
                    return "-";
                }
            },
        },
        {
            field: 'transmitters',
            headerName: 'Transmitters',
            width: 150,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => {
                return params.row['transmitters'].length;
            },
        },
        {
            field: 'decayed',
            headerName: 'Decayed',
            width: 150,
            renderCell: (params) => {
                return betterDateTimes(params.value);
            },
        },
        {
            field: 'launched',
            headerName: 'Launched',
            width: 150,
            renderCell: (params) => {
                return betterDateTimes(params.value);
            },
        },
        {
            field: 'deployed',
            headerName: 'Deployed',
            width: 150,
            renderCell: (params) => {
                return betterDateTimes(params.value);
            },
        },
        {
            field: 'updated',
            headerName: 'Updated',
            width: 150,
            renderCell: (params) => {
                return betterDateTimes(params.value);
            },
        },
    ];

    const paginationModel = { page: 0, pageSize: 10 };

    function fetchSatelliteGroups() {
        setLoading(true);
        socket.emit("data_request", "get-satellite-groups", null, (response) => {
            if (response['success']) {
                setSatGroups(response.data);
                setSatGroupId(response.data[0].id);
                fetchSatellites(response.data[0].id);
            } else {
                enqueueSnackbar('Failed to get satellites groups', {
                    variant: 'error',
                    autoHideDuration: 5000,
                })
            }
            setLoading(false);
        });
    }

    useEffect(() => {
        fetchSatelliteGroups();
        return () => {

        };
    }, []);

    function fetchSatellites(groupId) {
        setLoading(true);
        socket.emit("data_request", "get-satellites-for-group-id", groupId, (response) => {
            if (response['success']) {
                setSatellites(response.data);
            } else {
                enqueueSnackbar('Failed to set satellites for group id: ' + groupId + '', {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
            setLoading(false);
        });
    }

    function handleOnGroupChange (event) {
        const groupId = event.target.value;
        setSatGroupId(groupId);
        if (groupId === null) {
            return null;
        } else {
            fetchSatellites(groupId);
        }
    }

    const handleRowClick = (params) => {
        setSatelliteInfoDialogOpen(true);
        setClickedSatellite(params.row)
    };

    const handleDialogClose = function () {
        setSatelliteInfoDialogOpen(false);
    }
    
    return (
        <Box elevation={3} sx={{ width: '100%', marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>Satellites</AlertTitle>
                Select one satellite group to see the satellites in it
            </Alert>
            <FormControl sx={{ minWidth: 200, marginTop: 2, marginBottom: 1 }} fullWidth variant={"filled"}>
                <InputLabel htmlFor="grouped-select">Select one of the satellite groups</InputLabel>
                <Select disabled={loading} value={satGroupId} id="grouped-select" label="Grouping" variant={"filled"} onChange={handleOnGroupChange}>
                    <ListSubheader>User defined satellite groups</ListSubheader>
                    {satGroups.map((group, index) => {
                        if (group.type === "user") {
                            return <MenuItem value={group.id} key={index}>{group.name}</MenuItem>;
                        }
                    })}
                    <ListSubheader>Build-in satellite groups</ListSubheader>
                    {satGroups.map((group, index) => {
                        if (group.type === "system") {
                            return <MenuItem value={group.id} key={index}>{group.name}</MenuItem>;
                        }
                    })}
                </Select>
            </FormControl>
            <div>
                <DataGrid
                    onRowClick={handleRowClick}
                    getRowId={(satellite) => {
                        return satellite['norad_id'];
                    }}
                    rows={satellites}
                    columns={columns}
                    initialState={{ pagination: { paginationModel } }}
                    pageSizeOptions={[5, 10, 20, 50, 100]}
                    checkboxSelection={false}
                    onRowSelectionModelChange={(selected) => {
                        setSelectedRows(selected);
                    }}
                    sx={{
                        border: 0,
                        marginTop: 2,
                        minHeight: '629px',
                        [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                            outline: 'none',
                        },
                        [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]:
                            {
                                outline: 'none',
                            },
                        [`& .MuiDataGrid-row`]: {
                            cursor: 'pointer',
                        }
                    }}
                />
                <SatelliteInfoModal open={satelliteInfoDialogOpen} handleClose={handleDialogClose} selectedSatellite={clickedSatellite}/>
            </div>
        </Box>
    );
});


export default SatelliteTable;