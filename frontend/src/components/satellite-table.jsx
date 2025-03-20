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
import {betterDateTimes} from "./common.jsx";


const SatelliteTable = React.memo(function () {
    const [page, setPage] = useState(0);
    const [satGroups, setSatGroups] = useState([]);
    const [satellites, setSatellites] = useState([]);
    const [satGroupId, setSatGroupId] = useState("");
    const [selectedRows, setSelectedRows] = useState([]);
    const socket = useSocket();
    const [loading, setLoading] = useState(true);

    const betterStatusValue = (status) => {
        if (status) {
            if (status === "alive") {
                return (
                    <Chip label="Alive" size="small" color="success" variant="outlined" />
                );
            } else if (status === "dead") {
                return (
                    <Chip label="Dead" size="small" color="error" variant="outlined" />
                );
            } else {
                return (status);
            }
        } else {
            return "-";
        }
    };

    const renderCountryFlags = (csvCodes) => {
        if (!csvCodes) return "-";

        const countryCodes = csvCodes.split(',').map(code => code.trim());
        return (
            <div>
                {countryCodes.map((countryCode, index) => (
                    <Tooltip key={index} title={countryCode.toUpperCase()} arrow>
                        <img
                            src={`https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`}
                            alt={countryCode}
                            style={{width: 32, height: 21, borderRadius: 2}}
                        />
                    </Tooltip>
                ))}
            </div>
        );
    };

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
                console.info(params.value);
                if (params.value !== "None") {
                    return params.value;
                } else {
                    return "-";
                }

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
        console.info("row", params);


    };
    
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
                }}
                />
            </div>
        </Box>
    );
});


export default SatelliteTable;