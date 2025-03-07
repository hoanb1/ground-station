import React, {useState} from 'react';
import {
    Box,
    Tabs,
    Tab,
    TextField,
    Button,
    Typography, Grid2,
} from '@mui/material';
import {
    Link,
} from 'react-router';
import {PageContainer} from "@toolpad/core";


export function SettingsTabHome() {
    return (<SettingsTabs initialTab={0}/>);
}

export function SettingsTabPreferences() {
    return (<SettingsTabs initialTab={1}/>);
}

export function SettingsTabRotor() {
    return (<SettingsTabs initialTab={2}/>);
}

export function SettingsTabTLEs() {
    return (<SettingsTabs initialTab={3}/>);
}

function SettingsTabs({initialTab}) {
    const [activeTab, setActiveTab] = useState(initialTab);

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    // Forms for each tab can be extracted into separate components if desired:
    const HomeForm = () => (
        <Box component="form" sx={{mt: 2}}>
            <Typography variant="h6" gutterBottom>
                Home Settings
            </Typography>
            <TextField
                label="Home Title"
                variant="outlined"
                sx={{mb: 2, display: 'block'}}
                fullWidth
            />
            <TextField
                label="Description"
                variant="outlined"
                sx={{mb: 2, display: 'block'}}
                multiline
                rows={4}
                fullWidth
            />
            <Button variant="contained">Save Home Settings</Button>
        </Box>
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

    // Helper function to render the correct form for the active tab.
    const renderActiveTabForm = () => {
        switch (activeTab) {
            case 0:
                return <HomeForm/>;
            case 1:
                return <PreferencesForm/>;
            case 2:
                return <RotorControlForm/>;
            case 3:
                return <TLEsForm/>;
            default:
                return null;
        }
    };

    return (
        <Box sx={{bgcolor: 'background.paper'}}>
            <Tabs
                value={activeTab}
                onChange={handleTabChange}
                aria-label="configuration tabs"
                scrollButtons="auto"
            >
                <Tab label="Home" to="/settings/home" component={Link}/>
                <Tab label="Preferences" to="/settings/preferences" component={Link}/>
                <Tab label="Rotor control" to="/settings/rotor" component={Link}/>
                <Tab label="TLEs" to="/settings/tles" component={Link}/>
            </Tabs>
            <PageContainer >
                {renderActiveTabForm()}
            </PageContainer>
        </Box>
    );
}

export default SettingsTabs;
