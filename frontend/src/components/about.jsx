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
import { GroundStationLogoGreenBlue } from "./icons.jsx"; // adjust the path as needed

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
                    <Typography variant="body1" paragraph>
                        This Satellite Tracking and Ground Station Management software is a powerful tool
                        for satellite operations, combining robust tracking logic with user-friendly interface
                        elements. With the ability to handle real-time visualization and hardware integration,
                        it is ideal for a wide range of users, from hobbyists to professional ground station
                        operators.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Detailed Description:</strong>
                        <br />
                        The software provides advanced satellite orbit tracking, telemetry management, and
                        hardware control capabilities via a modular and cutting-edge architecture. Built
                        primarily using React and Material-UI for frontend responsiveness, it leverages advanced
                        geospatial computation using libraries like Satellite.js for accurate orbital tracking.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        <strong>Key Features include:</strong>
                    </Typography>
                    <List
                        sx={{
                            listStyleType: "disc",
                            pl: 4,
                            "& .MuiListItem-root": { display: "list-item", py: 0.5 },
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
                        <ListItem>
                            <ListItemText primary="A user-friendly dashboard for editing layout and components." />
                        </ListItem>
                    </List>
                    <Typography variant="body1" paragraph>
                        <strong>Use Cases:</strong>
                        <br />
                        This software is beneficial to a diverse range of users:
                    </Typography>
                    <List
                        sx={{
                            listStyleType: "disc",
                            pl: 4,
                            "& .MuiListItem-root": { display: "list-item", py: 0.5 },
                        }}
                    >
                        <ListItem>
                            <ListItemText primary="Amateur radio operators and satellite enthusiasts to monitor and analyze satellite parameters." />
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="Educational institutions for teaching orbital mechanics and engaging students with real-time satellite tracking." />
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="Professional ground stations for automating complex workflows like antenna tracking and rig control." />
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="Researchers analyzing orbital data, such as satellite coverage or velocity calculations." />
                        </ListItem>
                    </List>
                    <Typography variant="body1" paragraph>
                        With its focus on flexibility, modularity, and an extensive feature set, the software
                        evolves alongside the needs of its users. Whether you're a hobbyist or a seasoned ground
                        station operator, this tool is designed to enhance your satellite tracking experience!
                    </Typography>
                    {/* About the Author Section */}
                    <Box
                        sx={{
                            marginTop: 4,
                            paddingTop: 2,
                            borderTop: '1px solid #e0e0e0',
                        }}
                    >
                        <Typography variant="h5" gutterBottom>
                            About the Author
                        </Typography>
                        <Typography variant="body1" paragraph>
                            **[Author Name]** is a passionate developer with expertise in satellite tracking
                            technologies and web application development. With a background in aerospace engineering
                            and a strong proficiency in React and Python, [Author Name] has dedicated their career
                            to creating tools that bridge the gap between complex satellite operations and user-friendly
                            interfaces. When not developing software, [Author Name] enjoys amateur radio, stargazing,
                            and contributing to open-source projects.
                        </Typography>
                        <Typography variant="body1" paragraph>
                            You can connect with the author on [LinkedIn](https://www.linkedin.com/) or view their
                            portfolio at [www.authorwebsite.com](https://www.authorwebsite.com).
                        </Typography>
                    </Box>
                </Box>
            </CardContent>
        </Paper>
    );
};

export default AboutPage;