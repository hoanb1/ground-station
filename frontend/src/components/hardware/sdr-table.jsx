import * as React from 'react';
import Box from '@mui/material/Box';
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import Stack from "@mui/material/Stack";
import {
    Alert,
    AlertTitle,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    TextField,
    Typography
} from "@mui/material";
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
    fetchSoapySDRServers,
    setSelectedSdrDevice,
} from './sdr-slice.jsx';
import Paper from "@mui/material/Paper";

// SDR type field configurations with default values
const sdrTypeFields = {
    rtlsdrusbv3: {
        excludeFields: ['host', 'port', 'driver'],
        fields: ['name', 'frequency_min', 'frequency_max', 'serial'],
        defaults: {
            name: 'USB SDR v3',
            frequency_min: 24,
            frequency_max: 1700,
            serial: ''
        }
    },
    rtlsdrtcpv3: {
        excludeFields: ['serial', 'driver'],
        fields: ['host', 'port', 'name', 'frequency_min', 'frequency_max'],
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
        excludeFields: ['host', 'port', 'driver'],
        fields: ['name', 'frequency_min', 'frequency_max', 'serial'],
        defaults: {
            name: 'USB SDR v4',
            frequency_min: 24,
            frequency_max: 1800,
            serial: ''
        }
    },
    rtlsdrtcpv4: {
        excludeFields: ['serial', 'driver'],
        fields: ['host', 'port', 'name', 'frequency_min', 'frequency_max'],
        defaults: {
            host: '127.0.0.1',
            port: 1234,
            name: 'TCP SDR v4',
            frequency_min: 24,
            frequency_max: 1800,
            serial: ''
        }
    },
    soapysdrremote: {
        excludeFields: [],
        fields: ['host', 'port', 'name', 'frequency_min', 'frequency_max', 'driver', 'serial'],
        defaults: {
            host: '',
            port: 1234,
            name: 'SoapySDR Remote',
            frequency_min: 24,
            frequency_max: 1800,
            driver: '',
            serial: ''
        }
    }
};

export default function SDRsPage() {
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
        formValues,
        soapyServers,
        selectedSdrDevice,
    } = useSelector((state) => state.sdrs);

    useEffect(() => {
        dispatch(fetchSoapySDRServers({socket}));
    }, []);

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
            field: 'driver', headerName: 'Driver', flex: 1, minWidth: 100
        },
        {
            field: 'serial', headerName: 'Serial', flex: 1, minWidth: 150
        },
    ];

    const handleChange = (e) => {
        const {name, value} = e.target;

        // If changing the SDR type, apply default values for that type
        if (name === 'type') {
            const newType = value;
            const typeConfig = sdrTypeFields[newType];

            if (typeConfig && typeConfig.defaults) {
                // Set excluded fields to null and apply defaults
                const nullifiedExcluded = typeConfig.excludeFields.reduce((acc, field) => {
                    acc[field] = null;
                    return acc;
                }, {});

                dispatch(setFormValues({
                    ...typeConfig.defaults,
                    ...nullifiedExcluded,
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
                    onChange={(e) => {
                        handleChange({target: {name: "type", value: e.target.value}});
                        dispatch(setSelectedSdrDevice('')); // Reset selected SDR when type changes
                    }}
                    variant={'filled'}>
                    <MenuItem value="rtlsdrusbv3">RTL-SDR USB v3</MenuItem>
                    <MenuItem value="rtlsdrtcpv3">RTL-SDR TCP v3</MenuItem>
                    <MenuItem value="rtlsdrusbv4">RTL-SDR USB v4</MenuItem>
                    <MenuItem value="rtlsdrtcpv4">RTL-SDR TCP v4</MenuItem>
                    <MenuItem value="soapysdrremote">SoapySDR Remote</MenuItem>
                </Select>
            </FormControl>
        ];

        // If a valid SDR type is selected, add the corresponding fields
        if (selectedType && sdrTypeFields[selectedType]) {
            const config = sdrTypeFields[selectedType];

            // Host field - only show for types that don't exclude it
            if (!config.excludeFields.includes('host')) {
                if (selectedType === 'soapysdrremote' && soapyServers && Object.keys(soapyServers).length > 0) {
                    // For SoapySDRRemote, create a dropdown of available servers
                    fields.push(
                        <FormControl key="host-select" fullWidth variant="filled">
                            <InputLabel id="host-label">SoapySDR Server</InputLabel>
                            <Select
                                name="host"
                                labelId="host-label"
                                value={formValues.host || ''}
                                onChange={(e) => {
                                    const serverIp = e.target.value;
                                    const selectedServerEntry = Object.entries(soapyServers).find(([_, server]) => server.ip === serverIp);
                                    const serverInfo = selectedServerEntry ? selectedServerEntry[1] : {};
                                    
                                    // Reset selected SDR when server changes
                                    dispatch(setSelectedSdrDevice(''));

                                    // Use a single dispatch call with all values that need to be updated
                                    dispatch(setFormValues({
                                        ...formValues,
                                        host: serverInfo.ip || '',
                                        port: serverInfo.port || 1234
                                    }));
                                }}
                                variant={'filled'}>
                                {Object.entries(soapyServers).map(([key, server]) => (
                                    <MenuItem key={key} value={server.ip}>
                                        {key}: {server.ip}:{server.port} ({server.sdrs.length} SDRs)
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    );

                    // If a server is selected, add a dropdown to select SDR devices from that server
                    if (formValues.host) {
                        const selectedServerEntry = Object.entries(soapyServers).find(([_, server]) => server.ip === formValues.host);
                        const selectedServerInfo = selectedServerEntry ? selectedServerEntry[1] : null;
                        
                        if (selectedServerInfo && selectedServerInfo.sdrs && selectedServerInfo.sdrs.length > 0) {
                            fields.push(
                                <FormControl key="sdr-device-select" fullWidth variant="filled">
                                    <InputLabel id="sdr-device-label">SDR Device</InputLabel>
                                    <Select
                                        labelId="sdr-device-label"
                                        value={selectedSdrDevice}
                                        onChange={(e) => {
                                            const selectedSdrIndex = e.target.value;
                                            dispatch(setSelectedSdrDevice(selectedSdrIndex));
                                            
                                            if (selectedSdrIndex !== '') {
                                                const selectedSdr = selectedServerInfo.sdrs[selectedSdrIndex];
                                                
                                                if (selectedSdr) {
                                                    // Prepare new form values with SDR device information
                                                    const newValues = {
                                                        ...formValues,
                                                        name: selectedSdr.label || 'SoapySDR Device',
                                                        driver: selectedSdr['remote:driver'] || selectedSdr.driver || '',
                                                        serial: selectedSdr.serial || ''
                                                    };
                                                    
                                                    dispatch(setFormValues(newValues));
                                                }
                                            }
                                        }}
                                        variant={'filled'}>
                                        <MenuItem value="">Select SDR Device</MenuItem>
                                        {selectedServerInfo.sdrs.map((sdr, index) => (
                                            <MenuItem key={index} value={index}>
                                                {sdr.label || sdr.driver || `SDR Device ${index}`}
                                                {sdr.serial ? ` :: ${sdr.serial}` : ''}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            );
                        }
                    }
                } else {
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
            );

            // Driver field - only show for types that don't exclude it
            if (!config.excludeFields.includes('driver')) {
                fields.push(
                    <TextField
                        key="driver"
                        name="driver"
                        label="Driver"
                        fullWidth
                        variant="filled"
                        onChange={handleChange}
                        value={getFieldValue('driver')}
                    />
                );
            }

            // Serial field - only show for types that don't exclude it
            if (!config.excludeFields.includes('serial')) {
                fields.push(
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
        }

        return fields;
    };
    return (
        <Paper elevation={3} sx={{padding: 2, marginTop: 0}}>
            <Alert severity="info" sx={{mb: 2}}>
                <AlertTitle>Configuring RTL-SDR Serial Numbers</AlertTitle>
                Use these commands in terminal to change device serial numbers:
                <Box sx={{pl: 2, mt: 1}}>
                    <Typography component="div" variant="body2" color="text.secondary">
                        1. View current ID: <code>rtl_eeprom -d 0</code>
                        <br/>
                        2. Set new serial: <code>rtl_eeprom -d 0 -s NEWSERIAL</code>
                        <br/>
                        3. Verify changes: <code>rtl_test</code>
                    </Typography>
                </Box>
            </Alert>
            {soapyServers && Object.keys(soapyServers).length > 0 ? (
                <Alert severity="success" sx={{mb: 2}}>
                    <AlertTitle>Discovered SoapySDR Servers</AlertTitle>
                    {Object.entries(soapyServers).map(([key, server], index) => (
                        <Box key={key} sx={{pl: 2, mt: 1}}>
                            <Typography component="div" variant="body2" color="text.secondary"
                                        sx={{fontFamily: 'monospace'}}>
                                {key}: {server['ip']}:{server['port']} with {server['sdrs'].length} SDRs
                            </Typography>
                        </Box>
                    ))}
                </Alert>
            ) : null}
            <Box component="form" sx={{mt: 2}}>
                <Box sx={{width: '100%'}}>
                    <DataGrid
                        loading={loading}
                        rows={sdrs.map(row => ({
                            ...row,
                            host: row.host || '-',
                            port: row.port || '-',
                            serial: row.serial || '-'
                        }))}
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
            </Box>
        </Paper>
    );
}