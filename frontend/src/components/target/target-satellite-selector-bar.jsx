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

import React, { useCallback, useState, useEffect, useMemo } from "react";
import { Box, Typography, Chip, Tooltip, Button } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { useSocket } from "../common/socket.jsx";
import { useTranslation } from 'react-i18next';
import SatelliteSearchAutocomplete from "./satellite-search.jsx";
import GroupDropdown from "./group-dropdown.jsx";
import SatelliteList from "./satellite-dropdown.jsx";
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import GpsOffIcon from '@mui/icons-material/GpsOff';
import StopIcon from '@mui/icons-material/Stop';
import {
    setSatelliteId,
    setTrackingStateInBackend,
    setAvailableTransmitters,
} from './target-slice.jsx';

const TargetSatelliteSelectorBar = React.memo(function TargetSatelliteSelectorBar() {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const { t } = useTranslation('target');

    const {
        trackingState,
        selectedRadioRig,
        selectedRotator,
        selectedTransmitter,
        groupOfSats,
        satellitePasses,
        satelliteId,
        satelliteData,
        rigData,
        rotatorData,
    } = useSelector((state) => state.targetSatTrack);

    const selectedSatellitePositions = useSelector(state => state.overviewSatTrack.selectedSatellitePositions);

    const [countdown, setCountdown] = useState('');

    function getTransmittersForSatelliteId(satelliteId) {
        if (satelliteId && groupOfSats.length > 0) {
            const satellite = groupOfSats.find(s => s.norad_id === satelliteId);
            if (satellite) {
                return satellite.transmitters || [];
            } else {
                return [];
            }
        }
        return [];
    }

    const handleSatelliteSelect = useCallback((satellite) => {
        dispatch(setSatelliteId(satellite.norad_id));
        dispatch(setAvailableTransmitters(getTransmittersForSatelliteId(satellite.norad_id)));

        // set the tracking state in the backend to the new norad id and leave the state as is
        const data = {
            ...trackingState,
            norad_id: satellite.norad_id,
            group_id: satellite.groups[0].id,
            rig_id: selectedRadioRig,
            rotator_id: selectedRotator,
            transmitter_id: selectedTransmitter,
        };
        dispatch(setTrackingStateInBackend({ socket, data: data}));
    }, [dispatch, socket, trackingState, selectedRadioRig, selectedRotator, selectedTransmitter, groupOfSats]);

    const handleTrackingStop = useCallback(() => {
        const newTrackingState = {
            ...trackingState,
            'rotator_state': "stopped",
            'rig_state': "stopped",
        };
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}));
    }, [dispatch, socket, trackingState]);

    // Get current active pass or next upcoming pass
    const passInfo = useMemo(() => {
        if (!satellitePasses || satellitePasses.length === 0 || !satelliteId) return null;

        const now = new Date();

        // Find active pass
        const activePass = satellitePasses.find(pass => {
            if (pass.norad_id !== satelliteId) return false;
            const start = new Date(pass.event_start);
            const end = new Date(pass.event_end);
            return now >= start && now <= end;
        });

        if (activePass) {
            return { type: 'active', pass: activePass };
        }

        // Find next upcoming pass
        let nextPass = null;
        let earliestTime = null;

        for (const pass of satellitePasses) {
            if (pass.norad_id === satelliteId) {
                const startTime = new Date(pass.event_start);
                if (startTime > now) {
                    if (!nextPass || startTime < earliestTime) {
                        nextPass = pass;
                        earliestTime = startTime;
                    }
                }
            }
        }

        if (nextPass) {
            return { type: 'upcoming', pass: nextPass };
        }

        return null;
    }, [satellitePasses, satelliteId]);

    // Update countdown every second
    useEffect(() => {
        if (!passInfo) {
            setCountdown('');
            return;
        }

        const updateCountdown = () => {
            const now = new Date();
            const targetTime = passInfo.type === 'active'
                ? new Date(passInfo.pass.event_end)
                : new Date(passInfo.pass.event_start);

            const diff = targetTime - now;

            if (diff <= 0) {
                setCountdown('0s');
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            if (days > 0) {
                setCountdown(`${days}d ${hours}h ${minutes}m`);
            } else if (hours > 0) {
                setCountdown(`${hours}h ${minutes}m ${seconds}s`);
            } else if (minutes > 0) {
                setCountdown(`${minutes}m ${seconds}s`);
            } else {
                setCountdown(`${seconds}s`);
            }
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);

        return () => clearInterval(interval);
    }, [passInfo]);

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                gap: '16px',
                padding: '8px 12px',
                bgcolor: 'background.paper',
                borderBottom: '1px solid',
                borderColor: 'border.main',
                minHeight: { xs: 'auto', md: '64px' },
                height: { md: '64px' },
                maxHeight: { md: '64px' },
            }}
        >
            {/* Search field with autocomplete - full width on mobile, fixed width on desktop */}
            <Box sx={{
                width: { xs: '100%', md: 'auto' },
                minWidth: { md: 250 },
                maxWidth: { md: 350 },
                flexShrink: 1
            }}>
                <SatelliteSearchAutocomplete onSatelliteSelect={handleSatelliteSelect} />
            </Box>

            {/* Group and Satellite selectors - side by side on all screen sizes */}
            <Box sx={{
                display: 'flex',
                gap: '16px',
                flex: 1,
                minWidth: 0,
                flexWrap: { xs: 'nowrap', sm: 'nowrap' }
            }}>
                {/* Group selector dropdown */}
                <Box sx={{
                    minWidth: { xs: 120, sm: 150 },
                    maxWidth: { xs: '50%', md: 200 },
                    flex: 1
                }}>
                    <GroupDropdown />
                </Box>

                {/* Satellite selector dropdown */}
                <Box sx={{
                    minWidth: { xs: 120, sm: 180 },
                    maxWidth: { xs: '50%', md: 280 },
                    flex: 1
                }}>
                    <SatelliteList />
                </Box>
            </Box>

            {/* Combined dashboard - only show when there's enough room */}
            <Box
                sx={{
                    display: { xs: 'none', md: 'flex' },
                    alignItems: 'center',
                    gap: '8px',
                    ml: 'auto',
                    flexShrink: 0,
                }}
            >
                {/* Tracking status badge */}
                {satelliteId && (
                    <Tooltip title={rigData?.tracking || rotatorData?.tracking ? "Tracking active" : "Tracking stopped"}>
                        <Chip
                            icon={rigData?.tracking || rotatorData?.tracking ? <GpsFixedIcon /> : <GpsOffIcon />}
                            label={rigData?.tracking || rotatorData?.tracking ? "Tracking" : "Stopped"}
                            size="small"
                            sx={{
                                display: { xs: 'none', lg: 'flex' },
                                bgcolor: rigData?.tracking || rotatorData?.tracking ? 'success.main' : 'action.hover',
                                color: rigData?.tracking || rotatorData?.tracking ? 'white' : 'text.secondary',
                                fontWeight: 'bold',
                                '& .MuiChip-icon': {
                                    color: rigData?.tracking || rotatorData?.tracking ? 'white' : 'text.secondary',
                                }
                            }}
                        />
                    </Tooltip>
                )}

                {/* Current elevation with trend */}
                {satelliteId && satelliteData?.position && (
                    <Tooltip title={`Elevation: ${satelliteData.position.el?.toFixed(2)}°`}>
                        <Chip
                            icon={
                                selectedSatellitePositions?.[satelliteId]?.trend === 'rising' ? <TrendingUpIcon /> :
                                selectedSatellitePositions?.[satelliteId]?.trend === 'falling' ? <TrendingDownIcon /> :
                                selectedSatellitePositions?.[satelliteId]?.trend === 'peak' ? <HorizontalRuleIcon /> :
                                null
                            }
                            label={`El: ${satelliteData.position.el?.toFixed(1)}°`}
                            size="small"
                            sx={{
                                display: { xs: 'none', lg: 'flex' },
                                bgcolor: satelliteData.position.el < 0 ? 'action.hover' :
                                         satelliteData.position.el < 10 ? 'error.main' :
                                         satelliteData.position.el < 45 ? 'warning.main' : 'success.main',
                                color: satelliteData.position.el < 0 ? 'text.secondary' : 'white',
                                fontWeight: 'bold',
                                fontFamily: 'monospace',
                                '& .MuiChip-icon': {
                                    color: satelliteData.position.el < 0 ? 'text.secondary' :
                                           selectedSatellitePositions?.[satelliteId]?.trend === 'rising' ? 'info.light' :
                                           selectedSatellitePositions?.[satelliteId]?.trend === 'falling' ? 'error.light' :
                                           selectedSatellitePositions?.[satelliteId]?.trend === 'peak' ? 'warning.light' :
                                           'white',
                                }
                            }}
                        />
                    </Tooltip>
                )}

                {/* Pass countdown */}
                {passInfo && countdown && (
                    <Tooltip title={passInfo.type === 'active' ? 'Current pass ending' : 'Next pass starting'}>
                        <Chip
                            icon={passInfo.type === 'active' ? <AccessTimeIcon /> : <TrendingUpIcon />}
                            label={countdown}
                            size="small"
                            sx={{
                                display: { xs: 'none', lg: 'flex' },
                                bgcolor: passInfo.type === 'active' ? 'success.main' : 'info.main',
                                color: 'white',
                                fontWeight: 'bold',
                                fontFamily: 'monospace',
                                '& .MuiChip-icon': {
                                    color: 'white',
                                }
                            }}
                        />
                    </Tooltip>
                )}

                {/* Stop tracking button */}
                {satelliteId && (
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={<StopIcon />}
                        disabled={rigData?.tracking !== true && rotatorData?.tracking !== true}
                        onClick={handleTrackingStop}
                        sx={{
                            textTransform: 'none',
                            fontWeight: 'bold',
                            height: '40px',
                            minHeight: '40px',
                        }}
                    >
                        {t('satellite_selector.stop_tracking')}
                    </Button>
                )}
            </Box>
        </Box>
    );
});

export default TargetSatelliteSelectorBar;
