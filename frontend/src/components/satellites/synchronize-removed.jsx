import React from 'react';
import { Box, Typography, Paper, Tooltip, Chip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import RadioIcon from '@mui/icons-material/Radio';
import PropTypes from 'prop-types';

const RemovedItemsTable = ({ removedSatellitesCount, removedTransmittersCount, syncState }) => {
    return (
        <Paper
            elevation={3}
            sx={{
                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                border: '1px solid rgba(244, 67, 54, 0.3)',
                borderRadius: 1,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                height: 400,
            }}
        >
            <Box sx={{
                backgroundColor: 'rgba(244, 67, 54, 0.2)',
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}>
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
                    variant="subtitle1"
                    sx={{
                        color: '#f44336',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontSize: '0.85rem',
                    }}
                >
                    Removed Items
                </Typography>
            </Box>

            {/* Fixed Table Header */}
            <Box sx={{
                backgroundColor: 'rgba(244, 67, 54, 0.15)',
                borderBottom: '1px solid rgba(244, 67, 54, 0.3)',
                flexShrink: 0,
            }}>
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr 80px',
                    gap: 1,
                    p: 1,
                }}>
                    <Typography sx={{
                        color: '#f44336',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                    }}>
                        Type
                    </Typography>
                    <Typography sx={{
                        color: '#f44336',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        textAlign: 'left',
                        pl: 1,
                    }}>
                        Name
                    </Typography>
                    <Typography sx={{
                        color: '#f44336',
                        fontWeight: 600,
                        fontSize: '0.7rem',
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
                    width: '8px',
                },
                '&::-webkit-scrollbar-track': {
                    backgroundColor: 'rgba(244, 67, 54, 0.1)',
                },
                '&::-webkit-scrollbar-thumb': {
                    backgroundColor: 'rgba(244, 67, 54, 0.4)',
                    borderRadius: '4px',
                    '&:hover': {
                        backgroundColor: 'rgba(244, 67, 54, 0.6)',
                    },
                },
            }}>
                {/* Satellites */}
                {syncState.removed.satellites?.slice(0, 50).map((sat, index) => (
                    <Box
                        key={`sat-${index}`}
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: '80px 1fr 80px',
                            gap: 1,
                            p: 1,
                            borderBottom: '1px solid rgba(244, 67, 54, 0.1)',
                            '&:nth-of-type(even)': { backgroundColor: 'rgba(244, 67, 54, 0.05)' },
                            '&:hover': { backgroundColor: 'rgba(244, 67, 54, 0.1)' },
                            alignItems: 'center',
                        }}
                    >
                        <Box sx={{
                            color: '#40c0ff',
                            fontSize: '0.7rem',
                            fontFamily: 'monospace',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <SatelliteAltIcon sx={{ fontSize: '0.8rem', mr: 0.5 }} />
                            SAT
                        </Box>
                        <Box sx={{
                            color: '#ffffff',
                            fontSize: '0.7rem',
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textAlign: 'left',
                            pl: 1,
                        }}>
                            <Tooltip title={sat.name} placement="top">
                                <span>{sat.name}</span>
                            </Tooltip>
                        </Box>
                        <Box sx={{
                            color: '#aaaaaa',
                            fontSize: '0.7rem',
                            fontFamily: 'monospace',
                            textAlign: 'center',
                        }}>
                            {sat.norad_id}
                        </Box>
                    </Box>
                ))}

                {/* Transmitters */}
                {syncState.removed.transmitters?.slice(0, 50).map((trx, index) => (
                    <Box
                        key={`trx-${index}`}
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: '80px 1fr 80px',
                            gap: 1,
                            p: 1,
                            borderBottom: '1px solid rgba(244, 67, 54, 0.1)',
                            '&:nth-of-type(even)': { backgroundColor: 'rgba(244, 67, 54, 0.05)' },
                            '&:hover': { backgroundColor: 'rgba(244, 67, 54, 0.1)' },
                            alignItems: 'center',
                        }}
                    >
                        <Box sx={{
                            color: '#ff5722',
                            fontSize: '0.7rem',
                            fontFamily: 'monospace',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <RadioIcon sx={{ fontSize: '0.8rem', mr: 0.5 }} />
                            TRX
                        </Box>
                        <Box sx={{
                            color: '#ffffff',
                            fontSize: '0.7rem',
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textAlign: 'left',
                            pl: 1,
                        }}>
                            <Tooltip title={`${trx.description || 'Unknown'} (${trx.satellite_name})`} placement="top">
                                <span>{trx.description || 'Unknown'}</span>
                            </Tooltip>
                        </Box>
                        <Box sx={{
                            color: '#aaaaaa',
                            fontSize: '0.7rem',
                            fontFamily: 'monospace',
                            textAlign: 'center',
                        }}>
                            {trx.satellite_name}
                        </Box>
                    </Box>
                ))}

                {/* Show more indicator */}
                {(removedSatellitesCount + removedTransmittersCount > 100) && (
                    <Box sx={{
                        textAlign: 'center',
                        color: '#f44336',
                        fontSize: '0.7rem',
                        fontStyle: 'italic',
                        p: 2,
                    }}>
                        +{(removedSatellitesCount + removedTransmittersCount) - 100} more items...
                    </Box>
                )}
            </Box>

            <Box sx={{
                p: 1,
                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                display: 'flex',
                justifyContent: 'center',
                gap: 1,
                flexShrink: 0,
            }}>
                <Chip
                    label={`${removedSatellitesCount} Satellites`}
                    size="small"
                    sx={{
                        backgroundColor: 'rgba(64, 192, 255, 0.2)',
                        color: '#40c0ff',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                    }}
                />
                <Chip
                    label={`${removedTransmittersCount} Transmitters`}
                    size="small"
                    sx={{
                        backgroundColor: 'rgba(255, 87, 34, 0.2)',
                        color: '#ff5722',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                    }}
                />
            </Box>
        </Paper>
    );
};

RemovedItemsTable.propTypes = {
    removedSatellitesCount: PropTypes.number.isRequired,
    removedTransmittersCount: PropTypes.number.isRequired,
    syncState: PropTypes.object.isRequired,
};

export default RemovedItemsTable;