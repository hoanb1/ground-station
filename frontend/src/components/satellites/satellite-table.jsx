import * as React from 'react';
import {Alert, AlertTitle, Box, FormControl, InputLabel, ListSubheader, MenuItem, Select} from "@mui/material";
import {useEffect} from "react";
import {useDispatch, useSelector} from "react-redux";
import {enqueueSnackbar} from "notistack";
import {
    DataGrid,
    gridPageCountSelector,
    GridPagination,
    useGridApiContext,
    useGridSelector,
    gridClasses
} from '@mui/x-data-grid';
import MuiPagination from '@mui/material/Pagination';
import {
    betterDateTimes,
    humanizeDate,
    betterStatusValue,
    renderCountryFlagsCSV,
    humanizeFrequency
} from '../common/common.jsx';
import SatelliteInfoModal from "./satellite-info.jsx";
import {
    fetchSatelliteGroups,
    fetchSatellites,
    setSatGroupId,
    setOpenSatelliteInfoDialog,
    setClickedSatellite,
} from "./satellite-slice.jsx";
import {useSocket} from "../common/socket.jsx";

function Pagination({page, onPageChange, className}) {
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
    const dispatch = useDispatch();
    const {socket} = useSocket();
    const {
        satellites,
        satellitesGroups,
        satGroupId,
        loading,
        clickedSatellite,
        openSatelliteInfoDialog
    } = useSelector((state) => state.satellites);

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
                return renderCountryFlagsCSV(params.value);
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

    useEffect(() => {
        dispatch(fetchSatelliteGroups({socket}));
    }, [dispatch]);

    const handleOnGroupChange = (event) => {
        const groupId = event.target.value;
        dispatch(setSatGroupId(groupId));
        if (groupId !== null) {
            dispatch(fetchSatellites({socket, satGroupId: groupId}))
                .unwrap()
                .then((data) => {
                    enqueueSnackbar(`Successfully loaded ${data.length} satellites`, {
                        variant: 'success'
                    });
                })
                .catch((err) => {
                    enqueueSnackbar("Failed to load satellites: " + err.message, {
                        variant: 'error'
                    })
                });
        }
    };

    const handleRowClick = (params) => {
        dispatch(setClickedSatellite(params.row));
        dispatch(setOpenSatelliteInfoDialog(true));
    };

    const handleDialogClose = function () {
        dispatch(setOpenSatelliteInfoDialog(false));
    };

    return (
        <Box elevation={3} sx={{width: '100%', marginTop: 0}}>
            <Alert severity="info">
                <AlertTitle>Satellites</AlertTitle>
                Select one satellite group to see the satellites in it
            </Alert>
            <FormControl sx={{minWidth: 200, marginTop: 2, marginBottom: 1}} fullWidth variant={"filled"}>
                <InputLabel htmlFor="grouped-select">Select one of the satellite groups</InputLabel>
                <Select disabled={loading} value={satGroupId} id="grouped-select" label="Grouping" variant={"filled"}
                        onChange={handleOnGroupChange}>
                    <ListSubheader>User defined satellite groups</ListSubheader>
                    {satellitesGroups.map((group, index) => {
                        if (group.type === "user") {
                            return <MenuItem value={group.id} key={index}>{group.name} ({group.satellite_ids.length})</MenuItem>;
                        }
                    })}
                    <ListSubheader>Build-in satellite groups</ListSubheader>
                    {satellitesGroups.map((group, index) => {
                        if (group.type === "system") {
                            return <MenuItem value={group.id} key={index}>{group.name} ({group.satellite_ids.length})</MenuItem>;
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
                        pagination: {paginationModel: {pageSize: 10}},
                        sorting: {
                            sortModel: [{field: 'transmitters', sort: 'desc'}],
                        },
                    }}
                    slots={{
                        pagination: CustomPagination,
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
                <SatelliteInfoModal open={openSatelliteInfoDialog} handleClose={handleDialogClose}
                                    selectedSatellite={clickedSatellite}/>
            </div>
        </Box>
    );
});

export default SatelliteTable;