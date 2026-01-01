
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
import {useEffect, useState} from 'react';
import {DataGrid, gridClasses} from '@mui/x-data-grid';
import {
    Alert,
    AlertTitle,
    Box,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Stack, Select, MenuItem, FormControl, InputLabel,
} from "@mui/material";
import { useTranslation } from 'react-i18next';
import {useDispatch, useSelector} from 'react-redux';
import {fetchTLESources,  submitOrEditTLESource, deleteTLESources} from './sources-slice.jsx';
import {betterDateTimes} from "../common/common.jsx";
import { toast } from '../../utils/toast-with-timestamp.jsx';
import {useSocket} from "../common/socket.jsx";
import {setFormValues, setOpenAddDialog, setOpenDeleteConfirm, setSelected} from "./sources-slice.jsx"
import SynchronizeTLEsCard from "./sychronize-card.jsx";

const paginationModel = {page: 0, pageSize: 10};

export default function SourcesTable() {
    const dispatch = useDispatch();
    const {socket} = useSocket();
    const { t } = useTranslation('satellites');
    const {tleSources, loading, formValues, openDeleteConfirm, openAddDialog, selected} = useSelector((state) => state.tleSources);

    // Get timezone preference
    const timezone = useSelector((state) => {
        const tzPref = state.preferences?.preferences?.find(p => p.name === 'timezone');
        return tzPref?.value || 'UTC';
    });

    const columns = [
        {field: 'name', headerName: t('tle_sources.name'), width: 150},
        {field: 'url', headerName: t('tle_sources.url'), flex: 2},
        {field: 'format', headerName: t('tle_sources.format'), width: 90},
        {
            field: 'added',
            headerName: t('tle_sources.added'),
            flex: 1,
            align: 'right',
            headerAlign: 'right',
            width: 100,
            renderCell: (params) => {
                return betterDateTimes(params.value, timezone);
            }
        },
        {
            field: 'updated',
            headerName: t('tle_sources.updated'),
            flex: 1,
            width: 100,
            align: 'right',
            headerAlign: 'right',
            renderCell: (params) => {
                return betterDateTimes(params.value, timezone);
            }
        },
    ];
    const defaultFormValues = {
        id: null,
        name: '',
        url: '',
        format: '3le',
    };

    const handleAddClick = () => {
        dispatch(setFormValues(defaultFormValues));
        dispatch(setOpenAddDialog(true));
    };

    const handleClose = () => {
        dispatch(setOpenAddDialog(false));
    };

    const handleInputChange = (e) => {
        const {name, value} = e.target;
        dispatch(setFormValues({...formValues, [name]: value}));
    };

    const handleEditClick = (e) => {
        const singleRowId = selected[0];
        dispatch(setFormValues({...tleSources.find(r => r.id === singleRowId), id: singleRowId}));
        dispatch(setOpenAddDialog(true));
    };

    const handleDeleteClick = () => {
        dispatch(deleteTLESources({socket, selectedIds: selected}))
            .unwrap()
            .then((data) => {
                toast.success(data.message, {
                    autoClose: 4000,
                })
            })
            .catch((error) => {
                toast.error(t('tle_sources.failed_delete') + ": " + error, {
                    autoClose: 5000,
                })
            })
        dispatch(setOpenDeleteConfirm(false));
    };

    const handleSubmit = () => {
        if (formValues.id === null) {
            dispatch(submitOrEditTLESource({socket, formValues}))
                .unwrap()
                .then(() => {
                    toast.success(t('tle_sources.added_success'), {
                        autoClose: 4000,
                    })
                })
                .catch((error) => {
                    toast.error(t('tle_sources.failed_add') + ": " + error)
                });
        } else {
            dispatch(submitOrEditTLESource({socket, formValues}))
                .unwrap()
                .then(() => {
                    toast.success(t('tle_sources.updated_success'), {
                        autoClose: 4000,
                    })
                })
                .catch((error) => {
                    toast.error(t('tle_sources.failed_update') + ": " + error)
                });
        }
        dispatch(setOpenAddDialog(false));
    };

    // useEffect(() => {
    //     dispatch(fetchTLESources({socket}));
    // }, [dispatch]);

    return (
        <Box sx={{width: '100%', marginTop: 0}}>
            <Alert severity="info">
                <AlertTitle>{t('tle_sources.title')}</AlertTitle>
                {t('tle_sources.subtitle')}
            </Alert>
            <SynchronizeTLEsCard/>
            <Box sx={{marginTop: 4}}>
                <DataGrid
                    loading={loading}
                    rows={tleSources}
                    columns={columns}
                    initialState={{pagination: {paginationModel}}}
                    pageSizeOptions={[5, 10]}
                    checkboxSelection={true}
                    onRowSelectionModelChange={(selected) => {
                        dispatch(setSelected(selected));
                    }}
                    sx={{
                        border: 0,
                        marginTop: 2,
                        [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                            outline: 'none',
                        },
                        [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]:
                            {
                                outline: 'none',
                            },
                    }}
                />
                <Stack direction="row" spacing={2} sx={{marginTop: 2}}>
                    <Button variant="contained" onClick={handleAddClick}>
                        {t('tle_sources.add')}
                    </Button>
                    <Button variant="contained" disabled={selected.length !== 1} onClick={handleEditClick}>
                        {t('tle_sources.edit')}
                    </Button>
                    <Button variant="contained" color="error" disabled={selected.length < 1}
                            onClick={() => dispatch(setOpenDeleteConfirm(true))}>
                        {t('tle_sources.delete')}
                    </Button>
                    <Dialog
                        open={openDeleteConfirm}
                        onClose={() => dispatch(setOpenDeleteConfirm(false))}
                        PaperProps={{
                            sx: {
                                bgcolor: 'background.paper',
                                border: (theme) => `1px solid ${theme.palette.divider}`,
                                borderRadius: 2,
                            }
                        }}
                    >
                        <DialogTitle
                            sx={{
                                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                                borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                                fontSize: '1.25rem',
                                fontWeight: 'bold',
                                py: 2.5,
                            }}
                        >
                            {t('tle_sources.confirm_deletion')}
                        </DialogTitle>
                        <DialogContent sx={{ bgcolor: 'background.paper', px: 3, py: 3, mt: 2 }}>
                            <p>{t('tle_sources.confirm_delete_intro')}</p>
                            <ul>
                                <li>{t('tle_sources.delete_item_1')}</li>
                                <li>{t('tle_sources.delete_item_2')}</li>
                                <li>{t('tle_sources.delete_item_3')}</li>
                            </ul>
                            <p><strong>{t('tle_sources.cannot_undo')}</strong></p>
                        </DialogContent>
                        <DialogActions
                            sx={{
                                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                                borderTop: (theme) => `1px solid ${theme.palette.divider}`,
                                px: 3,
                                py: 2.5,
                                gap: 2,
                            }}
                        >
                            <Button
                                onClick={() => dispatch(setOpenDeleteConfirm(false))}
                                variant="outlined"
                                sx={{
                                    borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.400',
                                    '&:hover': {
                                        borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.600' : 'grey.500',
                                        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
                                    },
                                }}
                            >
                                {t('tle_sources.cancel')}
                            </Button>
                            <Button
                                variant="contained"
                                color="error"
                                onClick={handleDeleteClick}
                            >
                                {t('tle_sources.delete')}
                            </Button>
                        </DialogActions>
                    </Dialog>
                </Stack>
                <Dialog
                    open={openAddDialog}
                    onClose={handleClose}
                    fullWidth
                    maxWidth="sm"
                    PaperProps={{
                        sx: {
                            bgcolor: 'background.paper',
                            border: (theme) => `1px solid ${theme.palette.divider}`,
                            borderRadius: 2,
                        }
                    }}
                >
                    <DialogTitle
                        sx={{
                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                            borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                            fontSize: '1.25rem',
                            fontWeight: 'bold',
                            py: 2.5,
                        }}
                    >
                        {formValues.id ? t('tle_sources.dialog_title_edit') : t('tle_sources.dialog_title_add')}
                    </DialogTitle>
                    <DialogContent sx={{ bgcolor: 'background.paper', px: 3, py: 3 }}>
                        <Stack spacing={2} sx={{ mt: 3 }}>
                            <Alert severity="warning" sx={{marginBottom: 2}}>
                                <AlertTitle>{t('tle_sources.performance_notice')}</AlertTitle>
                                {t('tle_sources.performance_warning')}
                            </Alert>
                            <TextField
                                label={t('tle_sources.name')}
                                name="name"
                                value={formValues.name}
                                onChange={handleInputChange}
                                fullWidth
                            />
                            <TextField
                                label={t('tle_sources.url')}
                                name="url"
                                value={formValues.url}
                                onChange={handleInputChange}
                                fullWidth
                            />
                            <FormControl fullWidth>
                                <InputLabel id="format-label">{t('tle_sources.format')}</InputLabel>
                                <Select
                                    label={t('tle_sources.format')}
                                    name="format"
                                    value={formValues.format || ''}
                                    onChange={handleInputChange}
                                >
                                    <MenuItem value="3le">3LE</MenuItem>
                                </Select>
                            </FormControl>
                        </Stack>
                    </DialogContent>
                    <DialogActions
                        sx={{
                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                            borderTop: (theme) => `1px solid ${theme.palette.divider}`,
                            px: 3,
                            py: 2.5,
                            gap: 2,
                        }}
                    >
                        <Button
                            onClick={handleClose}
                            variant="outlined"
                            sx={{
                                borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.400',
                                '&:hover': {
                                    borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.600' : 'grey.500',
                                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
                                },
                            }}
                        >
                            {t('tle_sources.cancel')}
                        </Button>
                        <Button variant="contained" onClick={handleSubmit}
                                color="success">{formValues.id ? t('tle_sources.edit') : t('tle_sources.submit')}</Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </Box>
    );
}