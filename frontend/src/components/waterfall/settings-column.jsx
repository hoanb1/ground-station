/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */


import React, {useImperativeHandle, forwardRef, useCallback, useEffect, useState, useRef} from 'react';
import {styled} from '@mui/material/styles';
import ArrowForwardIosSharpIcon from '@mui/icons-material/ArrowForwardIosSharp';
import MuiAccordion from '@mui/material/Accordion';
import MuiAccordionSummary, {
    accordionSummaryClasses,
} from '@mui/material/AccordionSummary';
import {SquelchIcon} from '../common/icons.jsx';
import MuiAccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import {
    getClassNamesBasedOnGridEditing,
    humanizeFrequency,
    preciseHumanizeFrequency,
    TitleBar
} from "../common/common.jsx";
import {useSelector, useDispatch} from 'react-redux';

import {
    getSDRConfigParameters,
    setErrorDialogOpen,
    setGridEditable,
    setRtlAgc,
    setTunerAgc,
    setVFOProperty,
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
    setSelectedTransmitterId,
    setSelectedOffsetMode,
    setSelectedOffsetValue,
    setSelectedVFO,
    setSelectedVFOTab,
    setVfoInactive,
    setVfoActive,
} from './waterfall-slice.jsx';

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
    TextField,
    Tab,
    Tabs,
    Stack,
    ListSubheader,
    ToggleButtonGroup,
    ToggleButton,
} from "@mui/material";
import VolumeDown from '@mui/icons-material/VolumeDown';
import VolumeUp from '@mui/icons-material/VolumeUp';
import FrequencyDisplay from "./frequency-dial.jsx";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";
import getValue from "lodash/_getValue.js";
import LCDFrequencyDisplay from "../common/lcd-frequency-display.jsx";
import RotaryEncoder from "./rotaty-encoder.jsx";

const BANDWIDTHS = {
    "3300": "3.3 kHz",
    "5000": "5 kHz",
    "10000": "10 kHz",
    "12500": "12.5 kHz",
    "15000": "15 kHz",
    "20000": "20 kHz"
}

const LoadingOverlay = ({loading, children}) => {
    return (
        <Box sx={{position: 'relative'}}>
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
                    <CircularProgress/>
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
        selectedOffsetMode,
        selectedOffsetValue,
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
        selectedTransmitterId,
        selectedVFO,
        vfoMarkers,
        maxVFOMarkers,
        selectedVFOTab,
        vfoActive,
        vfoColors,
    } = useSelector((state) => state.waterfall);

    const {
        availableTransmitters,
    } = useSelector((state) => state.targetSatTrack);

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
    const hasInitializedRef = useRef(false);

    useEffect(() => {
        setLocalCenterFrequency(centerFrequency);
        setLocalDbRange(dbRange);
        setLocalFFTSize(fftSize);
        setLocalSampleRate(sampleRate);
        setLocalGain(gain);
        setLocalColorMap(colorMap);
        setLocalAutoDBRange(autoDBRange);
    }, [centerFrequency, dbRange, fftSize, sampleRate, gain, colorMap, autoDBRange]);

    useEffect(() => {
        // Only run once on mount if selectedSDRId exists and we haven't initialized yet
        if (selectedSDRId && !hasInitializedRef.current) {
            hasInitializedRef.current = true;
            handleSDRChange({target: {value: selectedSDRId}});
        }
        // No cleanup function - let the ref stay true to prevent any subsequent calls for StrictMode
    }, []);

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
                    offsetFrequency: selectedOffsetValue,
                }
                SDRSettings = {...SDRSettings, ...updates};
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
            socket,
            selectedOffsetValue,
            selectedAntenna,
            soapyAgc,
        ]
    );

    // Convert to useCallback to ensure stability of the function reference
    const handleSDRChange = useCallback((event) => {
        // Check what was selected
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
        console.info("updateSelectedAntenna", antenna);
        dispatch(setSelectedAntenna(antenna));
        return sendSDRConfigToBackend({antenna: antenna});
    };

    const updateSoapyAgc = (enabled) => (dispatch) => {
        dispatch(setSoapyAgc(enabled));
        return sendSDRConfigToBackend({soapyAgc: enabled});
    };

    function handleTransmitterChange(event) {
        // If a transmitter was selected, then set the SDR center frequency
        dispatch(setSelectedTransmitterId(event.target.value));
        const selectedTransmitterMetadata = availableTransmitters.find(t => t.id === event.target.value);
        const newFrequency = selectedTransmitterMetadata['downlink_low'] || 0;
        dispatch(setCenterFrequency(newFrequency));
        sendSDRConfigToBackend({centerFrequency: newFrequency});
    }

    function handleOffsetModeChange(event) {
        const offsetValue = event.target.value;

        if (offsetValue === "none") {
            dispatch(setSelectedOffsetMode(offsetValue));
            dispatch(setSelectedOffsetValue(0));
            return sendSDRConfigToBackend({offsetFrequency: 0});
        } else if (offsetValue === "manual") {
            dispatch(setSelectedOffsetMode(offsetValue));
            return sendSDRConfigToBackend({offsetFrequency: parseInt(selectedOffsetValue)});
        } else {
            dispatch(setSelectedOffsetValue(offsetValue));
            dispatch(setSelectedOffsetMode(offsetValue));
            return sendSDRConfigToBackend({offsetFrequency: parseInt(offsetValue)});
        }
    }

    function handleOffsetValueChange(param) {
        const offsetValue = param.target.value;
        dispatch(setSelectedOffsetValue(offsetValue));
        return sendSDRConfigToBackend({offsetFrequency: parseInt(offsetValue)});
    }

    function getProperTransmitterId() {
        if (availableTransmitters.length > 0 && selectedTransmitterId) {
            if (availableTransmitters.find(t => t.id === selectedTransmitterId)) {
                return selectedTransmitterId;
            } else {
                return "none";
            }
        } else {
            return "none";
        }
    }

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Waterfall
                settings</TitleBar>
            <div style={{overflowY: 'auto', height: '100%', paddingBottom: '29px'}}>

                <Accordion expanded={expandedPanels.includes('freqControl')}
                           onChange={handleAccordionChange('freqControl')}>
                    <AccordionSummary
                        sx={{
                            boxShadow: '-1px 4px 7px #00000059',
                        }}
                        aria-controls="freq-content" id="freq-header">
                        <Typography component="span">Frequency control</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{
                        backgroundColor: 'rgb(34,34,34)',
                    }}>
                        <Box sx={{mb: 0, width: '100%'}}>
                            <FrequencyDisplay
                                initialFrequency={centerFrequency / 1000.0}
                                onChange={(newFrequency) => {
                                    dispatch(updateCenterFrequency(newFrequency));
                                }}
                                size={"small"}
                            />
                        </Box>

                        <FormControl disabled={false}
                                     sx={{minWidth: 200, marginTop: 1, marginBottom: 0}} fullWidth variant="filled"
                                     size="small">
                            <InputLabel htmlFor="transmitter-select">Go to transmitter</InputLabel>
                            <Select
                                id="transmitter-select"
                                value={getProperTransmitterId()}
                                onChange={(event) => {
                                    handleTransmitterChange(event);
                                }}
                                variant={'filled'}>
                                <MenuItem value="none">
                                    [no frequency selected]
                                </MenuItem>
                                <MenuItem value="" disabled>
                                    <em>select a transmitter</em>
                                </MenuItem>
                                {availableTransmitters.map((transmitter, index) => {
                                    return <MenuItem value={transmitter.id} key={transmitter.id}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box
                                                sx={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: '50%',
                                                    backgroundColor: transmitter.alive ? '#4caf50' : '#f44336',
                                                    boxShadow: transmitter.alive
                                                        ? '0 0 6px rgba(76, 175, 80, 0.6)'
                                                        : '0 0 6px rgba(244, 67, 54, 0.6)',
                                                }}
                                            />
                                            <span>
                                                {transmitter['description']} ({humanizeFrequency(transmitter['downlink_low'])})
                                            </span>
                                        </Box>
                                    </MenuItem>;
                                })}
                            </Select>
                        </FormControl>

                        <FormControl
                            disabled={false}
                            sx={{minWidth: 200, marginTop: 1, marginBottom: 0}}
                            fullWidth
                            variant="filled"
                            size="small">
                            <InputLabel htmlFor="frequency-offset-select">Frequency Offset</InputLabel>
                            <Select
                                id="frequency-offset-select"
                                value={selectedOffsetMode || "none"}
                                onChange={(event) => {
                                    handleOffsetModeChange(event);
                                }}
                                variant={'filled'}>
                                <MenuItem value="none">
                                    [no frequency offset]
                                </MenuItem>
                                <MenuItem value="manual">Manual</MenuItem>
                                <MenuItem value="" disabled>
                                    <em>select an offset</em>
                                </MenuItem>
                                <MenuItem value="-6800000000">DK5AV X-Band (-6800MHz)</MenuItem>
                                <MenuItem value="125000000">Ham-it-Up (+125MHz)</MenuItem>
                                <MenuItem value="-10700000000">Ku LNB (-10700MHz)</MenuItem>
                                <MenuItem value="-9750000000">Ku LNB (-9750MHz)</MenuItem>
                                <MenuItem value="-1998000000">MMDS S-Band (-1998MHz)</MenuItem>
                                <MenuItem value="120000000">SpyVerter (+120MHz)</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl disabled={selectedOffsetMode !== "manual"} sx={{minWidth: 200, marginTop: 1}}
                                     fullWidth variant="filled"
                                     size="small">
                            <TextField
                                disabled={selectedOffsetMode !== "manual"}
                                label="Manual Offset (Hz)"
                                value={selectedOffsetValue}
                                variant="filled"
                                size="small"
                                type="number"
                                onChange={(e) => {
                                    const offset = parseFloat(e.target.value);
                                    if (!isNaN(offset)) {
                                        handleOffsetValueChange({target: {value: offset.toString()}});
                                    }
                                }}
                            />
                        </FormControl>

                    </AccordionDetails>
                </Accordion>

                <Accordion expanded={expandedPanels.includes('sdr')} onChange={handleAccordionChange('sdr')}>
                    <AccordionSummary
                        sx={{
                            boxShadow: '-1px 4px 7px #00000059',
                        }}
                        aria-controls="panel3d-content" id="panel3d-header">
                        <Typography component="span">SDR</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{
                        backgroundColor: 'rgb(34,34,34)',
                    }}>
                        <LoadingOverlay loading={gettingSDRParameters}>
                            <Box sx={{mb: 2}}>

                                <FormControl disabled={isStreaming} margin="normal"
                                             sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth
                                             variant="filled"
                                             size="small">
                                    <InputLabel htmlFor="sdr-select">SDR</InputLabel>
                                    <Select
                                        id="sdr-select"
                                        value={sdrs.length > 0 ? selectedSDRId : "none"}
                                        onChange={(event) => {
                                            handleSDRChange(event);
                                        }}
                                        variant={'filled'}>
                                        <MenuItem value="none">
                                            [no SDR selected]
                                        </MenuItem>
                                        {/* Local SDRs */}
                                        {sdrs.filter(sdr => sdr.type.toLowerCase().includes('local')).length > 0 && (
                                            <ListSubheader>Local SDRs</ListSubheader>
                                        )}
                                        {sdrs
                                            .filter(sdr => sdr.type.toLowerCase().includes('local'))
                                            .map((sdr, index) => {
                                                return <MenuItem value={sdr.id} key={`local-${index}`}>
                                                    {sdr.name} ({sdr.type})
                                                </MenuItem>;
                                            })
                                        }

                                        {/* Remote SDRs */}
                                        {sdrs.filter(sdr => sdr.type.toLowerCase().includes('remote')).length > 0 && (
                                            <ListSubheader>Remote SDRs</ListSubheader>
                                        )}
                                        {sdrs
                                            .filter(sdr => sdr.type.toLowerCase().includes('remote'))
                                            .map((sdr, index) => {
                                                return <MenuItem value={sdr.id} key={`remote-${index}`}>
                                                    {sdr.name} ({sdr.type})
                                                </MenuItem>;
                                            })
                                        }

                                        {/* Other SDRs (neither local nor remote) */}
                                        {sdrs.filter(sdr => !sdr.type.toLowerCase().includes('local') && !sdr.type.toLowerCase().includes('remote')).length > 0 && (
                                            <ListSubheader>Other SDRs</ListSubheader>
                                        )}
                                        {sdrs
                                            .filter(sdr => !sdr.type.toLowerCase().includes('local') && !sdr.type.toLowerCase().includes('remote'))
                                            .map((sdr, index) => {
                                                return <MenuItem value={sdr.id} key={`other-${index}`}>
                                                    {sdr.name} ({sdr.type})
                                                </MenuItem>;
                                            })
                                        }
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
                                        value={gainValues.length ? localGain : "none"}
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
                                        value={sampleRateValues.includes(localSampleRate) ? localSampleRate : "none"}
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
                                        value={antennasList.rx.includes(selectedAntenna) ? selectedAntenna : "none"}
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
                                        value={fftWindowValues.length ? fftWindow : ""}
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

                <Accordion expanded={expandedPanels.includes('vfo')} onChange={handleAccordionChange('vfo')}>
                    <AccordionSummary
                        sx={{
                            boxShadow: '-1px 4px 7px #00000059',
                        }}
                        aria-controls="vfo-content" id="vfo-header">
                        <Typography component="span">VFO Controls</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{
                        backgroundColor: 'rgb(34,34,34)',
                    }}>
                        <Tabs
                            value={selectedVFOTab}
                            onChange={(event, newValue) => {
                                dispatch(setSelectedVFOTab(newValue));
                            }}
                            sx={{
                                minHeight: '32px',
                                '& .MuiTab-root': {
                                    minHeight: '32px',
                                    padding: '6px 12px'
                                },
                                '& .MuiTabs-indicator': {
                                    backgroundColor: '#ffffffcc',
                                }
                            }}
                        >
                            {[0, 1, 2, 3].map((index) => (
                                <Tab key={index} label={`VFO ${index + 1}`} sx={{
                                    minWidth: '25%',
                                    backgroundColor: `${vfoColors[index]}40`, // CC = 80% opacity (204/255)
                                    '&.Mui-selected': {
                                        fontWeight: 'bold',
                                        borderBottom: 'none',
                                        color: '#ffffff',
                                    },
                                }}/>
                            ))}

                        </Tabs>
                        {[1, 2, 3, 4].map((vfoIndex) => (
                            <Box key={vfoIndex} hidden={(selectedVFOTab + 1) !== vfoIndex}>
                                <Box sx={{
                                    mt: 2,
                                    mb: 0,
                                    typography: 'body1',
                                    fontWeight: 'medium',
                                    alignItems: 'center'
                                }}>
                                    <Box
                                        sx={{
                                            fontFamily: "Monospace",
                                            color: '#2196f3',
                                            alignItems: 'center',
                                            textAlign: 'center',
                                            justifyContent: 'center'
                                        }}>
                                        <LCDFrequencyDisplay
                                            frequency={vfoMarkers[vfoIndex]?.frequency || 0}
                                            size={"large"}/>
                                    </Box>
                                </Box>

                                <RotaryEncoder vfoNumber={vfoIndex} />

                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={vfoActive[vfoIndex] || false}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    dispatch(setVfoActive(vfoIndex));
                                                } else {
                                                    dispatch(setVfoInactive(vfoIndex));
                                                }
                                            }}
                                        />
                                    }
                                    label="Active"
                                    sx={{mt: 0, ml: 0}}
                                />

                                <Box sx={{ mt: 1 }}>
                                    <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                                        Step Size
                                    </Typography>
                                    <ToggleButtonGroup
                                        value={vfoMarkers[vfoIndex]?.stepSize || 1000}
                                        exclusive
                                        onChange={(event, newValue) => {
                                            if (newValue !== null) {
                                                dispatch(setVFOProperty({
                                                    vfoNumber: vfoIndex,
                                                    updates: { stepSize: newValue }
                                                }));
                                            }
                                        }}
                                        sx={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 0.5,
                                            '& .MuiToggleButton-root': {
                                                width: '60px',
                                                height: '28px',
                                                minWidth: '70px',
                                                maxWidth: '60px',
                                                padding: '4px 6px',
                                                fontSize: '0.7rem',
                                                border: '1px solid rgba(255, 255, 255, 0.23)',
                                                borderRadius: '4px',
                                                color: 'text.secondary',
                                                textAlign: 'center',
                                                '&.Mui-selected': {
                                                    backgroundColor: 'primary.main',
                                                    color: 'primary.contrastText',
                                                    '&:hover': {
                                                        backgroundColor: 'primary.dark',
                                                    }
                                                },
                                                '&:hover': {
                                                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                                }
                                            }
                                        }}
                                    >
                                        <ToggleButton value={100}>100 Hz</ToggleButton>
                                        <ToggleButton value={500}>500 Hz</ToggleButton>
                                        <ToggleButton value={1000}>1 kHz</ToggleButton>
                                        <ToggleButton value={2500}>2.5 kHz</ToggleButton>
                                        <ToggleButton value={5000}>5 kHz</ToggleButton>
                                        <ToggleButton value={10000}>10 kHz</ToggleButton>
                                        <ToggleButton value={12500}>12.5 kHz</ToggleButton>
                                        <ToggleButton value={20000}>20 kHz</ToggleButton>
                                        <ToggleButton value={25000}>25 kHz</ToggleButton>
                                    </ToggleButtonGroup>
                                </Box>

                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                                        Modulation
                                    </Typography>
                                    <ToggleButtonGroup
                                        value={vfoMarkers[vfoIndex]?.mode || 'none'}
                                        exclusive
                                        onChange={(event, newValue) => {
                                            if (newValue !== null) {
                                                dispatch(setVFOProperty({
                                                    vfoNumber: vfoIndex,
                                                    updates: { mode: newValue }
                                                }));
                                            }
                                        }}
                                        sx={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 0.5,
                                            '& .MuiToggleButton-root': {
                                                width: '50px',
                                                height: '28px',
                                                minWidth: '50px',
                                                maxWidth: '50px',
                                                padding: '4px 6px',
                                                fontSize: '0.7rem',
                                                border: '1px solid rgba(255, 255, 255, 0.23)',
                                                borderRadius: '4px',
                                                color: 'text.secondary',
                                                textAlign: 'center',
                                                '&.Mui-selected': {
                                                    backgroundColor: 'primary.main',
                                                    color: 'primary.contrastText',
                                                    '&:hover': {
                                                        backgroundColor: 'primary.dark',
                                                    }
                                                },
                                                '&:hover': {
                                                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                                }
                                            }
                                        }}
                                    >
                                        <ToggleButton value="none">None</ToggleButton>
                                        <ToggleButton value="am">AM</ToggleButton>
                                        <ToggleButton value="fm">FM</ToggleButton>
                                        <ToggleButton value="lsb">LSB</ToggleButton>
                                        <ToggleButton value="usb">USB</ToggleButton>
                                    </ToggleButtonGroup>
                                </Box>

                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                                        Bandwidth
                                    </Typography>
                                    <ToggleButtonGroup
                                        value={BANDWIDTHS.hasOwnProperty(vfoMarkers[vfoIndex]?.bandwidth) ? vfoMarkers[vfoIndex]?.bandwidth.toString() : 'custom'}
                                        exclusive
                                        onChange={(event, newValue) => {
                                            if (newValue !== null) {
                                                if (newValue === 'custom') {
                                                    // Keep current value or set a default
                                                    return;
                                                } else {
                                                    dispatch(setVFOProperty({
                                                        vfoNumber: vfoIndex,
                                                        updates: { bandwidth: parseInt(newValue) }
                                                    }));
                                                }
                                            }
                                        }}
                                        sx={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 0.5,
                                            '& .MuiToggleButton-root': {
                                                width: '65px',
                                                height: '28px',
                                                minWidth: '65px',
                                                maxWidth: '65px',
                                                padding: '4px 6px',
                                                fontSize: '0.7rem',
                                                border: '1px solid rgba(255, 255, 255, 0.23)',
                                                borderRadius: '4px',
                                                color: 'text.secondary',
                                                textAlign: 'center',
                                                '&.Mui-selected': {
                                                    backgroundColor: 'primary.main',
                                                    color: 'primary.contrastText',
                                                    '&:hover': {
                                                        backgroundColor: 'primary.dark',
                                                    }
                                                },
                                                '&:hover': {
                                                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                                }
                                            }
                                        }}
                                    >
                                        <ToggleButton value="custom">Custom</ToggleButton>
                                        {Object.entries(BANDWIDTHS).map(([value, label]) => (
                                            <ToggleButton key={value} value={value}>
                                                {label}
                                            </ToggleButton>
                                        ))}
                                    </ToggleButtonGroup>
                                </Box>

                                <Stack spacing={2} direction="row" alignItems="center" sx={{mt: 2}}>
                                    <Box sx={{textAlign: 'left'}}><SquelchIcon size={24}/></Box>
                                    <Slider
                                        value={vfoMarkers[vfoIndex]?.squelch || -150}
                                        min={-150}
                                        max={0}
                                        onChange={(e, val) => dispatch(setVFOProperty({
                                            vfoNumber: vfoIndex,
                                            updates: {squelch: val}
                                        }))}
                                    />
                                    <Box sx={{minWidth: 60}}>{vfoMarkers[vfoIndex]?.squelch || -150} dB</Box>
                                </Stack>

                                <Stack spacing={2} direction="row" alignItems="center" sx={{mt: 2}}>
                                <VolumeDown/>
                                    <Slider
                                        value={vfoMarkers[vfoIndex]?.volume || 50}
                                        onChange={(e, val) => dispatch(setVFOProperty({
                                            vfoNumber: vfoIndex,
                                            updates: {volume: val}
                                        }))}
                                    />
                                    <VolumeUp/>
                                </Stack>
                            </Box>
                        ))}
                    </AccordionDetails>
                </Accordion>
            </div>
        </>
    );
});

export default WaterfallSettings;