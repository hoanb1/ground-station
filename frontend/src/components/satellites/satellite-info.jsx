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

import {Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, TextField, InputLabel, Tooltip, Stack, IconButton} from "@mui/material";
import {betterDateTimes, betterStatusValue, renderCountryFlagsCSV} from "../common/common.jsx";
import Button from "@mui/material/Button";
import * as React from "react";
import {useEffect, useState} from "react";
import Grid from "@mui/material/Grid2";
import {
    DataGrid,
    gridClasses,
} from "@mui/x-data-grid";
import {useDispatch, useSelector} from "react-redux";
import {
    deleteTransmitter,
    setClickedSatellite,
    setClickedSatelliteTransmitters,
    fetchSatellites,
    fetchSatellite,
    deleteSatellite
} from "./satellite-slice.jsx";
import {useSocket} from "../common/socket.jsx";
import TransmitterModal, {DeleteConfirmDialog} from "./transmitter-modal.jsx";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import SatelliteMapContainer from "./satellite-map.jsx";
import { useParams, useNavigate } from 'react-router';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { enqueueSnackbar } from 'notistack';


// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Frequency formatting function
const formatFrequency = (frequency) => {
    if (!frequency || frequency === "-" || isNaN(parseFloat(frequency))) {
        return "-";
    }

    const freq = parseFloat(frequency);

    if (freq >= 1000000000) {
        // GHz range
        const ghz = (freq / 1000000000).toFixed(3);
        return (
            <Tooltip title={`${freq.toLocaleString()} Hz`} arrow>
                <span>{ghz} GHz</span>
            </Tooltip>
        );
    } else if (freq >= 1000000) {
        // MHz range
        const mhz = (freq / 1000000).toFixed(3);
        return (
            <Tooltip title={`${freq.toLocaleString()} Hz`} arrow>
                <span>{mhz} MHz</span>
            </Tooltip>
        );
    } else if (freq >= 1000) {
        // kHz range
        const khz = (freq / 1000).toFixed(3);
        return (
            <Tooltip title={`${freq.toLocaleString()} Hz`} arrow>
                <span>{khz} kHz</span>
            </Tooltip>
        );
    } else {
        // Hz range
        return (
            <Tooltip title={`${freq.toLocaleString()} Hz`} arrow>
                <span>{freq} Hz</span>
            </Tooltip>
        );
    }
};

const paginationModel = {page: 0, pageSize: 10};

const SatelliteInfo = () => {
    const { noradId } = useParams();
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [editingTransmitter, setEditingTransmitter] = useState(null);
    const [deletingTransmitter, setDeletingTransmitter] = useState(null);
    const [isNewTransmitter, setIsNewTransmitter] = useState(false);
    const [selected, setSelected] = useState([]);
    const dispatch = useDispatch();
    const {socket} = useSocket();
    const [imageError, setImageError] = useState(false);
    const [satellitePosition, setSatellitePosition] = useState([0, 0]); // Default position
    const [deleteSatelliteConfirmOpen, setDeleteSatelliteConfirmOpen] = useState(false);

    // Get satellite list, clickedSatellite and loading state from Redux store
    const { satellites, clickedSatellite, loading, error } = useSelector(state => state.satellites);

    useEffect(() => {
        const noradIdInt = parseInt(noradId);

        // If we don't have the satellite data in Redux or it doesn't match the URL parameter
        if (!clickedSatellite || clickedSatellite.norad_id !== noradIdInt) {
            // First check if the satellite exists in the satellites list
            const satellite = satellites.find(sat => sat.norad_id === noradIdInt);
            if (satellite) {
                dispatch(setClickedSatellite(satellite));
            } else {
                // Try to fetch the specific satellite by NORAD ID
                dispatch(fetchSatellite({socket, noradId: noradIdInt}))
                    .unwrap()
                    .then((satelliteData) => {
                        // Successfully fetched the satellite
                        //console.info('Successfully fetched satellite:', satelliteData);
                    })
                    .catch((error) => {
                        console.error(`Failed to fetch satellite with NORAD ID ${noradId}:`, error);
                        enqueueSnackbar(`Failed to load satellite data: ${error}`, {
                            variant: 'error',
                            autoHideDuration: 5000,
                        });

                        // Optionally redirect back to satellites list or show error page
                        // navigate('/satellites/satellites');
                    });
            }
        }
    }, [noradId, satellites, dispatch, socket, navigate]);

    useEffect(() => {
        if (clickedSatellite && clickedSatellite.transmitters) {
            // Map the transmitters data to rows with unique IDs
            const mappedRows = clickedSatellite.transmitters.map((transmitter, index) => ({
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

            // Set satellite position if available (you might need to get this from satellite tracking data)
            // For now, using a default position - you can replace this with actual satellite coordinates
            if (clickedSatellite.latitude && clickedSatellite.longitude) {
                setSatellitePosition([clickedSatellite.latitude, clickedSatellite.longitude]);
            } else {
                // Default to showing a world view
                setSatellitePosition([0, 0]);
            }
        } else {
            setRows([]);
        }
    }, [clickedSatellite]);

    const handleBackClick = () => {
        navigate(-1); // Go back to previous page
    };

    const handleAddClick = () => {
        setEditingTransmitter(null);
        setIsNewTransmitter(true);
        setEditModalOpen(true);
    };

    const handleEditClick = () => {
        const singleRowId = selected[0];
        const transmitter = rows.find(row => row.id === singleRowId);
        setEditingTransmitter(transmitter);
        setIsNewTransmitter(false);
        setEditModalOpen(true);
    };

    const handleDeleteClick = () => {
        setDeleteConfirmOpen(true);
    };

    const handleDeleteConfirm = async () => {
        try {
            // Delete all selected transmitters
            for (const selectedId of selected) {
                const transmitter = rows.find(row => row.id === selectedId);
                if (transmitter && transmitter._original?.id) {
                    await dispatch(deleteTransmitter({
                        socket,
                        transmitterId: transmitter._original.id,
                        satelliteId: clickedSatellite.norad_id,
                    })).unwrap();
                }
            }

            // Refresh the transmitters list
            const updatedTransmitters = rows.filter(row => !selected.includes(row.id));
            setRows(updatedTransmitters);
            setSelected([]);

            console.log('Transmitters deleted successfully');
        } catch (error) {
            console.error('Failed to delete transmitters:', error);
        }

        // Close the dialog regardless of success/failure
        setDeleteConfirmOpen(false);
    };

    const handleModalClose = () => {
        setEditModalOpen(false);
        setEditingTransmitter(null);
        setIsNewTransmitter(false);
    };

    const columns = [
        {field: "description", headerName: "Description", flex: 1.5, minWidth: 200},
        {field: "type", headerName: "Type", flex: 1, minWidth: 100},
        {field: "status", headerName: "Status", flex: 1, minWidth: 100},
        {field: "alive", headerName: "Alive", flex: 1, minWidth: 100},
        {
            field: "uplinkLow",
            headerName: "Uplink low",
            flex: 1.2,
            minWidth: 150,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "uplinkHigh",
            headerName: "Uplink high",
            flex: 1.2,
            minWidth: 150,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "uplinkDrift",
            headerName: "Uplink drift",
            flex: 1.2,
            minWidth: 150,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "downlinkLow",
            headerName: "Downlink low",
            flex: 1.2,
            minWidth: 150,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "downlinkHigh",
            headerName: "Downlink high",
            flex: 1.2,
            minWidth: 150,
            renderCell: (params) => formatFrequency(params.value)
        },
        {
            field: "downlinkDrift",
            headerName: "Downlink drift",
            flex: 1.2,
            minWidth: 150,
            renderCell: (params) => formatFrequency(params.value)
        },
        {field: "mode", headerName: "Mode", flex: 1, minWidth: 120},
        {field: "uplinkMode", headerName: "Uplink mode", flex: 1, minWidth: 130},
        {field: "invert", headerName: "Invert", flex: 0.8, minWidth: 80},
        {field: "baud", headerName: "Baud", flex: 1, minWidth: 100},
    ];

    function handleImageError() {
        setImageError(true);
    }

    // Show loading state while fetching satellite data
    if (loading && clickedSatellite.id === null) {
        return (
            <Box sx={{ p: 3 }}>
                <Box sx={{ mb: 2 }}>
                    <IconButton onClick={handleBackClick} sx={{ mr: 2 }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography variant="h6" display="inline">
                        Loading satellite information...
                    </Typography>
                </Box>
            </Box>
        );
    }

    // Show error state if the satellite couldn't be found
    if (error && clickedSatellite.id === null) {
        return (
            <Box sx={{ p: 3 }}>
                <Box sx={{ mb: 2 }}>
                    <IconButton onClick={handleBackClick} sx={{ mr: 2 }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography variant="h6" display="inline">
                        Satellite not found
                    </Typography>
                </Box>
                <Typography variant="body1" sx={{ mt: 2 }}>
                    Could not find satellite with NORAD ID: {noradId}
                </Typography>
                <Button
                    variant="contained"
                    onClick={() => navigate('/satellites/satellites')}
                    sx={{ mt: 2 }}
                >
                    Go to Satellites List
                </Button>
            </Box>
        );
    }

    // Don't render anything if we don't have satellite data yet
    if (clickedSatellite.id === null) {
        return (
            <Box sx={{ p: 3 }}>
                <Box sx={{ mb: 2 }}>
                    <IconButton onClick={handleBackClick} sx={{ mr: 2 }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography variant="h6" display="inline">
                        Loading satellite information...
                    </Typography>
                </Box>
            </Box>
        );
    }

    const renderTextWithClickableLinks = (text) => {
        if (!text || text === '-') return '-';

        // Regular expression to match URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);

        return parts.map((part, index) => {
            if (urlRegex.test(part)) {
                return (
                    <a
                        key={index}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{color: '#fff', textDecoration: 'underline'}}
                    >
                        {part}
                    </a>
                );
            }
            return part;
        });
    };

    return (
        <Box
            className={"top-level-box"}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                p: 3,
                backgroundColor: '#262626',
            }}>
            <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2}}>
                <Box>
                    <IconButton onClick={handleBackClick} sx={{mr: 2}}>
                        <ArrowBackIcon/>
                    </IconButton>
                    <Box sx={{
                        display: 'inline-flex',
                    }}>
                        <Typography variant="h6" display="inline">
                            {clickedSatellite.name} - Satellite Information
                        </Typography>
                    </Box>
                </Box>

                <Box>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={() => setDeleteSatelliteConfirmOpen(true)}
                    >
                        Delete Satellite
                    </Button>
                    <Dialog open={deleteSatelliteConfirmOpen} onClose={() => setDeleteSatelliteConfirmOpen(false)}>
                        <DialogTitle>Delete Satellite</DialogTitle>
                        <DialogContent>
                            Are you sure you want to delete this satellite? This action cannot be undone.
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setDeleteSatelliteConfirmOpen(false)}>Cancel</Button>
                            <Button
                                variant="contained"
                                color="error"
                                onClick={async () => {
                                    try {
                                        await dispatch(deleteSatellite({
                                            socket,
                                            noradId: clickedSatellite.norad_id
                                        })).unwrap();
                                        navigate('/satellites/satellites');
                                        enqueueSnackbar('Satellite deleted successfully', {
                                            variant: 'success'
                                        });
                                    } catch (error) {
                                        console.error('Failed to delete satellite:', error);
                                        enqueueSnackbar(`Failed to delete satellite: ${error}`, {
                                            variant: 'error'
                                        });
                                    }
                                    setDeleteSatelliteConfirmOpen(false);
                                }}
                            >
                                Delete
                            </Button>
                        </DialogActions>
                    </Dialog>
                </Box>
            </Box>

            {clickedSatellite.id !== null ? (
                <Box sx={{}}>
                    <Grid
                        container
                        spacing={3}
                        sx={{
                            width: '100%',
                            flexShrink: 0,
                            mb: 2
                        }}
                    >
                        <Grid
                            size={{xs: 12, lg: 4}}
                            sx={{
                                backgroundColor: '#1e1e1e',
                                borderRadius: '8px',
                                padding: 3,
                                minHeight: '300px',
                                color: '#ffffff',
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
                                    <strong>Name:</strong> <span>{clickedSatellite['name']}</span>
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
                                    <strong>NORAD ID:</strong> <span>{clickedSatellite['norad_id']}</span>
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
                                    <span>{betterStatusValue(clickedSatellite['status'])}</span>
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
                                    <span>{renderCountryFlagsCSV(clickedSatellite['countries'])}</span>
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
                                    <strong>Operator:</strong> <span>{clickedSatellite['operator'] || '-'}</span>
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
                                    <span>{betterDateTimes(clickedSatellite['launched'])}</span>
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
                                    <span>{betterDateTimes(clickedSatellite['deployed'])}</span>
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
                                    <span>{betterDateTimes(clickedSatellite['decayed'])}</span>
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
                                    <strong>Updated:</strong>
                                    <span>{betterDateTimes(clickedSatellite['updated'])}</span>
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
                                    <strong>Website:</strong>
                                    <span>
                                        {renderTextWithClickableLinks(clickedSatellite['website'])}
                                    </span>
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
                                    <strong>Citation:</strong>
                                    <span>
                                        {renderTextWithClickableLinks(clickedSatellite['citation'])}
                                    </span>
                                </Box>
                            </Box>
                        </Grid>
                        <Grid
                            size={{ xs: 12, lg: 4 }}
                            sx={{
                                textAlign: 'center',
                                minHeight: '300px',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                backgroundColor: '#1e1e1e',
                                borderRadius: '8px',
                                boxSizing: 'border-box'
                            }}
                        >
                            <Box sx={{textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1}}>
                                {!imageError ? (
                                    <img
                                        src={`/satimages/${clickedSatellite['norad_id']}.png`}
                                        alt={`Satellite ${clickedSatellite['norad_id']}`}
                                        onError={handleImageError}
                                        style={{
                                            maxWidth: '100%',
                                            height: 'auto',
                                            border: '1px solid #444444',
                                            borderRadius: '4px',
                                        }}
                                    />
                                ) : (
                                    <Box
                                        sx={{
                                            width: '200px',
                                            height: '150px',
                                            border: '1px solid #444444',
                                            borderRadius: '4px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            backgroundColor: '#2a2a2a',
                                            color: '#888888',
                                            gap: 1
                                        }}
                                    >
                                        <Typography variant="caption" sx={{ color: '#888888', textAlign: 'center' }}>
                                            No image available
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Grid>
                        <Grid
                            size={{ xs: 12, lg: 4 }}
                            sx={{
                                backgroundColor: '#1e1e1e',
                                borderRadius: '8px',
                                minHeight: '300px',
                                boxSizing: 'border-box',
                                overflow: 'hidden'
                            }}
                        >
                            <Box sx={{ height: '100%', position: 'relative' }}>
                                <Box sx={{ height: 'calc(100%)', minHeight: '240px' }}>
                                    <SatelliteMapContainer satelliteData={clickedSatellite}/>
                                </Box>
                            </Box>
                        </Grid>
                    </Grid>

                    {/* Transmitters section with fixed height */}
                    <Box sx={{flexShrink: 0}}>
                        <Typography variant="h6" component="h3" sx={{mb: 2}}>
                            Transmitters
                        </Typography>
                        {clickedSatellite['transmitters'] ? (
                            <Box sx={{width: '100%'}}>
                                <DataGrid
                                    rows={rows}
                                    columns={columns}
                                    initialState={{pagination: {paginationModel}}}
                                    pageSizeOptions={[5, 10]}
                                    checkboxSelection={true}
                                    onRowSelectionModelChange={(newSelected) => {
                                        setSelected(newSelected);
                                    }}
                                    sx={{
                                        border: 'none',
                                        backgroundColor: '#1e1e1e',
                                        color: '#ffffff',
                                        height: '100%',
                                        [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                                            outline: 'none',
                                        },
                                        [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]:
                                            {
                                                outline: 'none',
                                            },
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
                                        '& .MuiDataGrid-footerContainer': {
                                            backgroundColor: '#121212',
                                            color: '#ffffff',
                                        },
                                        '& .MuiDataGrid-selectedRowCount': {
                                            color: '#ffffff',
                                        },
                                        '& .MuiDataGrid-cellContent': {
                                            color: '#ffffff',
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
                                            onClick={handleDeleteClick}>
                                        Delete
                                    </Button>
                                    <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                                        <DialogTitle>Confirm Deletion</DialogTitle>
                                        <DialogContent>Are you sure you want to delete the selected transmitter(s)?</DialogContent>
                                        <DialogActions>
                                            <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                                            <Button
                                                variant="contained"
                                                color="error"
                                                onClick={handleDeleteConfirm}
                                            >
                                                Delete
                                            </Button>
                                        </DialogActions>
                                    </Dialog>
                                </Stack>
                            </Box>
                        ) : (
                            <div style={{textAlign: 'center'}}>
                                <span>No Transmitters Available</span>
                            </div>
                        )}
                    </Box>

                    {/* Edit/Add Transmitter Modal */}
                    <TransmitterModal
                        open={editModalOpen}
                        onClose={handleModalClose}
                        transmitter={editingTransmitter}
                        satelliteId={clickedSatellite.norad_id}
                        isNew={isNewTransmitter}
                    />
                </Box>
            ) : (
                <span>No Satellite Data Available</span>
            )}
        </Box>
    );
};

export default SatelliteInfo;