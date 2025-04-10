import React, {useEffect, useMemo, useRef, useState} from "react";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";
import {
    formatWithZeros,
    getClassNamesBasedOnGridEditing,
    getTimeFromISO,
    humanizeFutureDateInMinutes,
    TitleBar
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
} from './overview-sat-slice.jsx';
import { useGridApiRef } from '@mui/x-data-grid';
import { darken, lighten, styled } from '@mui/material/styles';


const TimeFormatter = React.memo(({ value }) => {
    const [, setForceUpdate] = useState(0);

    // Force component to update regularly
    useEffect(() => {
        const interval = setInterval(() => {
            setForceUpdate(prev => prev + 1);
        }, 2000); // Every minute
        return () => clearInterval(interval);
    }, []);

    return `${getTimeFromISO(value)} (${humanizeFutureDateInMinutes(value)})`;
});


const NextPassesGroupIsland = React.memo(() => {
    const apiRef = useGridApiRef();
    const {socket} = useSocket();
    const dispatch = useDispatch();
    const containerRef = useRef(null);
    const [containerHeight, setContainerHeight] = useState(0);
    const { selectedSatGroupId, passes, passesLoading, nextPassesHours, gridEditable } = useSelector(state => state.overviewSatTrack);
    const minHeight = 200;
    const maxHeight = 400;
    const [columnUpdateKey, setColumnUpdateKey] = useState(0);

    useEffect(() => {
        if (selectedSatGroupId) {
            dispatch(fetchNextPassesForGroup({socket, selectedSatGroupId, hours: nextPassesHours}));
        }
        return () => {

        };
    }, [selectedSatGroupId]);

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
            field: 'name',
            minWidth: 120,
            headerName: 'Name',
            flex: 2,
            valueFormatter: (value) => {
                return `${value}`;
            }
        },
        {
            field: 'event_start',
            minWidth: 200,
            headerName: 'Start',
            flex: 2,
            renderCell: (params) => <TimeFormatter value={params.value} />
            // valueFormatter: (value) => {
            //     return `${getTimeFromISO(value)} (${humanizeFutureDateInMinutes(value)})`;
            // }
        },
        {
            field: 'event_end',
            minWidth: 200,
            headerName: 'End',
            flex: 2,
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
            valueFormatter: (value) => {
                return `${value}`;
            }
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
            field: 'id',
            minWidth: 50,
            headerName: 'Info',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            renderCell: (params) => {
                const noradId = params.value.split("_")[0];
                return (
                <ArrowForwardIcon
                    fontSize="small"
                    style={{cursor: 'pointer', marginTop: '8px'}}
                    onClick={() => {
                        dispatch(setSelectedSatelliteId(parseInt(noradId)));
                    }}
                />
                );
            },
        },
        
    ];

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
        }, 2000);

        return () => {
            clearInterval(intervalId);
        };
    }, []);

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable,  ["window-title-bar"])}>Passes for the next {nextPassesHours} hours</TitleBar>
            <div style={{ position: 'relative', display: 'block', height: '100%' }} ref={containerRef}>
                <div style={{
                    padding:'0rem 0rem 0rem 0rem',
                    display: 'flex',
                    flexDirection: 'column',
                    height: containerHeight - 25,
                    minHeight,
                }}>
                    <StyledDataGrid
                        apiRef={apiRef}
                        pageSizeOptions={[5, 10, 15, 20]}
                        fullWidth={true}
                        loading={passesLoading}
                        getRowClassName={(param) => {
                            if (param.row) {
                                if (new Date(param.row['event_start']) < new Date() && new Date(param.row['event_end']) < new Date()) {
                                    return "passes-cell-passed";
                                } else if (new Date(param.row['event_start']) < new Date() && new Date(param.row['event_end']) > new Date()) {
                                    return "passes-cell-passing";
                                }
                            }
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
                            pagination: { paginationModel: { pageSize: 20 } },
                            sorting: {
                                sortModel: [{ field: 'event_start', sort: 'asc' }],
                            },
                        }}
                        columns={columns}
                        pageSize={10}
                        rowsPerPageOptions={[5, 10, 20]}
                    />
                </div>
            </div>
        </>
    );
});

export default NextPassesGroupIsland;