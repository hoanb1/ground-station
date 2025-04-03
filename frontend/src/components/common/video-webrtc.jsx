import React, { useEffect, useRef, useState } from 'react';
import {TitleBar} from "./common.jsx";
import {FormControl, InputLabel, MenuItem, Select} from "@mui/material";
import Grid from "@mui/material/Grid2";

const VideoWebRTCPlayer = ({ src, config = {} }) => {
    const videoRef = useRef(null);
    const [error, setError] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const iframeRef = useRef(null);

    let cameras = [];
    let selectedCamera = "";

    useEffect(() => {
        if (!videoRef.current || !src) return;

        // Extract base URL and query parameters
        const urlParts = src.split('?');
        const baseUrl = urlParts[0];
        const queryString = urlParts.length > 1 ? urlParts[1] : '';

        // For Frigate, we can simply embed their stream.html in an iframe
        // This avoids CORS issues entirely as the iframe will load directly from the Frigate server
        if (src.includes('stream.html')) {
            // Create iframe approach
            if (!iframeRef.current) {
                const iframe = document.createElement('iframe');
                iframe.src = src;
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                iframe.allow = 'camera; microphone; autoplay';

                // Clear the video container and add the iframe
                if (videoRef.current.parentNode) {
                    iframeRef.current = iframe;
                    videoRef.current.style.display = 'none';
                    videoRef.current.parentNode.appendChild(iframe);
                }
            }
            return;
        }

        // If not using iframe approach, try direct WebRTC connection
        let peerConnection = null;

        const connect = async () => {
            try {
                setError(null);

                // Extract the camera name from the URL if it's a Frigate URL
                const cameraName = queryString.includes('src=') ?
                    queryString.split('src=')[1].split('&')[0] : 'camera';

                // For Frigate, we need to use their specific WebRTC API endpoints
                const apiBase = baseUrl.split('/stream.html')[0];
                const webrtcUrl = `${apiBase}/api/webrtc`;

                // Create RTCPeerConnection with optional configuration
                const defaultConfig = {
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
                    ...config
                };

                peerConnection = new RTCPeerConnection(defaultConfig);

                // Set up event handlers
                peerConnection.ontrack = (event) => {
                    if (videoRef.current && event.streams && event.streams[0]) {
                        videoRef.current.srcObject = event.streams[0];
                        setIsConnected(true);
                    }
                };

                // Create data channel (might be required by some servers)
                peerConnection.createDataChannel('video');

                // Create and set local description
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
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
                    }
                });

                // Use a proxy server or same-origin endpoint to avoid CORS
                // This assumes you've set up a proxy on your server
                // Alternative: Use your app's backend as a proxy to make the request
                try {
                    // Direct approach - will likely fail due to CORS
                    // You should replace this with a proxy approach
                    const response = await fetch(`${webrtcUrl}/${cameraName}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            sdp: peerConnection.localDescription.sdp,
                            type: peerConnection.localDescription.type
                        }),
                        // ⚠️ Note: This won't work in production and is only for development
                        // mode: 'no-cors' // This will prevent you from reading the response
                    });

                    if (response.ok) {
                        const serverResponse = await response.json();
                        await peerConnection.setRemoteDescription(
                            new RTCSessionDescription(serverResponse)
                        );
                    } else {
                        throw new Error(`Server returned ${response.status}`);
                    }
                } catch (fetchError) {
                    console.error('Failed to establish WebRTC connection via fetch:', fetchError);
                    setError('CORS issue - using fallback iframe approach');

                    // Fallback to iframe approach
                    if (!iframeRef.current) {
                        const iframe = document.createElement('iframe');
                        iframe.src = src;
                        iframe.style.width = '100%';
                        iframe.style.height = '100%';
                        iframe.style.border = 'none';
                        iframe.allow = 'camera; microphone; autoplay';

                        // Clear the video container and add the iframe
                        if (videoRef.current.parentNode) {
                            iframeRef.current = iframe;
                            videoRef.current.style.display = 'none';
                            videoRef.current.parentNode.appendChild(iframe);
                        }
                    }
                }

            } catch (err) {
                console.error('WebRTC connection error:', err);
                setError(`WebRTC connection error: ${err.message}`);
                setIsConnected(false);
            }
        };

        connect();

        // Cleanup function
        return () => {
            if (peerConnection) {
                peerConnection.close();
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
            if (iframeRef.current && videoRef.current.parentNode) {
                videoRef.current.parentNode.removeChild(iframeRef.current);
                iframeRef.current = null;
                videoRef.current.style.display = 'block';
            }
            setIsConnected(false);
        };
    }, [src, config]);

    function handleOnCameraChange(event) {
        // Implement camera change logic here
    }

    return (
        <>
            <TitleBar className={"react-grid-draggable window-title-bar"}>WebRTC Video</TitleBar>
            <Grid container spacing={{ xs: 1, md: 1 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12  }} style={{padding: '0rem 0.5rem 0rem 0.5rem'}}>
                    <FormControl sx={{ marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"} size={"small"}>
                        <InputLabel htmlFor="camera-select">Camera</InputLabel>
                        <Select value={selectedCamera} id="camera-select" label="Grouping"
                                variant={"filled"} size={"small"} onChange={handleOnCameraChange}>
                            {cameras.map((camera, index) => {
                                return <MenuItem value={camera.id} key={index}>{camera.name}</MenuItem>;
                            })}
                        </Select>
                    </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 12, md: 12  }} style={{padding: '0rem 0.5rem 0rem 0.5rem'}}>
                    {error && (
                        <div style={{ color: 'red', marginBottom: '10px' }}>
                            {error}
                        </div>
                    )}
                    <div style={{ position: 'relative', height: '300px', width: '100%', border: '1px solid #424242' }}>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            controls
                            style={{
                                width: '100%',
                                height: '100%',
                                backgroundColor: '#111'
                            }}
                        />
                        {!isConnected && !iframeRef.current && !error && (
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                color: 'white'
                            }}>
                                Connecting...
                            </div>
                        )}
                    </div>
                </Grid>
            </Grid>
        </>
    );
};

export default VideoWebRTCPlayer;