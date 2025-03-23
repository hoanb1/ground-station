import * as React from 'react';
import {useEffect, useState} from 'react';
import {DataGrid, gridClasses} from '@mui/x-data-grid';
import {styled, useTheme} from '@mui/material/styles';
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
import {useSocket} from "../common/socket.jsx";
import PropTypes from "prop-types";
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import LinearProgress, { linearProgressClasses } from '@mui/material/LinearProgress';
import {betterDateTimes} from "../common/common.jsx";
import {enqueueSnackbar} from "notistack";
import {useLocalStorageState} from "@toolpad/core";

const columns = [
    { field: 'name', headerName: 'Name', width: 150 },
    { field: 'identifier', headerName: 'ID', width: 150 },
    { field: 'url', headerName: 'URL', width: 600 },
    { field: 'format', headerName: 'Format', width: 80 },
    {
        field: 'added',
        headerName: 'Added',
        width: 400,
        renderCell: (params) => {
            return betterDateTimes(params.value);
        }
    },
];

const paginationModel = { page: 0, pageSize: 10 };

function LinearProgressWithLabel(props) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ width: '100%', mr: 1 }}>
                <LinearProgress variant="determinate" {...props} />
            </Box>
            <Box sx={{ minWidth: 35 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {`${Math.round(props.value)}%`}
                </Typography>
            </Box>
        </Box>
    );
}

LinearProgressWithLabel.propTypes = {
    /**
     * The value of the progress indicator for the determinate and buffer variants.
     * Value between 0 and 100.
     */
    value: PropTypes.number.isRequired,
};

function LinearWithValueLabel({progress}) {

    const BorderLinearProgress = styled(LinearProgress)(({ theme }) => ({
        height: 20,
        borderRadius: 5,
        [`&.${linearProgressClasses.colorPrimary}`]: {
            backgroundColor: theme.palette.grey[200],
            ...theme.applyStyles('dark', {
                backgroundColor: theme.palette.grey[800],
            }),
        },
        [`& .${linearProgressClasses.bar}`]: {
            borderRadius: 5,
            backgroundColor: '#1a90ff',
            ...theme.applyStyles('dark', {
                backgroundColor: '#308fe8',
            }),
        },
    }));

    return (
        <Box sx={{ display: 'flex', alignItems: 'left', width: '100%' }}>
            <Box sx={{ width: '100%', mr: 1 }}>
                <BorderLinearProgress
                    value={progress}
                    variant="determinate"
                />
            </Box>
                <Box sx={{ minWidth: 35 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {`${Math.round(progress)}%`}
                </Typography>
            </Box>
        </Box>
    );
}

const SynchronizeTLEsCard = function () {
    const { socket } = useSocket();
    const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
    const [progress, setProgress] = useLocalStorageState('tle-source-sync-progress', {});

    const handleSynchronizeSatellites = function (event) {
        socket.emit("data_request", "sync-satellite-data", null, (response) => {
            if (response.success === true) {
                console.log("Satellite data synchronization completed successfully", response);
            } else {
                console.error(response.error);
            }
        });
    }

    useEffect(() => {
        socket.on("sat-sync-events", (data) => {
            console.log("Received data for sat-sync-events:", data);
            setProgress(data.progress);

            if (data.status === 'complete') {
                enqueueSnackbar("Satellite data synchronization completed successfully", {
                    variant: 'success',
                    autoHideDuration: 4000,
                });
            }
        });

        return () => {
            socket.off("sat-sync-events");
        };
    }, []);

    return (
        <Card sx={{ display: 'flex', marginTop: 2, marginBottom: 0}}>
            <Box sx={{ display: 'flex', flexDirection: 'column', width: '40%' }}>
                <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <Typography component="div" variant="h6">
                        Fetch data from TLE sources
                    </Typography>
                    <Typography variant="subtitle1" component="div" sx={{ color: 'text.secondary' }}>
                        click to start
                    </Typography>
                </CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', pl: 1, pb: 1, padding: 2}}>
                    <Button variant="contained" color="primary" onClick={handleSynchronizeSatellites}>
                        Synchronize
                    </Button>
                </Box>
            </Box>
            <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', paddingRight: 2}}>
                <LinearWithValueLabel progress={progress}/>
            </Box>
            <Dialog
                open={confirmationDialogOpen}
                onClose={() => setConfirmationDialogOpen(false)}
            >
                <DialogTitle>Confirm Action</DialogTitle>
                <DialogContent>Are you sure you want to perform this action?</DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmationDialogOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => {
                            socket.emit("data_submission", "custom-action", null, (response) => {
                                if (response.success) {
                                    console.log("Action completed successfully", response);
                                } else {
                                    console.error("Action failed", response.error);
                                }
                            });
                            setConfirmationDialogOpen(false);
                        }}
                    >
                        Yes
                    </Button>
                </DialogActions>
            </Dialog>
        </Card>
    );
}


export default function TLESourcesTable() {
    const { socket } = useSocket();
    const [rows, setRows] = useState([]);
    const [formDialogOpen, setFormDialogOpen] = useState(false);
    const [selectedRows, setSelectedRows] = useState([]);
    const defaultFormValues = {
        id: null,
        identifier: '',
        name: '',
        url: '',
        format: '3le',
    };
    const [formDialogValues, setFormDialogValues] = useState(defaultFormValues);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
    const theme = useTheme();

    const handleAddClick = () => {
        setFormDialogValues(defaultFormValues);
        setFormDialogOpen(true);
    };

    const handleClose = () => {
        setFormDialogOpen(false);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormDialogValues(prev => ({ ...prev, [name]: value }));
    };

    const handleEditClick = (e) => {
        const singleRowId = selectedRows[0];
        setFormDialogValues({...rows.find(r => r.id === singleRowId), id: singleRowId});
        setFormDialogOpen(true);
    };

    const handleDeleteClick = (e) => {
        socket.emit("data_submission", "delete-tle-sources", selectedRows, (response) => {
            if (response.success === true) {
                setRows(response.data);
            } else {
                console.error(response.error);
            }
        });
    };

    const handleSubmit = () => {
        let cmd = null;
        if(formDialogValues.id === null) {
            cmd = 'submit-tle-sources';
        } else if (formDialogValues.id) {
            cmd = 'edit-tle-source';
        }

        socket.emit("data_submission", cmd, {...formDialogValues}, (response) => {
            if (response.success === true) {
                setFormDialogOpen(false);
                setRows(response.data);
            } else {
                enqueueSnackbar("Error adding TLE source", {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
        });
    };

    useEffect(() => {
        socket.emit("data_request", "get-tle-sources", null, (response) => {
            setRows(response.data);
        });

        return () => {

        };
    }, []);
    
    return (
        <Box sx={{ width: '100%', marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>TLE sources</AlertTitle>
                TLE sources are loaded from Celestrak.org in TLE format
            </Alert>
            <SynchronizeTLEsCard/>
            <Box sx={{marginTop: 4}}>
                <Dialog open={confirmationDialogOpen} onClose={() => setConfirmationDialogOpen(false)}>
                    <DialogTitle>Confirm Action</DialogTitle>
                    <DialogContent>Are you sure you want to perform this action?</DialogContent>
                    <DialogActions>
                        <Button onClick={() => setConfirmationDialogOpen(false)}>Cancel</Button>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => {
                                socket.emit("data_submission", "custom-action", null, (response) => {
                                    if (response.success) {
                                        console.log("Action completed successfully", response);
                                    } else {
                                        console.error("Action failed", response.error);
                                    }
                                });
                                setConfirmationDialogOpen(false);
                            }}
                        >
                            Yes
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
            <DataGrid
                rows={rows}
                columns={columns}
                initialState={{ pagination: { paginationModel } }}
                pageSizeOptions={[5, 10]}
                checkboxSelection={true}
                onRowSelectionModelChange={(selected) => {
                    setSelectedRows(selected);
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
            <Stack direction="row" spacing={2} sx={{ marginTop: 2 }}>
                <Button variant="contained" onClick={handleAddClick}>
                    Add
                </Button>
                <Button variant="contained" disabled={selectedRows.length !== 1} onClick={handleEditClick}>
                    Edit
                </Button>
                <Button variant="contained" color="error" disabled={selectedRows.length < 1} onClick={() => setDeleteConfirmOpen(true)}>
                    Delete
                </Button>
                <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                    <DialogTitle>Confirm Deletion</DialogTitle>
                    <DialogContent>Are you sure you want to delete the selected rows?</DialogContent>
                    <DialogActions>
                        <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                        <Button
                            variant="contained"
                            color="error"
                            onClick={() => {
                                handleDeleteClick();
                                setDeleteConfirmOpen(false);
                            }}
                        >
                            Delete
                        </Button>
                    </DialogActions>
                </Dialog>
            </Stack>
            <Dialog open={formDialogOpen} onClose={handleClose} sx={{ minWidth: 400 }} fullWidth maxWidth="sm">
                <DialogTitle>Add TLE Source</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ marginTop: 1 }}>
                        <TextField
                            label="Name"
                            name="name"
                            variant={"filled"}
                            value={formDialogValues.name}
                            onChange={handleInputChange}
                            fullWidth
                        />
                        <TextField
                            label="ID"
                            name="identifier"
                            variant={"filled"}
                            value={formDialogValues.identifier}
                            onChange={handleInputChange}
                            fullWidth
                        />
                        <TextField
                            label="URL"
                            name="url"
                            variant={"filled"}
                            value={formDialogValues.url}
                            onChange={handleInputChange}
                            fullWidth
                        />
                        <FormControl fullWidth variant="filled">
                            <InputLabel id="format-label">Format</InputLabel>
                            <Select
                                label="Format"
                                name="format"
                                value={formDialogValues.format || ''}
                                onChange={handleInputChange}
                             variant={'filled'}>
                                <MenuItem value="3le">3LE</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions style={{margin: '0px 20px 20px 20px'}}>
                    <Button onClick={handleClose} color={"error"} variant={"outlined"}>Cancel</Button>
                    <Button variant="contained" onClick={handleSubmit} color={"success"}>Submit</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}