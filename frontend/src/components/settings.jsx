import React, {useState} from 'react';
import { Box, Tab, TextField, Button, Typography, Grid2, Container} from '@mui/material';
import { Link } from 'react-router';
import {PageContainer} from "@toolpad/core";
import Paper from "@mui/material/Paper";
import Tabs, { tabsClasses } from '@mui/material/Tabs';
import {gridLayoutStoreName as overviewGridLayoutName} from './overview-sat-track.jsx';
import {gridLayoutStoreName as targetGridLayoutName} from './target-sat-track.jsx';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Autocomplete from "@mui/material/Autocomplete";
import Grid from "@mui/material/Grid2";
import cities from 'cities.json';


export function SettingsTabPreferences() {
    return (<SettingsTabs initialTab={0}/>);
}

export function SettingsTabHome() {
    return (<SettingsTabs initialTab={1}/>);
}

export function SettingsTabRotor() {
    return (<SettingsTabs initialTab={2}/>);
}

export function SettingsTabTLEs() {
    return (<SettingsTabs initialTab={3}/>);
}

export function SettingsTabMaintenance() {
    return (<SettingsTabs initialTab={4}/>);
}

function SettingsTabs({initialTab}) {
    const [activeTab, setActiveTab] = useState(initialTab);

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    // Forms for each tab can be extracted into separate components if desired:
    const HomeForm = () => (
        <HomeLocatorPage/>
    );

    const PreferencesForm = () => (
        <Box component="form" sx={{mt: 2}}>
            <Typography variant="h6" gutterBottom>
                User Preferences
            </Typography>
            <TextField
                label="Preferred Language"
                variant="outlined"
                sx={{mb: 2, display: 'block'}}
                fullWidth
            />
            <TextField
                label="Theme"
                variant="outlined"
                sx={{mb: 2, display: 'block'}}
                fullWidth
            />
            <Button variant="contained">Save Preferences</Button>
        </Box>
    );

    const RotorControlForm = () => (
        <Box component="form" sx={{mt: 2}}>
            <Typography variant="h6" gutterBottom>
                Rotor Control
            </Typography>
            <TextField
                label="Azimuth"
                variant="outlined"
                sx={{mb: 2, display: 'block'}}
                fullWidth
            />
            <TextField
                label="Elevation"
                variant="outlined"
                sx={{mb: 2, display: 'block'}}
                fullWidth
            />
            <Button variant="contained">Set Rotor Position</Button>
        </Box>
    );

    const TLEsForm = () => (
        <Box component="form" sx={{mt: 2}}>
            <Typography variant="h6" gutterBottom>
                TLE Configuration
            </Typography>
            <TextField
                label="Satellite Name"
                variant="outlined"
                sx={{mb: 2, display: 'block'}}
                fullWidth
            />
            <TextField
                label="Line 1"
                variant="outlined"
                sx={{mb: 2, display: 'block'}}
                fullWidth
            />
            <TextField
                label="Line 2"
                variant="outlined"
                sx={{mb: 2, display: 'block'}}
                fullWidth
            />
            <Button variant="contained">Save TLE Data</Button>
        </Box>
    );

    const MaintenanceForm = () => {

        const clearLayoutLocalStorage = () => {
            localStorage.setItem(overviewGridLayoutName, null);
            localStorage.setItem(targetGridLayoutName, null);
        }

        return (
            <Box component="form" sx={{mt: 2}}>
                <Box display="flex" flexDirection="column" gap={2}>
                    <Box>
                        <Typography variant="body2">
                            <Button variant="contained" color="warning" onClick={clearLayoutLocalStorage}>
                                clear layout
                            </Button>
                            Clear layout configuration from local storage
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="body2">
                            <Button variant="outlined" color="secondary">
                                Button 2
                            </Button>
                            Explanation for Button 2: This button is used for secondary tasks.
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="body2">
                            <Button variant="text" color="inherit">
                                Button 3
                            </Button>
                            Explanation for Button 3: This button provides additional information.
                        </Typography>

                    </Box>
                </Box>
            </Box>
        );
    };

    // Helper function to render the correct form for the active tab.
    const renderActiveTabForm = () => {
        switch (activeTab) {
            case 0:
                return <PreferencesForm/>;
            case 1:
                return <HomeForm/>;
            case 2:
                return <RotorControlForm/>;
            case 3:
                return <TLEsForm/>;
            case 4:
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
             >
                 <Tab label="Preferences" to="/settings/preferences" component={Link}/>
                 <Tab label="Home" to="/settings/home" component={Link}/>
                 <Tab label="Rotor control" to="/settings/rotor" component={Link}/>
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

const HomeLocatorPage = () => {
    // cityValue holds either a string (free text) or an object (selected from the JSON).
    const [cityValue, setCityValue] = useState('');
    const [location, setLocation] = useState({ lat: 51.505, lng: -0.09 });
    const [qth, setQth] = useState(getMaidenhead(51.505, -0.09));
    const [loading, setLoading] = useState(false);

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

    // Update location when the map is clicked.
    const handleMapClick = (e) => {
        const { lat, lng } = e.latlng;
        setLocation({ lat, lng });
        setQth(getMaidenhead(lat, lng));
    };

    function generateString(length) {
        const characters ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = ' ';
        const charactersLength = characters.length;
        for ( let i = 0; i < length; i++ ) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
    }

    return (
        <Paper elevation={3} sx={{ padding: 4, marginTop: 4 }}>
            <Grid container spacing={4}>
                {/* Left Side: Autocomplete City Input & Location Info */}
                <Grid>
                    <Typography variant="h6" gutterBottom>
                        Enter Your City
                    </Typography>
                    <Autocomplete
                        freeSolo
                        options={cities}
                        getOptionLabel={(option) =>
                            typeof option === 'string'
                                ? option
                                : `${option.name}, ${option.country}`
                        }
                        filterOptions={(options, state) =>
                            options.filter((option) =>
                                option.name.toLowerCase().includes(state.inputValue.toLowerCase())
                            )
                        }
                        onChange={(event, newValue) => {
                            setCityValue(newValue);
                        }}
                        onInputChange={(event, newInputValue) => {
                            setCityValue(newInputValue);
                        }}
                        renderInput={(params) => {
                            return <TextField {...params} key={""} label="City" variant="outlined" margin="normal" fullWidth />;
                        }}
                        renderOption={(props, option) => {
                            return (
                                <li {...props} key={generateString(12)}>
                                    {option.name}
                                </li>
                            );
                        }}
                    />
                    <Button variant="contained" color="primary" onClick={handleCitySearch} disabled={loading} sx={{ marginTop: 2 }}>
                        {loading ? 'Searching...' : 'Search City'}
                    </Button>
                    <Box mt={3}>
                        <Typography variant="subtitle1">
                            <strong>Latitude:</strong> {location.lat.toFixed(4)}
                        </Typography>
                        <Typography variant="subtitle1">
                            <strong>Longitude:</strong> {location.lng.toFixed(4)}
                        </Typography>
                        <Typography variant="subtitle1">
                            <strong>QTH Locator:</strong> {qth}
                        </Typography>
                    </Box>
                </Grid>
                <Grid>
                    <Typography variant="h6" gutterBottom>
                        Select Location on Map
                    </Typography>
                    <Box
                        sx={{
                            height: { xs: '200px', sm: '300px', md: '400px' },
                            width: '100%',
                        }}
                    >
                        <MapContainer center={[location.lat, location.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
                            <TileLayer
                                attribution='© Stadia Maps, © OpenMapTiles, © OpenStreetMap contributors'
                                url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                            />
                            <MapClickHandler onClick={handleMapClick} />
                            <Marker position={[location.lat, location.lng]}>
                                <Popup>Your Selected Location</Popup>
                            </Marker>
                        </MapContainer>
                    </Box>
                </Grid>
            </Grid>
        </Paper>
    );
};





export default SettingsTabs;
