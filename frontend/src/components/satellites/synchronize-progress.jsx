import React from 'react';
import { Box, Typography } from '@mui/material';
import LinearProgress from '@mui/material/LinearProgress';
import PropTypes from 'prop-types';

const SyncProgressBar = ({ syncState }) => {
    return (
        <>
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
        </>
    );
};

SyncProgressBar.propTypes = {
    syncState: PropTypes.object.isRequired,
};

export default SyncProgressBar;