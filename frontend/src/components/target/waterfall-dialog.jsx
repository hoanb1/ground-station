import React, {useState} from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import {Box, CircularProgress, FormControl, InputLabel, MenuItem, Select, Slider, Typography} from "@mui/material";
import {useDispatch, useSelector} from "react-redux";
import {
    setColorMap,
    setColorMaps,
    setDbRange,
    setFFTSize,
    setFFTSizeOptions,
    setGain,
    setSampleRate,
    setCenterFrequency,
    setErrorMessage,
    setIsStreaming,
    setIsConnected,
    setTargetFPS,
    setSettingsDialogOpen,
} from './waterfall-slice.jsx'


export default function WaterFallSettingsDialog() {
    const dispatch = useDispatch();
    const {
        colorMap,
        colorMaps,
        dbRange,
        fftSizeOptions,
        fftSize,
        gain,
        sampleRate,
        centerFrequency,
        errorMessage,
        isStreaming,
        isConnected,
        targetFPS,
        settingsDialogOpen,
    } = useSelector((state) => state.waterfall);

    const handleClickOpen = () => {
        dispatch(setSettingsDialogOpen(true));
    };

    const handleClose = () => {
        dispatch(setSettingsDialogOpen(false));
    };

    // Format frequency for display
    const formatFrequency = (freq) => {
        if (freq >= 1e9) {
            return `${(freq / 1e9).toFixed(3)} GHz`;
        } else if (freq >= 1e6) {
            return `${(freq / 1e6).toFixed(3)} MHz`;
        } else if (freq >= 1e3) {
            return `${(freq / 1e3).toFixed(3)} kHz`;
        }
        return `${freq.toFixed(0)} Hz`;
    };

    return (
        <div>
            <Button variant="outlined" onClick={handleClickOpen}>
                Open Dialog
            </Button>
            <Dialog
                open={settingsDialogOpen}
                onClose={handleClose}
                aria-labelledby="sample-dialog-title"
                aria-describedby="sample-dialog-description"
            >
                <DialogTitle id="sample-dialog-title">Waterfall settings</DialogTitle>
                <DialogContent>
                    <DialogContentText id="sample-dialog-description">

                        <Box sx={{ mb: 2, width: '300px' }}>
                            <Typography variant="body2" gutterBottom>
                                Center Frequency: {formatFrequency(centerFrequency)}
                            </Typography>
                            <Slider
                                value={centerFrequency}
                                min={24000000}  // 24 MHz
                                max={1766000000}  // 1.766 GHz
                                step={100000}  // 100 kHz steps
                                onChange={(_, value) => dispatch(setCenterFrequency(value))}
                                disabled={isStreaming}
                                aria-labelledby="frequency-slider"
                            />
                        </Box>

                        <Typography gutterBottom>Signal Range (dB)</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                            <Typography sx={{ mr: 1 }}>{dbRange[0]}</Typography>
                            <Slider
                                value={dbRange}
                                onChange={(e, newValue) => dispatch(setDbRange(newValue))}
                                valueLabelDisplay="auto"
                                min={-140}
                                max={0}
                                step={5}
                                sx={{ mx: 2 }}
                            />
                            <Typography sx={{ ml: 1 }}>{dbRange[1]}</Typography>
                        </Box>

                        <Box sx={{ mb: 2 }}>
                            <FormControl margin="normal" sx={{minWidth: 200, marginTop: 0, marginBottom: 1}}
                                         fullWidth={true} variant="filled"
                                         size="small">
                                <InputLabel>FFT Size</InputLabel>
                                <Select
                                    value={fftSize}
                                    onChange={(e) => dispatch(setFFTSize(e.target.value))}
                                    disabled={isStreaming}
                                    variant={'filled'}>
                                    {fftSizeOptions.map(size => (
                                        <MenuItem key={size} value={size}>{size}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Box>

                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2" gutterBottom>
                                Sample Rate: {formatFrequency(sampleRate)}
                            </Typography>
                            <Slider
                                value={sampleRate}
                                min={230000}  // 230 kHz
                                max={3200000}  // 3.2 MHz for most RTLSDRs
                                step={10000}
                                onChange={(_, value) => dispatch(setSampleRate(value))}
                                disabled={isStreaming}
                                aria-labelledby="sample-rate-slider"
                            />
                        </Box>

                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2" gutterBottom>
                                Gain: {gain} dB
                            </Typography>
                            <Slider
                                value={gain}
                                min={0}
                                max={49}
                                step={1}
                                onChange={(_, value) => dispatch(setGain(value))}
                                disabled={isStreaming}
                                aria-labelledby="gain-slider"
                            />
                        </Box>

                        <Box sx={{ mb: 2 }}>
                            <FormControl sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true} variant="filled"
                                         size="small">
                                <InputLabel>Color Map</InputLabel>
                                <Select
                                    value={colorMap}
                                    onChange={(e) => dispatch(setColorMap(e.target.value))}
                                    label="Color Map"
                                    variant={'filled'}>
                                    {colorMaps.map(map => (
                                        <MenuItem key={map} value={map}>
                                            {map.charAt(0).toUpperCase() + map.slice(1)}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Box>
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>Close</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}