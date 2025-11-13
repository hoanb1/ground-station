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

import {Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, IconButton} from "@mui/material";
import {betterDateTimes, betterStatusValue, renderCountryFlagsCSV} from "../common/common.jsx";
import Button from "@mui/material/Button";
import * as React from "react";
import {useEffect, useState} from "react";
import Grid from "@mui/material/Grid2";
import {useDispatch, useSelector} from "react-redux";
import {
    setClickedSatellite,
    fetchSatellite,
    deleteSatellite
} from "./satellite-slice.jsx";
import {useSocket} from "../common/socket.jsx";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import SatelliteMapContainer from "./satellite-map.jsx";
import SatelliteTransmittersTable from "./satellite-transmitters-table.jsx";
import { useParams, useNavigate } from 'react-router';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { toast } from '../../utils/toast-with-timestamp.jsx';
import { useTranslation } from 'react-i18next';


// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});


const SatelliteInfoPage = () => {
    const { t } = useTranslation('satellites');
    const { noradId } = useParams();
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const dispatch = useDispatch();
    const {socket} = useSocket();
    const [imageError, setImageError] = useState(false);
    const [satellitePosition, setSatellitePosition] = useState([0, 0]); // Default position
    const [deleteSatelliteConfirmOpen, setDeleteSatelliteConfirmOpen] = useState(false);

    // Get satellite list, clickedSatellite and loading state from Redux store
    const { satellites, clickedSatellite, loading, error } = useSelector(state => state.satellites);

    // Get timezone preference
    const timezone = useSelector((state) => {
        const tzPref = state.preferences?.preferences?.find(p => p.name === 'timezone');
        return tzPref?.value || 'UTC';
    });

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
                        toast.error(`Failed to load satellite data: ${error}`, {
                            autoClose: 5000,
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
                        {t('satellite_info.loading')}
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
                        {t('satellite_info.not_found')}
                    </Typography>
                </Box>
                <Typography variant="body1" sx={{ mt: 2 }}>
                    {t('satellite_info.not_found_message', { noradId })}
                </Typography>
                <Button
                    variant="contained"
                    onClick={() => navigate('/satellites/satellites')}
                    sx={{ mt: 2 }}
                >
                    {t('satellite_info.go_to_list')}
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
                        {t('satellite_info.loading')}
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
                        style={{textDecoration: 'underline'}}
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
                backgroundColor: 'background.default',
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
                            {clickedSatellite.name} - {t('satellite_info.title')}
                        </Typography>
                    </Box>
                </Box>

                <Box>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={() => setDeleteSatelliteConfirmOpen(true)}
                    >
                        {t('satellite_info.delete_satellite')}
                    </Button>
                    <Dialog open={deleteSatelliteConfirmOpen} onClose={() => setDeleteSatelliteConfirmOpen(false)}>
                        <DialogTitle>{t('satellite_info.delete_confirm_title')}</DialogTitle>
                        <DialogContent>
                            {t('satellite_info.delete_confirm_message')}
                            {clickedSatellite.transmitters && clickedSatellite.transmitters.length > 0 && (
                                <Typography sx={{ mt: 2, color: 'warning.main' }}>
                                    {t('satellite_info.delete_confirm_transmitters', {
                                        count: clickedSatellite.transmitters.length,
                                        plural: clickedSatellite.transmitters.length !== 1 ? 'ες' : 'η'
                                    })}
                                </Typography>
                            )}
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setDeleteSatelliteConfirmOpen(false)}>{t('satellite_info.transmitters.cancel')}</Button>
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
                                        toast.success(t('satellite_info.delete_success'));
                                    } catch (error) {
                                        console.error('Failed to delete satellite:', error);
                                        toast.error(t('satellite_info.delete_failed', { error }));
                                    }
                                    setDeleteSatelliteConfirmOpen(false);
                                }}
                            >
                                {t('satellite_info.transmitters.delete')}
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
                                backgroundColor: 'background.paper',
                                borderRadius: '8px',
                                padding: 3,
                                minHeight: '300px',
                                color: 'text.primary',
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
                                        borderBottom: '1px solid',
                                        borderColor: 'border.main',
                                    }}
                                >
                                    <strong>{t('satellite_info.fields.name')}</strong> <span>{clickedSatellite['name']}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid',
                                        borderColor: 'border.main',
                                    }}
                                >
                                    <strong>{t('satellite_info.fields.norad_id')}</strong> <span>{clickedSatellite['norad_id']}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid',
                                        borderColor: 'border.main',
                                    }}
                                >
                                    <strong>{t('satellite_info.fields.status')}</strong>
                                    <span>{betterStatusValue(clickedSatellite['status'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid',
                                        borderColor: 'border.main',
                                    }}
                                >
                                    <strong>{t('satellite_info.fields.countries')}</strong>
                                    <span>{renderCountryFlagsCSV(clickedSatellite['countries'])}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid',
                                        borderColor: 'border.main',
                                    }}
                                >
                                    <strong>{t('satellite_info.fields.operator')}</strong> <span>{clickedSatellite['operator'] || '-'}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid',
                                        borderColor: 'border.main',
                                    }}
                                >
                                    <strong>{t('satellite_info.fields.launched')}</strong>
                                    <span>{betterDateTimes(clickedSatellite['launched'], timezone)}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid',
                                        borderColor: 'border.main',
                                    }}
                                >
                                    <strong>{t('satellite_info.fields.deployed')}</strong>
                                    <span>{betterDateTimes(clickedSatellite['deployed'], timezone)}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid',
                                        borderColor: 'border.main',
                                    }}
                                >
                                    <strong>{t('satellite_info.fields.decayed')}</strong>
                                    <span>{betterDateTimes(clickedSatellite['decayed'], timezone)}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid',
                                        borderColor: 'border.main',
                                    }}
                                >
                                    <strong>{t('satellite_info.fields.updated')}</strong>
                                    <span>{betterDateTimes(clickedSatellite['updated'], timezone)}</span>
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        width: '100%',
                                        padding: '8px 0',
                                        borderBottom: '1px solid',
                                        borderColor: 'border.main',
                                    }}
                                >
                                    <strong>{t('satellite_info.fields.website')}</strong>
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
                                        borderBottom: '1px solid',
                                        borderColor: 'border.main',
                                    }}
                                >
                                    <strong>{t('satellite_info.fields.citation')}</strong>
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
                                backgroundColor: 'background.paper',
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
                                            borderRadius: '4px',
                                        }}
                                    />
                                ) : (
                                    <Box
                                        sx={{
                                            width: '200px',
                                            height: '150px',
                                            border: '1px solid',
                                            borderColor: 'border.main',
                                            borderRadius: '4px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            backgroundColor: 'background.elevated',
                                            color: 'text.disabled',
                                            gap: 1
                                        }}
                                    >
                                        <Typography variant="caption" sx={{ color: 'text.disabled', textAlign: 'center' }}>
                                            {t('satellite_info.no_image')}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Grid>
                        <Grid
                            size={{ xs: 12, lg: 4 }}
                            sx={{
                                backgroundColor: 'background.paper',
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

                    {/* Transmitters section */}
                    <SatelliteTransmittersTable
                        rows={rows}
                        setRows={setRows}
                        clickedSatellite={clickedSatellite}
                    />
                </Box>
            ) : (
                <span>{t('satellite_info.transmitters.no_data')}</span>
            )}
        </Box>
    );
};

export default SatelliteInfoPage;