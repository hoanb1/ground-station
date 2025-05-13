/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
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


import React, { useState, useEffect } from 'react';
import {TitleBar} from "./common.jsx";
import {FormControl, InputLabel, MenuItem, Select} from "@mui/material";
import Grid from "@mui/material/Grid2";

const VideoMJPEGPlayer = ({ src, refreshRate = 0 }) => {
    const [imageUrl, setImageUrl] = useState(src);
    let cameras = [];
    let selectedCamera = "";

    // Generate a timestamp-based URL to force refresh
    const generateImageUrl = () => {
        if (!src) return '';

        const separator = src.includes('?') ? '&' : '?';
        return `${src}${separator}t=${Date.now()}`;
    };

    useEffect(() => {
        // Initial URL setup when source changes
        setImageUrl(refreshRate > 0 ? generateImageUrl() : src);

        // Set up refresh interval if refreshRate is specified
        let intervalId;
        if (refreshRate > 0 && src) {
            intervalId = setInterval(() => {
                setImageUrl(generateImageUrl());
            }, refreshRate * 1000); // Convert seconds to milliseconds
        }

        // Clean up interval on unmount or when props change
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [src, refreshRate]);

    function handleOnCameraChange(event) {
        // Implement camera change logic here
    }

    return (
        <>
            <Grid container spacing={{ xs: 1, md: 1 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12  }} style={{padding: '0rem 0.5rem 0rem 0.5rem'}}>
                    <img
                        src={imageUrl}
                        alt="MJPEG Stream"
                        style={{ width: '100%', height: 'auto', border: '1px solid #424242' }}
                    />
                </Grid>
            </Grid>
        </>
    );
};

export default VideoMJPEGPlayer;