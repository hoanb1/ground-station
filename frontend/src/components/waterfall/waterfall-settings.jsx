import React, { useImperativeHandle, forwardRef, useCallback } from 'react';
import {styled} from '@mui/material/styles';
import ArrowForwardIosSharpIcon from '@mui/icons-material/ArrowForwardIosSharp';
import MuiAccordion from '@mui/material/Accordion';
import MuiAccordionSummary, {
    accordionSummaryClasses,
} from '@mui/material/AccordionSummary';
import MuiAccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import {getClassNamesBasedOnGridEditing, TitleBar} from "../common/common.jsx";
import {useSelector, useDispatch} from 'react-redux';
import {
    getSDRConfigParameters,
    setErrorDialogOpen,
    setGridEditable,
    setRtlAgc,
    setTunerAgc
} from './waterfall-slice.jsx';

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
    setTargetFPS,
    setSettingsDialogOpen,
    setAutoDBRange,
    setBiasT,
    setFFTWindow,
    setExpandedPanels,
    setSelectedSDRId,
    setSelectedAntenna,
    setSoapyAgc,
} from './waterfall-slice.jsx'
import {
    Box,
    CircularProgress,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    Slider,
    Switch,
    TextField
} from "@mui/material";
import FrequencyDisplay from "./frequency-control.jsx";
import {useEffect, useState} from "react";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";

const LoadingOverlay = ({ loading, children }) => {
    return (
        <Box sx={{ position: 'relative' }}>
            {children}

            {loading && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1000,
                    }}
                >
                    <CircularProgress />
                </Box>
            )}
        </Box>
    );
};


const Accordion = styled((props) => (
    <MuiAccordion disableGutters elevation={0} square {...props} />
))(({theme}) => ({
    border: `1px solid ${theme.palette.divider}`,
    '&:not(:last-child)': {
        borderBottom: 0,
    },
    '&::before': {
        display: 'none',
    },
}));

const AccordionSummary = styled((props) => (
    <MuiAccordionSummary
        expandIcon={<ArrowForwardIosSharpIcon sx={{fontSize: '0.9rem'}}/>}
        {...props}
    />
))(({theme}) => ({
    backgroundColor: 'rgba(0, 0, 0, .03)',
    flexDirection: 'row-reverse',
    minHeight: 34,
    height: 34,
    fontSize: '0.7rem',
    [`& .${accordionSummaryClasses.expandIconWrapper}.${accordionSummaryClasses.expanded}`]:
        {
            transform: 'rotate(90deg)',
        },
    [`& .${accordionSummaryClasses.content}`]: {
        marginLeft: theme.spacing(1),
    },
    ...theme.applyStyles('dark', {
        backgroundColor: 'rgba(255, 255, 255, .05)',
    }),
}));

const AccordionDetails = styled(MuiAccordionDetails)(({theme}) => ({
    padding: theme.spacing(2),
    borderTop: '1px solid rgba(0, 0, 0, .125)',
}));

const WaterfallSettings = forwardRef((props, ref) => {
    const dispatch = useDispatch();
    const {socket} = useSocket();

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
        targetFPS,
        settingsDialogOpen,
        autoDBRange,
        gridEditable,
        biasT,
        tunerAgc,
        rtlAgc,
        rtlGains,
        fftWindow,
        fftWindows,
        expandedPanels,
        selectedSDRId,
        gettingSDRParameters,
        gainValues,
        sampleRateValues,
        hasBiasT,
        hasTunerAgc,
        hasRtlAgc,
        fftSizeValues,
        fftWindowValues,
        antennasList,
        selectedAntenna,
        hasSoapyAgc,
        soapyAgc,
    } = useSelector((state) => state.waterfall);

    const {
        sdrs
    } = useSelector((state) => state.sdrs);

    const [localCenterFrequency, setLocalCenterFrequency] = useState(centerFrequency);
    const [localDbRange, setLocalDbRange] = useState(dbRange);
    const [localFFTSize, setLocalFFTSize] = useState(fftSize);
    const [localSampleRate, setLocalSampleRate] = useState(sampleRate);
    const [localGain, setLocalGain] = useState(gain);
    const [localColorMap, setLocalColorMap] = useState(colorMap);
    const [localAutoDBRange, setLocalAutoDBRange] = useState(autoDBRange);

    useEffect(() => {
        setLocalCenterFrequency(centerFrequency);
        setLocalDbRange(dbRange);
        setLocalFFTSize(fftSize);
        setLocalSampleRate(sampleRate);
        setLocalGain(gain);
        setLocalColorMap(colorMap);
        setLocalAutoDBRange(autoDBRange);
    }, [centerFrequency, dbRange, fftSize, sampleRate, gain, colorMap, autoDBRange]);

    const handleAccordionChange = (panel) => (event, isExpanded) => {
        const updateExpandedPanels = (expandedPanels) => {
            if (isExpanded) {
                return expandedPanels.includes(panel)
                    ? expandedPanels
                    : [...expandedPanels, panel];
            }
            return expandedPanels.filter(p => p !== panel);
        };
        dispatch(setExpandedPanels(updateExpandedPanels(expandedPanels)));
    };

    // Convert to useCallback to ensure stability of the function reference
    const sendSDRConfigToBackend = useCallback((updates = {}) => {
        if (selectedSDRId !== "none" && selectedSDRId !== "") {
            let SDRSettings = {
                selectedSDRId: selectedSDRId,
                centerFrequency: centerFrequency,
                sampleRate: sampleRate,
                gain: gain,
                fftSize: fftSize,
                biasT: biasT,
                tunerAgc: tunerAgc,
                rtlAgc: rtlAgc,
                fftWindow: fftWindow,
                antenna: selectedAntenna,
                soapyAgc: soapyAgc,
            }

            SDRSettings = {...SDRSettings, ...updates};
            console.info(`Sending SDR freq to backend: `, SDRSettings);
            socket.emit('sdr_data', 'configure-sdr', SDRSettings);

        } else {
            console.warn("No SDR selected, not sending SDR settings to backend");
        }
    }, [
            selectedSDRId,
            centerFrequency,
            sampleRate,
            gain,
            fftSize,
            biasT,
            tunerAgc,
            rtlAgc,
            fftWindow,
            socket
        ]
    );

    // Convert to useCallback to ensure stability of the function reference
    const handleSDRChange = useCallback((event) => {
        // Check what was selected
        console.info(event);

        const selectedValue = typeof event === 'object' ? event.target.value : event;

        dispatch(setSelectedSDRId(selectedValue));
        if (selectedValue === "none") {
            // Reset UI values since once we get new values from the backend, they might not be valid anymore
            dispatch(setSampleRate("none"));
            dispatch(setGain("none"));

        } else {
            // Call the backend
            console.info(`Getting SDR parameters for SDR ${selectedValue} from the backend`);
            dispatch(getSDRConfigParameters({socket, selectedSDRId: selectedValue}))
                .unwrap()
                .then(response => {
                    // Handle successful response
                })
                .catch(error => {
                    // Error occurred while getting SDR parameters
                    dispatch(setErrorMessage(error));
                    dispatch(setIsStreaming(false));
                    dispatch(setErrorDialogOpen(true));
                });
        }
    }, []);

    // Expose the function to parent components
    useImperativeHandle(ref, () => ({
        sendSDRConfigToBackend, handleSDRChange
    }));

    const updateCenterFrequency = (newFrequency) => (dispatch) => {
        let centerFrequency = newFrequency * 1000.0;
        dispatch(setCenterFrequency(centerFrequency));
        return sendSDRConfigToBackend({centerFrequency: centerFrequency});
    };

    const updateSDRGain = (gain) => (dispatch) => {
        dispatch(setGain(gain));
        return sendSDRConfigToBackend({gain: gain});
    };

    const updateSampleRate = (sampleRate) => (dispatch) => {
        dispatch(setSampleRate(sampleRate));
        return sendSDRConfigToBackend({sampleRate: sampleRate});
    };

    const updateBiasT = (enabled) => (dispatch) => {
        dispatch(setBiasT(enabled));
        return sendSDRConfigToBackend({biasT: enabled});
    };

    const updateTunerAgc = (enabled) => (dispatch) => {
        dispatch(setTunerAgc(enabled));
        return sendSDRConfigToBackend({tunerAgc: enabled});
    };

    const updateRtlAgc = (enabled) => (dispatch) => {
        dispatch(setRtlAgc(enabled));
        return sendSDRConfigToBackend({rtlAgc: enabled});
    };

    const updateFFTSize = (fftSize) => (dispatch) => {
        dispatch(setFFTSize(fftSize));
        return sendSDRConfigToBackend({fftSize: fftSize});
    };

    const updateFFTWindow = (fftWindow) => (dispatch) => {
        dispatch(setFFTWindow(fftWindow));
        return sendSDRConfigToBackend({fftWindow: fftWindow});
    };

    const updateSelectedAntenna = (antenna) => (dispatch) => {
        dispatch(setSelectedAntenna(antenna));
        return sendSDRConfigToBackend({antenna: antenna});
    };

    const updateSoapyAgc = (enabled) => (dispatch) => {
        dispatch(setSoapyAgc(enabled));
        return sendSDRConfigToBackend({soapyAgc: enabled});
    };

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Waterfall
                settings</TitleBar>
            <div style={{overflowY: 'auto', height: '100%', paddingBottom: '29px'}}>

                <Accordion expanded={expandedPanels.includes('freqControl')} onChange={handleAccordionChange('freqControl')}>
                    <AccordionSummary aria-controls="freq-content" id="freq-header">
                        <Typography component="span">Frequency control</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Box sx={{mb: 0, width: '100%'}}>
                            <FrequencyDisplay
                                initialFrequency={centerFrequency / 1000.0} // Convert Hz to kHz
                                onChange={(newFrequency) => {
                                    // Using custom thunk instead of direct dispatch
                                    dispatch(updateCenterFrequency(newFrequency));
                                }}
                                size={"small"}
                            />
                        </Box>
                    </AccordionDetails>
                </Accordion>

                <Accordion expanded={expandedPanels.includes('sdr')} onChange={handleAccordionChange('sdr')}>
                    <AccordionSummary aria-controls="panel3d-content" id="panel3d-header">
                        <Typography component="span">SDR</Typography>
                    </AccordionSummary>
                    <AccordionDetails>

                        <LoadingOverlay loading={gettingSDRParameters}>
                            <Box sx={{mb: 2}}>

                                <FormControl disabled={isStreaming} margin="normal"
                                             sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth variant="filled"
                                             size="small">
                                    <InputLabel htmlFor="sdr-select">SDR</InputLabel>
                                    <Select
                                        id="sdr-select"
                                        value={sdrs.length > 0? selectedSDRId: "none"}
                                        onChange={(event) => {
                                            handleSDRChange(event);
                                        }}
                                        variant={'filled'}>
                                        <MenuItem value="none">
                                            [no SDR selected]
                                        </MenuItem>
                                        <MenuItem value="" disabled>
                                            <em>select a SDR</em>
                                        </MenuItem>
                                        {sdrs.map((sdr, index) => {
                                            return <MenuItem value={sdr.id} key={index}>{sdr.name} ({sdr.type})</MenuItem>;
                                        })}
                                    </Select>
                                </FormControl>

                                <FormControl disabled={gettingSDRParameters}
                                             sx={{minWidth: 200, marginTop: 0, marginBottom: 1}}
                                             fullWidth={true}
                                             variant="filled" size="small">
                                    <InputLabel>Gain (dB)</InputLabel>
                                    <Select
                                        disabled={gettingSDRParameters}
                                        size={'small'}
                                        value={gainValues.length? localGain: "none"}
                                        onChange={(e) => {
                                            setLocalGain(e.target.value);
                                            dispatch(updateSDRGain(e.target.value));
                                        }}
                                        variant={'filled'}>
                                        <MenuItem value="none">
                                            [no gain selected]
                                        </MenuItem>
                                        {gainValues.map(gain => (
                                            <MenuItem key={gain} value={gain}>
                                                {gain} dB
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <FormControl disabled={gettingSDRParameters}
                                             sx={{minWidth: 200, marginTop: 0, marginBottom: 1}}
                                             fullWidth={true}
                                             variant="filled" size="small">
                                    <InputLabel>Sample Rate</InputLabel>
                                    <Select
                                        disabled={gettingSDRParameters}
                                        size={'small'}
                                        value={sampleRateValues.length? localSampleRate: "none"}
                                        onChange={(e) => {
                                            setLocalSampleRate(e.target.value);
                                            dispatch(updateSampleRate(e.target.value));
                                        }}
                                        variant={'filled'}>
                                        <MenuItem value="none">
                                            [no rate selected]
                                        </MenuItem>
                                        {sampleRateValues.map(rate => {
                                            // Format the sample rate for display
                                            let displayValue;
                                            if (rate >= 1000000) {
                                                displayValue = `${(rate / 1000000).toFixed(rate % 1000000 === 0 ? 0 : 3)} MHz`;
                                            } else {
                                                displayValue = `${(rate / 1000).toFixed(rate % 1000 === 0 ? 0 : 3)} kHz`;
                                            }
                                            return (
                                                <MenuItem key={rate} value={rate}>
                                                    {displayValue}
                                                </MenuItem>
                                            );
                                        })}
                                    </Select>
                                </FormControl>
                                <FormControl disabled={gettingSDRParameters}
                                             sx={{minWidth: 200, marginTop: 0, marginBottom: 1}}
                                             fullWidth={true}
                                             variant="filled" size="small">
                                    <InputLabel>Antenna</InputLabel>
                                    <Select
                                        disabled={gettingSDRParameters}
                                        size={'small'}
                                        value={antennasList.rx.length? selectedAntenna: "none"}
                                        onChange={(e) => {
                                            dispatch(updateSelectedAntenna(e.target.value));
                                        }}
                                        variant={'filled'}>
                                        <MenuItem value="none">
                                            [no antenna selected]
                                        </MenuItem>
                                        {antennasList.rx && antennasList.rx.map(antenna => (
                                            <MenuItem key={antenna} value={antenna}>
                                                {antenna}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>

                            <Box sx={{mb: 0, ml: 1.5}}>
                                {hasBiasT && (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                disabled={gettingSDRParameters}
                                                size={'small'}
                                                checked={biasT}
                                                onChange={(e) => {
                                                    dispatch(updateBiasT(e.target.checked));
                                                }}
                                            />
                                        }
                                        label="Enable Bias T"
                                    />
                                )}
                                {hasTunerAgc && (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                disabled={gettingSDRParameters}
                                                size={'small'}
                                                checked={tunerAgc}
                                                onChange={(e) => {
                                                    dispatch(updateTunerAgc(e.target.checked));
                                                }}
                                            />
                                        }
                                        label="Enable tuner AGC"
                                    />
                                )}
                                {hasSoapyAgc && (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                disabled={gettingSDRParameters}
                                                size={'small'}
                                                checked={soapyAgc}
                                                onChange={(e) => {
                                                    dispatch(updateSoapyAgc(e.target.checked));
                                                }}
                                            />
                                        }
                                        label="Enable AGC"
                                    />
                                )}
                                {hasRtlAgc && (
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                disabled={gettingSDRParameters}
                                                size={'small'}
                                                checked={rtlAgc}
                                                onChange={(e) => {
                                                    dispatch(updateRtlAgc(e.target.checked));
                                                }}
                                            />
                                        }
                                        label="Enable RTL AGC"
                                    />
                                )}
                            </Box>
                        </LoadingOverlay>
                    </AccordionDetails>

                </Accordion>
                <Accordion expanded={expandedPanels.includes('fft')} onChange={handleAccordionChange('fft')}>
                    <AccordionSummary aria-controls="panel2d-content" id="panel2d-header">
                        <Typography component="span">FFT</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
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
                                        value={fftSizeValues.length? localFFTSize: ""}
                                        onChange={(e) => {
                                            setLocalFFTSize(e.target.value);
                                            dispatch(updateFFTSize(e.target.value));
                                        }}
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
                                        value={fftWindowValues.length? fftWindow: ""}
                                        onChange={(e) => {
                                            dispatch(updateFFTWindow(e.target.value));
                                        }}
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
                                             variant="filled"
                                             size="small">
                                    <InputLabel>Color Map</InputLabel>
                                    <Select
                                        disabled={gettingSDRParameters}
                                        size={'small'}
                                        value={localColorMap}
                                        onChange={(e) => {
                                            setLocalColorMap(e.target.value);
                                            dispatch(setColorMap(e.target.value));
                                        }}
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
            </div>
        </>
    );
});

export default WaterfallSettings;