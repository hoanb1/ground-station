
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

import {useSelector} from "react-redux";
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
    getBandColor
} from "../common/common.jsx";
import {
    Box,
    Typography,
    Stack,
    Chip,
    Divider
} from '@mui/material';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SettingsRemoteIcon from '@mui/icons-material/SettingsRemote';
import ExploreIcon from '@mui/icons-material/Explore';
import HeightIcon from '@mui/icons-material/Height';
import SpeedIcon from '@mui/icons-material/Speed';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import PublicIcon from '@mui/icons-material/Public';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import UpdateIcon from '@mui/icons-material/Update';
import Grid from "@mui/material/Grid2";
import React from "react";

const TargetSatelliteInfoIsland = () => {
    const {satelliteData, gridEditable} = useSelector((state) => state.targetSatTrack);

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

    const bands = satelliteData && satelliteData['transmitters']
        ? satelliteData['transmitters']
            .map(t => getFrequencyBand(t['downlink_low']))
            .filter((v, i, a) => a.indexOf(v) === i)
        : [];

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
                        <SatelliteAltIcon fontSize="small" sx={{mr: 1, color: 'secondary.light'}}/>
                        <Typography variant="subtitle2" sx={{fontWeight: 'bold'}}>
                            {satelliteData && satelliteData['details'] ? satelliteData['details']['name'] : "Satellite Info"}
                        </Typography>
                    </Box>
                    <Typography variant="caption" sx={{color: 'text.secondary'}}>
                        ID: {satelliteData && satelliteData['details'] ? satelliteData['details']['norad_id'] : ''}
                    </Typography>
                </Box>
            </TitleBar>

            {/* Satellite Status Header */}
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
                    <Grid container spacing={1}>
                        <Grid size={6}>
                            <Box sx={{ mb: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                    <SettingsRemoteIcon sx={{ fontSize: 14, mr: 0.5, color: '#ff9800' }} />
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium' }}>
                                        TRANSMITTERS
                                    </Typography>
                                </Box>
                                <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#ff9800' }}>
                                    {satelliteData && satelliteData['transmitters'] ? satelliteData['transmitters'].length : 'N/A'}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid size={6}>
                            <Box sx={{ mb: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                    {satelliteData && satelliteData['details'] && satelliteData['details']['is_geostationary'] ?
                                        <CheckCircleIcon sx={{ fontSize: 14, mr: 0.5, color: 'success.main' }} /> :
                                        <CancelIcon sx={{ fontSize: 14, mr: 0.5, color: 'error.main' }} />
                                    }
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium' }}>
                                        GEOSTATIONARY
                                    </Typography>
                                </Box>
                                <Typography variant="body1" sx={{
                                    fontWeight: 'bold',
                                    color: satelliteData && satelliteData['details'] && satelliteData['details']['is_geostationary'] ? 'success.main' : 'error.main'
                                }}>
                                    {satelliteData && satelliteData['details'] && satelliteData['details']['is_geostationary'] ? 'YES' : 'NO'}
                                </Typography>
                            </Box>
                        </Grid>
                    </Grid>

                    {bands.length > 0 && (
                        <Box sx={{ mt: 2 }}>
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
                    )}
                </Section>

                <Divider sx={{ my: 0, mb: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }} />

                {/* Metadata */}
                <Section title="METADATA" icon={PublicIcon}>
                    <Grid container spacing={1}>
                        <Grid size={6}>
                            <Box sx={{ mb: 0 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium', mb: 0.5, display: 'block' }}>
                                    LAUNCH DATE
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#ffcc02', fontWeight: 'bold' }}>
                                    {satelliteData && satelliteData['details'] && satelliteData['details']['launched'] ? humanizeDate(satelliteData['details']['launched']) : 'N/A'}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid size={6}>
                            <Box sx={{ mb: 0 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium', mb: 0.5, display: 'block' }}>
                                    COUNTRIES
                                </Typography>
                                <Box>
                                    {satelliteData && satelliteData['details'] && satelliteData['details']['countries'] ?
                                        renderCountryFlagsCSV(satelliteData['details']['countries']) :
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>N/A</Typography>
                                    }
                                </Box>
                            </Box>
                        </Grid>
                    </Grid>
                </Section>
            </Box>
        </Box>
    );
}

export default TargetSatelliteInfoIsland;