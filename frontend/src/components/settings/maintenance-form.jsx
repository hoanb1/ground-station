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

import Paper from "@mui/material/Paper";
import { Box, Tabs, Tab } from "@mui/material";
import Grid from "@mui/material/Grid";
import React, { useState } from "react";
import {
    GridLayoutStorageCard,
    ReduxPersistentSettingsCard,
    ServiceControlCard,
    CanvasDebugCard,
    BrowserFeaturesCard,
    SocketInfoCard,
    LibraryVersionsCard,
    ReduxStateInspectorCard,
    DatabaseBackupCard
} from './maintenance/index.jsx';

const MaintenanceForm = () => {
    // Main tab state
    const [mainTab, setMainTab] = useState(0);

    // TabPanel component for tab content
    const TabPanel = ({ children, value, index }) => (
        <div role="tabpanel" hidden={value !== index}>
            {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
        </div>
    );

    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0  }}>
            <Box component="form" sx={{mt: 0}}>
                <Tabs value={mainTab} onChange={(e, newValue) => setMainTab(newValue)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                    <Tab label="Storage & State" />
                    <Tab label="Redux Inspector" />
                    <Tab label="System Control" />
                    <Tab label="Diagnostics" />
                    <Tab label="Database" />
                    <Tab label="Dependencies" />
                </Tabs>

                {/* Tab 0: Storage & State */}
                <TabPanel value={mainTab} index={0}>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <GridLayoutStorageCard />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <ReduxPersistentSettingsCard />
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* Tab 1: Redux Inspector */}
                <TabPanel value={mainTab} index={1}>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12 }}>
                            <ReduxStateInspectorCard />
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* Tab 2: System Control */}
                <TabPanel value={mainTab} index={2}>
                    <Grid container spacing={2}>
                        <Grid size={12}>
                            <ServiceControlCard />
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* Tab 3: Diagnostics */}
                <TabPanel value={mainTab} index={3}>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <BrowserFeaturesCard />
                            <CanvasDebugCard />
                        </Grid>

                        <Grid size={{ xs: 12, md: 6 }}>
                            <SocketInfoCard />
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* Tab 4: Database */}
                <TabPanel value={mainTab} index={4}>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12 }}>
                            <DatabaseBackupCard />
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* Tab 5: Dependencies */}
                <TabPanel value={mainTab} index={5}>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12 }}>
                            <LibraryVersionsCard />
                        </Grid>
                    </Grid>
                </TabPanel>
            </Box>
        </Paper>
    );
};

export default MaintenanceForm;