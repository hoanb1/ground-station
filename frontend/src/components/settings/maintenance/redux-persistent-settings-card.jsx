/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import React, {useState} from 'react';
import {
    Typography,
    Divider,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    AlertTitle,
    Backdrop,
    Box,
    CircularProgress
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {useTranslation} from 'react-i18next';

const ReduxPersistentSettingsCard = () => {
    const {t} = useTranslation('settings');
    const [confirmClearReduxOpen, setConfirmClearReduxOpen] = useState(false);
    const [isReloading, setIsReloading] = useState(false);

    const clearReduxPersistentState = () => {
        setConfirmClearReduxOpen(false);
        // Clear all Redux persist keys
        const persistKeys = [
            'persist:waterfall',
            'persist:vfo',
            'persist:rigs',
            'persist:rotators',
            'persist:tleSources',
            'persist:satellites',
            'persist:satelliteGroups',
            'persist:location',
            'persist:synchronize',
            'persist:preferences',
            'persist:targetSatTrack',
            'persist:overviewSatTrack',
            'persist:dashboard',
            'persist:weather',
            'persist:camera',
            'persist:sdr',
            'persist:version',
            'persist:filebrowser',
            'persist:root'
        ];

        persistKeys.forEach(key => {
            localStorage.removeItem(key);
        });

        // Show reload spinner and reload after 1 second
        setIsReloading(true);
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    };

    const clearFileBrowserPersist = () => {
        localStorage.removeItem('persist:filebrowser');
    };

    const clearWaterfallPersist = () => {
        localStorage.removeItem('persist:waterfall');
    };

    const clearVfoPersist = () => {
        localStorage.removeItem('persist:vfo');
    };

    const clearPreferencesPersist = () => {
        localStorage.removeItem('persist:preferences');
    };

    const clearOverviewSatTrackPersist = () => {
        localStorage.removeItem('persist:overviewSatTrack');
    };

    const clearCameraPersist = () => {
        localStorage.removeItem('persist:camera');
    };

    return (
        <>
            <Typography variant="h6" gutterBottom>
                Redux Persistent Settings
            </Typography>
            <Divider sx={{mb: 2}}/>

            <Grid container spacing={2} columns={16}>
                <Grid size={16}>
                    <Alert severity="warning" sx={{mb: 2}}>
                        <AlertTitle>Clear All Redux Settings</AlertTitle>
                        This will reset all application settings below to their defaults. Use individual buttons to
                        clear specific settings only.
                    </Alert>
                </Grid>

                <Grid size={10}>
                    {t('maintenance.clear_redux')}
                    <Typography variant="body2" color="text.secondary">
                        Clears all Redux persistent data (all settings below)
                    </Typography>
                </Grid>
                <Grid size={6}>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={() => setConfirmClearReduxOpen(true)}
                        fullWidth
                        size="small"
                    >
                        {t('maintenance.clear_redux_button')}
                    </Button>
                </Grid>

                <Grid size={16}>
                    <Divider sx={{my: 2}}/>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Or clear individual settings:
                    </Typography>
                </Grid>

                <Grid size={10}>
                    Clear File Browser Settings
                    <Typography variant="body2" color="text.secondary">
                        Resets page size, sorting, filters, and view mode
                    </Typography>
                </Grid>
                <Grid size={6}>
                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={clearFileBrowserPersist}
                        fullWidth
                        size="small"
                    >
                        Clear
                    </Button>
                </Grid>

                <Grid size={10}>
                    Clear Waterfall Settings
                    <Typography variant="body2" color="text.secondary">
                        Resets frequency, gain, sample rate, colormap, FFT settings
                    </Typography>
                </Grid>
                <Grid size={6}>
                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={clearWaterfallPersist}
                        fullWidth
                        size="small"
                    >
                        Clear
                    </Button>
                </Grid>

                <Grid size={10}>
                    Clear VFO Settings
                    <Typography variant="body2" color="text.secondary">
                        Resets all VFO markers, frequencies, modes, and active states
                    </Typography>
                </Grid>
                <Grid size={6}>
                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={clearVfoPersist}
                        fullWidth
                        size="small"
                    >
                        Clear
                    </Button>
                </Grid>

                <Grid size={10}>
                    Clear Preferences
                    <Typography variant="body2" color="text.secondary">
                        Resets all user preferences like timezone, theme, etc.
                    </Typography>
                </Grid>
                <Grid size={6}>
                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={clearPreferencesPersist}
                        fullWidth
                        size="small"
                    >
                        Clear
                    </Button>
                </Grid>

                <Grid size={10}>
                    Clear Overview Satellite Selection
                    <Typography variant="body2" color="text.secondary">
                        Resets selected satellite group and satellite in overview page
                    </Typography>
                </Grid>
                <Grid size={6}>
                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={clearOverviewSatTrackPersist}
                        fullWidth
                        size="small"
                    >
                        Clear
                    </Button>
                </Grid>

                <Grid size={10}>
                    Clear Camera Selection
                    <Typography variant="body2" color="text.secondary">
                        Resets selected camera and camera ID
                    </Typography>
                </Grid>
                <Grid size={6}>
                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={clearCameraPersist}
                        fullWidth
                        size="small"
                    >
                        Clear
                    </Button>
                </Grid>
            </Grid>

            {/* Clear Redux Persist Confirmation Dialog */}
            <Dialog open={confirmClearReduxOpen} onClose={() => setConfirmClearReduxOpen(false)}>
                <DialogTitle>Clear All Redux Persistent State?</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{mb: 2}}>
                        <AlertTitle>Local Browser Cache Only</AlertTitle>
                        This will only clear application settings stored in your browser's local storage. No backend
                        data (satellites, rigs, rotators, recordings, etc.) will be deleted.
                    </Alert>
                    <Alert severity="warning" sx={{mb: 2}}>
                        <AlertTitle>Warning</AlertTitle>
                        This action will reset ALL local application settings to their defaults!
                    </Alert>
                    <Typography paragraph>
                        This will clear all locally cached settings including:
                    </Typography>
                    <ul>
                        <li>Waterfall settings (frequency, gain, sample rate, colormap, FFT)</li>
                        <li>VFO settings (markers, frequencies, modes, active states)</li>
                        <li>Cached rig configurations</li>
                        <li>Cached rotator configurations</li>
                        <li>Cached TLE sources</li>
                        <li>Cached satellite and group data</li>
                        <li>Location settings</li>
                        <li>User preferences (timezone, theme)</li>
                        <li>Dashboard settings</li>
                        <li>Weather settings</li>
                        <li>Camera settings</li>
                        <li>SDR settings</li>
                        <li>File browser settings</li>
                    </ul>
                    <Typography paragraph>
                        <strong>You will need to refresh the page after clearing.</strong> The application will re-fetch
                        all configuration data from the backend. Are you sure you want to continue?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmClearReduxOpen(false)}>Cancel</Button>
                    <Button onClick={clearReduxPersistentState} color="error" variant="contained">
                        Clear All Settings
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Reload Spinner Overlay */}
            <Backdrop
                sx={{color: '#fff', zIndex: (theme) => theme.zIndex.modal + 1}}
                open={isReloading}
            >
                <Box sx={{textAlign: 'center'}}>
                    <CircularProgress color="inherit" size={60}/>
                    <Typography variant="h6" sx={{mt: 2}}>
                        Reloading...
                    </Typography>
                </Box>
            </Backdrop>
        </>
    );
};

export default ReduxPersistentSettingsCard;
