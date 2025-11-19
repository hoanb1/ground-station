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
    Alert,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    Link,
} from "@mui/material";
import VolumeDown from '@mui/icons-material/VolumeDown';
import VolumeUp from '@mui/icons-material/VolumeUp';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import CloseIcon from '@mui/icons-material/Close';
// import TranscribeIcon from '@mui/icons-material/Transcribe';
import LCDFrequencyDisplay from "../common/lcd-frequency-display.jsx";
import RotaryEncoder from "./rotator-encoder.jsx";
import {SquelchIcon} from "../common/dataurl-icons.jsx";
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import TransmittersTable from '../satellites/transmitters-table.jsx';
import { isLockedBandwidth, getEffectiveMode, getDecoderConfig } from './vfo-config.js';

const BANDWIDTHS = {
    "500": "500 Hz",
    "1000": "1 kHz",
    "2100": "2.1 kHz",
    "2400": "2.4 kHz",
    "2500": "2.5 kHz",
    "2700": "2.7 kHz",
    "3000": "3 kHz",
    "3300": "3.3 kHz",
    "5000": "5 kHz",
    "6000": "6 kHz",
    "8000": "8 kHz",
    "10000": "10 kHz",
    "12500": "12.5 kHz",
    "15000": "15 kHz",
    "20000": "20 kHz",
    "25000": "25 kHz",
    "30000": "30 kHz",
    "50000": "50 kHz",
    "100000": "100 kHz",
    "150000": "150 kHz",
    "200000": "200 kHz",
    "250000": "250 kHz",
    "500000": "500 kHz"
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
                          // onTranscriptionToggle,
                          // debabelConfigured,
                      }) => {
    const { t } = useTranslation('waterfall');
    const squelchSliderRef = React.useRef(null);
    const volumeSliderRef = React.useRef(null);
    const [transmittersDialogOpen, setTransmittersDialogOpen] = React.useState(false);

    // Get doppler-corrected transmitters from Redux state (includes alive field)
    const transmitters = useSelector(state => state.targetSatTrack.rigData.transmitters || []);

    // Get target satellite data
    const satelliteDetails = useSelector(state => state.targetSatTrack.satelliteData?.details || null);
    const satelliteTransmitters = useSelector(state => state.targetSatTrack.satelliteData?.transmitters || []);
    const targetSatelliteName = satelliteDetails?.name || '';

    // Combine details and transmitters for the TransmittersTable component
    const targetSatelliteData = satelliteDetails ? {
        ...satelliteDetails,
        transmitters: satelliteTransmitters
    } : null;

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
                        <Tab
                            key={index}
                            label={
                                <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
                                    {t('vfo.vfo_number', { number: index + 1 })}
                                    {vfoMarkers[index + 1]?.lockedTransmitterId && (
                                        <LockIcon
                                            sx={{
                                                position: 'absolute',
                                                top: -4,
                                                right: -8,
                                                fontSize: '0.75rem',
                                                pointerEvents: 'none',
                                            }}
                                        />
                                    )}
                                </Box>
                            }
                            sx={{
                                minWidth: '25%',
                                backgroundColor: `${vfoColors[index]}40`, // 40 = ~25% opacity in hex
                                '&.Mui-selected': {
                                    fontWeight: 'bold',
                                    borderBottom: 'none',
                                    color: 'text.primary',
                                },
                            }}
                        />
                    ))}

                </Tabs>
                {[1, 2, 3, 4].map((vfoIndex) => (
                    <Box key={vfoIndex} hidden={(selectedVFOTab + 1) !== vfoIndex}>
                        <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
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
                            {/* Frequency Display */}
                            <Box sx={{
                                mt: 2,
                                mb: 0,
                                width: '100%',
                                typography: 'body1',
                                fontWeight: 'medium',
                                alignItems: 'center'
                            }}>
                                <Box
                                    sx={{
                                        width: '100%',
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
                            {/* Lock to Transmitter Dropdown */}
                            <Box sx={{ mt: 2 }}>
                                <FormControl fullWidth size="small" disabled={!vfoActive[vfoIndex]}
                                             variant="filled">
                                    <InputLabel id={`vfo-${vfoIndex}-lock-transmitter-label`}>
                                        {vfoMarkers[vfoIndex]?.lockedTransmitterId ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <LockIcon fontSize="small" />
                                                {t('vfo.lock_to_transmitter', 'Lock to Transmitter')}
                                            </Box>
                                        ) : (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <LockOpenIcon fontSize="small" />
                                                {t('vfo.lock_to_transmitter', 'Lock to Transmitter')}
                                            </Box>
                                        )}
                                    </InputLabel>
                                    <Select
                                        variant={'filled'}
                                        labelId={`vfo-${vfoIndex}-lock-transmitter-label`}
                                        value={vfoMarkers[vfoIndex]?.lockedTransmitterId || 'none'}
                                        label={t('vfo.lock_to_transmitter', 'Lock to Transmitter')}
                                        onChange={(e) => {
                                            const transmitterId = e.target.value === 'none' ? null : e.target.value;
                                            onVFOPropertyChange(vfoIndex, { lockedTransmitterId: transmitterId });
                                        }}
                                        sx={{ fontSize: '0.875rem' }}
                                    >
                                        <MenuItem value="none" sx={{ fontSize: '0.875rem' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <LockOpenIcon fontSize="small" />
                                                {t('vfo.none', 'None')}
                                            </Box>
                                        </MenuItem>
                                        {transmitters.map((tx) => (
                                            <MenuItem key={tx.id} value={tx.id} sx={{ fontSize: '0.875rem' }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                                    <Box
                                                        sx={{
                                                            width: 8,
                                                            height: 8,
                                                            borderRadius: '50%',
                                                            backgroundColor: tx.alive ? 'success.main' : 'error.main',
                                                            boxShadow: (theme) => tx.alive
                                                                ? `0 0 6px ${theme.palette.success.main}99`
                                                                : `0 0 6px ${theme.palette.error.main}99`,
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                    <Box sx={{ flex: 1 }}>
                                                        <Box sx={{ fontWeight: 600 }}>{tx.description}</Box>
                                                        <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                                                            {(tx.downlink_observed_freq / 1e6).toFixed(6)} MHz ({tx.mode})
                                                        </Box>
                                                    </Box>
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>

                            {/* Discreet link to edit transmitters */}
                            {targetSatelliteData && (
                                <Box sx={{ mt: 0.5, textAlign: 'center' }}>
                                    <Link
                                        component="button"
                                        variant="caption"
                                        onClick={() => setTransmittersDialogOpen(true)}
                                        sx={{
                                            fontSize: '0.7rem',
                                            color: 'text.disabled',
                                            textDecoration: 'none',
                                            '&:hover': {
                                                color: 'text.secondary',
                                                textDecoration: 'underline',
                                            },
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Edit {targetSatelliteName} transmitters here
                                    </Link>
                                </Box>
                            )}

                            {/* Transcription Section - Commented Out */}
                            {/*
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={vfoMarkers[vfoIndex]?.transcriptionEnabled || false}
                                            onChange={(e) => onTranscriptionToggle && onTranscriptionToggle(vfoIndex, e.target.checked)}
                                            disabled={!vfoActive[vfoIndex] || !debabelConfigured}
                                        />
                                    }
                                    label={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <TranscribeIcon fontSize="small" />
                                            {t('vfo.transcribe', 'Transcribe')}
                                        </Box>
                                    }
                                    sx={{mt: 0, ml: 0}}
                                />
                                {!debabelConfigured && (
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                        {t('vfo.configure_debabel', '(Configure DeBabel in Settings)')}
                                    </Typography>
                                )}
                            </Box>
                            */}

                            {/* Transcription Settings - show when transcription is enabled */}
                            {/*
                            {vfoMarkers[vfoIndex]?.transcriptionEnabled && debabelConfigured && (
                                <Box sx={{
                                    mt: 1.5,
                                    p: 1.5,
                                    backgroundColor: 'rgba(33, 150, 243, 0.05)',
                                    borderRadius: 1,
                                    border: '1px solid rgba(33, 150, 243, 0.2)'
                                }}>
                                    <Typography variant="caption" sx={{ display: 'block', mb: 1, fontWeight: 600, color: 'text.secondary' }}>
                                        {t('vfo.transcription_settings', 'Transcription Settings')}
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                                        <FormControl size="small" sx={{ minWidth: 120, flex: 1 }}>
                                            <InputLabel sx={{ fontSize: '0.8rem' }}>{t('vfo.whisper_model', 'Model')}</InputLabel>
                                            <Select
                                                variant={'outlined'}
                                                value={vfoMarkers[vfoIndex]?.transcriptionModel || 'small'}
                                                label={t('vfo.whisper_model', 'Model')}
                                                onChange={(e) => onVFOPropertyChange(vfoIndex, { transcriptionModel: e.target.value })}
                                                sx={{ fontSize: '0.8rem' }}
                                            >
                                                <MenuItem value="tiny" sx={{ fontSize: '0.8rem' }}>Tiny (Multilingual)</MenuItem>
                                                <MenuItem value="tiny.en" sx={{ fontSize: '0.8rem' }}>Tiny (English only)</MenuItem>
                                                <MenuItem value="base" sx={{ fontSize: '0.8rem' }}>Base (Multilingual)</MenuItem>
                                                <MenuItem value="base.en" sx={{ fontSize: '0.8rem' }}>Base (English only)</MenuItem>
                                                <MenuItem value="small" sx={{ fontSize: '0.8rem' }}>Small (Multilingual) ⭐</MenuItem>
                                                <MenuItem value="small.en" sx={{ fontSize: '0.8rem' }}>Small (English only)</MenuItem>
                                                <MenuItem value="medium" sx={{ fontSize: '0.8rem' }}>Medium (Multilingual)</MenuItem>
                                                <MenuItem value="medium.en" sx={{ fontSize: '0.8rem' }}>Medium (English only)</MenuItem>
                                                <MenuItem value="large" sx={{ fontSize: '0.8rem' }}>Large (Multilingual)</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <FormControl size="small" sx={{ minWidth: 100, flex: 1 }}>
                                            <InputLabel sx={{ fontSize: '0.8rem' }}>{t('vfo.language', 'Language')}</InputLabel>
                                            <Select
                                                variant={'outlined'}
                                                value={vfoMarkers[vfoIndex]?.transcriptionLanguage || 'en'}
                                                label={t('vfo.language', 'Language')}
                                                onChange={(e) => onVFOPropertyChange(vfoIndex, { transcriptionLanguage: e.target.value })}
                                                sx={{ fontSize: '0.8rem' }}
                                            >
                                                <MenuItem value="auto" sx={{ fontSize: '0.8rem' }}>Auto-detect</MenuItem>
                                                <MenuItem value="en" sx={{ fontSize: '0.8rem' }}>English</MenuItem>
                                                <MenuItem value="el" sx={{ fontSize: '0.8rem' }}>Ελληνικά</MenuItem>
                                                <MenuItem value="es" sx={{ fontSize: '0.8rem' }}>Español</MenuItem>
                                                <MenuItem value="fr" sx={{ fontSize: '0.8rem' }}>Français</MenuItem>
                                                <MenuItem value="de" sx={{ fontSize: '0.8rem' }}>Deutsch</MenuItem>
                                                <MenuItem value="it" sx={{ fontSize: '0.8rem' }}>Italiano</MenuItem>
                                                <MenuItem value="pt" sx={{ fontSize: '0.8rem' }}>Português</MenuItem>
                                                <MenuItem value="ru" sx={{ fontSize: '0.8rem' }}>Русский</MenuItem>
                                                <MenuItem value="ja" sx={{ fontSize: '0.8rem' }}>日本語</MenuItem>
                                                <MenuItem value="zh" sx={{ fontSize: '0.8rem' }}>中文</MenuItem>
                                                <MenuItem value="ar" sx={{ fontSize: '0.8rem' }}>العربية</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Box>
                                </Box>
                            )}
                            */}
                        </Box>

                        {vfoMarkers[vfoIndex]?.lockedTransmitterId && (
                            <Alert
                                severity="info"
                                icon={<LockIcon fontSize="small" />}
                                sx={{
                                    mt: 1,
                                    mb: 1,
                                    py: 0.5,
                                    fontSize: '0.875rem',
                                    '& .MuiAlert-icon': {
                                        fontSize: '1rem'
                                    }
                                }}
                            >
                                {t('vfo.locked_to_transmitter_info', 'Tracking doppler-corrected frequency')}
                            </Alert>
                        )}

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
                                        borderColor: 'rgba(255, 255, 255, 0.23)',
                                        borderRadius: '4px',
                                        color: 'text.secondary',
                                        textAlign: 'center',
                                        textTransform: 'none',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        transition: 'all 0.2s ease-in-out',
                                        '&.Mui-selected': {
                                            backgroundColor: 'primary.main',
                                            color: 'primary.contrastText',
                                            borderColor: 'primary.main',
                                            fontWeight: 600,
                                            boxShadow: '0 0 8px rgba(33, 150, 243, 0.4)',
                                            '&:hover': {
                                                backgroundColor: 'primary.dark',
                                                boxShadow: '0 0 12px rgba(33, 150, 243, 0.6)',
                                            }
                                        },
                                        '&:hover': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                            borderColor: 'rgba(255, 255, 255, 0.4)',
                                        },
                                        '&.Mui-disabled': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                            borderColor: 'rgba(255, 255, 255, 0.08)',
                                            color: 'rgba(255, 255, 255, 0.3)',
                                            opacity: 0.5,
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
                            <Typography variant="body2" sx={{ mb: 0.5, color: 'text.secondary', fontWeight: 600 }}>
                                {t('vfo.audio_demodulation', 'Audio Demodulation')}
                            </Typography>
                            <Typography variant="caption" sx={{ mb: 1, display: 'block', color: 'text.disabled', fontSize: '0.7rem' }}>
                                {t('vfo.audio_demodulation_help', 'How to extract audio from the RF signal')}
                            </Typography>
                            <ToggleButtonGroup
                                value={vfoMarkers[vfoIndex]?.mode || 'none'}
                                exclusive
                                disabled={!vfoActive[vfoIndex] || ['gmsk', 'gfsk', 'lora', 'bpsk'].includes(vfoMarkers[vfoIndex]?.decoder)}
                                onChange={(event, newValue) => {
                                    if (newValue !== null) {
                                        // When selecting an audio demod mode (not NONE), clear decoder
                                        if (newValue !== 'NONE') {
                                            onVFOPropertyChange(vfoIndex, { mode: newValue, decoder: 'none' });
                                        } else {
                                            onVFOPropertyChange(vfoIndex, { mode: newValue });
                                        }
                                    }
                                }}
                                sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 0.5,
                                    '& .MuiToggleButton-root': {
                                        height: '28px',
                                        minWidth: '50px',
                                        padding: '4px 8px',
                                        fontSize: '0.75rem',
                                        border: '1px solid',
                                        borderColor: 'rgba(255, 255, 255, 0.23)',
                                        borderRadius: '4px',
                                        color: 'text.secondary',
                                        textAlign: 'center',
                                        textTransform: 'none',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        transition: 'all 0.2s ease-in-out',
                                        '&.Mui-selected': {
                                            backgroundColor: 'primary.main',
                                            color: 'primary.contrastText',
                                            borderColor: 'primary.main',
                                            fontWeight: 600,
                                            boxShadow: '0 0 8px rgba(33, 150, 243, 0.4)',
                                            '&:hover': {
                                                backgroundColor: 'primary.dark',
                                                boxShadow: '0 0 12px rgba(33, 150, 243, 0.6)',
                                            }
                                        },
                                        '&:hover': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                            borderColor: 'rgba(255, 255, 255, 0.4)',
                                        },
                                        '&.Mui-disabled': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                            borderColor: 'rgba(255, 255, 255, 0.08)',
                                            color: 'rgba(255, 255, 255, 0.3)',
                                            opacity: 0.5,
                                        }
                                    }
                                }}
                            >
                                <ToggleButton value="NONE">{t('vfo.modes.none')}</ToggleButton>
                                <ToggleButton value="AM">{t('vfo.modes.am')}</ToggleButton>
                                <ToggleButton value="FM">{t('vfo.modes.fm')}</ToggleButton>
                                <ToggleButton value="FM_STEREO">{t('vfo.modes.fm_stereo', 'FM Stereo')}</ToggleButton>
                                <ToggleButton value="LSB">{t('vfo.modes.lsb')}</ToggleButton>
                                <ToggleButton value="USB">{t('vfo.modes.usb')}</ToggleButton>
                                <ToggleButton value="CW">{t('vfo.modes.cw')}</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>

                        <Box sx={{ mt: 2 }}>
                            <Typography variant="body2" sx={{ mb: 0.5, color: 'text.secondary', fontWeight: 600 }}>
                                {t('vfo.data_decoders', 'Data Decoders')}
                            </Typography>
                            <Typography variant="caption" sx={{ mb: 1, display: 'block', color: 'text.disabled', fontSize: '0.7rem' }}>
                                {t('vfo.data_decoders_help', 'An internal FM or SSB demodulator will be spun up as needed to decode some modes')}
                            </Typography>
                            <ToggleButtonGroup
                                value={vfoMarkers[vfoIndex]?.decoder || 'none'}
                                exclusive
                                disabled={!vfoActive[vfoIndex]}
                                onChange={(event, newValue) => {
                                    if (newValue !== null) {
                                        // When selecting a decoder (not none), set audio demod to NONE and appropriate bandwidth
                                        if (newValue !== 'none') {
                                            const updates = { decoder: newValue, mode: 'NONE' };

                                            // Set bandwidth based on decoder type (using vfo-config.js defaults)
                                            if (newValue === 'sstv') {
                                                updates.bandwidth = 3300; // 3.3 kHz for SSTV (audio content ~1200-2300 Hz)
                                            } else if (newValue === 'apt') {
                                                updates.bandwidth = 40000; // 40 kHz for APT (NOAA APT signal bandwidth)
                                            } else if (newValue === 'lora') {
                                                updates.bandwidth = 500000; // 500 kHz for LoRa (auto-detects 125/250/500 kHz signals)
                                            } else if (newValue === 'morse') {
                                                updates.bandwidth = 2500; // 2.5 kHz for Morse decoder (narrowband)
                                            } else if (newValue === 'gmsk' || newValue === 'gfsk' || newValue === 'bpsk') {
                                                // Get locked transmitter for GMSK/GFSK/BPSK bandwidth calculation
                                                // TODO maybe we should remove this logic and let the user adjust the
                                                // bandwidth themselves?  It's not clear that this is a good idea.
                                                const currentVFO = vfoMarkers[vfoIndex];
                                                const lockedTransmitter = currentVFO?.lockedTransmitterId
                                                    ? transmitters.find(tx => tx.id === currentVFO.lockedTransmitterId)
                                                    : null;

                                                if (lockedTransmitter && lockedTransmitter.baud) {
                                                    // Calculate bandwidth: 3x baud rate (GMSK/BPSK + Doppler margin)
                                                    updates.bandwidth = lockedTransmitter.baud * 3;
                                                    updates.transmitterBaud = lockedTransmitter.baud;
                                                } else {
                                                    // Use default from vfo-config.js
                                                    updates.bandwidth = 30000; // 30 kHz default
                                                }
                                            } else if (newValue === 'afsk' || newValue === 'rtty') {
                                                updates.bandwidth = 3300; // 3.3 kHz for AFSK/RTTY
                                            } else if (newValue === 'psk31') {
                                                updates.bandwidth = 3300; // 3.3 kHz for PSK31
                                            }

                                            onVFOPropertyChange(vfoIndex, updates);
                                        } else {
                                            onVFOPropertyChange(vfoIndex, { decoder: newValue });
                                        }
                                    }
                                }}
                                sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 0.5,
                                    '& .MuiToggleButton-root': {
                                        height: '28px',
                                        minWidth: '50px',
                                        padding: '4px 8px',
                                        fontSize: '0.75rem',
                                        border: '1px solid',
                                        borderColor: 'rgba(255, 255, 255, 0.23)',
                                        borderRadius: '4px',
                                        color: 'text.secondary',
                                        textAlign: 'center',
                                        textTransform: 'none',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        transition: 'all 0.2s ease-in-out',
                                        '&.Mui-selected': {
                                            backgroundColor: 'primary.main',
                                            color: 'primary.contrastText',
                                            borderColor: 'primary.main',
                                            fontWeight: 600,
                                            boxShadow: '0 0 8px rgba(33, 150, 243, 0.4)',
                                            '&:hover': {
                                                backgroundColor: 'primary.dark',
                                                boxShadow: '0 0 12px rgba(33, 150, 243, 0.6)',
                                            }
                                        },
                                        '&:hover': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                            borderColor: 'rgba(255, 255, 255, 0.4)',
                                        },
                                        '&.Mui-disabled': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                            borderColor: 'rgba(255, 255, 255, 0.08)',
                                            color: 'rgba(255, 255, 255, 0.3)',
                                            opacity: 0.5,
                                        }
                                    }
                                }}
                            >
                                <ToggleButton value="none">{t('vfo.decoders_modes.none', 'None')}</ToggleButton>
                                <ToggleButton value="sstv">{t('vfo.decoders_modes.sstv', 'SSTV')}</ToggleButton>
                                <ToggleButton value="morse">{t('vfo.decoders_modes.morse', 'Morse')}</ToggleButton>
                                <ToggleButton value="lora">{t('vfo.decoders_modes.lora', 'LoRa')}</ToggleButton>
                                <ToggleButton value="gmsk">{t('vfo.decoders_modes.gmsk', 'GMSK')}</ToggleButton>
                                <ToggleButton value="gfsk">{t('vfo.decoders_modes.gfsk', 'GFSK')}</ToggleButton>
                                <ToggleButton value="bpsk">{t('vfo.decoders_modes.bpsk', 'BPSK')}</ToggleButton>
                                <ToggleButton value="afsk">{t('vfo.decoders_modes.afsk', 'AFSK')}</ToggleButton>
                                <ToggleButton value="rtty">{t('vfo.decoders_modes.rtty', 'RTTY')}</ToggleButton>
                                <ToggleButton value="psk31">{t('vfo.decoders_modes.psk31', 'PSK31')}</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>

                        <Box sx={{ mt: 2 }}>
                            <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                                {t('vfo.bandwidth')}
                            </Typography>
                            <ToggleButtonGroup
                                value={BANDWIDTHS.hasOwnProperty(vfoMarkers[vfoIndex]?.bandwidth) ? vfoMarkers[vfoIndex]?.bandwidth.toString() : 'custom'}
                                exclusive
                                disabled={
                                    !vfoActive[vfoIndex] ||
                                    isLockedBandwidth(
                                        getEffectiveMode(
                                            vfoMarkers[vfoIndex]?.mode,
                                            vfoMarkers[vfoIndex]?.decoder
                                        ),
                                        vfoMarkers[vfoIndex]?.decoder
                                    )
                                }
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
                                        width: '75px',
                                        height: '28px',
                                        minWidth: '75px',
                                        maxWidth: '75px',
                                        padding: '4px 6px',
                                        fontSize: '0.8rem',
                                        border: '1px solid',
                                        borderColor: 'rgba(255, 255, 255, 0.23)',
                                        borderRadius: '4px',
                                        color: 'text.secondary',
                                        textAlign: 'center',
                                        textTransform: 'none',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        transition: 'all 0.2s ease-in-out',
                                        '&.Mui-selected': {
                                            backgroundColor: 'primary.main',
                                            color: 'primary.contrastText',
                                            borderColor: 'primary.main',
                                            fontWeight: 600,
                                            boxShadow: '0 0 8px rgba(33, 150, 243, 0.4)',
                                            '&:hover': {
                                                backgroundColor: 'primary.dark',
                                                boxShadow: '0 0 12px rgba(33, 150, 243, 0.6)',
                                            }
                                        },
                                        '&:hover': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                            borderColor: 'rgba(255, 255, 255, 0.4)',
                                        },
                                        '&.Mui-disabled': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                            borderColor: 'rgba(255, 255, 255, 0.08)',
                                            color: 'rgba(255, 255, 255, 0.3)',
                                            opacity: 0.5,
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

            {/* Transmitters Dialog */}
            <Dialog
                open={transmittersDialogOpen}
                onClose={() => setTransmittersDialogOpen(false)}
                maxWidth="xl"
                fullWidth
                PaperProps={{
                    sx: {
                        backgroundColor: 'background.elevated',
                    }
                }}
            >
                <DialogTitle sx={{ backgroundColor: 'background.elevated', color: 'text.primary' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">
                            {targetSatelliteName} - Transmitters
                        </Typography>
                        <IconButton onClick={() => setTransmittersDialogOpen(false)} size="small">
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 3, backgroundColor: 'background.elevated' }}>
                    {targetSatelliteData && (
                        <TransmittersTable satelliteData={targetSatelliteData} inDialog={true} />
                    )}
                </DialogContent>
            </Dialog>
        </Accordion>
    );
};

export default VfoAccordion;