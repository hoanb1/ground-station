import SystemUpdateIcon from '@mui/icons-material/SystemUpdate';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import { keyframes } from '@emotion/react';
import { Backdrop, Box, Typography, Button } from "@mui/material";
import { useSelector, useDispatch } from "react-redux";
import { clearVersionChangeFlag } from './version-slice.jsx';
import {useEffect} from "react";

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

    // Don't show overlay if version hasn't changed
    if (!hasVersionChanged) {
        return null;
    }

    useEffect(() => {
        if (hasVersionChanged) {
            // Handle version change
            console.log('Version has changed!', data.version);

            setTimeout(() => {
                window.location.reload();
            }, 3000);
        }
    }, [hasVersionChanged]);

    const handleRefresh = () => {
        // Clear the version change flag
        dispatch(clearVersionChangeFlag());
        // Reload the page to get the new version
        window.location.reload();
    };

    const handleDismiss = () => {
        // Just clear the flag without reloading
        dispatch(clearVersionChangeFlag());
    };

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

                {/* Update indicator */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1,
                        mb: 3,
                        p: 2,
                        backgroundColor: '#1a1a1a',
                        borderRadius: 1,
                        border: '1px solid #424242'
                    }}
                >
                    <SystemUpdateIcon sx={{ fontSize: 20, color: '#4caf50' }} />
                    <Typography
                        variant="body2"
                        sx={{
                            color: '#4caf50',
                            fontWeight: 500,
                            fontSize: '0.875rem'
                        }}
                    >
                        Refresh recommended for best experience
                    </Typography>
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
                        sx={{
                            color: '#b0b0b0',
                            borderColor: '#424242',
                            '&:hover': {
                                borderColor: '#757575',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)'
                            },
                            textTransform: 'none',
                            fontWeight: 500
                        }}
                    >
                        Later
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleRefresh}
                        sx={{
                            backgroundColor: '#4caf50',
                            color: '#ffffff',
                            '&:hover': {
                                backgroundColor: '#45a049'
                            },
                            textTransform: 'none',
                            fontWeight: 600,
                            boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)'
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
                    VERSION UPDATE
                </Typography>
            </Box>
        </Backdrop>
    );
}

export default VersionUpdateOverlay;