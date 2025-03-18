import * as React from 'react';
import {Alert, AlertTitle, Box, FormControl, InputLabel, ListSubheader, MenuItem, Select} from "@mui/material";
import {useEffect, useState} from "react";
import {useSocket} from "./socket.jsx";
import {DataGrid} from "@mui/x-data-grid";


const SatelliteTable = React.memo(function () {
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [satGroups, setSatGroups] = useState([]);
    const [satellites, setSatellites] = useState([]);
    const [satGroupId, setSatGroupId] = useState(null);
    const [selectedRows, setSelectedRows] = useState([]);
    const socket = useSocket();

    const columns = [
        { field: 'name', headerName: 'Name', width: 200 },
        { field: 'norad_id', headerName: 'ID', width: 150 },
        { field: 'status', headerName: 'Status', width: 150 },
        { field: 'decayed', headerName: 'Decayed', width: 150 },
        { field: 'launched', headerName: 'Launched', width: 150 },
        { field: 'deployed', headerName: 'Deployed', width: 150 },
        { field: 'updated', headerName: 'Updated', width: 200 },
    ];

    const paginationModel = { page: 0, pageSize: 10 };

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(+event.target.value);
        setPage(0);
    };

    useEffect(() => {
        socket.emit("data_request", "get-satellite-groups", null, (response) => {
            if (response['success']) {
                setSatGroups(response.data);
            } else {

            }
        });

        return () => {

        };
    }, []);

    function handleOnGroupChange (event) {
        const groupId = event.target.value;
        setSatGroupId(groupId);
        if (groupId === null) {
            return null;
        } else {
            socket.emit("data_request", "get-satellites-for-group-id", groupId, (response) => {
                if (response['success']) {
                    setSatellites(response.data);
                }
            });
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
            <DataGrid
                getRowId={(satellite) => {
                    return satellite.norad_id;
                }}
                rows={satellites}
                columns={columns}
                initialState={{ pagination: { paginationModel } }}
                pageSizeOptions={[5, 10]}
                checkboxSelection={false}
                onRowSelectionModelChange={(selected) => {
                    setSelectedRows(selected);
                }}
                sx={{ border: 0, marginTop: 2 }}
            />
        </Box>
    );
});


export default SatelliteTable;