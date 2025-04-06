import React, { useEffect, useRef, useState } from 'react';
import { TitleBar } from "./common.jsx";
import { FormControl, InputLabel, MenuItem, Select, Button, CircularProgress, Slider, Stack, IconButton, Box, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { v4 as uuidv4 } from 'uuid';
import ReplayIcon from '@mui/icons-material/Replay';

const VideoWebRTCPlayer = ({ webRTCSrc, config = {} }) => {
    const videoRef = useRef(null);
    const videoContainerRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const clientIdRef = useRef(uuidv4());
    const [error, setError] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [cameras, setCameras] = useState([]);
    const [selectedCamera, setSelectedCamera] = useState("");

    // Define the relay server URL
    const RELAY_SERVER = "http://192.168.60.99:5000"; // Adjust this to your backend URL

    useEffect(() => {
        if (!videoRef.current || !webRTCSrc) return;

        // Clean up previous connection on component unmount
        return () => {
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        connect();

        return () => {
            disconnect();
        };
    }, []);

    // Add event listeners for playing and pausing
    useEffect(() => {
        const videoElement = videoRef.current;
        if (!videoElement) return;

        const handlePlay = () => {
        };
        const handlePause = () => {

        };

        videoElement.addEventListener('play', handlePlay);
        videoElement.addEventListener('pause', handlePause);

        return () => {
            videoElement.removeEventListener('play', handlePlay);
            videoElement.removeEventListener('pause', handlePause);
        };
    }, [videoRef.current]);

    // Handle reconnect/replay
    const handleReconnect = () => {
        connect();
    };

    const connect = async () => {
        try {
            setError(null);
            setIsLoading(true);

            // Create RTCPeerConnection
            const defaultConfig = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                ...config
            };

            // Clean up any existing connection
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
            }

            peerConnectionRef.current = new RTCPeerConnection(defaultConfig);
            const peerConnection = peerConnectionRef.current;

            // Set up event handlers
            peerConnection.ontrack = (event) => {
                if (videoRef.current && event.streams && event.streams[0]) {
                    videoRef.current.srcObject = event.streams[0];
                    setIsConnected(true);
                    setIsLoading(false);
                }
            };

            peerConnection.oniceconnectionstatechange = () => {
                if (peerConnection.iceConnectionState === 'failed' ||
                    peerConnection.iceConnectionState === 'disconnected') {
                    setError(`ICE connection ${peerConnection.iceConnectionState}`);
                    setIsLoading(false);
                }
            };

            // Create data channel (might be required by some servers)
            peerConnection.createDataChannel('video');

            // Create and set local description
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: true
            });
            await peerConnection.setLocalDescription(offer);

            // Wait for ICE gathering to complete
            await new Promise(resolve => {
                if (peerConnection.iceGatheringState === 'complete') {
                    resolve();
                } else {
                    const checkState = () => {
                        if (peerConnection.iceGatheringState === 'complete') {
                            peerConnection.removeEventListener('icegatheringstatechange', checkState);
                            resolve();
                        }
                    };
                    peerConnection.addEventListener('icegatheringstatechange', checkState);
                    // Set a timeout to avoid hanging forever
                    setTimeout(resolve, 5000);
                }
            });

            // Send offer to relay server
            const response = await fetch(`${RELAY_SERVER}/api/webrtc/offer`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    source_url: webRTCSrc,
                    camera_id: selectedCamera || undefined,
                    type: peerConnection.localDescription.type,
                    sdp: peerConnection.localDescription.sdp
                })
            });

            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }

            const answerData = await response.json();

            // Set remote description
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answerData));

        } catch (err) {
            console.error("WebRTC connection error:", err);
            setError(err.message || "Failed to connect to WebRTC stream");
            setIsLoading(false);
        }
    };

    const disconnect = () => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        setIsConnected(false);
    };

    return (
        <>
            <TitleBar className={"react-grid-draggable window-title-bar"}>WebRTC Video</TitleBar>
            <Grid container spacing={{ xs: 1, md: 1 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12  }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <FormControl size="small" fullWidth={true}>
                        <InputLabel id="dropdown-label">select camera</InputLabel>
                        <Select
                            labelId="dropdown-label"
                            value={""}
                            onChange={(e) => {

                            }}
                            label="select camera"
                            variant={'filled'}>
                            <MenuItem value="option1">Option 1</MenuItem>
                            <MenuItem value="option2">Option 2</MenuItem>
                            <MenuItem value="option3">Option 3</MenuItem>
                        </Select>
                    </FormControl>
                    </Grid>
                <Grid size={{ xs: 12, sm: 12, md: 12  }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}
                    container
                    direction="column"
                    ref={videoContainerRef}
                    sx={{
                        position: 'relative',
                        width: '100%',
                            '&:hover .video-controls': {
                            opacity: 1,
                        },
                    }}
                    onMouseEnter={() => {}}
                    onMouseLeave={() => {}}
                >
                    {isLoading && (
                        <Grid sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                zIndex: 10
                            }}>
                            <CircularProgress />
                        </Grid>
                    )}

                    {error && (
                        <Grid
                            item
                            sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                color: 'error.main',
                                textAlign: 'center',
                                zIndex: 10
                            }}
                        >
                            <Typography variant="body1" color="error">
                                {error}
                            </Typography>
                            <Button
                                startIcon={<ReplayIcon />}
                                variant="contained"
                                color="primary"
                                onClick={handleReconnect}
                                sx={{ mt: 2 }}
                            >
                                Reconnect
                            </Button>
                        </Grid>
                    )}
                    <Grid>
                        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', display: 'block' }} />
                    </Grid>
                </Grid>
            </Grid>
        </>
    );
};

export default VideoWebRTCPlayer;