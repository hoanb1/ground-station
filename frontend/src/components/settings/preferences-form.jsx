import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { updatePreferences, setPreference } from './preferences-slice.jsx';
import { tz } from 'moment-timezone';
import Paper from '@mui/material/Paper';
import {
    Box,
    Button,
    Divider,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    TextField,
    Typography
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { useSocket } from "../common/socket.jsx";
import { enqueueSnackbar } from "notistack";

const PreferencesForm = () => {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const { preferences, status } = useSelector((state) => state.preferences);
    const isLoading = status === 'loading';

    const getPreferenceValue = (name) => {
        const preference = preferences.find((pref) => pref.name === name);
        return preference ? preference.value : '';
    };

    const timezoneOptions = tz.names().map((zone) => ({
        name: zone.replace('_', ' '),
        value: zone,
    }));

    const languageOptions = [
        { name: 'English', value: 'en_US' },
        { name: 'Deutsch', value: 'de_DE' },
    ];

    const themesOptions = [
        { name: 'Light', value: 'light' },
        { name: 'Dark', value: 'dark' },
    ];

    const handleChange = (name) => (e) => {
        dispatch(setPreference({ name, value: e.target.value }));
    };

    const handleSavePreferences = () => {
        dispatch(updatePreferences({ socket }))
            .unwrap()
            .then(() => {
                enqueueSnackbar('Preferences saved successfully', { variant: 'success' });
            })
            .catch(() => {
                enqueueSnackbar('Failed to save preferences', { variant: 'error' });
            });
    };

    return (
        <Paper elevation={2} sx={{ padding: 3, marginTop: 0, borderRadius: 1 }}>
            <Typography variant="h5" component="h1" sx={{ mb: 2, fontWeight: 500 }}>
                Preferences
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Customize your application settings
            </Typography>

            <Box component="form" sx={{ mt: 2 }}>
                <Grid container spacing={3} columns={16}>
                    {/* General Preferences */}
                    <Grid size={16}>
                        <Typography variant="subtitle1" fontWeight={500} sx={{ mb: 1 }}>
                            General
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                    </Grid>

                    {/* Timezone */}
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography>Timezone</Typography>
                    </Grid>
                    <Grid size={8}>
                        <FormControl
                            disabled={isLoading}
                            variant="outlined"
                            size="small"
                            fullWidth
                        >
                            <InputLabel>Timezone</InputLabel>
                            <Select
                                value={getPreferenceValue('timezone')}
                                onChange={handleChange('timezone')}
                                label="Timezone"
                            >
                                {timezoneOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    {/* Language */}
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography>Language</Typography>
                    </Grid>
                    <Grid size={8}>
                        <FormControl
                            disabled={isLoading}
                            variant="outlined"
                            size="small"
                            fullWidth
                        >
                            <InputLabel>Language</InputLabel>
                            <Select
                                value={getPreferenceValue('language')}
                                onChange={handleChange('language')}
                                label="Language"
                            >
                                {languageOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    {/* Theme */}
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography>Theme</Typography>
                    </Grid>
                    <Grid size={8}>
                        <FormControl
                            disabled={isLoading}
                            variant="outlined"
                            size="small"
                            fullWidth
                        >
                            <InputLabel>Theme</InputLabel>
                            <Select
                                value={getPreferenceValue('theme')}
                                onChange={handleChange('theme')}
                                label="Theme"
                            >
                                {themesOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    {/* API Keys */}
                    <Grid size={16} sx={{ mt: 2 }}>
                        <Typography variant="subtitle1" fontWeight={500} sx={{ mb: 1 }}>
                            API Configuration
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                    </Grid>

                    {/* Stadia Maps API Key */}
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography>Stadia Maps API Key</Typography>
                    </Grid>
                    <Grid size={8}>
                        <TextField
                            fullWidth
                            id="stadia-api-key"
                            variant="outlined"
                            type="password"
                            size="small"
                            disabled={isLoading}
                            value={getPreferenceValue('stadiaApiKey')}
                            onChange={handleChange('stadiaApiKey')}
                        />
                    </Grid>

                    {/* OpenWeatherMap API Key */}
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography>OpenWeatherMap API Key</Typography>
                    </Grid>
                    <Grid size={8}>
                        <TextField
                            fullWidth
                            id="openweather-api-key"
                            variant="outlined"
                            type="password"
                            size="small"
                            disabled={isLoading}
                            value={getPreferenceValue('openWeatherApiKey')}
                            onChange={handleChange('openWeatherApiKey')}
                        />
                    </Grid>
                </Grid>

                <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                        disabled={isLoading}
                        variant="contained"
                        onClick={handleSavePreferences}
                        sx={{
                            minWidth: 100,
                            borderRadius: 1,
                            textTransform: 'none',
                            fontWeight: 500
                        }}
                    >
                        Save
                    </Button>
                </Box>
            </Box>
        </Paper>
    );
};

export default PreferencesForm;