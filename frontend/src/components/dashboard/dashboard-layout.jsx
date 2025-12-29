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
import {ThemeSwitcher} from "@toolpad/core/DashboardLayout";
import Typography from "@mui/material/Typography";
import PropTypes from "prop-types";
import * as React from "react";
import {Outlet, useNavigate, useLocation} from "react-router";
import {
    AppBar,
    Avatar,
    Backdrop,
    Box,
    Button,
    CssBaseline,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    MenuItem,
    MenuList,
    Toolbar,
    useTheme,
    styled
} from "@mui/material";
import {Account, AccountPopoverFooter, AccountPreview, SignOutButton} from "@toolpad/core";
import {GroundStationLogoGreenBlue} from "../common/dataurl-icons.jsx";
import {stringAvatar} from "../common/common.jsx";
import Grid from "@mui/material/Grid";
import BorderColorIcon from '@mui/icons-material/BorderColor';
import {useCallback, useEffect, useRef, useState} from "react";
import {handleSetGridEditableOverview as OverviewModeSetEditing} from '../overview/main-layout.jsx'
import {handleSetGridEditableTarget as TargetModeSetEditing} from '../target/main-layout.jsx'
import {handleSetGridEditableWaterfall as WaterfallModeSetEditing} from '../waterfall/main-layout.jsx';
import CheckIcon from '@mui/icons-material/Check';
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import { useTranslation } from 'react-i18next';
import { setIsEditing } from "./dashboard-slice.jsx";
import { addStreamingVFO, removeStreamingVFO } from "../waterfall/vfo-marker/vfo-slice.jsx";
import WakeLockStatus from "./wake-lock-icon.jsx";
import ConnectionStatus from "./connection-popover.jsx";
import Tooltip from "@mui/material/Tooltip";
import { AudioProvider, useAudio } from "./audio-provider.jsx";
import HardwareSettingsPopover from "./hardware-popover.jsx";
import ConnectionOverlay from "./reconnecting-overlay.jsx";
import SatelliteInfoPopover from "./target-popover.jsx";
import VersionInfo from "./version-info.jsx";
import VersionUpdateOverlay from "./version-update-overlay.jsx";
import SatelliteSyncPopover from "./tlesync-popover.jsx";
import PerformanceMetricsDialog from "../performance/performance-metrics-dialog.jsx";
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import {getNavigation} from "../../config/navigation.jsx";

// Drawer widths
const drawerWidthExpanded = 240;
const drawerWidthCollapsed = 56;

// Styled components
const openedMixin = (theme) => ({
    width: drawerWidthExpanded,
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
    }),
    overflowX: 'hidden',
});

const closedMixin = (theme) => ({
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    overflowX: 'hidden',
    width: drawerWidthCollapsed,
});

const CustomDrawer = styled(Drawer, { shouldForwardProp: (prop) => prop !== 'open' })(
    ({ theme, open }) => ({
        width: open ? drawerWidthExpanded : drawerWidthCollapsed,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        ...(open && {
            ...openedMixin(theme),
            '& .MuiDrawer-paper': openedMixin(theme),
        }),
        ...(!open && {
            ...closedMixin(theme),
            '& .MuiDrawer-paper': closedMixin(theme),
        }),
    }),
);

const CustomAppBar = styled(AppBar, {
    shouldForwardProp: (prop) => prop !== 'open',
})(({ theme, open }) => ({
    zIndex: theme.zIndex.drawer + 1,
}));

function DashboardEditor() {
    const theme = useTheme();
    const dispatch = useDispatch();
    const { t } = useTranslation('dashboard');
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
                    <Tooltip title={t('layout.done_editing')}>
                        <IconButton size="small" onClick={handleSaveClick} sx={{
                            width: 40,
                        }}>
                            <CheckIcon color="success"/>
                        </IconButton>
                    </Tooltip>
                </Stack>
            ) : (
                <Tooltip title={t('layout.edit_layout')}>
                    <IconButton size="small" onClick={handleEditClick} sx={{
                        width: 40,
                    }}>
                        <BorderColorIcon sx={{
                            color: theme.palette.mode === 'dark'
                                ? theme.palette.primary.main
                                : theme.palette.common.white
                        }}/>
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
            <SatelliteSyncPopover />
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
                            {/* Hide version indicator on phones and small tablets; show from ~768px and up */}
                            <Box sx={{
                                display: 'none',
                                '@media (min-width:768px)': {
                                    display: 'block',
                                },
                            }}>
                                <VersionInfo minimal={true}/>
                            </Box>
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
                p: 0,
                paddingTop: 0.75,
                paddingBottom: 0,
                borderRadius: "4px",
                textAlign: "center",
                maxWidth: "100px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center"
            }}
        >
            <Typography variant="body2" sx={{fontSize: "0.65rem", fontWeight: "bold", fontFamily: "monospace"}}>
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
                                // filter: (theme) => `drop-shadow(0px 2px 8px ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.32)'})`,
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
    const theme = useTheme();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const { socket } = useSocket();
    const { t } = useTranslation();
    const [open, setOpen] = React.useState(false);
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const [navigation, setNavigation] = React.useState(getNavigation());

    const {
        connecting,
        connected,
        disconnected,
        reConnectAttempt,
        connectionError,
    } = useSelector((state) => state.dashboard);
    const {
        hasVersionChanged,
        data
    } = useSelector((state) => state.version);

    // Use the audio context
    const { initializeAudio, playAudioSamples, getAudioState } = useAudio();
    const streamingTimeoutsRef = useRef({}); // Track per-VFO timeouts

    // Update navigation when language changes or state changes
    React.useEffect(() => {
        setNavigation(getNavigation());
    }, [t]);

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
            socket.on("audio-data", (data) => {
                // Extract VFO number from audio data
                const vfoNumber = data.vfo?.vfo_number;

                if (vfoNumber !== undefined) {
                    // Clear previous timeout for this VFO
                    if (streamingTimeoutsRef.current[vfoNumber]) {
                        clearTimeout(streamingTimeoutsRef.current[vfoNumber]);
                    }

                    // Mark this VFO as streaming
                    dispatch(addStreamingVFO(vfoNumber));

                    // Set timeout to remove this VFO from streaming after 500ms of no audio
                    streamingTimeoutsRef.current[vfoNumber] = setTimeout(() => {
                        delete streamingTimeoutsRef.current[vfoNumber];
                        dispatch(removeStreamingVFO(vfoNumber));
                    }, 500);
                }

                playAudioSamples(data);
            });
        }

        return () => {
            if (socket) {
                socket.off("audio-data");
            }
            // Clear all VFO timeouts on cleanup
            Object.values(streamingTimeoutsRef.current).forEach(timeout => {
                clearTimeout(timeout);
            });
            streamingTimeoutsRef.current = {};
        };
    }, [socket, playAudioSamples, dispatch]);

    const handleDrawerToggle = () => {
        // On mobile, toggle the temporary drawer
        if (window.innerWidth < 600) {
            setMobileOpen(!mobileOpen);
        } else {
            // On desktop, toggle between collapsed/expanded
            setOpen(!open);
        }
    };

    const handleMobileDrawerClose = () => {
        setMobileOpen(false);
    };

    const handleNavigation = (segment) => {
        navigate(`/${segment}`);
        // Close mobile drawer after navigation
        if (window.innerWidth < 600) {
            setMobileOpen(false);
        }
    };

    const isActiveRoute = (segment) => {
        const currentPath = location.pathname.slice(1); // Remove leading slash
        if (segment === '' && currentPath === '') return true;
        if (segment && currentPath.startsWith(segment)) return true;
        return false;
    };

    // Drawer content component
    const drawerContent = (isExpanded) => (
        <>
            <Toolbar />
            <Box component="nav" role="navigation" aria-label="Main navigation" sx={{ overflow: 'auto', mt: 1 }}>
                <List>
                    {navigation.map((item, index) => {
                        if (item.kind === 'header') {
                            return isExpanded ? (
                                <ListItem key={index} sx={{ pt: 2, pb: 1 }}>
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            fontWeight: 'bold',
                                            color: 'text.secondary',
                                            pl: 2
                                        }}
                                    >
                                        {item.title}
                                    </Typography>
                                </ListItem>
                            ) : null;
                        }

                        if (item.kind === 'divider') {
                            return <Divider key={index} sx={{ my: 1 }} />;
                        }

                        const isActive = isActiveRoute(item.segment);

                        return (
                            <ListItem key={index} disablePadding sx={{ display: 'block' }}>
                                <Tooltip
                                    title={!isExpanded ? item.title : ''}
                                    placement="right"
                                    disableFocusListener
                                    disableTouchListener
                                >
                                    <ListItemButton
                                        onClick={() => handleNavigation(item.segment)}
                                        selected={isActive}
                                        sx={{
                                            minHeight: 40,
                                            justifyContent: isExpanded ? 'flex-start' : 'center',
                                            px: isExpanded ? 2 : 0,
                                            py: 0.75,
                                            display: 'flex',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <ListItemIcon
                                            sx={{
                                                minWidth: 0,
                                                mr: isExpanded ? 2 : 0,
                                                display: 'flex',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                            }}
                                        >
                                            {item.icon}
                                        </ListItemIcon>
                                        {isExpanded && (
                                            <ListItemText
                                                primary={item.title}
                                                sx={{
                                                    '& .MuiTypography-root': {
                                                        fontSize: '0.875rem'
                                                    }
                                                }}
                                            />
                                        )}
                                    </ListItemButton>
                                </Tooltip>
                            </ListItem>
                        );
                    })}
                </List>
            </Box>
        </>
    );

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', overflow: 'hidden' }}>
            <CssBaseline />
            <CustomAppBar position="fixed" open={open}>
                <Toolbar>
                    <IconButton
                        color="inherit"
                        aria-label="toggle drawer"
                        onClick={handleDrawerToggle}
                        edge="start"
                        sx={{ mr: 2 }}
                    >
                        {open ? <ChevronLeftIcon /> : <MenuIcon />}
                    </IconButton>
                    <Box sx={{ flexGrow: 1 }}>
                        <CustomAppTitle />
                    </Box>
                    <ToolbarActions />
                </Toolbar>
            </CustomAppBar>

            {/* Mobile drawer - temporary */}
            <Drawer
                variant="temporary"
                open={mobileOpen}
                onClose={handleMobileDrawerClose}
                ModalProps={{
                    keepMounted: true, // Better open performance on mobile
                }}
                PaperProps={{
                    role: 'navigation',
                    'aria-label': 'Mobile navigation',
                }}
                sx={{
                    display: { xs: 'block', sm: 'none' },
                    '& .MuiDrawer-paper': {
                        width: drawerWidthExpanded,
                        boxSizing: 'border-box',
                    },
                }}
            >
                {drawerContent(true)}
            </Drawer>

            {/* Desktop drawer - permanent */}
            <CustomDrawer
                variant="permanent"
                open={open}
                PaperProps={{
                    role: 'navigation',
                    'aria-label': 'Desktop navigation',
                }}
                ModalProps={{
                    disableEnforceFocus: true,
                    disableAutoFocus: true,
                }}
                sx={{
                    display: { xs: 'none', sm: 'block' },
                    flexShrink: 0,
                }}
            >
                {drawerContent(open)}
            </CustomDrawer>

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    mt: '52px',
                    minWidth: 0,
                }}
            >
                {connected ? <Outlet /> : <ConnectionOverlay />}
                {hasVersionChanged && <VersionUpdateOverlay />}
                <PerformanceMetricsDialog />
            </Box>
        </Box>
    );
}
