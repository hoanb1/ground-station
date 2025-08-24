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
            return '#666666'; // Grey when no satellite selected
        }

        const elevation = satelliteData.position.el;

        if (elevation < 0) {
            return '#f44336'; // Red when satellite is below horizon
        } else if (elevation < 10) {
            return '#f57c00'; // Orange when satellite is low (0-10 degrees)
        } else if (isTrackingActive) {
            return '#62ec43'; // Bright green when actively tracking and above 10 degrees
        } else {
            return '#4fc3f7'; // Light blue when satellite is well above horizon (>10 degrees)
        }
    };

    // Get satellite status information
    const getSatelliteStatus = () => {
        if (!satelliteData.details.norad_id) {
            return {
                status: 'No Satellite',
                color: '#666666',
                backgroundColor: 'rgba(102, 102, 102, 0.1)',
                icon: <InfoIcon />,
                description: 'No satellite selected'
            };
        }

        const elevation = satelliteData.position.el;

        if (elevation < 0) {
            return {
                status: 'Below Horizon',
                color: '#f44336',
                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                icon: <VisibilityOffIcon />,
                description: 'Satellite is not visible from current location'
            };
        } else if (elevation < 10) {
            return {
                status: 'Low Elevation',
                color: '#f57c00',
                backgroundColor: 'rgba(245, 124, 0, 0.1)',
                icon: <TrendingDownIcon />,
                description: 'Satellite is visible but low on the horizon'
            };
        } else if (isTrackingActive) {
            return {
                status: 'Actively Tracking',
                color: '#62ec43',
                backgroundColor: 'rgba(98, 236, 67, 0.1)',
                icon: <SatelliteAltIcon />,
                description: 'Currently tracking this satellite'
            };
        } else {
            return {
                status: 'Visible',
                color: '#4fc3f7',
                backgroundColor: 'rgba(79, 195, 247, 0.1)',
                icon: <VisibilityIcon />,
                description: 'Satellite is well positioned above horizon'
            };
        }
    };

    // Get elevation color based on value
    const getElevationColor = (elevation) => {
        if (elevation < 0) return '#f44336'; // Red
        if (elevation < 10) return '#ff9800'; // Orange
        if (elevation < 45) return '#4fc3f7'; // Light blue
        return '#4caf50'; // Green
    };

    // Component for displaying numerical values with monospace font
    const NumericValue = ({ children, color }) => (
        <span style={{
            fontFamily: 'Monaco, Consolas, "Courier New", monospace',
            color: color || '#64b5f6',
            fontWeight: 'bold'
        }}>
            {children}
        </span>
    );

    const statusInfo = getSatelliteStatus();

    return (
        <>
            <Tooltip title={getTooltipText()}>
                <IconButton
                    ref={buttonRef}
                    onClick={handleClick}
                    size="small"
                    sx={{
                        width: 40,
                        color: getSatelliteIconColor(),
                        '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.08)'
                        },
                        '& svg': {
                            height: '75%',
                        }
                    }}
                >
                    <SatelliteAltIcon />
                </IconButton>
            </Tooltip>

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
                    border: '1px solid #424242',
                    p: 1,
                    minWidth: 320,
                    maxWidth: 350,
                    backgroundColor: '#1e1e1e',
                    color: '#ffffff',
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
                                    color: '#ffffff',
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
                                color: '#e0e0e0',
                                fontSize: '0.8rem'
                            }}>
                                {statusInfo.description}
                            </Typography>
                        </Box>
                        {satelliteData.details.norad_id && (
                            <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="body2" sx={{ color: '#e0e0e0', fontSize: '0.75rem' }}>
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
                                <Typography variant="subtitle2" sx={{ color: '#81c784', mb: 1, fontWeight: 'bold' }}>
                                    Basic Information
                                </Typography>
                                <Grid2 container spacing={1}>
                                    <Grid2 xs={6}>
                                        <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                            <strong>NORAD ID:</strong> <NumericValue color="#ffa726">{satelliteData.details.norad_id}</NumericValue>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 xs={6}>
                                        <Typography variant="body2" sx={{ color: '#e0e0e0', display: 'flex', alignItems: 'center' }}>
                                            <strong>Status:</strong>
                                            <Box sx={{ ml: 1 }}>
                                                {betterStatusValue(satelliteData.details.status)}
                                            </Box>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 xs={6}>
                                        <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                            <strong>Operator:</strong> <span style={{ color: '#90caf9' }}>{satelliteData.details.operator || 'N/A'}</span>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 xs={6}>
                                        <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                            <strong>Countries:</strong> <span style={{ color: '#90caf9' }}>{satelliteData.details.countries || 'N/A'}</span>
                                        </Typography>
                                    </Grid2>
                                </Grid2>
                            </Box>

                            <Divider sx={{ borderColor: '#424242', mb: 2 }} />

                            {/* Position Information */}
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: '#64b5f6', mb: 1, fontWeight: 'bold' }}>
                                    Current Position
                                </Typography>
                                <Grid2 container spacing={1}>
                                    <Grid2 xs={6}>
                                        <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                            <strong>Latitude:</strong> <NumericValue>{satelliteData.position.lat?.toFixed(4)}°</NumericValue>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 xs={6}>
                                        <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                            <strong>Longitude:</strong> <NumericValue>{satelliteData.position.lon?.toFixed(4)}°</NumericValue>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 xs={6}>
                                        <Typography variant="body2" sx={{color: '#e0e0e0'}}>
                                            <strong>Altitude:</strong> <NumericValue
                                            color="#a5d6a7">{(satelliteData.position.alt / 1000)?.toFixed(2)} km</NumericValue>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 xs={6}>
                                        <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                            <strong>Velocity:</strong> <NumericValue color="#ffcc02">{satelliteData.position.vel?.toFixed(2)} km/s</NumericValue>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 xs={6}>
                                        <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                            <strong>Azimuth:</strong> <NumericValue color="#ce93d8">{satelliteData.position.az?.toFixed(2)}°</NumericValue>
                                        </Typography>
                                    </Grid2>
                                </Grid2>
                            </Box>

                            <Divider sx={{ borderColor: '#424242', mb: 2 }} />

                            {/* Mission Information */}
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: '#ffb74d', mb: 1, fontWeight: 'bold' }}>
                                    Mission Information
                                </Typography>
                                <Grid2 container spacing={1}>
                                    <Grid2 xs={6}>
                                        <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                            <strong>Launched:</strong> <span style={{ color: '#81c784' }}>{formatDate(satelliteData.details.launched)}</span>
                                        </Typography>
                                    </Grid2>
                                    <Grid2 xs={6}>
                                        <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                            <strong>Deployed:</strong> <span style={{ color: '#81c784' }}>{formatDate(satelliteData.details.deployed)}</span>
                                        </Typography>
                                    </Grid2>
                                    {satelliteData.details.decayed && (
                                        <Grid2 xs={6}>
                                            <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                                <strong>Decayed:</strong> <span style={{ color: '#f48fb1' }}>{formatDate(satelliteData.details.decayed)}</span>
                                            </Typography>
                                        </Grid2>
                                    )}
                                    <Grid2 xs={12}>
                                        <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                            <strong>Geostationary:</strong> <span style={{ color: satelliteData.details.is_geostationary ? '#4caf50' : '#f44336' }}>{satelliteData.details.is_geostationary ? 'Yes' : 'No'}</span>
                                        </Typography>
                                    </Grid2>
                                </Grid2>
                            </Box>

                            {/* Website Link */}
                            {satelliteData.details.website && (
                                <Box sx={{ mt: 2, pt: 1, borderTop: '1px solid #424242' }}>
                                    <Typography variant="body2" sx={{ color: '#e0e0e0' }}>
                                        <strong>Website:</strong>
                                        <a
                                            href={satelliteData.details.website}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#64b5f6', marginLeft: 4, textDecoration: 'none' }}
                                        >
                                            {satelliteData.details.website}
                                        </a>
                                    </Typography>
                                </Box>
                            )}

                            {/* Satellite Info Page Button */}
                            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #424242' }}>
                                <Button
                                    variant="contained"
                                    fullWidth
                                    onClick={handleNavigateToSatelliteInfo}
                                    startIcon={<OpenInNewIcon />}
                                    sx={{
                                        backgroundColor: '#64b5f6',
                                        color: '#ffffff',
                                        '&:hover': {
                                            backgroundColor: '#42a5f5',
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
                            <InfoIcon sx={{ fontSize: 48, color: '#666', mb: 2 }} />
                            <Typography variant="body1" sx={{ color: '#888' }}>
                                No satellite data available
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#666', mt: 1 }}>
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