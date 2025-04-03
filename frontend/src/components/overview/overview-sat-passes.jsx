import React, {useEffect, useRef, useState} from "react";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";
import {getTimeFromISO, humanizeFutureDateInMinutes, TitleBar} from "../common/common.jsx";
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import {useDispatch, useSelector} from "react-redux";
import { fetchNextPassesForGroup, fetchSatelliteGroups, fetchSatellitesByGroupId } from './overview-sat-slice.jsx';


const NextPassesGroupIsland = () => {
    const {socket} = useSocket();
    const dispatch = useDispatch();
    const containerRef = useRef(null);
    const [containerHeight, setContainerHeight] = useState(0);
    const { selectedSatGroupId, passes, passesLoading, nextPassesHours } = useSelector(state => state.overviewSatTrack);

    useEffect(() => {
        if (selectedSatGroupId) {
            console.info("selectedSatGroupId", selectedSatGroupId);
            dispatch(fetchNextPassesForGroup({socket, selectedSatGroupId}));
        }

        return () => {

        };
    }, [selectedSatGroupId]);

    const minHeight = 200;
    const maxHeight = 400;

    const getRows = () => {
        const allEvents = [];
        let idx = 0;
        passes.forEach(pass => {
            if (Array.isArray(pass.events)) {
                pass.events.forEach(event => {
                    allEvents.push({...event, id: `${pass.name}-${event.id}`, name: pass.name});
                });
            }
        });
        return allEvents;
    };

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
            <TitleBar className={"react-grid-draggable window-title-bar"}>Passes for the next {nextPassesHours} hours</TitleBar>
            <div style={{ position: 'relative', display: 'block', height: '100%' }} ref={containerRef}>
                <div style={{
                    padding:'0rem 0rem 0rem 0rem',
                    display: 'flex',
                    flexDirection: 'column',
                    height: containerHeight - 25,
                    minHeight,
                }}>
                    <DataGrid
                        pageSizeOptions={[5, 10, 15, 20]}
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
                        density={"compact"}
                        rows={getRows()}
                        initialState={{
                            pagination: { paginationModel: { pageSize: 20 } },
                            sorting: {
                                sortModel: [{ field: 'event_start', sort: 'asc' }],
                            },
                        }}
                        columns={[
                            {
                                field: 'name',
                                minWidth: 200,
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
                                }
                            },
                        ]}
                        pageSize={10}
                        rowsPerPageOptions={[5, 10, 20]}
                        disableSelectionOnClick
                    />
                </div>
            </div>
        </>
    );
}

export default NextPassesGroupIsland;