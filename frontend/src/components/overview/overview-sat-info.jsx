import React, {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {
    fetchSatelliteData
} from './overview-sat-slice.jsx';
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
    Chip,
    Button,
    CircularProgress,
    Divider
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
import {useSocket} from "../common/socket.jsx";
import {setTrackingStateInBackend} from "../target/target-sat-slice.jsx";
import {enqueueSnackbar} from "notistack";
import SettingsInputAntennaIcon from "@mui/icons-material/SettingsInputAntenna";
import PublicIcon from "@mui/icons-material/Public";

const OverviewSatelliteInfoCard = () => {
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
            dispatch(fetchSatelliteData({socket: socket, noradId: selectedSatelliteId}));
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

        dispatch(setTrackingStateInBackend({socket: socket, data: newTrackingState}))
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

    const bands = satelliteData && satelliteData['transmitters']
        ? satelliteData['transmitters']
            .map(t => getFrequencyBand(t['downlink_low']))
            .filter((v, i, a) => a.indexOf(v) === i)
        : [];

    const DataPoint = ({ icon: Icon, label, value, color = '#ffffff', unit = '' }) => (
        <Box sx={{ mb: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Icon sx={{ fontSize: 14, mr: 0.5, color: color }} />
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium' }}>
                    {label}
                </Typography>
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 'bold', color: color }}>
                {value} {unit && <span style={{ fontSize: '0.8em', color: 'text.secondary' }}>{unit}</span>}
            </Typography>
        </Box>
    );

    const Section = ({ title, icon: Icon, children }) => (
        <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Icon sx={{ fontSize: 16, mr: 1, color: 'secondary.main' }} />
                <Typography variant="overline" sx={{
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: 'secondary.main',
                    letterSpacing: '0.5px'
                }}>
                    {title}
                </Typography>
            </Box>
            {children}
        </Box>
    );

    return (
        <Box sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: "rgba(26, 26, 26, 0.95)",
            backdropFilter: 'blur(10px)'
        }}>
            {/* Header */}
            <TitleBar
                className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}
                sx={{
                    bgcolor: "rgba(10, 10, 10, 0.8)",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                    backdropFilter: 'blur(10px)'
                }}
            >
                <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                    <Box sx={{display: 'flex', alignItems: 'center'}}>
                        <SatelliteIcon fontSize="small" sx={{mr: 1, color: 'secondary.light'}}/>
                        <Typography variant="subtitle2" sx={{fontWeight: 'bold'}}>
                            Satellite Monitor
                        </Typography>
                    </Box>
                    <Typography variant="caption" sx={{color: 'text.secondary'}}>
                        ID: {!loading && satelliteData && satelliteData['details'] ? satelliteData['details']['norad_id'] : ''}
                    </Typography>
                </Box>
            </TitleBar>

            {loading ? (
                <Box sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}>
                    <CircularProgress color="secondary" />
                    <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                        Loading satellite data...
                    </Typography>
                </Box>
            ) : (
                <>
                    {/* Satellite Name & Status */}
                    <Box sx={{
                        p: 1,
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                        borderBottom: "1px solid rgba(255, 255, 255, 0.1)"
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <Box sx={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                mr: 1.5,
                                bgcolor: satelliteData && satelliteData['details'] && satelliteData['details']['status'] === 'active' ? 'success.main' : 'warning.main',
                                boxShadow: `0 0 8px ${satelliteData && satelliteData['details'] && satelliteData['details']['status'] === 'active' ? '#4caf50' : '#ff9800'}40`
                            }}/>
                            <Typography variant="h6" sx={{ fontWeight: 'bold', flex: 1 }}>
                                {satelliteData && satelliteData['details'] ? satelliteData['details']['name'] : "- - - - - - - - - - -"}
                            </Typography>
                            {satelliteData && satelliteData['details'] && betterStatusValue(satelliteData['details']['status'])}
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                                <RocketLaunchIcon sx={{ fontSize: 12, mr: 0.5 }} />
                                NORAD: {satelliteData && satelliteData['details'] ? satelliteData['details']['norad_id'] : ''}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                                <UpdateIcon sx={{ fontSize: 12, mr: 0.5 }} />
                                {satelliteData && satelliteData['details'] ? humanizeDate(satelliteData['details']['updated']) : ''}
                            </Typography>
                        </Box>
                    </Box>

                    {/* Main Content */}
                    <Box sx={{ pr: 2, pl: 2, pt: 1, flex: 1, overflow: 'auto' }}>

                        {/* Position Data */}
                        <Section title="POSITION DATA" icon={ExploreIcon}>
                            <Grid container spacing={1}>
                                <Grid size={6}>
                                    <DataPoint
                                        icon={({ sx }) => <Box sx={{ ...sx, width: 6, height: 6, borderRadius: '50%', bgcolor: '#4fc3f7' }} />}
                                        label="LATITUDE"
                                        value={satelliteData && satelliteData['position'] ? humanizeLatitude(satelliteData['position']['lat']) : 'N/A'}
                                        color="#4fc3f7"
                                    />
                                </Grid>
                                <Grid size={6}>
                                    <DataPoint
                                        icon={({ sx }) => <Box sx={{ ...sx, width: 6, height: 6, borderRadius: '50%', bgcolor: '#81c784' }} />}
                                        label="LONGITUDE"
                                        value={satelliteData && satelliteData['position'] ? humanizeLongitude(satelliteData['position']['lon']) : 'N/A'}
                                        color="#81c784"
                                    />
                                </Grid>
                                <Grid size={6}>
                                    <DataPoint
                                        icon={MyLocationIcon}
                                        label="AZIMUTH"
                                        value={satelliteData && satelliteData['position'] && satelliteData['position']['az'] ? `${satelliteData['position']['az'].toFixed(1)}°` : 'N/A'}
                                        color="#ffb74d"
                                    />
                                </Grid>
                                <Grid size={6}>
                                    <DataPoint
                                        icon={HeightIcon}
                                        label="ELEVATION"
                                        value={satelliteData && satelliteData['position'] && satelliteData['position']['el'] ? `${satelliteData['position']['el'].toFixed(1)}°` : 'N/A'}
                                        color="#e57373"
                                    />
                                </Grid>
                            </Grid>
                        </Section>

                        <Divider sx={{ my: 0, mb: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }} />

                        {/* Orbital Data */}
                        <Section title="ORBITAL DATA" icon={SpeedIcon}>
                            <Grid container spacing={1}>
                                <Grid size={6}>
                                    <DataPoint
                                        icon={HeightIcon}
                                        label="ALTITUDE"
                                        value={satelliteData && satelliteData['position'] ? humanizeAltitude(satelliteData['position']['alt'], 0) : 'N/A'}
                                        color="#ba68c8"
                                        unit="km"
                                    />
                                </Grid>
                                <Grid size={6}>
                                    <DataPoint
                                        icon={SpeedIcon}
                                        label="VELOCITY"
                                        value={satelliteData && satelliteData['position'] ? humanizeVelocity(satelliteData['position']['vel']) : 'N/A'}
                                        color="#4db6ac"
                                        unit="km/s"
                                    />
                                </Grid>
                            </Grid>
                        </Section>

                        <Divider sx={{ my: 0, mb: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }} />

                        {/* Communication Data */}
                        <Section title="COMMUNICATION" icon={SettingsInputAntennaIcon}>
                            <Box sx={{ mb: 0 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium', mb: 1, display: 'block' }}>
                                    FREQUENCY BANDS
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {bands.map((band, index) => (
                                        <Chip
                                            key={index}
                                            label={band}
                                            size="small"
                                            sx={{
                                                backgroundColor: getBandColor(band),
                                                color: '#ffffff',
                                                fontSize: '0.7rem',
                                                height: 24
                                            }}
                                        />
                                    ))}
                                </Box>
                            </Box>
                        </Section>

                        <Divider sx={{ my: 0, mb: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }} />

                        {/* Metadata */}
                        <Section title="METADATA" icon={PublicIcon}>
                            <Grid container spacing={2}>
                                <Grid size={6}>
                                    <Box sx={{ mb: 0 }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium', mb: 0.5, display: 'block' }}>
                                            COUNTRIES
                                        </Typography>
                                        <Box>
                                            {satelliteData && satelliteData['details'] ? (renderCountryFlagsCSV(satelliteData['details']['countries']) || 'Unknown') : 'Unknown'}
                                        </Box>
                                    </Box>
                                </Grid>
                                <Grid size={6}>
                                    <Box sx={{ mb: 0 }}>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium', mb: 0.5, display: 'block' }}>
                                            LAST UPDATE
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#ffcc02' }}>
                                            {satelliteData && satelliteData['details'] ? betterDateTimes(satelliteData['details']['updated']) : 'N/A'}
                                        </Typography>
                                    </Box>
                                </Grid>
                            </Grid>
                        </Section>
                    </Box>

                    {/* Footer */}
                    <Box sx={{
                        p: 2,
                        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                        background: 'linear-gradient(180deg, rgba(10, 10, 10, 0.8) 0%, rgba(10, 10, 10, 0.9) 100%)',
                        backdropFilter: 'blur(10px)'
                    }}>
                        <Button
                            disabled={!selectedSatelliteId || trackingSatelliteId === selectedSatelliteId}
                            variant="contained"
                            color="primary"
                            onClick={handleSetTrackingOnBackend}
                            fullWidth
                            sx={{
                                py: 1.5,
                                fontWeight: 'bold',
                                borderRadius: 2,
                                background: trackingSatelliteId === selectedSatelliteId
                                    ? 'linear-gradient(45deg, #4caf50 30%, #66bb6a 90%)'
                                    : 'linear-gradient(45deg, #2196f3 30%, #21cbf3 90%)',
                                boxShadow: '0 3px 5px 2px rgba(33, 203, 243, .3)',
                                '&:hover': {
                                    background: trackingSatelliteId === selectedSatelliteId
                                        ? 'linear-gradient(45deg, #4caf50 30%, #66bb6a 90%)'
                                        : 'linear-gradient(45deg, #1976d2 30%, #1e88e5 90%)',
                                }
                            }}
                        >
                            {trackingSatelliteId === selectedSatelliteId ? "CURRENTLY TARGETED" : "SET AS TARGET"}
                        </Button>
                    </Box>
                </>
            )}
        </Box>
    );
};

export default OverviewSatelliteInfoCard;