import Stack from "@mui/material/Stack";
import SatelliteInfoPopover from "./target-popover.jsx";
import HardwareSettingsPopover from "./hardware-popover.jsx";
import WakeLockStatus from "./wake-lock-icon.jsx";
import {ThemeSwitcher} from "@toolpad/core/DashboardLayout";
import Typography from "@mui/material/Typography";
import PropTypes from "prop-types";
import Grid from "@mui/material/Grid2";
import RadioIcon from '@mui/icons-material/Radio';
import LanIcon from '@mui/icons-material/Lan';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import {Avatar, Box, Divider, IconButton, ListItemIcon, ListItemText, MenuItem, MenuList, Popover} from "@mui/material";
import {GroundStationLogoGreenBlue} from "../common/icons.jsx";
import {Account, AccountPopoverFooter, AccountPreview, SignOutButton} from "@toolpad/core";
import * as React from "react";
import {stringAvatar} from "../common/common.jsx";
import {useDispatch, useSelector} from "react-redux";
import {useSocket} from "../common/socket.jsx";
import {useAudio} from "./audio-provider.jsx";
import {useCallback, useEffect, useState} from "react";
import {setConnected, setConnecting, setConnectionError, setReConnectAttempt} from "./dashboard-slice.jsx";
import Tooltip from "@mui/material/Tooltip";

function ConnectionStatus() {
    const { socket, trafficStatsRef } = useSocket();
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
                    p: 1,
                    minWidth: 250,
                    width: 250,
                    backgroundColor: '#1e1e1e',
                }}>
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

export default ConnectionStatus;