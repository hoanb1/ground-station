import React, {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {getWeatherData} from './weather-slice.jsx';
import {Box, Typography, CircularProgress, Card, CardContent} from '@mui/material';
import {getClassNamesBasedOnGridEditing, TitleBar} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";
import {
    Paper,
    Chip,
    Alert,
    AlertTitle
} from '@mui/material';
import CloudIcon from '@mui/icons-material/Cloud';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import OpacityIcon from '@mui/icons-material/Opacity';
import AirIcon from '@mui/icons-material/Air';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';


const WeatherDisplay = ({latitude, longitude}) => {
    const dispatch = useDispatch();
    const {data, loading, error} = useSelector((state) => state.weather);
    const {gridEditable} = useSelector(state => state.overviewSatTrack);
    const {preferences} = useSelector(state => state.preferences);

    useEffect(() => {
        if (latitude && longitude) {
            const apiKey = findOpenWeatherMapApiKey(preferences);
            dispatch(getWeatherData({latitude, longitude, apiKey}));
        }
    }, [latitude, longitude, dispatch]);


    const findOpenWeatherMapApiKey = (preferences) => {
        if (!Array.isArray(preferences)) {
            console.error("Preferences is not an array");
            return null;
        }

        const apiKeyObj = preferences.find(pref => pref.name === "openweather_api_key");
        return apiKeyObj ? apiKeyObj.value : null;
    };


    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <CloudIcon fontSize="small" sx={{ mr: 0 }} />
                    Weather
                </Box>
            </TitleBar>

            <Box sx={{ p: 1, height: '100%', position: 'relative' }}>
                {loading ? (
                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 10
                    }}>
                        <CircularProgress size={30} thickness={4} />
                    </Box>
                ) : (
                    <>
                        {error && (
                            <Alert
                                severity="error"
                                variant="outlined"
                                sx={{ py: 0.5, px: 1, mb: 1 }}
                            >
                                <Typography variant="caption">{error}</Typography>
                            </Alert>
                        )}

                        {!data ? (
                            <Box sx={{ textAlign: 'center', py: 1.5 }}>
                                <CloudOffIcon sx={{ fontSize: 30, mb: 0.5, opacity: 0.7, color: 'text.secondary' }} />
                                <Typography variant="body2" color="text.secondary">No weather data available</Typography>
                            </Box>
                        ) : (
                            <>
                                {/* Location and Temperature Header */}
                                <Box sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    mb: 1,
                                    pb: 0.5,
                                    borderBottom: '1px solid',
                                    borderColor: 'divider',
                                }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center' }}>
                                        <LocationOnIcon fontSize="small" sx={{ mr: 0.5, fontSize: 16 }} />
                                        {data.location}
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <img
                                            src={`https://openweathermap.org/img/wn/${data.icon}.png`}
                                            alt={data.description}
                                            style={{ width: 40, height: 40, marginRight: -8 }}
                                        />
                                        <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                                            {Math.round(data.temperature)}°C
                                        </Typography>
                                    </Box>
                                </Box>

                                {/* Weather Chip */}
                                <Box sx={{ mb: 1 }}>
                                    <Chip
                                        label={data.description}
                                        size="small"
                                        sx={{
                                            height: 22,
                                            fontSize: '0.75rem',
                                            borderRadius: 1,
                                            textTransform: 'capitalize',
                                            backgroundColor: 'primary.light',
                                            color: 'primary.dark'
                                        }}
                                    />
                                </Box>

                                {/* Weather Details Grid */}
                                <Grid container spacing={1}>
                                    <Grid >
                                        <Box sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            p: 0.75,
                                            borderRadius: 1,
                                            backgroundColor: 'background.default',
                                            border: '1px solid',
                                            borderColor: 'divider',
                                        }}>
                                            <ThermostatIcon sx={{ color: 'warning.main', fontSize: 18, mr: 0.5 }} />
                                            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Feels:</Typography>
                                            <Typography variant="body2">{Math.round(data.feels_like)}°C</Typography>
                                        </Box>
                                    </Grid>

                                    <Grid >
                                        <Box sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            p: 0.75,
                                            borderRadius: 1,
                                            backgroundColor: 'background.default',
                                            border: '1px solid',
                                            borderColor: 'divider',
                                        }}>
                                            <OpacityIcon sx={{ color: 'info.main', fontSize: 18, mr: 0.5 }} />
                                            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Humidity:</Typography>
                                            <Typography variant="body2">{data.humidity}%</Typography>
                                        </Box>
                                    </Grid>

                                    <Grid >
                                        <Box sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            p: 0.75,
                                            borderRadius: 1,
                                            backgroundColor: 'background.default',
                                            border: '1px solid',
                                            borderColor: 'divider',
                                        }}>
                                            <AirIcon sx={{ color: 'success.main', fontSize: 18, mr: 0.5 }} />
                                            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Wind:</Typography>
                                            <Typography variant="body2">{data.windSpeed} m/s</Typography>
                                        </Box>
                                    </Grid>

                                    <Grid >
                                        <Box sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            p: 0.75,
                                            borderRadius: 1,
                                            backgroundColor: 'background.default',
                                            border: '1px solid',
                                            borderColor: 'divider',
                                        }}>
                                            <CompareArrowsIcon sx={{ color: 'secondary.main', fontSize: 18, mr: 0.5 }} />
                                            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Pressure:</Typography>
                                            <Typography variant="body2">{data.pressure} hPa</Typography>
                                        </Box>
                                    </Grid>
                                </Grid>
                            </>
                        )}
                    </>
                )}
            </Box>
        </>
    );
};

export default WeatherDisplay;