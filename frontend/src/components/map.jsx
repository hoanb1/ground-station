import React, {Component, useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../assets/map.css';
import * as satellite from 'satellite.js';
import Slider from '@mui/material/Slider';


const SatTrackSlider = () => {
    return (
        <div className="time-control" style={{ width: '100%', height: '100%', padding: '25px', position: 'relative', bottom: '74px', left: '0', zIndex: 1000}}>
        <Slider
            onChange={handleTimeSliderChange}
            aria-label="Small steps"
            defaultValue={0}
            track={false}
            step={1}
            min={-60}
            max={60}
            valueLabelDisplay="auto"
        />
    </div>);
}


const MapOrbitTracker = () => {
    // State for tracking satellite data
    const [satData, setSatData] = useState({
        position: { lat: 0, lng: 0 },
        altitude: 0,
        velocity: 0,
        coverageArea: 0,
        nextPass: null
    });

    // State for time offset slider
    const [timeOffset, setTimeOffset] = useState(0);

    // Refs for map objects
    const mapRef = useRef(null);
    const satMarkerRef = useRef(null);
    const orbitLineRef = useRef(null);
    const coverageCircleRef = useRef(null);

    // Latest TLE data for satellite
    const issInfo = {
        tleLine1: '1 25544U 98067A   25057.69551956  .00051272  00000-0  91556-3 0  9991',
        tleLine2: '2 25544  51.6387 134.2889 0005831 315.8203 179.6729 15.49515680498024'
    };

    // Latest TLE data for Meridian 10
    const meridian10Info = {
        tleLine1: '1 52145U 22030A   25057.41348696  .00000228  00000-0  00000-0 0  9996',
        tleLine2: '2 52145  62.6564 190.8604 6757939 273.5683  17.5623  2.00597866 21488'
    };

    // Latest TLE data for Meridian 6
    const meridian6Info = {
        tleLine1: '1 38995U 12063A   25057.08768248  .00000602  00000-0  00000-0 0  9996',
        tleLine2: '2 38995  64.8512  59.9606 7211521 232.9060  37.7177  2.00561021 89958'
    };

    // Latest TLE data for Meridian 6
    const noaa15Info = {
        tleLine1: '1 25338U 98030A   25058.08582248  .00000500  00000-0  22370-3 0  9990',
        tleLine2: '2 25338  98.5470  85.6315 0009230 302.3284  57.7002 14.26895140393781'
    };

    // Function to convert satellite.js position to lat/lng
    const satPositionToLatLng = (position) => {
        const positionGd = satellite.eciToGeodetic(
            position,
            satellite.gstime(new Date())
        );

        const lat = satellite.degreesLat(positionGd.latitude);
        const lng = satellite.degreesLong(positionGd.longitude);
        const alt = positionGd.height;

        return { lat, lng, alt };
    };

    // Calculate coverage radius based on altitude
    const calculateCoverageRadius = (altitude) => {
        const earthRadius = 6371; // km
        return Math.sqrt(2 * earthRadius * altitude + Math.pow(altitude, 2)) * 1000; // m
    };

    // Calculate the satellite position for a given time
    const getSatPosition = (time) => {
        const satrec = satellite.twoline2satrec(
            noaa15Info.tleLine1,
            noaa15Info.tleLine2
        );

        return satellite.propagate(satrec, time);
    };

    // Update the satellite position
    const updateSatPosition = (customTime = null) => {
        const now = new Date();
        const time = customTime || now;

        const positionAndVelocity = getSatPosition(time);

        if (positionAndVelocity.position && positionAndVelocity.velocity) {
            const { lat, lng, alt } = satPositionToLatLng(positionAndVelocity.position);

            // Calculate velocity magnitude in km/s
            const velocity = positionAndVelocity.velocity;
            const speed = Math.sqrt(
                Math.pow(velocity.x, 2) +
                Math.pow(velocity.y, 2) +
                Math.pow(velocity.z, 2)
            );

            // Calculate coverage area
            const coverageRadius = calculateCoverageRadius(alt);
            const coverageArea = Math.PI * Math.pow(coverageRadius / 1000, 2);

            // Update marker and circle if they exist
            if (satMarkerRef.current) {
                satMarkerRef.current.setLatLng([lat, lng]);
            }

            if (coverageCircleRef.current) {
                coverageCircleRef.current.setLatLng([lat, lng]);
                coverageCircleRef.current.setRadius(coverageRadius);
            }

            // Update state

            setSatData({
                ...satData,
                position: { lat, lng },
                altitude: alt,
                velocity: speed,
                coverageArea: coverageArea
            });
        }
    };

    // Calculate and draw the orbit path
    const calculateOrbitPath = () => {
        if (!orbitLineRef.current) return;

        const points = [];
        const now = new Date();

        // Calculate positions for one complete orbit (roughly 90 minutes)
        for (let i = 0; i < 500; i++) {
            const time = new Date(now.getTime() + i * 60 * 1000);
            const positionAndVelocity = getSatPosition(time);

            if (positionAndVelocity.position) {
                const { lat, lng } = satPositionToLatLng(positionAndVelocity.position);
                points.push([lat, lng]);
            }
        }

        // Update the polyline
        orbitLineRef.current.setLatLngs(points);

        // Calculate next pass over default location (New York)
        calculateNextPass(40.7128, 22.0060, "Athens");
    };

    // Calculate next pass over a location
    const calculateNextPass = (lat, lng, locationName) => {
        const now = new Date();
        let nextPass = null;

        for (let i = 0; i < 24 * 60; i++) {
            const time = new Date(now.getTime() + i * 60 * 1000);
            const positionAndVelocity = getSatPosition(time);

            if (positionAndVelocity.position) {
                const { lat: satLat, lng: satLng } = satPositionToLatLng(positionAndVelocity.position);

                // Simple check - within 20 degrees
                const distance = Math.sqrt(
                    Math.pow(satLat - lat, 2) +
                    Math.pow(satLng - lng, 2)
                );

                if (distance < 20 && !nextPass) {
                    nextPass = time;
                    break;
                }
            }
        }

        // Update state with next pass time
        setSatData({
            ...satData,
            nextPass: nextPass ? { time: nextPass, location: locationName } : null
        });
    };

    // Handle time slider change
    const handleTimeSliderChange = (e) => {
        const offsetMinutes = parseInt(e.target.value);
        setTimeOffset(offsetMinutes);

        if (offsetMinutes === 0) {
            updateSatPosition();
        } else {
            const now = new Date();
            const futureTime = new Date(now.getTime() + offsetMinutes * 60 * 1000);
            updateSatPosition(futureTime);
        }
    };

    // Center map on satellite
    const centerMapOnSat = () => {
        console.info('hello1');
        console.info(satData);
        if (mapRef.current && satData.position.lat !== 0) {
            console.info('hello2');
            mapRef.current.setView([satData.position.lat, satData.position.lng], 4);
        }
    };

    // Custom satellite icon SVG
    const satelliteSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" class="satellite-icon">
      <circle cx="12" cy="12" r="10" fill="#00FFFF" opacity="0.3" />
      <path fill="#00FFFF" d="M12,2C6.48,2,2,6.48,2,12c0,5.52,4.48,10,10,10s10-4.48,10-10C22,6.48,17.52,2,12,2z M12,20c-4.41,0-8-3.59-8-8 c0-4.41,3.59-8,8-8s8,3.59,8,8C20,16.41,16.41,20,12,20z"/>
      <path fill="#00FFFF" d="M7,8.5l3,3l-3,3l-1-1l2-2l-2-2L7,8.5z M17,8.5l-3,3l3,3l1-1l-2-2l2-2L17,8.5z"/>
      <rect x="10" y="7.5" width="4" height="1.5" fill="#00FFFF"/>
      <rect x="10" y="15" width="4" height="1.5" fill="#00FFFF"/>
      <rect x="7.5" y="10" width="1.5" height="4" fill="#00FFFF"/>
      <rect x="15" y="10" width="1.5" height="4" fill="#00FFFF"/>
    </svg>`;

    // Initialize the map
    useEffect(() => {
        // Create map
        const map = L.map('map', {
            zoomControl: false,
            minZoom: 1,
            maxZoom: 1,
        }).setView([0, 0], 2);
        mapRef.current = map;

        // show the map scale
        //L.control.scale().addTo(map);

        // zoom control
        map.touchZoom.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();
        map.boxZoom.disable();
        map.keyboard.disable();
        map.setZoom(1.5);

        // set boundaries for the map
        const bounds = [[-90, -180], [90, 180]]
        map.setMaxBounds(bounds);

        // Add dark mode basemap
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);

        // Create custom icon
        const satIcon = L.divIcon({
            html: satelliteSvg,
            className: 'satellite-icon',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        // Create marker for the satellite
        const satMarker = L.marker([0, 0], {
            icon: satIcon
        }).addTo(map);
        satMarkerRef.current = satMarker;

        // Create a polyline for the orbit path
        const orbitLine = L.polyline([], {
            color: '#FFFFFF',
            weight: 1,
            opacity: 0.3
        }).addTo(map);
        orbitLineRef.current = orbitLine;

        // Create a circle for the coverage area
        const coverageCircle = L.circle([0, 0], {
            radius: 0,
            color: '#FFFFFF',
            fillColor: '#FFFFFF',
            fillOpacity: 0.2,
            opacity: 0.5,
            weight: 1
        }).addTo(map);
        coverageCircleRef.current = coverageCircle;

        // Initialize the data
        updateSatPosition();
        calculateOrbitPath();

        // Center on satellite after initial load
        setTimeout(centerMapOnSat, 1000);

        // Set up intervals for updates
        const positionInterval = setInterval(updateSatPosition, 3000);
        const orbitInterval = setInterval(calculateOrbitPath, 60000);

        // Cleanup function
        return () => {
            clearInterval(positionInterval);
            clearInterval(orbitInterval);
            map.remove();
        };
    }, []); // Empty dependency array to run only once on mount

    return (
            <div id="map" style={{ width: '100%', height: '100%'}}></div>
       );
};

export default MapOrbitTracker;

