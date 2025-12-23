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
    Chip,
} from "@mui/material";
import VolumeDown from '@mui/icons-material/VolumeDown';
import VolumeUp from '@mui/icons-material/VolumeUp';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import CloseIcon from '@mui/icons-material/Close';
import SettingsIcon from '@mui/icons-material/Settings';
// import TranscribeIcon from '@mui/icons-material/Transcribe';
import LCDFrequencyDisplay from "../common/lcd-frequency-display.jsx";
import RotaryEncoder from "./rotator-encoder.jsx";
import {SquelchIcon} from "../common/dataurl-icons.jsx";
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import TransmittersTable from '../satellites/transmitters-table.jsx';
import { isLockedBandwidth, getDecoderConfig, getDecoderParameters, normalizeTransmitterMode } from './vfo-config.js';
import DecoderParamsDialog from './decoder-params-dialog.jsx';
import { useAudio } from '../dashboard/audio-provider.jsx';

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
                          onTranscriptionToggle,
                          geminiConfigured,
                      }) => {
    const { t } = useTranslation('waterfall');
    const squelchSliderRef = React.useRef(null);
    const volumeSliderRef = React.useRef(null);
    const [transmittersDialogOpen, setTransmittersDialogOpen] = React.useState(false);
    const [decoderParamsDialogOpen, setDecoderParamsDialogOpen] = React.useState(false);
    const [decoderParamsVfoIndex, setDecoderParamsVfoIndex] = React.useState(null);

    // Get audio controls for VFO muting, buffer monitoring, and audio level
    const { setVfoMute, getAudioBufferLength, getVfoAudioLevel } = useAudio();

    // Track mute state for each VFO (0-3, but UI uses 1-4)
    const [vfoMuted, setVfoMuted] = React.useState({
        1: false,
        2: false,
        3: false,
        4: false
    });

    // Track audio buffer length per VFO
    const [vfoBufferLengths, setVfoBufferLengths] = React.useState({
        1: 0,
        2: 0,
        3: 0,
        4: 0
    });

    // Track audio levels per VFO
    const [vfoAudioLevels, setVfoAudioLevels] = React.useState({
        1: 0,
        2: 0,
        3: 0,
        4: 0
    });

    // Update buffer lengths and audio levels every 500ms
    React.useEffect(() => {
        const interval = setInterval(() => {
            const newBufferLengths = {};
            const newAudioLevels = {};
            for (let i = 1; i <= 4; i++) {
                newBufferLengths[i] = getAudioBufferLength(i);
                newAudioLevels[i] = getVfoAudioLevel(i);
            }
            setVfoBufferLengths(newBufferLengths);
            setVfoAudioLevels(newAudioLevels);
        }, 500);
        return () => clearInterval(interval);
    }, [getAudioBufferLength, getVfoAudioLevel]);

    // Handle VFO mute toggle
    const handleVfoMuteToggle = (vfoIndex) => {
        console.log('Mute button clicked for VFO', vfoIndex, 'Current state:', vfoMuted[vfoIndex]);
        const newMutedState = !vfoMuted[vfoIndex];
        console.log('Setting VFO', vfoIndex, 'to muted:', newMutedState);
        setVfoMuted(prev => ({
            ...prev,
            [vfoIndex]: newMutedState
        }));
        // Call audio provider to mute/unmute
        // Backend sends vfo_number as 1-4, which matches our vfoIndex
        console.log('Calling setVfoMute with VFO number:', vfoIndex, 'muted:', newMutedState);
        if (setVfoMute) {
            setVfoMute(vfoIndex, newMutedState);
        } else {
            console.error('setVfoMute is not available from audio context');
        }
    };

    // Get doppler-corrected transmitters from Redux state (includes alive field)
    const transmitters = useSelector(state => state.targetSatTrack.rigData.transmitters || []);

    // Get target satellite data
    const satelliteDetails = useSelector(state => state.targetSatTrack.satelliteData?.details || null);
    const satelliteTransmitters = useSelector(state => state.targetSatTrack.satelliteData?.transmitters || []);
    const targetSatelliteName = satelliteDetails?.name || '';

    // Get streaming VFOs from Redux state (array of currently streaming VFO numbers)
    const streamingVFOs = useSelector(state => state.vfo.streamingVFOs);

    // Get muted VFOs from Redux state
    const vfoMutedRedux = useSelector(state => state.vfo.vfoMuted || {});

    // Get active decoders from Redux state
    const activeDecoders = useSelector(state => state.decoders.active || {});
    const currentSessionId = useSelector(state => state.decoders.currentSessionId);

    // Get decoder info for a specific VFO (works for both data decoders and transcription)
    const getVFODecoderInfo = (vfoIndex) => {
        if (!currentSessionId || !vfoIndex) return null;
        const decoderKey = `${currentSessionId}_vfo${vfoIndex}`;
        return activeDecoders[decoderKey] || null;
    };

    // Format decoder parameters into short notation
    const formatDecoderParamsSummary = (vfoIndex) => {
        const vfo = vfoMarkers[vfoIndex];
        if (!vfo || !vfo.decoder || vfo.decoder === 'none') return '';

        const decoder = vfo.decoder;
        const params = vfo.parameters || {};

        // Helper to get framing shorthand
        const getFramingShort = (framing) => {
            const framingMap = {
                'ax25': 'AX25',
                'raw': 'RAW',
                'ccsds': 'CCSDS',
                'custom': 'CUST',
            };
            return framingMap[framing] || framing.toUpperCase();
        };

        if (decoder === 'lora') {
            const sf = params.lora_sf ?? 7;
            const bw = params.lora_bw ?? 125000;
            const cr = params.lora_cr ?? 1;
            const bwKhz = bw / 1000;
            return `SF${sf} BW${bwKhz}kHz CR4/${cr + 4}`;
        }

        // Helper to format baudrate compactly (e.g., 1k2bd, 9k6bd)
        const formatBaudrate = (baudrate) => {
            if (baudrate >= 1000) {
                const k = Math.floor(baudrate / 1000);
                const remainder = (baudrate % 1000) / 100;
                if (remainder === 0) {
                    return `${k}kbd`;
                }
                return `${k}k${remainder}bd`;
            }
            return `${baudrate}bd`;
        };

        if (decoder === 'fsk') {
            const baudrate = params.fsk_baudrate ?? 9600;
            const deviation = params.fsk_deviation ?? 5000;
            const framing = params.fsk_framing ?? 'ax25';
            const devKhz = deviation >= 1000 ? `${(deviation / 1000).toFixed(1)}k` : `${deviation}`;
            return `${formatBaudrate(baudrate)} ±${devKhz} ${getFramingShort(framing)}`;
        }

        if (decoder === 'gmsk') {
            const baudrate = params.gmsk_baudrate ?? 9600;
            const deviation = params.gmsk_deviation ?? 5000;
            const framing = params.gmsk_framing ?? 'ax25';
            const devKhz = deviation >= 1000 ? `${(deviation / 1000).toFixed(1)}k` : `${deviation}`;
            return `${formatBaudrate(baudrate)} ±${devKhz} ${getFramingShort(framing)}`;
        }

        if (decoder === 'gfsk') {
            const baudrate = params.gfsk_baudrate ?? 9600;
            const deviation = params.gfsk_deviation ?? 5000;
            const framing = params.gfsk_framing ?? 'ax25';
            const devKhz = deviation >= 1000 ? `${(deviation / 1000).toFixed(1)}k` : `${deviation}`;
            return `${formatBaudrate(baudrate)} ±${devKhz} ${getFramingShort(framing)}`;
        }

        if (decoder === 'bpsk') {
            const baudrate = params.bpsk_baudrate ?? 9600;
            const framing = params.bpsk_framing ?? 'ax25';
            const differential = params.bpsk_differential ?? false;
            return `${formatBaudrate(baudrate)} ${getFramingShort(framing)}${differential ? ' DIFF' : ''}`;
        }

        if (decoder === 'afsk') {
            const baudrate = params.afsk_baudrate ?? 1200;
            const af_carrier = params.afsk_af_carrier ?? 1700;
            const deviation = params.afsk_deviation ?? 500;
            const framing = params.afsk_framing ?? 'ax25';
            const carrierKhz = af_carrier >= 1000 ? `${(af_carrier / 1000).toFixed(1)}k` : `${af_carrier}`;
            return `${formatBaudrate(baudrate)} ${carrierKhz}Hz ±${deviation} ${getFramingShort(framing)}`;
        }

        // Default for decoders without parameters
        return 'Configure...';
    };

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
                                    {index + 1}
                                    {vfoMarkers[index + 1]?.lockedTransmitterId && vfoMarkers[index + 1]?.lockedTransmitterId !== 'none' && (
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
                                    {streamingVFOs.includes(index + 1) && !vfoMutedRedux[index + 1] && (
                                        <VolumeUpIcon
                                            sx={{
                                                position: 'absolute',
                                                bottom: -2,
                                                right: -6,
                                                fontSize: '0.75rem',
                                                pointerEvents: 'none',
                                                color: '#00ff00', // Green for playing
                                            }}
                                        />
                                    )}
                                    {streamingVFOs.includes(index + 1) && vfoMutedRedux[index + 1] && (
                                        <VolumeOffIcon
                                            sx={{
                                                position: 'absolute',
                                                bottom: -2,
                                                right: -6,
                                                fontSize: '0.75rem',
                                                pointerEvents: 'none',
                                                color: '#ffa500', // Orange for muted but streaming
                                            }}
                                        />
                                    )}
                                    {!streamingVFOs.includes(index + 1) && (
                                        <VolumeOffIcon
                                            sx={{
                                                position: 'absolute',
                                                bottom: -2,
                                                right: -6,
                                                fontSize: '0.75rem',
                                                pointerEvents: 'none',
                                                color: '#888888', // Gray for no audio
                                            }}
                                        />
                                    )}
                                    {/* Active VFO indicator (small status dot) */}
                                    {vfoActive[index + 1] && (
                                        <Box
                                            aria-label={`VFO ${index + 1} active`}
                                            sx={{
                                                position: 'absolute',
                                                top: -4,
                                                left: -8,
                                                width: 8,
                                                height: 8,
                                                borderRadius: '50%',
                                                bgcolor: 'success.main',
                                                boxShadow: 1,
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
                                            checked={!vfoMuted[vfoIndex]}
                                            onChange={(e) => handleVfoMuteToggle(vfoIndex)}
                                            disabled={!vfoActive[vfoIndex]}
                                        />
                                    }
                                    label={t('vfo.listen')}
                                    sx={{mt: 0, ml: 0}}
                                />
                            </Box>

                            {/* VU Meter Display */}
                            <Box sx={{ mt: 1, mb: 1, opacity: vfoActive[vfoIndex] ? 1 : 0.4 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        Audio Level
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        fontFamily: 'monospace',
                                        color: vfoActive[vfoIndex] ? (() => {
                                            const levelDb = 20 * Math.log10(vfoAudioLevels[vfoIndex] + 0.00001);
                                            if (levelDb > -6) return '#f44336'; // Red (too loud)
                                            if (levelDb > -20) return '#4caf50'; // Green (good)
                                            return '#ff9800'; // Orange (low)
                                        })() : 'text.disabled'
                                    }}>
                                        {vfoActive[vfoIndex] ? (20 * Math.log10(vfoAudioLevels[vfoIndex] + 0.00001)).toFixed(1) : '—'} dB
                                    </Typography>
                                </Box>
                                <Box sx={{ position: 'relative', height: 8 }}>
                                    {/* Background track */}
                                    <Box sx={{
                                        position: 'absolute',
                                        width: '100%',
                                        height: '100%',
                                        backgroundColor: 'rgba(128, 128, 128, 0.2)',
                                        borderRadius: 1,
                                    }} />
                                    {/* Green zone (-60dB to -20dB) */}
                                    {vfoActive[vfoIndex] && (
                                        <Box sx={{
                                            position: 'absolute',
                                            left: `${((60 - 60) / 60) * 100}%`,
                                            width: `${((60 - 20) / 60) * 100}%`,
                                            height: '100%',
                                            backgroundColor: 'rgba(76, 175, 80, 0.3)',
                                            borderRadius: 1,
                                        }} />
                                    )}
                                    {/* Orange zone (-20dB to -6dB) */}
                                    {vfoActive[vfoIndex] && (
                                        <Box sx={{
                                            position: 'absolute',
                                            left: `${((60 - 20) / 60) * 100}%`,
                                            width: `${((20 - 6) / 60) * 100}%`,
                                            height: '100%',
                                            backgroundColor: 'rgba(255, 152, 0, 0.3)',
                                            borderRadius: 1,
                                        }} />
                                    )}
                                    {/* Level bar (filled portion) */}
                                    {vfoActive[vfoIndex] && (
                                        <Box sx={{
                                            position: 'absolute',
                                            left: 0,
                                            width: `${Math.min(100, Math.max(0, ((60 + (20 * Math.log10(vfoAudioLevels[vfoIndex] + 0.00001))) / 60) * 100))}%`,
                                            height: '100%',
                                            background: (() => {
                                                const levelDb = 20 * Math.log10(vfoAudioLevels[vfoIndex] + 0.00001);
                                                if (levelDb > -6) return 'linear-gradient(to right, #4caf50, #ff9800, #f44336)';
                                                if (levelDb > -20) return 'linear-gradient(to right, #4caf50 80%, #ff9800)';
                                                return '#4caf50';
                                            })(),
                                            borderRadius: 1,
                                            transition: 'width 0.1s ease-out',
                                        }} />
                                    )}
                                </Box>
                            </Box>

                            {/* Audio Buffer Display */}
                            <Box sx={{ mt: 1, mb: 1, opacity: vfoActive[vfoIndex] ? 1 : 0.4 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        Audio Buffer
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        fontFamily: 'monospace',
                                        color: vfoActive[vfoIndex] ? (() => {
                                            const bufferMs = vfoBufferLengths[vfoIndex] * 1000;
                                            if (bufferMs >= 100 && bufferMs <= 1000) return '#4caf50'; // Green
                                            if (bufferMs < 100 || bufferMs > 1000) return '#ff9800'; // Orange
                                            return '#f44336'; // Red
                                        })() : 'text.disabled'
                                    }}>
                                        {vfoActive[vfoIndex] ? (vfoBufferLengths[vfoIndex] * 1000).toFixed(0) : '—'} ms
                                    </Typography>
                                </Box>
                                <Box sx={{ position: 'relative', height: 6 }}>
                                    {/* Background track */}
                                    <Box sx={{
                                        position: 'absolute',
                                        width: '100%',
                                        height: '100%',
                                        backgroundColor: 'rgba(128, 128, 128, 0.2)',
                                        borderRadius: 1,
                                    }} />
                                    {/* Green zone (100-1000ms) */}
                                    {vfoActive[vfoIndex] && (
                                        <Box sx={{
                                            position: 'absolute',
                                            left: `${(100 / 1500) * 100}%`,
                                            width: `${((1000 - 100) / 1500) * 100}%`,
                                            height: '100%',
                                            backgroundColor: 'rgba(76, 175, 80, 0.3)',
                                            borderRadius: 1,
                                        }} />
                                    )}
                                    {/* Indicator dot */}
                                    {vfoActive[vfoIndex] && (
                                        <Box sx={{
                                            position: 'absolute',
                                            left: `${Math.min((vfoBufferLengths[vfoIndex] * 1000 / 1500) * 100, 100)}%`,
                                            top: '50%',
                                            width: 8,
                                            height: 8,
                                            backgroundColor: (() => {
                                                const bufferMs = vfoBufferLengths[vfoIndex] * 1000;
                                                if (bufferMs >= 100 && bufferMs <= 1000) return '#4caf50';
                                                if (bufferMs < 100 || bufferMs > 1000) return '#ff9800';
                                                return '#f44336';
                                            })(),
                                            borderRadius: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            border: '1px solid',
                                            borderColor: 'background.paper',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                                        }} />
                                    )}
                                </Box>
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

                            {/* Decoder Status Display - Two lines */}
                            {(() => {
                                const decoderInfo = getVFODecoderInfo(vfoIndex);
                                const vfo = vfoMarkers[vfoIndex];

                                // Determine what to display
                                let line1Text = '—';
                                let line2Text = '';
                                let borderColor = 'divider';
                                let textColor = 'text.disabled';

                                if (vfo && vfo.decoder && vfo.decoder !== 'none') {
                                    if (decoderInfo) {
                                        const info = decoderInfo.info || {};
                                        const status = decoderInfo.status || 'unknown';

                                        // Line 1: STATUS, MODE, FRAMING
                                        const statusParts = [];
                                        statusParts.push(status.toUpperCase());
                                        if (info.transmitter_mode !== undefined && info.transmitter_mode !== null) {
                                            statusParts.push(info.transmitter_mode);
                                        }
                                        if (info.framing !== undefined && info.framing !== null) {
                                            statusParts.push(info.framing.toUpperCase());
                                        }
                                        line1Text = statusParts.join(' • ');

                                        // Line 2: baudrate and existing metrics (packets, signal power) or progress or morse-specific
                                        const metricParts = [];

                                        // Add baudrate at the start of line 2
                                        if (info.baudrate !== undefined && info.baudrate !== null) {
                                            metricParts.push(`${info.baudrate}bd`);
                                        }

                                        // Show progress for SSTV if available
                                        if (decoderInfo.progress !== undefined && decoderInfo.progress !== null) {
                                            metricParts.push(`Progress: ${decoderInfo.progress}%`);
                                        }

                                        // Show WPM and character count for Morse
                                        if (info.wpm !== undefined && info.wpm !== null) {
                                            metricParts.push(`${info.wpm} WPM`);
                                        }
                                        if (info.character_count !== undefined && info.character_count !== null && info.character_count > 0) {
                                            metricParts.push(`CHAR:${info.character_count}`);
                                        }

                                        if (info.packets_decoded !== undefined && info.packets_decoded !== null) {
                                            metricParts.push(`PKT:${info.packets_decoded}`);
                                        }
                                        if (info.signal_power_dbfs !== undefined && info.signal_power_dbfs !== null) {
                                            metricParts.push(`${info.signal_power_dbfs.toFixed(1)}dB`);
                                        }
                                        line2Text = metricParts.length > 0 ? metricParts.join(' • ') : '—';

                                        borderColor = (status === 'decoding' || status === 'transcribing') ? 'success.dark' : 'warning.dark';
                                        textColor = 'text.secondary';
                                    } else {
                                        // Decoder selected but not running
                                        line1Text = `${vfo.decoder.toUpperCase()} - Not Active`;
                                        line2Text = '';
                                        borderColor = 'warning.dark';
                                        textColor = 'warning.main';
                                    }
                                } else {
                                    // No decoder selected
                                    line1Text = '- no decoder -';
                                    line2Text = '';
                                    borderColor = 'divider';
                                    textColor = 'text.disabled';
                                }

                                return (
                                    <Box sx={{
                                        mt: 1,
                                        px: 1,
                                        py: 0.5,
                                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                        borderRadius: 0.5,
                                        border: '1px solid',
                                        borderColor: borderColor,
                                        minHeight: '42px', // Ensure consistent height for two lines
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                fontSize: '0.7rem',
                                                fontFamily: 'monospace',
                                                color: textColor,
                                                display: 'block',
                                                textAlign: 'center'
                                            }}
                                        >
                                            {line1Text}
                                        </Typography>
                                        {line2Text && (
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    fontSize: '0.7rem',
                                                    fontFamily: 'monospace',
                                                    color: textColor,
                                                    display: 'block',
                                                    textAlign: 'center',
                                                    minHeight: '0.7rem' // Reserve space even when empty
                                                }}
                                            >
                                                {line2Text || '\u00A0'}
                                            </Typography>
                                        )}
                                    </Box>
                                );
                            })()}

                            {/* Lock to Transmitter Dropdown */}
                            <Box sx={{ mt: 2 }}>
                                <FormControl fullWidth size="small" disabled={!vfoActive[vfoIndex]}
                                             variant="filled">
                                    <InputLabel id={`vfo-${vfoIndex}-lock-transmitter-label`}>
                                        {vfoMarkers[vfoIndex]?.lockedTransmitterId && vfoMarkers[vfoIndex]?.lockedTransmitterId !== 'none' ? (
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
                                        value={(() => {
                                            const currentValue = vfoMarkers[vfoIndex]?.lockedTransmitterId;
                                            if (!currentValue || currentValue === 'none') return 'none';
                                            // Check if the current value exists in the transmitters list
                                            const exists = transmitters.some(tx => tx.id === currentValue);
                                            return exists ? currentValue : 'none';
                                        })()}
                                        label={t('vfo.lock_to_transmitter', 'Lock to Transmitter')}
                                        onChange={(e) => {
                                            const transmitterId = e.target.value === 'none' ? 'none' : e.target.value;

                                            if (transmitterId !== 'none') {
                                                // Locking to a transmitter - set frequency and lock, but don't change mode
                                                const transmitter = transmitters.find(tx => tx.id === transmitterId);
                                                if (transmitter) {
                                                    onVFOPropertyChange(vfoIndex, {
                                                        lockedTransmitterId: transmitterId,
                                                        frequency: transmitter.downlink_observed_freq,
                                                        frequencyOffset: 0
                                                    });
                                                }
                                            } else {
                                                // Unlocking - just clear the lock and reset offset
                                                onVFOPropertyChange(vfoIndex, {
                                                    lockedTransmitterId: 'none',
                                                    frequencyOffset: 0
                                                });
                                            }
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

                            {/* Transcription Section - Always visible */}
                            <Box sx={{
                                mt: 1.5,
                                p: 1.5,
                                backgroundColor: 'rgba(33, 150, 243, 0.05)',
                                borderRadius: 1,
                                border: '1px solid rgba(33, 150, 243, 0.2)'
                            }}>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={vfoMarkers[vfoIndex]?.transcriptionEnabled || false}
                                                onChange={(e) => onTranscriptionToggle && onTranscriptionToggle(vfoIndex, e.target.checked)}
                                                disabled={!vfoActive[vfoIndex] || !geminiConfigured}
                                            />
                                        }
                                        label={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                {/* <TranscribeIcon fontSize="small" /> */}
                                                {t('vfo.transcribe', 'Transcribe')}
                                            </Box>
                                        }
                                        sx={{mt: 0, ml: 0}}
                                    />
                                    {!geminiConfigured && (
                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                            {t('vfo.configure_gemini', '(Configure Gemini API in Settings)')}
                                        </Typography>
                                    )}
                                </Box>

                                <FormControl size="small" sx={{ minWidth: 120, width: '100%' }}>
                                        <InputLabel sx={{ fontSize: '0.8rem' }}>{t('vfo.source_language', 'Source Language')}</InputLabel>
                                        <Select
                                            variant={'outlined'}
                                            value={vfoMarkers[vfoIndex]?.transcriptionLanguage || 'auto'}
                                            label={t('vfo.source_language', 'Source Language')}
                                            onChange={(e) => onVFOPropertyChange(vfoIndex, { transcriptionLanguage: e.target.value })}
                                            disabled={!vfoMarkers[vfoIndex]?.transcriptionEnabled || !geminiConfigured}
                                            sx={{ fontSize: '0.8rem' }}
                                        >
                                            <MenuItem value="auto" sx={{ fontSize: '0.8rem' }}>🌐 {t('vfo.languages.auto', 'Auto-detect')}</MenuItem>
                                            <MenuItem value="en" sx={{ fontSize: '0.8rem' }}>🇬🇧 {t('vfo.languages.en', 'English')}</MenuItem>
                                            <MenuItem value="el" sx={{ fontSize: '0.8rem' }}>🇬🇷 {t('vfo.languages.el', 'Greek')}</MenuItem>
                                            <MenuItem value="es" sx={{ fontSize: '0.8rem' }}>🇪🇸 {t('vfo.languages.es', 'Spanish')}</MenuItem>
                                            <MenuItem value="fr" sx={{ fontSize: '0.8rem' }}>🇫🇷 {t('vfo.languages.fr', 'French')}</MenuItem>
                                            <MenuItem value="de" sx={{ fontSize: '0.8rem' }}>🇩🇪 {t('vfo.languages.de', 'German')}</MenuItem>
                                            <MenuItem value="it" sx={{ fontSize: '0.8rem' }}>🇮🇹 {t('vfo.languages.it', 'Italian')}</MenuItem>
                                            <MenuItem value="pt" sx={{ fontSize: '0.8rem' }}>🇵🇹 {t('vfo.languages.pt', 'Portuguese')}</MenuItem>
                                            <MenuItem value="pt-BR" sx={{ fontSize: '0.8rem' }}>🇧🇷 {t('vfo.languages.pt-BR', 'Portuguese (Brazil)')}</MenuItem>
                                            <MenuItem value="ru" sx={{ fontSize: '0.8rem' }}>🇷🇺 {t('vfo.languages.ru', 'Russian')}</MenuItem>
                                            <MenuItem value="uk" sx={{ fontSize: '0.8rem' }}>🇺🇦 {t('vfo.languages.uk', 'Ukrainian')}</MenuItem>
                                            <MenuItem value="ja" sx={{ fontSize: '0.8rem' }}>🇯🇵 {t('vfo.languages.ja', 'Japanese')}</MenuItem>
                                            <MenuItem value="zh" sx={{ fontSize: '0.8rem' }}>🇨🇳 {t('vfo.languages.zh', 'Chinese')}</MenuItem>
                                            <MenuItem value="ar" sx={{ fontSize: '0.8rem' }}>🇸🇦 {t('vfo.languages.ar', 'Arabic')}</MenuItem>
                                            <MenuItem value="tl" sx={{ fontSize: '0.8rem' }}>🇵🇭 {t('vfo.languages.tl', 'Filipino')}</MenuItem>
                                            <MenuItem value="tr" sx={{ fontSize: '0.8rem' }}>🇹🇷 {t('vfo.languages.tr', 'Turkish')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <FormControl size="small" sx={{ minWidth: 120, width: '100%', mt: 1 }}>
                                        <InputLabel sx={{ fontSize: '0.8rem' }}>{t('vfo.translate_to', 'Translate To')}</InputLabel>
                                        <Select
                                            variant={'outlined'}
                                            value={vfoMarkers[vfoIndex]?.transcriptionTranslateTo || 'none'}
                                            label={t('vfo.translate_to', 'Translate To')}
                                            onChange={(e) => onVFOPropertyChange(vfoIndex, { transcriptionTranslateTo: e.target.value })}
                                            disabled={!vfoMarkers[vfoIndex]?.transcriptionEnabled || !geminiConfigured}
                                            sx={{ fontSize: '0.8rem' }}
                                        >
                                            <MenuItem value="none" sx={{ fontSize: '0.8rem' }}>⭕ {t('vfo.languages.none', 'No Translation')}</MenuItem>
                                            <MenuItem value="en" sx={{ fontSize: '0.8rem' }}>🇬🇧 {t('vfo.languages.en', 'English')}</MenuItem>
                                            <MenuItem value="el" sx={{ fontSize: '0.8rem' }}>🇬🇷 {t('vfo.languages.el', 'Greek')}</MenuItem>
                                            <MenuItem value="es" sx={{ fontSize: '0.8rem' }}>🇪🇸 {t('vfo.languages.es', 'Spanish')}</MenuItem>
                                            <MenuItem value="fr" sx={{ fontSize: '0.8rem' }}>🇫🇷 {t('vfo.languages.fr', 'French')}</MenuItem>
                                            <MenuItem value="de" sx={{ fontSize: '0.8rem' }}>🇩🇪 {t('vfo.languages.de', 'German')}</MenuItem>
                                            <MenuItem value="it" sx={{ fontSize: '0.8rem' }}>🇮🇹 {t('vfo.languages.it', 'Italian')}</MenuItem>
                                            <MenuItem value="pt" sx={{ fontSize: '0.8rem' }}>🇵🇹 {t('vfo.languages.pt', 'Portuguese')}</MenuItem>
                                            <MenuItem value="pt-BR" sx={{ fontSize: '0.8rem' }}>🇧🇷 {t('vfo.languages.pt-BR', 'Portuguese (Brazil)')}</MenuItem>
                                            <MenuItem value="ru" sx={{ fontSize: '0.8rem' }}>🇷🇺 {t('vfo.languages.ru', 'Russian')}</MenuItem>
                                            <MenuItem value="uk" sx={{ fontSize: '0.8rem' }}>🇺🇦 {t('vfo.languages.uk', 'Ukrainian')}</MenuItem>
                                            <MenuItem value="ja" sx={{ fontSize: '0.8rem' }}>🇯🇵 {t('vfo.languages.ja', 'Japanese')}</MenuItem>
                                            <MenuItem value="zh" sx={{ fontSize: '0.8rem' }}>🇨🇳 {t('vfo.languages.zh', 'Chinese')}</MenuItem>
                                            <MenuItem value="ar" sx={{ fontSize: '0.8rem' }}>🇸🇦 {t('vfo.languages.ar', 'Arabic')}</MenuItem>
                                            <MenuItem value="tl" sx={{ fontSize: '0.8rem' }}>🇵🇭 {t('vfo.languages.tl', 'Filipino')}</MenuItem>
                                            <MenuItem value="tr" sx={{ fontSize: '0.8rem' }}>🇹🇷 {t('vfo.languages.tr', 'Turkish')}</MenuItem>
                                        </Select>
                                    </FormControl>

                                    {/* Transcription Stats Display */}
                                    {(() => {
                                        const decoderInfo = getVFODecoderInfo(vfoIndex);
                                        // Check if this is a transcription decoder
                                        if (!decoderInfo || decoderInfo.decoder_type !== 'transcription') return null;

                                        const info = decoderInfo.info || {};
                                        const isConnected = decoderInfo.status === 'transcribing';
                                        const successRate = info.transcriptions_sent > 0
                                            ? Math.round((info.transcriptions_received / info.transcriptions_sent) * 100)
                                            : 0;

                                        return (
                                            <Box sx={{
                                                mt: 1.5,
                                                px: 1,
                                                py: 0.75,
                                                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                                borderRadius: 0.5,
                                                border: '1px solid',
                                                borderColor: isConnected ? 'success.dark' : 'error.dark',
                                            }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                    <Box
                                                        sx={{
                                                            width: 8,
                                                            height: 8,
                                                            borderRadius: '50%',
                                                            backgroundColor: isConnected ? 'success.main' : 'error.main',
                                                            boxShadow: (theme) => isConnected
                                                                ? `0 0 6px ${theme.palette.success.main}99`
                                                                : `0 0 6px ${theme.palette.error.main}99`,
                                                        }}
                                                    />
                                                    <Typography variant="caption" sx={{
                                                        fontSize: '0.7rem',
                                                        fontFamily: 'monospace',
                                                        color: 'text.secondary',
                                                        fontWeight: 600
                                                    }}>
                                                        {isConnected ? 'Transcribing' : 'Disconnected'}
                                                    </Typography>
                                                </Box>
                                                <Typography variant="caption" sx={{
                                                    fontSize: '0.65rem',
                                                    fontFamily: 'monospace',
                                                    color: 'text.secondary',
                                                    display: 'block'
                                                }}>
                                                    S:{info.transcriptions_sent || 0} • R:{info.transcriptions_received || 0} • {successRate}%
                                                </Typography>
                                                {info.errors > 0 && (
                                                    <Typography variant="caption" sx={{
                                                        fontSize: '0.65rem',
                                                        fontFamily: 'monospace',
                                                        color: 'error.main',
                                                        display: 'block'
                                                    }}>
                                                        Errors: {info.errors}
                                                    </Typography>
                                                )}
                                            </Box>
                                        );
                                    })()}

                                <Box sx={{
                                    mt: 1,
                                    display: 'flex',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    color: 'text.secondary'
                                }}>
                                    ✨ Powered by Gemini
                                </Box>
                            </Box>
                        </Box>

                        {vfoMarkers[vfoIndex]?.lockedTransmitterId && vfoMarkers[vfoIndex]?.lockedTransmitterId !== 'none' && (
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
                                disabled={!vfoActive[vfoIndex]}
                                onChange={(event, newValue) => {
                                    if (newValue !== null) {
                                        // When selecting an audio demod mode, clear decoder
                                        // (mode and decoder are mutually exclusive)
                                        onVFOPropertyChange(vfoIndex, { mode: newValue, decoder: 'none' });
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
                                <ToggleButton value="none">{t('vfo.modes.none')}</ToggleButton>
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
                                        // When selecting a decoder (not none), set audio demod to NONE
                                        // Backend will start appropriate internal demodulator as needed
                                        if (newValue !== 'none') {
                                            const updates = { decoder: newValue, mode: 'none' };

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
                                            } else if (newValue === 'afsk') {
                                                updates.bandwidth = 3300; // 3.3 kHz for AFSK
                                            } else if (newValue === 'weather') {
                                                // Get locked transmitter for weather satellite bandwidth calculation
                                                const currentVFO = vfoMarkers[vfoIndex];
                                                const lockedTransmitter = currentVFO?.lockedTransmitterId
                                                    ? transmitters.find(tx => tx.id === currentVFO.lockedTransmitterId)
                                                    : null;

                                                if (lockedTransmitter) {
                                                    // Use calculateBandwidth from vfo-config.js
                                                    const decoderConfig = getDecoderConfig('weather');
                                                    if (decoderConfig && decoderConfig.calculateBandwidth) {
                                                        updates.bandwidth = decoderConfig.calculateBandwidth(lockedTransmitter);
                                                    } else {
                                                        updates.bandwidth = 40000; // Fallback to default (APT)
                                                    }
                                                } else {
                                                    updates.bandwidth = 40000; // Default to APT bandwidth (40 kHz)
                                                }
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
                                <ToggleButton value="fsk">{t('vfo.decoders_modes.fsk', 'FSK')}</ToggleButton>
                                <ToggleButton value="gmsk">{t('vfo.decoders_modes.gmsk', 'GMSK')}</ToggleButton>
                                <ToggleButton value="gfsk">{t('vfo.decoders_modes.gfsk', 'GFSK')}</ToggleButton>
                                <ToggleButton value="bpsk">{t('vfo.decoders_modes.bpsk', 'BPSK')}</ToggleButton>
                                <ToggleButton value="afsk">{t('vfo.decoders_modes.afsk', 'AFSK')}</ToggleButton>
                                <ToggleButton value="weather">{t('vfo.decoders_modes.weather', 'Weather')}</ToggleButton>
                            </ToggleButtonGroup>

                            {/* Decoder Parameters Link - Click to open dialog */}
                            <Box sx={{ mt: 1.5, width: '100%' }}>
                                <Link
                                    component="button"
                                    variant="body2"
                                    disabled={!vfoActive[vfoIndex] || !vfoMarkers[vfoIndex]?.decoder || vfoMarkers[vfoIndex].decoder === 'none'}
                                    onClick={() => {
                                        setDecoderParamsVfoIndex(vfoIndex);
                                        setDecoderParamsDialogOpen(true);
                                    }}
                                    sx={{
                                        width: '100%',
                                        fontSize: '0.8rem',
                                        color: 'text.primary',
                                        textDecoration: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 0.75,
                                        py: 0.75,
                                        px: 1.5,
                                        borderRadius: 1,
                                        backgroundColor: vfoMarkers[vfoIndex]?.parametersEnabled ? 'rgba(33, 150, 243, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                                        border: vfoMarkers[vfoIndex]?.parametersEnabled ? '1px solid rgba(33, 150, 243, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                                        transition: 'all 0.2s ease',
                                        '&:hover:not(.Mui-disabled)': {
                                            backgroundColor: vfoMarkers[vfoIndex]?.parametersEnabled ? 'rgba(33, 150, 243, 0.12)' : 'rgba(255, 255, 255, 0.08)',
                                            borderColor: vfoMarkers[vfoIndex]?.parametersEnabled ? 'rgba(33, 150, 243, 0.4)' : 'rgba(255, 255, 255, 0.2)',
                                        },
                                        '&.Mui-disabled': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                            borderColor: 'rgba(255, 255, 255, 0.05)',
                                            color: 'rgba(255, 255, 255, 0.3)',
                                            opacity: 0.5,
                                            cursor: 'not-allowed',
                                        },
                                        cursor: 'pointer',
                                    }}
                                >
                                    <SettingsIcon sx={{ fontSize: '1rem', color: vfoMarkers[vfoIndex]?.parametersEnabled ? 'primary.main' : 'text.secondary' }} />
                                    <Box
                                        component="span"
                                        sx={{
                                            fontFamily: 'monospace',
                                            color: 'text.secondary',
                                            flex: 1,
                                            textDecoration: vfoMarkers[vfoIndex]?.decoder && vfoMarkers[vfoIndex].decoder !== 'none' && !vfoMarkers[vfoIndex]?.parametersEnabled ? 'line-through' : 'none',
                                        }}
                                    >
                                        {vfoMarkers[vfoIndex]?.decoder === 'none' || !vfoMarkers[vfoIndex]?.decoder
                                            ? '- no decoder -'
                                            : (formatDecoderParamsSummary(vfoIndex) || 'Decoder Parameters')}
                                    </Box>
                                </Link>
                            </Box>
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
                                        vfoMarkers[vfoIndex]?.mode,
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

            {/* Decoder Parameters Dialog */}
            <DecoderParamsDialog
                open={decoderParamsDialogOpen}
                onClose={() => setDecoderParamsDialogOpen(false)}
                vfoIndex={decoderParamsVfoIndex}
                vfoMarkers={vfoMarkers}
                vfoActive={vfoActive}
                onVFOPropertyChange={onVFOPropertyChange}
            />
        </Accordion>
    );
};

export default VfoAccordion;