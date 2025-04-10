import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSatelliteData } from './overview-sat-slice.jsx';
import { Box, Typography, CircularProgress, Card, CardContent } from '@mui/material';
import {
    betterDateTimes,
    betterStatusValue,
    humanizeAltitude,
    humanizeLatitude,
    humanizeLongitude,
    humanizeVelocity,
    TitleBar
} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";
import {useSocket} from "../common/socket.jsx";

const SatelliteInfoCard = () => {
    const dispatch = useDispatch();
    const {socket} = useSocket();
    const { satelliteData, selectedSatelliteId, loading, error } = useSelector((state) => state.overviewSatTrack);

    useEffect(() => {
        if (selectedSatelliteId) {
            dispatch(fetchSatelliteData({socket, noradId: selectedSatelliteId}));
        }
    }, [selectedSatelliteId, dispatch]);

    return (
        <>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Satellite Info</TitleBar>
            <Grid container direction="column" spacing={0} padding={1}>
                <>
                    <Grid  spacing={0}>
                        <Typography variant="h6">{satelliteData['details']['name']}</Typography>
                    </Grid>
                    <Grid >
                        <Typography>NORAD ID: {satelliteData['details']['norad_id']}</Typography>
                    </Grid>
                    <Grid >
                        <Typography>Status: {betterStatusValue(satelliteData['details']['status'])}</Typography>
                    </Grid>
                    <Grid >
                        <Typography>Latitude: {humanizeLatitude(satelliteData['position']['lat'])}</Typography>
                    </Grid>
                    <Grid>
                        <Typography>Longitude: {humanizeLongitude(satelliteData['position']['lon'])}</Typography>
                    </Grid>
                    <Grid >
                        <Typography>Altitude: {humanizeAltitude(satelliteData['position']['alt'])}</Typography>
                    </Grid>
                    <Grid >
                        <Typography>Velocity: {humanizeVelocity(satelliteData['position']['vel'])}</Typography>
                    </Grid>
                    <Grid >
                        <Typography>Last Updated: {betterDateTimes(satelliteData['details']['updated'])}</Typography>
                    </Grid>
                </>
            </Grid>
        </>
    );
};

export default SatelliteInfoCard;