
import React, { useState, useEffect } from 'react';
import { Box, Button, Typography, Paper, IconButton } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import InfoIcon from '@mui/icons-material/Info';

const SatelliteTrackSuggestion = ({
                                      selectedSatelliteId,
                                      trackingSatelliteId,
                                      selectedSatellite,
                                      handleSetTrackingOnBackend
                                  }) => {
    const navigate = useNavigate();

    if (!selectedSatellite) {
        return null;
    }

    const handleNavigateToSatellite = () => {
        navigate(`/satellite/${selectedSatelliteId}`);
    };

    return (
        <Paper
            elevation={4}
            sx={{
                position: 'absolute',
                bottom: 40,
                left: 10,
                zIndex: 1000,
                padding: 2,
                maxWidth: 300,
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

                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
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
                            flex: 1,
                            '&:hover': {
                                backgroundColor: '#00796b',
                            }
                        }}
                        title={"Start tracking " + (selectedSatellite['name'] || "this satellite") + " with the rotator and rig"}
                    >
                        Track Satellite
                    </Button>

                    <IconButton
                        onClick={handleNavigateToSatellite}
                        sx={{
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            color: '#fff',
                            '&:hover': {
                                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                            }
                        }}
                        size="small"
                        title="View satellite details"
                    >
                        <InfoIcon/>
                    </IconButton>
                </Box>
            </Box>
        </Paper>
    );
};

export default SatelliteTrackSuggestion;