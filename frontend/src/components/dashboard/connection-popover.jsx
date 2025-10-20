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
import { useTranslation } from 'react-i18next';

function ConnectionStatus() {
    const { t } = useTranslation('dashboard');
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
        if (trafficStatsRef.current.transport.name === "websocket") return t('connection_popover.network_connected_ws');
        if (trafficStatsRef.current.transport.name === "polling") return t('connection_popover.network_connected_polling');
        if (trafficStatsRef.current.transport.name === 'connecting...' || trafficStatsRef.current.transport.name === "unknown") return t('connection_popover.network_connecting');
        if (trafficStatsRef.current.transport.name === "disconnected") return t('connection_popover.network_disconnected');
        return t('connection_popover.network_unknown');
    }, [trafficStatsRef.current.transport.name, t]);

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
                    <LanIcon />
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
                            {t('connection_popover.connection_status')}
                        </Typography>
                        <Grid container spacing={2}>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('connection_popover.transport')}
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: connectionColor }}>
                                    {trafficStatsRef.current.transport.name.toUpperCase()}
                                </Typography>
                            </Grid>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('connection_popover.duration')}
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#fff' }}>
                                    {formatDuration(trafficStatsRef.current.session.duration)}
                                </Typography>
                            </Grid>
                        </Grid>

                        {trafficStatsRef.current.manager.reconnecting && (
                            <Typography variant="caption" sx={{ color: '#ff9800', fontFamily: 'monospace', mt: 1, display: 'block' }}>
                                {t('connection_popover.reconnecting', { count: trafficStatsRef.current.manager.reconnectAttempts })}
                            </Typography>
                        )}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Box sx={{ mb: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {t('connection_popover.current_traffic_rate')}
                        </Typography>
                        <Grid container spacing={2}>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('connection_popover.upload')}
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#4caf50' }}>
                                    {formatBytes(trafficStatsRef.current.rates.bytesPerSecond.sent)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {t('connection_popover.msgs_per_second', { count: trafficStatsRef.current.rates.packetsPerSecond.sent })}
                                </Typography>
                            </Grid>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('connection_popover.download')}
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#2196f3' }}>
                                    {formatBytes(trafficStatsRef.current.rates.bytesPerSecond.received)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {t('connection_popover.msgs_per_second', { count: trafficStatsRef.current.rates.packetsPerSecond.received })}
                                </Typography>
                            </Grid>
                        </Grid>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {t('connection_popover.application_level')}
                        </Typography>
                        <Grid container spacing={2}>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('connection_popover.sent')}
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#4caf50' }}>
                                    {formatTotalBytes(trafficStatsRef.current.engine.bytesSent)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {t('connection_popover.messages', { count: trafficStatsRef.current.engine.packetsSent })}
                                </Typography>
                            </Grid>
                            <Grid size={6}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('connection_popover.received')}
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#2196f3' }}>
                                    {formatTotalBytes(trafficStatsRef.current.engine.bytesReceived)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {t('connection_popover.messages', { count: trafficStatsRef.current.engine.packetsReceived })}
                                </Typography>
                            </Grid>
                        </Grid>

                        {trafficStatsRef.current.engine.upgradeAttempts > 0 && (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('connection_popover.transport_upgrades')}
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