
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


import React, { useEffect } from 'react';
import {
    Box,
    Button,
    Typography,
    Alert,
    AlertTitle,
    Paper
} from '@mui/material';
import {MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMapEvents} from 'react-leaflet';
import Grid from '@mui/material/Grid2';
import { enqueueSnackbar } from 'notistack';
import { useSocket } from '../common/socket.jsx';
import { getMaidenhead } from '../common/common.jsx';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchLocationForUserId,
    setLocation,
    setPolylines,
    setQth,
    setLocationLoading,
    storeLocation
} from './location-slice.jsx';
import {getTileLayerById} from "../common/tile-layers.jsx";
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const createCustomIcon = () => {
    // SVG marker with enhanced shadow as data URI
    const svgIcon = `
        <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="dropshadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                    <feOffset dx="3" dy="5" result="offset"/>
                    <feFlood flood-color="#000000" flood-opacity="0.6"/>
                    <feComposite in2="offset" operator="in"/>
                    <feMerge> 
                        <feMergeNode/>
                        <feMergeNode in="SourceGraphic"/> 
                    </feMerge>
                </filter>
            </defs>
            <path d="M12.5 0C5.597 0 0 5.597 0 12.5c0 12.5 12.5 28.5 12.5 28.5s12.5-16 12.5-28.5C25 5.597 19.403 0 12.5 0z" 
                  fill="#3388ff" 
                  filter="url(#dropshadow)"/>
            <circle cx="12.5" cy="12.5" r="5" fill="white"/>
        </svg>
    `;

    return L.icon({
        iconUrl: `data:image/svg+xml;base64,${btoa(svgIcon)}`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: null,
        shadowSize: null,
        shadowAnchor: null
    });
};

// Try multiple fallback approaches for marker icons
const setupMarkerIcons = () => {
    try {
        // First attempt: Use CDN with fallback
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });
    } catch (error) {
        console.warn('Failed to set up default marker icons:', error);
    }
};

// Initialize marker icons
setupMarkerIcons();

// Custom icon instance with shadow - you can choose between the two approaches
const customIcon = createCustomIcon(); // Integrated shadow

let MapObject = null;

function MapClickHandler({ onClick }) {
    // Listen for map clicks
    useMapEvents({
        click: onClick,
    });
    return null;
}

const LocationPage = () => {
    const { socket } = useSocket();
    const dispatch = useDispatch();

    // Grab data from Redux
    const {
        locationLoading,
        location,
        locationId,
        locationUserId,
        qth,
        polylines,
    } = useSelector((state) => state.location);

    // // On mount, fetch the location
    // useEffect(() => {
    //     dispatch(fetchLocationForUserId({ socket }));
    // }, [dispatch, socket]);

    // Recompute polylines when location changes. Alternatively, you can handle this in the slice.
    useEffect(() => {
        const horizontalLine = [
            [location.lat, -270],
            [location.lat, 270],
        ];
        const verticalLine = [
            [-90, location.lon],
            [90, location.lon],
        ];
        dispatch(setPolylines([horizontalLine, verticalLine]));
        dispatch(setQth(getMaidenhead(location.lat, location.lon)));
    }, [location, dispatch]);

    const handleMapClick = (e) => {
        const { lat, lng } = e.latlng;
        dispatch(setLocation({ lat, lon: lng }));
        dispatch(setQth(getMaidenhead(lat, lng)));
        reCenterMap(lat, lng);
    };

    useEffect(() => {
        const intervalUpdate = setInterval(() => {
            MapObject.invalidateSize();
            reCenterMap(location.lat, location.lon);
        }, 1000);
        return () => {
            clearInterval(intervalUpdate);
        };
    }, [location]);

    const handleWhenReady = (map) => {
        // set global variable
        MapObject = map.target;
    };

    const reCenterMap = (lat, lon) => {
        if (MapObject) {
            MapObject.setView([lat, lon], MapObject.getZoom());
        }
    };

    const getCurrentLocation = async () => {
        dispatch(setLocationLoading(true));
        if (!navigator.geolocation) {
            enqueueSnackbar('Geolocation is not supported by your browser.', {
                variant: 'warning',
            });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                enqueueSnackbar('Your location has been retrieved successfully', {
                    variant: 'success',
                });
                const { latitude, longitude } = position.coords;
                dispatch(setLocation({ lat: latitude, lon: longitude }));
                dispatch(setQth(getMaidenhead(latitude, longitude)));
                reCenterMap(latitude, longitude);
                dispatch(setLocationLoading(false));
            },
            (error) => {
                enqueueSnackbar('Failed to get your current location', {
                    variant: 'error',
                });
                dispatch(setLocationLoading(false));
            }
        );
    };

    const handleSetLocation = () => {
        dispatch(storeLocation({socket, location, locationId}));
    }

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>Select location on map</AlertTitle>
                Use the map below to set the ground station location
            </Alert>
            <Grid container spacing={1} columns={{ xs: 1, sm: 1, md: 1, lg: 1 }}>
                <Grid>
                    <Box mt={3}>
                        <Grid container rowSpacing={3} columnSpacing={3} columns={{ xs: 2, sm: 2, md: 2, lg: 2 }}>
                            <Grid size={{ xs: 1, md: 1 }}>
                                <Typography variant="subtitle1">
                                    <strong>Latitude:</strong>
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontFamily: 'monospace' }}>
                                    {location.lat?.toFixed(4)}
                                </Typography>

                            </Grid>
                            <Grid size={{ xs: 1, md: 1 }}>
                                <Typography variant="subtitle1">
                                    <strong>Longitude:</strong>
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontFamily: 'monospace' }}>
                                    {location.lon?.toFixed(4)}
                                </Typography>
                            </Grid>
                            <Grid size={{ xs: 1, md: 1 }}>
                                <Typography variant="subtitle1">
                                    <strong>QTH Locator:</strong>
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontFamily: 'monospace' }}>
                                    {qth}
                                </Typography>
                            </Grid>
                            <Grid size={{ xs: 1, md: 1 }}>
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    loading={locationLoading}
                                    onClick={async () => {
                                        try {
                                            await getCurrentLocation();
                                        } catch (error) {
                                            enqueueSnackbar('Failed to get current location', {
                                                variant: 'error',
                                            });
                                        }
                                    }}
                                >
                                    Query location
                                </Button>
                            </Grid>
                        </Grid>
                    </Box>
                </Grid>
                <Grid size={{ xs: 1, md: 8 }}>
                    <Box
                        sx={{
                            width: { xs: '100%', sm: '100%', md: '100%', lg: '100%' },
                            height: '500px',
                            border: '1px solid #424242',
                        }}
                    >
                        <MapContainer
                            center={[location.lat, location.lon]}
                            zoom={2}
                            maxZoom={10}
                            whenReady={handleWhenReady}
                            minZoom={1}
                            dragging={true}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <TileLayer
                                url={getTileLayerById("satellite")['url']}
                                attribution="Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL."
                            />
                            <MapClickHandler onClick={handleMapClick} />
                            <Marker position={location} icon={customIcon}>
                                <Popup>Your Selected Location</Popup>
                            </Marker>
                            {polylines.map((polyline, index) => (
                                <Polyline
                                    key={index}
                                    positions={polyline}
                                    color="white"
                                    opacity={0.8}
                                    lineCap="round"
                                    lineJoin="round"
                                    dashArray="2, 2"
                                    dashOffset="10"
                                    interactive={false}
                                    smoothFactor={1}
                                    noClip={false}
                                    className="leaflet-interactive"
                                    weight={1}
                                />
                            ))}
                            <Circle
                                center={location}
                                radius={400000}
                                pathOptions={{
                                    color: 'white',
                                    fillOpacity: 0,
                                    weight: 1,
                                    opacity: 0.8,
                                    dashArray: "2, 2",
                                }}
                            />
                        </MapContainer>
                    </Box>
                </Grid>
                <Grid size={{ xs: 6, md: 8 }}>
                    <Button variant="contained" color="primary" onClick={() => handleSetLocation()}>
                        Save location
                    </Button>
                </Grid>
            </Grid>
        </Paper>
    );
};

export default LocationPage;