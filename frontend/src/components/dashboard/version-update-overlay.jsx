import SystemUpdateIcon from '@mui/icons-material/SystemUpdate';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import { keyframes } from '@emotion/react';
import { Backdrop, Box, Typography, Button, CircularProgress } from "@mui/material";
import { useSelector, useDispatch } from "react-redux";
import { clearVersionChangeFlag } from './version-slice.jsx';
import { useEffect, useState } from "react";

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


const pulseGlow = keyframes`
    0%, 100% {
        box-shadow: 0 0 5px rgba(76, 175, 80, 0.3);
    }
    50% {
        box-shadow: 0 0 20px rgba(76, 175, 80, 0.6);
    }
`;

function VersionUpdateOverlay() {
    const dispatch = useDispatch();
    const { hasVersionChanged, data } = useSelector((state) => state.version);
    const [countdown, setCountdown] = useState(5);
    const [timeoutId, setTimeoutId] = useState(null);
    const [intervalId, setIntervalId] = useState(null);

    // Don't show overlay if version hasn't changed
    if (!hasVersionChanged) {
        return null;
    }

    useEffect(() => {
        if (hasVersionChanged) {
            console.log('Version has changed!', data.version);

            // Start countdown
            const timeout = setTimeout(() => {
                window.location.reload();
            }, 3000);

            const interval = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            setTimeoutId(timeout);
            setIntervalId(interval);

            // Cleanup on unmount
            return () => {
                clearTimeout(timeout);
                clearInterval(interval);
            };
        }
    }, [hasVersionChanged, data]);

    const handleRefresh = () => {
        // Clear timers
        if (timeoutId) clearTimeout(timeoutId);
        if (intervalId) clearInterval(intervalId);
        
        // Clear the version change flag
        dispatch(clearVersionChangeFlag());
        // Reload the page to get the new version
        window.location.reload();
    };

    const handleDismiss = () => {
        // Clear timers
        if (timeoutId) clearTimeout(timeoutId);
        if (intervalId) clearInterval(intervalId);
        
        // Just clear the flag without reloading
        dispatch(clearVersionChangeFlag());
    };

    // Calculate progress for circular progress (100% at start, 0% at end)
    const progress = (countdown / 3) * 100;

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
                    animation: `${fadeIn} 0.3s ease-out, ${pulseGlow} 3s infinite`,
                    backgroundColor: '#2a2a2a',
                    border: '1px solid #4caf50',
                    borderRadius: 1,
                    padding: 3,
                    minWidth: 320,
                    maxWidth: 380,
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
                    <NewReleasesIcon sx={{ fontSize: 28, color: '#4caf50' }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography
                            variant="subtitle1"
                            sx={{
                                color: '#ffffff',
                                fontWeight: 600,
                                mb: 0.5,
                                fontSize: '1.1rem'
                            }}
                        >
                            New Version Available
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                color: '#b0b0b0',
                                fontSize: '0.875rem'
                            }}
                        >
                            Backend has been updated to version {data?.version}
                        </Typography>
                    </Box>
                </Box>

                {/* Countdown section */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        mb: 3,
                        p: 2,
                        backgroundColor: '#1a1a1a',
                        borderRadius: 1,
                        border: '1px solid #424242'
                    }}
                >
                    <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <CircularProgress
                            variant="determinate"
                            value={progress}
                            size={32}
                            thickness={4}
                            sx={{
                                color: countdown > 1 ? '#4caf50' : '#ff9800',
                                '& .MuiCircularProgress-circle': {
                                    strokeLinecap: 'round',
                                },
                            }}
                        />
                        <Box
                            sx={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                bottom: 0,
                                right: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: countdown > 1 ? '#4caf50' : '#ff9800',
                                    fontWeight: 'bold',
                                    fontSize: '0.75rem',
                                    fontFamily: 'monospace'
                                }}
                            >
                                {countdown}
                            </Typography>
                        </Box>
                    </Box>
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{
                                color: countdown > 1 ? '#4caf50' : '#ff9800',
                                fontWeight: 500,
                                fontSize: '0.875rem'
                            }}
                        >
                            {countdown > 0 ? `Refreshing in ${countdown}s...` : 'Refreshing now...'}
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{
                                color: '#b0b0b0',
                                fontSize: '0.75rem'
                            }}
                        >
                            Click "Refresh Now" to skip wait
                        </Typography>
                    </Box>
                </Box>

                {/* Action buttons */}
                <Box sx={{
                    display: 'flex',
                    gap: 2,
                    justifyContent: 'flex-end'
                }}>
                    <Button
                        variant="outlined"
                        onClick={handleDismiss}
                        disabled={countdown === 0}
                        sx={{
                            color: '#b0b0b0',
                            borderColor: '#424242',
                            '&:hover': {
                                borderColor: '#757575',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)'
                            },
                            '&:disabled': {
                                borderColor: '#333333',
                                color: '#666666'
                            },
                            textTransform: 'none',
                            fontWeight: 500
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleRefresh}
                        disabled={countdown === 0}
                        sx={{
                            backgroundColor: countdown > 1 ? '#4caf50' : '#ff9800',
                            color: '#ffffff',
                            '&:hover': {
                                backgroundColor: countdown > 1 ? '#45a049' : '#f57c00'
                            },
                            '&:disabled': {
                                backgroundColor: '#666666'
                            },
                            textTransform: 'none',
                            fontWeight: 600,
                            boxShadow: `0 2px 8px rgba(${countdown > 1 ? '76, 175, 80' : '255, 152, 0'}, 0.3)`
                        }}
                    >
                        Refresh Now
                    </Button>
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
                        mt: 2,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}
                >
                    AUTO-REFRESH IN PROGRESS
                </Typography>
            </Box>
        </Backdrop>
    );
}

export default VersionUpdateOverlay;