import React from 'react';
import {
    Accordion,
    AccordionSummary,
    AccordionDetails,
    LoadingOverlay,
} from './settings-elements.jsx';
import Typography from '@mui/material/Typography';
import {
    Box,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
} from "@mui/material";

const FftAccordion = ({
                          expanded,
                          onAccordionChange,
                          gettingSDRParameters,
                          fftSizeValues,
                          localFFTSize,
                          onFFTSizeChange,
                          fftWindowValues,
                          fftWindow,
                          onFFTWindowChange,
                          fftAveraging,
                          onFFTAveragingChange,
                          colorMaps,
                          localColorMap,
                          onColorMapChange,
                      }) => {
    return (
        <Accordion expanded={expanded} onChange={onAccordionChange}>
            <AccordionSummary
                sx={{
                    boxShadow: '-1px 4px 7px #00000059',
                }}
                aria-controls="panel2d-content" id="panel2d-header">
                <Typography component="span">FFT</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{
                backgroundColor: 'rgb(34,34,34)',
            }}>
                <LoadingOverlay loading={gettingSDRParameters}>
                    <Box sx={{mb: 2}}>
                        <FormControl disabled={gettingSDRParameters}
                                     margin="normal" sx={{minWidth: 200, marginTop: 0, marginBottom: 1}}
                                     fullWidth={true} variant="filled"
                                     size="small">
                            <InputLabel>FFT Size</InputLabel>
                            <Select
                                disabled={gettingSDRParameters}
                                size={'small'}
                                value={fftSizeValues.length ? localFFTSize : ""}
                                onChange={(e) => onFFTSizeChange(e.target.value)}
                                variant={'filled'}>
                                {fftSizeValues.map(size => (
                                    <MenuItem key={size} value={size}>{size}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl disabled={gettingSDRParameters}
                                     sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true}
                                     variant="filled" size="small">
                            <InputLabel>FFT Window</InputLabel>
                            <Select
                                disabled={gettingSDRParameters}
                                size={'small'}
                                value={fftWindowValues.length ? fftWindow : ""}
                                onChange={(e) => onFFTWindowChange(e.target.value)}
                                variant={'filled'}>
                                {fftWindowValues.map(window => (
                                    <MenuItem key={window} value={window}>
                                        {window.charAt(0).toUpperCase() + window.slice(1)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl disabled={gettingSDRParameters}
                                     sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true}
                                     variant="filled" size="small">
                            <InputLabel>FFT Averaging</InputLabel>
                            <Select
                                disabled={gettingSDRParameters}
                                size={'small'}
                                value={fftAveraging}
                                onChange={(e) => onFFTAveragingChange(e.target.value)}
                                variant={'filled'}>
                                <MenuItem value={1}>None</MenuItem>
                                <MenuItem value={2}>2 samples</MenuItem>
                                <MenuItem value={3}>3 samples</MenuItem>
                                <MenuItem value={4}>4 samples</MenuItem>
                                <MenuItem value={6}>6 samples</MenuItem>
                                <MenuItem value={8}>8 samples</MenuItem>
                                <MenuItem value={10}>10 samples</MenuItem>
                                <MenuItem value={12}>12 samples</MenuItem>
                                <MenuItem value={16}>16 samples</MenuItem>
                                <MenuItem value={18}>18 samples</MenuItem>
                                <MenuItem value={20}>20 samples</MenuItem>
                                <MenuItem value={24}>24 samples</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl disabled={gettingSDRParameters}
                                     sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true}
                                     variant="filled"
                                     size="small">
                            <InputLabel>Color Map</InputLabel>
                            <Select
                                disabled={gettingSDRParameters}
                                size={'small'}
                                value={localColorMap}
                                onChange={(e) => onColorMapChange(e.target.value)}
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
                </LoadingOverlay>
            </AccordionDetails>
        </Accordion>
    );
};

export default FftAccordion;