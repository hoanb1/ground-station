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
import Box from '@mui/material/Box';
import {
    Alert,
    AlertTitle,
    Button,
    DialogContentText,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    TextField
} from "@mui/material";
import { useTranslation } from 'react-i18next';
import Stack from "@mui/material/Stack";
import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from 'react-redux';
import {
    fetchRigs,
    deleteRigs,
    setSelected,
    submitOrEditRig,
    setOpenDeleteConfirm,
    setFormValues,
    setOpenAddDialog,
} from './rig-slice.jsx';
import { toast } from '../../utils/toast-with-timestamp.jsx';
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import {humanizeFrequency} from "../common/common.jsx";
import {useEffect} from "react";
import Paper from "@mui/material/Paper";


export default function RigTable() {
    const dispatch = useDispatch();
    const {socket} = useSocket();
    const {rigs, loading, selected, openDeleteConfirm, formValues, openAddDialog} = useSelector((state) => state.rigs);
    const { t } = useTranslation('hardware');

    const defaultRig = {
        id: null,
        name: '',
        host: 'localhost',
        port: 4532,
        radiotype: 'rx',
        pttstatus: 'normal',
        vfotype: 'normal',
        lodown: 0,
        loup: 0,
    };
    const [pageSize, setPageSize] = React.useState(10);

    const columns = [
        {field: 'name', headerName: t('rig.name'), flex: 1, minWidth: 150},
        {field: 'host', headerName: t('rig.host'), flex: 1, minWidth: 150},
        {
            field: 'port',
            headerName: t('rig.port'),
            type: 'number',
            flex: 1,
            minWidth: 80,
            align: 'right',
            headerAlign: 'right',
            valueFormatter: (value) => {
                return value;
            }
        },
        {field: 'radiotype', headerName: t('rig.radio_type'), flex: 1, minWidth: 150},
        {field: 'pttstatus', headerName: t('rig.ptt_status'), flex: 1, minWidth: 150},
        {field: 'vfotype', headerName: t('rig.vfo_type'), flex: 1, minWidth: 50},
        {
            field: 'lodown', headerName: t('rig.lo_down'), type: 'string', flex: 1, minWidth: 60,
            valueFormatter: (value) => {
                return humanizeFrequency(value);
            }
        },
        {
            field: 'loup', headerName: t('rig.lo_up'), type: 'string', flex: 1, minWidth: 60,
            valueFormatter: (value) => {
                return humanizeFrequency(value);
            }
        },
    ];

    // useEffect(() => {
    //     dispatch(fetchRigs({socket}));
    // }, [dispatch]);

    function handleFormSubmit() {
        if (formValues.id) {
            dispatch(submitOrEditRig({socket, formValues}))
                .unwrap()
                .then(() => {
                    toast.success(t('rig.edited_success'), {autoClose: 5000});
                })
                .catch((error) => {
                    toast.error(t('rig.error_editing'), {autoClose: 5000})
                });
        } else {
            dispatch(submitOrEditRig({socket, formValues}))
                .unwrap()
                .then(() => {
                    toast.success(t('rig.added_success'), {autoClose: 5000});
                })
                .catch((error) => {
                    toast.error(`${t('rig.error_adding')}: ${error}`, {autoClose: 5000})
                });
        }
        dispatch(setOpenAddDialog(false));
    }

    function handleDelete() {
        dispatch(deleteRigs({socket, selectedIds: selected}))
            .unwrap()
            .then(() => {
                dispatch(setSelected([]));
                dispatch(setOpenDeleteConfirm(false));
                toast.success(t('rig.deleted_success'), {autoClose: 5000});
            })
            .catch((error) => {
                toast.error(t('rig.error_deleting'), {autoClose: 5000});
            });
    }

    const handleChange = (e) => {
        const {name, value} = e.target;
        if (e.target.type === "number") {
            dispatch(setFormValues({...formValues, [name]: parseInt(value)}));
        } else {
            dispatch(setFormValues({...formValues, [name]: value}));
        }

    };

    return (
        <Paper elevation={3} sx={{padding: 2, marginTop: 0}}>
            <Alert severity="info">
                <AlertTitle>{t('rig.title')}</AlertTitle>
                {t('rig.subtitle')}
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <Box sx={{width: '100%'}}>
                    <DataGrid
                        loading={loading}
                        rows={rigs}
                        columns={columns}
                        checkboxSelection
                        disableSelectionOnClick
                        selectionModel={selected}
                        onRowSelectionModelChange={(selected) => {
                            dispatch(setSelected(selected));
                        }}
                        initialState={{
                            pagination: {paginationModel: {pageSize: 5}},
                            sorting: {
                                sortModel: [{field: 'name', sort: 'desc'}],
                            },
                        }}
                        pageSize={pageSize}
                        pageSizeOptions={[5, 10, 25, {value: -1, label: 'All'}]}
                        onPageSizeChange={(newPageSize) => setPageSize(newPageSize)}
                        rowsPerPageOptions={[5, 10, 25]}
                        getRowId={(row) => row.id}
                        localeText={{
                            noRowsLabel: t('rig.no_rigs')
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
                            '& .MuiDataGrid-overlay': {
                                fontSize: '0.875rem',
                                fontStyle: 'italic',
                                color: 'text.secondary',
                            },
                        }}
                    />
                    <Stack direction="row" spacing={2} style={{marginTop: 15}}>
                        <Button variant="contained" onClick={() => {
                            dispatch(setFormValues(defaultRig));
                            dispatch(setOpenAddDialog(true));
                        }}>
                            {t('rig.add')}
                        </Button>
                        <Button variant="contained" disabled={selected.length !== 1} onClick={() => {
                            const rigToEdit = rigs.find((rig) => rig.id === selected[0]);
                            if (rigToEdit) {
                                dispatch(setFormValues(rigToEdit));
                                dispatch(setOpenAddDialog(true));
                            }
                        }}>
                            {t('rig.edit')}
                        </Button>
                        <Button
                            variant="contained"
                            disabled={selected.length < 1}
                            color="error"
                            onClick={() => dispatch(setOpenDeleteConfirm(true))}
                        >
                            {t('rig.delete')}
                        </Button>
                    </Stack>
                    <Dialog open={openAddDialog} onClose={() => dispatch(setOpenAddDialog(false))}>
                        <DialogTitle>{t('rig.add_dialog_title')}</DialogTitle>
                        <DialogContent>
                            <TextField
                                autoFocus
                                name="name"
                                margin="dense"
                                label={t('rig.name')}
                                type="text"
                                fullWidth
                                variant="filled"
                                value={formValues.name}
                                onChange={handleChange}
                            />
                            <TextField
                                name="host"
                                margin="dense"
                                label={t('rig.host')}
                                type="text"
                                fullWidth
                                variant="filled"
                                value={formValues.host}
                                onChange={handleChange}
                            />
                            <TextField
                                name="port"
                                margin="dense"
                                label={t('rig.port')}
                                type="number"
                                fullWidth
                                variant="filled"
                                value={formValues.port}
                                onChange={handleChange}
                            />
                            <FormControl margin="dense" fullWidth variant="filled">
                                <InputLabel>{t('rig.radio_type')}</InputLabel>
                                <Select
                                    name="radiotype"
                                    value={formValues.radiotype}
                                    onChange={handleChange}
                                    variant={'filled'}>
                                    <MenuItem value="rx">{t('rig.rx')}</MenuItem>
                                </Select>
                            </FormControl>
                            <FormControl margin="dense" fullWidth variant="filled">
                                <InputLabel>{t('rig.ptt_status')}</InputLabel>
                                <Select
                                    name="pttstatus"
                                    value={formValues.pttstatus}
                                    onChange={handleChange}
                                    variant={'filled'}>
                                    <MenuItem value="normal">{t('rig.normal')}</MenuItem>
                                </Select>
                            </FormControl>
                            <FormControl margin="dense" fullWidth variant="filled">
                                <InputLabel>{t('rig.vfo_type')}</InputLabel>
                                <Select
                                    name="vfotype"
                                    value={formValues.vfotype}
                                    onChange={handleChange}
                                    variant={'filled'}>
                                    <MenuItem value="normal">{t('rig.normal')}</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField
                                margin="dense"
                                name="lodown"
                                label={t('rig.lo_down')}
                                type="number"
                                fullWidth
                                variant="filled"
                                value={formValues.lodown}
                                onChange={handleChange}
                            />
                            <TextField
                                margin="dense"
                                name="loup"
                                label={t('rig.lo_up')}
                                type="number"
                                fullWidth
                                variant="filled"
                                value={formValues.loup}
                                onChange={handleChange}
                            />
                        </DialogContent>
                        <DialogActions style={{padding: '0px 24px 20px 20px'}}>
                            <Button onClick={() => dispatch(setOpenAddDialog(false))} color="error" variant="outlined">
                                {t('rig.cancel')}
                            </Button>
                            <Button onClick={() => handleFormSubmit()} color="success" variant="contained">
                                {t('rig.submit')}
                            </Button>
                        </DialogActions>
                    </Dialog>
                    <Dialog open={openDeleteConfirm} onClose={() => dispatch(setOpenDeleteConfirm(false))}>
                        <DialogTitle>{t('rig.confirm_deletion')}</DialogTitle>
                        <DialogContent>
                            <DialogContentText>
                                {t('rig.confirm_delete_message')}
                            </DialogContentText>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => dispatch(setOpenDeleteConfirm(false))} color="error"
                                    variant="outlined">
                                {t('rig.cancel')}
                            </Button>
                            <Button
                                variant="contained"
                                onClick={() => {
                                    handleDelete();
                                }}
                                color="error"
                            >
                                {t('rig.confirm')}
                            </Button>
                        </DialogActions>
                    </Dialog>
                </Box>
            </Box>
        </Paper>
    );
}
