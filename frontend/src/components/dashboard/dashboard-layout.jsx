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
import {GroundStationLogoGreenBlue} from "../common/icons.jsx";
import {stringAvatar} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";
import BorderColorIcon from '@mui/icons-material/BorderColor';
import {useCallback, useEffect, useRef, useState} from "react";
import {handleSetGridEditableOverview as OverviewModeSetEditing} from '../overview/main-layout.jsx'
import {handleSetGridEditableTarget as TargetModeSetEditing} from '../target/main-layout.jsx'
import {handleSetGridEditableWaterfall as WaterfallModeSetEditing} from '../waterfall/main-layout.jsx';
import CheckIcon from '@mui/icons-material/Check';
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {
    setIsEditing,
    setConnecting,
    setConnected,
    setReconnecting,
    setReConnectAttempt,
    setConnectionError,
} from "./dashboard-slice.jsx";
import WakeLockStatus from "./wake-lock-icon.jsx";
import ConnectionStatus from "./connection-popover.jsx";
import Tooltip from "@mui/material/Tooltip";
import { AudioProvider, useAudio } from "./audio-provider.jsx";
import HardwareSettingsPopover from "./hardware-popover.jsx";
import ConnectionOverlay from "./reconnecting-overlay.jsx";
import SatelliteInfoPopover from "./target-popover.jsx";
import VersionInfo from "./version-info.jsx";


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

function ToolbarActions() {
    return (
        <Stack direction="row" sx={{padding: "6px 0px 0px 0px"}}>
            <ConnectionStatus />
            <SatelliteInfoPopover />
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
                    <Box display={{xs: "none", sm: "block"}}>
                        <Box display="flex" alignItems="center" gap={1}>
                            <img src={GroundStationLogoGreenBlue} alt="Ground Station" width="30" height="30" />
                            <Typography variant="h6">Ground Station</Typography>
                            <VersionInfo minimal={true}/>
                        </Box>
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
        <Stack direction="column" sx={{
            pl: '0px',
            pr: '0px',
        }}>
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
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const {
        connecting,
        connected,
        disconnected,
        reConnectAttempt,
        connectionError,
    } = useSelector((state) => state.dashboard);

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
                // Fired upon a successful connection
                dispatch(setConnecting(false));
                dispatch(setConnected(true));
            });

            socket.on("error", (error) => {
                // Fired upon a connection error
                console.error('Socket error', error);
                dispatch(setConnectionError(error));
            });

            socket.on("disconnect", () => {
                dispatch(setConnecting(true));
                dispatch(setConnected(false));
            });

            socket.on('reconnect_attempt', (attemptNumber) => {
                // Fired upon an attempt to reconnect
                console.log(`Reconnection attempt #${attemptNumber}`);
                dispatch(setReConnectAttempt(attemptNumber));
            });

            // Track reconnection errors with delay info
            socket.on('reconnect_error', (error) => {
                // Fired upon a reconnection attempt error
                console.log('Reconnection failed:', error);
            });

            // Track successful reconnection
            socket.on('reconnect', (attemptNumber) => {
                // Fired upon a successful reconnection
                console.log(`Reconnected after ${attemptNumber} attempts`);
                dispatch(setConnecting(false));
                dispatch(setConnected(true));
            });

            // Track reconnection failure (when max attempts reached)
            socket.on('reconnect_failed', () => {
                // Fired when couldn't reconnect within reconnectionAttempts
                console.log('Reconnection failed - max attempts reached');
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
                socket.off('reconnect_attempt');
                socket.off('reconnect_error');
                socket.off('reconnect');
                socket.off('reconnect_failed');
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
            {connected? <Outlet />: <ConnectionOverlay />}
        </DashboardLayout>
    );
}
