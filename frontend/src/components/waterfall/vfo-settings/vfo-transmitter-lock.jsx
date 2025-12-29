/**
 * VFO Transmitter Lock Components
 *
 * Components for locking VFO to doppler-corrected transmitters
 */

import React from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem, Link, Alert } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { useTranslation } from 'react-i18next';

/**
 * Transmitter Lock Select Component
 */
export const TransmitterLockSelect = ({
    vfoIndex,
    vfoActive,
    lockedTransmitterId,
    transmitters,
    onVFOPropertyChange
}) => {
    const { t } = useTranslation('waterfall');

    const handleChange = (e) => {
        const transmitterId = e.target.value === 'none' ? 'none' : e.target.value;

        if (transmitterId !== 'none') {
            // Locking to a transmitter - set frequency and lock, but don't change mode
            const transmitter = transmitters.find(tx => tx.id === transmitterId);
            if (transmitter) {
                onVFOPropertyChange(vfoIndex, {
                    lockedTransmitterId: transmitterId,
                    frequency: transmitter.downlink_observed_freq,
                    frequencyOffset: 0
                });
            }
        } else {
            // Unlocking - just clear the lock and reset offset
            onVFOPropertyChange(vfoIndex, {
                lockedTransmitterId: 'none',
                frequencyOffset: 0
            });
        }
    };

    const currentValue = (() => {
        if (!lockedTransmitterId || lockedTransmitterId === 'none') return 'none';
        // Check if the current value exists in the transmitters list
        const exists = transmitters.some(tx => tx.id === lockedTransmitterId);
        return exists ? lockedTransmitterId : 'none';
    })();

    const isLocked = lockedTransmitterId && lockedTransmitterId !== 'none';

    return (
        <Box sx={{ mt: 2 }}>
            <FormControl fullWidth size="small" disabled={!vfoActive} variant="filled">
                <InputLabel id={`vfo-${vfoIndex}-lock-transmitter-label`}>
                    {isLocked ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <LockIcon fontSize="small" />
                            {t('vfo.lock_to_transmitter', 'Lock to Transmitter')}
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <LockOpenIcon fontSize="small" />
                            {t('vfo.lock_to_transmitter', 'Lock to Transmitter')}
                        </Box>
                    )}
                </InputLabel>
                <Select
                    variant={'filled'}
                    labelId={`vfo-${vfoIndex}-lock-transmitter-label`}
                    value={currentValue}
                    label={t('vfo.lock_to_transmitter', 'Lock to Transmitter')}
                    onChange={handleChange}
                    sx={{ fontSize: '0.875rem' }}
                >
                    <MenuItem value="none" sx={{ fontSize: '0.875rem' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LockOpenIcon fontSize="small" />
                            {t('vfo.none', 'None')}
                        </Box>
                    </MenuItem>
                    {transmitters.map((tx) => (
                        <MenuItem key={tx.id} value={tx.id} sx={{ fontSize: '0.875rem' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                <Box
                                    sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        backgroundColor: tx.alive ? 'success.main' : 'error.main',
                                        boxShadow: (theme) => tx.alive
                                            ? `0 0 6px ${theme.palette.success.main}99`
                                            : `0 0 6px ${theme.palette.error.main}99`,
                                        flexShrink: 0,
                                    }}
                                />
                                <Box sx={{ flex: 1 }}>
                                    <Box sx={{ fontWeight: 600 }}>{tx.description}</Box>
                                    <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                                        {(tx.downlink_observed_freq / 1e6).toFixed(6)} MHz ({tx.mode})
                                    </Box>
                                </Box>
                            </Box>
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Box>
    );
};

/**
 * Transmitter Edit Link Component
 */
export const TransmitterEditLink = ({ targetSatelliteName, onOpenDialog }) => {
    if (!targetSatelliteName) return null;

    return (
        <Box sx={{ mt: 0.5, textAlign: 'center' }}>
            <Link
                component="button"
                variant="caption"
                onClick={onOpenDialog}
                sx={{
                    fontSize: '0.7rem',
                    color: 'text.disabled',
                    textDecoration: 'none',
                    '&:hover': {
                        color: 'text.secondary',
                        textDecoration: 'underline',
                    },
                    cursor: 'pointer',
                }}
            >
                Edit {targetSatelliteName} transmitters here
            </Link>
        </Box>
    );
};

/**
 * Locked Transmitter Alert Component
 */
export const LockedTransmitterAlert = ({ lockedTransmitterId }) => {
    const { t } = useTranslation('waterfall');

    if (!lockedTransmitterId || lockedTransmitterId === 'none') return null;

    return (
        <Alert
            severity="info"
            icon={<LockIcon fontSize="small" />}
            sx={{
                mt: 1,
                mb: 1,
                py: 0.5,
                fontSize: '0.875rem',
                '& .MuiAlert-icon': {
                    fontSize: '1rem'
                }
            }}
        >
            {t('vfo.locked_to_transmitter_info', 'Tracking doppler-corrected frequency')}
        </Alert>
    );
};
