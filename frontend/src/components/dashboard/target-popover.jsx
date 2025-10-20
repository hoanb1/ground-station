
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

import * as React from "react";
import {
    Box,
    IconButton,
    Popover,
    Typography,
    Divider,
    Chip,
    Grid2,
    Button,
} from "@mui/material";
import { useState, useRef } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import Tooltip from "@mui/material/Tooltip";
import { useTranslation } from 'react-i18next';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import InfoIcon from '@mui/icons-material/Info';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { humanizeFrequency, formatLegibleDateTime, betterStatusValue } from "../common/common.jsx";

const SatelliteInfoPopover = () => {
    const buttonRef = useRef(null);
    const [anchorEl, setAnchorEl] = useState(null);
    const navigate = useNavigate();
    const { t } = useTranslation('dashboard');

    // Get satellite data from Redux store
    const { satelliteData, trackingState } = useSelector(state => state.targetSatTrack);

    const handleClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleNavigateToSatelliteInfo = () => {
        if (satelliteData.details.norad_id) {
            navigate(`/satellite/${satelliteData.details.norad_id}`);
            handleClose(); // Close the popover after navigation
        }
    };

    const open = Boolean(anchorEl);

    // Format date helper - use common function
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString();
    };

    const getTooltipText = () => {
        const satName = satelliteData.details.name || 'No satellite selected';
        if (!satelliteData.details.norad_id) {
            return `Satellite Info: ${satName}`;
        }

        const elevation = satelliteData.position.el;
        const visibilityText = elevation > 0 ? 'Visible' : 'Below horizon';

        return `Satellite Info: ${satName} (${visibilityText}, El: ${elevation?.toFixed(1)}°)`;
    };

    const isTrackingActive = trackingState.norad_id === satelliteData.details.norad_id;

    // Get icon color based on satellite visibility
    const getSatelliteIconColor = () => {
        if (!satelliteData.details.norad_id) {
            return 'text.secondary'; // Grey when no satellite selected
        }

        const elevation = satelliteData.position.el;

        if (elevation < 0) {
            return 'error.main'; // Red when satellite is below horizon
        } else if (elevation < 10) {
            return 'status.polling'; // Orange when satellite is low (0-10 degrees)
        } else if (isTrackingActive) {
            return 'success.main'; // Bright green when actively tracking and above 10 degrees
        } else {
            return 'info.main'; // Light blue when satellite is well above horizon (>10 degrees)
        }
    };

    // Get satellite status information
    const getSatelliteStatus = () => {
        if (!satelliteData.details.norad_id) {
            return {
                status: 'No Satellite',
                color: 'text.secondary',
                backgroundColor: 'action.hover',
                icon: <InfoIcon />,
                description: 'No satellite selected'
            };
        }

        const elevation = satelliteData.position.el;

        if (elevation < 0) {
            return {
                status: 'Below Horizon',
                color: 'error.main',
                backgroundColor: 'error.light',
                icon: <VisibilityOffIcon />,
                description: 'Satellite is not visible from current location'
            };
        } else if (elevation < 10) {
            return {
                status: 'Low Elevation',
                color: 'status.polling',
                backgroundColor: 'warning.light',
                icon: <TrendingDownIcon />,
                description: 'Satellite is visible but low on the horizon'
            };
        } else if (isTrackingActive) {
            return {
                status: 'Actively Tracking',
                color: 'success.main',
                backgroundColor: 'success.light',
                icon: <SatelliteAltIcon />,
                description: 'Currently tracking this satellite'
            };
        } else {
            return {
                status: 'Visible',
                color: 'info.main',
                backgroundColor: 'info.light',
                icon: <VisibilityIcon />,
                description: 'Satellite is well positioned above horizon'
            };
        }
    };

    // Get elevation color based on value
    const getElevationColor = (elevation) => {
        if (elevation < 0) return 'error.main'; // Red
        if (elevation < 10) return 'warning.main'; // Orange
        if (elevation < 45) return 'info.main'; // Light blue
        return 'success.main'; // Green
    };

    // Component for displaying numerical values with monospace font
    const NumericValue = ({ children, color }) => (
        <span style={{
            fontFamily: 'Monaco, Consolas, "Courier New", monospace',
            color: color || 'inherit',
            fontWeight: 'bold'
        }}>
            {children}
        </span>
    );

    const statusInfo = getSatelliteStatus();

    return (
        <>
            <Box sx={{ position: 'relative', display: 'inline-block' }}>
                <Tooltip title={getTooltipText()}>
                    <IconButton
                        ref={buttonRef}
                        onClick={handleClick}
                        size="small"
                        sx={{
                            width: 40,
                            color: getSatelliteIconColor(),
                            '&:hover': {
                                backgroundColor: 'overlay.light'
                            },
                            '& svg': {
                                height: '75%',
                            }
                        }}
                    >
                        <SatelliteAltIcon />
                    </IconButton>
                </Tooltip>

                {/* Elevation Overlay */}
                {satelliteData.details.norad_id && (
                    <Box
                        sx={{
                            position: 'absolute',
                            bottom: 5,
                            right: 6,
                            backgroundColor: 'overlay.dark',
                            border: `1px solid ${getElevationColor(satelliteData.position.el)}`,
                            borderRadius: '3px',
                            paddingLeft: 0.6,
                            paddingTop: 0.2,
                            minWidth: 22,
                            width: 30,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                            zIndex: 1
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{
                                color: getElevationColor(satelliteData.position.el),
                                fontSize: '0.65rem',
                                fontWeight: 'bold',
                                fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                                lineHeight: 1
                            }}
                        >
                            {satelliteData.position.el >= 0 ? '+' : ''}{satelliteData.position.el?.toFixed(0)}°
                        </Typography>
                    </Box>
                )}

            </Box>

            <Popover
                sx={{
                    '& .MuiPaper-root': {
                        borderRadius: 0,
                    }
                }}
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                <Box sx={{
                    borderRadius: 0,
                    border: '1px solid',
                    borderColor: 'border.main',
                    p: 1,
                    minWidth: 320,
                    maxWidth: 350,
                    backgroundColor: 'background.paper',
                    color: 'text.primary',
                }}>
                    {/* Status Banner with Satellite Name */}
                    <Box sx={{
                        mb: 2,
                        p: 1.5,
                        borderRadius: 1,
                        backgroundColor: statusInfo.backgroundColor,
                        border: `1px solid ${statusInfo.color}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                    }}>
                        <Box sx={{ flexGrow: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5, gap: 1 }}>
                                <Typography variant="h6" sx={{
                                    fontWeight: 'bold',
                                    color: 'text.primary',
                                    fontSize: '1.1rem'
                                }}>
                                    {satelliteData.details.name || 'No Satellite Selected'}
                                </Typography>
                            </Box>
                            <Typography variant="subtitle1" sx={{
                                color: statusInfo.color,
                                fontWeight: 'bold',
                                mb: 0.25,
                                fontSize: '0.9rem'
                            }}>
                                {statusInfo.status}
                            </Typography>
                            <Typography variant="body2" sx={{
                                color: 'text.secondary',
                                fontSize: '0.8rem'
                            }}>
                                {statusInfo.description}
                            </Typography>
                        </Box>
                        {satelliteData.details.norad_id && (
                            <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                                    Elevation
                                </Typography>
                                <Typography variant="h6" sx={{
                                    color: getElevationColor(satelliteData.position.el),
                                    fontWeight: 'bold',
                                    fontFamily: 'Monaco, Consolas, "Courier New", monospace'
                                }}>
                                    {satelliteData.position.el?.toFixed(1)}°
                                </Typography>
                            </Box>
                        )}
                    </Box>

                    {satelliteData.details.norad_id ? (
                        <>
                            {/* Basic Information */}
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: 'success.light', mb: 1, fontWeight: 'bold' }}>
                                    {t('target_popover.sections.basic_information')}
                                </Typography>
                                <Grid2 container spacing={1}>
                                    <Grid2 size={6}>
                                        <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                            <strong>{t('target_popover.norad_id')}</strong> <NumericValue color="warning.light">{satelliteData.details.norad_id}</NumericValue>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 size={6}>
                                        <Typography variant="body2" component="div" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
                                            <strong>{t('target_popover.status')}</strong>
                                            <Box sx={{ ml: 1 }}>
                                                {betterStatusValue(satelliteData.details.status)}
                                            </Box>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 size={6}>
                                        <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                            <strong>{t('target_popover.operator')}</strong> <span style={{ color: 'inherit' }}>{satelliteData.details.operator || t('target_popover.na')}</span>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 size={6}>
                                        <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                            <strong>{t('target_popover.countries')}</strong> <span style={{ color: 'inherit' }}>{satelliteData.details.countries || t('target_popover.na')}</span>
                                        </Typography>
                                    </Grid2>
                                </Grid2>
                            </Box>

                            <Divider sx={{ borderColor: 'border.main', mb: 2 }} />

                            {/* Position Information */}
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: 'info.light', mb: 1, fontWeight: 'bold' }}>
                                    {t('target_popover.sections.current_position')}
                                </Typography>
                                <Grid2 container spacing={1}>
                                    <Grid2 size={6}>
                                        <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                            <strong>{t('target_popover.latitude')}</strong> <NumericValue color="info.light">{satelliteData.position.lat?.toFixed(4)}°</NumericValue>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 size={6}>
                                        <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                            <strong>{t('target_popover.longitude')}</strong> <NumericValue color="info.light">{satelliteData.position.lon?.toFixed(4)}°</NumericValue>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 size={6}>
                                        <Typography variant="body2" component="div" sx={{color: 'text.secondary'}}>
                                            <strong>{t('target_popover.altitude')}</strong> <NumericValue
                                            color="success.light">{(satelliteData.position.alt / 1000)?.toFixed(2)} km</NumericValue>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 size={6}>
                                        <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                            <strong>{t('target_popover.velocity')}</strong> <NumericValue color="warning.light">{satelliteData.position.vel?.toFixed(2)} km/s</NumericValue>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 size={6}>
                                        <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                            <strong>{t('target_popover.azimuth')}</strong> <NumericValue color="secondary.light">{satelliteData.position.az?.toFixed(2)}°</NumericValue>
                                        </Typography>
                                    </Grid2>
                                </Grid2>
                            </Box>

                            <Divider sx={{ borderColor: 'border.main', mb: 2 }} />

                            {/* Mission Information */}
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: 'warning.light', mb: 1, fontWeight: 'bold' }}>
                                    {t('target_popover.sections.mission_information')}
                                </Typography>
                                <Grid2 container spacing={1}>
                                    <Grid2 size={6}>
                                        <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                            <strong>{t('target_popover.launched')}</strong> <span style={{ color: 'inherit' }}>{formatDate(satelliteData.details.launched)}</span>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 size={6}>
                                        <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                            <strong>{t('target_popover.deployed')}</strong> <span style={{ color: 'inherit' }}>{formatDate(satelliteData.details.deployed)}</span>
                                        </Typography>
                                    </Grid2>
                                    {satelliteData.details.decayed && (
                                        <Grid2 size={6}>
                                            <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                                <strong>{t('target_popover.decayed')}</strong> <span style={{ color: 'inherit' }}>{formatDate(satelliteData.details.decayed)}</span>
                                            </Typography>
                                        </Grid2>
                                    )}
                                    <Grid2 size={12}>
                                        <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                            <strong>{t('target_popover.geostationary')}</strong> <Box component="span" sx={{ color: satelliteData.details.is_geostationary ? 'success.main' : 'error.main' }}>{satelliteData.details.is_geostationary ? t('target_popover.yes') : t('target_popover.no')}</Box>
                                        </Typography>
                                    </Grid2>
                                </Grid2>
                            </Box>

                            {/* Website Link */}
                            {satelliteData.details.website && (
                                <Box sx={{ mt: 2, pt: 1, borderTop: '1px solid', borderColor: 'border.main' }}>
                                    <Typography variant="body2" component="div" sx={{ color: 'text.secondary' }}>
                                        <strong>{t('target_popover.website')}</strong>
                                        <Box
                                            component="a"
                                            href={satelliteData.details.website}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            sx={{ color: 'info.light', marginLeft: 0.5, textDecoration: 'none' }}
                                        >
                                            {satelliteData.details.website}
                                        </Box>
                                    </Typography>
                                </Box>
                            )}

                            {/* Satellite Info Page Button */}
                            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'border.main' }}>
                                <Button
                                    variant="contained"
                                    fullWidth
                                    onClick={handleNavigateToSatelliteInfo}
                                    startIcon={<OpenInNewIcon />}
                                    sx={{
                                        backgroundColor: 'info.main',
                                        color: 'text.primary',
                                        '&:hover': {
                                            backgroundColor: 'info.dark',
                                        },
                                        fontWeight: 'bold',
                                    }}
                                >
                                    View Detailed Info
                                </Button>
                            </Box>
                        </>
                    ) : (
                        <Box sx={{ textAlign: 'center', py: 3 }}>
                            <InfoIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                            <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                                No satellite data available
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.disabled', mt: 1 }}>
                                Select a satellite to view detailed information
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Popover>
        </>
    );
};

export default SatelliteInfoPopover;