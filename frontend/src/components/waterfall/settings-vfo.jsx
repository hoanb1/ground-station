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
import {SquelchIcon} from "../common/dataurl-icons.jsx";
import { useTranslation } from 'react-i18next';

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
                          selectedVFO,
                          onVFOListenChange,
                      }) => {
    const { t } = useTranslation('waterfall');
    const squelchSliderRef = React.useRef(null);
    const volumeSliderRef = React.useRef(null);

    React.useEffect(() => {
        const handleWheel = (e, vfoIndex, property, min, max, current) => {
            // Check if VFO is active before processing wheel event
            if (!vfoActive[vfoIndex]) {
                return;
            }
            e.preventDefault();
            const delta = e.deltaY > 0 ? -1 : 1;
            const newValue = Math.max(min, Math.min(max, current + delta));
            onVFOPropertyChange(vfoIndex, { [property]: newValue });
        };

        const squelchElements = document.querySelectorAll('[data-slider="squelch"]');
        const volumeElements = document.querySelectorAll('[data-slider="volume"]');

        squelchElements.forEach((el) => {
            const vfoIndex = parseInt(el.getAttribute('data-vfo-index'));
            const listener = (e) => handleWheel(e, vfoIndex, 'squelch', -150, 0, vfoMarkers[vfoIndex]?.squelch || -150);
            el.addEventListener('wheel', listener, { passive: false });
            el._wheelListener = listener;
        });

        volumeElements.forEach((el) => {
            const vfoIndex = parseInt(el.getAttribute('data-vfo-index'));
            const listener = (e) => handleWheel(e, vfoIndex, 'volume', 0, 100, vfoMarkers[vfoIndex]?.volume || 50);
            el.addEventListener('wheel', listener, { passive: false });
            el._wheelListener = listener;
        });

        return () => {
            squelchElements.forEach((el) => {
                if (el._wheelListener) {
                    el.removeEventListener('wheel', el._wheelListener);
                }
            });
            volumeElements.forEach((el) => {
                if (el._wheelListener) {
                    el.removeEventListener('wheel', el._wheelListener);
                }
            });
        };
    }, [vfoMarkers, vfoActive, onVFOPropertyChange]);

    return (
        <Accordion expanded={expanded} onChange={onAccordionChange}>
            <AccordionSummary
                sx={{
                    boxShadow: '-1px 4px 7px #00000059',
                }}
                aria-controls="vfo-content" id="vfo-header">
                <Typography component="span">{t('vfo.title')}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{
                backgroundColor: 'background.elevated',
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
                        <Tab key={index} label={t('vfo.vfo_number', { number: index + 1 })} sx={{
                            minWidth: '25%',
                            backgroundColor: `${vfoColors[index]}40`, // 40 = ~25% opacity in hex
                            '&.Mui-selected': {
                                fontWeight: 'bold',
                                borderBottom: 'none',
                                color: 'text.primary',
                            },
                        }}/>
                    ))}

                </Tabs>
                {[1, 2, 3, 4].map((vfoIndex) => (
                    <Box key={vfoIndex} hidden={(selectedVFOTab + 1) !== vfoIndex}>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={vfoActive[vfoIndex] || false}
                                        onChange={(e) => onVFOActiveChange(vfoIndex, e.target.checked)}
                                    />
                                }
                                label={t('vfo.active')}
                                sx={{mt: 0, ml: 0}}
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={selectedVFO === vfoIndex}
                                        onChange={(e) => onVFOListenChange(vfoIndex, e.target.checked)}
                                        disabled={!vfoActive[vfoIndex]}
                                    />
                                }
                                label={t('vfo.listen')}
                                sx={{mt: 0, ml: 0}}
                            />
                        </Box>

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

                        <Stack
                            spacing={2}
                            direction="row"
                            alignItems="center"
                            sx={{mt: 2}}
                            data-slider="squelch"
                            data-vfo-index={vfoIndex}
                        >
                            <Box sx={{textAlign: 'left'}}><SquelchIcon size={24}/></Box>
                            <Slider
                                value={vfoMarkers[vfoIndex]?.squelch || -150}
                                min={-150}
                                max={0}
                                onChange={(e, val) => onVFOPropertyChange(vfoIndex, {squelch: val})}
                                disabled={!vfoActive[vfoIndex]}
                            />
                            <Box sx={{minWidth: 60}}>{vfoMarkers[vfoIndex]?.squelch || -150} dB</Box>
                        </Stack>

                        <Stack
                            spacing={2}
                            direction="row"
                            alignItems="center"
                            sx={{mt: 2}}
                            data-slider="volume"
                            data-vfo-index={vfoIndex}
                        >
                            <Box sx={{textAlign: 'left'}}><VolumeDown/></Box>
                            <Slider
                                value={vfoMarkers[vfoIndex]?.volume || 50}
                                onChange={(e, val) => onVFOPropertyChange(vfoIndex, {volume: val})}
                                disabled={!vfoActive[vfoIndex]}
                            />
                            <Box sx={{minWidth: 60}}>{vfoMarkers[vfoIndex]?.volume || 50}%</Box>
                        </Stack>
                        <RotaryEncoder vfoNumber={vfoIndex} />

                        <Box sx={{ mt: 1 }}>
                            <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                                {t('vfo.step_size')}
                            </Typography>
                            <ToggleButtonGroup
                                value={vfoMarkers[vfoIndex]?.stepSize || 1000}
                                exclusive
                                disabled={!vfoActive[vfoIndex]}
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
                                        border: '1px solid',
                                        borderColor: 'overlay.light',
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
                                            backgroundColor: 'overlay.light',
                                        }
                                    }
                                }}
                            >
                                <ToggleButton value={50}>50 Hz</ToggleButton>
                                <ToggleButton value={100}>100 Hz</ToggleButton>
                                <ToggleButton value={250}>250 Hz</ToggleButton>
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
                                {t('vfo.modulation')}
                            </Typography>
                            <ToggleButtonGroup
                                value={vfoMarkers[vfoIndex]?.mode || 'none'}
                                exclusive
                                disabled={!vfoActive[vfoIndex]}
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
                                        border: '1px solid',
                                        borderColor: 'overlay.light',
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
                                            backgroundColor: 'overlay.light',
                                        }
                                    }
                                }}
                            >
                                <ToggleButton value="none">{t('vfo.modes.none')}</ToggleButton>
                                <ToggleButton value="am">{t('vfo.modes.am')}</ToggleButton>
                                <ToggleButton value="fm">{t('vfo.modes.fm')}</ToggleButton>
                                <ToggleButton value="lsb">{t('vfo.modes.lsb')}</ToggleButton>
                                <ToggleButton value="usb">{t('vfo.modes.usb')}</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>

                        <Box sx={{ mt: 2 }}>
                            <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                                {t('vfo.bandwidth')}
                            </Typography>
                            <ToggleButtonGroup
                                value={BANDWIDTHS.hasOwnProperty(vfoMarkers[vfoIndex]?.bandwidth) ? vfoMarkers[vfoIndex]?.bandwidth.toString() : 'custom'}
                                exclusive
                                disabled={!vfoActive[vfoIndex]}
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
                                        border: '1px solid',
                                        borderColor: 'overlay.light',
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
                                            backgroundColor: 'overlay.light',
                                        }
                                    }
                                }}
                            >
                                <ToggleButton value="custom">{t('vfo.custom')}</ToggleButton>
                                {Object.entries(BANDWIDTHS).map(([value, label]) => (
                                    <ToggleButton key={value} value={value}>
                                        {label}
                                    </ToggleButton>
                                ))}
                            </ToggleButtonGroup>
                        </Box>


                    </Box>
                ))}
            </AccordionDetails>
        </Accordion>
    );
};

export default VfoAccordion;