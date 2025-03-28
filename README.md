# Ground Station

<p align="center">
  <img src="frontend/public/gs-logo-green-blue.png" alt="GS Logo" />
</p>
<div align="center">
  <h1>Ground Station</h1>
</div>

A robust satellite tracking and rig control application—bringing together orbit propagation, real-time position calculations, hardware control, and a highly interactive user interface. Built with modern JavaScript frameworks and libraries like React, Material UI, and react-leaflet, **Ground Station** unites the best of satellite data visualization and radio/rotator management in a single, streamlined application.

---

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
  - [Satellite Orbit Propagation](#satellite-orbit-propagation)
  - [Coverage Area Computation](#coverage-area-computation)
- [User Interface and Navigation](#user-interface-and-navigation)
  - [Settings Tabs](#settings-tabs)
  - [Interactive Tables](#interactive-tables)
  - [Mapping Interface](#mapping-interface)
- [Data API Usage](#data-api-usage)

---

## Overview
**Ground Station** delivers a comprehensive, user-friendly environment for monitoring satellites in real time and controlling connected radio and antenna hardware. From orbit propagation to system management, this application integrates multiple tools into a cohesive dashboard.

---

## Key Features

- **Satellite Tracking**  
  Utilize a powerful orbit propagation engine to:
  - Predict satellite paths using up-to-date TLE (Two-Line Element) data
  - Calculate real-time positions (lat, long, altitude) and speed
  - Visualize satellite coverage circles on an interactive map

- **Rig and Rotator Control**  
  Streamline hardware control through:
  - Configurable radio rig parameters (addresses, ports, signal thresholds, etc.)
  - Automated antenna rotator adjustments for precise tracking
  - Real-time status of push-to-talk (PTT) systems and azimuth/elevation settings

- **User Settings & Configuration**  
  Centralize user-defined preferences and hardware setups:
  - Manage satellite groups, TLE sources, and fallback data methods
  - Tailor interface settings like location defaults and map zoom levels
  - Access maintenance and diagnostic tools plus version information

---

## How It Works

### Satellite Orbit Propagation
Powered by a specialized module using (for example) the [`satellite.js`](https://github.com/shashwatak/satellite-js) library, **Ground Station** continuously computes precise satellite positions from TLE data by:
1. Parsing TLE sets into an internal format
2. Propagating orbital state vectors in real time
3. Converting Earth-centered inertial (ECI) coordinates to geodetic values (latitude, longitude, altitude)

### Coverage Area Computation
Your coverage boundary is derived from spherical trigonometry, yielding a horizon circle around each satellite’s footprint. These boundaries overlay seamlessly on the integrated map, helping users quickly identify coverage visibility for communication and data collection.

---

## User Interface and Navigation

### Settings Tabs
An intuitive tab-based layout separates all major functionalities:
- **Hardware**: Radio rig and antenna rotator control panels
- **Satellites**: Satellite details, TLE data sources, and collection grouping
- **Settings**: Fine-tuning user preferences and app configurations, plus a maintenance/about section

### Interactive Tables
Central to the user experience, these tables provide:
- Efficient sorting, selection, and pagination
- Rapid configuration updates for rig parameters, tracking details, and hardware statuses

### Mapping Interface
A visually engaging [react-leaflet](https://react-leaflet.js.org/) map highlights:
- Real-time satellite positions and paths
- Coverage area circles to gauge communication range
- Dynamic layering for satellite passes, historical tracks, and future predictions

---

## Data API Usage
**Ground Station** leverages **open data APIs** to ensure accurate tracking and data reliability.

- **CelesTrak API**  
  Access extensive TLE datasets for thousands of satellites. By tapping into [CelesTrak](https://www.celestrak.com)’s updated orbital data, the software automatically refines satellite positions and paths, granting unparalleled precision and ease of maintenance.

- **SatNOGS API**  
  Supplement orbital data through the [SatNOGS network](https://satnogs.org) for additional TLE sources and observational data, providing robust alternative data feeds and improved overall coverage for advanced configurations or fallback operations.

---

Have a blast exploring the skies with **Ground Station**! Feel free to open an issue or make a pull request if you encounter any bugs or have ideas to level up the experience.

---

<p align="center">  
  <b>Happy Tracking!</b>  
</p>