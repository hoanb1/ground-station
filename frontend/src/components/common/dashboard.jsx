import Stack from "@mui/material/Stack";
import {DashboardLayout, ThemeSwitcher} from "@toolpad/core/DashboardLayout";
import Typography from "@mui/material/Typography";
import PropTypes from "prop-types";
import * as React from "react";
import {Outlet} from "react-router";
import {Avatar, Backdrop, Box, Button, Divider, ListItemIcon, ListItemText, MenuItem, MenuList} from "@mui/material";
import {Account, AccountPopoverFooter, AccountPreview, SignOutButton} from "@toolpad/core";
import {GroundStationLogoGreenBlue, GSRetroLogo} from "./icons.jsx";
import {stringAvatar} from "./common.jsx";
import Grid from "@mui/material/Grid2";
import BorderColorIcon from '@mui/icons-material/BorderColor';
import {useCallback, useEffect, useState} from "react";
import {handleSetGridEditableOverview as OverviewModeSetEditing} from '../overview-sat-track.jsx'
import {handleSetGridEditableTarget as TargetModeSetEditing} from '../target-sat-track.jsx'
import CheckIcon from '@mui/icons-material/Check';
import CircularProgress from "@mui/material/CircularProgress";
import {useSocket} from "./socket.jsx";
import {enqueueSnackbar, SnackbarProvider, closeSnackbar} from "notistack";
import CloseIcon from '@mui/icons-material/Close';
import {useAuth} from "./auth.jsx";


function DashboardEditor() {
    const [isEditing, setIsEditing] = React.useState(false);

    const handleEditClick = () => {
        setIsEditing(true);
        OverviewModeSetEditing(true);
        TargetModeSetEditing(true);
    };

    const handleSaveClick = () => {
        setIsEditing(false);
        OverviewModeSetEditing(false);
        TargetModeSetEditing(false);
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

function ToolbarActions() {
    return (
        <Stack direction="row" sx={{padding: "6px 0px 0px 0px"}}>
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
                        <Typography variant="h6">GS</Typography>
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
    const [isUTC, setIsUTC] = React.useState(true); // Toggle between UTC and Local Time
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
                {formattedTime} {isUTC ? "UTC" : "local"}
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
            <DashboardLayout defaultSidebarCollapsed slots={{
                appTitle: CustomAppTitle,
                toolbarActions: ToolbarActions,
                toolbarAccount: () => {},
                sidebarFooter: SidebarFooterAccount
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