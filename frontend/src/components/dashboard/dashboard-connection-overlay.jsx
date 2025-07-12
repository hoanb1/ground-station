
import WifiOffIcon from '@mui/icons-material/WifiOff';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { keyframes } from '@emotion/react';
import { Backdrop, Box, Typography, LinearProgress, Chip } from "@mui/material";
import { useSelector } from "react-redux";

// Modern animations
const slideUp = keyframes`
    from {
        opacity: 0;
        transform: translateY(30px) scale(0.95);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
`;

const shimmer = keyframes`
    0% {
        background-position: -200px 0;
    }
    100% {
        background-position: calc(200px + 100%) 0;
    }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-4px); }
`;

function ConnectionOverlay() {
    const {
        connecting,
        connected,
        disconnected,
        reConnectAttempt,
        connectionError,
    } = useSelector((state) => state.dashboard);

    // Don't show overlay if connected
    if (connected && !connecting) {
        return null;
    }

    // Determine the status and styling
    const getConnectionStatus = () => {
        if (connectionError) {
            return {
                icon: <ErrorOutlineIcon sx={{ fontSize: 32, color: '#ffffff' }} />,
                title: 'Connection Failed',
                message: 'Check your network connection',
                color: '#ef4444',
                bgGradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                chipColor: '#fef2f2',
                chipTextColor: '#991b1b'
            };
        }

        if (reConnectAttempt > 0) {
            return {
                icon: <SignalWifiOffIcon sx={{ fontSize: 32, color: '#ffffff' }} />,
                title: 'Reconnecting',
                message: 'Attempting to restore connection',
                color: '#f59e0b',
                bgGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                chipColor: '#fef3c7',
                chipTextColor: '#92400e'
            };
        }

        if (connecting || disconnected) {
            return {
                icon: <WifiOffIcon sx={{ fontSize: 32, color: '#ffffff' }} />,
                title: 'Connecting',
                message: 'Establishing secure connection',
                color: '#3b82f6',
                bgGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                chipColor: '#dbeafe',
                chipTextColor: '#1e40af'
            };
        }

        return null;
    };

    const status = getConnectionStatus();

    if (!status) return null;

    return (
        <Backdrop
            open={true}
            sx={{
                zIndex: (theme) => theme.zIndex.drawer + 1,
                background: 'radial-gradient(circle at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.8) 100%)',
                backdropFilter: 'blur(8px)'
            }}
        >
            <Box
                sx={{
                    animation: `${slideUp} 0.4s cubic-bezier(0.4, 0, 0.2, 1)`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    maxWidth: 420,
                    width: '90%',
                    mx: 'auto'
                }}
            >
                {/* Main Card */}
                <Box
                    sx={{
                        background: status.bgGradient,
                        borderRadius: 4,
                        padding: 4,
                        width: '100%',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        position: 'relative',
                        overflow: 'hidden',
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '1px',
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                        }
                    }}
                >
                    {/* Shimmer effect */}
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: `linear-gradient(
                                90deg,
                                transparent,
                                rgba(255, 255, 255, 0.1),
                                transparent
                            )`,
                            backgroundSize: '200px 100%',
                            animation: `${shimmer} 3s infinite`,
                        }}
                    />

                    {/* Header */}
                    <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        mb: 3,
                        position: 'relative',
                        zIndex: 1
                    }}>
                        <Box
                            sx={{
                                animation: reConnectAttempt > 0 ? `${float} 2s infinite` : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 56,
                                height: 56,
                                borderRadius: 3,
                                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                            }}
                        >
                            {status.icon}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography
                                variant="h5"
                                sx={{
                                    color: 'white',
                                    fontWeight: 600,
                                    mb: 0.5,
                                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                                }}
                            >
                                {status.title}
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{
                                    color: 'rgba(255, 255, 255, 0.9)',
                                    opacity: 0.9
                                }}
                            >
                                {status.message}
                            </Typography>
                        </Box>
                    </Box>

                    {/* Status Chip */}
                    {reConnectAttempt > 0 && (
                        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
                            <Chip
                                label={`Attempt ${reConnectAttempt}`}
                                size="small"
                                sx={{
                                    backgroundColor: status.chipColor,
                                    color: status.chipTextColor,
                                    fontWeight: 600,
                                    border: 'none',
                                    fontFamily: 'monospace',
                                }}
                            />
                        </Box>
                    )}

                    {/* Progress Bar */}
                    <Box sx={{ position: 'relative', zIndex: 1 }}>
                        <LinearProgress
                            sx={{
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                '& .MuiLinearProgress-bar': {
                                    borderRadius: 3,
                                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                }
                            }}
                        />
                        <Typography
                            variant="caption"
                            sx={{
                                color: 'rgba(255, 255, 255, 0.8)',
                                display: 'block',
                                textAlign: 'center',
                                mt: 1,
                                fontSize: '0.7rem',
                                fontFamily: 'monospace',
                            }}
                        >
                            {connectionError ? 'Connection failed' :
                                reConnectAttempt > 0 ? 'Retrying connection...' : 'Please wait...'}
                        </Typography>
                    </Box>
                </Box>

                {/* Bottom status indicator */}
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    padding: 2,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: 2,
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                }}>
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: status.color,
                            animation: `${keyframes`
                                0%, 100% { opacity: 0.5; transform: scale(1); }
                                50% { opacity: 1; transform: scale(1.2); }
                            `} 2s infinite`,
                        }}
                    />
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'rgba(255, 255, 255, 0.9)',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                        }}
                    >
                        {connectionError ? 'CONNECTION ERROR' :
                            reConnectAttempt > 0 ? 'RECONNECTING' : 'CONNECTING'}
                    </Typography>
                </Box>
            </Box>
        </Backdrop>
    );
}

export default ConnectionOverlay;