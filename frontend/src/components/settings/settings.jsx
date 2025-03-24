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
import {gridLayoutStoreName as overviewGridLayoutName} from '../overview-sat-track.jsx';
import {gridLayoutStoreName as targetGridLayoutName} from '../target-sat-track.jsx';
import {MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline, Circle} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import Grid from "@mui/material/Grid2";
import {SimpleVectorCircle} from "../common/icons.jsx";
import AntennaRotatorTable from "../hardware/rotator-table.jsx";
import Stack from "@mui/material/Stack";
import RigTable from "../hardware/rig-table.jsx";
import {styled} from "@mui/material/styles";
import TLESourcesTable from "../satellites/tle-sources-table.jsx";
import SatelliteTable from "../satellites/satellite-table.jsx";
import AboutPage from "./about.jsx";
import SatelliteGroupsTable from "../satellites/satellite-groups.jsx";
import UsersTable from "./users.jsx";
import {enqueueSnackbar} from "notistack";
import LocationPage from "./location.jsx";
import PreferencesForm from "./preferences.jsx";


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
                <AntTab key="tlesources" value="tlesources" label="TLE sources" to="/satellites/tlesources" component={Link} />,
                <AntTab key="satellites" value="satellites" label="Satellites" to="/satellites/satellites" component={Link} />,
                <AntTab key="groups" value="groups" label="Groups" to="/satellites/groups" component={Link} />,
            ];
            break;
        case "settings":
            tabsList = [
                <AntTab key="preferences" value="preferences" label="Preferences" to="/settings/preferences" component={Link} />,
                <AntTab key="location" value="location" label="Location" to="/settings/location" component={Link} />,
                <AntTab key="users" value="users" label="Users" to="/settings/users" component={Link} />,
                <AntTab key="maintenance" value="maintenance" label="Maintenance" to="/settings/maintenance" component={Link} />,
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


const RotatorControlForm = () => {

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>Antenna rotator control setup</AlertTitle>
                Configure and manage your antenna rotator control setup here
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <AntennaRotatorTable/>
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
