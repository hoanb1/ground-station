import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, Paper } from '@mui/material';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';

const SatelliteTrackSuggestion = ({
                                      selectedSatelliteId,
                                      trackingSatelliteId,
                                      selectedSatellite,
                                      handleSetTrackingOnBackend
                                  }) => {

    if (!selectedSatellite) {
        return null;
    }

    return (
        <Paper
            elevation={4}
            sx={{
                position: 'absolute',
                bottom: 40,
                left: 10,
                zIndex: 1000,
                padding: 2,
                maxWidth: 250,
                backgroundColor: 'rgba(25, 25, 25, 0.8)',
                backdropFilter: 'blur(5px)',
                borderRadius: 2,
                transition: 'all 0.3s ease',
                border: '1px solid #444',
            }}
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="subtitle2" component="div" sx={{color: '#fff', mb: 1}}>
                    {trackingSatelliteId === selectedSatelliteId ? 'Already tracking this satellite' : `Start tracking ${selectedSatellite['name'] || 'this satellite'}?`}
                </Typography>

                <Button
                    disabled={!selectedSatelliteId || trackingSatelliteId === selectedSatelliteId}
                    variant="contained"
                    color="primary"
                    startIcon={<TrackChangesIcon />}
                    onClick={() => {
                        handleSetTrackingOnBackend(selectedSatelliteId);
                    }}
                    sx={{
                        fontWeight: 'bold',
                        '&:hover': {
                            backgroundColor: '#00796b',
                        }
                    }}
                >
                    Track Satellite
                </Button>
            </Box>
        </Paper>
    );
};

export default SatelliteTrackSuggestion;