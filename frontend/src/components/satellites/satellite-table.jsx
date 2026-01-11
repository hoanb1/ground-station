/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
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
import {Alert, AlertTitle, Box, Chip, FormControl, InputLabel, ListSubheader, MenuItem, Select, TextField, InputAdornment, IconButton} from "@mui/material";
import {useEffect, useState, useCallback} from "react";
import {useDispatch, useSelector} from "react-redux";
import { toast } from '../../utils/toast-with-timestamp.jsx';
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
    betterStatusValue,
    renderCountryFlagsCSV,
    getFrequencyBand, getBandColor
} from '../common/common.jsx';
import {
    fetchSatelliteGroups,
    fetchSatellites,
    searchSatellites,
    setSatGroupId,
    setSearchKeyword,
    setClickedSatellite,
} from "./satellite-slice.jsx";
import {useSocket} from "../common/socket.jsx";
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

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

const SatelliteTable = React.memo(function SatelliteTable() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const {socket} = useSocket();
    const { t } = useTranslation('satellites');
    const {
        satellites,
        satellitesGroups,
        satGroupId,
        searchKeyword,
        loading,
    } = useSelector((state) => state.satellites);

    const [localSearchValue, setLocalSearchValue] = useState('');

    // Get timezone preference
    const timezone = useSelector((state) => {
        const tzPref = state.preferences?.preferences?.find(p => p.name === 'timezone');
        return tzPref?.value || 'UTC';
    });

    const columns = [
        {
            field: 'name',
            headerName: t('satellite_database.name'),
            width: 200,
        },
        {
            field: 'norad_id',
            headerName: t('satellite_database.norad_id'),
            width: 100,
        },
        {
            field: 'status',
            headerName: t('satellite_database.status'),
            width: 100,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => {
                return betterStatusValue(params.value);
            },
        },
        {
            field: 'countries',
            headerName: t('satellite_database.countries'),
            width: 100,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => {
                return renderCountryFlagsCSV(params.value);
            },
        },
        {
            field: 'operator',
            headerName: t('satellite_database.operator'),
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
            minWidth: 220,
            align: 'center',
            headerAlign: 'center',
            headerName: t('satellite_database.bands'),
            sortComparator: (v1, v2) => {
                // Get total transmitter count for comparison
                const count1 = v1 ? v1.length : 0;
                const count2 = v2 ? v2.length : 0;
                return count1 - count2;
            },
            renderCell: (params) => {
                const transmitters = params.value;
                if (!transmitters) {
                    return t('satellite_database.no_data');
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
            headerName: t('satellite_database.decayed'),
            width: 150,
            renderCell: (params) => {
                return betterDateTimes(params.value, timezone);
            },
        },
        {
            field: 'launched',
            headerName: t('satellite_database.launched'),
            width: 150,
            renderCell: (params) => {
                return betterDateTimes(params.value, timezone);
            },
        },
        {
            field: 'deployed',
            headerName: t('satellite_database.deployed'),
            width: 150,
            renderCell: (params) => {
                return betterDateTimes(params.value, timezone);
            },
        },
        {
            field: 'updated',
            headerName: t('satellite_database.updated'),
            width: 150,
            renderCell: (params) => {
                return betterDateTimes(params.value, timezone);
            },
        },
    ];

    useEffect(() => {
        dispatch(fetchSatelliteGroups({socket}));
    }, [dispatch]);

    // Debounced search effect
    useEffect(() => {
        if (localSearchValue.length >= 3) {
            const timeoutId = setTimeout(() => {
                // Only search if the keyword actually changed
                if (localSearchValue !== searchKeyword) {
                    dispatch(setSearchKeyword(localSearchValue));
                    dispatch(searchSatellites({socket, keyword: localSearchValue}));
                }
            }, 500); // 500ms debounce delay

            return () => clearTimeout(timeoutId);
        } else if (localSearchValue.length === 0 && searchKeyword !== '') {
            // Clear search when input is empty
            dispatch(setSearchKeyword(''));
            dispatch(setSatGroupId(''));
        }
    }, [localSearchValue, dispatch, socket, searchKeyword, t]);

    const handleOnGroupChange = (event) => {
        const groupId = event.target.value;
        dispatch(setSatGroupId(groupId));
        // Clear search when selecting a group
        setLocalSearchValue('');
        dispatch(setSearchKeyword(''));

        if (groupId !== null) {
            dispatch(fetchSatellites({socket, satGroupId: groupId}))
                .unwrap()
                .then((data) => {
                    toast.success(t('satellite_database.loaded_success', { count: data.length }));
                })
                .catch((err) => {
                    toast.error(t('satellite_database.failed_load') + ": " + err.message)
                });
        }
    };

    const handleSearchChange = (event) => {
        setLocalSearchValue(event.target.value);
    };

    const handleClearSearch = () => {
        setLocalSearchValue('');
        dispatch(setSearchKeyword(''));
        dispatch(setSatGroupId(''));
    };

    const handleRowClick = (params) => {
        // Set the clicked satellite in Redux store
        dispatch(setClickedSatellite(params.row));
        // Navigate to the satellite detail page
        navigate(`/satellite/${params.row.norad_id}`);
    };

    return (
        <Box elevation={3} sx={{width: '100%', marginTop: 0}}>
            <Alert severity="info">
                <AlertTitle>{t('satellite_database.title')}</AlertTitle>
                {t('satellite_database.subtitle')}
            </Alert>
            <Box sx={{ display: 'flex', gap: 2, marginTop: 2, marginBottom: 1 }}>
                <FormControl sx={{minWidth: 200, flex: 1}} variant={"filled"}>
                    <InputLabel htmlFor="grouped-select">{t('satellite_database.select_group')}</InputLabel>
                    <Select
                        disabled={loading || searchKeyword !== ''}
                        value={satGroupId}
                        id="grouped-select"
                        label="Grouping"
                        variant={"filled"}
                        onChange={handleOnGroupChange}
                    >
                        <ListSubheader>{t('satellite_database.user_groups')}</ListSubheader>
                        {satellitesGroups.filter(group => group.type === "user").length === 0 ? (
                            <MenuItem disabled value="">
                                {t('satellite_database.none_defined')}
                            </MenuItem>
                        ) : (
                            satellitesGroups.map((group, index) => {
                                if (group.type === "user") {
                                    return <MenuItem value={group.id} key={index}>{group.name} ({group.satellite_ids.length})</MenuItem>;
                                }
                            })
                        )}
                        <ListSubheader>{t('satellite_database.builtin_groups')}</ListSubheader>
                        {satellitesGroups.filter(group => group.type === "system").length === 0 ? (
                            <MenuItem disabled value="">
                                {t('satellite_database.none_defined')}
                            </MenuItem>
                        ) : (
                            satellitesGroups.map((group, index) => {
                                if (group.type === "system") {
                                    return <MenuItem value={group.id} key={index}>{group.name} ({group.satellite_ids.length})</MenuItem>;
                                }
                            })
                        )}
                    </Select>
                </FormControl>
                <TextField
                    sx={{ minWidth: 200, flex: 1 }}
                    variant="filled"
                    label={t('satellite_database.search_satellites')}
                    value={localSearchValue}
                    onChange={handleSearchChange}
                    disabled={loading || satGroupId !== ''}
                    placeholder={t('satellite_database.search_placeholder')}
                    helperText={localSearchValue.length > 0 && localSearchValue.length < 3 ? t('satellite_database.search_min_chars') : ''}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                        endAdornment: localSearchValue && (
                            <InputAdornment position="end">
                                <IconButton
                                    aria-label="clear search"
                                    onClick={handleClearSearch}
                                    edge="end"
                                    size="small"
                                >
                                    <ClearIcon />
                                </IconButton>
                            </InputAdornment>
                        ),
                    }}
                />
            </Box>
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
                    localeText={{
                        noRowsLabel: t('satellite_database.no_satellites')
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
                        },
                        '& .MuiDataGrid-overlay': {
                            fontSize: '0.875rem',
                            fontStyle: 'italic',
                            color: 'text.secondary',
                        },
                    }}
                />
            </div>
        </Box>
    );
});

export default SatelliteTable;