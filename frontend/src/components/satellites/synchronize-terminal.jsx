import React from 'react';
import { Box, Typography } from '@mui/material';
import PropTypes from 'prop-types';

const SyncTerminal = ({ syncState }) => {
    return (
        <>
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
                        '&::after': (syncState['progress'] > 0 && syncState['progress'] < 100) ? {
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
        </>
    );
};

SyncTerminal.propTypes = {
    syncState: PropTypes.object.isRequired,
};

export default SyncTerminal;