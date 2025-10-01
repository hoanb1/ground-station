import React from 'react';
import {
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from './settings-elements.jsx';
import Typography from '@mui/material/Typography';
import {
    Box,
    FormControlLabel,
    Slider,
    Switch,
    Tab,
    Tabs,
    Stack,
    ToggleButtonGroup,
    ToggleButton,
} from "@mui/material";
import VolumeDown from '@mui/icons-material/VolumeDown';
import VolumeUp from '@mui/icons-material/VolumeUp';
import LCDFrequencyDisplay from "../common/lcd-frequency-display.jsx";
import RotaryEncoder from "./rotator-encoder.jsx";
import {SquelchIcon} from "../common/icons.jsx";

const BANDWIDTHS = {
    "3300": "3.3 kHz",
    "5000": "5 kHz",
    "10000": "10 kHz",
    "12500": "12.5 kHz",
    "15000": "15 kHz",
    "20000": "20 kHz"
};

const VfoAccordion = ({
                          expanded,
                          onAccordionChange,
                          selectedVFOTab,
                          onVFOTabChange,
                          vfoColors,
                          vfoMarkers,
                          vfoActive,
                          onVFOActiveChange,
                          onVFOPropertyChange,
                      }) => {
    return (
        <Accordion expanded={expanded} onChange={onAccordionChange}>
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
                    onChange={(event, newValue) => onVFOTabChange(newValue)}
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
                                    onChange={(e) => onVFOActiveChange(vfoIndex, e.target.checked)}
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
                                        onVFOPropertyChange(vfoIndex, { stepSize: newValue });
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
                                        fontSize: '0.8rem',
                                        border: '1px solid rgba(255, 255, 255, 0.23)',
                                        borderRadius: '4px',
                                        color: 'text.secondary',
                                        textAlign: 'center',
                                        textTransform: 'none',
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
                                        onVFOPropertyChange(vfoIndex, { mode: newValue });
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
                                        fontSize: '0.8rem',
                                        border: '1px solid rgba(255, 255, 255, 0.23)',
                                        borderRadius: '4px',
                                        color: 'text.secondary',
                                        textAlign: 'center',
                                        textTransform: 'none',
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
                                            onVFOPropertyChange(vfoIndex, { bandwidth: parseInt(newValue) });
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
                                        fontSize: '0.8rem',
                                        border: '1px solid rgba(255, 255, 255, 0.23)',
                                        borderRadius: '4px',
                                        color: 'text.secondary',
                                        textAlign: 'center',
                                        textTransform: 'none',
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
                                onChange={(e, val) => onVFOPropertyChange(vfoIndex, {squelch: val})}
                            />
                            <Box sx={{minWidth: 60}}>{vfoMarkers[vfoIndex]?.squelch || -150} dB</Box>
                        </Stack>

                        <Stack spacing={2} direction="row" alignItems="center" sx={{mt: 2}}>
                            <VolumeDown/>
                            <Slider
                                value={vfoMarkers[vfoIndex]?.volume || 50}
                                onChange={(e, val) => onVFOPropertyChange(vfoIndex, {volume: val})}
                            />
                            <VolumeUp/>
                        </Stack>
                    </Box>
                ))}
            </AccordionDetails>
        </Accordion>
    );
};

export default VfoAccordion;