import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import {TitleBar} from "./common.jsx";
import {FormControl, InputLabel, MenuItem, Select} from "@mui/material";
import Grid from "@mui/material/Grid2";

const VideoHLSPlayer = ({ src }) => {
    const videoRef = useRef(null);

    let cameras = [];
    let selectedCamera = "";

    useEffect(() => {
        if (!videoRef.current || !src) return;

        let hls;

        if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(src);
            hls.attachMedia(videoRef.current);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoRef.current.play();
            });
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            // For browsers that support HLS natively (e.g., Safari)
            videoRef.current.src = src;
            videoRef.current.addEventListener('loadedmetadata', () => {
                videoRef.current.play();
            });
        } else {
            console.error('Your browser does not support HLS.');
        }

        // Cleanup on component unmount
        return () => {
            if (hls) {
                hls.destroy();
            }
        };
    }, [src]);

    function handleOnCameraChange(event) {
        // Implement camera change logic here
    }

    return (
        <>
            <Grid container spacing={{ xs: 1, md: 1 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12  }} style={{padding: '0rem 0.5rem 0rem 0.5rem'}}>
                    <video
                        ref={videoRef}
                        controls
                        style={{ width: '100%', height: 'auto', border: '1px solid #424242' }}
                    />
                </Grid>
            </Grid>
        </>
    );
};

export default VideoHLSPlayer;