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



import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { updatePreferences, setPreference } from './preferences-slice.jsx';
import { tz } from 'moment-timezone';
import Paper from '@mui/material/Paper';
import { useTranslation } from 'react-i18next';
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
import { toast } from '../../utils/toast-with-timestamp.jsx';
import { getAvailableThemes } from '../../themes/theme-configs.js';

const PreferencesForm = () => {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const { preferences, status } = useSelector((state) => state.preferences);
    const isLoading = status === 'loading';
    const { t, i18n } = useTranslation('settings');

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
        { name: 'Ελληνικά', value: 'el_GR' },
        { name: 'Français', value: 'fr_FR' },
        { name: 'Español', value: 'es_ES' },
        { name: 'Deutsch', value: 'de_DE' },
        { name: 'Nederlands', value: 'nl_NL' },
    ];

    // Generate theme options from available themes
    const availableThemes = getAvailableThemes();
    const themesOptions = availableThemes.map(themeName => ({
        name: t(`preferences.theme_${themeName}`, themeName), // Fallback to themeName if translation missing
        value: themeName,
    }));

    const handleChange = (name) => (e) => {
        const value = e.target.value;
        dispatch(setPreference({ name, value }));

        // If language is changed, update i18n immediately
        if (name === 'language') {
            const languageCode = value.split('_')[0]; // 'en_US' -> 'en', 'el_GR' -> 'el'
            i18n.changeLanguage(languageCode);
        }
    };

    const handleSavePreferences = () => {
        dispatch(updatePreferences({ socket }))
            .unwrap()
            .then(() => {
                toast.success(t('preferences.save_success'));
            })
            .catch(() => {
                toast.error(t('preferences.save_error'));
            });
    };

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0 }}>
            <Alert severity="info">
                <AlertTitle>{t('preferences.title')}</AlertTitle>
                {t('preferences.subtitle')}
            </Alert>

            <Box component="form" sx={{ mt: 2 }}>
                <Grid container spacing={3} columns={16}>
                    {/* General Preferences */}
                    <Grid size={16}>
                        <Typography variant="subtitle1" fontWeight={500} sx={{ mb: 1 }}>
                            {t('general')}
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                    </Grid>

                    {/* Timezone */}
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography>{t('preferences.timezone')}</Typography>
                    </Grid>
                    <Grid size={8}>
                        <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
                            disabled={isLoading}
                            size="small"
                        >
                            <InputLabel>{t('preferences.timezone')}</InputLabel>
                            <Select
                                value={getPreferenceValue('timezone')}
                                onChange={handleChange('timezone')}
                                label={t('preferences.timezone')}
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
                        <Typography>{t('preferences.language')}</Typography>
                    </Grid>
                    <Grid size={8}>
                        <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
                            disabled={isLoading}
                            size="small"
                        >
                            <InputLabel>{t('preferences.language')}</InputLabel>
                            <Select
                                value={getPreferenceValue('language')}
                                onChange={handleChange('language')}
                                label={t('preferences.language')}
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
                        <Typography>{t('preferences.theme')}</Typography>
                    </Grid>
                    <Grid size={8}>
                        <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
                            disabled={isLoading}
                            size="small"
                        >
                            <InputLabel htmlFor={"theme-selector"}>{t('preferences.theme')}</InputLabel>
                            <Select
                                id={'theme-selector'}
                                value={getPreferenceValue('theme')}
                                onChange={handleChange('theme')}
                                label={t('preferences.theme')}
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
                            {t('preferences.api_configuration')}
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                    </Grid>

                    {/* Stadia Maps API Key */}
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography>{t('preferences.stadia_maps_api_key')}</Typography>
                    </Grid>
                    <Grid size={8}>
                        <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"outlined"}
                            disabled={isLoading}
                            size="small"
                        >
                            <TextField
                                fullWidth
                                id="stadia-api-key"
                                variant="filled"
                                type="text"
                                size="small"
                                disabled={isLoading}
                                label={t('preferences.stadia_maps_api_key')}
                                value={getPreferenceValue('stadia_maps_api_key')}
                                onChange={handleChange('stadia_maps_api_key')}
                            />
                        </FormControl>
                    </Grid>

                    {/* OpenWeatherMap API Key */}
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography>{t('preferences.openweather_api_key')}</Typography>
                    </Grid>
                    <Grid size={8}>
                        <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
                            disabled={isLoading}
                            size="small"
                        >
                            <TextField
                                style={{fontFamily: 'monospace'}}
                                fullWidth
                                id="openweather-api-key"
                                variant="filled"
                                type="text"
                                size="small"
                                disabled={isLoading}
                                label={t('preferences.openweather_api_key')}
                                value={getPreferenceValue('openweather_api_key')}
                                onChange={handleChange('openweather_api_key')}
                            />
                        </FormControl>
                    </Grid>

                    {/* Ground Station Configuration */}
                    <Grid size={16} sx={{ mt: 2 }}>
                        <Typography variant="subtitle1" fontWeight={500} sx={{ mb: 1 }}>
                            {t('preferences.ground_station_configuration')}
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                    </Grid>

                    {/* Minimum Elevation */}
                    <Grid size={8} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography>{t('preferences.minimum_elevation')}</Typography>
                    </Grid>
                    <Grid size={8}>
                        <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
                            disabled={isLoading}
                            size="small"
                        >
                            <TextField
                                fullWidth
                                id="minimum-elevation"
                                variant="filled"
                                type="number"
                                size="small"
                                disabled={isLoading}
                                label={t('preferences.minimum_elevation')}
                                value={getPreferenceValue('minimum_elevation')}
                                onChange={handleChange('minimum_elevation')}
                                inputProps={{
                                    min: 0,
                                    max: 90,
                                    step: 1
                                }}
                            />
                        </FormControl>
                    </Grid>
                </Grid>

                <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-start' }}>
                    <Button
                        disabled={isLoading}
                        variant="contained"
                        color="primary"
                        onClick={handleSavePreferences}
                    >
                        {t('preferences.save_preferences')}
                    </Button>
                </Box>
            </Box>
        </Paper>
    );
};

export default PreferencesForm;