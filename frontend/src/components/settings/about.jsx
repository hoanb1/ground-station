import React from "react";
import {
    Box,
    Typography,
    CardContent,
    List,
    ListItem,
    ListItemText,
    Paper,
} from "@mui/material";
import { GroundStationLogoGreenBlue } from "../common/icons.jsx"; // adjust the path as needed

const AboutPage = () => {
    return (
        <Paper elevation={3} sx={{ padding: 2, marginTop: 0 }}>
            <CardContent>
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "left",
                        textAlign: "left",
                        gap: 2,
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "left",
                            marginBottom: 2,
                        }}
                    >
                        <img
                            src={GroundStationLogoGreenBlue}
                            alt="Ground Station Logo"
                            style={{ height: "60px", marginRight: "16px" }}
                        />
                        <Typography variant="h4" sx={{ margin: '9px' }}>
                            Ground Station
                        </Typography>
                    </Box>

                    <Typography variant="body1">
                        This Satellite Tracking and Ground Station Management software is a powerful tool
                        for satellite operations, combining robust tracking logic with user-friendly interface
                        elements. With the ability to handle real-time visualization and hardware integration,
                        it is ideal for a wide range of users, from hobbyists to professional ground station
                        operators.
                    </Typography>

                    <Typography variant="body1">
                        <strong>Detailed Description:</strong>
                        <br />
                        The software provides advanced satellite orbit tracking, telemetry management, and
                        hardware control capabilities via a modular and cutting-edge architecture. Built
                        primarily using React and Material-UI for frontend responsiveness, it leverages advanced
                        geospatial computation using libraries like Satellite.js for accurate orbital tracking.
                    </Typography>

                    <Typography variant="body1">
                        <strong>Key Features include:</strong>
                    </Typography>

                    <List
                        sx={{
                            listStyleType: "disc",
                            pl: 4,
                            "& .MuiListItem-root": {
                                display: "list-item",
                                py: 0.5,
                            },
                        }}
                    >
                        <ListItem>
                            <ListItemText primary="Real-time satellite position visualization and tracking using TLE data." />
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="Interactive geospatial mapping with dynamic tile layers from OpenStreetMap, ArcGIS, and others." />
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="Hardware integration for controlling rotators and radio rigs, enabling seamless satellite communication workflows." />
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="Customizable settings for TLE sources, satellite groups, and hardware configurations." />
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="Detailed coverage area visualization for satellites, including polar adjustments." />
                        </ListItem>
                    </List>

                    {/* Added note about external contributions */}
                    <Typography variant="body1">
                        <strong>External Contributions:</strong>
                        <br />
                        This project greatly benefits from the generosity of open-source data providers:
                        <ul style={{ listStyleType: "disc", marginLeft: "18px" }}>
                            <li>
                                <strong>Celestrak:</strong> Providing accurate TLE (Two-Line Element) data for
                                precise satellite tracking updates. Their extensive catalog is invaluable for
                                ensuring the most up-to-date orbital information.
                            </li>
                            <li>
                                <strong>SatNOGS:</strong> Offering detailed satellite data and transmitter
                                information, enhancing our ability to display and track various communications
                                parameters. This data is critical for operational insights and successful
                                mission planning.
                            </li>
                        </ul>
                        Both sources significantly broaden the coverage and quality of the satellites that
                        can be tracked, helping users perform more comprehensive analyses and achieve
                        reliable communication workflows.
                    </Typography>
                </Box>
            </CardContent>
        </Paper>
    );
};

export default AboutPage;