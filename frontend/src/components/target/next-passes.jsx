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


import React, {useEffect, useRef, useState} from "react";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";
import {
    getClassNamesBasedOnGridEditing,
    getTimeFromISO,
    humanizeFutureDateInMinutes,
    TitleBar
} from "../common/common.jsx";
import {DataGrid, gridClasses, useGridApiRef} from "@mui/x-data-grid";
import { useDispatch, useSelector } from 'react-redux';
import {fetchNextPasses, setSatellitePasses} from './target-slice.jsx';
import {darken, lighten, styled} from "@mui/material/styles";


const TimeFormatter = React.memo(({ value }) => {
    const [, setForceUpdate] = useState(0);

    // Force component to update regularly
    useEffect(() => {
        const interval = setInterval(() => {
            setForceUpdate(prev => prev + 1);
        }, 1000); // Every minute
        return () => clearInterval(interval);
    }, []);

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
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;

    } else if(endDate < now) {
        // Pass ended
        const diffInSeconds = Math.floor((endDate - startDate) / 1000);
        const minutes = Math.floor(diffInSeconds / 60);
        const seconds = diffInSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;

    } else if (startDate < now < endDate) {
        // Passing now
        const diffInSeconds = Math.floor((endDate - now) / 1000);
        const minutes = Math.floor(diffInSeconds / 60);
        const seconds = diffInSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;

    } else {
        return `no value`;
    }
});


const MemoizedStyledDataGrid = React.memo(({satellitePasses, passesLoading}) => {
    const apiRef = useGridApiRef();

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


    const getBackgroundColor = (color, theme, coefficient) => ({
        backgroundColor: darken(color, coefficient),
        ...theme.applyStyles('light', {
            backgroundColor: lighten(color, coefficient),
        }),
    });

    const StyledDataGrid = styled(DataGrid)(({ theme }) => ({
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
        }
    }));

    const columns = [
        {
            field: 'event_start',
            minWidth: 160,
            headerName: 'Start',
            flex: 1,
            renderCell: (params) => <TimeFormatter value={params.value} />
            // valueFormatter: (value) => {
            //     return `${getTimeFromISO(value)} (${humanizeFutureDateInMinutes(value)})`;
            // }
        },
        {
            field: 'event_end',
            minWidth: 160,
            headerName: 'End',
            flex: 1,
            renderCell: (params) => <TimeFormatter value={params.value} />
            // valueFormatter: (value) => {
            //     return `${getTimeFromISO(value)} (${humanizeFutureDateInMinutes(value)})`;
            // }
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
                    <DurationFormatter params={params} value={params.value} event_start={params.row.event_start} event_end={params.row.event_end}/>
                </div>
            ),
            // valueFormatter: (value) => {
            //     return `${value}`;
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
            field: 'peak_altitude',
            minWidth: 100,
            headerName: 'Max El',
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
                }
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

    return (
        <StyledDataGrid
            apiRef={apiRef}
            fullWidth={true}
            loading={passesLoading}
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
            getRowClassName={(param) => {
                if (param.row) {
                    if (new Date(param.row['event_start']) < new Date() && new Date(param.row['event_end']) < new Date()) {
                        return "passes-cell-passed pointer-cursor";
                    } else if (new Date(param.row['event_start']) < new Date() && new Date(param.row['event_end']) > new Date()) {
                        return "passes-cell-passing pointer-cursor";
                    } else {
                        return "pointer-cursor";
                    }
                }
            }}
            density={"compact"}
            rows={satellitePasses}
            pageSizeOptions={[5, 10, 15, 20]}
            initialState={{
                pagination: { paginationModel: { pageSize: 15 } },
                sorting: {
                    sortModel: [{ field: 'event_start', sort: 'asc' }],
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
            rowsPerPageOptions={[5, 10, 15, 20]}
            disableSelectionOnClick
        />
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.satellitePasses === nextProps.satellitePasses &&
        prevProps.passesLoading === nextProps.passesLoading
    );
});


const NextPassesIsland = React.memo(() => {
    const {socket} = useSocket();
    const dispatch = useDispatch();
    const [containerHeight, setContainerHeight] = useState(0);
    const containerRef = useRef(null);
    const {
        passesLoading,
        satellitePasses,
        satelliteData,
        nextPassesHours,
        satelliteId,
        gridEditable
    } = useSelector(state => state.targetSatTrack);
    const minHeight = 200;
    const maxHeight = 400;

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

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Next passes for {satelliteData['details']['name']} in the next {nextPassesHours} hours</TitleBar>
            <div style={{ position: 'relative', display: 'block', height: '100%' }} ref={containerRef}>
                <div style={{
                    padding:'0rem 0rem 0rem 0rem',
                    display: 'flex',
                    flexDirection: 'column',
                    height: containerHeight - 25,
                    minHeight,
                }}>
                    <MemoizedStyledDataGrid satellitePasses={satellitePasses} passesLoading={passesLoading}/>
                </div>
            </div>
        </>
    );
});

export default NextPassesIsland;