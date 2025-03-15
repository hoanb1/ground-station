import React from "react";
import {Box, Typography, Card, CardContent, List, ListItem, ListItemText} from "@mui/material";
import Paper from "@mui/material/Paper";

const AboutPage = () => {
    return (

            <Paper elevation={3} sx={{ padding: 2, marginTop: 0}} variant={"elevation"}>
                <CardContent>
                    <Typography variant="h4" gutterBottom>
                        About This Software
                    </Typography>
                    <Typography variant="body1" paragraph>
                        This software is a modern and dynamic application built to improve usability,
                        productivity, and efficiency for its users. It provides advanced features and
                        seamless integration with other tools to ensure an outstanding user experience.
                    </Typography>
                    <Typography variant="body1" paragraph>
                        The software was created by John Doe, a passionate software developer dedicated
                        to building user-friendly and innovative applications. Alongside the main
                        development, several open-source contributions from GitHub have played a
                        significant role in shaping this software.
                    </Typography>

                    <Typography variant="h6" gutterBottom>
                        Contributions from GitHub Projects
                    </Typography>
                    <List>
                        <ListItem>
                            <ListItemText primary="react-grid-layout"/>
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="react-virtuoso"/>
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="leaflet-fullscreen"/>
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="uuid"/>
                        </ListItem>
                        <ListItem>
                            <ListItemText primary="emotion styled & react libraries"/>
                        </ListItem>
                    </List>
                </CardContent>
            </Paper>
    );
};

export default AboutPage;