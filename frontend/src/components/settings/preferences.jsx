import {tz} from "moment-timezone";
import React, {useState} from "react";
import Paper from "@mui/material/Paper";
import {Alert, AlertTitle, Box, Button, FormControl, InputLabel, MenuItem, Select} from "@mui/material";
import Grid from "@mui/material/Grid2";

const PreferencesForm = () => {
    const [language, setLanguage] = useState('en');
    const [themes, setThemes] = useState('dark');
    const [timezone, setTimezone] = useState('Europe/Athens');

    const timezoneOptions = tz.names().map((zone) => {
        return {name: zone.replace("_", " "), value: zone};
    });

    const handleLanguageChange = function (e) {
        setLanguage(e.target.value);
    }

    const handleThemeChange = function (e) {
        setThemes(e.target.value);
    }

    const languageOptions = [{name: 'English', value: 'en'}, {name: 'Deutsch', value: 'de'}];
    const themesOptions = [{name: 'Dark', value: 'dark'}, {name: 'Light', value: 'light'}];

    function handleTimezoneChange() {

    }

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>Change your preferences</AlertTitle>
                Use the form below to change your preferences
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <Grid container spacing={2} columns={16}>
                    <Grid size={8}>
                        Timezone
                    </Grid>
                    <Grid size={8}>
                        <FormControl variant="filled" sx={{m: 1, minWidth: 120}}>
                            <InputLabel id="demo-simple-select-filled-label">Timezone</InputLabel>
                            <Select
                                fullWidth={true}
                                labelId="demo-simple-select-filled-label"
                                id="demo-simple-select-filled"
                                value={timezone}
                                onChange={handleTimezoneChange}
                                variant={"filled"}>
                                {timezoneOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
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

export default PreferencesForm;