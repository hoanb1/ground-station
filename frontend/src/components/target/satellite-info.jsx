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
import { useTranslation } from 'react-i18next';
import {
    betterStatusValue,
    getClassNamesBasedOnGridEditing,
    humanizeAltitude,
    humanizeDate,
    humanizeLatitude,
    humanizeLongitude,
    humanizeVelocity,
    renderCountryFlagsCSV,
    TitleBar
} from "../common/common.jsx";
import {
    Box,
    Typography,
    Divider,
    IconButton,
    Tooltip,
    Avatar,
    Button
} from '@mui/material';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ExploreIcon from '@mui/icons-material/Explore';
import HeightIcon from '@mui/icons-material/Height';
import SpeedIcon from '@mui/icons-material/Speed';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import PublicIcon from '@mui/icons-material/Public';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import UpdateIcon from '@mui/icons-material/Update';
import BusinessIcon from '@mui/icons-material/Business';
import LaunchIcon from '@mui/icons-material/Launch';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Grid from "@mui/material/Grid2";
import React from "react";
import { Link } from "react-router-dom";

const TargetSatelliteInfoIsland = () => {
    const { t } = useTranslation('target');
    const { satelliteData, gridEditable } = useSelector((state) => state.targetSatTrack);

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
            bgcolor: 'background.paper',
            backdropFilter: 'blur(10px)',
            backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))'
        }}>
            {/* Header */}
            <TitleBar
                className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}
                sx={{
                    bgcolor: 'background.default',
                    borderBottom: '1px solid',
                    borderColor: 'border.main',
                    backdropFilter: 'blur(10px)'
                }}
            >
                <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                    <Box sx={{display: 'flex', alignItems: 'center'}}>
                        <SatelliteAltIcon fontSize="small" sx={{mr: 1, color: 'secondary.light'}}/>
                        <Typography variant="subtitle2" sx={{fontWeight: 'bold'}}>
                            {t('satellite_info.title')}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{color: 'text.secondary'}}>
                            ID: {satelliteData && satelliteData['details'] ? satelliteData['details']['norad_id'] : ''}
                        </Typography>
                    </Box>
                </Box>
            </TitleBar>

            {/* Satellite Status Header */}
            <Box sx={{
                p: 1,
                background: (theme) => `linear-gradient(135deg, ${theme.palette.overlay.light} 0%, ${theme.palette.overlay.light} 100%)`,
                borderBottom: '1px solid',
                borderColor: 'border.main'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Avatar
                        sx={{
                            width: 12,
                            height: 12,
                            mr: 1.5,
                            bgcolor: satelliteData && satelliteData['details'] && satelliteData['details']['status'] === 'alive' ? 'success.main' : 'warning.main',
                            boxShadow: (theme) => `0 0 8px ${satelliteData && satelliteData['details'] && satelliteData['details']['status'] === 'alive' ? theme.palette.success.main : theme.palette.warning.main}40`
                        }}
                    />
                    <Typography variant="h6" sx={{ fontWeight: 'bold', flex: 1 }}>
                        {satelliteData && satelliteData['details'] ? satelliteData['details']['name'] : "- - - - - - - - - - -"}
                    </Typography>
                    {satelliteData && satelliteData['details'] && betterStatusValue(satelliteData['details']['status'])}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                        <RocketLaunchIcon sx={{ fontSize: 12, mr: 0.5 }} />
                        NORAD: {satelliteData && satelliteData['details'] ? satelliteData['details']['norad_id'] : ''}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                        <UpdateIcon sx={{ fontSize: 12, mr: 0.5 }} />
                        {satelliteData && satelliteData['details'] ? humanizeDate(satelliteData['details']['updated']) : ''}
                    </Typography>
                    {satelliteData && satelliteData['details'] && satelliteData['details']['operator'] && satelliteData['details']['operator'] !== 'None' && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                            <BusinessIcon sx={{ fontSize: 12, mr: 0.5 }} />
                            {satelliteData['details']['operator']}
                        </Typography>
                    )}
                </Box>
            </Box>

            {/* Main Content */}
            <Box sx={{ pr: 2, pl: 2, pt: 1, flex: 1, overflow: 'auto' }}>

                {/* Position Data */}
                <Section title={t('satellite_info.sections.position_data')} icon={ExploreIcon}>
                    <Grid container spacing={1}>
                        <Grid size={6}>
                            <DataPoint
                                icon={({ sx }) => <Box sx={{ ...sx, width: 6, height: 6, borderRadius: '50%', bgcolor: '#4fc3f7' }} />}
                                label={t('satellite_info.labels.latitude')}
                                value={satelliteData && satelliteData['position'] ? humanizeLatitude(satelliteData['position']['lat']) : t('satellite_info.values.na')}
                                color="#4fc3f7"
                            />
                        </Grid>
                        <Grid size={6}>
                            <DataPoint
                                icon={({ sx }) => <Box sx={{ ...sx, width: 6, height: 6, borderRadius: '50%', bgcolor: '#81c784' }} />}
                                label={t('satellite_info.labels.longitude')}
                                value={satelliteData && satelliteData['position'] ? humanizeLongitude(satelliteData['position']['lon']) : t('satellite_info.values.na')}
                                color="#81c784"
                            />
                        </Grid>
                        <Grid size={6}>
                            <DataPoint
                                icon={MyLocationIcon}
                                label={t('satellite_info.labels.azimuth')}
                                value={satelliteData && satelliteData['position'] && satelliteData['position']['az'] ? `${satelliteData['position']['az'].toFixed(1)}°` : t('satellite_info.values.na')}
                                color="#ffb74d"
                            />
                        </Grid>
                        <Grid size={6}>
                            <DataPoint
                                icon={HeightIcon}
                                label={t('satellite_info.labels.elevation')}
                                value={satelliteData && satelliteData['position'] && satelliteData['position']['el'] ? `${satelliteData['position']['el'].toFixed(1)}°` : t('satellite_info.values.na')}
                                color="#e57373"
                            />
                        </Grid>
                    </Grid>
                </Section>

                <Divider sx={{ my: 0, mb: 1, borderColor: 'border.main' }} />

                {/* Orbital Data */}
                <Section title={t('satellite_info.sections.orbital_data')} icon={SpeedIcon}>
                    <Grid container spacing={1}>
                        <Grid size={6}>
                            <DataPoint
                                icon={HeightIcon}
                                label={t('satellite_info.labels.altitude')}
                                value={satelliteData && satelliteData['position'] ? humanizeAltitude(satelliteData['position']['alt'], 0) : t('satellite_info.values.na')}
                                color="#ba68c8"
                                unit="km"
                            />
                        </Grid>
                        <Grid size={6}>
                            <DataPoint
                                icon={SpeedIcon}
                                label={t('satellite_info.labels.velocity')}
                                value={satelliteData && satelliteData['position'] ? humanizeVelocity(satelliteData['position']['vel']) : t('satellite_info.values.na')}
                                color="#4db6ac"
                                unit="km/s"
                            />
                        </Grid>
                        <Grid size={6}>
                            <Box sx={{ mb: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                    {satelliteData && satelliteData['details'] && satelliteData['details']['is_geostationary'] ?
                                        <CheckCircleIcon sx={{ fontSize: 14, mr: 0.5, color: 'success.main' }} /> :
                                        <CancelIcon sx={{ fontSize: 14, mr: 0.5, color: 'error.main' }} />
                                    }
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium' }}>
                                        {t('satellite_info.labels.geostationary')}
                                    </Typography>
                                </Box>
                                <Typography variant="body1" sx={{
                                    fontWeight: 'bold',
                                    color: satelliteData && satelliteData['details'] && satelliteData['details']['is_geostationary'] ? 'success.main' : 'error.main'
                                }}>
                                    {satelliteData && satelliteData['details'] && satelliteData['details']['is_geostationary'] ? t('satellite_info.values.yes') : t('satellite_info.values.no')}
                                </Typography>
                            </Box>
                        </Grid>
                    </Grid>
                </Section>

                <Divider sx={{ my: 0, mb: 1, borderColor: 'border.main' }} />

                {/* Metadata */}
                <Section title={t('satellite_info.sections.metadata')} icon={PublicIcon}>
                    <Grid container spacing={1}>
                        <Grid size={6}>
                            <Box sx={{ mb: 0 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium', mb: 0.5, display: 'block' }}>
                                    {t('satellite_info.labels.launch_date')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                                    {satelliteData && satelliteData['details'] && satelliteData['details']['launched'] ? humanizeDate(satelliteData['details']['launched']) : t('satellite_info.values.na')}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid size={6}>
                            <Box sx={{ mb: 0 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium', mb: 0.5, display: 'block' }}>
                                    {t('satellite_info.labels.countries')}
                                </Typography>
                                <Box>
                                    {satelliteData && satelliteData['details'] && satelliteData['details']['countries'] ?
                                        renderCountryFlagsCSV(satelliteData['details']['countries']) :
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('satellite_info.values.na')}</Typography>
                                    }
                                </Box>
                            </Box>
                        </Grid>
                    </Grid>

                    {/* Additional metadata */}
                    {satelliteData && satelliteData['details'] && (
                        <Box sx={{ mt: 2 }}>
                            <Grid container spacing={1}>
                                <Grid size={6}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium', mb: 0.5, display: 'block' }}>
                                        {t('satellite_info.labels.satellite_id')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 'bold', fontSize: '0.8rem' }}>
                                        {satelliteData['details']['sat_id'] || t('satellite_info.values.na')}
                                    </Typography>
                                </Grid>
                                <Grid size={6}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium', mb: 0.5, display: 'block' }}>
                                        {t('satellite_info.labels.added_to_db')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 'bold' }}>
                                        {satelliteData['details']['added'] ? humanizeDate(satelliteData['details']['added']) : t('satellite_info.values.na')}
                                    </Typography>
                                </Grid>
                            </Grid>

                            {satelliteData['details']['alternative_name'] && (
                                <Box sx={{ mt: 1 }}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium', mb: 0.5, display: 'block' }}>
                                        {t('satellite_info.labels.alternative_name')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 'bold' }}>
                                        {satelliteData['details']['alternative_name']}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    )}
                </Section>
            </Box>

            {/* Link to detailed satellite page */}
            {satelliteData && satelliteData['details'] && (
                <Box sx={{
                    p: 2,
                    borderTop: '1px solid',
                    borderColor: 'border.main',
                    bgcolor: 'background.default'
                }}>
                    <Button
                        component={Link}
                        to={`/satellite/${satelliteData['details']['norad_id']}`}
                        variant="outlined"
                        size="small"
                        fullWidth
                        startIcon={<OpenInNewIcon />}
                        sx={{
                            color: 'secondary.light',
                            borderColor: 'secondary.main',
                            '&:hover': {
                                borderColor: 'secondary.light',
                                bgcolor: 'overlay.light'
                            }
                        }}
                    >
                        View Detailed Information
                    </Button>
                </Box>
            )}
        </Box>
    );
}

export default TargetSatelliteInfoIsland;