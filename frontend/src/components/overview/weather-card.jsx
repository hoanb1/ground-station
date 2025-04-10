import React, {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {getWeatherData} from './weather-slice.jsx';
import {Box, Typography, CircularProgress, Card, CardContent} from '@mui/material';
import {getClassNamesBasedOnGridEditing, TitleBar} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";

const WeatherDisplay = ({latitude, longitude, apiKey}) => {
    const dispatch = useDispatch();
    const {data, loading, error } = useSelector((state) => state.weather);
    const { gridEditable } = useSelector(state => state.overviewSatTrack);

    useEffect(() => {
        if (latitude && longitude) {
            dispatch(getWeatherData({latitude, longitude, apiKey}));
        }
    }, [latitude, longitude, apiKey, dispatch]);


    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable,  ["window-title-bar"])}>Weather</TitleBar>
            <Grid container direction="column" spacing={0} padding={1}>
                {loading && <CircularProgress/>}
                {error && <Typography color="error">Error loading weather data: {error}</Typography>}
                {!data ? (
                    <Grid>
                        <Typography>No weather data available</Typography>
                        <Typography>Please check your location or network connection, and try again.</Typography>
                    </Grid>
                ) : (
                    <>
                        <Grid  spacing={0}>
                            <Typography variant="h6">{data.location} Weather</Typography>
                        </Grid>
                        <Grid  container alignItems="center">
                            <img
                                src={`https://openweathermap.org/img/wn/${data.icon}@2x.png`}
                                alt={data.description}
                            />
                            <Typography variant="h4">{Math.round(data.temperature)}°C</Typography>
                        </Grid>
                        <Grid >
                            <Typography>{data.description}</Typography>
                        </Grid>
                        <Grid >
                            <Typography>Feels like: {Math.round(data.feels_like)}°C</Typography>
                        </Grid>
                        <Grid >
                            <Typography>Humidity: {data.humidity}%</Typography>
                        </Grid>
                        <Grid >
                            <Typography>Wind speed: {data.windSpeed} m/s</Typography>
                        </Grid>
                        <Grid >
                            <Typography>Pressure: {data.pressure} hPa</Typography>
                        </Grid>
                    </>
                )}
            </Grid>
        </>
    );
};

export default WeatherDisplay;