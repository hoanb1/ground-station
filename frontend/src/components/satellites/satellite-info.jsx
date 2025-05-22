/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
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



import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import {Box} from "@mui/material";
import TableContainer from "@mui/material/TableContainer";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import {betterDateTimes, betterStatusValue, humanizeFrequency, renderCountryFlagsCSV} from "../common/common.jsx";
import TableHead from "@mui/material/TableHead";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import * as React from "react";
import {useEffect, useState, useCallback} from "react";
import Grid from "@mui/material/Grid2";
import { 
    DataGrid, 
    GridActionsCellItem, 
    GridRowModes, 
    GridToolbarContainer, 
    useGridApiContext
} from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Close";
import {useDispatch} from "react-redux";
import {v4 as uuidv4} from "uuid";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import {submitTransmitter} from "./satellite-slice.jsx";
import {useSocket} from "../common/socket.jsx";

function EditToolbar({onAddClick}) {
    return (
        <GridToolbarContainer>
            <Button
                color="primary"
                startIcon={<AddIcon />}
                onClick={onAddClick}
            >
                Add Transmitter
            </Button>
        </GridToolbarContainer>
    );
}

// Define the dropdown options
const STATUS_OPTIONS = [
    {name: "active", value: "active"},
    {name: "inactive", value: "inactive"},
    {name: "dead", value: "dead"}
];
const TYPE_OPTIONS = [
    {name: "Telemetry", value: "Telemetry"},
    {name: "Transmitter", value: "Transmitter"},
    {name: "Beacon", value: "Beacon"}
];
const ALIVE_OPTIONS = [
    {name: "true", value: true},
    {name: "false", value: false}
];
const INVERT_OPTIONS = [
    {name: "true", value: true},
    {name: "false", value: false},
];
const MODE_OPTIONS = [
    {name: "FM", value: "FM"},
    {name: "AM", value: "AM"},
    {name: "SSB", value: "SSB"},
    {name: "CW", value: "CW"},
    {name: "AFSK", value: "AFSK"},
    {name: "PSK", value: "PSK"},
    {name: "BPSK", value: "BPSK"},
    {name: "QPSK", value: "QPSK"},
    {name: "FSK", value: "FSK"},
    {name: "GMSK", value: "GMSK"}
];


// Custom editor for dropdown selects
function SelectEditInputCell(props) {
    const { id, value, field, options } = props;
    const apiRef = useGridApiContext();

    const handleChange = (event) => {
        apiRef.current.setEditCellValue({ id, field, value: event.target.value });
    };

    return (
        <FormControl fullWidth variant="standard" size="small">
            <Select
                value={value}
                onChange={handleChange}
                autoFocus
                sx={{
                    height: '70px',
                    backgroundColor: "transparent",
                    color: "#FFFFFF",
                    fontSize: "0.875rem",
                    '& .MuiSelect-select': {
                        paddingY: '4px',
                        paddingX: '8px'
                    },
                    '&:before': {
                        borderColor: 'rgba(255, 255, 255, 0.2)'
                    },
                    '&:hover:not(.Mui-disabled):before': {
                        borderColor: 'rgba(255, 255, 255, 0.4)'
                    }
                }}
                variant={'standard'}>
                {options.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}

// Create render components for each dropdown type
function renderStatusEditCell(params) {
    return <SelectEditInputCell {...params} options={STATUS_OPTIONS}/>;
}

function renderTypeEditCell(params) {
    return <SelectEditInputCell {...params} options={TYPE_OPTIONS} />;
}

function renderAliveEditCell(params) {
    return <SelectEditInputCell {...params} options={ALIVE_OPTIONS} />;
}

function renderInvertEditCell(params) {
    return <SelectEditInputCell {...params} options={INVERT_OPTIONS} />;
}

function renderModeEditCell(params) {
    return <SelectEditInputCell {...params} options={MODE_OPTIONS}/>;
}

const SatelliteInfoModal = ({open, handleClose, selectedSatellite}) => {
    const [rows, setRows] = useState([]);
    const [rowModesModel, setRowModesModel] = useState({});
    const dispatch = useDispatch();
    const {socket} = useSocket();

    useEffect(() => {
        if (selectedSatellite && selectedSatellite.transmitters) {
            // Map the transmitters data to rows with unique IDs
            const mappedRows = selectedSatellite.transmitters.map((transmitter, index) => ({
                id: transmitter.id || `existing-${index}`,
                description: transmitter.description || "-",
                type: transmitter.type || "-",
                status: transmitter.status || "-",
                alive: transmitter.alive || "-",
                uplinkLow: transmitter.uplink_low || "-",
                uplinkHigh: transmitter.uplink_high || "-",
                uplinkDrift: transmitter.uplink_drift || "-",
                downlinkLow: transmitter.downlink_low || "-",
                downlinkHigh: transmitter.downlink_high || "-",
                downlinkDrift: transmitter.downlink_drift || "-",
                mode: transmitter.mode || "-",
                uplinkMode: transmitter.uplink_mode || "-",
                invert: transmitter.invert || "-",
                baud: transmitter.baud || "-",
                // Keep the original data for reference
                _original: transmitter,
            }));
            setRows(mappedRows);
        }
    }, [selectedSatellite]);

    const handleRowEditStart = (params, event) => {
        event.defaultMuiPrevented = true;
    };

    const handleRowEditStop = (params, event) => {
        event.defaultMuiPrevented = true;
        console.info("params", params);
    };

    const handleEditClick = (id) => () => {
        setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.Edit } });
    };

    const handleSaveClick = (id) => () => {
        setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.View } });
    };

    const handleDeleteClick = (id) => () => {
        const updatedRows = rows.filter((row) => row.id !== id);
        setRows(updatedRows);
        saveTransmittersToBackend(updatedRows);
    };

    const handleCancelClick = (id) => () => {
        setRowModesModel({
            ...rowModesModel,
            [id]: { mode: GridRowModes.View, ignoreModifications: true },
        });

        const editedRow = rows.find((row) => row.id === id);
        if (editedRow.isNew) {
            setRows(rows.filter((row) => row.id !== id));
        }
    };

    const processRowUpdate = (newRow) => {
        const updatedRow = { ...newRow, isNew: false };
        const updatedRows = rows.map((row) => (row.id === newRow.id ? updatedRow : row));
        setRows(updatedRows);
        saveTransmittersToBackend(updatedRows);
        return updatedRow;
    };

    const handleRowModesModelChange = (newRowModesModel) => {
        setRowModesModel(newRowModesModel);
    };

    const handleAddClick = () => {
        //const id = `new-${uuidv4()}`;
        const id = `new`;
        setRows((oldRows) => [
            ...oldRows,
            {
                id,
                description: "",
                type: "",
                status: "",
                alive: "",
                uplinkLow: "",
                uplinkHigh: "",
                uplinkDrift: "",
                downlinkLow: "",
                downlinkHigh: "",
                downlinkDrift: "",
                mode: "",
                uplinkMode: "",
                invert: "",
                baud: "",
                isNew: true,
            },
        ]);
        setRowModesModel((oldModel) => ({
            ...oldModel,
            [id]: { mode: GridRowModes.Edit, fieldToFocus: "description" },
        }));
    };

    const saveTransmittersToBackend = useCallback((currentRows) => {
        if (!selectedSatellite || !selectedSatellite.norad_id) return;

        // Separate new and existing transmitters
        const newTransmitters = currentRows.filter(row => row.id === 'new');
        const existingTransmitters = currentRows.filter(row => row.id !== 'new');

        // Map rows back to transmitter format
        const transmitters = existingTransmitters.map(row => {
            // If we have the original data, use it as a base
            const base = row._original || {};

            return {
                ...base,
                description: row.description !== "-" ? row.description : null,
                type: row.type !== "-" ? row.type : null,
                status: row.status !== "-" ? row.status : null,
                alive: row.alive !== "-" ? row.alive : null,
                uplink_low: row.uplinkLow !== "-" ? row.uplinkLow : null,
                uplink_high: row.uplinkHigh !== "-" ? row.uplinkHigh : null,
                uplink_drift: row.uplinkDrift !== "-" ? row.uplinkDrift : null,
                downlink_low: row.downlinkLow !== "-" ? row.downlinkLow : null,
                downlink_high: row.downlinkHigh !== "-" ? row.downlinkHigh : null,
                downlink_drift: row.downlinkDrift !== "-" ? row.downlinkDrift : null,
                mode: row.mode !== "-" ? row.mode : null,
                uplink_mode: row.uplinkMode !== "-" ? row.uplinkMode : null,
                invert: row.invert !== "-" ? row.invert : null,
                baud: row.baud !== "-" ? row.baud : null,
            };
        });

        // Create new transmitter data
        const newTransmitterData = newTransmitters.map(row => ({
            norad_cat_id: selectedSatellite.norad_id,
            description: row.description !== "-" ? row.description : null,
            type: row.type !== "-" ? row.type : null,
            status: row.status !== "-" ? row.status : null,
            alive: row.alive !== "-" ? row.alive : null,
            uplink_low: row.uplinkLow !== "-" ? row.uplinkLow : null,
            uplink_high: row.uplinkHigh !== "-" ? row.uplinkHigh : null,
            uplink_drift: row.uplinkDrift !== "-" ? row.uplinkDrift : null,
            downlink_low: row.downlinkLow !== "-" ? row.downlinkLow : null,
            downlink_high: row.downlinkHigh !== "-" ? row.downlinkHigh : null,
            downlink_drift: row.downlinkDrift !== "-" ? row.downlinkDrift : null,
            mode: row.mode !== "-" ? row.mode : null,
            uplink_mode: row.uplinkMode !== "-" ? row.uplinkMode : null,
            invert: row.invert !== "-" ? row.invert : null,
            baud: row.baud !== "-" ? row.baud : null,
        }));

        if (newTransmitterData) {
            // Update backend here
            dispatch(submitTransmitter({socket: socket, transmitterData: newTransmitterData[0]}));
        }

        
    }, [selectedSatellite, dispatch]);

    function onProcessRowUpdateError (error) {
        console.error("Error updating row", error);
    }

    const columns = [
        {field: "description", headerName: "Description", flex: 1, editable: true},
        {
            field: "type", 
            headerName: "Type", 
            flex: 1, 
            editable: true,
            renderEditCell: renderTypeEditCell
        },
        {
            field: "status", 
            headerName: "Status", 
            flex: 1, 
            editable: true,
            renderEditCell: renderStatusEditCell
        },
        {
            field: "alive", 
            headerName: "Alive", 
            flex: 1, 
            editable: true,
            renderEditCell: renderAliveEditCell
        },
        {field: "uplinkLow", headerName: "Uplink low", flex: 1, editable: true},
        {field: "uplinkHigh", headerName: "Uplink high", flex: 1, editable: true},
        {field: "uplinkDrift", headerName: "Uplink drift", flex: 1, editable: true},
        {field: "downlinkLow", headerName: "Downlink low", flex: 1, editable: true},
        {field: "downlinkHigh", headerName: "Downlink high", flex: 1, editable: true},
        {field: "downlinkDrift", headerName: "Downlink drift", flex: 1, editable: true},
        {field: "mode", headerName: "Mode", flex: 1, editable: true, renderEditCell: renderModeEditCell},
        {field: "uplinkMode", headerName: "Uplink mode", flex: 1, editable: true, renderEditCell: renderModeEditCell},
        {
            field: "invert", 
            headerName: "Invert", 
            flex: 1, 
            editable: true,
            renderEditCell: renderInvertEditCell
        },
        {field: "baud", headerName: "Baud", flex: 1, editable: true},
        // Actions column remains the same
        {
            field: "actions",
            type: "actions",
            headerName: "Actions",
            width: 100,
            cellClassName: "actions",
            getActions: ({ id }) => {
                const isInEditMode = rowModesModel[id]?.mode === GridRowModes.Edit;

                if (isInEditMode) {
                    return [
                        <GridActionsCellItem
                            icon={<SaveIcon />}
                            label="Save"
                            onClick={handleSaveClick(id)}
                        />,
                        <GridActionsCellItem
                            icon={<CancelIcon />}
                            label="Cancel"
                            onClick={handleCancelClick(id)}
                        />,
                    ];
                }

                return [
                    <GridActionsCellItem
                        icon={<EditIcon />}
                        label="Edit"
                        onClick={handleEditClick(id)}
                    />,
                    <GridActionsCellItem
                        icon={<DeleteIcon />}
                        label="Delete"
                        onClick={handleDeleteClick(id)}
                    />,
                ];
            },
        },
    ];

    return (
        <Dialog open={open} onClose={handleClose} maxWidth={"xl"} fullWidth={true}>
            <DialogTitle>Satellite Information</DialogTitle>
            <DialogContent>
                {selectedSatellite ? (
                    <Box>
                        <Grid
                            container
                            spacing={3}
                            sx={{
                                width: '100%',
                                flexDirection: {xs: 'column', md: 'row'}
                            }}
                        >
                            <Grid
                                sx={{
                                    backgroundColor: '#1e1e1e',
                                    borderRadius: '8px',
                                    padding: 3,
                                    minHeight: '300px',
                                    color: '#ffffff',
                                    width: {xs: '100%', md: '60%'},
                                    mb: {xs: 3, md: 0},
                                    boxSizing: 'border-box'
                                }}
                            >
                                <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Name:</strong> <span>{selectedSatellite['name']}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>NORAD ID:</strong> <span>{selectedSatellite['norad_id']}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Status:</strong>
                                        <span>{betterStatusValue(selectedSatellite['status'])}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Countries:</strong>
                                        <span>{renderCountryFlagsCSV(selectedSatellite['countries'])}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Operator:</strong> <span>{selectedSatellite['operator'] || '-'}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Launched:</strong>
                                        <span>{betterDateTimes(selectedSatellite['launched'])}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Deployed:</strong>
                                        <span>{betterDateTimes(selectedSatellite['deployed'])}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Decayed:</strong>
                                        <span>{betterDateTimes(selectedSatellite['decayed'])}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                        }}
                                    >
                                        <strong>Updated:</strong>
                                        <span>{betterDateTimes(selectedSatellite['updated'])}</span>
                                    </Box>
                                </Box>
                            </Grid>
                            <Grid
                                sx={{
                                    textAlign: 'center',
                                    minHeight: '300px',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    backgroundColor: '#1e1e1e',
                                    borderRadius: '8px',
                                    width: {xs: '100%', md: '36%'},
                                    boxSizing: 'border-box'
                                }}
                            >
                                <Box sx={{textAlign: 'right'}}>
                                    <img
                                        src={`/satimages/${selectedSatellite['norad_id']}.png`}
                                        alt={`Satellite ${selectedSatellite['norad_id']}`}
                                        style={{
                                            maxWidth: '100%',
                                            height: 'auto',
                                            border: '1px solid #444444',
                                            borderRadius: '4px',
                                        }}
                                    />
                                </Box>
                            </Grid>
                        </Grid>
                        <Box mt={2}>
                            <h3>Transmitters</h3>
                            {selectedSatellite['transmitters'] ? (
                                <DataGrid
                                    rows={rows}
                                    columns={columns}
                                    editMode="row"
                                    rowModesModel={rowModesModel}
                                    onRowModesModelChange={handleRowModesModelChange}
                                    onRowEditStart={handleRowEditStart}
                                    onRowEditStop={handleRowEditStop}
                                    processRowUpdate={processRowUpdate}
                                    onProcessRowUpdateError={onProcessRowUpdateError}
                                    slots={{
                                        toolbar: EditToolbar,
                                    }}
                                    slotProps={{
                                        toolbar: { onAddClick: handleAddClick },
                                    }}
                                    sx={{
                                        border: 'none',
                                        backgroundColor: '#1e1e1e',
                                        color: '#ffffff',
                                        '& .MuiDataGrid-columnHeaders': {
                                            backgroundColor: '#333333',
                                            color: '#ffffff',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            borderBottom: '1px solid #444444',
                                        },
                                        '& .MuiDataGrid-cell': {
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            borderBottom: '1px solid #444444',
                                        },
                                        '& .MuiDataGrid-row': {
                                            '&:nth-of-type(odd)': {
                                                backgroundColor: '#292929',
                                            },
                                            '&:hover': {
                                                backgroundColor: '#3a3a3a',
                                            },
                                        },
                                        '& .MuiFormControl-fullWidth': {
                                            borderBottom: '1px solid #414141',
                                            borderRight: '1px solid #414141',
                                        },
                                        '& .MuiDataGrid-footerContainer': {
                                            backgroundColor: '#121212',
                                            color: '#ffffff',
                                        },
                                        '& .MuiDataGrid-cell:focus': {
                                            outline: 'none',
                                        },
                                        '& .MuiDataGrid-selectedRowCount': {
                                            color: '#ffffff',
                                        },
                                        '& .MuiDataGrid-cellContent': {
                                            color: '#ffffff',
                                        },
                                        '& .MuiDataGrid-editInputCell': {
                                            color: '#FFFFFF',
                                            backgroundColor: '#121212',
                                            borderBottom: '1px solid #414141',
                                            borderRight: '1px solid #414141',
                                        },
                                        '& .MuiInputBase-input': {
                                            backgroundColor: '#121212',
                                            color: '#ffffff',
                                        },
                                        '& .MuiInput-root': {
                                            backgroundColor: '#121212',
                                            borderColor: '#414141',
                                        },
                                        '& .MuiOutlinedInput-root': {
                                            backgroundColor: '#121212',
                                            '& fieldset': {
                                                borderColor: '#444444',
                                            },
                                            '&:hover fieldset': {
                                                borderColor: '#666666',
                                            },
                                            '&.Mui-focused fieldset': {
                                                borderColor: '#90caf9',
                                            },
                                        },
                                        '& .MuiFilledInput-root': {
                                            backgroundColor: '#2c2c2c',
                                            '&:hover': {
                                                backgroundColor: '#3c3c3c',
                                            },
                                            '&.Mui-focused': {
                                                backgroundColor: '#3c3c3c',
                                            },
                                        },

                                    }}
                                />
                            ) : (
                                <div style={{textAlign: 'center'}}>
                                    <span>No Transmitters Available</span>
                                </div>
                            )}
                        </Box>
                    </Box>
                ) : (
                    <span>No Satellite Data Available</span>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} color="primary">Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default SatelliteInfoModal;