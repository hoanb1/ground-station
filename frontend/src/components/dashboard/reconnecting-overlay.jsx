
import CloudOffIcon from '@mui/icons-material/CloudOff';
import SyncProblemIcon from '@mui/icons-material/SyncProblem';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { keyframes } from '@emotion/react';
import { Backdrop, Box, Typography } from "@mui/material";
import { useSelector } from "react-redux";

// Minimal animations
const fadeIn = keyframes`
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
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

    // Determine the status and styling with industrial colors
    const getConnectionStatus = () => {
        if (connectionError) {
            return {
                icon: <ErrorOutlineIcon sx={{ fontSize: 24, color: '#d32f2f' }} />,
                title: 'Connection Failed',
                message: 'Network error',
                color: '#d32f2f',
                bgColor: '#2a2a2a',
                borderColor: '#d32f2f'
            };
        }

        if (reConnectAttempt > 0) {
            return {
                icon: <SyncProblemIcon sx={{ fontSize: 24, color: '#ff9800' }} />,
                title: 'Reconnecting',
                message: `Attempt ${reConnectAttempt}`,
                color: '#ff9800',
                bgColor: '#2a2a2a',
                borderColor: '#ff9800'
            };
        }

        if (connecting || disconnected) {
            return {
                icon: <CloudOffIcon sx={{ fontSize: 24, color: '#757575' }} />,
                title: 'Connecting',
                message: 'Establishing connection',
                color: '#757575',
                bgColor: '#2a2a2a',
                borderColor: '#757575'
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
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(4px)'
            }}
        >
            <Box
                sx={{
                    animation: `${fadeIn} 0.2s ease-out`,
                    backgroundColor: status.bgColor,
                    border: `1px solid ${status.borderColor}`,
                    borderRadius: 1,
                    padding: 3,
                    minWidth: 280,
                    maxWidth: 320,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                }}
            >
                {/* Header */}
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    mb: 2,
                }}>
                    {status.icon}
                    <Box sx={{ flex: 1 }}>
                        <Typography
                            variant="subtitle1"
                            sx={{
                                color: '#ffffff',
                                fontWeight: 500,
                                mb: 0.5,
                                fontSize: '1rem'
                            }}
                        >
                            {status.title}
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                color: '#b0b0b0',
                                fontSize: '0.875rem'
                            }}
                        >
                            {status.message}
                        </Typography>
                    </Box>
                </Box>

                {/* Progress indicator */}
                <Box
                    sx={{
                        width: '100%',
                        height: 2,
                        backgroundColor: '#424242',
                        borderRadius: 1,
                        overflow: 'hidden',
                        position: 'relative'
                    }}
                >
                    <Box
                        sx={{
                            height: '100%',
                            width: '30%',
                            backgroundColor: status.color,
                            borderRadius: 1,
                            animation: `${keyframes`
                                0% { transform: translateX(-100%); }
                                100% { transform: translateX(333%); }
                            `} 2s infinite ease-in-out`,
                        }}
                    />
                </Box>

                {/* Status text */}
                <Typography
                    variant="caption"
                    sx={{
                        color: '#757575',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        display: 'block',
                        textAlign: 'center',
                        mt: 1.5,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}
                >
                    {connectionError ? 'ERROR' :
                        reConnectAttempt > 0 ? 'RECONNECTING' : 'CONNECTING'}
                </Typography>
            </Box>
        </Backdrop>
    );
}

export default ConnectionOverlay;