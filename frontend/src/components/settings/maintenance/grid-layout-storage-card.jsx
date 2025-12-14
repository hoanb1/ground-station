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
import {gridLayoutStoreName as overviewGridLayoutName} from "../../overview/main-layout.jsx";
import {gridLayoutStoreName as targetGridLayoutName} from "../../target/main-layout.jsx";
import {gridLayoutStoreName as waterfallGridLayoutName} from "../../waterfall/main-layout.jsx";

const GridLayoutStorageCard = () => {
    const {t} = useTranslation('settings');
    const [confirmClearLayoutOpen, setConfirmClearLayoutOpen] = useState(false);
    const [isReloading, setIsReloading] = useState(false);

    const clearLayoutLocalStorage = () => {
        setConfirmClearLayoutOpen(false);
        localStorage.setItem(overviewGridLayoutName, null);
        localStorage.setItem(targetGridLayoutName, null);
        localStorage.setItem(waterfallGridLayoutName, null);

        // Show reload spinner and reload after 1 second
        setIsReloading(true);
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    };

    return (
        <>
            <Typography variant="h6" gutterBottom>
                Grid Layout Storage
            </Typography>
            <Divider sx={{mb: 2}}/>

            <Grid container spacing={2} columns={16}>
                <Grid size={16}>
                    <Alert severity="warning" sx={{mb: 2}}>
                        <AlertTitle>Clear All Grid Layouts</AlertTitle>
                        This will reset all grid layouts below to their defaults. Use individual buttons to clear
                        specific layouts only.
                    </Alert>
                </Grid>

                <Grid size={10}>
                    {t('maintenance.clear_layout')}
                    <Typography variant="body2" color="text.secondary">
                        Clears all grid layouts (all layouts below)
                    </Typography>
                </Grid>
                <Grid size={6}>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={() => setConfirmClearLayoutOpen(true)}
                        fullWidth
                        size="small"
                    >
                        {t('maintenance.clear_layout_button')}
                    </Button>
                </Grid>

                <Grid size={16}>
                    <Divider sx={{my: 2}}/>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Or clear individual layouts:
                    </Typography>
                </Grid>

                <Grid size={10}>
                    Clear Overview Grid Layout
                    <Typography variant="body2" color="text.secondary">
                        Resets the widget layout on the Overview page
                    </Typography>
                </Grid>
                <Grid size={6}>
                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={() => localStorage.setItem(overviewGridLayoutName, null)}
                        fullWidth
                        size="small"
                    >
                        Clear
                    </Button>
                </Grid>

                <Grid size={10}>
                    Clear Target Grid Layout
                    <Typography variant="body2" color="text.secondary">
                        Resets the widget layout on the Target page
                    </Typography>
                </Grid>
                <Grid size={6}>
                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={() => localStorage.setItem(targetGridLayoutName, null)}
                        fullWidth
                        size="small"
                    >
                        Clear
                    </Button>
                </Grid>

                <Grid size={10}>
                    Clear Waterfall Grid Layout
                    <Typography variant="body2" color="text.secondary">
                        Resets the widget layout on the Waterfall page
                    </Typography>
                </Grid>
                <Grid size={6}>
                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={() => localStorage.setItem(waterfallGridLayoutName, null)}
                        fullWidth
                        size="small"
                    >
                        Clear
                    </Button>
                </Grid>
            </Grid>

            {/* Clear Layout Confirmation Dialog */}
            <Dialog open={confirmClearLayoutOpen} onClose={() => setConfirmClearLayoutOpen(false)}>
                <DialogTitle>Clear All Grid Layouts?</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{mb: 2}}>
                        <AlertTitle>Local Browser Cache Only</AlertTitle>
                        This will only clear layout preferences stored in your browser's local storage. No backend data
                        will be affected.
                    </Alert>
                    <Typography paragraph>
                        This will reset all widget layouts to their defaults on the following pages:
                    </Typography>
                    <ul>
                        <li>Overview page</li>
                        <li>Target page</li>
                        <li>Waterfall page</li>
                    </ul>
                    <Typography paragraph>
                        You will need to refresh the page to see the changes. Are you sure you want to continue?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmClearLayoutOpen(false)}>Cancel</Button>
                    <Button onClick={clearLayoutLocalStorage} color="warning" variant="contained">
                        Clear Layouts
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

export default GridLayoutStorageCard;
