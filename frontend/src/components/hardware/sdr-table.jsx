import * as React from 'react';
import Box from '@mui/material/Box';
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import Stack from "@mui/material/Stack";
import {Button, FormControl, InputLabel, MenuItem, Select, TextField} from "@mui/material";
import {useEffect, useState} from "react";
import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";
import { useDispatch, useSelector } from 'react-redux';
import {
    deleteSDRs,
    fetchSDRs,
    submitOrEditSDR,
    setOpenDeleteConfirm,
    setOpenAddDialog,
    setFormValues,
} from './sdr-slice.jsx';

// SDR type field configurations with default values
const sdrTypeFields = {
    rtlsdrusbv3: {
        excludeFields: ['host', 'port'],
        fields: ['name', 'frequency_min', 'frequency_max', 'serial'],
        defaults: {
            name: 'USB SDR v3',
            frequency_min: 24,
            frequency_max: 1700,
            serial: ''
        }
    },
    rtlsdrtcpv3: {
        excludeFields: [],
        fields: ['host', 'port', 'name', 'frequency_min', 'frequency_max', 'serial'],
        defaults: {
            host: '127.0.0.1',
            port: 1234,
            name: 'TCP SDR v3',
            frequency_min: 24,
            frequency_max: 1700,
            serial: ''
        }
    },
    rtlsdrusbv4: {
        excludeFields: ['host', 'port'],
        fields: ['name', 'frequency_min', 'frequency_max', 'serial'],
        defaults: {
            name: 'USB SDR v4',
            frequency_min: 24,
            frequency_max: 1800,
            serial: ''
        }
    },
    rtlsdrtcpv4: {
        excludeFields: [],
        fields: ['host', 'port', 'name', 'frequency_min', 'frequency_max', 'serial'],
        defaults: {
            host: '127.0.0.1',
            port: 1234,
            name: 'TCP SDR v4',
            frequency_min: 24,
            frequency_max: 1800,
            serial: ''
        }
    }
};

export default function SDRTable() {
    const {socket} = useSocket();
    const dispatch = useDispatch();
    const [selected, setSelected] = useState([]);
    const [pageSize, setPageSize] = useState(10);
    const {
        loading,
        sdrs,
        status,
        error,
        openAddDialog,
        openDeleteConfirm,
        formValues
    } = useSelector((state) => state.sdrs);

    const columns = [
        {
            field: 'name', headerName: 'Name', flex: 1, minWidth: 150
        },
        {
            field: 'type', headerName: 'Type', flex: 1, minWidth: 100
        },
        {
            field: 'host', headerName: 'Host', flex: 1, minWidth: 150
        },
        {
            field: 'port', headerName: 'Port', flex: 1, minWidth: 100
        },
        {
            field: 'frequency_range',
            headerName: 'Frequency Range (MHz)',
            flex: 1,
            minWidth: 200,
            valueGetter: (params) => {
                if (!params) {
                    return "-";
                }
                return `${params['min'] || 0} - ${params['max'] || 0}`;
            },
        },
        {
            field: 'serial', headerName: 'Serial', flex: 1, minWidth: 150
        },
    ];

    const handleChange = (e) => {
        const { name, value } = e.target;
        
        // If changing the SDR type, apply default values for that type
        if (name === 'type') {
            const newType = value;
            const typeConfig = sdrTypeFields[newType];
            
            if (typeConfig && typeConfig.defaults) {
                // Apply default values for the new type, preserving the type selection
                dispatch(setFormValues({
                    ...typeConfig.defaults,
                    type: newType
                }));
            } else {
                // Just update the type if no defaults are defined
                dispatch(setFormValues({...formValues, type: newType}));
            }
        } else {
            // Normal field update
            dispatch(setFormValues({...formValues, [name]: value}));
        }
    };

    const handleSubmit = () => {
        dispatch(submitOrEditSDR({socket, formValues}))
            .unwrap()
            .then(() => {
                enqueueSnackbar('SDR saved successfully', { variant: 'success' });
                dispatch(setOpenAddDialog(false));
            })
            .catch((err) => {
                enqueueSnackbar(err, { variant: 'error' });
            });
    }

    const handleDelete = () => {
        dispatch(deleteSDRs({ socket, selectedIds: selected }))
            .unwrap()
            .then(() => {
                enqueueSnackbar('SDR(s) deleted successfully', { variant: 'success' });
                dispatch(setOpenDeleteConfirm(false));
            })
            .catch((err) => {
                enqueueSnackbar(err, { variant: 'error' });
            });
    };

    // Get the field value or its default from the SDR type configuration
    const getFieldValue = (fieldName) => {
        const selectedType = formValues.type;
        
        // If we have a value in formValues, use it
        if (formValues[fieldName] !== undefined) {
            return formValues[fieldName];
        }
        
        // Otherwise check for default in the type configuration
        if (selectedType && 
            sdrTypeFields[selectedType] && 
            sdrTypeFields[selectedType].defaults && 
            sdrTypeFields[selectedType].defaults[fieldName] !== undefined) {
            return sdrTypeFields[selectedType].defaults[fieldName];
        }
        
        // Fallback to empty string/value
        return '';
    };

    // Renders form fields based on the selected SDR type
    const renderFormFields = () => {
        const selectedType = formValues.type || '';
        
        // Define common fields that all SDR types have
        const fields = [
            <FormControl key="type-select" fullWidth variant="filled">
                <InputLabel id="sdr-type-label">SDR Type</InputLabel>
                <Select
                    name="type"
                    labelId="sdr-type-label"
                    value={formValues.type || ''}
                    onChange={(e) => handleChange({target: {name: "type", value: e.target.value}})}
                    variant={'filled'}>
                    <MenuItem value="rtlsdrusbv3">RTL-SDR USB v3</MenuItem>
                    <MenuItem value="rtlsdrtcpv3">RTL-SDR TCP v3</MenuItem>
                    <MenuItem value="rtlsdrusbv4">RTL-SDR USB v4</MenuItem>
                    <MenuItem value="rtlsdrtcpv4">RTL-SDR TCP v4</MenuItem>
                </Select>
            </FormControl>
        ];

        // If a valid SDR type is selected, add the corresponding fields
        if (selectedType && sdrTypeFields[selectedType]) {
            const config = sdrTypeFields[selectedType];

            // Host field - only show for types that don't exclude it
            if (!config.excludeFields.includes('host')) {
                fields.push(
                    <TextField 
                        key="host" 
                        name="host" 
                        label="Host" 
                        fullWidth 
                        variant="filled"
                        onChange={handleChange} 
                        value={getFieldValue('host')}
                    />
                );
            }

            // Port field - only show for types that don't exclude it
            if (!config.excludeFields.includes('port')) {
                fields.push(
                    <TextField 
                        key="port" 
                        name="port" 
                        label="Port" 
                        fullWidth 
                        variant="filled"
                        type="number" 
                        onChange={handleChange} 
                        value={getFieldValue('port')}
                    />
                );
            }

            // Add the common fields that all types have
            fields.push(
                <TextField 
                    key="name" 
                    name="name" 
                    label="Name" 
                    fullWidth 
                    variant="filled" 
                    onChange={handleChange}
                    value={getFieldValue('name')}
                />,
                <TextField 
                    key="frequency_min" 
                    name="frequency_min" 
                    label="Minimum Frequency (MHz)" 
                    fullWidth 
                    variant="filled"
                    type="number" 
                    onChange={handleChange} 
                    value={getFieldValue('frequency_min')}
                />,
                <TextField 
                    key="frequency_max" 
                    name="frequency_max" 
                    label="Maximum Frequency (MHz)" 
                    fullWidth 
                    variant="filled"
                    type="number" 
                    onChange={handleChange} 
                    value={getFieldValue('frequency_max')}
                />,
                <TextField 
                    key="serial" 
                    name="serial" 
                    label="Serial" 
                    fullWidth 
                    variant="filled"
                    onChange={handleChange} 
                    value={getFieldValue('serial')}
                />
            );
        }

        return fields;
    };

    return (
        <Box sx={{ width: '100%' }}>
            <DataGrid
                loading={loading}
                rows={sdrs}
                columns={columns}
                checkboxSelection
                disableSelectionOnClick
                onRowSelectionModelChange={(selected)=>{
                    setSelected(selected);
                }}
                initialState={{
                    pagination: { paginationModel: { pageSize: 5 } },
                    sorting: {
                        sortModel: [{ field: 'name', sort: 'desc' }],
                    },
                }}
                selectionModel={selected}
                pageSize={pageSize}
                pageSizeOptions={[5, 10, 25, { value: -1, label: 'All' }]}
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
                    <DialogTitle>Add SDR</DialogTitle>
                    <DialogContent>
                        <Stack spacing={2}>
                            {renderFormFields()}
                        </Stack>
                    </DialogContent>
                    <DialogActions style={{padding: '0px 24px 20px 20px'}}>
                        <Button onClick={() => dispatch(setOpenAddDialog(false))} color="error" variant="outlined">
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
                        const selectedRow = sdrs.find(row => row.id === selected[0]);
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
                        <Button onClick={() => dispatch(setOpenDeleteConfirm(false))} color="error" variant="outlined">
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
    );
}