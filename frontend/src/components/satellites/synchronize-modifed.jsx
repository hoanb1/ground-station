
import React from 'react';
import { Box, Typography, Paper, Tooltip, Chip } from '@mui/material';
import UpdateIcon from '@mui/icons-material/Update';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import RadioIcon from '@mui/icons-material/Radio';
import PropTypes from 'prop-types';

const ModifiedItemsTable = ({ modifiedSatellitesCount, modifiedTransmittersCount, syncState }) => {
    return (
        <Paper
            elevation={3}
            sx={{
                backgroundColor: 'rgba(3, 169, 244, 0.1)',
                border: '1px solid rgba(3, 169, 244, 0.3)',
                borderRadius: 1,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                height: 400,
            }}
        >
            <Box sx={{
                backgroundColor: 'rgba(3, 169, 244, 0.2)',
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}>
                <UpdateIcon
                    sx={{
                        color: '#03a9f4',
                        mr: 1,
                        fontSize: '1.2rem',
                    }}
                />
                <Typography
                    variant="subtitle1"
                    sx={{
                        color: '#03a9f4',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontSize: '0.85rem',
                    }}
                >
                    Modified Items
                </Typography>
            </Box>

            {/* Fixed Table Header */}
            <Box sx={{
                backgroundColor: 'rgba(3, 169, 244, 0.15)',
                borderBottom: '1px solid rgba(3, 169, 244, 0.3)',
                flexShrink: 0,
            }}>
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr 100px',
                    gap: 1,
                    p: 1,
                }}>
                    <Typography sx={{
                        color: '#03a9f4',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                    }}>
                        Type
                    </Typography>
                    <Typography sx={{
                        color: '#03a9f4',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        textAlign: 'left',
                        pl: 1,
                    }}>
                        Name
                    </Typography>
                    <Typography sx={{
                        color: '#03a9f4',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                    }}>
                        Changes
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
                    backgroundColor: 'rgba(3, 169, 244, 0.1)',
                },
                '&::-webkit-scrollbar-thumb': {
                    backgroundColor: 'rgba(3, 169, 244, 0.4)',
                    borderRadius: '4px',
                    '&:hover': {
                        backgroundColor: 'rgba(3, 169, 244, 0.6)',
                    },
                },
            }}>
                {/* Satellites */}
                {syncState.modified.satellites?.slice(0, 50).map((sat, index) => (
                    <Box
                        key={`sat-${index}`}
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: '80px 1fr 100px',
                            gap: 1,
                            p: 1,
                            borderBottom: '1px solid rgba(3, 169, 244, 0.1)',
                            '&:nth-of-type(even)': { backgroundColor: 'rgba(3, 169, 244, 0.05)' },
                            '&:hover': { backgroundColor: 'rgba(3, 169, 244, 0.1)' },
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
                            <Tooltip title={`${sat.name} (${sat.norad_id})`} placement="top">
                                <span>{sat.name}</span>
                            </Tooltip>
                        </Box>
                        <Box sx={{
                            color: '#aaaaaa',
                            fontSize: '0.65rem',
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textAlign: 'center',
                        }}>
                            <Tooltip title={Object.keys(sat.changes || {}).join(', ')} placement="top">
                                <span>{Object.keys(sat.changes || {}).join(', ')}</span>
                            </Tooltip>
                        </Box>
                    </Box>
                ))}

                {/* Transmitters */}
                {syncState.modified.transmitters?.slice(0, 50).map((trx, index) => (
                    <Box
                        key={`trx-${index}`}
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: '80px 1fr 100px',
                            gap: 1,
                            p: 1,
                            borderBottom: '1px solid rgba(3, 169, 244, 0.1)',
                            '&:nth-of-type(even)': { backgroundColor: 'rgba(3, 169, 244, 0.05)' },
                            '&:hover': { backgroundColor: 'rgba(3, 169, 244, 0.1)' },
                            alignItems: 'center',
                        }}
                    >
                        <Box sx={{
                            color: '#9c27b0',
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
                            fontSize: '0.65rem',
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textAlign: 'center',
                        }}>
                            <Tooltip title={Object.keys(trx.changes || {}).join(', ')} placement="top">
                                <span>{Object.keys(trx.changes || {}).join(', ')}</span>
                            </Tooltip>
                        </Box>
                    </Box>
                ))}

                {/* Show more indicator */}
                {(modifiedSatellitesCount + modifiedTransmittersCount > 100) && (
                    <Box sx={{
                        textAlign: 'center',
                        color: '#03a9f4',
                        fontSize: '0.7rem',
                        fontStyle: 'italic',
                        p: 2,
                    }}>
                        +{(modifiedSatellitesCount + modifiedTransmittersCount) - 100} more items...
                    </Box>
                )}
            </Box>

            <Box sx={{
                p: 1,
                backgroundColor: 'rgba(3, 169, 244, 0.1)',
                display: 'flex',
                justifyContent: 'center',
                gap: 1,
                flexShrink: 0,
            }}>
                <Chip
                    label={`${modifiedSatellitesCount} Satellites`}
                    size="small"
                    sx={{
                        backgroundColor: 'rgba(64, 192, 255, 0.2)',
                        color: '#40c0ff',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                    }}
                />
                <Chip
                    label={`${modifiedTransmittersCount} Transmitters`}
                    size="small"
                    sx={{
                        backgroundColor: 'rgba(156, 39, 176, 0.2)',
                        color: '#9c27b0',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                    }}
                />
            </Box>
        </Paper>
    );
};

ModifiedItemsTable.propTypes = {
    modifiedSatellitesCount: PropTypes.number.isRequired,
    modifiedTransmittersCount: PropTypes.number.isRequired,
    syncState: PropTypes.object.isRequired,
};

export default ModifiedItemsTable;