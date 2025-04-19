import React, {useState} from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import {
    Box,
    CircularProgress,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    Slider,
    Switch, TextField,
    Typography
} from "@mui/material";
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
    setAutoDBRange,
} from './waterfall-slice.jsx'
import FrequencyDisplay from "./frequency-control.jsx";


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
        autoDBRange,
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
        <>
            <Dialog
                open={settingsDialogOpen}
                onClose={handleClose}
                aria-labelledby="sample-dialog-title"
                aria-describedby="sample-dialog-description"
            >
                <DialogTitle id="sample-dialog-title">Waterfall settings</DialogTitle>
                <DialogContent>


                        <Box sx={{mb: 2, width: '100%'}}>
                            <FrequencyDisplay
                                initialFrequency={centerFrequency / 1000} // Convert Hz to kHz
                                onChange={(newFrequency) => dispatch(setCenterFrequency(newFrequency * 1000))} // Convert kHz back to Hz
                            />
                        </Box>

                        <Box sx={{mb: 2, width: '300px'}}>
                            <Typography variant="body2" gutterBottom>
                                Center Frequency: {formatFrequency(centerFrequency)}
                            </Typography>
                            <FormControl fullWidth variant="outlined" size="small">
                                <TextField
                                    type="number"
                                    value={centerFrequency}
                                    onChange={(e) => dispatch(setCenterFrequency(Number(e.target.value)))}
                                    disabled={false}
                                    fullWidth
                                    size="small"
                                    variant="outlined"
                                />
                            </FormControl>
                        </Box>

                        <Box sx={{mb: 2}}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={autoDBRange}
                                        onChange={(e) => dispatch(setAutoDBRange(e.target.checked))}
                                    />
                                }
                                label="Auto DB Range"
                            />
                        </Box>

                        <Typography gutterBottom>Signal Range (dB)</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', mb: 2 }}>
                            <Typography sx={{ mr: 1, width: '60px', textAlign: 'left',  fontFamily: 'Monospace' }}>{dbRange[0]}</Typography>
                            <Slider
                                value={dbRange}
                                onChange={(e, newValue) => dispatch(setDbRange(newValue))}
                                valueLabelDisplay="auto"
                                min={-110}
                                max={0}
                                step={1}
                                sx={{mx: 2}}
                            />
                            <Typography sx={{ml: 1, width: '60px', textAlign: 'right', fontFamily: 'Monospace'}}>{dbRange[1]}</Typography>
                        </Box>

                        <Box sx={{mb: 2}}>
                            <FormControl margin="normal" sx={{minWidth: 200, marginTop: 0, marginBottom: 1}}
                                         fullWidth={true} variant="filled"
                                         size="small">
                                <InputLabel>FFT Size</InputLabel>
                                <Select
                                    value={fftSize}
                                    onChange={(e) => dispatch(setFFTSize(e.target.value))}
                                    disabled={false}
                                    variant={'filled'}>
                                    {fftSizeOptions.map(size => (
                                        <MenuItem key={size} value={size}>{size}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Box>

                        <Box sx={{ mb: 2 }}>
                            <FormControl sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true}
                                         variant="filled" size="small">
                                <InputLabel>Sample Rate</InputLabel>
                                <Select
                                    value={sampleRate}
                                    onChange={(e) => dispatch(setSampleRate(e.target.value))}
                                    disabled={false}
                                    variant={'filled'}>
                                    <MenuItem value={225001}>225.001 kHz</MenuItem>
                                    <MenuItem value={250000}>250 kHz</MenuItem>
                                    <MenuItem value={275000}>275 kHz</MenuItem>
                                    <MenuItem value={300000}>300 kHz</MenuItem>
                                    <MenuItem value={900001}>900.001 kHz</MenuItem>
                                    <MenuItem value={960000}>960 kHz</MenuItem>
                                    <MenuItem value={1024000}>1.024 MHz</MenuItem>
                                    <MenuItem value={1200000}>1.2 MHz</MenuItem>
                                    <MenuItem value={1440000}>1.44 MHz</MenuItem>
                                    <MenuItem value={1600000}>1.6 MHz</MenuItem>
                                    <MenuItem value={1800000}>1.8 MHz</MenuItem>
                                    <MenuItem value={2000000}>2 MHz</MenuItem>
                                    <MenuItem value={2048000}>2.048 MHz</MenuItem>
                                    <MenuItem value={2400000}>2.4 MHz</MenuItem>
                                    <MenuItem value={2560000}>2.56 MHz</MenuItem>
                                    <MenuItem value={2880000}>2.88 MHz</MenuItem>
                                    <MenuItem value={3000000}>3 MHz</MenuItem>
                                    <MenuItem value={3200000}>3.2 MHz</MenuItem>
                                </Select>
                            </FormControl>
                        </Box>

                        <Box sx={{mb: 2}}>
                            <Typography variant="body2" gutterBottom>
                                Gain: {gain} dB
                            </Typography>
                            <Slider
                                value={gain}
                                min={0}
                                max={49}
                                step={1}
                                onChange={(_, value) => dispatch(setGain(value))}
                                disabled={false}
                                aria-labelledby="gain-slider"
                            />
                        </Box>

                        <Box sx={{mb: 2}}>
                            <FormControl sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true}
                                         variant="filled"
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
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}