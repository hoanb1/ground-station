
/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */


import * as React from 'react';
import {Alert, AlertTitle, Box, Chip, FormControl, InputLabel, ListSubheader, MenuItem, Select, IconButton} from "@mui/material";
import {useEffect, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import {enqueueSnackbar} from "notistack";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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
    humanizeFrequency, getFrequencyBand, getBandColor
} from '../common/common.jsx';
import SatelliteInfo from "./satellite-info.jsx";
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

    const [showSatelliteInfo, setShowSatelliteInfo] = useState(false);

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

        // {
        //     field: 'transmitters',
        //     headerName: 'Transmitters',
        //     width: 150,
        //     headerAlign: 'center',
        //     align: 'center',
        //     valueGetter: (value, row) => row['transmitters'].length
        // },

        {
            field: 'transmitters',
            minWidth: 220,
            align: 'center',
            headerAlign: 'center',
            headerName: 'Bands',
            sortComparator: (v1, v2) => {
                // Get total transmitter count for comparison
                const count1 = v1 ? v1.length : 0;
                const count2 = v2 ? v2.length : 0;
                return count1 - count2;
            },
            renderCell: (params) => {
                const transmitters = params.value;
                if (!transmitters) {
                    return 'No data';
                }

                // Count transmitters per band
                const bandCounts = transmitters.reduce((acc, t) => {
                    const band = getFrequencyBand(t['downlink_low']);
                    acc[band] = (acc[band] || 0) + 1;
                    return acc;
                }, {});

                const bands = Object.keys(bandCounts);

                return (
                    <div style={{
                        display: 'flex',
                        gap: 4,
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}>
                        {bands.map((band, index) => (
                            <div key={index} style={{display: 'flex', alignItems: 'center', gap: 2}}>
                                <Chip
                                    label={`${band}`}
                                    size="small"
                                    sx={{
                                        height: '18px',
                                        fontSize: '0.65rem',
                                        fontWeight: 'bold',
                                        backgroundColor: getBandColor(band),
                                        color: '#ffffff',
                                        '&:hover': {
                                            filter: 'brightness(90%)',
                                        }
                                    }}
                                />
                                <span>x {bandCounts[band]}</span>
                            </div>
                        ))}
                    </div>
                );
            }
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
        setShowSatelliteInfo(true);
    };

    const handleBackToTable = () => {
        setShowSatelliteInfo(false);
        dispatch(setClickedSatellite(null));
    };

    // If showing satellite info, render full-page satellite info
    if (showSatelliteInfo && clickedSatellite) {
        return (
            <Box sx={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
                {/* Back arrow header */}
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0,
                    flexShrink: 0,
                    marginBottom: 2,
                }}>
                    <IconButton
                        onClick={handleBackToTable}
                        sx={{ marginRight: 2 }}
                        size="large"
                    >
                        <ArrowBackIcon />
                    </IconButton>
                    <Box sx={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                        Back to Satellite Table
                    </Box>
                </Box>

                {/* Satellite info content */}
                <Box sx={{ flex: 1, minHeight: 0, padding: 0 }}>
                    <SatelliteInfo />
                </Box>
            </Box>
        );
    }

    // Regular satellite table view
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
                        minHeight: '429px',
                        width: '100%',
                        overflowX: 'auto',
                        '& .MuiDataGrid-main': {
                            // Add horizontal scrolling for table content
                            overflow: 'auto !important',
                        },
                        '& .MuiDataGrid-virtualScroller': {
                            // Ensure content doesn't get cut off
                            overflow: 'visible !important',
                        },
                        '& .MuiDataGrid-virtualScrollerContent': {
                            // Ensure wide content is accommodated
                            minWidth: 'auto !important',
                        },
                        [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                            outline: 'none',
                        },
                        [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]: {
                            outline: 'none',
                        },
                        [`& .MuiDataGrid-row`]: {
                            cursor: 'pointer',
                        }
                    }}
                />
            </div>
        </Box>
    );
});

export default SatelliteTable;