import React, {useState} from 'react';
import {
    Box,
    Tabs,
    Tab,
    TextField,
    Button,
    Typography, Grid,
} from '@mui/material';
import Stack from "@mui/material/Stack";

function ConfigurationTabs() {
    const [activeTab, setActiveTab] = useState(0);

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
                <Tab label="Home"/>
                <Tab label="Preferences"/>
                <Tab label="Rotor control"/>
                <Tab label="TLEs"/>
            </Tabs>
            <Grid spacing={2}>
                {renderActiveTabForm()}
            </Grid>
        </Box>
    );
}

export default ConfigurationTabs;
