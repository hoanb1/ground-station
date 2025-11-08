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

import { useSelector } from "react-redux";
import { useTranslation } from 'react-i18next';
import {
    getClassNamesBasedOnGridEditing,
    TitleBar,
    getFrequencyBand,
    getBandColor
} from "../common/common.jsx";
import {
    Box,
    Typography,
    Chip,
    Divider
} from '@mui/material';
import RadioIcon from '@mui/icons-material/Radio';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import SettingsRemoteIcon from '@mui/icons-material/SettingsRemote';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import Grid from "@mui/material/Grid2";
import React from "react";

const TargetSatelliteTransmittersIsland = () => {
    const { t } = useTranslation('target');
    const { satelliteData, gridEditable } = useSelector((state) => state.targetSatTrack);

    const TransmitterRow = ({ transmitter, index }) => (
        <Box sx={{
            py: 1,
            px: 1.5,
            mb: 1,
            bgcolor: 'overlay.light',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'border.main'
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main', flex: 1 }}>
                    {transmitter.description}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                        label={transmitter.status}
                        size="small"
                        color={transmitter.status === 'active' ? 'success' : 'default'}
                        sx={{ height: 18, fontSize: '0.65rem' }}
                    />
                    <Box sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: transmitter.alive ? 'success.main' : 'error.main'
                    }} />
                </Box>
            </Box>

            <Grid container spacing={1}>
                <Grid size={4}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {t('satellite_transmitters.labels.downlink')}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#4fc3f7' }}>
                        {transmitter.downlink_low ? `${(transmitter.downlink_low / 1e6).toFixed(3)} MHz` : t('satellite_info.values.na')}
                    </Typography>
                </Grid>
                <Grid size={3}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {t('satellite_transmitters.labels.mode')}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#81c784' }}>
                        {transmitter.mode}
                    </Typography>
                </Grid>
                <Grid size={3}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {t('satellite_transmitters.labels.baud')}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#ffb74d' }}>
                        {transmitter.baud ? `${transmitter.baud}` : t('satellite_info.values.na')}
                    </Typography>
                </Grid>
                <Grid size={2}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {t('satellite_transmitters.labels.band')}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#ba68c8' }}>
                        {transmitter.downlink_low ? getFrequencyBand(transmitter.downlink_low) : t('satellite_info.values.na')}
                    </Typography>
                </Grid>
            </Grid>

            {transmitter.frequency_violation && (
                <Box sx={{
                    mt: 0.5,
                    p: 0.5,
                    bgcolor: (theme) => `${theme.palette.error.main}1A`,
                    borderRadius: 0.5
                }}>
                    <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                        {t('satellite_transmitters.messages.frequency_violation')}
                    </Typography>
                </Box>
            )}
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
                        <Typography variant="subtitle2" sx={{fontWeight: 'bold'}}>
                            {t('satellite_transmitters.title')}
                        </Typography>
                    </Box>
                    <Typography variant="caption" sx={{color: 'text.secondary'}}>
                        {t('satellite_transmitters.count')}: {satelliteData && satelliteData['transmitters'] ? satelliteData['transmitters'].length : '0'}
                    </Typography>
                </Box>
            </TitleBar>

            {/* Main Content */}
            <Box sx={{ pr: 2, pl: 2, pt: 1, flex: 1, overflow: 'auto' }}>

                {/* Communication Overview */}
                <Section title={t('satellite_transmitters.sections.communication_overview')} icon={SettingsInputAntennaIcon}>
                    <Grid container spacing={1}>
                        <Grid size={4}>
                            <Box sx={{ mb: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                    <SettingsRemoteIcon sx={{ fontSize: 14, mr: 0.5, color: 'warning.main' }} />
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium' }}>
                                        {t('satellite_transmitters.labels.total')}
                                    </Typography>
                                </Box>
                                <Typography variant="body1" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                                    {satelliteData && satelliteData['transmitters'] ? satelliteData['transmitters'].length : t('satellite_info.values.na')}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid size={4}>
                            <Box sx={{ mb: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                    <SignalCellularAltIcon sx={{ fontSize: 14, mr: 0.5, color: 'success.main' }} />
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium' }}>
                                        {t('satellite_transmitters.labels.active')}
                                    </Typography>
                                </Box>
                                <Typography variant="body1" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                                    {satelliteData && satelliteData['transmitters'] ?
                                        satelliteData['transmitters'].filter(t => t.alive && t.status === 'active').length : t('satellite_info.values.na')}
                                </Typography>
                            </Box>
                        </Grid>
                        <Grid size={4}>
                            <Box sx={{ mb: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                    <SignalCellularAltIcon sx={{ fontSize: 14, mr: 0.5, color: 'error.main' }} />
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium' }}>
                                        {t('satellite_transmitters.labels.inactive')}
                                    </Typography>
                                </Box>
                                <Typography variant="body1" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                                    {satelliteData && satelliteData['transmitters'] ?
                                        satelliteData['transmitters'].filter(t => !t.alive || t.status !== 'active').length : t('satellite_info.values.na')}
                                </Typography>
                            </Box>
                        </Grid>
                    </Grid>

                    {bands.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium', mb: 1, display: 'block' }}>
                                {t('satellite_transmitters.labels.frequency_bands')}
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

                <Divider sx={{ my: 0, mb: 1, borderColor: 'border.main' }} />

                {/* Detailed Transmitters */}
                {satelliteData && satelliteData['transmitters'] && satelliteData['transmitters'].length > 0 ? (
                    <Section title={t('satellite_transmitters.sections.transmitter_details')} icon={RadioIcon}>
                        <Box sx={{ maxHeight: '100%', overflowY: 'auto' }}>
                            {satelliteData['transmitters'].map((transmitter, index) => (
                                <TransmitterRow key={transmitter.id || index} transmitter={transmitter} index={index} />
                            ))}
                        </Box>
                    </Section>
                ) : (
                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        height: '100%',
                        py: 4
                    }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                            {t('satellite_transmitters.messages.no_transmitters')}
                        </Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
}

export default TargetSatelliteTransmittersIsland;