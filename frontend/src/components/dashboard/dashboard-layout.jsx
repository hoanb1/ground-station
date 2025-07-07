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
import HardwareSettingsPopover from "./dashboard-hardware-popover.jsx";


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
    const { socket, trafficStatsRef, forceUpdateStats } = useSocket();
    const [anchorEl, setAnchorEl] = useState(null);

    // Force update stats every second to get fresh data
    useEffect(() => {
        const interval = setInterval(()=>{
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const open = Boolean(anchorEl);

    // Memoize connection color based on transport name
    const connectionColor = React.useMemo(() => {
        if (trafficStatsRef.current.transport.name === "websocket") return '#4caf50';
        if (trafficStatsRef.current.transport.name === "polling") return '#f57c00';
        if (trafficStatsRef.current.transport.name === "connecting..." || trafficStatsRef.current.transport.name === "unknown") return '#ff9800';
        if (trafficStatsRef.current.transport.name === "disconnected") return '#f44336';
        return '#f44336';
    }, [trafficStatsRef.current.transport.name]);

    // Memoize connection tooltip
    const connectionTooltip = React.useMemo(() => {
        if (trafficStatsRef.current.transport.name === "websocket") return 'Network: Connected (WebSocket)';
        if (trafficStatsRef.current.transport.name === "polling") return 'Network: Connected (Polling)';
        if (trafficStatsRef.current.transport.name === 'connecting...' || trafficStatsRef.current.transport.name === "unknown") return 'Network: Connecting...';
        if (trafficStatsRef.current.transport.name === "disconnected") return 'Network: Disconnected';
        return 'Network: Unknown';
    }, [trafficStatsRef.current.transport.name]);

    const formatBytes = useCallback((bytes) => {
        if (bytes === 0) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }, []);

    const formatTotalBytes = useCallback((bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }, []);

    const formatDuration = useCallback((milliseconds) => {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }, []);

    return (
        <>
            <Tooltip title={connectionTooltip}>
                <IconButton
                    size="small"
                    onClick={handleClick}
                    sx={{
                        width: 40,
                        color: connectionColor,
                        '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.08)'
                        }
                    }}
                >
                    <LanIcon fontSize="small" />
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
                    p: 2,
                    minWidth: 250,
                    width: 250,
                    backgroundColor: '#1e1e1e',
                }}>
                    <Typography variant="h6" sx={{ mb: 2, color: '#fff' }}>
                        Network Statistics
                    </Typography>

                    <Box sx={{ mb: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Connection Status
                        </Typography>
                        <Grid container spacing={2}>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    Transport:
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: connectionColor }}>
                                    {trafficStatsRef.current.transport.name.toUpperCase()}
                                </Typography>
                            </Grid>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    Duration:
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#fff' }}>
                                    {formatDuration(trafficStatsRef.current.session.duration)}
                                </Typography>
                            </Grid>
                        </Grid>

                        {trafficStatsRef.current.manager.reconnecting && (
                            <Typography variant="caption" sx={{ color: '#ff9800', fontFamily: 'monospace', mt: 1, display: 'block' }}>
                                Reconnecting... (Attempt: {trafficStatsRef.current.manager.reconnectAttempts})
                            </Typography>
                        )}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Box sx={{ mb: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Current Traffic Rate
                        </Typography>
                        <Grid container spacing={2}>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    Upload:
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#4caf50' }}>
                                    {formatBytes(trafficStatsRef.current.rates.bytesPerSecond.sent)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {trafficStatsRef.current.rates.packetsPerSecond.sent} msgs/s
                                </Typography>
                            </Grid>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    Download:
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#2196f3' }}>
                                    {formatBytes(trafficStatsRef.current.rates.bytesPerSecond.received)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {trafficStatsRef.current.rates.packetsPerSecond.received} msgs/s
                                </Typography>
                            </Grid>
                        </Grid>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Application Level (Session Total)
                        </Typography>
                        <Grid container spacing={2}>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    Sent:
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#4caf50' }}>
                                    {formatTotalBytes(trafficStatsRef.current.engine.bytesSent)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {trafficStatsRef.current.engine.packetsSent} messages
                                </Typography>
                            </Grid>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    Received:
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#2196f3' }}>
                                    {formatTotalBytes(trafficStatsRef.current.engine.bytesReceived)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {trafficStatsRef.current.engine.packetsReceived} messages
                                </Typography>
                            </Grid>
                        </Grid>

                        {trafficStatsRef.current.engine.upgradeAttempts > 0 && (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                    Transport Upgrades:
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#fff', fontFamily: 'monospace', ml: 1 }}>
                                    {trafficStatsRef.current.engine.upgradeAttempts}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Box>
            </Popover>
        </>
    );
}

function ToolbarActions() {
    return (
        <Stack direction="row" sx={{padding: "6px 0px 0px 0px"}}>
            <ConnectionStatus />
            <HardwareSettingsPopover />
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
