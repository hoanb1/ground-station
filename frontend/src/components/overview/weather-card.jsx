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
import { useDispatch, useSelector } from 'react-redux';
import { getWeatherData } from './weather-slice.jsx';
import {
    Box, Typography, CircularProgress, Card, CardContent, Paper,
    Chip, Alert, Divider, useTheme
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { getClassNamesBasedOnGridEditing, TitleBar } from "../common/common.jsx";
import {
    Cloud as CloudIcon, CloudOff as CloudOffIcon, LocationOn as LocationOnIcon,
    Thermostat as ThermostatIcon, Opacity as OpacityIcon, Air as AirIcon,
    CompareArrows as CompareArrowsIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const WeatherDisplay = ({ latitude, longitude }) => {
    const dispatch = useDispatch();
    const { t } = useTranslation('overview');
    const { data, loading, error } = useSelector((state) => state.weather);
    const { gridEditable } = useSelector(state => state.overviewSatTrack);
    const { preferences } = useSelector(state => state.preferences);

    useEffect(() => {
        if (latitude && longitude) {
            const apiKey = preferences?.find(pref => pref?.name === "openweather_api_key")?.value;
            if (apiKey) dispatch(getWeatherData({ latitude, longitude, apiKey }));
        }
    }, [latitude, longitude, dispatch, preferences]);

    // Compact detail item component
    const DetailItem = ({ icon, label, value, color }) => (
        <Grid style={{marginRight: '4px'}}>
            <Paper elevation={0} sx={{
                margin: '0px',
                p: 1, borderRadius: 2, backgroundColor: 'action.hover',
                backdropFilter: 'blur(10px)', display: 'flex',
                flexDirection: 'column', alignItems: 'center', height: '100%'
            }}>
                {React.cloneElement(icon, { sx: { color, fontSize: 16, mb: 0 } })}
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="body2" fontWeight="medium">{value}</Typography>
            </Paper>
        </Grid>
    );

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <CloudIcon fontSize="small" sx={{ mr: 1 }} />
                    <Typography variant="h7" component="div" fontWeight="bold">{t('weather.title')}</Typography>
                </Box>
            </TitleBar>

            <Card elevation={3} sx={{
                height: '100%', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', borderRadius: 2
            }}>
                <CardContent sx={{ flexGrow: 1, p: 1.5, position: 'relative' }}>
                    {loading && (
                        <Box sx={{
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            height: '100%', width: '100%', position: 'absolute',
                            top: 0, left: 0, zIndex: 10, backdropFilter: 'blur(4px)'
                        }}>
                            <CircularProgress color="primary" size={36} thickness={4} />
                        </Box>
                    )}

                    {!loading && (
                        <>
                            {error && (
                                <Alert severity="error" variant="filled" sx={{ mb: 1.5, borderRadius: 1.5 }}>
                                    <Typography variant="body2">{error}</Typography>
                                </Alert>
                            )}

                            {!data ? (
                                <Paper elevation={0} sx={{
                                    textAlign: 'center', py: 2, height: '100%',
                                    display: 'flex', flexDirection: 'column',
                                    justifyContent: 'center', alignItems: 'center',
                                    backgroundColor: 'transparent'
                                }}>
                                    <CloudOffIcon sx={{ fontSize: 40, mb: 1, color: 'text.secondary', opacity: 0.7 }} />
                                    <Typography variant="body2" color="text.secondary">
                                        {t('weather.no_data')}
                                    </Typography>
                                </Paper>
                            ) : (
                                <>
                                    <Box sx={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        justifyContent: 'space-between',
                                    }}>
                                        <Box sx={{mb: 0}}>
                                            <Typography variant="body2" color="text.secondary" sx={{
                                                display: 'flex', alignItems: 'center'
                                            }}>
                                                <LocationOnIcon fontSize="small" sx={{mr: 0.5, fontSize: 14}}/>
                                                {data.location}
                                            </Typography>
                                            <Chip label={data.description} size="small" sx={{
                                                mt: 0.5, fontSize: '0.7rem', fontWeight: 'medium',
                                                textTransform: 'capitalize', backgroundColor: 'primary.main',
                                                color: 'primary.contrastText', borderRadius: 4,
                                                height: 22
                                            }}/>
                                        </Box>

                                        <Box sx={{
                                            height: '45px',
                                            display: 'flex', alignItems: 'center'
                                        }}>
                                            <Typography variant="h4" fontWeight="bold" sx={{lineHeight: 1}}>
                                                {Math.round(data.temperature)}°
                                            </Typography>
                                            <img src={`https://openweathermap.org/img/wn/${data.icon}@2x.png`}
                                                 alt={data.description}
                                                 style={{width: 70, height: 70, marginLeft: '0px'}}/>
                                        </Box>
                                    </Box>

                                    <Divider sx={{ my: 1 }} />

                                    <Grid container spacing={0.5} style={{
                                        alignItems: 'flex-start',
                                        justifyContent: 'space-between',
                                        overflowY: 'auto',
                                        height: "75px",
                                    }}>
                                        <DetailItem
                                            icon={<ThermostatIcon/>}
                                            label={t('weather.feels')}
                                            value={`${Math.round(data.feels_like)}°C`}
                                            color="warning.main"
                                        />
                                        <DetailItem
                                            icon={<OpacityIcon/>}
                                            label={t('weather.humidity')}
                                            value={`${data.humidity}%`}
                                            color="info.main"
                                        />
                                        <DetailItem
                                            icon={<AirIcon/>}
                                            label={t('weather.wind')}
                                            value={`${data.windSpeed} m/s`}
                                            color="success.main"
                                        />
                                        <DetailItem
                                            icon={<CompareArrowsIcon/>}
                                            label={t('weather.pressure')}
                                            value={`${data.pressure} hPa`}
                                            color="secondary.main"
                                        />
                                    </Grid>
                                </>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </>
    );
};

export default WeatherDisplay;