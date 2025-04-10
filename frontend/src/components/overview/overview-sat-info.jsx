import React, {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {fetchSatelliteData} from './overview-sat-slice.jsx';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CircleIcon from '@mui/icons-material/Circle';
import ExploreIcon from '@mui/icons-material/Explore';
import HeightIcon from '@mui/icons-material/Height';
import SpeedIcon from '@mui/icons-material/Speed';
import UpdateIcon from '@mui/icons-material/Update';
import {Box, Typography, CircularProgress, Card, CardContent} from '@mui/material';
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
    const {satelliteData, selectedSatelliteId, loading, error} = useSelector((state) => state.overviewSatTrack);

    useEffect(() => {
        if (selectedSatelliteId) {
            dispatch(fetchSatelliteData({socket, noradId: selectedSatelliteId}));
        }
    }, [selectedSatelliteId, dispatch]);

    return (
        <>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Satellite Info</TitleBar>
            <Box sx={{p: 2, borderRadius: 1}}>
                <Grid container direction="column" spacing={1}>
                    {/* Header with name */}
                    <Grid>
                        <Typography
                            variant="h5"
                            sx={{
                                fontWeight: 'medium',
                                mb: 1,
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                pb: 1
                            }}
                        >
                            {satelliteData['details']['name'] || "No satellite selected"}
                        </Typography>
                    </Grid>

                    {/* Main info section with icon indicators */}
                    <Grid container spacing={2}>
                        <Grid>
                            <Box sx={{display: 'flex', alignItems: 'center', mb: 1}}>
                                <RocketLaunchIcon sx={{mr: 1, color: 'primary.main'}} fontSize="small"/>
                                <Typography variant="body1" fontWeight="medium">NORAD ID:</Typography>
                            </Box>
                            <Typography variant="body1" sx={{pl: 4}}>{satelliteData['details']['norad_id']}</Typography>
                        </Grid>

                        <Grid>
                            <Box sx={{display: 'flex', alignItems: 'center', mb: 1}}>
                                <CircleIcon
                                    sx={{
                                        mr: 1,
                                        color: satelliteData['details']['status'] === 'active' ? 'success.main' : 'warning.main',
                                        fontSize: 'small'
                                    }}
                                />
                                <Typography variant="body1" fontWeight="medium">Status:</Typography>
                            </Box>
                            {betterStatusValue(satelliteData['details']['status'])}
                        </Grid>
                    </Grid>

                    {/* Position information */}
                    <Grid>
                        <Typography variant="subtitle1" sx={{fontWeight: 'medium', mt: 1, mb: 1}}>
                            Current Position
                        </Typography>
                        <Box sx={{
                            bgcolor: 'background.default',
                            p: 1.5,
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider'
                        }}>
                            <Grid container spacing={2}>
                                <Grid>
                                    <Box sx={{display: 'flex', alignItems: 'center', mb: 0.5}}>
                                        <ExploreIcon sx={{mr: 1, color: 'info.main'}} fontSize="small"/>
                                        <Typography variant="body2" color="text.secondary">Latitude</Typography>
                                    </Box>
                                    <Typography
                                        variant="body1">{humanizeLatitude(satelliteData['position']['lat'])}</Typography>
                                </Grid>

                                <Grid>
                                    <Box sx={{display: 'flex', alignItems: 'center', mb: 0.5}}>
                                        <ExploreIcon sx={{mr: 1, color: 'info.main'}} fontSize="small"/>
                                        <Typography variant="body2" color="text.secondary">Longitude</Typography>
                                    </Box>
                                    <Typography
                                        variant="body1">{humanizeLongitude(satelliteData['position']['lon'])}</Typography>
                                </Grid>

                                <Grid>
                                    <Box sx={{display: 'flex', alignItems: 'center', mb: 0.5}}>
                                        <HeightIcon sx={{mr: 1, color: 'info.main'}} fontSize="small"/>
                                        <Typography variant="body2" color="text.secondary">Altitude</Typography>
                                    </Box>
                                    <Typography
                                        variant="body1">{humanizeAltitude(satelliteData['position']['alt'])}</Typography>
                                </Grid>

                                <Grid>
                                    <Box sx={{display: 'flex', alignItems: 'center', mb: 0.5}}>
                                        <SpeedIcon sx={{mr: 1, color: 'info.main'}} fontSize="small"/>
                                        <Typography variant="body2" color="text.secondary">Velocity</Typography>
                                    </Box>
                                    <Typography
                                        variant="body1">{humanizeVelocity(satelliteData['position']['vel'])}</Typography>
                                </Grid>
                            </Grid>
                        </Box>
                    </Grid>

                    {/* Footer with last updated info */}
                    <Grid sx={{mt: 1.5}}>
                        <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            borderTop: '1px solid',
                            borderColor: 'divider',
                            pt: 1
                        }}>
                            <UpdateIcon fontSize="small" sx={{mr: 0.5, color: 'text.secondary'}}/>
                            <Typography variant="caption" color="text.secondary">
                                Last Updated: {betterDateTimes(satelliteData['details']['updated'])}
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>
            </Box>
        </>
    );
};

export default SatelliteInfoCard;