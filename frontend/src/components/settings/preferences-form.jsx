// PreferencesForm.jsx
import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchPreferences, updatePreferences, setPreference } from './preferences-slice.jsx';
import { tz } from 'moment-timezone';
import Paper from '@mui/material/Paper';
import {
    Alert,
    AlertTitle,
    Box,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Select
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";

const PreferencesForm = () => {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const { preferences, status } = useSelector((state) => state.preferences);

    const getPreferenceValue = (preferences, name) => {
        const preference = preferences.find((pref) => pref.name === name);
        return preference ? preference.value : null;
    };

    // // Fetch preferences when the component mounts (if needed)
    // useEffect(() => {
    //     dispatch(fetchPreferences({socket}));
    // }, []);

    const timezoneOptions = tz.names().map((zone) => ({
        name: zone.replace('_', ' '),
        value: zone,
    }));

    const languageOptions = [
        { name: 'English', value: 'en_US' },
        { name: 'Deutsch', value: 'de_DE' },
    ];

    const themesOptions = [
        { name: 'Dark', value: 'dark' },
        { name: 'Light', value: 'light' },
    ];

    const handleTimezoneChange = (e) => {
        dispatch(setPreference({'name': 'timezone', 'value': e.target.value}));
    };

    const handleLanguageChange = (e) => {
        dispatch(setPreference({'name': 'language', 'value': e.target.value}));
    };

    const handleThemeChange = (e) => {
        dispatch(setPreference({'name': 'theme', 'value': e.target.value}));
    };

    function handleSavePreferences() {
        dispatch(updatePreferences({socket}))
            .unwrap()
            .then(() => {
                enqueueSnackbar('Preferences saved successfully', { variant: 'success' });
            })
            .catch((err) => {
                enqueueSnackbar('Failed to save preferences', { variant: 'error' });
            });
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
                        <FormControl disabled={status==='loading'} variant="filled" sx={{m: 1, minWidth: 120}}>
                            <InputLabel id="demo-simple-select-filled-label">Timezone</InputLabel>
                            <Select
                                fullWidth={true}
                                labelId="demo-simple-select-filled-label"
                                id="demo-simple-select-filled"
                                value={getPreferenceValue(preferences, 'timezone')}
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
                        <FormControl disabled={status==='loading'} variant="filled" sx={{ m: 1, minWidth: 120 }}>
                            <InputLabel id="demo-simple-select-filled-label">Language</InputLabel>
                            <Select
                                fullWidth={true}
                                labelId="demo-simple-select-filled-label"
                                id="demo-simple-select-filled"
                                value={getPreferenceValue(preferences, 'language')}
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
                        <FormControl disabled={status==='loading'} variant="filled" sx={{ m: 1, minWidth: 120 }}>
                            <InputLabel id="demo-simple-select-filled-label">Theme</InputLabel>
                            <Select
                                fullWidth={true}
                                labelId=""
                                id=""
                                value={getPreferenceValue(preferences, 'theme')}
                                onChange={handleThemeChange}
                                variant={"filled"}>
                                {themesOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                </Grid>
                <Button disabled={status==='loading'} variant="contained" onClick={()=>{handleSavePreferences()}}>Save Preferences</Button>
            </Box>
        </Paper>);
};

export default PreferencesForm;