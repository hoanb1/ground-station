/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */



import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { updatePreferences, setPreference } from './preferences-slice.jsx';
import { tz } from 'moment-timezone';
import Paper from '@mui/material/Paper';
import {
    Alert,
    AlertTitle,
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
import { toast } from 'react-toastify';

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
                toast.success('Preferences saved successfully');
            })
            .catch(() => {
                toast.error('Failed to save preferences');
            });
    };

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>Application Preferences</AlertTitle>
                Configure your application settings and API keys
            </Alert>

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
                        <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
                            disabled={isLoading}
                            size="small"
                        >
                            <InputLabel>Timezone</InputLabel>
                            <Select
                                value={getPreferenceValue('timezone')}
                                onChange={handleChange('timezone')}
                                label="Timezone"
                             variant={'filled'}>
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
                        <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
                            disabled={isLoading}
                            size="small"
                        >
                            <InputLabel>Language</InputLabel>
                            <Select
                                value={getPreferenceValue('language')}
                                onChange={handleChange('language')}
                                label="Language"
                             variant={'filled'}>
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
                        <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
                            disabled={isLoading}
                            size="small"
                        >
                            <InputLabel htmlFor={"theme-selector"}>Theme</InputLabel>
                            <Select
                                id={'theme-selector'}
                                value={getPreferenceValue('theme')}
                                onChange={handleChange('theme')}
                                label="Theme"
                             variant={'filled'}>
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
                            type="text"
                            size="small"
                            disabled={isLoading}
                            value={getPreferenceValue('stadia_maps_api_key')}
                            onChange={handleChange('stadia_maps_api_key')}
                        />
                    </Grid>

                    {/* OpenWeatherMap API Key */}
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography>OpenWeatherMap API Key</Typography>
                    </Grid>
                    <Grid size={8}>
                        <TextField
                            style={{fontFamily: 'monospace'}}
                            fullWidth
                            id="openweather-api-key"
                            variant="outlined"
                            type="text"
                            size="small"
                            disabled={isLoading}
                            value={getPreferenceValue('openweather_api_key')}
                            onChange={handleChange('openweather_api_key')}
                        />
                    </Grid>

                    {/* Ground Station Configuration */}
                    <Grid size={16} sx={{ mt: 2 }}>
                        <Typography variant="subtitle1" fontWeight={500} sx={{ mb: 1 }}>
                            Ground Station Configuration
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                    </Grid>

                    {/* Minimum Elevation */}
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography>Minimum Elevation (degrees)</Typography>
                    </Grid>
                    <Grid size={8}>
                        <TextField
                            fullWidth
                            id="minimum-elevation"
                            variant="outlined"
                            type="number"
                            size="small"
                            disabled={isLoading}
                            value={getPreferenceValue('minimum_elevation')}
                            onChange={handleChange('minimum_elevation')}
                            inputProps={{
                                min: 0,
                                max: 90,
                                step: 1
                            }}
                        />
                    </Grid>
                </Grid>

                <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-start' }}>
                    <Button
                        disabled={isLoading}
                        variant="contained"
                        color="primary"
                        onClick={handleSavePreferences}
                    >
                        Save Preferences
                    </Button>
                </Box>
            </Box>
        </Paper>
    );
};

export default PreferencesForm;