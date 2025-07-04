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
import {DashboardLayout, ThemeSwitcher} from "@toolpad/core/DashboardLayout";
import Typography from "@mui/material/Typography";
import PropTypes from "prop-types";
import * as React from "react";
import {Outlet} from "react-router";
import {
    Avatar,
    Backdrop,
    Box,
    Button,
    Divider,
    IconButton,
    ListItemIcon,
    ListItemText,
    MenuItem,
    MenuList
} from "@mui/material";
import {Account, AccountPopoverFooter, AccountPreview, SignOutButton} from "@toolpad/core";
import {GroundStationLogoGreenBlue, GSRetroLogo} from "../common/icons.jsx";
import {stringAvatar} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";
import BorderColorIcon from '@mui/icons-material/BorderColor';
import {useCallback, useEffect, useRef, useState} from "react";
import {handleSetGridEditableOverview as OverviewModeSetEditing} from '../overview/overview-sat-layout.jsx'
import {handleSetGridEditableTarget as TargetModeSetEditing} from '../target/target-sat-layout.jsx'
import {handleSetGridEditableWaterfall as WaterfallModeSetEditing} from '../waterfall/waterfall-layout.jsx';
import CheckIcon from '@mui/icons-material/Check';
import CircularProgress from "@mui/material/CircularProgress";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {setIsEditing} from "./dashboard-slice.jsx";
import WakeLockStatus from "./dashboard-wake-lock-status.jsx";
import Tooltip from "@mui/material/Tooltip";
import RadioIcon from '@mui/icons-material/Radio';
import LanIcon from '@mui/icons-material/Lan';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import { AudioProvider, useAudio } from "./dashboard-audio.jsx";
import {
    Popover,
    Slider,
    Switch,
    FormControlLabel
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import ControllerTabs from "../common/controller.jsx";
import {SatelliteIcon} from "hugeicons-react";


const SettingsPopover = () => {
    const [volume, setVolume] = useState(30);
    const buttonRef = useRef(null);
    const [anchorEl, setAnchorEl] = useState(buttonRef.current);
    const [activeIcon, setActiveIcon] = useState(null);

    // Get rig and rotator data from Redux store
    const { rigData, rotatorData } = useSelector(state => state.targetSatTrack);

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
        if (!rigData.connected) return '#6e1f19'; // Red for disconnected
        if (rigData.tracking) return '#62ec43'; // Blue for tracking
        return '#245326'; // Green for connected but not tracking
    };

    const getRotatorColor = () => {
        if (!rotatorData.connected) return '#6e1f19'; // Red for disconnected
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

    return (
        <>
            <Stack direction="row" spacing={0}>
                <Tooltip title={getRotatorTooltip()}>
                    <IconButton
                        onClick={(event) => handleClick(event, 'rotator')}
                        size="small"
                        sx={{
                            width: 40,
                            color: getRotatorColor(),
                            '&:hover': {
                                backgroundColor: 'rgba(255, 255, 255, 0.08)'
                            },
                            '& svg': {
                                height: '80%',
                            }
                        }}
                    >
                        <SatelliteIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Tooltip title={getRigTooltip()}>
                    <IconButton
                        ref={buttonRef}
                        onClick={(event) => handleClick(event, 'rig')}
                        size="small"
                        sx={{
                            width: 40,
                            color: getRigColor(),
                            '&:hover': {
                                backgroundColor: 'rgba(255, 255, 255, 0.08)'
                            },
                        }}
                    >
                        <RadioIcon fontSize="small" />
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
                    p: 0,
                    minWidth: 330,
                    width: 330,
                    backgroundColor: '#1e1e1e',
                }}>
                    <ControllerTabs activeController={activeIcon} />
                </Box>
            </Popover>
        </>
    );
};

function DashboardEditor() {
    const dispatch = useDispatch();
    const {isEditing} = useSelector(state => state.dashboard);

    const handleEditClick = () => {
        dispatch(setIsEditing(true));
        OverviewModeSetEditing(true);
        TargetModeSetEditing(true);
        WaterfallModeSetEditing(true);
    };

    const handleSaveClick = () => {
        dispatch(setIsEditing(false));
        OverviewModeSetEditing(false);
        TargetModeSetEditing(false);
        WaterfallModeSetEditing(false);
    };

    const handleCancelClick = () => {
        // Revert changes and exit edit mode
        setIsEditing(false);
    };

    return (
        <>
            {isEditing ? (
                <Stack direction="row" spacing={2}>
                    <Tooltip title="Done editing">
                        <IconButton size="small" onClick={handleSaveClick} sx={{
                            width: 40,
                        }}>
                            <CheckIcon color="success"/>
                        </IconButton>
                    </Tooltip>
                </Stack>
            ) : (
                <Tooltip title="Edit layout">
                    <IconButton size="small" onClick={handleEditClick} sx={{
                        width: 40,
                    }}>
                        <BorderColorIcon color="primary"/>
                    </IconButton>
                </Tooltip>
            )}
        </>
    );
}

function ConnectionStatus() {
    const socket = useSocket().socket;
    const [transportType, setTransportType] = useState('connecting...');

    useEffect(() => {
        const interval = setInterval(() => {
            if (socket.connected) {
                setTransportType(socket.io.engine.transport.name);
            } else {
                setTransportType('disconnected');
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [socket]);

    const getConnectionColor = () => {
        if (transportType === "websocket") return '#4caf50'; // Green for websocket
        if (transportType === "polling") return '#f57c00'; // Orange for polling
        return '#f44336'; // Red for disconnected
    };

    const getConnectionTooltip = () => {
        if (transportType === "websocket") return 'Network: Connected (WebSocket)';
        if (transportType === "polling") return 'Network: Connected (Polling)';
        if (transportType === 'connecting...') return 'Network: Connecting...';
        return 'Network: Disconnected';
    };

    return (
        <Tooltip title={getConnectionTooltip()}>
            <IconButton
                size="small"
                sx={{
                    width: 40,
                    color: getConnectionColor(),
                    '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.08)'
                    }
                }}
            >
                <LanIcon fontSize="small" />
            </IconButton>
        </Tooltip>
    );
}


function ToolbarActions() {
    return (
        <Stack direction="row" sx={{padding: "6px 0px 0px 0px"}}>
            <ConnectionStatus />
            <SettingsPopover />
            <WakeLockStatus />
            <DashboardEditor />
            <TimeDisplay />
            <ThemeSwitcher />
        </Stack>
    );
}

function SidebarFooter({ mini }) {
    return (
        <Typography variant="caption" sx={{ m: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {mini ? '© MUI' : `© ${new Date().getFullYear()} Made with love by MUI`}
        </Typography>
    );
}

SidebarFooter.propTypes = {
    mini: PropTypes.bool.isRequired,
};

function CustomAppTitle() {
    return (
        <Grid container direction="row">
            <Grid row={1} column={1} sx={{display: 'flex', alignItems: 'center'}}>
                <Stack direction="row" alignItems="center" spacing={2}>
                    <img src={GroundStationLogoGreenBlue} alt="Ground Station" width="32" height="32" />
                    <Box display={{xs: "none", sm: "block"}}>
                        <Typography variant="h6">Ground Station</Typography>
                    </Box>
                    <Box display={{xs: "block", sm: "none"}}>
                        <Typography variant="h6"></Typography>
                    </Box>
                </Stack>
            <Grid/>
            <Grid spacing={3} row={1} column={1}>
                <Grid container direction="row" spacing={4}>
                    <Grid>
                    </Grid>
                </Grid>
            </Grid>
            </Grid>
        </Grid>
    );
}

function AccountSidebarPreview(props) {
    const { handleClick, open, mini } = props;
    return (
        <Stack direction="column" p={0}>
            <Divider />
            <AccountPreview
                variant={mini ? 'condensed' : 'expanded'}
                handleClick={handleClick}
                open={open}
            />
        </Stack>
    );
}

AccountSidebarPreview.propTypes = {
    /**
     * The handler used when the preview is expanded
     */
    handleClick: PropTypes.func,
    mini: PropTypes.bool.isRequired,
    /**
     * The state of the Account popover
     * @default false
     */
    open: PropTypes.bool,
};

const accounts = [
    {
        id: 1,
        name: 'Efstratios Goudelis',
        email: 'sgoudelis@nerv.home',
        image: null,
        projects: [
            {
                id: 3,
                title: 'Project X',
            },
        ],
    }
];

function TimeDisplay() {
    const [isUTC, setIsUTC] = React.useState(false); // Toggle between UTC and Local Time
    const [currentTime, setCurrentTime] = React.useState(new Date());

    // Update the time every second
    React.useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval); // Cleanup on unmount
    }, []);

    // Format time based on whether it's UTC or local
    const formattedTime = isUTC
        ? currentTime.toUTCString().slice(17, 25) // Extract only the 24-hour time part
        : currentTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});

    const timeZoneAbbr = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' })
        .split(' ').pop();

    return (
        <Box
            onClick={() => setIsUTC(!isUTC)} // Toggle between UTC and Local Time on click
            sx={{
                cursor: "pointer",
                p: 1,
                paddingTop: 0,
                paddingBottom: 0,
                borderRadius: "4px",
                textAlign: "center",
                maxWidth: "100px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center"
            }}
        >
            <Typography variant="body2" sx={{fontWeight: "bold", fontFamily: "monospace"}}>
                {formattedTime}
            </Typography>
            <Typography variant="caption" sx={{fontSize: "0.65rem", fontFamily: "monospace", color: "#aaa"}}>
                {isUTC ? "UTC" : timeZoneAbbr}
            </Typography>
        </Box>
    );
}

function SidebarFooterAccountPopover() {
    return (
        <Stack direction="column">
            <Typography variant="body2" mx={2} mt={1}>
                Accounts
            </Typography>
            <MenuList>
                {accounts.map((account) => (
                    <MenuItem
                        key={account.id}
                        component="button"
                        sx={{
                            justifyContent: 'flex-start',
                            width: '100%',
                            columnGap: 2,
                        }}
                    >
                        <ListItemIcon>
                            <Avatar {...stringAvatar('My Name')} />
                        </ListItemIcon>
                        <ListItemText
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                width: '100%',
                            }}
                            primary={account.name}
                            secondary={account.email}
                        />
                    </MenuItem>
                ))}
            </MenuList>
            <Divider />
            <AccountPopoverFooter>
                <SignOutButton />
            </AccountPopoverFooter>
        </Stack>
    );
}

function SidebarFooterAccount({ mini }) {
    const PreviewComponent = React.useMemo(() => createPreviewComponent(mini), [mini]);
    return (
        <Account
            slots={{
                preview: PreviewComponent,
                popoverContent: SidebarFooterAccountPopover,
            }}
            slotProps={{
                popover: {
                    transformOrigin: { horizontal: 'left', vertical: 'bottom' },
                    anchorOrigin: { horizontal: 'right', vertical: 'bottom' },
                    disableAutoFocus: true,
                    slotProps: {
                        paper: {
                            elevation: 0,
                            sx: {
                                overflow: 'visible',
                                filter: (theme) =>
                                    `drop-shadow(0px 2px 8px ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.32)'})`,
                                mt: 1,
                                '&::before': {
                                    content: '""',
                                    display: 'block',
                                    position: 'absolute',
                                    bottom: 10,
                                    left: 0,
                                    width: 10,
                                    height: 10,
                                    bgcolor: 'background.paper',
                                    transform: 'translate(-50%, -50%) rotate(45deg)',
                                    zIndex: 0,
                                },
                            },
                        },
                    },
                },
            }}
        />
    );
}

SidebarFooterAccount.propTypes = {
    mini: PropTypes.bool.isRequired,
};

const createPreviewComponent = (mini) => {
    function PreviewComponent(props) {
        return <AccountSidebarPreview {...props} mini={mini} />;
    }
    return PreviewComponent;
};

export default function Layout() {
    const [ loading, setLoading ] = useState(true);
    const { socket } = useSocket();

    // Use the audio context
    const { initializeAudio, playAudioSamples, getAudioState } = useAudio();

    useEffect(() => {
        console.info('Initializing audio...');

        // Check if audio is enabled before trying to play
        const audioState = getAudioState();
        if (!audioState.enabled) {
            initializeAudio()
                .then(() => {
                    console.info('Audio initialized successfully');
                })
                .catch((error) => {
                    console.error('Error initializing audio', error);
                });
        }
    }, []);

    useEffect(() => {
        if (socket) {
            socket.on("connect", () => {
                setLoading(false);
            });

            socket.on("error", () => {
                setLoading(true);
            });

            socket.on("disconnect", () => {
                setLoading(true);
            });

            socket.on("audio-data", (data) => {
                playAudioSamples(data);
            });
        }

        return () => {
            if (socket) {
                socket.off("connect");
                socket.off("disconnect");
                socket.off("error");
                socket.off("audio-data");
            }
        };
    }, [socket]);
    
    return (
        <DashboardLayout
            sx={{
                '& .MuiToolbar-root': {
                    boxShadow: '4px 8px 8px rgba(0, 0, 0, 0.35)',
                },
            }}
            defaultSidebarCollapsed
            slots={{
                appTitle: CustomAppTitle,
                toolbarActions: ToolbarActions,
                toolbarAccount: () => {},
                //sidebarFooter: SidebarFooterAccount
                sidebarFooter: () => {}
        }}>
            {loading ? (
                <Backdrop open={loading}>
                    <CircularProgress color="inherit"/>
                </Backdrop>
            ) : (
                <Outlet/>
            )}
        </DashboardLayout>
    );
}
