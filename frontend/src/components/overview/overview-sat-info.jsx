import React, {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {fetchSatelliteData} from './overview-sat-slice.jsx';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import ExploreIcon from '@mui/icons-material/Explore';
import HeightIcon from '@mui/icons-material/Height';
import SpeedIcon from '@mui/icons-material/Speed';
import UpdateIcon from '@mui/icons-material/Update';
import SatelliteIcon from '@mui/icons-material/Satellite';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import {alpha} from '@mui/material/styles';
import {
    Box,
    Typography,
    CircularProgress,
    Card,
    CardContent,
    Paper,
    Chip, Button
} from '@mui/material';
import {
    betterDateTimes,
    betterStatusValue, getClassNamesBasedOnGridEditing,
    humanizeAltitude, humanizeDate,
    humanizeLatitude,
    humanizeLongitude,
    humanizeVelocity,
    TitleBar
} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";
import {useSocket} from "../common/socket.jsx";
import {setTrackingStateInBackend} from "../target/target-sat-slice.jsx";
import {enqueueSnackbar} from "notistack";

const SatelliteInfoCard = () => {
    const dispatch = useDispatch();
    const {socket} = useSocket();
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
            dispatch(fetchSatelliteData({socket, noradId: selectedSatelliteId}));
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

        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {

            })
            .catch((error) => {
                enqueueSnackbar(`Failed to start tracking with the rotator: ${error.message}`, {
                    variant: "error"
                });
            });
    };

    return (
        <>
            <TitleBar
                className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}
                sx={{
                    background: "#071318",
                    borderBottom: "1px solid #4b4b4b"
                }}
            >
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                }}>
                    <Box sx={{display: 'flex', alignItems: 'center'}}>
                        <SatelliteIcon fontSize="small" sx={{mr: 1, color: (theme) => theme.palette.secondary.light}}/>
                        <Typography variant="subtitle2" sx={{fontWeight: 'bold', letterSpacing: 0.5}}>
                            Satellite monitor
                        </Typography>
                    </Box>
                    <Typography variant="caption"
                                sx={{color: (theme) => alpha(theme.palette.common.white, 0.7), mr: 1}}>
                        ID: {satelliteData['details']['norad_id']}
                    </Typography>
                </Box>
            </TitleBar>

            <Box sx={{
                p: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: "#1e1e1e",
                color: (theme) => theme.palette.text.primary,
                backgroundImage: (theme) => `radial-gradient(${alpha(theme.palette.secondary.main, 0.1)} 1px, transparent 1px)`,
                backgroundSize: '20px 20px',
                overflow: 'hidden'
            }}>
                {/* Satellite Name Header */}
                <Box sx={{p: 2, pb: 1, borderBottom: "1px solid #4b4b4b", display: 'flex', alignItems: 'center'}}>
                    <Typography variant="h6" sx={{
                        fontWeight: 'bold',
                        color: (theme) => theme.palette.text.primary,
                        textShadow: (theme) => `0 0 10px ${alpha(theme.palette.primary.main, 0.5)}`,
                        display: 'flex',
                        alignItems: 'center',
                        '&::before': {
                            content: '""',
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: (theme) => satelliteData['details']['status'] === 'active'
                                ? theme.palette.success.main
                                : theme.palette.warning.main,
                            mr: 1.5,
                            boxShadow: (theme) => satelliteData['details']['status'] === 'active'
                                ? `0 0 8px ${theme.palette.success.main}`
                                : `0 0 8px ${theme.palette.warning.main}`
                        }
                    }}>
                        {satelliteData['details']['name'] || "- - - - - - - - - - -"}
                    </Typography>
                    <div style={{flex: 1, display: 'flex', justifyContent: 'flex-end'}}>
                        {betterStatusValue(satelliteData['details']['status'])}
                    </div>
                </Box>

                {/* Main Telemetry Data Section */}
                <Box sx={{p: 1, flex: 1}}>
                    <Grid container spacing={1}>
                        {/* Position Data */}
                        <Grid>
                            <Box sx={{
                                p: 1.5,
                                borderRadius: 1,
                                background: "#121212",
                                border: "1px solid #4b4b4b",
                                position: 'relative',
                                boxShadow: (theme) => `0 4px 12px ${alpha(theme.palette.common.black, 0.3)}`,
                            }}>
                                <Box sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: 3,
                                    background: (theme) => `linear-gradient(90deg, ${theme.palette.secondary.main}, ${theme.palette.secondary.dark})`
                                }}/>
                                <Typography variant="overline" sx={{
                                    color: (theme) => theme.palette.secondary.main,
                                    display: 'block',
                                    fontSize: '0.65rem',
                                    mb: 0.5,
                                    letterSpacing: 1
                                }}>
                                    POSITION DATA
                                </Typography>

                                <Grid container spacing={1.5}>
                                    <Grid>
                                        <Box sx={{display: 'flex', alignItems: 'center', mb: 0.25}}>
                                            <ExploreIcon sx={{
                                                color: (theme) => theme.palette.secondary.main,
                                                fontSize: 16,
                                                mr: 0.5
                                            }}/>
                                            <Typography variant="caption"
                                                        sx={{color: (theme) => alpha(theme.palette.text.primary, 0.7)}}>
                                                LAT
                                            </Typography>
                                        </Box>
                                        <Typography variant="body1" sx={{fontWeight: 'medium', ml: 2.5}}>
                                            {humanizeLatitude(satelliteData['position']['lat'])}
                                        </Typography>
                                    </Grid>

                                    <Grid>
                                        <Box sx={{display: 'flex', alignItems: 'center', mb: 0.25}}>
                                            <ExploreIcon sx={{
                                                color: (theme) => theme.palette.secondary.main,
                                                fontSize: 16,
                                                mr: 0.5
                                            }}/>
                                            <Typography variant="caption"
                                                        sx={{color: (theme) => alpha(theme.palette.text.primary, 0.7)}}>
                                                LON
                                            </Typography>
                                        </Box>
                                        <Typography variant="body1" sx={{fontWeight: 'medium', ml: 2.5}}>
                                            {humanizeLongitude(satelliteData['position']['lon'])}
                                        </Typography>
                                    </Grid>

                                    <Grid>
                                        <Box sx={{display: 'flex', alignItems: 'center', mb: 0.25}}>
                                            <MyLocationIcon sx={{
                                                color: (theme) => theme.palette.secondary.main,
                                                fontSize: 16,
                                                mr: 0.5
                                            }}/>
                                            <Typography variant="caption"
                                                        sx={{color: (theme) => alpha(theme.palette.text.primary, 0.7)}}>
                                                AZIMUTH
                                            </Typography>
                                        </Box>
                                        <Typography variant="body1" sx={{fontWeight: 'medium', ml: 2.5}}>
                                            {satelliteData['position']['az'] ? `${satelliteData['position']['az'].toFixed(1)}°` : 'N/A'}
                                        </Typography>
                                    </Grid>

                                    <Grid>
                                        <Box sx={{display: 'flex', alignItems: 'center', mb: 0.25}}>
                                            <HeightIcon sx={{
                                                color: (theme) => theme.palette.secondary.main,
                                                fontSize: 16,
                                                mr: 0.5
                                            }}/>
                                            <Typography variant="caption"
                                                        sx={{color: (theme) => alpha(theme.palette.text.primary, 0.7)}}>
                                                ELEVATION
                                            </Typography>
                                        </Box>
                                        <Typography variant="body1" sx={{fontWeight: 'medium', ml: 2.5}}>
                                            {satelliteData['position']['el'] ? `${satelliteData['position']['el'].toFixed(1)}°` : 'N/A'}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Grid>

                        {/* Altitude and Velocity */}
                        <Grid>
                            <Box sx={{
                                height: '100%',
                                borderRadius: 1,
                                background: "#121212",
                                border: "1px solid #4b4b4b",
                                overflow: 'hidden',
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                                p: 1
                            }}>
                                <Box sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: 3,
                                    background: (theme) => `linear-gradient(90deg, ${theme.palette.secondary.main}, ${theme.palette.secondary.dark})`
                                }}/>

                                <Typography variant="overline" sx={{
                                    color: (theme) => theme.palette.secondary.main,
                                    mb: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    fontSize: '0.65rem',
                                    letterSpacing: 1
                                }}>
                                    <HeightIcon sx={{fontSize: 14, mr: 0.5}}/>
                                    ALTITUDE
                                </Typography>

                                <Box sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flex: 1
                                }}>
                                    <Typography variant="h5" sx={{
                                        fontWeight: 'bold',
                                        textShadow: (theme) => `0 0 10px ${alpha(theme.palette.primary.main, 0.3)}`
                                    }}>
                                        {humanizeAltitude(satelliteData['position']['alt'], 0)}
                                    </Typography>
                                    <Typography variant="caption"
                                                sx={{color: (theme) => alpha(theme.palette.text.primary, 0.6)}}>
                                        kilometers
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>

                        <Grid>
                            <Box sx={{
                                height: '100%',
                                borderRadius: 1,
                                background: "#121212",
                                border: "1px solid #4b4b4b",
                                overflow: 'hidden',
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                                p: 1.25
                            }}>
                                <Box sx={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: 3,
                                    background: (theme) => `linear-gradient(90deg, ${theme.palette.secondary.main}, ${theme.palette.secondary.dark})`
                                }}/>

                                <Typography variant="overline" sx={{
                                    color: (theme) => theme.palette.secondary.main,
                                    mb: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    fontSize: '0.65rem',
                                    letterSpacing: 1
                                }}>
                                    <SpeedIcon sx={{fontSize: 14, mr: 0.5}}/>
                                    VELOCITY
                                </Typography>

                                <Box sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flex: 1
                                }}>
                                    <Typography variant="h5" sx={{
                                        fontWeight: 'bold',
                                        textShadow: (theme) => `0 0 10px ${alpha(theme.palette.primary.main, 0.3)}`
                                    }}>
                                        {humanizeVelocity(satelliteData['position']['vel'])}
                                    </Typography>
                                    <Typography variant="caption"
                                                sx={{color: (theme) => alpha(theme.palette.text.primary, 0.6)}}>
                                        km/s
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>

                        {/* Tracking Button */}
                        <Grid>
                            <Box sx={{
                                display: 'flex',
                                justifyContent: 'center',
                                p: 1,
                                borderRadius: 1,
                                background: "#121212",
                                border: "1px solid #4b4b4b",
                                mt: 0.5
                            }}>
                                <Button disabled={!selectedSatelliteId || trackingSatelliteId===selectedSatelliteId}
                                        variant="contained" color="primary"
                                        onClick={handleSetTrackingOnBackend} fullWidth={true} sx={{py: 0.75}}>
                                    {trackingSatelliteId===selectedSatelliteId? "TRACKING NOW": "START TRACKING"}
                                </Button>
                            </Box>
                        </Grid>
                    </Grid>
                </Box>

                {/* Footer */}
                <Box sx={{
                    bottom: 0,
                    position: 'absolute',
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    p: 1,
                    borderTop: "1px solid #4b4b4b",
                    background: "#121212",
                    backdropFilter: 'blur(8px)'
                }}>
                    <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        px: 1,
                        py: 0.25,
                        borderRadius: 0.5,
                        background: (theme) => alpha(theme.palette.secondary.main, 0.1),
                    }}>
                        <RocketLaunchIcon sx={{fontSize: 14, mr: 0.5, color: (theme) => theme.palette.secondary.main}}/>
                        <Typography variant="caption" sx={{color: (theme) => theme.palette.secondary.main}}>
                            NORAD: {satelliteData['details']['norad_id']}
                        </Typography>
                    </Box>

                    <Box sx={{display: 'flex', alignItems: 'center'}}>
                        <UpdateIcon
                            sx={{fontSize: 12, mr: 0.5, color: (theme) => alpha(theme.palette.text.primary, 0.5)}}/>
                        <Typography variant="caption" sx={{color: (theme) => alpha(theme.palette.text.primary, 0.5)}}>
                            {humanizeDate(satelliteData['details']['updated'])}
                        </Typography>
                    </Box>
                </Box>
            </Box>
        </>
    );
};

export default SatelliteInfoCard;