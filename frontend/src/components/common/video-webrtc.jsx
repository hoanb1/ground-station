import React, { useEffect, useRef, useState } from 'react';
import { TitleBar } from "./common.jsx";
import { FormControl, InputLabel, MenuItem, Select, Button, CircularProgress } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { v4 as uuidv4 } from 'uuid';

const VideoWebRTCPlayer = ({ webRTCSrc, config = {} }) => {
    const videoRef = useRef(null);
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
                throw new Error(`Server error: ${response.status}`);
            }

            // Apply the answer from the server
            const answer = await response.json();
            await peerConnection.setRemoteDescription(new RTCSessionDescription({
                type: answer.type,
                sdp: answer.sdp
            }));

        } catch (err) {
            console.error("WebRTC connection error:", err);
            setError(err.message || "Failed to establish WebRTC connection");
            setIsLoading(false);
        }
    };

    const disconnect = () => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsConnected(false);
    };

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <TitleBar className={"react-grid-draggable window-title-bar"}>WebRTC Video</TitleBar>
            <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                {cameras.length > 0 && (
                    <Grid container spacing={1} sx={{ mb: 1 }}>
                        <Grid>
                            <FormControl fullWidth size="small">
                                <InputLabel id="camera-select-label">Camera</InputLabel>
                                <Select
                                    labelId="camera-select-label"
                                    value={selectedCamera}
                                    label="Camera"
                                    onChange={(e) => setSelectedCamera(e.target.value)}
                                 variant={'filled'}>
                                    {cameras.map(camera => (
                                        <MenuItem key={camera} value={camera}>{camera}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                )}

                    <div style={{ position: 'relative', flex: 1, backgroundColor: '#000' }}>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain'
                        }}
                    />
                    {error && (
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: 'white',
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            padding: '10px',
                            borderRadius: '4px',
                            textAlign: 'center'
                        }}>
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VideoWebRTCPlayer;