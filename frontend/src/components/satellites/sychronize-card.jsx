import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Box, CardContent, Typography, Button } from '@mui/material';
import { enqueueSnackbar } from 'notistack';
import { useSocket } from '../common/socket.jsx';
import {
    startSatelliteSync,
    setProgress,
    setMessage,
} from './synchronize-slice.jsx';
import PropTypes from "prop-types";
import {styled} from "@mui/material/styles";
import LinearProgress, {linearProgressClasses} from "@mui/material/LinearProgress";
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import SyncIcon from '@mui/icons-material/Sync';


function LinearProgressWithLabel(props) {
    return (
        <Box sx={{display: 'flex', alignItems: 'center'}}>
            <Box sx={{width: '100%', mr: 1}}>
                <LinearProgress variant="determinate" {...props} />
            </Box>
            <Box sx={{minWidth: 35}}>
                <Typography variant="body2" sx={{color: 'text.secondary'}}>
                    {`${Math.round(props.value)}%`}
                </Typography>
            </Box>
        </Box>
    );
}

function LinearWithValueLabel({progress}) {

    const BorderLinearProgress = styled(LinearProgress)(({theme}) => ({
        height: 20,
        borderRadius: 5,
        [`&.${linearProgressClasses.colorPrimary}`]: {
            backgroundColor: theme.palette.grey[200],
            ...theme.applyStyles('dark', {
                backgroundColor: theme.palette.grey[800],
            }),
        },
        [`& .${linearProgressClasses.bar}`]: {
            borderRadius: 5,
            backgroundColor: '#1a90ff',
            ...theme.applyStyles('dark', {
                backgroundColor: '#308fe8',
            }),
        },
    }));

    return (
        <Box sx={{display: 'flex', alignItems: 'left', width: '100%'}}>
            <Box sx={{width: '100%', mr: 1}}>
                <BorderLinearProgress
                    value={progress}
                    variant="determinate"
                />
            </Box>
            <Box sx={{minWidth: 35}}>
                <Typography variant="body2" sx={{color: 'text.secondary'}}>
                    {`${Math.round(progress)}%`}
                </Typography>
            </Box>
        </Box>
    );
}


const SynchronizeTLEsCard = function () {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const { progress, message, status } = useSelector((state) => state.syncSatellite);

    const handleSynchronizeSatellites = async () => {
        dispatch(startSatelliteSync({ socket }));
    };

    return (
        <Card sx={{
            position: 'relative',
            marginTop: 2,
            marginBottom: 0,
            background: 'linear-gradient(135deg, #071318 0%, #1e2a38 100%)',
            borderRadius: 3,
            border: '1px solid #2d4856',
            boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
            overflow: 'hidden',
        }}>
            {/* Background grid pattern */}
            <Box sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: 0.07,
                zIndex: 0,
                background: 'url("data:image/svg+xml,%3Csvg width=\'100%25\' height=\'100%25\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'smallGrid\' width=\'8\' height=\'8\' patternUnits=\'userSpaceOnUse\'%3E%3Cpath d=\'M 8 0 L 0 0 0 8\' fill=\'none\' stroke=\'%233d5866\' stroke-width=\'0.5\'/%3E%3C/pattern%3E%3Cpattern id=\'grid\' width=\'80\' height=\'80\' patternUnits=\'userSpaceOnUse\'%3E%3Crect width=\'80\' height=\'80\' fill=\'url(%23smallGrid)\'/%3E%3Cpath d=\'M 80 0 L 0 0 0 80\' fill=\'none\' stroke=\'%232d4856\' stroke-width=\'1\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'url(%23grid)\' /%3E%3C/svg%3E")',
            }}/>

            {/* Glow accent */}
            <Box sx={{
                position: 'absolute',
                top: -60,
                right: -60,
                width: 150,
                height: 150,
                borderRadius: '50%',
                background: 'radial-gradient(circle at center, rgba(64,192,255,0.15) 0%, rgba(64,192,255,0) 70%)',
                filter: 'blur(20px)',
                zIndex: 0
            }}/>

            {/* Card content container */}
            <Box sx={{
                position: 'relative',
                zIndex: 1,
                p: { xs: 2, sm: 3 },
            }}>
                {/* Small decorative element */}
                <Box sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '3px',
                    background: 'linear-gradient(90deg, #00b0ff 0%, rgba(0,176,255,0) 100%)',
                    boxShadow: '0 0 10px rgba(0,176,255,0.5)',
                }}/>

                {/* Header section with title and button */}
                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: 'space-between',
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    mb: 2,
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: { xs: 1.5, sm: 0 } }}>
                        <SatelliteAltIcon sx={{
                            mr: 1,
                            color: '#40c0ff',
                            filter: 'drop-shadow(0 0 3px rgba(64,192,255,0.6))',
                            animation: 'pulse 3s infinite ease-in-out',
                            '@keyframes pulse': {
                                '0%': { opacity: 0.8 },
                                '50%': { opacity: 1 },
                                '100%': { opacity: 0.8 }
                            }
                        }}/>
                        <Box>
                            <Typography
                                component="div"
                                variant="h6"
                                sx={{
                                    fontWeight: 700,
                                    color: '#ffffff',
                                    textShadow: '0 0 10px rgba(0,0,0,0.5)',
                                    letterSpacing: '0.5px',
                                    textTransform: 'uppercase',
                                    fontSize: { xs: '1rem', sm: '1.25rem' },
                                }}
                            >
                                TLE Data Sync
                            </Typography>
                            <Typography
                                variant="subtitle2"
                                component="div"
                                sx={{
                                    color: '#aaaaaa',
                                    fontSize: '0.8rem',
                                    fontWeight: 300,
                                    letterSpacing: '0.3px',
                                    display: { xs: 'none', sm: 'block' },
                                }}
                            >
                                Fetch orbital data from satellite sources
                            </Typography>
                        </Box>
                    </Box>

                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleSynchronizeSatellites}
                        size="small"
                        sx={{
                            background: 'linear-gradient(135deg, #0288d1 0%, #0277bd 100%)',
                            boxShadow: '0 5px 15px rgba(2,136,209,0.3)',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            letterSpacing: '1px',
                            px: { xs: 2, sm: 3 },
                            py: 1,
                            borderRadius: '8px',
                            position: 'relative',
                            overflow: 'hidden',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #039be5 0%, #0288d1 100%)',
                                boxShadow: '0 5px 20px rgba(2,136,209,0.5)',
                                transform: 'translateY(-2px)',
                            },
                            '&::before': {
                                content: '""',
                                position: 'absolute',
                                top: 0,
                                left: '-100%',
                                width: '100%',
                                height: '100%',
                                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                                transition: 'all 0.5s ease',
                            },
                            '&:hover::before': {
                                left: '100%',
                            },
                            alignSelf: { xs: 'flex-start', sm: 'center' }
                        }}
                    >
                        <SyncIcon sx={{
                            mr: 1,
                            animation: progress > 0 && progress < 100 ? 'rotate 2s infinite linear' : 'none',
                            '@keyframes rotate': {
                                '0%': { transform: 'rotate(0deg)' },
                                '100%': { transform: 'rotate(360deg)' }
                            },
                            fontSize: { xs: '1rem', sm: '1.25rem' }
                        }}/>
                        Synchronize
                    </Button>
                </Box>

                {/* Progress section */}
                <Box sx={{
                    mt: 1,
                    border: '1px solid rgba(45,72,86,0.7)',
                    borderRadius: 2,
                    backgroundColor: 'rgba(7,19,24,0.5)',
                    p: { xs: 1.5, sm: 2 },
                }}>
                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1,
                    }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: '#aaaaaa',
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                fontSize: '0.7rem',
                            }}
                        >
                            Synchronization Progress
                        </Typography>
                        <Typography
                            variant="h6"
                            sx={{
                                color: '#40c0ff',
                                fontWeight: 700,
                                textShadow: '0 0 5px rgba(64,192,255,0.3)',
                                fontFamily: 'monospace',
                                fontSize: '1.1rem',
                            }}
                        >
                            {`${Math.round(progress)}%`}
                        </Typography>
                    </Box>

                    <Box sx={{ position: 'relative', mb: 2 }}>
                        <LinearProgress
                            variant="determinate"
                            value={progress}
                            sx={{
                                height: 10,
                                borderRadius: 5,
                                backgroundColor: 'rgba(255,255,255,0.1)',
                                '& .MuiLinearProgress-bar': {
                                    background: 'linear-gradient(90deg, #0288d1 0%, #40c0ff 100%)',
                                    borderRadius: 5,
                                    boxShadow: '0 0 10px rgba(64,192,255,0.5)',
                                }
                            }}
                        />

                        {/* Animated scanner effect */}
                        {progress > 0 && progress < 100 && (
                            <Box sx={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                height: '100%',
                                width: '5px',
                                background: 'rgba(255,255,255,0.7)',
                                filter: 'blur(3px)',
                                animation: 'scan 2s infinite linear',
                                '@keyframes scan': {
                                    '0%': { left: '0%' },
                                    '100%': { left: '100%' }
                                },
                                zIndex: 2,
                            }}/>
                        )}
                    </Box>

                        {/* Terminal effect for the status message */}
                        <Box sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,30,60,0.15), rgba(0,30,60,0.15) 1px, transparent 1px, transparent 2px)',
                            opacity: 0.5,
                            pointerEvents: 'none',
                        }}/>

                        <Typography
                            variant="body2"
                            sx={{
                                fontFamily: 'monospace',
                                color: '#bbbbbb',
                                position: 'relative',
                                zIndex: 1,
                                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                                '&::after': progress > 0 && progress < 100 ? {
                                    content: '"|"',
                                    animation: 'blink 1s infinite',
                                    '@keyframes blink': {
                                        '0%': { opacity: 0 },
                                        '50%': { opacity: 1 },
                                        '100%': { opacity: 0 }
                                    }
                                } : {},
                            }}
                        >
                            {message || (
                                progress === 0
                                    ? 'Ready to synchronize. Click the button to start.'
                                    : progress === 100
                                        ? 'Synchronization complete!'
                                        : 'Synchronizing satellite data...'
                            )}
                        </Typography>
                </Box>
            </Box>
        </Card>
    );
};

export default SynchronizeTLEsCard;