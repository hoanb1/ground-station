import React from 'react';
import { Box, Typography, Paper, Tooltip, Chip } from '@mui/material';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import RadioIcon from '@mui/icons-material/Radio';
import PropTypes from 'prop-types';

const AddedItemsTable = ({ newSatellitesCount, newTransmittersCount, syncState }) => {
    return (
        <Paper
            elevation={3}
            sx={{
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                border: '1px solid rgba(76, 175, 80, 0.3)',
                borderRadius: 1,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                height: { xs: 350, sm: 380, md: 400 },
                minHeight: 300,
            }}
        >
            <Box sx={{
                backgroundColor: 'rgba(76, 175, 80, 0.2)',
                p: { xs: 1, sm: 1.5 },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}>
                <Typography
                    variant="subtitle1"
                    sx={{
                        color: '#4caf50',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontSize: { xs: '0.75rem', sm: '0.85rem' },
                    }}
                >
                    Added Items
                </Typography>
            </Box>

            {/* Fixed Table Header */}
            <Box sx={{
                backgroundColor: 'rgba(76, 175, 80, 0.15)',
                borderBottom: '1px solid rgba(76, 175, 80, 0.3)',
                flexShrink: 0,
            }}>
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '60px 1fr 60px', sm: '70px 1fr 70px', md: '80px 1fr 80px' },
                    gap: { xs: 0.5, sm: 0.75, md: 1 },
                    p: { xs: 0.75, sm: 1 },
                }}>
                    <Typography sx={{
                        color: '#4caf50',
                        fontWeight: 600,
                        fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                        textTransform: 'uppercase',
                        textAlign: 'center',
                    }}>
                        Type
                    </Typography>
                    <Typography sx={{
                        color: '#4caf50',
                        fontWeight: 600,
                        fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                        textTransform: 'uppercase',
                        textAlign: 'left',
                        pl: { xs: 0.5, sm: 0.75, md: 1 },
                    }}>
                        Name
                    </Typography>
                    <Typography sx={{
                        color: '#4caf50',
                        fontWeight: 600,
                        fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                        textTransform: 'uppercase',
                        textAlign: 'center',
                    }}>
                        ID
                    </Typography>
                </Box>
            </Box>

            {/* Scrollable Content Area */}
            <Box sx={{
                flex: 1,
                overflow: 'auto',
                '&::-webkit-scrollbar': {
                    width: { xs: '4px', sm: '6px', md: '8px' },
                },
                '&::-webkit-scrollbar-track': {
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                },
                '&::-webkit-scrollbar-thumb': {
                    backgroundColor: 'rgba(76, 175, 80, 0.4)',
                    borderRadius: '4px',
                    '&:hover': {
                        backgroundColor: 'rgba(76, 175, 80, 0.6)',
                    },
                },
            }}>
                {/* Satellites */}
                {syncState.newly_added.satellites?.slice(0, 50).map((sat, index) => (
                    <Box
                        key={`sat-${index}`}
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '60px 1fr 60px', sm: '70px 1fr 70px', md: '80px 1fr 80px' },
                            gap: { xs: 0.5, sm: 0.75, md: 1 },
                            p: { xs: 0.75, sm: 1 },
                            borderBottom: '1px solid rgba(76, 175, 80, 0.1)',
                            '&:nth-of-type(even)': { backgroundColor: 'rgba(76, 175, 80, 0.05)' },
                            '&:hover': { backgroundColor: 'rgba(76, 175, 80, 0.1)' },
                            alignItems: 'center',
                        }}
                    >
                        <Box sx={{
                            color: '#40c0ff',
                            fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                            fontFamily: 'monospace',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <SatelliteAltIcon sx={{
                                fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' },
                                mr: { xs: 0.25, sm: 0.5 }
                            }} />
                            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>SAT</Box>
                        </Box>
                        <Box sx={{
                            color: '#ffffff',
                            fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textAlign: 'left',
                            pl: { xs: 0.5, sm: 0.75, md: 1 },
                        }}>
                            <Tooltip title={sat.name} placement="top">
                                <span>{sat.name}</span>
                            </Tooltip>
                        </Box>
                        <Box sx={{
                            color: '#aaaaaa',
                            fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                            fontFamily: 'monospace',
                            textAlign: 'center',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}>
                            {sat.norad_id}
                        </Box>
                    </Box>
                ))}

                {/* Transmitters */}
                {syncState.newly_added.transmitters?.slice(0, 50).map((trx, index) => (
                    <Box
                        key={`trx-${index}`}
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '60px 1fr 60px', sm: '70px 1fr 70px', md: '80px 1fr 80px' },
                            gap: { xs: 0.5, sm: 0.75, md: 1 },
                            p: { xs: 0.75, sm: 1 },
                            borderBottom: '1px solid rgba(76, 175, 80, 0.1)',
                            '&:nth-of-type(even)': { backgroundColor: 'rgba(76, 175, 80, 0.05)' },
                            '&:hover': { backgroundColor: 'rgba(76, 175, 80, 0.1)' },
                            alignItems: 'center',
                        }}
                    >
                        <Box sx={{
                            color: '#ff9800',
                            fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                            fontFamily: 'monospace',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <RadioIcon sx={{
                                fontSize: { xs: '0.7rem', sm: '0.75rem', md: '0.8rem' },
                                mr: { xs: 0.25, sm: 0.5 }
                            }} />
                            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>TRX</Box>
                        </Box>
                        <Box sx={{
                            color: '#ffffff',
                            fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textAlign: 'left',
                            pl: { xs: 0.5, sm: 0.75, md: 1 },
                        }}>
                            <Tooltip title={`${trx.description || 'Unknown'} (${trx.satellite_name})`} placement="top">
                                <span>{trx.description || 'Unknown'}</span>
                            </Tooltip>
                        </Box>
                        <Box sx={{
                            color: '#aaaaaa',
                            fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                            fontFamily: 'monospace',
                            textAlign: 'center',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}>
                            {trx.satellite_name}
                        </Box>
                    </Box>
                ))}

                {/* Show more indicator */}
                {(newSatellitesCount + newTransmittersCount > 100) && (
                    <Box sx={{
                        textAlign: 'center',
                        color: '#4caf50',
                        fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                        fontStyle: 'italic',
                        p: { xs: 1.5, sm: 2 },
                    }}>
                        +{(newSatellitesCount + newTransmittersCount) - 100} more items...
                    </Box>
                )}
            </Box>

            <Box sx={{
                p: { xs: 0.75, sm: 1 },
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                display: 'flex',
                justifyContent: 'center',
                gap: { xs: 0.5, sm: 1 },
                flexShrink: 0,
                flexWrap: 'wrap',
            }}>
                <Chip
                    label={`${newSatellitesCount} Satellites`}
                    size="small"
                    sx={{
                        backgroundColor: 'rgba(64, 192, 255, 0.2)',
                        color: '#40c0ff',
                        fontSize: { xs: '0.55rem', sm: '0.6rem', md: '0.65rem' },
                        fontWeight: 600,
                        height: { xs: 16, sm: 18 },
                    }}
                />
                <Chip
                    label={`${newTransmittersCount} Transmitters`}
                    size="small"
                    sx={{
                        backgroundColor: 'rgba(255, 152, 0, 0.2)',
                        color: '#ff9800',
                        fontSize: { xs: '0.55rem', sm: '0.6rem', md: '0.65rem' },
                        fontWeight: 600,
                        height: { xs: 16, sm: 18 },
                    }}
                />
            </Box>
        </Paper>
    );
};

AddedItemsTable.propTypes = {
    newSatellitesCount: PropTypes.number.isRequired,
    newTransmittersCount: PropTypes.number.isRequired,
    syncState: PropTypes.object.isRequired,
};

export default AddedItemsTable;