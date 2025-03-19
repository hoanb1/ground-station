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
import Paper from "@mui/material/Paper";
import Tabs, { tabsClasses } from '@mui/material/Tabs';
import {gridLayoutStoreName as overviewGridLayoutName} from './overview-sat-track.jsx';
import {gridLayoutStoreName as targetGridLayoutName} from './target-sat-track.jsx';
import {MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline, Circle} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Grid from "@mui/material/Grid2";
import {HOME_LON, HOME_LAT} from "./common.jsx";
import {SimpleVectorCircle} from "./icons.jsx";
import AntennaRotatorTable from "./rotator-table.jsx";
import Stack from "@mui/material/Stack";
import RigTable from "./rig-table.jsx";
import {styled} from "@mui/material/styles";
import TLESourcesTable from "./tle-sources-table.jsx";
import SatelliteTable from "./satellite-table.jsx";
import AboutPage from "./about.jsx";
import SatelliteGroupsTable from "./satellite-groups.jsx";
import UsersTable from "./users.jsx";


export function SettingsTabSatellites() {
    return (<SettingsTabs initialMainTab={"satellites"} initialTab={"satellites"}/>);
}

export function SettingsTabTLESources() {
    return (<SettingsTabs initialMainTab={"satellites"} initialTab={"tlesources"}/>);
}

export function SettingsTabSatelliteGroups() {
    return (<SettingsTabs initialMainTab={"satellites"} initialTab={"groups"}/>);
}

export function SettingsTabPreferences() {
    return (<SettingsTabs initialMainTab={"settings"} initialTab={"preferences"}/>);
}

export function SettingsTabLocation() {
    return (<SettingsTabs initialMainTab={"settings"} initialTab={"location"}/>);
}

export function SettingsTabRig() {
    return (<SettingsTabs initialMainTab={"hardware"} initialTab={"rigcontrol"}/>);
}

export function SettingsTabRotator() {
    return (<SettingsTabs initialMainTab={"hardware"} initialTab={"rotatorcontrol"}/>);
}

export function SettingsTabMaintenance () {
    return (<SettingsTabs initialMainTab={"settings"} initialTab={"maintenance"}/>);
}

export function SettingsTabUsers () {
    return (<SettingsTabs initialMainTab={"settings"} initialTab={"users"}/>);
}

export function SettingsTabAbout () {
    return (<SettingsTabs initialMainTab={"settings"} initialTab={"about"}/>);
}

const tabsTree = {
    "hardware": ["rigcontrol", "rotatorcontrol"],
    "satellites": ["satellites", "tlesources", "groups"],
    "settings": ["preferences", "location", "maintenance", "users", "about"],
};

function getTabCategory(value) {
    for (const [key, values] of Object.entries(tabsTree)) {
        if (values.includes(value)) {
            return key;
        }
    }
    return null;
}

export const SettingsTabs = React.memo(function ({initialMainTab, initialTab}) {
    const [activeMainTab, setActiveMainTab] = useState(initialMainTab);
    const [activeTab, setActiveTab] = useState(initialTab);

    const handleMainTabChange = (event, newValue) => {
        setActiveMainTab(newValue);
        setActiveTab(tabsTree[newValue][0]);
    };

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
        const mainTab = getTabCategory(newValue);
        setActiveMainTab(mainTab);
    };

    // Forms for each tab can be extracted into separate components if desired:
    const LocationForm = () => (
        <LocationPage/>
    );

    const AntTabs = styled(Tabs)({
        borderBottom: '1px #4c4c4c solid',
        '& .MuiTabs-indicator': {
            backgroundColor: '#262626',
        },
    });

    const AntTab = styled((props) => <Tab disableRipple {...props} />)(({ theme }) => ({
        '&.MuiTab-root': {
            fontSize: theme.typography.pxToRem(16),
        },
        '&.Mui-selected': {
            color: '#fff',
            fontWeight: theme.typography.fontWeightMedium,
            backgroundColor: '#262626',
            marginTop: '0px',
            //borderTop: '1px #071318 solid',
        },
        '&.Mui-focusVisible': {
            backgroundColor: '#d1eaff',
        },
    }));

    let tabsList = [];
    // Define arrays of tabs for each main category
    switch (activeMainTab) {
        case "hardware":
            tabsList = [
                <AntTab key="rigcontrol" value="rigcontrol" label="Rig control" to="/hardware/rig" component={Link} />,
                <AntTab key="rotatorcontrol" value="rotatorcontrol" label="Rotator control" to="/hardware/rotator" component={Link} />,
            ];
            break;
        case "satellites":
            tabsList = [
                <AntTab key="satellites" value="satellites" label="Satellites" to="/satellites/satellites" component={Link} />,
                <AntTab key="tlesources" value="tlesources" label="TLE sources" to="/satellites/tlesources" component={Link} />,
                <AntTab key="groups" value="groups" label="Groups" to="/satellites/groups" component={Link} />,
            ];
            break;
        case "settings":
            tabsList = [
                <AntTab key="preferences" value="preferences" label="Preferences" to="/settings/preferences" component={Link} />,
                <AntTab key="location" value="location" label="Location" to="/settings/location" component={Link} />,
                <AntTab key="maintenance" value="maintenance" label="Maintenance" to="/settings/maintenance" component={Link} />,
                <AntTab key="users" value="users" label="Users" to="/settings/users" component={Link} />,
                <AntTab key="about" value="about" label="About" to="/settings/about" component={Link} />,
            ];
            break;
        default:
            console.log("Unknown main tab: " + activeMainTab);
    }

    const tabObject = <AntTabs
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
        {tabsList}
    </AntTabs>;

    let activeTabContent = null;

    switch (activeTab) {
        case "preferences":
            activeTabContent = <PreferencesForm/>;
            break;
        case "location":
            activeTabContent = <LocationForm/>;
            break;
        case "rigcontrol":
            activeTabContent = <RigControlForm/>;
            break;
        case "rotatorcontrol":
            activeTabContent = <RotatorControlForm/>;
            break;
        case "tlesources":
            activeTabContent = <TLESourcesForm/>;
            break;
        case "satellites":
            activeTabContent = <SatellitesForm/>;
            break;
        case "groups":
            activeTabContent = <SatelliteGroupsForm/>;
            break;
        case "maintenance":
            activeTabContent = <MaintenanceForm/>;
            break;
        case "users":
            activeTabContent = <UsersForm/>;
            break;
        case "about":
            activeTabContent = <AboutPage/>;
            break;
        default:
            break;
    }

    return (
         <Box sx={{ flexGrow: 1, bgcolor: 'background.paper' }}>
             <AntTabs
                 sx={{
                     [`& .${tabsClasses.scrollButtons}`]: {
                         '&.Mui-disabled': { opacity: 0.3 },
                     },
                     bottomBorder: '1px #4c4c4c solid',
                 }}
                 value={activeMainTab}
                 onChange={handleMainTabChange}
                 aria-label="main settings tabs"
                 scrollButtons={true}
                 variant="fullWidth"
                 allowScrollButtonsMobile
             >
                 <AntTab value={"hardware"} label="Hardware" to="/hardware/rig" component={Link}/>
                 <AntTab value={"satellites"} label="Satellites" to="/satellites/satellites" component={Link}/>
                 <AntTab value={"settings"} label="Settings" to="/settings/preferences" component={Link}/>
             </AntTabs>
             {tabObject}
             {activeTabContent}
         </Box>
    );
});

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
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0 }}>
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
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>Rig control setup</AlertTitle>
                Configure and manage your rig control setup here
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <RigTable/>
            </Box>
        </Paper>
    );
};

const SatellitesForm = () => {

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0}} variant={"elevation"}>
            <SatelliteTable/>
        </Paper>);
};

const UsersForm = () => {

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0}} variant={"elevation"}>
            <Alert severity="info">
                <AlertTitle>Users</AlertTitle>
                Manage add and remove users here
            </Alert>
            <UsersTable/>
        </Paper>);
};

const SatelliteGroupsForm = () => {

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0}} variant={"elevation"}>
            <SatelliteGroupsTable/>
        </Paper>);
};

const TLESourcesForm = () => {

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0}} variant={"elevation"}>
            <TLESourcesTable/>
        </Paper>);
};

const MaintenanceForm = () => {
    const clearLayoutLocalStorage = () => {
        localStorage.setItem(overviewGridLayoutName, null);
        localStorage.setItem(targetGridLayoutName, null);
    }

    const clearSatelliteDataLocalStorage = () => {
        localStorage.setItem('target-satellite-noradid', null);
        localStorage.setItem('overview-selected-satellites', null);
    }

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0  }}>
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
                        <Button variant="contained" color="warning" onClick={clearSatelliteDataLocalStorage}>
                            clear satellite data
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
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0 }}>
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
                            dragging={true}
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
