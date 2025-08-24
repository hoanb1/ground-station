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


import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Box, CardContent, Typography, Button, Collapse, Chip, IconButton } from '@mui/material';
import { enqueueSnackbar } from 'notistack';
import { useSocket } from '../common/socket.jsx';
import {
    startSatelliteSync,
    fetchSyncState,
    setSyncState,
} from './synchronize-slice.jsx';
import PropTypes from "prop-types";
import {styled} from "@mui/material/styles";
import LinearProgress, {linearProgressClasses} from "@mui/material/LinearProgress";
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import {humanizeDate} from '../common/common.jsx';
import SyncIcon from '@mui/icons-material/Sync';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import RadioIcon from '@mui/icons-material/Radio';
import DeleteIcon from '@mui/icons-material/Delete'; // Add this import


const SynchronizeTLEsCard = function () {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const {
        syncState,
        synchronizing
    } = useSelector((state) => state.syncSatellite);
    const [showNewItems, setShowNewItems] = useState(false);
    const [showRemovedItems, setShowRemovedItems] = useState(false); // Add this state

    const handleSynchronizeSatellites = async () => {
        dispatch(startSatelliteSync({ socket }));
    };

    useEffect(() => {
        dispatch(fetchSyncState({socket: socket}));
    }, []);

    // Check if there are newly added items
    const hasNewItems = syncState?.newly_added &&
        (syncState.newly_added.satellites?.length > 0 || syncState.newly_added.transmitters?.length > 0);

    const newSatellitesCount = syncState?.newly_added?.satellites?.length || 0;
    const newTransmittersCount = syncState?.newly_added?.transmitters?.length || 0;

    // Check if there are removed items - Add this block
    const hasRemovedItems = syncState?.removed &&
        (syncState.removed.satellites?.length > 0 || syncState.removed.transmitters?.length > 0);

    const removedSatellitesCount = syncState?.removed?.satellites?.length || 0;
    const removedTransmittersCount = syncState?.removed?.transmitters?.length || 0;

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
            {/* ... existing background and glow effects ... */}
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

            {/* ... existing header, progress, and terminal sections ... */}
            <Box sx={{
                position: 'relative',
                zIndex: 1,
                p: { xs: 2, sm: 3 },
            }}>
                <Box sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '3px',
                    background: 'linear-gradient(90deg, #00b0ff 0%, rgba(0,176,255,0) 100%)',
                    boxShadow: '0 0 10px rgba(0,176,255,0.5)',
                }}/>

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

                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: { xs: 'flex-start', sm: 'center' }
                    }}>
                        <Button
                            disabled={synchronizing || syncState['progress'] > 0 && syncState['progress'] < 100}
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
                            }}
                        >
                            <SyncIcon sx={{
                                mr: 1,
                                animation: syncState['progress'] > 0 && syncState['progress'] < 100 ? 'rotate 2s infinite linear' : 'none',
                                '@keyframes rotate': {
                                    '0%': { transform: 'rotate(0deg)' },
                                    '100%': { transform: 'rotate(360deg)' }
                                },
                                fontSize: { xs: '1rem', sm: '1.25rem' }
                            }}/>
                            Synchronize
                        </Button>

                        {syncState?.last_update && (
                            <Typography
                                variant="caption"
                                sx={{
                                    fontFamily: 'monospace',
                                    color: '#888888',
                                    fontSize: '0.65rem',
                                    mt: 0.5,
                                    textAlign: { xs: 'left', sm: 'center' },
                                }}
                            >
                                Last update: {humanizeDate(syncState.last_update)}
                            </Typography>
                        )}
                    </Box>
                </Box>

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
                        {`${Math.round(syncState['progress'])}%`}
                    </Typography>
                </Box>

                <Box sx={{ position: 'relative', mb: 2 }}>
                    <LinearProgress
                        variant="determinate"
                        value={syncState['progress']}
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

                    {syncState['progress'] > 0 && syncState['progress'] < 100 && (
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
                <Box sx={{
                    height: '60px',
                }}>
                    <Typography
                        variant="body2"
                        sx={{
                            fontFamily: 'monospace',
                            color: '#bbbbbb',
                            position: 'relative',
                            zIndex: 1,
                            fontSize: { xs: '0.8rem', sm: '0.875rem' },
                            '&::after': syncState['progress'] > 0 && syncState['progress'] < 100 ? {
                                content: '"█"',
                                animation: 'blink 1s infinite',
                                '@keyframes blink': {
                                    '0%': { opacity: 0 },
                                    '50%': { opacity: 1 },
                                    '100%': { opacity: 0 }
                                }
                            } : {},
                        }}
                    >
                        {syncState['message'] || (
                            syncState['progress'] === 0
                                ? 'Ready to synchronize. Click the button to start.'
                                : syncState['progress'] === 100
                                    ? 'Synchronization complete!'
                                    : 'Synchronizing satellite data...'
                        )}

                    </Typography>
                </Box>

                {/* New items notification - keep existing */}
                {hasNewItems && (
                    <Box sx={{
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        border: '1px solid rgba(76, 175, 80, 0.3)',
                        borderRadius: 1,
                        p: 1,
                        mb: 1,
                    }}>
                        <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                        }}
                             onClick={() => setShowNewItems(!showNewItems)}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <FiberNewIcon
                                    sx={{
                                        color: '#4caf50',
                                        mr: 1,
                                        fontSize: '1.2rem',
                                        animation: 'glow 2s infinite ease-in-out',
                                        '@keyframes glow': {
                                            '0%': { filter: 'drop-shadow(0 0 3px rgba(76,175,80,0.6))' },
                                            '50%': { filter: 'drop-shadow(0 0 8px rgba(76,175,80,0.9))' },
                                            '100%': { filter: 'drop-shadow(0 0 3px rgba(76,175,80,0.6))' }
                                        }
                                    }}
                                />
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: '#4caf50',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        fontSize: '0.75rem',
                                    }}
                                >
                                    New Items Added
                                </Typography>
                                <Box sx={{ ml: 1, display: 'flex', gap: 0.5 }}>
                                    <Chip
                                        label={`${newSatellitesCount} SAT`}
                                        size="small"
                                        sx={{
                                            backgroundColor: 'rgba(76, 175, 80, 0.2)',
                                            color: '#4caf50',
                                            fontSize: '0.6rem',
                                            height: '18px',
                                            fontWeight: 600,
                                        }}
                                    />
                                    <Chip
                                        label={`${newTransmittersCount} TRX`}
                                        size="small"
                                        sx={{
                                            backgroundColor: 'rgba(76, 175, 80, 0.2)',
                                            color: '#4caf50',
                                            fontSize: '0.6rem',
                                            height: '18px',
                                            fontWeight: 600,
                                        }}
                                    />
                                </Box>
                            </Box>
                            <IconButton
                                size="small"
                                sx={{ color: '#4caf50', p: 0.5 }}
                            >
                                {showNewItems ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                        </Box>

                        <Collapse in={showNewItems}>
                            <Box sx={{ mt: 1, maxHeight: '200px', overflowY: 'auto' }}>
                                {newSatellitesCount > 0 && (
                                    <Box sx={{ mb: 1 }}>
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: '#40c0ff',
                                                fontWeight: 600,
                                                fontSize: '0.7rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                mb: 0.5,
                                            }}
                                        >
                                            <SatelliteAltIcon sx={{ mr: 0.5, fontSize: '0.8rem' }} />
                                            Satellites ({newSatellitesCount})
                                        </Typography>
                                        <Box sx={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 0.5,
                                            maxHeight: '60px',
                                            overflowY: 'auto',
                                        }}>
                                            {syncState.newly_added.satellites.map((sat, index) => (
                                                <Chip
                                                    key={index}
                                                    label={`${sat.name} (${sat.norad_id})`}
                                                    size="small"
                                                    sx={{
                                                        backgroundColor: 'rgba(64, 192, 255, 0.1)',
                                                        color: '#40c0ff',
                                                        fontSize: '0.65rem',
                                                        fontFamily: 'monospace',
                                                    }}
                                                />
                                            ))}
                                        </Box>
                                    </Box>
                                )}

                                {newTransmittersCount > 0 && (
                                    <Box>
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: '#ff9800',
                                                fontWeight: 600,
                                                fontSize: '0.7rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                mb: 0.5,
                                            }}
                                        >
                                            <RadioIcon sx={{ mr: 0.5, fontSize: '0.8rem' }} />
                                            Transmitters ({newTransmittersCount})
                                        </Typography>
                                        <Box sx={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 0.5,
                                            maxHeight: '60px',
                                            overflowY: 'auto',
                                        }}>
                                            {syncState.newly_added.transmitters.map((trx, index) => (
                                                <Chip
                                                    key={index}
                                                    label={`${trx.description || 'Unknown'} (${trx.satellite_name})`}
                                                    size="small"
                                                    sx={{
                                                        backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                                        color: '#ff9800',
                                                        fontSize: '0.65rem',
                                                        fontFamily: 'monospace',
                                                    }}
                                                />
                                            ))}
                                        </Box>
                                    </Box>
                                )}
                            </Box>
                        </Collapse>
                    </Box>
                )}

                {/* Add removed items notification */}
                {hasRemovedItems && (
                    <Box sx={{
                        backgroundColor: 'rgba(244, 67, 54, 0.1)',
                        border: '1px solid rgba(244, 67, 54, 0.3)',
                        borderRadius: 1,
                        p: 1,
                        mb: 1,
                    }}>
                        <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                        }}
                             onClick={() => setShowRemovedItems(!showRemovedItems)}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <DeleteIcon
                                    sx={{
                                        color: '#f44336',
                                        mr: 1,
                                        fontSize: '1.2rem',
                                        animation: 'pulse 2s infinite ease-in-out',
                                        '@keyframes pulse': {
                                            '0%': { filter: 'drop-shadow(0 0 3px rgba(244,67,54,0.6))' },
                                            '50%': { filter: 'drop-shadow(0 0 8px rgba(244,67,54,0.9))' },
                                            '100%': { filter: 'drop-shadow(0 0 3px rgba(244,67,54,0.6))' }
                                        }
                                    }}
                                />
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: '#f44336',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        fontSize: '0.75rem',
                                    }}
                                >
                                    Items Removed
                                </Typography>
                                <Box sx={{ ml: 1, display: 'flex', gap: 0.5 }}>
                                    <Chip
                                        label={`${removedSatellitesCount} SAT`}
                                        size="small"
                                        sx={{
                                            backgroundColor: 'rgba(244, 67, 54, 0.2)',
                                            color: '#f44336',
                                            fontSize: '0.6rem',
                                            height: '18px',
                                            fontWeight: 600,
                                        }}
                                    />
                                    <Chip
                                        label={`${removedTransmittersCount} TRX`}
                                        size="small"
                                        sx={{
                                            backgroundColor: 'rgba(244, 67, 54, 0.2)',
                                            color: '#f44336',
                                            fontSize: '0.6rem',
                                            height: '18px',
                                            fontWeight: 600,
                                        }}
                                    />
                                </Box>
                            </Box>
                            <IconButton
                                size="small"
                                sx={{ color: '#f44336', p: 0.5 }}
                            >
                                {showRemovedItems ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                        </Box>

                        <Collapse in={showRemovedItems}>
                            <Box sx={{ mt: 1, maxHeight: '200px', overflowY: 'auto' }}>
                                {removedSatellitesCount > 0 && (
                                    <Box sx={{ mb: 1 }}>
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: '#40c0ff',
                                                fontWeight: 600,
                                                fontSize: '0.7rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                mb: 0.5,
                                            }}
                                        >
                                            <SatelliteAltIcon sx={{ mr: 0.5, fontSize: '0.8rem' }} />
                                            Satellites ({removedSatellitesCount})
                                        </Typography>
                                        <Box sx={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 0.5,
                                            maxHeight: '60px',
                                            overflowY: 'auto',
                                        }}>
                                            {syncState.removed.satellites.map((sat, index) => (
                                                <Chip
                                                    key={index}
                                                    label={`${sat.name} (${sat.norad_id})`}
                                                    size="small"
                                                    sx={{
                                                        backgroundColor: 'rgba(244, 67, 54, 0.1)',
                                                        color: '#f44336',
                                                        fontSize: '0.65rem',
                                                        fontFamily: 'monospace',
                                                    }}
                                                />
                                            ))}
                                        </Box>
                                    </Box>
                                )}

                                {removedTransmittersCount > 0 && (
                                    <Box>
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: '#ff5722',
                                                fontWeight: 600,
                                                fontSize: '0.7rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                mb: 0.5,
                                            }}
                                        >
                                            <RadioIcon sx={{ mr: 0.5, fontSize: '0.8rem' }} />
                                            Transmitters ({removedTransmittersCount})
                                        </Typography>
                                        <Box sx={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 0.5,
                                            maxHeight: '60px',
                                            overflowY: 'auto',
                                        }}>
                                            {syncState.removed.transmitters.map((trx, index) => (
                                                <Chip
                                                    key={index}
                                                    label={`${trx.description || 'Unknown'} (${trx.satellite_name})`}
                                                    size="small"
                                                    sx={{
                                                        backgroundColor: 'rgba(255, 87, 34, 0.1)',
                                                        color: '#ff5722',
                                                        fontSize: '0.65rem',
                                                        fontFamily: 'monospace',
                                                    }}
                                                />
                                            ))}
                                        </Box>
                                    </Box>
                                )}
                            </Box>
                        </Collapse>
                    </Box>
                )}
            </Box>
        </Card>
    );
};

export default SynchronizeTLEsCard;