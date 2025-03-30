import {gridLayoutStoreName as overviewGridLayoutName} from "../overview/overview-sat-track.jsx";
import {gridLayoutStoreName as targetGridLayoutName} from "../target/target-sat-track.jsx";
import Paper from "@mui/material/Paper";
import {Alert, AlertTitle, Box, Button} from "@mui/material";
import Grid from "@mui/material/Grid2";
import React from "react";

const MaintenanceForm = () => {
    const clearLayoutLocalStorage = () => {
        localStorage.setItem(overviewGridLayoutName, null);
        localStorage.setItem(targetGridLayoutName, null);
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