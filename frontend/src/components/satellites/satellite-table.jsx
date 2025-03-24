import * as React from 'react';
import {Alert, AlertTitle, Box, FormControl, InputLabel, ListSubheader, MenuItem, Select} from "@mui/material";
import {useEffect, useState} from "react";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";
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
import {
    DataGrid,
    gridPageCountSelector,
    GridPagination,
    useGridApiContext,
    useGridSelector,
    gridClasses
} from '@mui/x-data-grid';
import MuiPagination from '@mui/material/Pagination';
import {betterDateTimes, humanizeDate, betterStatusValue, renderCountryFlags, humanizeFrequency} from '../common/common.jsx';
import SatelliteInfoModal from "./satellite-info.jsx";


function Pagination({ page, onPageChange, className }) {
    const apiRef = useGridApiContext();
    const pageCount = useGridSelector(apiRef, gridPageCountSelector);

    return (
        <MuiPagination
            color="primary"
            className={className}
            count={pageCount}
            page={page + 1}
            onChange={(event, newPage) => {
                onPageChange(event, newPage - 1);
            }}
        />
    );
}

function CustomPagination(props) {
    return <GridPagination ActionsComponent={Pagination} {...props} />;
}


const SatelliteTable = React.memo(function () {
    const [page, setPage] = useState(0);
    const [satGroups, setSatGroups] = useState([]);
    const [satellites, setSatellites] = useState([]);
    const [satGroupId, setSatGroupId] = useState("");
    const [selectedRows, setSelectedRows] = useState([]);
    const { socket } = useSocket();
    const [loading, setLoading] = useState(false);
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
            valueGetter: (value, row) => row['transmitters'].length
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
                    loading={loading}
                    rows={satellites}
                    columns={columns}
                    pageSizeOptions={[5, 10, 20, 50, 100]}
                    checkboxSelection={false}
                    initialState={{
                        pagination: { paginationModel: { pageSize: 10 } },
                        sorting: {
                            sortModel: [{ field: 'transmitters', sort: 'desc' }],
                        },
                    }}
                    slots={{
                        pagination: CustomPagination,
                    }}
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