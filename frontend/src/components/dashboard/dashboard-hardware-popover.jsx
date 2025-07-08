/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
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

import Stack from "@mui/material/Stack";
import * as React from "react";
import {
    Box, IconButton,
} from "@mui/material";
import {useCallback, useEffect, useRef, useState} from "react";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import Tooltip from "@mui/material/Tooltip";
import RadioIcon from '@mui/icons-material/Radio';
import {
    Popover,
} from '@mui/material';
import ControllerTabs from "../common/controller.jsx";
import {SatelliteIcon} from "hugeicons-react";
import OverlayIcon from "./dashboard-icon-overlay.jsx";

// Import overlay icons
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SyncIcon from '@mui/icons-material/Sync';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import LocationSearchingIcon from '@mui/icons-material/LocationSearching';

const HardwareSettingsPopover = () => {
    const buttonRef = useRef(null);
    const [anchorEl, setAnchorEl] = useState(buttonRef.current);
    const [activeIcon, setActiveIcon] = useState(null);

    // Get rig and rotator data from Redux store
    const {rigData, rotatorData} = useSelector(state => state.targetSatTrack);

    const handleClick = (event, iconType) => {
        setAnchorEl(event.currentTarget);
        setActiveIcon(iconType);
    };

    const handleClose = () => {
        setAnchorEl(null);
        setActiveIcon(null);
    };

    const open = Boolean(anchorEl);

    // Determine colors based on connection and tracking status
    const getRigColor = () => {
        if (!rigData.connected) return '#c33124'; // Red for disconnected
        if (rigData.tracking) return '#62ec43'; // Blue for tracking
        return '#245326'; // Green for connected but not tracking
    };

    const getRotatorColor = () => {
        if (!rotatorData.connected) return '#c33124'; // Red for disconnected
        if (rotatorData.outofbounds) return "#853eda"; //
        if (rotatorData.minelevation) return "#e67a7a"; //
        if (rotatorData.slewing) return '#ff9800'; // Orange for slewing
        if (rotatorData.tracking) return '#62ec43'; // Light green for tracking
        return '#245326'; // Green for connected but not tracking
    };

    const getRigTooltip = () => {
        if (!rigData.connected) return 'Rig: Disconnected';
        if (rigData.tracking) return `Rig: Tracking (${rigData.frequency} Hz)`;
        return 'Rig: Connected';
    };

    const getRotatorTooltip = () => {
        if (!rotatorData.connected) return 'Rotator: Disconnected';
        if (rotatorData.tracking) return `Rotator: Tracking (Az: ${rotatorData.az}°, El: ${rotatorData.el}°)`;
        if (rotatorData.slewing) return `Rotator: Slewing (Az: ${rotatorData.az}°, El: ${rotatorData.el}°)`;
        return `Rotator: Connected (Az: ${rotatorData.az}°, El: ${rotatorData.el}°)`;
    };

    // Get overlay icon and color for rotator
    const getRotatorOverlay = () => {
        if (!rotatorData.connected) return {
            icon: CloseIcon,
            color: '#ffffff',
            badgeBackgroundColor: '#af2424',
            badgeBorderColor: "#ffffff"
        };
        if (rotatorData.outofbounds) return {
            icon: WarningIcon,
            color: '#ffffff',
            badgeBackgroundColor: '#da3e3e',
            badgeBorderColor: "#ffffff"
        };
        if (rotatorData.minelevation) return {
            icon: ArrowDownwardIcon,
            color: '#e81c2d',
            badgeBackgroundColor: '#ffffff',
            badgeBorderColor: "#e81c2d"
        };
        if (rotatorData.slewing) return {
            icon: SyncIcon,
            color: '#ffffff',
            badgeBackgroundColor: '#15490d',
            badgeBorderColor: "#15490d"
        };
        if (rotatorData.tracking) return {
            icon: LocationSearchingIcon,
            color: '#ffffff',
            badgeBackgroundColor: '#184068',
            badgeBorderColor: "#184068"
        };

        // No overlay for "connected" states
        return null;
    };

    // Get overlay icon and color for the rig
    const getRigOverlay = () => {
        if (!rigData.connected) return {
            icon: CloseIcon,
            color: '#ffffff',
            badgeBackgroundColor: '#af2424',
            badgeBorderColor: "#ffffff"
        };
        if (rigData.tracking) return {
            icon: LocationSearchingIcon,
            color: '#ffffff',
            badgeBackgroundColor: '#184068',
            badgeBorderColor: "#184068"
        };

        // No overlay for "connected" state
        return null;
    };

    const rotatorOverlay = getRotatorOverlay();
    const rigOverlay = getRigOverlay();

    return (<>
        <Stack direction="row" spacing={0}>
            <Tooltip title={getRotatorTooltip()}>
                <IconButton
                    onClick={(event) => handleClick(event, 'rotator')}
                    size="small"
                    sx={{
                        width: 40, color: getRotatorColor(), '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.08)'
                        }, '& svg': {
                            height: '100%',
                        }
                    }}
                >
                    <OverlayIcon
                        BaseIcon={SatelliteIcon}
                        OverlayIcon={rotatorOverlay?.icon}
                        overlayColor={rotatorOverlay?.color}
                        overlayPosition="bottom-right"
                        overlaySize={0.9}
                        fontSize="small"
                        badgeBackgroundColor={rotatorOverlay?.badgeBackgroundColor}
                        badgeBorderColor={rotatorOverlay?.badgeBorderColor}
                    />
                </IconButton>
            </Tooltip>
            <Tooltip title={getRigTooltip()}>
                <IconButton
                    ref={buttonRef}
                    onClick={(event) => handleClick(event, 'rig')}
                    size="small"
                    sx={{
                        width: 40, color: getRigColor(), '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.08)'
                        }, '& svg': {
                            height: '100%',
                        }
                    }}
                >
                    <OverlayIcon
                        BaseIcon={RadioIcon}
                        OverlayIcon={rigOverlay?.icon}
                        overlayColor={rigOverlay?.color}
                        overlayPosition="bottom-right"
                        overlaySize={0.9}
                        fontSize="small"
                        badgeBackgroundColor={rigOverlay?.badgeBackgroundColor}
                        badgeBorderColor={rigOverlay?.badgeBorderColor}
                    />
                </IconButton>
            </Tooltip>
        </Stack>
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
                vertical: 'bottom', horizontal: 'right',
            }}
            transformOrigin={{
                vertical: 'top', horizontal: 'right',
            }}
        >
            <Box sx={{
                borderRadius: 0,
                border: '1px solid #424242',
                p: 0,
                minWidth: 330,
                width: 330,
                backgroundColor: '#1e1e1e',
            }}>
                <ControllerTabs activeController={activeIcon}/>
            </Box>
        </Popover>
    </>);
};

export default HardwareSettingsPopover;