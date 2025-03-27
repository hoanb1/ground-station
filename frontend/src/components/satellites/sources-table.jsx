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
import {useDispatch, useSelector} from 'react-redux';
import {fetchTLESources,  submitOrEditTLESource, deleteTLESources} from './sources-slice.jsx';
import PropTypes from "prop-types";
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import LinearProgress, {linearProgressClasses} from '@mui/material/LinearProgress';
import {betterDateTimes} from "../common/common.jsx";
import {enqueueSnackbar} from "notistack";
import {useSocket} from "../common/socket.jsx";
import {setFormValues, setOpenAddDialog, setOpenDeleteConfirm, setSelected} from "./sources-slice.jsx"

const columns = [
    {field: 'name', headerName: 'Name', width: 150},
    {field: 'identifier', headerName: 'ID', width: 150},
    {field: 'url', headerName: 'URL', width: 600},
    {field: 'format', headerName: 'Format', width: 80},
    {
        field: 'added',
        headerName: 'Added',
        width: 400,
        renderCell: (params) => {
            return betterDateTimes(params.value);
        }
    },
];

const paginationModel = {page: 0, pageSize: 10};

function LinearProgressWithLabel(props) {
    return (
        <Box sx={{display: 'flex', alignItems: 'center'}}>
            <Box sx={{width: '100%', mr: 1}}>
                <LinearProgress variant="determinate" {...props} />
            </Box>
            <Box sx={{minWidth: 35}}>
                <Typography variant="body2" sx={{color: 'text.secondary'}}>
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

    const BorderLinearProgress = styled(LinearProgress)(({theme}) => ({
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
        <Box sx={{display: 'flex', alignItems: 'left', width: '100%'}}>
            <Box sx={{width: '100%', mr: 1}}>
                <BorderLinearProgress
                    value={progress}
                    variant="determinate"
                />
            </Box>
            <Box sx={{minWidth: 35}}>
                <Typography variant="body2" sx={{color: 'text.secondary'}}>
                    {`${Math.round(progress)}%`}
                </Typography>
            </Box>
        </Box>
    );
}

const SynchronizeTLEsCard = function () {
    const { socket } = useSocket();
    const [progress, setProgress] = useState({});
    const [message, setMessage] = useState('');

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
            setMessage(data.message);

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
        <Card sx={{display: 'flex', marginTop: 2, marginBottom: 0}}>
            <Box sx={{display: 'flex', flexDirection: 'column', width: '40%'}}>
                <CardContent sx={{flexGrow: 1, display: 'flex', flexDirection: 'column'}}>
                    <Typography component="div" variant="h6">
                        Fetch data from TLE sources
                    </Typography>
                    <Typography variant="subtitle1" component="div" sx={{color: 'text.secondary'}}>
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
                <Box sx={{ display: 'flex', flexDirection: 'column', width: '90%' }}>
                    <LinearWithValueLabel progress={progress}/>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', width: '90%', 'marginTop': 1 }}>
                    {message}
                </Box>
            </Box>
        </Card>
    );
}

export default function SourcesTable() {
    const dispatch = useDispatch();
    const {socket} = useSocket();
    const {tleSources, loading, formValues, openDeleteConfirm, openAddDialog, selected} = useSelector((state) => state.tleSources);
    const defaultFormValues = {
        id: null,
        identifier: '',
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
            .then(() => {
                enqueueSnackbar("TLE sources deleted successfully", {
                    variant: 'success',
                    autoHideDuration: 4000,
                })
            })
            .catch((error) => {
                enqueueSnackbar("Failed to delete TLE sources: " + error, {
                    variant: 'error',
                    autoHideDuration: 5000,
                })
            })
        dispatch(setOpenDeleteConfirm(false));
    };

    const handleSubmit = () => {
        if (formValues.id === null) {
            dispatch(submitOrEditTLESource({socket, formValues}))
                .unwrap()
                .then(() => {
                    enqueueSnackbar("TLE source added successfully", {
                        variant: 'success',
                        autoHideDuration: 4000,
                    })
                })
                .catch((error) => {
                    enqueueSnackbar("Failed to add TLE source: " + error, {
                        variant: 'error',
                    })
                });
        } else {
            dispatch(submitOrEditTLESource({socket, formValues}))
                .unwrap()
                .then(() => {
                    enqueueSnackbar("TLE source updated successfully", {
                        variant: 'success',
                        autoHideDuration: 4000,
                    })
                })
                .catch((error) => {
                    enqueueSnackbar("Failed to update TLE source: " + error, {})
                });
        }
        dispatch(setOpenAddDialog(false));
    };

    useEffect(() => {
        dispatch(fetchTLESources({socket}));
    }, [dispatch]);

    return (
        <Box sx={{width: '100%', marginTop: 0}}>
            <Alert severity="info">
                <AlertTitle>TLE sources</AlertTitle>
                TLE sources are loaded from Celestrak.org in TLE format
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
                        Add
                    </Button>
                    <Button variant="contained" disabled={selected.length !== 1} onClick={handleEditClick}>
                        Edit
                    </Button>
                    <Button variant="contained" color="error" disabled={selected.length < 1}
                            onClick={() => dispatch(setOpenDeleteConfirm(true))}>
                        Delete
                    </Button>
                    <Dialog open={openDeleteConfirm} onClose={() => dispatch(setOpenDeleteConfirm(false))}>
                        <DialogTitle>Confirm Deletion</DialogTitle>
                        <DialogContent>Are you sure you want to delete the selected TLE sources?</DialogContent>
                        <DialogActions>
                            <Button onClick={() => dispatch(setOpenDeleteConfirm(false))}>Cancel</Button>
                            <Button
                                variant="contained"
                                color="error"
                                onClick={handleDeleteClick}
                            >
                                Delete
                            </Button>
                        </DialogActions>
                    </Dialog>
                </Stack>
                <Dialog open={openAddDialog} onClose={handleClose} sx={{minWidth: 400}} fullWidth maxWidth="sm">
                    <DialogTitle>{formValues.id ? 'Edit' : 'Add'} TLE Source</DialogTitle>
                    <DialogContent>
                        <Stack spacing={2} sx={{marginTop: 1}}>
                            <TextField
                                label="Name"
                                name="name"
                                variant={"filled"}
                                value={formValues.name}
                                onChange={handleInputChange}
                                fullWidth
                            />
                            <TextField
                                label="ID"
                                name="identifier"
                                variant={"filled"}
                                value={formValues.identifier}
                                onChange={handleInputChange}
                                fullWidth
                            />
                            <TextField
                                label="URL"
                                name="url"
                                variant={"filled"}
                                value={formValues.url}
                                onChange={handleInputChange}
                                fullWidth
                            />
                            <FormControl fullWidth variant="filled">
                                <InputLabel id="format-label">Format</InputLabel>
                                <Select
                                    label="Format"
                                    name="format"
                                    value={formValues.format || ''}
                                    onChange={handleInputChange}
                                    variant={'filled'}>
                                    <MenuItem value="3le">3LE</MenuItem>
                                </Select>
                            </FormControl>
                        </Stack>
                    </DialogContent>
                    <DialogActions style={{margin: '0px 20px 20px 20px'}}>
                        <Button onClick={handleClose} color={"error"} variant={"outlined"}>Cancel</Button>
                        <Button variant="contained" onClick={handleSubmit}
                                color={"success"}>{formValues.id ? 'Edit' : 'Submit'}</Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </Box>
    );
}