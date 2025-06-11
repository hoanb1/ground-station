
import React, { useState } from 'react';
import { Chip, Tooltip } from '@mui/material';
import { useWakeLockContext } from './dashboard-wake-lock-provider.jsx';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import WarningIcon from '@mui/icons-material/Warning';

const WakeLockStatus = ({ variant = 'outlined', size = 'small' }) => {
    const { isSupported, isActive, activeRequests, forceRelease, acquire } = useWakeLockContext();
    const [manualOverride, setManualOverride] = useState(false);

    if (!isSupported) {
        return (
            <Tooltip title="Wake lock not supported on this device">
                <Chip
                    icon={<WarningIcon />}
                    label="Wake lock unsupported"
                    color="warning"
                    variant={variant}
                    size={size}
                />
            </Tooltip>
        );
    }

    const handleClick = async () => {
        if (isActive) {
            // Release all wake locks
            forceRelease();
            setManualOverride(false);
        } else {
            // Manually acquire wake lock
            const success = await acquire();
            if (success) {
                setManualOverride(true);
            }
        }
    };

    // Determine if this is a manual override or component-requested
    const isManuallyActive = isActive && manualOverride;
    const isComponentActive = isActive && !manualOverride;

    const getTooltipText = () => {
        if (isManuallyActive) {
            return 'Manual wake lock active. Click to release.';
        } else if (isComponentActive) {
            return `Screen wake lock active (${activeRequests} component request${activeRequests !== 1 ? 's' : ''}). Click to release all.`;
        } else {
            return 'Screen can sleep. Click to manually activate wake lock.';
        }
    };

    const getLabel = () => {
        if (isManuallyActive) {
            return 'Manual wake lock';
        } else if (isComponentActive) {
            return `Wake lock (${activeRequests})`;
        } else {
            return 'Screen can sleep';
        }
    };

    const getColor = () => {
        if (isManuallyActive) {
            return 'primary';
        } else if (isComponentActive) {
            return 'success';
        } else {
            return 'default';
        }
    };

    return (
        <Tooltip title={getTooltipText()}>
            <Chip
                icon={isActive ? <LockIcon /> : <LockOpenIcon />}
                label={getLabel()}
                color={getColor()}
                variant={variant}
                size={size}
                onClick={handleClick}
                clickable={true}
            />
        </Tooltip>
    );
};

export default WakeLockStatus;