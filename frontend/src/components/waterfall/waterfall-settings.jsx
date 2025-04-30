import * as React from 'react';
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
import {setGridEditable, setRtlAgc, setTunerAgc} from './waterfall-slice.jsx';
import FrequencyControl from "./frequency-control.jsx";
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
} from './waterfall-slice.jsx'
import {
    Box,
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


const WaterfallSettings = React.memo(({deviceId = 0}) => {
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
    } = useSelector((state) => state.waterfall);

    const { sdrs } = useSelector((state) => state.sdrs);

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

    const handleChange = (panel) => (event, isExpanded) => {
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

    function handleSDRChange(event) {
        dispatch(setSelectedSDRId(event.target.value));
    }

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Waterfall
                settings</TitleBar>
            <div style={{overflowY: 'auto', height: '100%', paddingBottom: '29px'}}>

                <Accordion expanded={expandedPanels.includes('freqControl')} onChange={handleChange('freqControl')}>
                    <AccordionSummary aria-controls="freq-content" id="freq-header">
                        <Typography component="span">Frequency control</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Box sx={{mb: 0, width: '100%'}}>
                            <FrequencyDisplay
                                initialFrequency={centerFrequency / 1000} // Convert Hz to kHz
                                onChange={(newFrequency) => dispatch(setCenterFrequency(newFrequency * 1000))} // Convert kHz back to Hz
                                size={"small"}
                            />
                        </Box>
                    </AccordionDetails>
                </Accordion>

                <Accordion expanded={expandedPanels.includes('sdr')} onChange={handleChange('sdr')}>
                    <AccordionSummary aria-controls="panel3d-content" id="panel3d-header">
                        <Typography component="span">SDR</Typography>
                    </AccordionSummary>
                    <AccordionDetails>

                        <Box sx={{mb: 2}}>
                            <FormControl disabled={isStreaming}
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

                            <FormControl sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true}
                                         variant="filled" size="small">
                                <InputLabel>Gain (dB)</InputLabel>
                                <Select
                                    size={'small'}
                                    value={localGain}
                                    onChange={(e) => {
                                        setLocalGain(e.target.value);
                                        dispatch(setGain(e.target.value));
                                    }}
                                    disabled={false}
                                    variant={'filled'}>
                                    {rtlGains.map(gain => (
                                        <MenuItem key={gain} value={gain}>
                                            {gain} dB
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true}
                                         variant="filled" size="small">
                                <InputLabel>Sample Rate</InputLabel>
                                <Select
                                    size={'small'}
                                    value={localSampleRate}
                                    onChange={(e) => {
                                        setLocalSampleRate(e.target.value);
                                        dispatch(setSampleRate(e.target.value));
                                    }}
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

                        <Box sx={{mb: 0, ml: 1.5}}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        size={'small'}
                                        checked={biasT}
                                        onChange={(e) => {
                                            dispatch(setBiasT(e.target.checked));
                                        }}
                                    />
                                }
                                label="Enable Bias T"
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        size={'small'}
                                        checked={tunerAgc}
                                        onChange={(e) => {
                                            dispatch(setTunerAgc(e.target.checked));
                                        }}
                                    />
                                }
                                label="Enable tuner AGC"
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        size={'small'}
                                        checked={rtlAgc}
                                        onChange={(e) => {
                                            dispatch(setRtlAgc(e.target.checked));
                                        }}
                                    />
                                }
                                label="Enable RTL AGC"
                            />
                        </Box>

                    </AccordionDetails>
                </Accordion>
                <Accordion expanded={expandedPanels.includes('fft')} onChange={handleChange('fft')}>
                    <AccordionSummary aria-controls="panel2d-content" id="panel2d-header">
                        <Typography component="span">FFT</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Box sx={{mb: 2}}>
                            <FormControl sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true}
                                         variant="filled" size="small">
                                <InputLabel>Target FPS</InputLabel>
                                <Select
                                    size={'small'}
                                    value={targetFPS}
                                    onChange={(e) => dispatch(setTargetFPS(e.target.value))}
                                    variant={'filled'}>
                                    {[5, 10, 15, 20, 30, 40, 50].map(fps => (
                                        <MenuItem key={fps} value={fps}>{fps}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl margin="normal" sx={{minWidth: 200, marginTop: 0, marginBottom: 1}}
                                         fullWidth={true} variant="filled"
                                         size="small">
                                <InputLabel>FFT Size</InputLabel>
                                <Select
                                    size={'small'}
                                    value={localFFTSize}
                                    onChange={(e) => {
                                        setLocalFFTSize(e.target.value);
                                        dispatch(setFFTSize(e.target.value));
                                    }}
                                    disabled={false}
                                    variant={'filled'}>
                                    {fftSizeOptions.map(size => (
                                        <MenuItem key={size} value={size}>{size}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true}
                                         variant="filled"
                                         size="small">
                                <InputLabel>Color Map</InputLabel>
                                <Select
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
                            <FormControl sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true}
                                         variant="filled" size="small">
                                <InputLabel>FFT Window</InputLabel>
                                <Select
                                    size={'small'}
                                    value={fftWindow}
                                    onChange={(e) => {
                                        dispatch(setFFTWindow(e.target.value));
                                    }}
                                    disabled={false}
                                    variant={'filled'}>
                                    {fftWindows.map(window => (
                                        <MenuItem key={window} value={window}>
                                            {window.charAt(0).toUpperCase() + window.slice(1)}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Box>
                        <Box sx={{mb: 0, ml: 1.5}}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        size={'small'}
                                        checked={localAutoDBRange}
                                        onChange={(e) => {
                                            setLocalAutoDBRange(e.target.checked);
                                            dispatch(setAutoDBRange(e.target.checked));
                                        }}
                                    />
                                }
                                label="Auto DB Range"
                            />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', mb: 2 }}>
                            <Typography sx={{ mr: 1, width: '60px', textAlign: 'left', fontFamily: 'Monospace' }}>{dbRange[0]}</Typography>
                            <Slider
                                size={'small'}
                                value={localDbRange}
                                onChange={(e, newValue) => {
                                    setLocalDbRange(newValue);
                                    dispatch(setDbRange(newValue));
                                }}
                                onChangeCommitted={(e, newValue) => {

                                }}
                                valueLabelDisplay="auto"
                                min={-110}
                                max={30}
                                step={1}
                                sx={{mx: 2}}
                            />
                            <Typography sx={{ml: 1, width: '60px', textAlign: 'right', fontFamily: 'Monospace'}}>{dbRange[1]}</Typography>
                        </Box>
                    </AccordionDetails>
                </Accordion>

            </div>
        </>
    );
});

export default WaterfallSettings;