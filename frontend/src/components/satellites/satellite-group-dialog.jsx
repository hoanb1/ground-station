import {useSocket} from "../common/socket.jsx";
import {Fragment, useCallback, useEffect, useState} from "react";
import * as React from "react";
import {enqueueSnackbar} from "notistack";
import {Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField} from "@mui/material";
import {DataGrid} from "@mui/x-data-grid";
import Autocomplete from "@mui/material/Autocomplete";
import CircularProgress from "@mui/material/CircularProgress";


export function AutocompleteAsync({setSelectedSatelliteCallback}) {
    const {socket} = useSocket();
    const [open, setOpen] = React.useState(false);
    const [options, setOptions] = React.useState([]);
    const [loading, setLoading] = React.useState(false);

    const search = (keyword) => {
        (async () => {
            setLoading(true);
            socket.emit("data_request", "get-satellite-search", keyword, (response) => {
                console.log("Received data for get-satellite-search:", response);
                if (response.success) {
                    setOptions(response.data);
                } else {
                    console.error(response.error);
                    enqueueSnackbar(`Error searching for satellites: ${response.error}`, {
                        variant: 'error',
                        autoHideDuration: 5000,
                    });
                    setOptions([]);
                }
                setLoading(false);
            });
        })();
    };

    const handleOpen = () => {
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
        setOptions([]);
    };

    const handleInputChange = (event, newInputValue) => {
        if (newInputValue.length > 2) {
            search(newInputValue);
        }
    };

    const handleOptionSelect = (event, newValue) => {
        if (newValue !== null) {
            newValue['id'] = newValue['norad_id'];
            setSelectedSatelliteCallback(newValue);
        }
    }

    return (
        <Autocomplete
            sx={{ minWidth: 200 }}
            open={open}
            fullWidth={true}
            onOpen={handleOpen}
            onClose={handleClose}
            onInputChange={handleInputChange}
            onChange={handleOptionSelect}
            isOptionEqualToValue={(option, value) => option.name === value.name}
            getOptionLabel={(option) => {
                return `${option['norad_id']} - ${option['name']}`;
            }}
            options={options}
            loading={loading}
            renderInput={(params) => (
                <TextField
                    variant={"filled"}
                    fullWidth={true}
                    {...params}
                    label="Add satellites (search by name or NORAD ID)"
                    slotProps={{
                        input: {
                            ...params.InputProps,
                            endAdornment: (
                                <Fragment>
                                    {loading ? <CircularProgress color="inherit" size={20} /> : null}
                                    {params.InputProps.endAdornment}
                                </Fragment>
                            ),
                        },
                    }}
                />
            )}
        />
    );
}

export function AddEditDialog({formDialogOpen, handleRowsCallback, handleDialogOpenCallback, satGroup}) {
    const { socket } = useSocket();
    const defaultFormValues = {
        id: '',
        name: '',
        satellite_ids: [],
    };
    const [formDialogValues, setFormDialogValues] = useState(defaultFormValues);
    const [formErrorStatus, setFormErrorStatus] = useState(false);
    const [selectionModel, setSelectionModel] = useState([]);
    const paginationModel = {page: 0, pageSize: 10};
    const [satellites, setSatellites] = useState([]);
    const [loading, setLoading] = useState(false);

    const handleDialogClose = () => {
        handleDialogOpenCallback(false);
    };

    useEffect(() => {
        setFormDialogValues(defaultFormValues);
        return () => {

        };
    }, [formDialogOpen]);

    useEffect(() => {
        setLoading(true);
        if (satGroup) {
            // fetch the satellites for the satellite_id set in the satGroup
            if (satGroup.satellite_ids && satGroup.satellite_ids.length > 0) {
                socket.emit("data_request", "get-satellites", satGroup.satellite_ids, (response) => {
                    if (response.success) {
                        setSatellites(response.data);
                    } else {
                        console.error(response.error);
                    }
                })
            }

            setFormDialogValues({
                id: satGroup.id,
                name: satGroup.name,
                satellite_ids: satGroup.satellite_ids || [],
            });
            setSelectionModel(satGroup.satellite_ids || []);

            setLoading(false);
        }

        return () => {

        };
    }, [satGroup]);

    const handleFormSubmit = (event) => {
        event.preventDefault();

        let cmd;
        let newRow;
        let successMessage = "Satellite group added successfully";
        if(formDialogValues.id) {
            cmd = 'edit-satellite-group';
            newRow = {
                id: formDialogValues.id,
                name: formDialogValues.name,
                satellite_ids: selectionModel,
            };
            successMessage = "Satellite group edited successfully";
        } else {
            cmd = 'submit-satellite-group';
            // create a new row based on input values
            newRow = {
                name: formDialogValues.name,
                satellite_ids: selectionModel,
            };
            successMessage = "Satellite group added successfully";
        }
        socket.emit("data_submission", cmd, newRow, (response) => {
            if (response.success === true) {
                handleRowsCallback(response.data)
                handleDialogOpenCallback(false);
                enqueueSnackbar(successMessage, {
                    variant: 'success',
                    autoHideDuration: 5000,
                });
            } else {
                enqueueSnackbar("Error adding satellite group", {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
        });
    };

    const setSelectedSatelliteCallback = useCallback((satellite) => {
        setSatellites(prevSatellites => [...prevSatellites, satellite]);
        setSelectionModel(prevSelectionModel => [...prevSelectionModel, satellite.id]);

    }, []);

    return (
        <Dialog open={formDialogOpen} onClose={handleDialogClose} maxWidth="md" fullWidth>
            <DialogTitle>Add a new satellite group</DialogTitle>
            <form onSubmit={handleFormSubmit}>
                <DialogContent sx={{minHeight: 600}}>
                    <TextField
                        autoComplete="new-password"
                        autoFocus
                        id="name"
                        error={formErrorStatus}
                        name="name"
                        margin="dense"
                        label="Name"
                        fullWidth
                        variant={"filled"}
                        value={formDialogValues.name || ''}
                        onChange={(e) => setFormDialogValues(prevValues => ({...prevValues, name: e.target.value}))}
                        required
                    />
                    <Box sx={{marginTop: 2}}>
                        <AutocompleteAsync setSelectedSatelliteCallback={setSelectedSatelliteCallback}/>
                        <DataGrid
                            loading={loading}
                            getRowId={(row) => row['norad_id']}
                            rows={satellites}
                            columns={[
                                {field: 'norad_id', headerName: 'NORAD ID', width: 150},
                                {field: 'name', headerName: 'Name', width: 300},
                            ]}
                            initialState={{pagination: {paginationModel}}}
                            pageSizeOptions={[5, 10]}
                            sx={{
                                height: 400,
                                marginTop: 2,
                                border: '1px solid rgba(0, 0, 0, 0.12)',
                            }}
                            checkboxSelection
                            rowSelectionModel={selectionModel}
                            onRowSelectionModelChange={(newModel) => setSelectionModel(newModel)}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{padding: '0 24px 24px 24px'}}>
                    <Button onClick={handleDialogClose}>Cancel</Button>
                    <Button type="submit" variant="contained">Submit</Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}