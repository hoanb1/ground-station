import React, { useEffect, useRef, useState } from 'react';
import {getClassNamesBasedOnGridEditing, TitleBar} from "./common.jsx";
import { FormControl, InputLabel, MenuItem, Select, Button, CircularProgress, Slider, Stack, IconButton, Box, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { v4 as uuidv4 } from 'uuid';
import ReplayIcon from '@mui/icons-material/Replay';
import {useDispatch, useSelector} from 'react-redux';
import {setSelectedCameraId} from "../hardware/camera-slice.jsx";
import VideoWebRTCPlayer from './video-webrtc.jsx';
import VideoHLS from './video-hls.jsx';
import VideoMJPEG from './video-mjpeg.jsx';
import CameraAltIcon from '@mui/icons-material/CameraAlt';

const CameraView = () => {
    const dispatch = useDispatch();
    const { cameras, selectedCameraId, selectedCamera } = useSelector((state) => state.cameras);
    const { gridEditable } = useSelector((state) => state.targetSatTrack);

    const handleCameraChange = (event) => {
        dispatch(setSelectedCameraId(event.target.value));
    };

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Camera view</TitleBar>
            <Grid container spacing={{ xs: 1, md: 1 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12  }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <FormControl size="small" fullWidth={true}>
                        <InputLabel id="dropdown-label">camera</InputLabel>
                        <Select
                            labelId="dropdown-label"
                            value={selectedCameraId}
                            onChange={(e) => {
                                handleCameraChange(e);
                            }}
                            label="select camera"
                            variant={'filled'}>
                            {cameras.map((camera) => (
                                <MenuItem key={camera.id} value={camera.id}>
                                    {camera.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    </Grid>

                {selectedCamera['type'] === 'webrtc' && (
                    <React.Suspense fallback={<CircularProgress/>}>
                        <VideoWebRTCPlayer src={selectedCamera['url']}/>
                    </React.Suspense>
                )}
                {selectedCamera['type'] === 'hls' && (
                    <React.Suspense fallback={<CircularProgress/>}>
                        <VideoHLS/>
                    </React.Suspense>
                )}
                {selectedCamera['type'] === 'mjpeg' && (
                    <React.Suspense fallback={<CircularProgress/>}>
                        <VideoMJPEG/>
                    </React.Suspense>
                )}
                {selectedCamera['type'] === '' && (
                    <Box display="flex" justifyContent="center" alignItems="center" margin="auto" height="100vh">
                        <CameraAltIcon style={{fontSize: '4rem', color: 'gray'}}/>
                    </Box>
                )}
            </Grid>
        </>
    );
};

export default CameraView;