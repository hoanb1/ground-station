<p align="center">
  <img src="frontend/public/gs-logo-green-blue.png" alt="GS Logo" />
</p>
<div align="center">
  <h1>Ground Station</h1>
</div>

# Overview
This software is a comprehensive satellite tracking and rig control application designed for monitoring satellites in real time and managing associated hardware. The application brings together orbit propagation, real-time position calculations, and hardware control interfaces into a single, easy-to-use user interface. It leverages modern JavaScript frameworks and libraries such as React, Material UI, and react-leaflet to create an interactive experience for users.

# Key Features
- **Satellite Tracking**
    - Uses Two-Line Element (TLE) data to predict satellite orbits.
    - Computes real-time latitude, longitude, altitude, and velocity for satellites.
    - Displays satellite coverage areas (horizon circles) on an interactive map.

- **Rig and Rotator Control**
    - Provides management interfaces for hardware such as radio rigs and antenna rotators.
    - Configures parameters like host addresses, port numbers, and signal thresholds.
    - Maintains tables and controls to monitor radio types, the status of push-to-talk (PTT) systems, and azimuth limits.

- **User Settings and Configuration**
    - Multiple settings tabs allow configuration for satellites, TLE sources, satellite groups, and user preferences.
    - Location settings are included to set default map centers and initial tracking coordinates.
    - Maintenance and about sections provide diagnostic information and application metadata.

# How It Works

## Satellite Orbit Propagation

- **Orbit Calculation**  
  The software uses a dedicated module that leverages the [`satellite.js`](https://github.com/shashwatak/satellite-js) library. It converts TLE data into satellite records and then computes the satellite’s position and velocity for a given timestamp. This involves:
    - Parsing the two-line element set into an internal representation.
    - Propagating the satellite’s state vector to a given time.
    - Converting Earth-centered inertial (ECI) coordinates to geodetic (latitude, longitude, altitude) coordinates.

- **Coverage Area Computation**  
  Using spherical trigonometry, the software calculates the horizon circle or coverage area of a satellite based on its altitude. This produces a set of geographic coordinates outlining the coverage boundary, which can be rendered on a map.

## User Interface and Navigation

- **Settings Tabs**  
  The user interface is organized into multiple tabs categorized under:
    - **Hardware**: Displays rig control and rotator control panels.
    - **Satellites**: Manages satellite details, TLE sources, and satellite groups.
    - **Settings**: Contains user preferences, location configuration, maintenance tools, and an about page.

- **Interactive Tables**  
  Tables are used extensively to display satellite lists, rig configuration details, and rotator parameters. They:
    - Support sorting, pagination, and selection.
    - Allow users to quickly review and update parameters.

- **Mapping Interface**  
  An interactive map—implemented via [react-leaflet](https://react-leaflet.js.org/)—shows:
    - The current positions of satellites.
    - The computed coverage circles.
    - A visual reference for satellite trajectories and ground paths.

# Data API Usage

This software heavily relies on **open data APIs** to provide accurate and up-to-date information for satellite tracking
and management. The use of these APIs has been instrumental in simplifying data acquisition and ensuring the application
maintains high accuracy and reliability.

- **CelesTrak API**  
  [CelesTrak](https://www.celestrak.com/) offers comprehensive TLE (Two-Line Element) datasets for thousands of
  satellites. These datasets are critical in predicting satellite orbits and positions. By integrating with the
  CelesTrak API, the software can:
  - Retrieve updated orbital data seamlessly.
  - Stay synchronized with changes in satellite constellations.
  - Support advanced satellite filtering and categorization.
- **SatNOGS API**  
  [SatNOGS](https://satnogs.org/) provides open-access telemetry, observation data, and additional satellite metadata.
  By utilizing the SatNOGS API, the application gains:
  - Access to real-time telemetry data that enhances satellite monitoring capabilities.
  - A community-driven knowledge base that enriches satellite operations and research.
    The integration of these open data APIs has been immensely helpful for this project, as it ensures reliable,
    real-time access to critical satellite data while advocating for open and collaborative data-sharing practices.
    These APIs form the backbone of the application’s predictive and tracking functionalities, empowering users with
    accurate and up-to-date information.
