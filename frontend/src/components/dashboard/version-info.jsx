
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Typography, Box, Chip, Tooltip } from '@mui/material';
import { fetchVersionInfo } from './version-slice';
import { useTranslation } from 'react-i18next';

const VersionInfo = ({ minimal = false }) => {
    const dispatch = useDispatch();
    const { t } = useTranslation('dashboard');
    const { data, loading, error } = useSelector((state) => state.version);

    // Determine environment
    const environment = import.meta.env.MODE || 'unknown';
    const envColor = environment === 'production' ? 'error' : 'success';

    useEffect(() => {
        // Fetch version info when component mounts if not already loaded
        if (!data && !loading) {
            dispatch(fetchVersionInfo());
        }
    }, [dispatch, data, loading]);

    if (minimal) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Tooltip title={`${data?.version || t('version_info.unknown')}`}>
                    <Chip
                        label={data?.version?.split('-')[0] || 'v?.?.?'}
                        size="small"
                        variant="outlined"
                        sx={{
                            fontSize: '0.6rem',
                            height: '18px',
                            backgroundColor: 'rgba(0, 0, 0, 0.1)',
                            '& .MuiChip-label': { px: 1 }
                        }}
                    />
                </Tooltip>
                <Tooltip title={`Environment: ${environment}`}>
                    <Chip
                        label={environment === 'production' ? 'PROD' : 'DEV'}
                        size="small"
                        color={envColor}
                        sx={{
                            fontSize: '0.6rem',
                            height: '18px',
                            '& .MuiChip-label': { px: 1 }
                        }}
                    />
                </Tooltip>
            </Box>
        );
    }

    if (loading) {
        return <Typography variant="caption">{t('version_info.loading')}</Typography>;
    }

    if (error) {
        return <Typography variant="caption" color="error">{t('version_info.unavailable')}</Typography>;
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="body2">
                    <strong>{t('version_info.version')}</strong> {data?.version || t('version_info.unknown')}
                </Typography>
                <Chip
                    label={environment === 'production' ? 'PRODUCTION' : 'DEVELOPMENT'}
                    size="small"
                    color={envColor}
                />
            </Box>
            <Typography variant="caption" display="block">
                <strong>{t('version_info.build_date')}</strong> {data?.buildDate || t('version_info.unknown')}
            </Typography>
            <Typography variant="caption" display="block">
                <strong>{t('version_info.git_commit')}</strong> {data?.gitCommit || t('version_info.unknown')}
            </Typography>
        </Box>
    );
};

export default VersionInfo;