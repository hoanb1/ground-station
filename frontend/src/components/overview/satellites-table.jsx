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

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { DataGrid, gridClasses } from "@mui/x-data-grid";
import { useGridApiRef } from '@mui/x-data-grid';
import { darken, lighten, styled } from '@mui/material/styles';
import { Typography, Chip, Tooltip } from "@mui/material";
import {getClassNamesBasedOnGridEditing, humanizeDate, TitleBar} from "../common/common.jsx";
import { setSelectedSatelliteId } from './overview-slice.jsx';

const MemoizedStyledDataGrid = React.memo(({ satellites, onRowClick, selectedSatelliteId }) => {
    const apiRef = useGridApiRef();

    const getBackgroundColor = (color, theme, coefficient) => ({
        backgroundColor: darken(color, coefficient),
        ...theme.applyStyles('light', {
            backgroundColor: lighten(color, coefficient),
        }),
    });

    const StyledDataGrid = styled(DataGrid)(({ theme }) => ({
        '& .satellite-cell-alive': {
            ...getBackgroundColor(theme.palette.success.main, theme, 0.8),
            '&:hover': {
                ...getBackgroundColor(theme.palette.success.main, theme, 0.7),
            },
            '&.Mui-selected': {
                ...getBackgroundColor(theme.palette.success.main, theme, 0.6),
                '&:hover': {
                    ...getBackgroundColor(theme.palette.success.main, theme, 0.5),
                },
            },
        },
        '& .satellite-cell-dead': {
            ...getBackgroundColor(theme.palette.error.main, theme, 0.8),
            '&:hover': {
                ...getBackgroundColor(theme.palette.error.main, theme, 0.7),
            },
            '&.Mui-selected': {
                ...getBackgroundColor(theme.palette.error.main, theme, 0.6),
                '&:hover': {
                    ...getBackgroundColor(theme.palette.error.main, theme, 0.5),
                },
            },
            textDecoration: 'line-through',
        },
        '& .satellite-cell-reentered': {
            ...getBackgroundColor(theme.palette.warning.main, theme, 0.8),
            '&:hover': {
                ...getBackgroundColor(theme.palette.warning.main, theme, 0.7),
            },
            '&.Mui-selected': {
                ...getBackgroundColor(theme.palette.warning.main, theme, 0.6),
                '&:hover': {
                    ...getBackgroundColor(theme.palette.warning.main, theme, 0.5),
                },
            },
            textDecoration: 'line-through',
        },
        '& .satellite-cell-unknown': {
            ...getBackgroundColor(theme.palette.grey[500], theme, 0.8),
            '&:hover': {
                ...getBackgroundColor(theme.palette.grey[500], theme, 0.7),
            },
            '&.Mui-selected': {
                ...getBackgroundColor(theme.palette.grey[500], theme, 0.6),
                '&:hover': {
                    ...getBackgroundColor(theme.palette.grey[500], theme, 0.5),
                },
            },
        },
        '& .satellite-cell-selected': {
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

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return 'Invalid date';
        }
    };

    const columns = [
        {
            field: 'name',
            minWidth: 150,
            headerName: 'Satellite Name',
            flex: 2,
            renderCell: (params) => {
                if (!params || !params.row) return <Typography>-</Typography>;
                return (
                    <Tooltip title={params.row.name_other || params.row.alternative_name || ''}>
                        <span>{params.value || '-'}</span>
                    </Tooltip>
                );
            }
        },
        {
            field: 'norad_id',
            minWidth: 100,
            headerName: 'NORAD ID',
            align: 'center',
            headerAlign: 'center',
            flex: 1
        },
        {
            field: 'status',
            minWidth: 80,
            headerName: 'Status',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            renderCell: (params) => {
                if (!params || !params.value) {
                    return <Chip
                        label="Unknown"
                        color="default"
                        size="small"
                        sx={{
                            fontWeight: 'bold',
                            height: '20px',
                            fontSize: '0.7rem',
                            '& .MuiChip-label': {
                                padding: '0 4px 0px 4px'
                            }
                        }}
                    />;
                }

                const status = params.value;
                let color = 'default';
                let label = 'Unknown';

                switch (status) {
                    case 'alive':
                        color = 'success';
                        label = 'Active';
                        break;
                    case 'dead':
                        color = 'error';
                        label = 'Inactive';
                        break;
                    case 're-entered':
                        color = 'warning';
                        label = 'Re-entered';
                        break;
                    default:
                        color = 'default';
                        label = 'Unknown';
                }

                return (
                    <Chip
                        label={label}
                        color={color}
                        size="small"
                        sx={{
                            fontWeight: 'bold',
                            height: '20px',
                            fontSize: '0.7rem',
                            '& .MuiChip-label': {
                                padding: '0px 8px 0px 8px'
                            }
                        }}
                    />

                );
            }
        },
        {
            field: 'launched',
            minWidth: 120,
            headerName: 'Launch',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            renderCell: (params) => {
                if (!params || params.value === undefined || params.value === null) {
                    return <span>N/A</span>;
                }
                return <span>{formatDate(params.value)}</span>;
            }
        },
        {
            field: 'countries',
            minWidth: 80,
            headerName: 'Country',
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            valueGetter: (params) => {
                if (!params || !params.value) return 'N/A';
                return params.value;
            }
        },
        {
            field: 'updated',
            minWidth: 140,
            headerName: 'Updated',
            align: 'center',
            headerAlign: 'center',
            flex: 1.5,
            renderCell: (params) => {
                if (!params || !params.value) return <span>N/A</span>;
                try {
                    const date = new Date(params.value);
                    return <span>{humanizeDate(date)}</span>;
                } catch (e) {
                    return <span>Invalid date</span>;
                }
            }
        }
    ];

    // Memoize the row class name function to prevent unnecessary rerenders
    const getSatelliteRowStyles = useCallback((params) => {
        if (!params.row) return "pointer-cursor";

        if (selectedSatelliteId === params.row.norad_id) {
            return "satellite-cell-selected pointer-cursor";
        } 
        
        // Handle different status values
        switch (params.row.status) {
            case 'alive':
                return "satellite-cell-alive pointer-cursor";
            case 'dead':
                return "satellite-cell-dead pointer-cursor";
            case 're-entered':
                return "satellite-cell-reentered pointer-cursor";
            default:
                return "satellite-cell-unknown pointer-cursor";
        }
    }, [selectedSatelliteId]);

    return (
        <StyledDataGrid
            apiRef={apiRef}
            pageSizeOptions={[5, 10, 15, 20, 50]}
            fullWidth={true}
            getRowClassName={getSatelliteRowStyles}
            onRowClick={onRowClick}
            getRowId={(params) => params.norad_id}
            sx={{
                border: 0,
                marginTop: 0,
                [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                    outline: 'none',
                },
                [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]: {
                    outline: 'none',
                },
            }}
            density={"compact"}
            rows={satellites || []}
            initialState={{
                pagination: { paginationModel: { pageSize: 50 } },
                sorting: {
                    sortModel: [{ field: 'launched', sort: 'desc' }],
                },
            }}
            columns={columns}
            pageSize={50}
            rowsPerPageOptions={[5, 10, 20, 50]}
        />
    );
});

const SatelliteDetailsTable = React.memo(() => {
    const dispatch = useDispatch();
    const containerRef = useRef(null);
    const [containerHeight, setContainerHeight] = useState(0);

    // Use memoized selectors to prevent unnecessary rerenders
    const selectedSatellites = useSelector(state => state.overviewSatTrack.selectedSatellites);
    const gridEditable = useSelector(state => state.overviewSatTrack.gridEditable);
    const selectedSatelliteId = useSelector(state => state.targetSatTrack?.satelliteData?.details?.norad_id);

    const minHeight = 200;

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

    const handleOnRowClick = useCallback((params) => {
        dispatch(setSelectedSatelliteId(params.row.norad_id));
    }, [dispatch]);

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>
                Satellite Group Details ({selectedSatellites?.length || 0} satellites)
            </TitleBar>
            <div style={{ position: 'relative', display: 'block', height: '100%' }} ref={containerRef}>
                <div style={{
                    padding: '0rem 0rem 0rem 0rem',
                    display: 'flex',
                    flexDirection: 'column',
                    height: containerHeight - 25,
                    minHeight,
                }}>
                    <MemoizedStyledDataGrid
                        satellites={selectedSatellites || []}
                        onRowClick={handleOnRowClick}
                        selectedSatelliteId={selectedSatelliteId}
                    />
                </div>
            </div>
        </>
    );
});

export default SatelliteDetailsTable;