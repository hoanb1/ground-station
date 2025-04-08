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
import {SimpleVectorCircle, SimpleVectorCircleWhite} from '../common/icons.jsx';
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
import {getTileLayerById} from "../common/tile-layers.jsx"; // or correct path

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
                console.info("getCurrentLocation", latitude, longitude);
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
                                            console.error(error.message);
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
                            minZoom={3}
                            dragging={true}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <TileLayer
                                url={getTileLayerById("satellite")['url']}
                                attribution="Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL."
                            />
                            <MapClickHandler onClick={handleMapClick} />
                            <Marker position={[location.lat, location.lon]}>
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
                            <Marker position={location}>
                            <Circle
                                center={location}
                                radius={400000} // Radius in meters (e.g., 100 km in this case)
                                pathOptions={{
                                    color: 'white',
                                    fillOpacity: 0,
                                    weight: 1,
                                    opacity: 0.8,
                                }}
                            />
                                
                            </Marker>
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