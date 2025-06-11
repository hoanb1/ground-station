import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { useWakeLockContext } from './dashboard-wake-lock-provider.jsx';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import WarningIcon from '@mui/icons-material/Warning';

const WakeLockStatus = ({ variant = 'outlined', size = 'small' }) => {
    const {
        isSupported,
        isActive,
        activeRequests,
        hasManualRequest,
        forceRelease,
        requestManualWakeLock,
        releaseManualWakeLock
    } = useWakeLockContext();

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
        } else {
            // Manually acquire wake lock
            await requestManualWakeLock();
        }
    };

    const getTooltipText = () => {
        if (hasManualRequest && activeRequests > 0) {
            return `Manual + ${activeRequests} component wake lock${activeRequests !== 1 ? 's' : ''} active. Click to release all.`;
        } else if (hasManualRequest) {
            return 'Manual wake lock active. Click to release.';
        } else if (activeRequests > 0) {
            return `${activeRequests} component wake lock${activeRequests !== 1 ? 's' : ''} active. Click to release all.`;
        } else {
            return 'Screen can sleep. Click to manually activate wake lock.';
        }
    };

    const getLabel = () => {
        if (hasManualRequest && activeRequests > 0) {
            return `Manual + ${activeRequests} requests`;
        } else if (hasManualRequest) {
            return 'Manual wake lock';
        } else if (activeRequests > 0) {
            return `Wake lock (${activeRequests})`;
        } else {
            return 'Screen can sleep';
        }
    };

    const getColor = () => {
        if (hasManualRequest) {
            return 'primary';
        } else if (activeRequests > 0) {
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