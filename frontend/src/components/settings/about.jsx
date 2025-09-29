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

import React from "react";
import {
    Box,
    Typography,
    CardContent,
    Paper,
    Divider,
    Card,
    Stack,
    Chip,
    useTheme,
    Link,
} from "@mui/material";
import { GroundStationLogoGreenBlue } from "../common/icons.jsx";
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import RadioIcon from '@mui/icons-material/Radio';
import ImageIcon from '@mui/icons-material/Image';
import DevicesIcon from '@mui/icons-material/Devices';
import GroupIcon from '@mui/icons-material/Group';
import CodeIcon from '@mui/icons-material/Code';
import StorageIcon from '@mui/icons-material/Storage';
import WebIcon from '@mui/icons-material/Web';
import Grid from "@mui/material/Grid2";
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from "@mui/material";


const AboutPage = () => {
    const theme = useTheme();

    const featureItems = [
        {
            text: "Real-time Satellite Tracking: Track hundreds of satellites with high-precision orbital models. TLE data is automatically updated from CelesTrak and SatNOGS.",
            icon: <SatelliteAltIcon fontSize="small" color="primary" />
        },
        {
            text: "Automated Antenna Control: Interface with popular antenna rotators to automatically track satellites as they pass overhead.",
            icon: <SettingsInputAntennaIcon fontSize="small" color="primary" />
        },
        {
            text: "SDR Integration: Stream and record live radio signals from a wide range of SDR devices, including RTL-SDR, SoapySDR, and UHD/USRP radios.",
            icon: <RadioIcon fontSize="small" color="primary" />
        },
        {
            text: "Data Decoding: Decode and display images from weather satellites (e.g., NOAA APT) and telemetry from various amateur satellites.",
            icon: <ImageIcon fontSize="small" color="primary" />
        },
        {
            text: "Responsive Web Interface: A modern, responsive, and intuitive web interface built with Material-UI that adapts seamlessly to desktop, tablet, and mobile devices.",
            icon: <DevicesIcon fontSize="small" color="primary" />
        },
        {
            text: "Multi-User Support: Create and manage multiple user accounts with different levels of access and permissions.",
            icon: <GroupIcon fontSize="small" color="primary" />
        }
    ];

    const backendTechnologies = [
        { name: "FastAPI", description: "A modern, fast (high-performance), web framework for building APIs with Python 3.7+ based on standard Python type hints.", url: "https://fastapi.tiangolo.com/" },
        { name: "SQLAlchemy", description: "The Python SQL Toolkit and Object Relational Mapper that gives application developers the full power and flexibility of SQL.", url: "https://www.sqlalchemy.org/" },
        { name: "Skyfield", description: "A modern astronomy library for Python that computes positions for the stars, planets, and satellites in orbit around the Earth.", url: "https://rhodesmill.org/skyfield/" },
        { name: "SGP4", description: "A Python implementation of the SGP4 satellite propagation model.", url: "https://pypi.org/project/sgp4/" },
        { name: "Socket.IO", description: "A library for real-time, bidirectional, event-based communication.", url: "https://python-socketio.readthedocs.io/en/latest/" },
        { name: "pyrtlsdr", description: "A Python wrapper for the RTL-SDR library.", url: "https://pypi.org/project/pyrtlsdr/" },
        { name: "SoapySDR", description: "A vendor and platform neutral SDR support library.", url: "https://pypi.org/project/SoapySDR/" }
    ];

    const frontendTechnologies = [
        { name: "React", description: "A JavaScript library for building user interfaces.", url: "https://reactjs.org/" },
        { name: "Redux Toolkit", description: "The official, opinionated, batteries-included toolset for efficient Redux development.", url: "https://redux-toolkit.js.org/" },
        { name: "Material-UI", description: "A popular React UI framework with a comprehensive suite of UI tools.", url: "https://mui.com/" },
        { name: "Vite", description: "A build tool that aims to provide a faster and leaner development experience for modern web projects.", url: "https://vitejs.dev/" },
        { name: "Socket.IO Client", description: "The client-side library for Socket.IO.", url: "https://socket.io/docs/v4/client-api/" },
        { name: "Leaflet", description: "An open-source JavaScript library for mobile-friendly interactive maps.", url: "https://leafletjs.com/" },
        { name: "satellite.js", description: "A JavaScript library to propagate satellite orbits.", url: "https://github.com/shashwatak/satellite-js" }
    ];

    const sdrSupport = [
        "RTL-SDR (USB or rtl_tcp) workers",
        "SoapySDR devices locally or through SoapyRemote (Airspy, HackRF, LimeSDR, etc.)",
        "UHD/USRP radios via a UHD worker"
    ];

    return (
        <Paper
            elevation={1}
            sx={{
                padding: 1,
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
                            <strong>Ground Station is a full-featured, open-source software solution for satellite tracking, radio communication, and data decoding.</strong> Designed for amateur radio operators, satellite enthusiasts, and researchers, it provides a comprehensive and easy-to-use platform for monitoring spacecraft, controlling radio equipment, and receiving satellite imagery and telemetry.
                        </Typography>
                    </Card>

                    {/* Architecture Overview */}
                    <Box>
                        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                            System Architecture
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Typography variant="body1" sx={{ lineHeight: 1.7, mb: 2 }}>
                            The Ground Station application is composed of a frontend, a backend, and a set of worker processes:
                        </Typography>
                        <Stack spacing={1}>
                            <Typography variant="body1">
                                <strong>Frontend:</strong> A responsive single-page application built with React, Redux Toolkit, and Material-UI. It provides an optimal viewing experience across desktop, tablet, and mobile devices, and communicates with the backend using a socket.io connection for real-time updates.
                            </Typography>
                            <Typography variant="body1">
                                <strong>Backend:</strong> A Python application built with FastAPI. It provides a REST API and a socket.io interface for the frontend. It also manages the worker processes.
                            </Typography>
                            <Typography variant="body1">
                                <strong>Workers:</strong> Specialized worker processes handle satellite tracking, hardware control, SDR streaming, and device discovery operations.
                            </Typography>
                        </Stack>
                    </Box>

                    {/* Key Features section */}
                    <Box>
                        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                            Key Features
                        </Typography>
                        <Divider sx={{ mb: 2 }} />

                        <Stack spacing={2}>
                            {featureItems.map((feature, index) => (
                                <Stack key={index} direction="row" spacing={2} alignItems="flex-start">
                                    <Box sx={{ mt: 0.5 }}>{feature.icon}</Box>
                                    <Typography variant="body1">{feature.text}</Typography>
                                </Stack>
                            ))}
                        </Stack>
                    </Box>

                    {/* SDR Device Support */}
                    <Box>
                        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                            SDR Device Support
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Typography variant="body1" paragraph>
                            Dedicated worker processes provide FFT and streaming support for multiple receiver families:
                        </Typography>
                        <Stack spacing={2}>
                            {sdrSupport.map((device, index) => (
                                <Stack key={index} direction="row" spacing={2} alignItems="center">
                                    <RadioIcon fontSize="small" color="secondary" />
                                    <Typography variant="body1">{device}</Typography>
                                </Stack>
                            ))}
                        </Stack>
                    </Box>

                    {/* Third-Party Libraries & Technologies */}
                    <Box>
                        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                            <CodeIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Third-Party Libraries & Technologies
                        </Typography>
                        <Divider sx={{ mb: 2 }} />

                        <Grid container spacing={3}>
                            {/* Backend Technologies */}
                            <Grid size={12} md={6}>
                                <Card elevation={1} sx={{ p: 2, height: '100%' }}>
                                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main, display: 'flex', alignItems: 'center' }}>
                                        <StorageIcon sx={{ mr: 1 }} fontSize="small" />
                                        Backend
                                    </Typography>
                                    <Box component="ul" sx={{ pl: 2, m: 0 }}>
                                        {backendTechnologies.map((tech, index) => (
                                            <Box component="li" key={index} sx={{ mb: 1.5, listStyle: 'disc' }}>
                                                <Link 
                                                    href={tech.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    sx={{ 
                                                        fontWeight: 'bold',
                                                        color: 'primary.main',
                                                        textDecoration: 'none',
                                                        '&:hover': { textDecoration: 'underline' }
                                                    }}
                                                >
                                                    {tech.name}
                                                </Link>
                                                <Typography variant="body2" component="div" sx={{ mt: 0.5, color: 'text.secondary' }}>
                                                    {tech.description}
                                                </Typography>
                                            </Box>
                                        ))}
                                    </Box>
                                </Card>
                            </Grid>

                            {/* Frontend Technologies */}
                            <Grid size={12} md={6}>
                                <Card elevation={1} sx={{ p: 2, height: '100%' }}>
                                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: theme.palette.secondary.main, display: 'flex', alignItems: 'center' }}>
                                        <WebIcon sx={{ mr: 1 }} fontSize="small" />
                                        Frontend
                                    </Typography>
                                    <Box component="ul" sx={{ pl: 2, m: 0 }}>
                                        {frontendTechnologies.map((tech, index) => (
                                            <Box component="li" key={index} sx={{ mb: 1.5, listStyle: 'disc' }}>
                                                <Link 
                                                    href={tech.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    sx={{ 
                                                        fontWeight: 'bold',
                                                        color: 'secondary.main',
                                                        textDecoration: 'none',
                                                        '&:hover': { textDecoration: 'underline' }
                                                    }}
                                                >
                                                    {tech.name}
                                                </Link>
                                                <Typography variant="body2" component="div" sx={{ mt: 0.5, color: 'text.secondary' }}>
                                                    {tech.description}
                                                </Typography>
                                            </Box>
                                        ))}
                                    </Box>
                                </Card>
                            </Grid>
                        </Grid>
                    </Box>

                    {/* License */}
                    <Box>
                        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                            License
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Card elevation={1} sx={{ p: 2, backgroundColor: 'rgba(255,255,255,0.05)' }}>
                            <Typography variant="body1">
                                This project is licensed under the <strong>GNU GPL v3</strong>. This ensures that the software remains free and open-source, allowing you to use, modify, and distribute it according to the terms of the license.
                            </Typography>
                        </Card>
                    </Box>
                </Box>
            </CardContent>
        </Paper>
    );
};

export default AboutPage;