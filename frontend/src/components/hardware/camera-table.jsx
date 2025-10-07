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
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import Stack from "@mui/material/Stack";
import {Alert, AlertTitle, Button, FormControl, InputLabel, MenuItem, Select, TextField} from "@mui/material";
import {useEffect, useState} from "react";
import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import {useSocket} from "../common/socket.jsx";
import toast from 'react-hot-toast';
import {useDispatch, useSelector} from 'react-redux';
import {
    deleteCameras,
    fetchCameras,
    submitOrEditCamera,
    setOpenDeleteConfirm,
    setOpenAddDialog,
    setFormValues,
} from './camera-slice.jsx';
import Paper from "@mui/material/Paper";

export default function CameraTable() {
    const {socket} = useSocket();
    const dispatch = useDispatch();
    const [selected, setSelected] = useState([]);
    const [pageSize, setPageSize] = useState(10);
    const {
        loading,
        cameras,
        status,
        error,
        openAddDialog,
        openDeleteConfirm,
        formValues
    } = useSelector((state) => state.cameras);

    const columns = [
        {field: 'name', headerName: 'Name', flex: 1, minWidth: 150},
        {field: 'url', headerName: 'URL', flex: 1, minWidth: 200},
        {field: 'type', headerName: 'Type', flex: 1, minWidth: 100},
    ];

    const handleChange = (e) => {
        const {name, value} = e.target;
        dispatch(setFormValues({...formValues, [name]: value}));
    };

    const handleSubmit = () => {
        dispatch(submitOrEditCamera({socket, formValues}))
            .unwrap()
            .then(() => {
                toast.success('Camera saved successfully');
                setOpenAddDialog(false);
            })
            .catch((err) => {
                toast.error(err.message);
            });
    }

    const handleDelete = () => {
        dispatch(deleteCameras({socket, selectedIds: selected}))
            .unwrap()
            .then(() => {
                toast.success('Camera(s) deleted successfully');
                dispatch(setOpenDeleteConfirm(false));
            })
            .catch((err) => {
                toast.error(err.message);
            });
    };

    return (
        <Paper elevation={3} sx={{padding: 2, marginTop: 0}}>
            <Alert severity="info">
                <AlertTitle>Camera Integration Setup</AlertTitle>
                Configure camera streams for visual monitoring during satellite tracking operations. Currently,
                only WebRTC is fully supported for real-time, low-latency streaming. For RTSP camera sources,
                consider using go2rtc, which is now built
                into Home Assistant 2024.11 and later.
                Go2rtc provides a comprehensive streaming solution supporting RTSP, WebRTC, HomeKit, FFmpeg,
                and RTMP formats. Add, edit, and manage camera connections with custom names and stream URLs
                for integration with your ground station setup.
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <Box sx={{width: '100%'}}>
                    <DataGrid
                        loading={loading}
                        rows={cameras}
                        columns={columns}
                        checkboxSelection
                        disableSelectionOnClick
                        onRowSelectionModelChange={(selected) => {
                            setSelected(selected);
                        }}
                        initialState={{
                            pagination: {paginationModel: {pageSize: 5}},
                            sorting: {
                                sortModel: [{field: 'name', sort: 'desc'}],
                            },
                        }}
                        selectionModel={selected}
                        pageSize={pageSize}
                        pageSizeOptions={[5, 10, 25, {value: -1, label: 'All'}]}
                        onPageSizeChange={(newPageSize) => setPageSize(newPageSize)}
                        rowsPerPageOptions={[5, 10, 25]}
                        getRowId={(row) => row.id}
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
                    <Stack direction="row" spacing={2} style={{marginTop: 15}}>
                        <Button variant="contained" onClick={() => dispatch(setOpenAddDialog(true))}>
                            Add
                        </Button>
                        <Dialog fullWidth={true} open={openAddDialog} onClose={() => dispatch(setOpenAddDialog(false))}>
                            <DialogTitle>Add Camera</DialogTitle>
                            <DialogContent>
                                <Stack spacing={2}>
                                    <TextField name="name" label="Name" fullWidth variant="filled"
                                               onChange={handleChange}
                                               value={formValues.name}/>
                                    <TextField name="url" label="URL" fullWidth variant="filled"
                                               onChange={handleChange} value={formValues.url}/>
                                    <FormControl fullWidth variant="filled">
                                        <InputLabel id="camera-type-label">Camera Type</InputLabel>
                                        <Select
                                            name="type"
                                            labelId="camera-type-label"
                                            value={formValues.type}
                                            onChange={(e) => handleChange({
                                                target: {
                                                    name: "type",
                                                    value: e.target.value
                                                }
                                            })}
                                            variant={'filled'}>
                                            <MenuItem value="webrtc">WebRTC</MenuItem>
                                            <MenuItem value="hls">HLS</MenuItem>
                                            <MenuItem value="mjpeg">MJPEG</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Stack>
                            </DialogContent>
                            <DialogActions style={{padding: '0px 24px 20px 20px'}}>
                                <Button onClick={() => dispatch(setOpenAddDialog(false))} color="error"
                                        variant="outlined">
                                    Cancel
                                </Button>
                                <Button
                                    color="success"
                                    variant="contained"
                                    onClick={handleSubmit}
                                >
                                    Submit
                                </Button>
                            </DialogActions>
                        </Dialog>
                        <Button
                            variant="contained"
                            disabled={selected.length !== 1}
                            onClick={() => {
                                const selectedRow = cameras.find(row => row.id === selected[0]);
                                if (selectedRow) {
                                    dispatch(setFormValues(selectedRow));
                                    dispatch(setOpenAddDialog(true));
                                }
                            }}
                        >
                            Edit
                        </Button>
                        <Button
                            variant="contained"
                            disabled={selected.length < 1}
                            color="error"
                            onClick={() => dispatch(setOpenDeleteConfirm(true))}
                        >
                            Delete
                        </Button>
                        <Dialog
                            open={openDeleteConfirm}
                            onClose={() => dispatch(setOpenDeleteConfirm(false))}
                        >
                            <DialogTitle>Confirm Deletion</DialogTitle>
                            <DialogContent>
                                Are you sure you want to delete the selected item(s)?
                            </DialogContent>
                            <DialogActions>
                                <Button onClick={() => dispatch(setOpenDeleteConfirm(false))} color="error"
                                        variant="outlined">
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={handleDelete}
                                    color="error"
                                >
                                    Delete
                                </Button>
                            </DialogActions>
                        </Dialog>
                    </Stack>
                </Box>
            </Box>
        </Paper>

    );
}