
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Typography, Box, Chip, Tooltip } from '@mui/material';
import { fetchVersionInfo } from './version-slice';

const VersionInfo = ({ minimal = false }) => {
    const dispatch = useDispatch();
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
                <Tooltip title={`Full version: ${data?.version || 'Unknown'}`}>
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
        return <Typography variant="caption">Loading version...</Typography>;
    }

    if (error) {
        return <Typography variant="caption" color="error">Version unavailable</Typography>;
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="body2">
                    <strong>Version:</strong> {data?.version || 'Unknown'}
                </Typography>
                <Chip
                    label={environment === 'production' ? 'PRODUCTION' : 'DEVELOPMENT'}
                    size="small"
                    color={envColor}
                />
            </Box>
            <Typography variant="caption" display="block">
                <strong>Build Date:</strong> {data?.buildDate || 'Unknown'}
            </Typography>
            <Typography variant="caption" display="block">
                <strong>Git Commit:</strong> {data?.gitCommit || 'Unknown'}
            </Typography>
        </Box>
    );
};

export default VersionInfo;