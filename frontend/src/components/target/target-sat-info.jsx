import {useSelector} from "react-redux";
import {
    betterDateTimes,
    betterStatusValue, getClassNamesBasedOnGridEditing, humanizeDate,
    renderCountryFlagsCSV,
    ThemedStackIsland,
    TitleBar
} from "../common/common.jsx";
import {
    Box,
    Typography,
    Stack,
} from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SettingsRemoteIcon from '@mui/icons-material/SettingsRemote';
import Grid from "@mui/material/Grid2";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import React from "react";

const SatelliteInfoIsland = () => {
    const {satelliteData, gridEditable} = useSelector((state) => state.targetSatTrack);

    const fixedWidthFont = {'fontFamily': 'monospace'};

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, [])}>
                <Box sx={{display: 'flex', alignItems: 'center'}}>
                    <SatelliteAltIcon sx={{mr: 0.5, ml: 0, height: '0.9rem'}} size="small"/>
                    {satelliteData['details']['name']}
                </Box>
            </TitleBar>

            <ThemedStackIsland>
                <Box sx={{p: 1}}>
                    {/* Position Section */}
                    <Typography variant="subtitle1" sx={{
                        fontWeight: 'medium',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        pb: 0.5,
                        mb: 1.5
                    }}>
                        Position Data
                    </Typography>

                    <Grid container spacing={2} sx={{mb: 2}}>
                        {/* First Column */}
                        <Grid>
                            <Stack spacing={1.5} sx={{display: 'flex', justifyContent: 'space-between'}}>
                                <Box minWidth={150}>
                                    <Typography variant="caption" color="text.secondary">Latitude</Typography>
                                    <Typography variant="body1" sx={{fontFamily: 'monospace', fontWeight: 'medium'}}>
                                        {satelliteData['position']['lat'] ? satelliteData['position']['lat'].toFixed(4) : "n/a"}°
                                    </Typography>
                                </Box>

                                <Box>
                                    <Typography variant="caption" color="text.secondary">Longitude</Typography>
                                    <Typography variant="body1" sx={{fontFamily: 'monospace', fontWeight: 'medium'}}>
                                        {satelliteData['position']['lon'] ? satelliteData['position']['lon'].toFixed(4) : "n/a"}°
                                    </Typography>
                                </Box>

                                <Box>
                                    <Typography variant="caption" color="text.secondary">Azimuth</Typography>
                                    <Typography variant="body1" sx={{fontFamily: 'monospace', fontWeight: 'medium'}}>
                                        {satelliteData['position']['az'] ? satelliteData['position']['az'].toFixed(4) : "n/a"}°
                                    </Typography>
                                </Box>
                            </Stack>
                        </Grid>

                        {/* Second Column */}
                        <Grid>
                            <Stack spacing={1.5}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Elevation</Typography>
                                    <Typography variant="body1" sx={{fontFamily: 'monospace', fontWeight: 'medium'}}>
                                        {satelliteData['position']['el'] ? satelliteData['position']['el'].toFixed(4) : "n/a"}°
                                    </Typography>
                                </Box>

                                <Box>
                                    <Typography variant="caption" color="text.secondary">Altitude</Typography>
                                    <Typography variant="body1" sx={{fontFamily: 'monospace', fontWeight: 'medium'}}>
                                        {satelliteData['position']['alt'] ? (satelliteData['position']['alt'] / 1000).toFixed(2) : "n/a"} km
                                    </Typography>
                                </Box>

                                <Box>
                                    <Typography variant="caption" color="text.secondary">Velocity</Typography>
                                    <Typography variant="body1" sx={{fontFamily: 'monospace', fontWeight: 'medium'}}>
                                        {satelliteData['position']['vel'] ? satelliteData['position']['vel'].toFixed(2) : "n/a"} km/s
                                    </Typography>
                                </Box>
                            </Stack>
                        </Grid>
                    </Grid>

                    {/* Satellite Details Section */}
                    <Typography variant="subtitle1" sx={{
                        fontWeight: 'medium',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        pb: 0.5,
                        mb: 1.5,
                        mt: 1
                    }}>
                        Satellite Details
                    </Typography>

                    <Grid container spacing={2}>

                        <Grid>
                            <Stack spacing={1.5}>
                                <Box minWidth={90}>
                                    <Typography variant="caption" color="text.secondary">Geostationary</Typography>
                                    <Typography variant="body2" sx={{display: 'flex', alignItems: 'center'}}>
                                        {satelliteData['details']['is_geostationary'] ?
                                            <CheckCircleIcon color="success" fontSize="small" sx={{mr: 0.5}}/> :
                                            <CancelIcon color="error" fontSize="small" sx={{mr: 0.5}}/>
                                        }
                                        {satelliteData['details']['is_geostationary'] ? "Yes" : "No"}
                                    </Typography>
                                </Box>

                                <Box>
                                    <Typography variant="caption" color="text.secondary">Transmitters</Typography>
                                    <Typography variant="body2" sx={{display: 'flex', alignItems: 'center'}}>
                                        <SettingsRemoteIcon fontSize="small" sx={{mr: 0.5}}/>
                                        {satelliteData['transmitters'] ? satelliteData['transmitters'].length : "n/a"}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Grid>

                        <Grid>
                            <Stack spacing={1.5}>
                                <Box minWidth={90}>
                                    <Typography variant="caption" color="text.secondary">Launch Date</Typography>
                                    <Typography variant="caption" sx={{display: 'flex', alignItems: 'center'}}>
                                        {satelliteData['details']['launched'] ? humanizeDate(satelliteData['details']['launched']) : "n/a"}
                                    </Typography>
                                </Box>

                                <Box>
                                    <Typography variant="caption" color="text.secondary">Countries</Typography>
                                    <Box minWidth={90}>
                                        {satelliteData['details']['countries'] ? renderCountryFlagsCSV(satelliteData['details']['countries']) :
                                            <Typography variant="body2">n/a</Typography>}
                                    </Box>
                                </Box>
                            </Stack>
                        </Grid>

                        <Grid>
                            <Box spacing={1.5}>
                                <Typography variant="caption" color="text.secondary" sx={{mr: 1}}>Status:</Typography>
                                <div>
                                    {satelliteData['details']['status'] ? betterStatusValue(satelliteData['details']['status']) :
                                        <Typography variant="body2">n/a</Typography>
                                    }
                                </div>
                            </Box>
                        </Grid>

                    </Grid>
                </Box>
            </ThemedStackIsland>
        </>
    );
}


export default SatelliteInfoIsland;