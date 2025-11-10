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
import { useStore } from 'react-redux';
import { useDispatch, useSelector } from "react-redux";
import { DataGrid, gridClasses } from "@mui/x-data-grid";
import { useGridApiRef } from '@mui/x-data-grid';
import { darken, lighten, styled } from '@mui/material/styles';
import {Typography, Chip, Tooltip, Box} from "@mui/material";
import {
    getClassNamesBasedOnGridEditing,
    humanizeDate,
    renderCountryFlagsCSV,
    TitleBar
} from "../common/common.jsx";
import {
    setSelectedSatelliteId,
} from './overview-slice.jsx';
import { useTranslation } from 'react-i18next';
import { enUS, elGR } from '@mui/x-data-grid/locales';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';

// Create a separate component for the elevation cell that uses useStore
const ElevationCell = React.memo(function ElevationCell({ noradId }) {
    const [elevation, setElevation] = useState(null);
    const store = useStore();

    useEffect(() => {
        const updateElevation = () => {
            const state = store.getState();
            const selectedSatellitePositions = state.overviewSatTrack.selectedSatellitePositions;
            const satellitePosition = selectedSatellitePositions?.[noradId];

            if (satellitePosition && satellitePosition.el !== undefined) {
                setElevation(satellitePosition.el);
            } else {
                setElevation(null);
            }
        };

        // Initial update
        updateElevation();

        // Poll every 3 seconds
        const interval = setInterval(updateElevation, 3000);

        return () => clearInterval(interval);
    }, [noradId, store]);

    if (elevation === null) {
        return <span>-</span>;
    }

    return <span>{elevation.toFixed(1)}°</span>;
});
 
const MemoizedStyledDataGrid = React.memo(({
                                               apiRef,
                                               satellites,
                                               onRowClick,
                                               selectedSatelliteId,
                                               loadingSatellites,
                                            }) => {
    const { t, i18n } = useTranslation('overview');
    const currentLanguage = i18n.language;
    const dataGridLocale = currentLanguage === 'el' ? elGR : enUS;

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
        if (!dateString) return t('satellites_table.na');
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return t('satellites_table.invalid_date');
        }
    };

    const columns = [
        {
            field: 'name',
            minWidth: 100,
            headerName: t('satellites_table.satellite_name'),
            flex: 2,
            renderCell: (params) => {
                if (!params || !params.row) return <Typography>-</Typography>;
                const isTracked = selectedSatelliteId === params.row.norad_id;
                const tooltipText = [
                    params.row.alternative_name,
                    params.row.name_other
                ].filter(Boolean).join(' / ') || t('satellites_table.no_alternative_names');
                return (
                    <Tooltip title={tooltipText}>
                        <span>
                            {isTracked && (
                                <GpsFixedIcon sx={{ mr: 0.5, fontSize: '1.3rem', color: 'info.main', verticalAlign: 'middle' }} />
                            )}
                            {params.value || '-'}
                        </span>
                    </Tooltip>
                );
            }
        },
        {
            field: 'alternative_name',
            minWidth: 100,
            headerName: t('satellites_table.alternative_name'),
            flex: 2,
            renderCell: (params) => {
                if (!params || !params.row) return <Typography>-</Typography>;
                return (
                    <Tooltip title={params.row.name_other || ''}>
                        <span>{params.value || '-'}</span>
                    </Tooltip>
                );
            }
        },
        {
            field: 'norad_id',
            minWidth: 70,
            headerName: t('satellites_table.norad'),
            align: 'center',
            headerAlign: 'center',
            flex: 1
        },
        {
            field: 'elevation',
            minWidth: 50,
            headerName: t('satellites_table.elevation'),
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            renderCell: (params) => {
                const elevation = params.value;
                if (elevation === null || elevation === undefined || elevation < 0) {
                    return <span>-</span>;
                }

                let color;
                if (elevation < 10) {
                    color = 'error.main';
                } else if (elevation >= 10 && elevation < 45) {
                    color = 'warning.main';
                } else {
                    color = 'success.main';
                }

                return (
                    <Box component="span" sx={{ color, fontWeight: 'bold' }}>
                        {elevation.toFixed(1)}°
                    </Box>
                );
            }
        },
        {
            field: 'status',
            minWidth: 90,
            headerName: t('satellites_table.status'),
            align: 'center',
            headerAlign: 'center',
            flex: 1,
            renderCell: (params) => {
                if (!params || !params.value) {
                    return <Chip
                        label={t('satellites_table.status_unknown')}
                        color="default"
                        size="small"
                        sx={{
                            fontWeight: 'bold',
                            height: '20px',
                            fontSize: '0.7rem',
                            '& .MuiChip-label': {
                                padding: '0 8px 0px 8px'
                            }
                        }}
                    />;
                }

                const status = params.value;
                let color = 'default';
                let label = t('satellites_table.status_unknown');

                switch (status) {
                    case 'alive':
                        color = 'success';
                        label = t('satellites_table.status_active');
                        break;
                    case 'dead':
                        color = 'error';
                        label = t('satellites_table.status_inactive');
                        break;
                    case 're-entered':
                        color = 'warning';
                        label = t('satellites_table.status_reentered');
                        break;
                    default:
                        color = 'default';
                        label = t('satellites_table.status_unknown');
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
            field: 'transmitters',
            minWidth: 90,
            headerName: t('satellites_table.transmitters'),
            align: 'center',
            headerAlign: 'center',
            flex: 1.2,
            renderCell: (params) => {
                if (!params?.row?.transmitters) return <span>0</span>;

                const transmitters = params.row.transmitters;
                const aliveCount = transmitters.filter(t => t.alive).length;
                const deadCount = transmitters.length - aliveCount;

                return (
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Box sx={{
                        width: '8px',
                        height: '8px',
                        bgcolor: 'success.main',
                        borderRadius: '50%',
                        display: 'inline-block'
                    }}></Box>
                            <span style={{ fontSize: '1rem' }}>{aliveCount}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Box sx={{
                        width: '8px',
                        height: '8px',
                        bgcolor: 'error.main',
                        borderRadius: '50%',
                        display: 'inline-block'
                    }}></Box>
                            <span style={{ fontSize: '1rem' }}>{deadCount}</span>
                        </div>
                    </div>
                );
            }
        },
        {
            field: 'countries',
            minWidth: 120,
            headerName: t('satellites_table.countries'),
            align: 'center',
            headerAlign: 'center',
            flex: 1.5,
            renderCell: (params) => {
                if (!params?.value) {
                    return <span>-</span>;
                }
                return renderCountryFlagsCSV(params.value);
            }
        },
        {
            field: 'decayed',
            minWidth: 140,
            headerName: t('satellites_table.decayed'),
            align: 'center',
            headerAlign: 'center',
            flex: 1.5,
            renderCell: (params) => {
                if (!params || !params.value) return <span>-</span>;
                return <span>{formatDate(params.value)}</span>;
            }
        },
        {
            field: 'updated',
            minWidth: 140,
            headerName: t('satellites_table.updated'),
            align: 'center',
            headerAlign: 'center',
            flex: 1.5,
            renderCell: (params) => {
                if (!params || !params.value) return <span>{t('satellites_table.na')}</span>;
                try {
                    const date = new Date(params.value);
                    return <span>{humanizeDate(date)}</span>;
                } catch (e) {
                    return <span>{t('satellites_table.invalid_date')}</span>;
                }
            }
        },
        {
            field: 'launched',
            minWidth: 140,
            headerName: t('satellites_table.launched'),
            align: 'center',
            headerAlign: 'center',
            flex: 1.5,
            renderCell: (params) => {
                if (!params || !params.value) return <span>{t('satellites_table.na')}</span>;
                return <span>{formatDate(params.value)}</span>;
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
            loading={loadingSatellites}
            apiRef={apiRef}
            pageSizeOptions={[5, 10, 15, 20, 50]}
            fullWidth={true}
            getRowClassName={getSatelliteRowStyles}
            onRowClick={onRowClick}
            getRowId={(params) => params.norad_id}
            localeText={dataGridLocale.components.MuiDataGrid.defaultProps.localeText}
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
                    sortModel: [{ field: 'elevation', sort: 'desc' }],
                },
                columns: {
                    columnVisibilityModel: {
                        launched: false,
                        alternative_name: false,
                        countries: false,
                        decayed: false,
                    },
                },

            }}
            columns={columns}
            pageSize={50}
            rowsPerPageOptions={[5, 10, 20, 50]}
        />
    );
});

const SatelliteDetailsTable = React.memo(function SatelliteDetailsTable() {
    const dispatch = useDispatch();
    const { t } = useTranslation('overview');
    const containerRef = useRef(null);
    const [containerHeight, setContainerHeight] = useState(0);
    const apiRef = useGridApiRef();

    // Use memoized selectors to prevent unnecessary rerenders
    const selectedSatellites = useSelector(state => state.overviewSatTrack.selectedSatellites);
    const selectedSatellitePositions = useSelector(state => state.overviewSatTrack.selectedSatellitePositions);
    const gridEditable = useSelector(state => state.overviewSatTrack.gridEditable);
    const loadingSatellites = useSelector(state => state.overviewSatTrack.loadingSatellites);
    const selectedSatelliteId = useSelector(state => state.targetSatTrack?.satelliteData?.details?.norad_id);
    const selectedSatGroupId = useSelector(state => state.overviewSatTrack.selectedSatGroupId);

    const minHeight = 200;

    const satelliteRows = React.useMemo(() => {
        return (selectedSatellites || []).map(satellite => ({
            ...satellite,
            elevation: selectedSatellitePositions?.[satellite.norad_id]?.el ?? null,
        }));
    }, [selectedSatellites]);

    useEffect(() => {
        if (!apiRef.current?.updateRows || !satelliteRows.length) return;

        (satelliteRows || []).forEach(row => {
            const position = selectedSatellitePositions?.[row.norad_id];
            if (position && position.el !== undefined) {
                const newRow = { ...row, elevation: position.el };
                apiRef.current.updateRows([newRow]);
            }
        });
    }, [selectedSatellitePositions, apiRef, satelliteRows]);

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
            <TitleBar
                className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}
                sx={{
                    bgcolor: 'background.default',
                    borderBottom: '1px solid',
                    borderColor: 'border.main',
                    backdropFilter: 'blur(10px)'
                }}
            >
                <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                    <Box sx={{display: 'flex', alignItems: 'center'}}>
                        <Typography variant="subtitle2" sx={{fontWeight: 'bold'}}>
                            {t('satellites_table.title')} ({t('satellites_table.satellites_count', { count: selectedSatellites?.length || 0 })})
                        </Typography>
                    </Box>
                </Box>
            </TitleBar>
            <div style={{ position: 'relative', display: 'block', height: '100%' }} ref={containerRef}>
                <div style={{
                    padding: '0rem 0rem 0rem 0rem',
                    display: 'flex',
                    flexDirection: 'column',
                    height: containerHeight - 25,
                    minHeight,
                }}>
                    {!selectedSatGroupId ? (
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                            }}
                        >
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                                {t('satellites_table.no_group_selected')}
                            </Typography>
                        </Box>
                    ) : (
                        <MemoizedStyledDataGrid
                            apiRef={apiRef}
                            satellites={satelliteRows}
                            onRowClick={handleOnRowClick}
                            selectedSatelliteId={selectedSatelliteId}
                            loadingSatellites={loadingSatellites}
                        />
                    )}
                </div>
            </div>
        </>
    );
});

export default SatelliteDetailsTable;