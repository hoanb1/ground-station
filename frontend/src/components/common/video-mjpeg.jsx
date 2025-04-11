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