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


const WeatherDisplay = ({latitude, longitude, apiKey}) => {
    const dispatch = useDispatch();
    const {data, loading, error} = useSelector((state) => state.weather);
    const {gridEditable} = useSelector(state => state.overviewSatTrack);

    useEffect(() => {
        if (latitude && longitude) {
            dispatch(getWeatherData({latitude, longitude, apiKey}));
        }
    }, [latitude, longitude, apiKey, dispatch]);


    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>
                <Box sx={{display: 'flex', alignItems: 'center'}}>
                    <CloudIcon sx={{mr: 1}}/>
                    Weather
                </Box>
            </TitleBar>

            <Box sx={{p: 2, height: '100%', display: 'flex', flexDirection: 'column'}}>
                {loading && (
                    <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1}}>
                        <CircularProgress size={40} thickness={4}/>
                    </Box>
                )}

                {error && (
                    <Alert
                        severity="error"
                        sx={{mb: 2}}
                        icon={<ErrorOutlineIcon/>}
                    >
                        <AlertTitle>Error loading weather data</AlertTitle>
                        {error}
                    </Alert>
                )}

                {!data ? (
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            p: 2,
                            height: '100%',
                            color: 'text.secondary'
                        }}
                    >
                        <CloudOffIcon sx={{fontSize: 60, mb: 2, opacity: 0.7}}/>
                        <Typography variant="h6" gutterBottom>No weather data available</Typography>
                        <Typography variant="body2">
                            Please check your location or network connection, and try again.
                        </Typography>
                    </Box>
                ) : (
                    <Box sx={{height: '100%'}}>
                        {/* Location Header */}
                        <Box sx={{
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            pb: 1,
                            mb: 2
                        }}>
                            <Typography variant="h6" sx={{fontWeight: 'medium'}}>
                                <LocationOnIcon fontSize="small" sx={{mr: 0.5, verticalAlign: 'text-bottom'}}/>
                                {data.location}
                            </Typography>
                        </Box>

                        {/* Main Temperature Display */}
                        <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            mb: 2
                        }}>
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, rgba(66,165,245,0.2) 0%, rgba(21,101,192,0.2) 100%)',
                                    borderRadius: '50%',
                                    p: 1,
                                    mr: 1,
                                    display: 'flex'
                                }}
                            >
                                <img
                                    src={`https://openweathermap.org/img/wn/${data.icon}@2x.png`}
                                    alt={data.description}
                                    style={{width: 80, height: 80}}
                                />
                            </Box>
                            <Typography
                                variant="h2"
                                sx={{
                                    fontWeight: 'bold',
                                    background: 'linear-gradient(45deg, #42A5F5 0%, #1565C0 100%)',
                                    backgroundClip: 'text',
                                    textFillColor: 'transparent',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                }}
                            >
                                {Math.round(data.temperature)}°
                            </Typography>
                        </Box>

                        {/* Weather Description */}
                        <Box sx={{
                            textAlign: 'center',
                            mb: 3,
                        }}>
                            <Chip
                                label={data.description}
                                sx={{
                                    borderRadius: 4,
                                    textTransform: 'capitalize',
                                    fontWeight: 'medium',
                                    backgroundColor: 'primary.light',
                                    color: 'primary.dark'
                                }}
                            />
                        </Box>

                        {/* Weather Details */}
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                borderRadius: 2,
                                backgroundColor: 'background.default',
                                border: '1px solid',
                                borderColor: 'divider'
                            }}
                        >
                            <Grid container spacing={1}>
                                <Grid>
                                    <Box sx={{display: 'flex', alignItems: 'center', mb: 0.5}}>
                                        <ThermostatIcon sx={{mr: 1, color: 'warning.main'}} fontSize="small"/>
                                        <Typography variant="body2" color="text.secondary">Feels Like</Typography>
                                    </Box>
                                    <Typography variant="body1">{Math.round(data.feels_like)}°C</Typography>
                                </Grid>

                                <Grid>
                                    <Box sx={{display: 'flex', alignItems: 'center', mb: 0.5}}>
                                        <OpacityIcon sx={{mr: 1, color: 'info.main'}} fontSize="small"/>
                                        <Typography variant="body2" color="text.secondary">Humidity</Typography>
                                    </Box>
                                    <Typography variant="body1">{data.humidity}%</Typography>
                                </Grid>

                                <Grid>
                                    <Box sx={{display: 'flex', alignItems: 'center', mb: 0.5}}>
                                        <AirIcon sx={{mr: 1, color: 'success.main'}} fontSize="small"/>
                                        <Typography variant="body2" color="text.secondary">Wind Speed</Typography>
                                    </Box>
                                    <Typography variant="body1">{data.windSpeed} m/s</Typography>
                                </Grid>

                                <Grid>
                                    <Box sx={{display: 'flex', alignItems: 'center', mb: 0.5}}>
                                        <CompareArrowsIcon sx={{mr: 1, color: 'secondary.main'}} fontSize="small"/>
                                        <Typography variant="body2" color="text.secondary">Pressure</Typography>
                                    </Box>
                                    <Typography variant="body1">{data.pressure} hPa</Typography>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Box>
                )}
            </Box>
        </>
    );
};

export default WeatherDisplay;