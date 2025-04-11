import React from "react";
import {
    Box,
    Typography,
    CardContent,
    List,
    ListItem,
    ListItemText,
    Paper,
    Divider,
    Card,
    Stack,
    Chip,
    useTheme,
} from "@mui/material";
import { GroundStationLogoGreenBlue } from "../common/icons.jsx";
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import MapIcon from '@mui/icons-material/Map';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import TuneIcon from '@mui/icons-material/Tune';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import Grid from "@mui/material/Grid2";

const AboutPage = () => {
    const theme = useTheme();

    const featureItems = [
        {
            text: "Real-time satellite position visualization and tracking using TLE data.",
            icon: <SatelliteAltIcon fontSize="small" color="primary" />
        },
        {
            text: "Interactive geospatial mapping with dynamic tile layers from OpenStreetMap, ArcGIS, and others.",
            icon: <MapIcon fontSize="small" color="primary" />
        },
        {
            text: "Hardware integration for controlling rotators and radio rigs, enabling seamless satellite communication workflows.",
            icon: <SettingsInputAntennaIcon fontSize="small" color="primary" />
        },
        {
            text: "Customizable settings for TLE sources, satellite groups, and hardware configurations.",
            icon: <TuneIcon fontSize="small" color="primary" />
        },
        {
            text: "Detailed pass predictions with elevation/azimuth charts and Doppler shift calculations.",
            icon: <ShowChartIcon fontSize="small" color="primary" />
        }
    ];

    const acknowledgements = [
        {
            name: "Hamlib",
            description: "Providing robust rotator and radio rig control capabilities for precise hardware integration."
        },
        {
            name: "Leaflet maps",
            description: "Powering interactive mapping functionality with efficient and responsive visualization components."
        },
        {
            name: "OpenWeatherMap",
            description: "Delivering real-time meteorological data to assess weather conditions at ground station locations."
        },
        {
            name: "Celestrak APIs",
            description: "Providing up-to-date orbital elements and TLE data for accurate satellite tracking and predictions."
        },
        {
            name: "SatNOGS APIs",
            description: "Enabling integration with the global network of satellite ground stations for collaborative operations."
        }
    ];

    return (
        <Paper
            elevation={3}
            sx={{
                padding: 3,
                marginTop: 0,
                borderRadius: 2,
            }}
        >
            <CardContent>
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "left",
                        textAlign: "left",
                        gap: 4,
                    }}
                >
                    {/* Header with logo */}
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            marginBottom: 2,
                            borderBottom: `1px solid ${theme.palette.divider}`,
                            paddingBottom: 2,
                        }}
                    >
                        <img
                            src={GroundStationLogoGreenBlue}
                            alt="Ground Station Logo"
                            style={{ height: "70px", marginRight: "20px" }}
                        />
                        <Typography
                            variant="h3"
                            sx={{
                                margin: '9px',
                                fontWeight: 600,
                                background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            Ground Station
                        </Typography>
                    </Box>

                    {/* Introduction */}
                    <Card elevation={1} sx={{ padding: 2, backgroundColor: 'rgba(255,255,255,0.05)' }}>
                        <Typography variant="body1" paragraph sx={{ fontSize: '1.1rem', lineHeight: 1.6 }}>
                            This Satellite Tracking and Ground Station Management software is a powerful tool
                            for satellite operations, combining robust tracking logic with user-friendly interface
                            elements. With the ability to handle real-time visualization and hardware integration,
                            it is ideal for a wide range of users, from hobbyists to professional ground station
                            operators.
                        </Typography>
                    </Card>

                    {/* Description section */}
                    <Box>
                        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                            Detailed Description
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Typography variant="body1" sx={{ lineHeight: 1.7 }}>
                            The software provides advanced satellite orbit tracking, telemetry management, and
                            hardware control capabilities via a modular and cutting-edge architecture. Built
                            primarily using React and Material-UI for frontend responsiveness, it leverages advanced
                            geospatial computation using libraries like Satellite.js for accurate orbital tracking.
                        </Typography>
                    </Box>

                    {/* Key Features section */}
                    <Box>
                        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                            Key Features
                        </Typography>
                        <Divider sx={{ mb: 2 }} />

                        <Grid container spacing={2}>
                            {featureItems.map((feature, index) => (
                                <Grid item xs={12} key={index}>
                                    <Card
                                        elevation={1}
                                        sx={{
                                            p: 1.5,
                                            transition: 'all 0.3s',
                                            '&:hover': {
                                                transform: 'translateY(-3px)',
                                                boxShadow: theme.shadows[3],
                                            }
                                        }}
                                    >
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            {feature.icon}
                                            <Typography variant="body1">{feature.text}</Typography>
                                        </Stack>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    </Box>

                    {/* Acknowledgements section */}
                    <Box>
                        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                            Acknowledgements
                        </Typography>
                        <Divider sx={{ mb: 2 }} />

                        <Typography variant="body1" paragraph>
                            This project builds upon several important open-source projects and services:
                        </Typography>

                        <Grid container spacing={2}>
                            {acknowledgements.map((ack, index) => (
                                <Grid item xs={12} md={6} key={index}>
                                    <Card
                                        elevation={1}
                                        sx={{
                                            height: '100%',
                                            p: 2,
                                            transition: 'all 0.3s',
                                            '&:hover': {
                                                transform: 'translateY(-3px)',
                                                boxShadow: theme.shadows[3],
                                            }
                                        }}
                                    >
                                        <Stack spacing={1}>
                                            <Chip
                                                label={ack.name}
                                                color="primary"
                                                sx={{
                                                    fontWeight: 'bold',
                                                    alignSelf: 'flex-start',
                                                }}
                                            />
                                            <Typography variant="body2">
                                                {ack.description}
                                            </Typography>
                                        </Stack>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    </Box>
                </Box>
            </CardContent>
        </Paper>
    );
};

export default AboutPage;