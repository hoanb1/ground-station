import React, {useEffect, useState} from 'react';
import {
    Box,
    Button,
    Typography,
    Alert, AlertTitle
} from '@mui/material';
import Paper from "@mui/material/Paper";
import {MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline, Circle, useMap} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Grid from "@mui/material/Grid2";
import {SimpleVectorCircle} from "../common/icons.jsx";
import {enqueueSnackbar} from "notistack";
import {useSocket} from "../common/socket.jsx";

let MapObject = null;

function getMaidenhead(lat, lon) {
    let adjLon = lon + 180;
    let adjLat = lat + 90;
    // Field (first two letters)
    const A = Math.floor(adjLon / 20);
    const B = Math.floor(adjLat / 10);
    const field = String.fromCharCode(65 + A) + String.fromCharCode(65 + B);
    // Square (two digits)
    adjLon = adjLon - A * 20;
    adjLat = adjLat - B * 10;
    const C = Math.floor(adjLon / 2);
    const D = Math.floor(adjLat);
    const square = C.toString() + D.toString();
    // Subsquare (final two letters)
    adjLon = adjLon - C * 2;
    adjLat = adjLat - D;
    const E = Math.floor(adjLon * 12);
    const F = Math.floor(adjLat * 24);
    const subsquare = String.fromCharCode(97 + E) + String.fromCharCode(97 + F);
    return field + square + subsquare;
}

// A helper component that listens for click events on the map.
function MapClickHandler({ onClick }) {
    useMapEvents({
        click: onClick,
    });
    return null;
}

function CloseRoundedIcon() {
    return null;
}

const LocationPage = () => {
    const {socket} = useSocket();
    const [locationLoading, setLocationLoading] = useState(false);
    const [location, setLocation] = useState({ lat: 0, lon: 0 });
    const [locationId, setLocationId] = useState(null);
    const [locationUserId, setLocationUserId] = useState(null);
    const [qth, setQth] = useState(getMaidenhead(parseFloat(0), parseFloat(0)));
    const [polylines, setPolylines] = useState([]);

    useEffect(() => {
        const horizontalLine = [
            [location.lat, -270], // Line spans horizontally across the map at fixed latitude
            [location.lat, 270]
        ];
        const verticalLine = [
            [-90, location.lon], // Line spans vertically across the map at fixed longitude
            [90, location.lon]
        ];
        setPolylines([horizontalLine, verticalLine]);
        setQth(getMaidenhead(location.lat, location.lon));

        return () => {
            // Optional cleanup logic
        };
    }, [location]);

    useEffect(() => {
        console.info("Getting location from backend");
        socket.emit('data_request', 'get-location-for-user-id', null, (response) => {
            console.info("Received location from backend", response);
            if (response['success']) {
                if (response['data']) {
                    setLocation({
                        lat: parseFloat(response['data']['lat']),
                        lon: parseFloat(response['data']['lon']),
                    });
                    setLocationId(response['data']['id']);
                    setLocationUserId(response['data']['userid']);
                    reCenterMap(response['data']['lat'], response['data']['lon']);
                    setQth(getMaidenhead(response['data']['lat'], response['data']['lon']));

                } else {
                    enqueueSnackbar('No location found in the backend, please set one', {
                        variant: 'info',
                    })
                }
            } else {
                enqueueSnackbar('Failed to get location from backend', {
                    variant: 'error',
                })
            }
        });
        return () => {

        };
    }, []);

    // Update location when the map is clicked.
    const handleMapClick = (e) => {
        const { lat, lng } = e.latlng;
        setLocation({ lat: lat, lon: lng });
        setQth(getMaidenhead(lat, lng));
        reCenterMap(lat, lng);
    };

    const handleWhenReady = (map) => {
        // map is ready
        MapObject = map.target;
        setInterval(()=>{
            map.target.invalidateSize();
        }, 1000);
    };

    const reCenterMap = (lat, lon) => {
        MapObject.setView([lat, lon], MapObject.getZoom());
    };

    const getCurrentLocation = async () => {
        if (!navigator.geolocation) {
            throw new Error('Geolocation is not supported by your browser.');
        }
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    enqueueSnackbar("Your location has been retrieved successfully", {
                        variant: 'success',
                        autoHideDuration: 5000,
                    });
                    setLocationLoading(false);
                    resolve({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude,
                    });
                },
                (error) => {
                    reject(new Error('Unable to retrieve your location: ' + error.message));
                    enqueueSnackbar("Unable to retrieve your location", {
                        variant: 'error',
                        autoHideDuration: 5000,
                    });
                    setLocationLoading(false);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0,
                }
            );
        });
    };

    const handleSetLocation = () => {
        socket.emit('data_submission', 'submit-location-for-user-id',
            {...location, name: "home", userid: null, id: locationId}, (response) => {
            console.info("Received location from backend", response);
            if (response['success']) {
            } else {
                enqueueSnackbar('Failed to set location', {
                    variant: 'error',
                })
            }
        });
    };

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
                                    {location.lat.toFixed(4)}
                                </Typography>

                            </Grid>
                            <Grid size={{ xs: 1, md: 1 }}>
                                <Typography variant="subtitle1">
                                    <strong>Longitude:</strong>
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontFamily: 'monospace' }}>
                                    {location.lon.toFixed(4)}
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
                                            setLocationLoading(true);
                                            const currentLocation = await getCurrentLocation();
                                            setLocation(currentLocation);
                                        } catch (error) {
                                            console.error(error.message);
                                            setLocationLoading(false);
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
                            maxZoom={12}
                            whenReady={handleWhenReady}
                            minZoom={2}
                            dragging={true}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <TileLayer
                                attribution='© Stadia Maps, © OpenMapTiles, © OpenStreetMap contributors'
                                url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                            />
                            <MapClickHandler onClick={handleMapClick} />
                            <Marker position={[location.lat, location.lon]}>
                                <Popup>Your Selected Location</Popup>
                            </Marker>
                            {polylines.map((polyline, index) => (
                                <Polyline
                                    key={index}
                                    positions={polyline}
                                    color="grey"
                                    opacity={0.7}
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
                            <Marker
                                position={location}
                                icon={SimpleVectorCircle}
                            >
                            </Marker>
                        </MapContainer>
                    </Box>
                </Grid>
                <Grid size={{ xs: 6, md: 8 }}>
                    <Button variant="contained" color="primary" onClick={() => handleSetLocation()}>
                        Set location
                    </Button>
                </Grid>
            </Grid>
        </Paper>
    );
};

export default LocationPage;