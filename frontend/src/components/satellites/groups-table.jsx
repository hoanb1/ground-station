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



import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
    Box,
    Button,
    Alert,
    AlertTitle,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
    DialogContentText,
    Chip,
} from '@mui/material';
import { DataGrid, gridClasses } from '@mui/x-data-grid';
import { toast } from '../../utils/toast-with-timestamp.jsx';
import { useSocket } from '../common/socket.jsx';
import { betterDateTimes } from '../common/common.jsx';
import { AddEditDialog } from './groups-dialog.jsx';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
    fetchSatelliteGroups,
    deleteSatelliteGroups,
    setSelected,
    setSatGroup,
    setFormDialogOpen,
    setFormErrorStatus,
    setGroups,
    setDeleteConfirmDialogOpen,
} from './groups-slice.jsx';
import { useTranslation } from 'react-i18next';


const GroupsTable = () => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const { t } = useTranslation('satellites');
    const navigate = useNavigate();

    // Redux state
    const {
        groups,
        selected,
        formDialogOpen,
        deleteConfirmDialogOpen,
        satGroup,
        formErrorStatus,
        loading,
        error,
    } = useSelector((state) => state.satelliteGroups);

    const columns = [
        {
            field: 'name',
            headerName: t('groups.name'),
            width: 150,
            flex: 1,
        },
        {
            field: 'satellite_ids',
            headerName: t('groups.satellites'),
            width: 300,
            flex: 5,
            renderCell: (params) => {
                const containerRef = useRef(null);
                const [visibleCount, setVisibleCount] = useState(null);

                if (!params.value) return null;
                const ids = Array.isArray(params.value)
                    ? params.value
                    : params.value.split(',').map(id => id.trim()).filter(Boolean);

                useEffect(() => {
                    if (!containerRef.current) return;

                    const calculateVisibleChips = () => {
                        const containerWidth = containerRef.current.offsetWidth;
                        // Rough estimate: ~55px per chip (varies by content) + 4px gap
                        const avgChipWidth = 59;
                        const moreChipWidth = 75; // "+X more" chip is wider

                        const maxChips = Math.floor((containerWidth - moreChipWidth) / avgChipWidth);
                        setVisibleCount(Math.max(1, Math.min(maxChips, ids.length)));
                    };

                    calculateVisibleChips();
                    window.addEventListener('resize', calculateVisibleChips);
                    return () => window.removeEventListener('resize', calculateVisibleChips);
                }, [ids.length]);

                const displayCount = visibleCount || 3; // fallback to 3 while calculating
                const visibleIds = ids.slice(0, displayCount);
                const remaining = ids.length - displayCount;

                return (
                    <Box ref={containerRef} sx={{ display: 'flex', flexWrap: 'nowrap', gap: 0.5, py: 1, overflow: 'hidden' }}>
                        {visibleIds.map((id, index) => (
                            <Chip
                                key={index}
                                label={id}
                                variant="outlined"
                                clickable
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/satellite/${id}`);
                                }}
                            />
                        ))}
                        {remaining > 0 && (
                            <Chip
                                label={`+${remaining} more`}
                                variant="filled"
                                color="default"
                            />
                        )}
                    </Box>
                );
            },
        },
        {
            field: 'added',
            headerName: t('groups.added'),
            width: 200,
            flex: 1,
            align: 'right',
            headerAlign: 'right',
            renderCell: (params) => betterDateTimes(params.value),
        },
        {
            field: 'updated',
            headerName: t('groups.updated'),
            width: 200,
            flex: 1,
            align: 'right',
            headerAlign: 'right',
            renderCell: (params) => betterDateTimes(params.value),
        },
    ];

    // // Fetch data
    // useEffect(() => {
    //     dispatch(fetchSatelliteGroups({ socket }));
    // }, [dispatch, socket]);

    // Handle Add
    const handleAddClick = () => {
        dispatch(setSatGroup({})); // if you want to clear previous selections
        dispatch(setFormDialogOpen(true));
    };

    // Handle Edit
    const handleEditGroup = () => {
        if (selected.length !== 1) return;
        const singleRowId = selected[0];
        const rowData = groups.find((row) => row.id === singleRowId);
        if (rowData) {
            dispatch(setSatGroup(rowData));
            dispatch(setFormDialogOpen(true));
        }
    };

    const handleDeleteGroup = () => {
        dispatch(deleteSatelliteGroups({socket, groupIds: selected}))
            .unwrap()
            .then(()=>{
                dispatch(setDeleteConfirmDialogOpen(false));
                toast.success(t('groups.deleted_success'));
            })
            .catch((err) => {
                toast.error(t('groups.failed_delete'));
            });
    };

    const paginationModel = { page: 0, pageSize: 10 };

    const handleRowsCallback = useCallback((groups) => {
        dispatch(setGroups(groups));
    }, []);

    const handleDialogOpenCallback = useCallback((value) => {
        dispatch(setFormDialogOpen(value));
    }, []);

    return (
        <Box sx={{ width: '100%', marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>{t('groups.title')}</AlertTitle>
                {t('groups.subtitle')}
            </Alert>

            <DataGrid
                rows={groups}
                columns={columns}
                loading={loading}
                initialState={{ pagination: { paginationModel } }}
                pageSizeOptions={[5, 10]}
                checkboxSelection
                onRowSelectionModelChange={(ids) => {
                    dispatch(setSelected(ids));
                }}
                selectionModel={selected}
                sx={{
                    border: 0,
                    marginTop: 2,
                    [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                        outline: 'none',
                    },
                }}
            />

            <Stack spacing={2} direction="row" sx={{ my: 2 }}>
                <Button variant="contained" onClick={handleAddClick}>
                    {t('groups.add')}
                </Button>
                <Button
                    variant="contained"
                    onClick={handleEditGroup}
                    disabled={selected.length !== 1}
                >
                    {t('groups.edit')}
                </Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={() => dispatch(setDeleteConfirmDialogOpen(true))}
                    disabled={selected.length === 0}
                >
                    {t('groups.delete')}
                </Button>
            </Stack>

            {/* Example usage of Dialog */}
            {formDialogOpen && (
                <Dialog
                    open={formDialogOpen}
                    onClose={() => dispatch(setFormDialogOpen(false))}
                >
                    <DialogTitle>{satGroup.id ? t('groups.dialog_title_edit') : t('groups.dialog_title_add')}</DialogTitle>
                    <DialogContent>
                        <AddEditDialog
                            formDialogOpen={formDialogOpen}
                            handleRowsCallback={handleRowsCallback}
                            handleDialogOpenCallback={handleDialogOpenCallback}
                            satGroup={satGroup}
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => dispatch(setFormDialogOpen(false))}>
                            {t('groups.close')}
                        </Button>
                    </DialogActions>
                </Dialog>
            )}

            <Dialog open={deleteConfirmDialogOpen} onClose={() => dispatch(setDeleteConfirmDialogOpen(false))}>
                <DialogTitle>{t('groups.confirm_deletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('groups.confirm_delete_message')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => dispatch(setDeleteConfirmDialogOpen(false))} color="error" variant="outlined">
                        {t('groups.cancel')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            handleDeleteGroup();
                        }}
                        color="error"
                    >
                        {t('groups.confirm')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Example of an error alert */}
            {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {error}
                </Alert>
            )}
            {formErrorStatus && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {t('groups.error_message')}
                </Alert>
            )}
        </Box>
    );
};

export default React.memo(GroupsTable);