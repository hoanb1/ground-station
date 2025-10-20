import React from 'react';
import { Box, Typography, Paper, Tooltip, Chip } from '@mui/material';
import UpdateIcon from '@mui/icons-material/Update';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import RadioIcon from '@mui/icons-material/Radio';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

const ModifiedItemsTable = ({ modifiedSatellitesCount, modifiedTransmittersCount, syncState }) => {
    const { t } = useTranslation('satellites');
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
                height: { xs: 350, sm: 380, md: 400 },
                minHeight: 300,
            }}
        >
            <Box sx={{
                backgroundColor: 'rgba(3, 169, 244, 0.2)',
                p: { xs: 1, sm: 1.5 },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}>
                <Typography
                    variant="subtitle1"
                    sx={{
                        color: '#03a9f4',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontSize: { xs: '0.75rem', sm: '0.85rem' },
                    }}
                >
                    {t('synchronize.results.modified')}
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
                    gridTemplateColumns: { xs: '50px 1fr 70px', sm: '60px 1fr 80px', md: '80px 1fr 100px' },
                    gap: { xs: 0.5, sm: 0.75, md: 1 },
                    p: { xs: 0.75, sm: 1 },
                }}>
                    <Typography sx={{
                        color: '#03a9f4',
                        fontWeight: 600,
                        fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                        textTransform: 'uppercase',
                        textAlign: 'center',
                    }}>
                        {t('synchronize.results.type')}
                    </Typography>
                    <Typography sx={{
                        color: '#03a9f4',
                        fontWeight: 600,
                        fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                        textTransform: 'uppercase',
                        textAlign: 'left',
                        pl: { xs: 0.5, sm: 0.75, md: 1 },
                    }}>
                        {t('synchronize.results.name')}
                    </Typography>
                    <Typography sx={{
                        color: '#03a9f4',
                        fontWeight: 600,
                        fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                        textTransform: 'uppercase',
                        textAlign: 'center',
                    }}>
                        {t('synchronize.results.changes')}
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
                            gridTemplateColumns: { xs: '50px 1fr 70px', sm: '60px 1fr 80px', md: '80px 1fr 100px' },
                            gap: { xs: 0.5, sm: 0.75, md: 1 },
                            p: { xs: 0.75, sm: 1 },
                            borderBottom: '1px solid rgba(3, 169, 244, 0.1)',
                            '&:nth-of-type(even)': { backgroundColor: 'rgba(3, 169, 244, 0.05)' },
                            '&:hover': { backgroundColor: 'rgba(3, 169, 244, 0.1)' },
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
                            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{t('synchronize.results.sat')}</Box>
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
                            <Tooltip title={`${sat.name} (${sat.norad_id})`} placement="top">
                                <span>{sat.name}</span>
                            </Tooltip>
                        </Box>
                        <Box sx={{
                            color: '#aaaaaa',
                            fontSize: { xs: '0.55rem', sm: '0.6rem', md: '0.65rem' },
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
                            gridTemplateColumns: { xs: '50px 1fr 70px', sm: '60px 1fr 80px', md: '80px 1fr 100px' },
                            gap: { xs: 0.5, sm: 0.75, md: 1 },
                            p: { xs: 0.75, sm: 1 },
                            borderBottom: '1px solid rgba(3, 169, 244, 0.1)',
                            '&:nth-of-type(even)': { backgroundColor: 'rgba(3, 169, 244, 0.05)' },
                            '&:hover': { backgroundColor: 'rgba(3, 169, 244, 0.1)' },
                            alignItems: 'center',
                        }}
                    >
                        <Box sx={{
                            color: '#9c27b0',
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
                            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{t('synchronize.results.trx')}</Box>
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
                            <Tooltip title={`${trx.description || t('synchronize.results.unknown')} (${trx.satellite_name})`} placement="top">
                                <span>{trx.description || t('synchronize.results.unknown')}</span>
                            </Tooltip>
                        </Box>
                        <Box sx={{
                            color: '#aaaaaa',
                            fontSize: { xs: '0.55rem', sm: '0.6rem', md: '0.65rem' },
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
                        fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                        fontStyle: 'italic',
                        p: { xs: 1.5, sm: 2 },
                    }}>
                        {t('synchronize.results.more_items', { count: (modifiedSatellitesCount + modifiedTransmittersCount) - 100 })}
                    </Box>
                )}
            </Box>

            <Box sx={{
                p: { xs: 0.75, sm: 1 },
                backgroundColor: 'rgba(3, 169, 244, 0.1)',
                display: 'flex',
                justifyContent: 'center',
                gap: { xs: 0.5, sm: 1 },
                flexShrink: 0,
                flexWrap: 'wrap',
            }}>
                <Chip
                    label={t('synchronize.results.satellites_count', { count: modifiedSatellitesCount })}
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
                    label={t('synchronize.results.transmitters_count', { count: modifiedTransmittersCount })}
                    size="small"
                    sx={{
                        backgroundColor: 'rgba(156, 39, 176, 0.2)',
                        color: '#9c27b0',
                        fontSize: { xs: '0.55rem', sm: '0.6rem', md: '0.65rem' },
                        fontWeight: 600,
                        height: { xs: 16, sm: 18 },
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