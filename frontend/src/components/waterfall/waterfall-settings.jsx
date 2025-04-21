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
import {setGridEditable} from './waterfall-slice.jsx';
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
    } = useSelector((state) => state.waterfall);

    const [expandedPanels, setExpandedPanels] = React.useState(['panel1']);
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


    // Modified handler for toggling panels
    const handleChange = (panel) => (event, isExpanded) => {
        setExpandedPanels(prev => {
            if (isExpanded) {
                // Add the panel if it's not already in the array
                return prev.includes(panel) ? prev : [...prev, panel];
            } else {
                // Remove the panel if it's in the array
                return prev.filter(p => p !== panel);
            }
        });
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
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Waterfall
                settings</TitleBar>
            <div style={{overflowY: 'auto', height: '100%', paddingBottom: '29px'}}>
                <Accordion expanded={expandedPanels.includes('panel1')} onChange={handleChange('panel1')}>
                    <AccordionSummary aria-controls="panel1d-content" id="panel1d-header">
                        <Typography component="span">Frequency</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Box sx={{mb: 2, width: '100%'}}>
                            <FrequencyDisplay
                                initialFrequency={centerFrequency / 1000} // Convert Hz to kHz
                                onChange={(newFrequency) => dispatch(setCenterFrequency(newFrequency * 1000))} // Convert kHz back to Hz
                                size={"small"}
                            />
                        </Box>
                        <Box sx={{mb: 2, width: '300px'}}>
                            <Typography variant="body2" gutterBottom>
                                Center Frequency: {formatFrequency(centerFrequency)}
                            </Typography>
                            <FormControl fullWidth={true} variant="outlined" size="small" style={{paddingRight: '20px'}}>
                                <TextField
                                    type="number"
                                    value={localCenterFrequency}
                                    onChange={(e) => {
                                        setLocalCenterFrequency(Number(e.target.value));
                                        dispatch(setCenterFrequency(Number(e.target.value)));
                                    }}
                                    disabled={false}
                                    fullWidth
                                    size="small"
                                    variant="outlined"
                                />
                            </FormControl>
                        </Box>

                    </AccordionDetails>
                </Accordion>
                <Accordion expanded={expandedPanels.includes('panel2')} onChange={handleChange('panel2')}>
                    <AccordionSummary aria-controls="panel2d-content" id="panel2d-header">
                        <Typography component="span">Collapsible Group Item #2</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Box sx={{mb: 2}}>
                            <FormControlLabel
                                control={
                                    <Switch
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
                                value={localDbRange}
                                onChange={(e, newValue) => {
                                    setLocalDbRange(newValue);
                                }}
                                onChangeCommitted={(e, newValue) => {
                                    dispatch(setDbRange(newValue));
                                }}
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
                        </Box>
                        <Box sx={{ mb: 2 }}>
                            <FormControl sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth={true}
                                         variant="filled" size="small">
                                <InputLabel>Sample Rate</InputLabel>
                                <Select
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
                        <Box sx={{mb: 2}}>
                            <Typography variant="body2" gutterBottom>
                                Gain: {gain} dB
                            </Typography>
                            <Slider
                                value={localGain}
                                min={0}
                                max={49}
                                step={1}
                                onChange={(_, value) => {
                                    setLocalGain(value);
                                }}
                                onChangeCommitted={(_, value) => {
                                    dispatch(setGain(value));
                                }}
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
                    </AccordionDetails>
                </Accordion>
                <Accordion expanded={expandedPanels.includes('panel3')} onChange={handleChange('panel3')}>
                    <AccordionSummary aria-controls="panel3d-content" id="panel3d-header">
                        <Typography component="span">Collapsible Group Item #3</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Typography>
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse
                            malesuada lacus ex, sit amet blandit leo lobortis eget. Lorem ipsum dolor
                            sit amet, consectetur adipiscing elit. Suspendisse malesuada lacus ex,
                            sit amet blandit leo lobortis eget.
                        </Typography>
                    </AccordionDetails>
                </Accordion>
            </div>
        </>

    );
});

export default WaterfallSettings;