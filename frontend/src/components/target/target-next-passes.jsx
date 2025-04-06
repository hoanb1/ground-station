import React, {useEffect, useRef, useState} from "react";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";
import {getTimeFromISO, humanizeFutureDateInMinutes, TitleBar} from "../common/common.jsx";
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import { useDispatch, useSelector } from 'react-redux';
import {fetchNextPasses, setSatellitePasses} from './target-sat-slice.jsx';
import {darken, lighten, styled} from "@mui/material/styles";


const NextPassesIsland = React.memo(({noradId}) => {
    const {socket} = useSocket();
    const dispatch = useDispatch();
    const [containerHeight, setContainerHeight] = useState(0);
    const containerRef = useRef(null);
    const { passesLoading, satellitePasses, satelliteData, nextPassesHours } = useSelector(state => state.targetSatTrack);

    useEffect(() => {
        if (noradId) {
            dispatch(fetchNextPasses({socket, noradId, hours: nextPassesHours}))
                .unwrap()
                .then(response => {

                })
                .catch(error => {
                    enqueueSnackbar("Failed fetching next passes", {
                        variant: 'error',
                        autoHideDuration: 5000,
                    })
                });
        }
        return () => {

        };
    }, [noradId]);

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
            minWidth: 200,
            headerName: 'Start',
            flex: 2,
            valueFormatter: (value) => {
                return `${getTimeFromISO(value)} (${humanizeFutureDateInMinutes(value)})`;
            }
        },
        {
            field: 'event_end',
            minWidth: 200,
            headerName: 'End',
            flex: 2,
            valueFormatter: (value) => {
                return `${getTimeFromISO(value)} (${humanizeFutureDateInMinutes(value)})`;
            }
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
    ];

    return (
        <>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Next passes for {satelliteData['details']['name']} in the next {nextPassesHours} hours</TitleBar>
            <div style={{ position: 'relative', display: 'block', height: '100%' }} ref={containerRef}>
                <div style={{
                    padding:'0rem 0rem 0rem 0rem',
                    display: 'flex',
                    flexDirection: 'column',
                    height: containerHeight - 25,
                    minHeight,
                }}>
                    <StyledDataGrid
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
                                    return "passes-cell-passed";
                                } else if (new Date(param.row['event_start']) < new Date() && new Date(param.row['event_end']) > new Date()) {
                                    return "passes-cell-passing";
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
                        }}
                        columns={columns}
                        pageSize={10}
                        rowsPerPageOptions={[5, 10, 20]}
                        disableSelectionOnClick
                    />
                </div>
            </div>
        </>
    );
});

export default NextPassesIsland;