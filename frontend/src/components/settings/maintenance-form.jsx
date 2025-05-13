/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
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



import {gridLayoutStoreName as overviewGridLayoutName} from "../overview/overview-sat-layout.jsx";
import {gridLayoutStoreName as targetGridLayoutName} from "../target/target-sat-layout.jsx";
import {gridLayoutStoreName as waterfallGridLayoutName} from "../waterfall/waterfall-layout.jsx";

import Paper from "@mui/material/Paper";
import {Alert, AlertTitle, Box, Button} from "@mui/material";
import Grid from "@mui/material/Grid2";
import React from "react";

const MaintenanceForm = () => {
    const clearLayoutLocalStorage = () => {
        localStorage.setItem(overviewGridLayoutName, null);
        localStorage.setItem(targetGridLayoutName, null);
        localStorage.setItem(waterfallGridLayoutName, null);
    }

    const clearSatelliteDataLocalStorage = () => {
        localStorage.setItem('target-satellite-noradid', null);
        localStorage.setItem('overview-selected-satellites', null);
    }

    const clearReduxPersistentState = () => {
        localStorage.setItem('persist:root', null);
    }

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0  }}>
            <Alert severity="info">
                <AlertTitle>Maintenance</AlertTitle>
                Maintenance related functions
            </Alert>
            <Box component="form" sx={{mt: 2}}>
                <Grid container spacing={2} columns={16}>
                    <Grid size={8}>
                        Clear local browser layout data
                    </Grid>
                    <Grid size={8}>
                        <Button variant="contained" color="warning" onClick={clearLayoutLocalStorage}>
                            Clear layout
                        </Button>
                    </Grid>
                    <Grid size={8}>
                        Clear local browser satellite data
                    </Grid>
                    <Grid size={8}>
                        <Button variant="contained" color="warning" onClick={clearSatelliteDataLocalStorage}>
                            Clear satellite data
                        </Button>
                    </Grid>

                    <Grid size={8}>
                        Clear Redux persistent state
                    </Grid>
                    <Grid size={8}>
                        <Button variant="contained" color="warning" onClick={clearReduxPersistentState}>
                            Clear Redux persistent state
                        </Button>
                    </Grid>


                </Grid>
            </Box>
        </Paper>
    );
};




export default MaintenanceForm;