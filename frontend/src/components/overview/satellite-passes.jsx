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


import React, {useEffect, useMemo, useRef, useState} from "react";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";
import {
    formatWithZeros,
    getClassNamesBasedOnGridEditing,
    getTimeFromISO,
    humanizeFutureDateInMinutes,
    TitleBar,
    getFrequencyBand,
    getBandColor,
} from "../common/common.jsx";
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import {useDispatch, useSelector} from "react-redux";
import {
    fetchNextPassesForGroup,
    fetchSatelliteGroups,
    fetchSatellitesByGroupId,
    setPasses,
    setSelectedSatelliteId,
} from './overview-slice.jsx';
import {Typography} from '@mui/material';
import {useGridApiRef} from '@mui/x-data-grid';
import {darken, lighten, styled} from '@mui/material/styles';
import {Chip} from "@mui/material";
import {useStore} from 'react-redux';
import SkyPositionFormatter from './skyposition-widget.jsx';
import ProgressFormatter from "./progressbar-widget.jsx";


const TimeFormatter = React.memo(({params, value}) => {
    const [, setForceUpdate] = useState(0);

    // Force component to update regularly
    useEffect(() => {
        const interval = setInterval(() => {
            setForceUpdate(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    if (params.row.is_geostationary || params.row.is_geosynchronous) {
        return "∞";
    }

    return `${getTimeFromISO(value)} (${humanizeFutureDateInMinutes(value)})`;
});


const DurationFormatter = React.memo(({params, value, event_start, event_end}) => {
    const [, setForceUpdate] = useState(0);

    // Force component to update regularly
    useEffect(() => {
        const interval = setInterval(() => {
            setForceUpdate(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const now = new Date();
    const startDate = new Date(event_start);
    const endDate = new Date(event_end);

    if (params.row.is_geostationary || params.row.is_geosynchronous) {
        return "∞";
    }

    if (startDate > now) {
        // Pass is in the future
        const diffInSeconds = Math.floor((endDate - startDate) / 1000);
        const minutes = Math.floor(diffInSeconds / 60);
        const seconds = diffInSeconds % 60;
        return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;

    } else if (endDate < now) {
        // Pass ended
        const diffInSeconds = Math.floor((endDate - startDate) / 1000);
        const minutes = Math.floor(diffInSeconds / 60);
        const seconds = diffInSeconds % 60;
        return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;

    } else if (startDate < now < endDate) {
        // Passing now
        const diffInSeconds = Math.floor((endDate - now) / 1000);
        const minutes = Math.floor(diffInSeconds / 60);
        const seconds = diffInSeconds % 60;
        return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;

    } else {
        return `no value`;
    }
});

const MemoizedStyledDataGrid = React.memo(({passes, passesLoading, onRowClick, passesAreCached = false}) => {
    const apiRef = useGridApiRef();
    const store = useStore();

    // This method allows us to reference values in redux without a re-render, crucial in the next passes table
    const targetSatTrackRef = useRef(() => {
        const state = store.getState();
        return state.targetSatTrack;
    });

    const getBackgroundColor = (color, theme, coefficient) => ({
        backgroundColor: darken(color, coefficient),
        ...theme.applyStyles('light', {
            backgroundColor: lighten(color, coefficient),
        }),
    });

    const StyledDataGrid = styled(DataGrid)(({theme}) => ({
        '& .passes-cell-passing': {
            ...getBackgroundColor(theme.palette.success.main, theme, 0.7),
            '&:hover': {
                ...getBackgroundColor(theme.palette.success.main, theme, 0.6),
            },
            '&.Mui-selected': {
                ...getBackgroundColor(theme.palette.success.main, theme, 0.5),
                '&:hover': {
                    ...getBackgroundColor(theme.palette.success.main, theme, 0.4),
                },
            },
        },
        '& .passes-cell-passed': {
            ...getBackgroundColor(theme.palette.info.main, theme, 0.7),
            '&:hover': {
                ...getBackgroundColor(theme.palette.info.main, theme, 0.6),
            },
            '&.Mui-selected': {
                ...getBackgroundColor(theme.palette.info.main, theme, 0.5),
                '&:hover': {
                    ...getBackgroundColor(theme.palette.info.main, theme, 0.4),
                },
            },
            textDecoration: 'line-through',
        },
        '& .passes-cell-warning': {
            color: theme.palette.error.main,
            textDecoration: 'line-through',
        },
        '& .passes-cell-success': {
            color: theme.palette.success.main,
            fontWeight: 'bold',
            textDecoration: 'underline',
        },
        '& .passes-cell-active': {
            ...getBackgroundColor(theme.palette.secondary.dark, theme, 0.7),
            fontWeight: 'bold',
            '&:hover': {
                ...getBackgroundColor(theme.palette.secondary.main, theme, 0.6),
            },
            '&.Mui-selected': {
                ...getBackgroundColor(theme.palette.secondary.main, theme, 0.5),
                '&:hover': {
                    ...getBackgroundColor(theme.palette.secondary.main, theme, 0.4),
                },
            },
        }
    }));

    useEffect(() => {
        const intervalId = setInterval(() => {
            const rowIds = apiRef.current.getAllRowIds();
            rowIds.forEach((rowId) => {

                // Access the row model
                const rowNode = apiRef.current.getRowNode(rowId);
                if (!rowNode) {
                    return;
                }

                // Update only the row model in the grid's internal state
                apiRef.current.updateRows([{
                    id: rowId,
                    _rowClassName: ''
                }]);
            });
        }, 1000);

        return () => {
            clearInterval(intervalId);
        };
    }, []);

    const columns = [
        {
            field: 'name',
            minWidth: 120,
            headerName: 'Name',
            flex: 2,
            renderCell: (params) => {
                const targetSatTrack = targetSatTrackRef.current();
                return <>
                    {params.value}
                    {targetSatTrack.satelliteData['details']['name'] === params.value && (
                        <Typography component="span" sx={{
                            ml: 0.5,
                            fontSize: '1.1rem',
                        }}>⦿</Typography>
                    )}
                </>;
            }
        },
        {
            field: 'peak_altitude',
            minWidth: 80,
            headerName: 'Max elevation',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            valueFormatter: (value) => {
                return `${parseFloat(value).toFixed(2)}°`;
            },
            cellClassName: (params) => {
                if (params.value < 10.0) {
                    return "passes-cell-warning";
                } else if (params.value > 45.0) {
                    return "passes-cell-success";
                } else {
                    return '';
                }
            }
        },
        {
            field: 'progress',
            minWidth: 100,
            headerName: 'Progress',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            renderCell: (params) => <ProgressFormatter params={params} />
        },
        {
            field: 'skyPosition',
            minWidth: 80,
            headerName: 'Sky Position',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            renderCell: (params) => <SkyPositionFormatter params={params} />
        },
        {
            field: 'duration',
            minWidth: 100,
            headerName: 'Duration',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            renderCell: (params) => (
                <div>
                    <DurationFormatter params={params} value={params.value} event_start={params.row.event_start}
                                       event_end={params.row.event_end}/>
                </div>
            )
            // valueFormatter: (value) => {
            //     return value.split('.')[0];
            // }
        },
        {
            field: 'transmitters',
            minWidth: 120,
            align: 'center',
            headerAlign: 'center',
            headerName: 'Bands',
            flex: 2,
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
                    <div style={{display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center'}}>
                        {bands.map((band, index) => (
                            <>
                                {bandCounts[band]} ✕ <Chip
                                    key={index}
                                    label={`${band}`}
                                    size="small"
                                    sx={{
                                        mt: '8px',
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
                            </>
                        ))}
                    </div>
                );
            }
        },
        {
            field: 'event_start',
            minWidth: 170,
            headerName: 'Start',
            flex: 2,
            renderCell: (params) => <TimeFormatter params={params} value={params.value}/>
            // valueFormatter: (value) => {
            //     return `${getTimeFromISO(value)} (${humanizeFutureDateInMinutes(value)})`;
            // }
        },
        {
            field: 'event_end',
            minWidth: 170,
            headerName: 'End',
            flex: 2,
            renderCell: (params) => <TimeFormatter params={params} value={params.value}/>
            // valueFormatter: (value) => {
            //     return `${getTimeFromISO(value)} (${humanizeFutureDateInMinutes(value)})`;
            // }
        },
        {
            field: 'distance_at_start',
            minWidth: 100,
            headerName: 'Distance at AOS',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            valueFormatter: (value) => {
                return `${parseFloat(value).toFixed(2)} km`
            }
        },
        {
            field: 'distance_at_end',
            minWidth: 100,
            headerName: 'Distance at LOS',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            valueFormatter: (value) => {
                return `${parseFloat(value).toFixed(2)} km`
            }
        },
        {
            field: 'distance_at_peak',
            minWidth: 100,
            headerName: 'Distance at peak',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            valueFormatter: (value) => {
                return `${parseFloat(value).toFixed(2)} km`
            }
        },
        {
            field: 'is_geostationary',
            minWidth: 70,
            headerName: 'GEO Stat',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            valueFormatter: (value) => {
                return value ? 'Yes' : 'No';
            },
            hide: true,
        },
        {
            field: 'is_geosynchronous',
            minWidth: 70,
            headerName: 'GEO Sync',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            valueFormatter: (value) => {
                return value ? 'Yes' : 'No';
            },
            hide: true,
        },
    ];

    const getPassesRowStyles = (param) => {
        if (param.row) {
            const targetSatTrack = targetSatTrackRef.current();
            if (targetSatTrack.satelliteData['details']['norad_id'] === param.row['norad_id']) {
                if (new Date(param.row['event_start']) < new Date() && new Date(param.row['event_end']) < new Date()) {
                    return "passes-cell-passed pointer-cursor";
                } else if (new Date(param.row['event_start']) < new Date() && new Date(param.row['event_end']) > new Date()) {
                    return "passes-cell-active passes-cell-passing pointer-cursor";
                } else {
                    return "pointer-cursor";
                }
            } else {
                if (new Date(param.row['event_start']) < new Date() && new Date(param.row['event_end']) < new Date()) {
                    return "passes-cell-passed pointer-cursor";
                } else if (new Date(param.row['event_start']) < new Date() && new Date(param.row['event_end']) > new Date()) {
                    return "passes-cell-passing pointer-cursor";
                } else {
                    return "pointer-cursor";
                }
            }
        }
    }

    return (
        <StyledDataGrid
            apiRef={apiRef}
            pageSizeOptions={[5, 10, 15, 20]}
            fullWidth={true}
            loading={passesLoading}
            getRowClassName={getPassesRowStyles}
            onRowClick={onRowClick}
            getRowId={(params) => {
                return params.id;
            }}
            sx={{
                border: 0,
                marginTop: 0,
                [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                    outline: 'none',
                },
                [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]:
                    {
                        outline: 'none',
                    },
            }}
            density={"compact"}
            rows={passes}
            initialState={{
                pagination: {paginationModel: {pageSize: 20}},
                sorting: {
                    sortModel: [{field: 'event_start', sort: 'asc'}],
                },
                columns: {
                    columnVisibilityModel: {
                        is_geostationary: false,
                        is_geosynchronous: false,
                    },
                },
            }}
            columns={columns}
            pageSize={10}
            rowsPerPageOptions={[5, 10, 20]}
        />
    );
}, (prevProps, nextProps) => {
    // Custom comparison function - return true if props haven't changed in ways that matter
    return (
        prevProps.passes === nextProps.passes &&
        prevProps.passesLoading === nextProps.passesLoading
    );
});


const NextPassesGroupIsland = React.memo(() => {
    const {socket} = useSocket();
    const dispatch = useDispatch();
    const containerRef = useRef(null);
    const hasFetchedRef = useRef(false);
    const lastFetchParamsRef = useRef(null);
    const [containerHeight, setContainerHeight] = useState(0);
    const {
        selectedSatGroupId,
        passes,
        passesAreCached,
        passesLoading,
        nextPassesHours,
        gridEditable
    } = useSelector(state => state.overviewSatTrack);

    const minHeight = 200;
    const maxHeight = 400;
    const [columnUpdateKey, setColumnUpdateKey] = useState(0);

    useEffect(() => {
        if (selectedSatGroupId) {
            const currentParams = `${selectedSatGroupId}-${nextPassesHours}`;

            // Only fetch if parameters have changed
            if (lastFetchParamsRef.current !== currentParams) {
                lastFetchParamsRef.current = currentParams;
                hasFetchedRef.current = false; // Reset for new parameters
            }

            if (!hasFetchedRef.current) {
                hasFetchedRef.current = true;
                dispatch(fetchNextPassesForGroup({socket, selectedSatGroupId, hours: nextPassesHours}));
            }
        }

        // Don't reset hasFetchedRef in cleanup - that's what causes the double call in StrictMode
        // return () => {
        //     hasFetchedRef.current = false;
        // };
    }, [selectedSatGroupId, dispatch, socket, nextPassesHours]);

    useEffect(() => {
        // Update the passes every two hours plus 5 mins to wait until the cache is invalidated
        const interval = setInterval(() => {
            if (selectedSatGroupId) {
                dispatch(fetchNextPassesForGroup({socket, selectedSatGroupId, hours: nextPassesHours}));
            }
        }, 7200000 + (60000 * 5));

        return () => {
            clearInterval(interval);
        }
    }, []);

    useEffect(() => {
        const target = containerRef.current;
        const observer = new ResizeObserver((entries) => {
            setContainerHeight(entries[0].contentRect.height);
        });
        if (target) {
            observer.observe(target);
        }
        return () => {
            observer.disconnect();
        };
    }, [containerRef]);

    const handleOnRowClick = (params) => {
        const noradId = params.row.id.split("_")[1];
        dispatch(setSelectedSatelliteId(parseInt(noradId)));
    }

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>
                Passes for the next {nextPassesHours} hours {passesAreCached ? "(cached)" : ""}
            </TitleBar>
            <div style={{position: 'relative', display: 'block', height: '100%'}} ref={containerRef}>
                <div style={{
                    padding: '0rem 0rem 0rem 0rem',
                    display: 'flex',
                    flexDirection: 'column',
                    height: containerHeight - 25,
                    minHeight,
                }}>
                    <MemoizedStyledDataGrid passes={passes} passesLoading={passesLoading}
                                            onRowClick={handleOnRowClick}/>
                </div>
            </div>
        </>
    );
});

export default NextPassesGroupIsland;