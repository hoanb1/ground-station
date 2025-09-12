import React, { useState, useEffect } from 'react';
import { Typography, Box, Tooltip } from '@mui/material';

const VersionInfo = () => {
    const [version, setVersion] = useState({
        version: import.meta.env.VITE_APP_VERSION_BUILD || 'dev',
        commit: import.meta.env.VITE_APP_VERSION_COMMIT || 'unknown'
    });

    // Optionally fetch from backend if you want to ensure consistency
    useEffect(() => {
        fetch('/api/version')
            .then(response => response.json())
            .then(data => {
                setVersion({
                    version: data.version_full,
                    commit: data.git_commit
                });
            })
            .catch(err => {
                console.error('Error fetching version info:', err);
            });
    }, []);

    return (
        <Tooltip title={`Full version: ${version.version}, Commit: ${version.commit}`}>
            <Box sx={{ opacity: 0.7, fontSize: '0.75rem', padding: '4px 8px' }}>
                <Typography variant="caption">{version.version}</Typography>
            </Box>
        </Tooltip>
    );
}

export default VersionInfo;
