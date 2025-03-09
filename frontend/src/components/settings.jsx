import React, {useState} from 'react';
import {
    Box,
    Tabs,
    Tab,
    TextField,
    Button,
    Typography, Grid2, Container,
} from '@mui/material';
import {
    Link,
} from 'react-router';
import {PageContainer} from "@toolpad/core";
import Paper from "@mui/material/Paper";

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

    const MaintenanceForm = () => {
        return (
            <Box component="form" sx={{mt: 2}}>
                <Box display="flex" flexDirection="column" gap={2}>
                    <Box>
                        <Typography variant="body2">
                            Explanation for Button 1: This button triggers the primary action.
                        </Typography>
                        <Button variant="contained" color="primary">
                            Button 1
                        </Button>
                    </Box>
                    <Box>
                        <Typography variant="body2">
                            Explanation for Button 2: This button is used for secondary tasks.
                        </Typography>
                        <Button variant="outlined" color="secondary">
                            Button 2
                        </Button>
                    </Box>
                    <Box>
                        <Typography variant="body2">
                            Explanation for Button 3: This button provides additional information.
                        </Typography>
                        <Button variant="text" color="inherit">
                            Button 3
                        </Button>
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
        <PageContainer maxWidth={false}>
        <Box sx={{bgcolor: 'background.paper'}}>
            <Tabs
                value={activeTab}
                onChange={handleTabChange}
                aria-label="configuration tabs"
                scrollButtons="auto"
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

export default SettingsTabs;
