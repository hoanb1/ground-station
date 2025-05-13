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
import {Avatar, Backdrop, Box, Button, Divider, ListItemIcon, ListItemText, MenuItem, MenuList} from "@mui/material";
import {Account, AccountPopoverFooter, AccountPreview, SignOutButton} from "@toolpad/core";
import {GroundStationLogoGreenBlue, GSRetroLogo} from "../common/icons.jsx";
import {stringAvatar} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";
import BorderColorIcon from '@mui/icons-material/BorderColor';
import {useCallback, useEffect, useState} from "react";
import {handleSetGridEditableOverview as OverviewModeSetEditing} from '../overview/overview-sat-layout.jsx'
import {handleSetGridEditableTarget as TargetModeSetEditing} from '../target/target-sat-layout.jsx'
import {handleSetGridEditableWaterfall as WaterfallModeSetEditing} from '../waterfall/waterfall-layout.jsx';
import CheckIcon from '@mui/icons-material/Check';
import CircularProgress from "@mui/material/CircularProgress";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {setIsEditing} from "./dashboard-slice.jsx";


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
        <Box>
            {isEditing ? (
                <Stack direction="row" spacing={2}>
                    <Button size={"small"} variant={"outlined"} onClick={handleSaveClick} startIcon={<CheckIcon/>}>Done editing</Button>
                </Stack>
            ) : (
                <Button size={"small"} variant={"text"} onClick={handleEditClick} startIcon={<BorderColorIcon/>}>Edit layout</Button>
            )}
        </Box>
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
    
    return (
        <>
            <Box
                sx={{
                    mt: '10px',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: transportType === "websocket"
                        ? '#4caf50'
                        : transportType === "polling"
                            ? '#f57c00'
                            : '#f44336', // Red for "disconnected"
                    marginRight: '8px',
                }}
            />
        </>
    );
}


function ToolbarActions() {
    return (
        <Stack direction="row" sx={{padding: "6px 0px 0px 0px"}}>
            <ConnectionStatus/>
            <DashboardEditor/>
            <TimeDisplay/>
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
                borderRadius: "4px",
                textAlign: "center",
                maxWidth: "200px"
            }}
        >
            <Typography variant="body2" sx={{fontWeight: "bold", fontFamily: "monospace"}}>
                {formattedTime} {isUTC ? "UTC" : timeZoneAbbr}
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
                            <Avatar {...stringAvatar('Efstratios Goudelis')} />
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
        }

        return () => {
            if (socket) {
                socket.off("connect");
                socket.off("disconnect");
                socket.off("error");
            }

        };
    }, [socket]);
    
    return (
        <DashboardLayout
            sx={{
                //minHeight: '1000px',
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