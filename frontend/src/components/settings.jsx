import React, {useEffect, useState} from 'react';
import {
    Box,
    Tab,
    TextField,
    Button,
    Typography,
    Grid2,
    Container,
    Alert,
    FormControl,
    InputLabel,
    Select, FormHelperText, MenuItem, AlertTitle, Divider, ButtonGroup
} from '@mui/material';
import { Link } from 'react-router';
import {PageContainer} from "@toolpad/core";
import Paper from "@mui/material/Paper";
import Tabs, { tabsClasses } from '@mui/material/Tabs';
import {gridLayoutStoreName as overviewGridLayoutName} from './overview-sat-track.jsx';
import {gridLayoutStoreName as targetGridLayoutName} from './target-sat-track.jsx';
import {MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline, Circle} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Autocomplete from "@mui/material/Autocomplete";
import { DataGrid } from '@mui/x-data-grid';
import Grid from "@mui/material/Grid2";
import cities from 'cities.json';
import Item from "material/src/item.js";
import IconButton from "@mui/material/IconButton";
import InfoIcon from '@mui/icons-material/Info';
import {HOME_LON, HOME_LAT} from "./common.jsx";
import {SimpleVectorCircle} from "./icons.jsx";
import AntennaRotatorTable from "./rotator-table.jsx";
import Stack from "@mui/material/Stack";
import RigTable from "./rig-table.jsx";


export function SettingsTabPreferences() {
    return (<SettingsTabs initialTab={0}/>);
}

export function SettingsTabLocation() {
    return (<SettingsTabs initialTab={1}/>);
}

export function SettingsTabRig() {
    return (<SettingsTabs initialTab={2}/>);
}

export function SettingsTabRotator() {
    return (<SettingsTabs initialTab={3}/>);
}

export function SettingsTabTLEs() {
    return (<SettingsTabs initialTab={4}/>);
}

export function SettingsTabMaintenance () {
    return (<SettingsTabs initialTab={5}/>);
}

function SettingsTabs({initialTab}) {
    const [activeTab, setActiveTab] = useState(initialTab);

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    // Forms for each tab can be extracted into separate components if desired:
    const LocationForm = () => (
        <LocationPage/>
    );

    // Helper function to render the correct form for the active tab.
    const renderActiveTabForm = () => {
        switch (activeTab) {
            case 0:
                return <PreferencesForm/>;
            case 1:
                return <LocationForm/>;
            case 2:
                return <RigControlForm/>;
            case 3:
                return <RotatorControlForm/>;
            case 4:
                return <TLEsForm/>;
            case 5:
                return <MaintenanceForm/>;
            default:
                return null;
        }
    };

    return (
         <PageContainer maxWidth={true}>
         <Box sx={{ flexGrow: 1, bgcolor: 'background.paper' }}>
             <Tabs
                 sx={{
                     [`& .${tabsClasses.scrollButtons}`]: {
                         '&.Mui-disabled': { opacity: 0.3 },
                     },
                 }}
                 value={activeTab}
                 onChange={handleTabChange}
                 aria-label="configuration tabs"
                 scrollButtons={true}
                 variant="scrollable"
                 allowScrollButtonsMobile
             >
                 <Tab label="Preferences" to="/settings/preferences" component={Link}/>
                 <Tab label="Location" to="/settings/location" component={Link}/>
                 <Tab label="Rig control" to="/settings/rig" component={Link}/>
                 <Tab label="Rotator control" to="/settings/rotator" component={Link}/>
                 <Tab label="TLEs" to="/settings/tles" component={Link}/>
                 <Tab label="Maintenance" to="/settings/maintenance" component={Link}/>
             </Tabs>
                 {renderActiveTabForm()}
         </Box>
         </PageContainer>
    );
}

// Fix for missing marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Function to calculate the Maidenhead grid locator (QTH) from latitude and longitude.
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

const RotatorControlForm = () => {

    return (
        <Paper elevation={3} sx={{ padding: 3, marginTop: 1 }}>
            <Alert severity="info">
                <AlertTitle>Antenna rotator control setup</AlertTitle>
                Configure and manage your antenna rotator control setup here
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <AntennaRotatorTable/>
                <Stack direction="row" spacing={2}>
                    <Button variant="contained">
                        Add
                    </Button>
                    <Button variant="contained">
                        Edit
                    </Button>
                    <Button variant="contained" color="error">
                        Delete
                    </Button>
                </Stack>
            </Box>
        </Paper>
    );
};

const RigControlForm = () => {

    return (
        <Paper elevation={3} sx={{ padding: 3, marginTop: 1 }}>
            <Alert severity="info">
                <AlertTitle>Rig control setup</AlertTitle>
                Configure and manage your rig control setup here
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <RigTable/>
                <Stack direction="row" spacing={2}>
                    <Button variant="contained">
                        Add
                    </Button>
                    <Button variant="contained">
                        Edit
                    </Button>
                    <Button variant="contained" color="error">
                        Delete
                    </Button>
                </Stack>
            </Box>
        </Paper>
    );
};

const TLEsForm = () => {
    const columns = [
        { field: 'id', headerName: 'ID', width: 70 },
        { field: 'firstName', headerName: 'First name', width: 130 },
        { field: 'lastName', headerName: 'Last name', width: 130 },
        {
            field: 'age',
            headerName: 'Age',
            type: 'number',
            width: 90,
        },
        {
            field: 'fullName',
            headerName: 'Full name',
            description: 'This column has a value getter and is not sortable.',
            sortable: false,
            width: 160,
            valueGetter: (value, row) => `${row.firstName || ''} ${row.lastName || ''}`,
        },
    ];
    const rows = [
        { id: 1, lastName: 'Snow', firstName: 'Jon', age: 35 },
        { id: 2, lastName: 'Lannister', firstName: 'Cersei', age: 42 },
        { id: 3, lastName: 'Lannister', firstName: 'Jaime', age: 45 },
        { id: 4, lastName: 'Stark', firstName: 'Arya', age: 16 },
        { id: 5, lastName: 'Targaryen', firstName: 'Daenerys', age: null },
        { id: 6, lastName: 'Melisandre', firstName: null, age: 150 },
        { id: 7, lastName: 'Clifford', firstName: 'Ferrara', age: 44 },
        { id: 8, lastName: 'Frances', firstName: 'Rossini', age: 36 },
        { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
    ];

    const paginationModel = { page: 0, pageSize: 5 };

    return (
        <Paper elevation={3} sx={{ padding: 3, marginTop: 1 }}>
            <Alert severity="info">
                <AlertTitle>Satellites, groups and TLEs</AlertTitle>
                Manage satellites, groups and TLEs here
            </Alert>
            <Divider />
            <DataGrid
                rows={rows}
                columns={columns}
                initialState={{ pagination: { paginationModel } }}
                pageSizeOptions={[5, 10]}
                checkboxSelection
                sx={{ border: 0 }}
            />
        </Paper>);
};

const MaintenanceForm = () => {
    const clearLayoutLocalStorage = () => {
        localStorage.setItem(overviewGridLayoutName, null);
        localStorage.setItem(targetGridLayoutName, null);
    }

    return (
        <Paper elevation={3} sx={{ padding: 3, marginTop: 1 }}>
            <Alert severity="info">
                <AlertTitle>Maintenance</AlertTitle>
                Maintenance related functions
           </Alert>
            <Box component="form" sx={{mt: 2}}>
                <Grid container spacing={2} columns={16}>
                    <Grid size={8}>
                        Clear local browser layout data
                    </Grid>
                    <Grid size={8}>
                        <Button variant="contained" color="warning" onClick={clearLayoutLocalStorage}>
                            clear layout
                        </Button>
                    </Grid>
                    <Grid size={8}>
                        Clear local browser satellite data
                    </Grid>
                    <Grid size={8}>
                        <Button variant="outlined" color="secondary">
                            Button 2
                        </Button>
                    </Grid>
                </Grid>
            </Box>
        </Paper>
    );
};

const PreferencesForm = () => {
    const [language, setLanguage] = useState('en');
    const [themes, setThemes] = useState('dark');

    const handleLanguageChange = function (e) {
        setLanguage(e.target.value);
    }

    const handleThemeChange = function (e) {
        setThemes(e.target.value);
    }

    const languageOptions = [{name: 'English', value: 'en'}, {name: 'Deutsch', value: 'de'}];
    const themesOptions = [{name: 'Dark', value: 'dark'}, {name: 'Light', value: 'light'}];

    return (
        <Paper elevation={3} sx={{ padding: 3, marginTop: 1 }}>
            <Alert severity="info">
                <AlertTitle>Change your preferences</AlertTitle>
                Use the form below to change your preferences
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <Grid container spacing={2} columns={16}>
                    <Grid size={8}>
                        Language
                    </Grid>
                    <Grid size={8}>
                        <FormControl variant="filled" sx={{ m: 1, minWidth: 120 }}>
                            <InputLabel id="demo-simple-select-filled-label">Language</InputLabel>
                            <Select
                                fullWidth={true}
                                labelId="demo-simple-select-filled-label"
                                id="demo-simple-select-filled"
                                value={language}
                                onChange={handleLanguageChange}
                             variant={"filled"}>
                                {languageOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid size={8}>
                        Theme
                    </Grid>
                    <Grid size={8}>
                        <FormControl variant="filled" sx={{ m: 1, minWidth: 120 }}>
                            <InputLabel id="demo-simple-select-filled-label">Theme</InputLabel>
                            <Select
                                fullWidth={true}
                                labelId=""
                                id=""
                                value={themes}
                                onChange={handleThemeChange}
                                variant={"filled"}>
                                {themesOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                </Grid>
                <Button variant="contained">Save Preferences</Button>
            </Box>
        </Paper>);
};

const LocationPage = () => {
    // cityValue holds either a string (free text) or an object (selected from the JSON).
    const [cityValue, setCityValue] = useState('');
    const [location, setLocation] = useState({ lat: HOME_LAT, lng: HOME_LON });
    const [qth, setQth] = useState(getMaidenhead(51.505, -0.09));
    const [loading, setLoading] = useState(false);
    const [polylines, setPolylines] = useState([]);

    // Uses Nominatim API to geocode the entered city if it isn’t found in the JSON.
    const handleCitySearch = async () => {
        if (!cityValue) return;
        if (typeof cityValue === 'object' && cityValue.lat && cityValue.lng) {
            // Use the coordinates directly from the JSON entry.
            const newLocation = { lat: parseFloat(cityValue.lat), lng: parseFloat(cityValue.lng) };
            setLocation(newLocation);
            setQth(getMaidenhead(newLocation.lat, newLocation.lng));
        } else {
            // Fall back to geocoding the free text using Nominatim.
            setLoading(true);
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?city=${cityValue}&format=json&limit=1`
                );
                const data = await response.json();
                if (data && data.length > 0) {
                    const { lat, lon } = data[0];
                    const newLocation = { lat: parseFloat(lat), lng: parseFloat(lon) };
                    setLocation(newLocation);
                    setQth(getMaidenhead(newLocation.lat, newLocation.lng));
                }
            } catch (err) {
                console.error(err);
            }
            setLoading(false);
        }
    };

    useEffect(() => {
        const horizontalLine = [
            [location.lat, -270], // Line spans horizontally across the map at fixed latitude
            [location.lat, 270]
        ];
        const verticalLine = [
            [-90, location.lng], // Line spans vertically across the map at fixed longitude
            [90, location.lng]
        ];
        setPolylines([horizontalLine, verticalLine]);
        setQth(getMaidenhead(location.lat, location.lng));
        
        return () => {
            // Optional cleanup logic
        };
    }, [location]);

    // Update location when the map is clicked.
    const handleMapClick = (e) => {
        const { lat, lng } = e.latlng;
        setLocation({ lat, lng });
        setQth(getMaidenhead(lat, lng));
    };

    const getCurrentLocation = async () => {
        if (!navigator.geolocation) {
            throw new Error('Geolocation is not supported by your browser.');
        }
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    });
                },
                (error) => {
                    reject(new Error('Unable to retrieve your location: ' + error.message));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0,
                }
            );
        });
    };

    return (
        <Paper elevation={3} sx={{ padding: 3, marginTop: 1 }}>
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
                                    {location.lng.toFixed(4)}
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
                                    onClick={async () => {
                                        try {
                                            const currentLocation = await getCurrentLocation();
                                            setLocation(currentLocation);
                                        } catch (error) {
                                            console.error(error.message);
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
                            center={[HOME_LAT, HOME_LON]}
                            zoom={2}
                            maxZoom={12}
                            minZoom={2}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <TileLayer
                                attribution='© Stadia Maps, © OpenMapTiles, © OpenStreetMap contributors'
                                url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                            />
                            <MapClickHandler onClick={handleMapClick} />
                            <Marker position={[location.lat, location.lng]}>
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
                    <Button variant="contained" color="primary">
                        Set location
                    </Button>
                </Grid>
            </Grid>
        </Paper>
    );
};

export default SettingsTabs;
