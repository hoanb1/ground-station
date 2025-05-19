import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSatelliteData } from './overview-sat-slice.jsx';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import ExploreIcon from '@mui/icons-material/Explore';
import HeightIcon from '@mui/icons-material/Height';
import SpeedIcon from '@mui/icons-material/Speed';
import UpdateIcon from '@mui/icons-material/Update';
import SatelliteIcon from '@mui/icons-material/Satellite';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import {
    Box,
    Typography,
    Card,
    Chip,
    Button
} from '@mui/material';
import {
    betterDateTimes,
    betterStatusValue,
    getClassNamesBasedOnGridEditing,
    humanizeAltitude,
    humanizeDate,
    humanizeLatitude,
    humanizeLongitude,
    humanizeVelocity,
    renderCountryFlagsCSV,
    TitleBar,
    getFrequencyBand,
    getBandColor,
} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";
import { useSocket } from "../common/socket.jsx";
import { setTrackingStateInBackend } from "../target/target-sat-slice.jsx";
import { enqueueSnackbar } from "notistack";

const SatelliteInfoCard = () => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const {
        satelliteData,
        selectedSatelliteId,
        loading,
        error,
        gridEditable,
        selectedSatGroupId
    } = useSelector((state) => state.overviewSatTrack);
    const {
        trackingState,
        satelliteId: trackingSatelliteId,
        selectedRadioRig,
        selectedRotator,
        selectedTransmitter
    } = useSelector(state => state.targetSatTrack);

    useEffect(() => {
        if (selectedSatelliteId) {
            dispatch(fetchSatelliteData({ socket, noradId: selectedSatelliteId }));
        }
    }, [selectedSatelliteId, dispatch]);

    const handleSetTrackingOnBackend = () => {
        const newTrackingState = {
            'norad_id': selectedSatelliteId,
            'group_id': selectedSatGroupId,
            'rotator_state': trackingState['rotator_state'],
            'rig_state': trackingState['rig_state'],
            'rig_id': selectedRadioRig,
            'rotator_id': selectedRotator,
            'transmitter_id': selectedTransmitter,
        };

        dispatch(setTrackingStateInBackend({ socket, data: newTrackingState }))
            .unwrap()
            .then((response) => {
                // Success handling
            })
            .catch((error) => {
                enqueueSnackbar(`Failed to start tracking with the rotator: ${error.message}`, {
                    variant: "error"
                });
            });
    };

    const bands = satelliteData['transmitters']
        .map(t => getFrequencyBand(t['downlink_low']))
        .filter((v, i, a) => a.indexOf(v) === i);

    // Common styles
    const cardStyle = {
        p: 0.75,
        bgcolor: "#121212",
        border: "1px solid #333",
        borderRadius: 1,
        height: '100%'
    };

    const cardHeaderStyle = {
        fontSize: '0.7rem',
        fontWeight: 'bold',
        color: 'secondary.main',
        mb: 1,
        display: 'flex',
        alignItems: 'center'
    };

    const iconStyle = {
        fontSize: 16,
        mr: 0.5,
        color: 'secondary.main'
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: "#1a1a1a" }}>
            {/* Header */}
            <TitleBar
                className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}
                sx={{ bgcolor: "#0a0a0a", borderBottom: "1px solid #333" }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <SatelliteIcon fontSize="small" sx={{ mr: 1, color: 'secondary.light' }}/>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                            Satellite Monitor
                        </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        ID: {satelliteData['details']['norad_id']}
                    </Typography>
                </Box>
            </TitleBar>

            {/* Satellite Name */}
            <Box sx={{ p: 1, borderBottom: "1px solid #333", display: 'flex', alignItems: 'center' }}>
                <Box sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    mr: 1,
                    bgcolor: satelliteData['details']['status'] === 'active' ? 'success.main' : 'warning.main'
                }}/>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                    {satelliteData['details']['name'] || "- - - - - - - - - - -"}
                </Typography>
                <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                    {betterStatusValue(satelliteData['details']['status'])}
                </Box>
            </Box>

            {/* Main Content */}
            <Box sx={{ p: 1, flex: 1, overflow: 'auto' }}>
                <Grid container spacing={2}>
                    {/* Position Data */}
                    <Grid xs={12}>
                        <Card sx={cardStyle}>
                            <Typography variant="overline" sx={cardHeaderStyle}>
                                POSITION DATA
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid xs={6} sm={3}>
                                    <Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                            <ExploreIcon sx={iconStyle}/>
                                            <Typography variant="caption" color="text.secondary">LAT</Typography>
                                        </Box>
                                        <Typography variant="body2">
                                            {humanizeLatitude(satelliteData['position']['lat'])}
                                        </Typography>
                                    </Box>
                                </Grid>
                                <Grid xs={6} sm={3}>
                                    <Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                            <ExploreIcon sx={iconStyle}/>
                                            <Typography variant="caption" color="text.secondary">LON</Typography>
                                        </Box>
                                        <Typography variant="body2">
                                            {humanizeLongitude(satelliteData['position']['lon'])}
                                        </Typography>
                                    </Box>
                                </Grid>
                                <Grid xs={6} sm={3}>
                                    <Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                            <MyLocationIcon sx={iconStyle}/>
                                            <Typography variant="caption" color="text.secondary">AZIMUTH</Typography>
                                        </Box>
                                        <Typography variant="body2">
                                            {satelliteData['position']['az'] ? `${satelliteData['position']['az'].toFixed(1)}°` : 'N/A'}
                                        </Typography>
                                    </Box>
                                </Grid>
                                <Grid xs={6} sm={3}>
                                    <Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                            <HeightIcon sx={iconStyle}/>
                                            <Typography variant="caption" color="text.secondary">ELEVATION</Typography>
                                        </Box>
                                        <Typography variant="body2">
                                            {satelliteData['position']['el'] ? `${satelliteData['position']['el'].toFixed(1)}°` : 'N/A'}
                                        </Typography>
                                    </Box>
                                </Grid>
                            </Grid>
                        </Card>
                    </Grid>

                    {/* Status Info Cards */}
                    <Grid xs={6} md={4}>
                        <Card sx={cardStyle}>
                            <Typography variant="overline" sx={cardHeaderStyle}>
                                <HeightIcon sx={iconStyle}/>
                                ALTITUDE
                            </Typography>
                            <Box sx={{ textAlign: 'center', mt: 1 }}>
                                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                                    {humanizeAltitude(satelliteData['position']['alt'], 0)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">kilometers</Typography>
                            </Box>
                        </Card>
                    </Grid>

                    <Grid xs={6} md={4}>
                        <Card sx={cardStyle}>
                            <Typography variant="overline" sx={cardHeaderStyle}>
                                <SpeedIcon sx={iconStyle}/>
                                VELOCITY
                            </Typography>
                            <Box sx={{ textAlign: 'center', mt: 1 }}>
                                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                                    {humanizeVelocity(satelliteData['position']['vel'])}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">km/s</Typography>
                            </Box>
                        </Card>
                    </Grid>

                    <Grid xs={12} md={4}>
                        <Card sx={cardStyle}>
                            <Typography variant="overline" sx={cardHeaderStyle}>
                                COUNTRIES
                            </Typography>
                            <Box sx={{ textAlign: 'center', mt: 1 }}>
                                <Typography variant="body1">
                                    {renderCountryFlagsCSV(satelliteData['details']['countries']) || 'Unknown'}
                                </Typography>
                            </Box>
                        </Card>
                    </Grid>

                    <Grid xs={6}>
                        <Card sx={cardStyle}>
                            <Typography variant="overline" sx={cardHeaderStyle}>
                                BANDS
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                                {bands.map((band, index) => (
                                    <Chip
                                        key={index}
                                        label={band}
                                        size="small"
                                        sx={{
                                            backgroundColor: getBandColor(band),
                                            color: '#ffffff',
                                        }}
                                    />
                                ))}
                            </Box>
                        </Card>
                    </Grid>

                    <Grid xs={6}>
                        <Card sx={cardStyle}>
                            <Typography variant="overline" sx={cardHeaderStyle}>
                                <UpdateIcon sx={iconStyle}/>
                                LAST UPDATE
                            </Typography>
                            <Box sx={{ textAlign: 'center', mt: 1 }}>
                                <Typography variant="body2">
                                    {betterDateTimes(satelliteData['details']['updated'])}
                                </Typography>
                            </Box>
                        </Card>
                    </Grid>

                    {/* Tracking Button */}
                    <Grid xs={12}>
                        <Button
                            disabled={!selectedSatelliteId || trackingSatelliteId === selectedSatelliteId}
                            variant="contained"
                            color="primary"
                            onClick={handleSetTrackingOnBackend}
                            fullWidth
                            sx={{ py: 1 }}
                        >
                            {trackingSatelliteId === selectedSatelliteId ? "TRACKING NOW" : "START TRACKING"}
                        </Button>
                    </Grid>
                </Grid>
            </Box>

            {/* Footer */}
            <Box sx={{
                p: 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: "1px solid #333",
                bgcolor: "#0a0a0a"
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <RocketLaunchIcon sx={{ fontSize: 14, mr: 0.5, color: 'secondary.main' }}/>
                    <Typography variant="caption" sx={{ color: 'secondary.main' }}>
                        NORAD: {satelliteData['details']['norad_id']}
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <UpdateIcon sx={{ fontSize: 12, mr: 0.5, color: 'text.secondary' }}/>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {humanizeDate(satelliteData['details']['updated'])}
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
};

export default SatelliteInfoCard;