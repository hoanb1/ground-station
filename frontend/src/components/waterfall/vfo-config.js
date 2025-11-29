/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
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

/**
 * Global VFO Configuration Object
 *
 * This centralized configuration defines all demodulators, decoders, their modes,
 * parameters, defaults, and behavior. This eliminates scattered conditional logic
 * throughout the UI codebase.
 */

/**
 * Demodulator configurations
 * These handle the RF-to-audio conversion
 */
export const DEMODULATORS = {
    NONE: {
        internalName: 'none',
        displayName: 'None',
        description: 'No demodulation - center line only',
        defaultBandwidth: 1000, // 1 kHz minimal
        minBandwidth: 100,
        maxBandwidth: 10000,
        bandwidthType: 'center-only', // no sidebands, just center line
        showBothEdges: false,
        allowLeftEdgeDrag: false,
        allowRightEdgeDrag: false,
        centerLineOnly: true, // only draw center line, no sidebands
        bandwidthLabel: (bw) => '', // no bandwidth label for center-only
        lockedBandwidth: true, // bandwidth cannot be changed by user
    },
    FM: {
        internalName: 'FM',
        displayName: 'FM',
        description: 'Frequency Modulation - Double Sideband',
        defaultBandwidth: 10000, // 10 kHz
        minBandwidth: 1000,
        maxBandwidth: 100000,
        bandwidthType: 'double-sided', // bandwidth is divided equally on both sides of center
        showBothEdges: true, // show both left and right edges on waterfall
        allowLeftEdgeDrag: true,
        allowRightEdgeDrag: true,
        centerLineOnly: false,
        bandwidthLabel: (bw) => `±${(bw / 2000).toFixed(1)}kHz`, // show as ±5kHz
        lockedBandwidth: false, // bandwidth can be changed by user
    },
    FM_STEREO: {
        internalName: 'FM_STEREO',
        displayName: 'FMS',
        description: 'Stereo Frequency Modulation',
        defaultBandwidth: 150000, // 150 kHz for broadcast FM
        minBandwidth: 100000,
        maxBandwidth: 200000,
        bandwidthType: 'double-sided',
        showBothEdges: true,
        allowLeftEdgeDrag: true,
        allowRightEdgeDrag: true,
        centerLineOnly: false,
        bandwidthLabel: (bw) => `±${(bw / 2000).toFixed(1)}kHz`,
        lockedBandwidth: false, // bandwidth can be changed by user
    },
    AM: {
        internalName: 'AM',
        displayName: 'AM',
        description: 'Amplitude Modulation - Double Sideband',
        defaultBandwidth: 10000, // 10 kHz
        minBandwidth: 1000,
        maxBandwidth: 20000,
        bandwidthType: 'double-sided',
        showBothEdges: true,
        allowLeftEdgeDrag: true,
        allowRightEdgeDrag: true,
        centerLineOnly: false,
        bandwidthLabel: (bw) => `±${(bw / 2000).toFixed(1)}kHz`,
        lockedBandwidth: false, // bandwidth can be changed by user
    },
    USB: {
        internalName: 'USB',
        displayName: 'USB',
        description: 'Upper Sideband - Single Sideband',
        defaultBandwidth: 3000, // 3 kHz
        minBandwidth: 500,
        maxBandwidth: 10000,
        bandwidthType: 'single-sided-upper', // bandwidth extends above center frequency
        showBothEdges: false,
        allowLeftEdgeDrag: false,
        allowRightEdgeDrag: true,
        centerLineOnly: false,
        bandwidthLabel: (bw) => `${(bw / 1000).toFixed(1)}kHz`,
        lockedBandwidth: false, // bandwidth can be changed by user
    },
    LSB: {
        internalName: 'LSB',
        displayName: 'LSB',
        description: 'Lower Sideband - Single Sideband',
        defaultBandwidth: 3000, // 3 kHz
        minBandwidth: 500,
        maxBandwidth: 10000,
        bandwidthType: 'single-sided-lower', // bandwidth extends below center frequency
        showBothEdges: false,
        allowLeftEdgeDrag: true,
        allowRightEdgeDrag: false,
        centerLineOnly: false,
        bandwidthLabel: (bw) => `${(bw / 1000).toFixed(1)}kHz`,
        lockedBandwidth: false, // bandwidth can be changed by user
    },
    CW: {
        internalName: 'CW',
        displayName: 'CW',
        description: 'Continuous Wave (Morse) - Single Sideband',
        defaultBandwidth: 1000, // 1 kHz narrow filter
        minBandwidth: 200,
        maxBandwidth: 3000,
        bandwidthType: 'single-sided-upper',
        showBothEdges: false,
        allowLeftEdgeDrag: false,
        allowRightEdgeDrag: true,
        centerLineOnly: false,
        bandwidthLabel: (bw) => `${(bw / 1000).toFixed(1)}kHz`,
        lockedBandwidth: false, // bandwidth can be changed by user
    },
};

/**
 * Decoder configurations
 * These process demodulated audio to extract data
 */
export const DECODERS = {
    none: {
        internalName: 'none',
        displayName: 'None',
        description: 'No decoder - audio pass-through',
        requiresDemodulator: null, // can work with any demodulator
        overrideDemodulator: null, // doesn't override demodulator mode
        centerLineOnly: false, // doesn't force center-only, respects demodulator setting
        hasStatusDisplay: false,
        hasProgressDisplay: false,
        hasTextOutput: false,
        lockedBandwidth: false, // allows demodulator's lock setting to apply
    },
    sstv: {
        internalName: 'sstv',
        displayName: 'SSTV',
        description: 'Slow Scan Television decoder',
        requiresDemodulator: 'FM', // requires FM demodulation
        overrideDemodulator: 'FM', // force FM mode when active
        centerLineOnly: false,
        hasStatusDisplay: true, // shows decoder status (e.g., "detecting", "decoding")
        hasProgressDisplay: true, // shows percentage progress
        hasTextOutput: false, // no text output, outputs images
        hasModeDisplay: true, // shows SSTV mode (e.g., "Martin M1", "Scottie S1")
        defaultBandwidth: 3300, // 3.3 kHz for SSTV (audio content ~1200-2300 Hz)
        lockedBandwidth: false, // allows demodulator's lock setting to apply
    },
    morse: {
        internalName: 'morse',
        displayName: 'Morse',
        description: 'Morse code (CW) decoder',
        requiresDemodulator: 'CW', // requires CW/SSB demodulation
        overrideDemodulator: 'CW', // force CW mode when active
        centerLineOnly: false,
        hasStatusDisplay: false, // no status, always listening
        hasProgressDisplay: false, // no progress bar
        hasTextOutput: true, // outputs decoded text
        hasModeDisplay: false,
        textDisplayLength: 30, // how many chars to show in VFO label
        textBufferLength: 300, // how many chars to keep in buffer
        textPlaceholder: 'listening', // what to show when no text yet
        defaultBandwidth: 2500, // 2.5 kHz for Morse decoder (narrowband)
        lockedBandwidth: false, // allows demodulator's lock setting to apply
    },
    apt: {
        internalName: 'apt',
        displayName: 'APT',
        description: 'Automatic Picture Transmission (NOAA weather satellites)',
        requiresDemodulator: 'FM',
        overrideDemodulator: 'FM',
        centerLineOnly: false,
        hasStatusDisplay: true,
        hasProgressDisplay: true,
        hasTextOutput: false,
        hasModeDisplay: false,
        defaultBandwidth: 40000, // 40 kHz for APT (NOAA APT signal bandwidth)
        lockedBandwidth: false, // allows demodulator's lock setting to apply
    },
    lora: {
        internalName: 'lora',
        displayName: 'LoRa',
        description: 'LoRa decoder (processes raw IQ, no demodulator)',
        requiresDemodulator: null, // raw IQ decoder
        overrideDemodulator: 'none', // disable audio demodulator
        centerLineOnly: true, // only show center line for raw IQ
        hasStatusDisplay: true,
        hasProgressDisplay: false,
        hasTextOutput: false,
        hasModeDisplay: true, // shows LoRa parameters (SF, BW, CR)
        defaultBandwidth: 500000, // 500 kHz for LoRa (auto-detects 125/250/500 kHz signals)
        lockedBandwidth: true, // bandwidth is determined by LoRa parameters, not user-adjustable
    },
    gmsk: {
        internalName: 'gmsk',
        displayName: 'GMSK',
        description: 'GMSK decoder (Gaussian MSK, processes raw IQ, no demodulator)',
        requiresDemodulator: null, // raw IQ decoder
        overrideDemodulator: 'none', // disable audio demodulator
        centerLineOnly: false, // show sidebands representing actual bandwidth
        hasStatusDisplay: true,
        hasProgressDisplay: false,
        hasTextOutput: false,
        hasModeDisplay: false,
        defaultBandwidth: 25000, // 25 kHz default (suitable for 2400-4800 baud + Doppler)
        bandwidthType: 'double-sided', // bandwidth is divided equally on both sides of center
        showBothEdges: true, // show both edges
        allowLeftEdgeDrag: false, // edges not draggable (bandwidth locked)
        allowRightEdgeDrag: false, // edges not draggable (bandwidth locked)
        bandwidthLabel: (bw) => `±${(bw / 2000).toFixed(1)}kHz`, // show as ±12.5kHz
        lockedBandwidth: true, // bandwidth is determined by baud rate, not user-adjustable
        calculateBandwidth: (transmitter) => {
            // Calculate optimal bandwidth based on transmitter baud rate
            // Formula: 3x baud rate (for GMSK spectral width + Doppler margin)
            if (transmitter && transmitter.baud) {
                return transmitter.baud * 3;
            }
            return 25000; // fallback to default
        },
    },
    gfsk: {
        internalName: 'gfsk',
        displayName: 'GFSK',
        description: 'GFSK decoder (Gaussian FSK, processes raw IQ, no demodulator)',
        requiresDemodulator: null, // raw IQ decoder
        overrideDemodulator: 'none', // disable audio demodulator
        centerLineOnly: false, // show sidebands representing actual bandwidth
        hasStatusDisplay: true,
        hasProgressDisplay: false,
        hasTextOutput: false,
        hasModeDisplay: false,
        defaultBandwidth: 30000, // 30 kHz default (suitable for ~9600-10000 baud + Doppler)
        bandwidthType: 'double-sided', // bandwidth is divided equally on both sides of center
        showBothEdges: true, // show both edges
        allowLeftEdgeDrag: false, // edges not draggable (bandwidth locked)
        allowRightEdgeDrag: false, // edges not draggable (bandwidth locked)
        bandwidthLabel: (bw) => `±${(bw / 2000).toFixed(1)}kHz`, // show as ±15kHz
        lockedBandwidth: true, // bandwidth is determined by baud rate, not user-adjustable
        calculateBandwidth: (transmitter) => {
            // Calculate optimal bandwidth based on transmitter baud rate
            // Formula: 3x baud rate (for GFSK spectral width + Doppler margin)
            if (transmitter && transmitter.baud) {
                return transmitter.baud * 3;
            }
            return 30000; // fallback to default
        },
    },
    fsk: {
        internalName: 'fsk',
        displayName: 'FSK',
        description: 'FSK decoder (Frequency Shift Keying, processes raw IQ, no demodulator)',
        requiresDemodulator: null, // raw IQ decoder
        overrideDemodulator: 'none', // disable audio demodulator
        centerLineOnly: false, // show sidebands representing actual bandwidth
        hasStatusDisplay: true,
        hasProgressDisplay: false,
        hasTextOutput: false,
        hasModeDisplay: false,
        defaultBandwidth: 25000, // 25 kHz default (suitable for 1200-9600 baud + Doppler)
        bandwidthType: 'double-sided', // bandwidth is divided equally on both sides of center
        showBothEdges: true, // show both edges
        allowLeftEdgeDrag: false, // edges not draggable (bandwidth locked)
        allowRightEdgeDrag: false, // edges not draggable (bandwidth locked)
        bandwidthLabel: (bw) => `±${(bw / 2000).toFixed(1)}kHz`, // show as ±12.5kHz
        lockedBandwidth: true, // bandwidth is determined by baud rate, not user-adjustable
        calculateBandwidth: (transmitter) => {
            // Calculate optimal bandwidth based on transmitter baud rate
            // Formula: 3x baud rate (for FSK spectral width + Doppler margin)
            if (transmitter && transmitter.baud) {
                return transmitter.baud * 3;
            }
            return 25000; // fallback to default
        },
    },
    bpsk: {
        internalName: 'bpsk',
        displayName: 'BPSK',
        description: 'BPSK decoder with AX.25 support (processes raw IQ, no demodulator)',
        requiresDemodulator: null, // raw IQ decoder
        overrideDemodulator: 'none', // disable audio demodulator
        centerLineOnly: false, // show sidebands representing actual bandwidth
        hasStatusDisplay: true,
        hasProgressDisplay: false,
        hasTextOutput: false,
        hasModeDisplay: false,
        defaultBandwidth: 30000, // 30 kHz default (suitable for 9600 baud + Doppler)
        bandwidthType: 'double-sided', // bandwidth is divided equally on both sides of center
        showBothEdges: true, // show both edges
        allowLeftEdgeDrag: false, // edges not draggable (bandwidth locked)
        allowRightEdgeDrag: false, // edges not draggable (bandwidth locked)
        bandwidthLabel: (bw) => `±${(bw / 2000).toFixed(1)}kHz`, // show as ±15kHz
        lockedBandwidth: true, // bandwidth is determined by baud rate, not user-adjustable
        calculateBandwidth: (transmitter) => {
            // Calculate optimal bandwidth based on transmitter baud rate
            // Formula: 3x baud rate (for BPSK spectral width + Doppler margin)
            if (transmitter && transmitter.baud) {
                return transmitter.baud * 3;
            }
            return 30000; // fallback to default
        },
    },
    afsk: {
        internalName: 'afsk',
        displayName: 'AFSK',
        description: 'Audio FSK decoder (APRS, packet radio - requires FM demodulator)',
        requiresDemodulator: 'FM', // requires FM demodulation
        overrideDemodulator: 'FM', // force FM mode when active
        centerLineOnly: false,
        hasStatusDisplay: true,
        hasProgressDisplay: false,
        hasTextOutput: false,
        hasModeDisplay: false,
        defaultBandwidth: 12500, // 12.5 kHz for AFSK (typical FM channel bandwidth)
        lockedBandwidth: false, // allows user adjustment (FM carrier bandwidth)
    },
    weather: {
        internalName: 'weather',
        displayName: 'Weather',
        description: 'Weather satellite decoder (SatDump: NOAA, Meteor, GOES, etc.)',
        requiresDemodulator: null, // raw IQ decoder (like GMSK/BPSK)
        overrideDemodulator: 'none', // disable audio demodulator
        centerLineOnly: true, // center line only - bandwidth handled internally by decoder
        hasStatusDisplay: true, // shows decoder status (sync, locked, etc.)
        hasProgressDisplay: true, // shows frame count progress
        hasTextOutput: false, // outputs images, not text
        hasModeDisplay: true, // shows pipeline name (e.g., "NOAA APT", "Meteor LRPT")
        defaultBandwidth: 40000, // 40 kHz default (suitable for APT)
        bandwidthType: 'center-only', // no sidebands shown
        showBothEdges: false, // no sidebands
        allowLeftEdgeDrag: false, // bandwidth locked (determined by pipeline)
        allowRightEdgeDrag: false,
        bandwidthLabel: (bw) => '', // no bandwidth label
        lockedBandwidth: true, // bandwidth determined by satellite/pipeline
        calculateBandwidth: (transmitter) => {
            // Auto-calculate bandwidth based on transmitter mode
            const mode = transmitter?.mode?.toUpperCase() || '';

            // APT (NOAA analog) - 40 kHz
            if (mode === 'APT' || mode.includes('APT')) {
                return 40000;
            }
            // LRPT (Meteor digital) - 120-150 kHz
            else if (mode === 'LRPT' || mode.includes('LRPT')) {
                return 150000;
            }
            // GGAK (Elektro-L GMDSS) - 100 kHz
            // 5 ksym/s BPSK with RRC filtering needs ~50-100 kHz
            else if (mode === 'GGAK' || mode === 'GMDSS' || mode.includes('GGAK')) {
                return 100000;
            }
            // HRPT (high-res) - 2.5-3 MHz
            else if (mode === 'HRPT' || mode === 'AHRPT' || mode.includes('HRPT')) {
                return 3000000;
            }
            // HRIT/LRIT (geostationary) - 1-2 MHz
            else if (mode === 'HRIT' || mode === 'LRIT' || mode.includes('HRIT') || mode.includes('LRIT')) {
                return 2000000;
            }

            // Fallback to 40 kHz (APT)
            return 40000;
        },
    },
};

/**
 * Helper function to get demodulator configuration
 * @param {string} mode - Demodulator internal name (e.g., 'FM', 'USB')
 * @returns {Object|null} Demodulator config or null if not found
 */
export const getDemodulatorConfig = (mode) => {
    return DEMODULATORS[mode] || null;
};

/**
 * Helper function to get decoder configuration
 * @param {string} decoder - Decoder internal name (e.g., 'sstv', 'morse', 'none')
 * @returns {Object} Decoder config (defaults to 'none' if not found)
 */
export const getDecoderConfig = (decoder) => {
    return DECODERS[decoder] || DECODERS.none;
};

/**
 * Determine the effective demodulator mode for a VFO
 * Takes into account decoder overrides
 *
 * @param {string} vfoMode - The VFO's configured demodulator mode
 * @param {string} decoder - The VFO's decoder setting
 * @param {Object|null} activeDecoderInfo - Active decoder info from Redux (if decoder is running)
 * @returns {string} The effective demodulator mode to use
 */
export const getEffectiveMode = (vfoMode, decoder, activeDecoderInfo = null) => {
    // If there's an active decoder session, check if it overrides the mode
    if (activeDecoderInfo && activeDecoderInfo.decoder_type) {
        const decoderConfig = getDecoderConfig(activeDecoderInfo.decoder_type);
        if (decoderConfig.overrideDemodulator) {
            return decoderConfig.overrideDemodulator;
        }
    }

    // If decoder is set but not yet active, check if it overrides the mode
    if (decoder && decoder !== 'none') {
        const decoderConfig = getDecoderConfig(decoder);
        if (decoderConfig.overrideDemodulator) {
            return decoderConfig.overrideDemodulator;
        }
    }

    // No override, use the VFO's configured mode
    return vfoMode;
};

/**
 * Get bandwidth configuration for a mode
 *
 * @param {string} mode - Demodulator mode
 * @returns {Object} Object with min, max, and default bandwidth
 */
export const getBandwidthConfig = (mode) => {
    const demodConfig = getDemodulatorConfig(mode);
    if (!demodConfig) {
        // Fallback defaults
        return {
            min: 500,
            max: 100000,
            default: 10000
        };
    }

    return {
        min: demodConfig.minBandwidth,
        max: demodConfig.maxBandwidth,
        default: demodConfig.defaultBandwidth
    };
};

/**
 * Check if a mode should show both edges (left and right)
 *
 * @param {string} mode - Demodulator mode
 * @returns {boolean} True if both edges should be shown
 */
export const shouldShowBothEdges = (mode) => {
    const demodConfig = getDemodulatorConfig(mode);
    return demodConfig ? demodConfig.showBothEdges : false;
};

/**
 * Check if center line only mode is active (no sidebands)
 * Considers both demodulator and decoder configurations
 *
 * @param {string} mode - Demodulator mode
 * @param {string} decoder - Decoder name
 * @returns {boolean} True if only center line should be shown
 */
export const isCenterLineOnly = (mode, decoder) => {
    // Check demodulator config
    const demodConfig = getDemodulatorConfig(mode);
    if (demodConfig && demodConfig.centerLineOnly) {
        return true;
    }

    // Check decoder config
    const decoderConfig = getDecoderConfig(decoder);
    if (decoderConfig && decoderConfig.centerLineOnly) {
        return true;
    }

    return false;
};

/**
 * Check if left edge can be dragged for a mode
 *
 * @param {string} mode - Demodulator mode
 * @returns {boolean} True if left edge is draggable
 */
export const canDragLeftEdge = (mode) => {
    const demodConfig = getDemodulatorConfig(mode);
    return demodConfig ? demodConfig.allowLeftEdgeDrag : false;
};

/**
 * Check if right edge can be dragged for a mode
 *
 * @param {string} mode - Demodulator mode
 * @returns {boolean} True if right edge is draggable
 */
export const canDragRightEdge = (mode) => {
    const demodConfig = getDemodulatorConfig(mode);
    return demodConfig ? demodConfig.allowRightEdgeDrag : false;
};

/**
 * Check if VFO bandwidth is locked (considering both demodulator and decoder)
 *
 * @param {string} mode - Demodulator mode
 * @param {string} decoder - Decoder name
 * @returns {boolean} True if bandwidth is locked (not user-adjustable)
 */
export const isLockedBandwidth = (mode, decoder) => {
    // Check decoder config first (decoder can override lock state)
    const decoderConfig = getDecoderConfig(decoder);
    if (decoderConfig && decoderConfig.lockedBandwidth === true) {
        return true;
    }

    // Check demodulator config
    const demodConfig = getDemodulatorConfig(mode);
    if (demodConfig && demodConfig.lockedBandwidth === true) {
        return true;
    }

    // Default to false (unlocked/resizable) if not explicitly set
    return false;
};

/**
 * Get the bandwidth type for a mode
 *
 * @param {string} mode - Demodulator mode
 * @returns {string} 'double-sided', 'single-sided-upper', or 'single-sided-lower'
 */
export const getBandwidthType = (mode) => {
    const demodConfig = getDemodulatorConfig(mode);
    return demodConfig ? demodConfig.bandwidthType : 'double-sided';
};

/**
 * Format bandwidth label for display
 *
 * @param {string} mode - Demodulator mode
 * @param {number} bandwidth - Bandwidth in Hz
 * @returns {string} Formatted bandwidth label
 */
export const formatBandwidthLabel = (mode, bandwidth) => {
    const demodConfig = getDemodulatorConfig(mode);
    if (!demodConfig || !demodConfig.bandwidthLabel) {
        // Fallback formatting
        return `${(bandwidth / 1000).toFixed(1)}kHz`;
    }

    return demodConfig.bandwidthLabel(bandwidth);
};

/**
 * Get list of available demodulator modes
 *
 * @returns {Array} Array of demodulator internal names
 */
export const getAvailableDemodulators = () => {
    return Object.keys(DEMODULATORS);
};

/**
 * Get list of available decoders
 *
 * @returns {Array} Array of decoder internal names
 */
export const getAvailableDecoders = () => {
    return Object.keys(DECODERS);
};

/**
 * Check if a decoder should show status in VFO label
 *
 * @param {string} decoder - Decoder internal name
 * @returns {boolean} True if status should be displayed
 */
export const shouldShowDecoderStatus = (decoder) => {
    const decoderConfig = getDecoderConfig(decoder);
    return decoderConfig.hasStatusDisplay;
};

/**
 * Check if a decoder should show progress in VFO label
 *
 * @param {string} decoder - Decoder internal name
 * @returns {boolean} True if progress should be displayed
 */
export const shouldShowDecoderProgress = (decoder) => {
    const decoderConfig = getDecoderConfig(decoder);
    return decoderConfig.hasProgressDisplay;
};

/**
 * Check if a decoder should show mode in VFO label
 *
 * @param {string} decoder - Decoder internal name
 * @returns {boolean} True if mode should be displayed
 */
export const shouldShowDecoderMode = (decoder) => {
    const decoderConfig = getDecoderConfig(decoder);
    return decoderConfig.hasModeDisplay;
};

/**
 * Check if a decoder has text output
 *
 * @param {string} decoder - Decoder internal name
 * @returns {boolean} True if decoder outputs text
 */
export const hasTextOutput = (decoder) => {
    const decoderConfig = getDecoderConfig(decoder);
    return decoderConfig.hasTextOutput;
};

/**
 * Get text display configuration for a decoder
 *
 * @param {string} decoder - Decoder internal name
 * @returns {Object|null} Object with display length, buffer length, and placeholder, or null
 */
export const getTextDisplayConfig = (decoder) => {
    const decoderConfig = getDecoderConfig(decoder);
    if (!decoderConfig.hasTextOutput) {
        return null;
    }

    return {
        displayLength: decoderConfig.textDisplayLength || 30,
        bufferLength: decoderConfig.textBufferLength || 300,
        placeholder: decoderConfig.textPlaceholder || 'listening'
    };
};

/**
 * Normalize transmitter mode string to internal demodulator name
 * Used when locking VFOs to satellite transmitters
 *
 * @param {string} mode - Raw mode string from transmitter data
 * @returns {string|null} Normalized demodulator internal name
 */
export const normalizeTransmitterMode = (mode) => {
    if (!mode) return null;

    const modeNormalized = mode.toLowerCase();

    // Digital modes (FSK/AFSK/PSK/BPSK/QPSK/GMSK/GFSK) are transmitted over FM carriers
    if (['fsk', 'afsk', 'psk', 'bpsk', 'qpsk', 'gmsk', 'gfsk', 'gmsk usp', 'fmn'].includes(modeNormalized)) {
        return 'FM';
    }

    // Keep FM_STEREO as-is if explicitly specified
    if (modeNormalized === 'fm_stereo') {
        return 'FM_STEREO';
    }

    // Return uppercase version (should match DEMODULATORS keys)
    const upperMode = mode.toUpperCase();

    // Validate it exists in our config
    if (DEMODULATORS[upperMode]) {
        return upperMode;
    }

    // Fallback to FM if unrecognized
    console.warn(`Unknown transmitter mode "${mode}", defaulting to FM`);
    return 'FM';
};

/**
 * Decoder parameter definitions
 * Structure: { decoder_paramName: { options, default, label, description, type } }
 */
export const DECODER_PARAMETERS = {
    // LoRa Parameters
    lora_sf: {
        label: 'Spreading Factor',
        description: 'Higher SF = longer range but slower data rate',
        type: 'select',
        default: 7,
        options: [
            { value: 7, label: 'SF7', tooltip: 'Fastest, shortest range' },
            { value: 8, label: 'SF8' },
            { value: 9, label: 'SF9' },
            { value: 10, label: 'SF10' },
            { value: 11, label: 'SF11' },
            { value: 12, label: 'SF12', tooltip: 'Slowest, longest range' }
        ]
    },
    lora_bw: {
        label: 'Bandwidth',
        description: 'Signal bandwidth in Hz',
        type: 'select',
        default: 125000,
        options: [
            { value: 62500, label: '62.5 kHz' },
            { value: 125000, label: '125 kHz' },
            { value: 250000, label: '250 kHz' },
            { value: 500000, label: '500 kHz' }
        ]
    },
    lora_cr: {
        label: 'Coding Rate',
        description: 'Forward error correction ratio',
        type: 'select',
        default: 1,
        options: [
            { value: 1, label: '4/5', tooltip: 'Least overhead, fastest' },
            { value: 2, label: '4/6' },
            { value: 3, label: '4/7' },
            { value: 4, label: '4/8', tooltip: 'Most overhead, most robust' }
        ]
    },
    lora_sync_word: {
        label: 'Sync Word',
        description: 'Network identifier for packet filtering',
        type: 'select',
        default: [0x08, 0x10],
        options: [
            { value: [0x12], label: '0x12 (LoRaWAN Public)' },
            { value: [0x34], label: '0x34 (LoRaWAN Private)' },
            { value: [0x08, 0x10], label: '0x08 0x10 (TinyGS)' },
            { value: [], label: 'Auto-detect' }
        ],
        // Custom comparator for array values
        compare: (a, b) => JSON.stringify(a) === JSON.stringify(b)
    },
    lora_preamble_len: {
        label: 'Preamble Length',
        description: 'Number of preamble symbols',
        type: 'select',
        default: 8,
        options: [
            { value: 6, label: '6' },
            { value: 8, label: '8' },
            { value: 12, label: '12' },
            { value: 16, label: '16' }
        ]
    },
    lora_fldro: {
        label: 'Low Data Rate Optimization',
        description: 'Enable for SF11/SF12 with BW < 500kHz',
        type: 'switch',
        default: false
    },

    // TODO: Add FSK/GMSK/GFSK/BPSK/Weather parameters when needed
};

/**
 * Get parameter definitions for a specific decoder
 * @param {string} decoder - Decoder name (e.g., 'lora', 'fsk')
 * @returns {Object} Parameter definitions for this decoder
 */
export const getDecoderParameters = (decoder) => {
    const prefix = `${decoder}_`;
    return Object.entries(DECODER_PARAMETERS)
        .filter(([key]) => key.startsWith(prefix))
        .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});
};

/**
 * Get default parameters for a specific decoder
 * @param {string} decoder - Decoder name
 * @returns {Object} Default parameter values
 */
export const getDecoderDefaultParameters = (decoder) => {
    const params = getDecoderParameters(decoder);
    return Object.entries(params).reduce((acc, [key, param]) => {
        acc[key] = param.default;
        return acc;
    }, {});
};

/**
 * Map frontend parameter names to backend names
 * Frontend uses prefixed flat keys (lora_sf), backend uses unprefixed names (sf)
 *
 * @param {string} decoder - Decoder name (e.g., 'lora')
 * @param {Object} parameters - Frontend parameters object
 * @returns {Object} Backend-compatible parameters
 */
export const mapParametersToBackend = (decoder, parameters) => {
    if (decoder === 'lora') {
        return {
            sf: parameters.lora_sf,
            bw: parameters.lora_bw,
            cr: parameters.lora_cr,
            sync_word: parameters.lora_sync_word,
            preamble_len: parameters.lora_preamble_len,
            fldro: parameters.lora_fldro
        };
    }
    // Add other decoder mappings as needed (FSK, BPSK, etc.)
    return {};
};

/**
 * Get default VFO configuration object
 * Use this when initializing new VFOs
 *
 * @returns {Object} Default VFO configuration
 */
export const getDefaultVFOConfig = () => {
    return {
        mode: 'FM',
        bandwidth: DEMODULATORS.FM.defaultBandwidth,
        decoder: 'none',
        volume: 50,
        squelch: -150,
        stepSize: 1000,
        transcriptionEnabled: false,
        transcriptionModel: 'small.en',
        transcriptionLanguage: 'en',

        // Decoder-specific parameters (flat object, prefixed by decoder type)
        parameters: {
            // LoRa parameters (defaults from TinyGS)
            lora_sf: 7,                    // Spreading Factor (7-12)
            lora_bw: 125000,               // Bandwidth in Hz
            lora_cr: 1,                    // Coding Rate (1=4/5, 2=4/6, 3=4/7, 4=4/8)
            lora_sync_word: [0x08, 0x10],  // Sync word (TinyGS default)
            lora_preamble_len: 8,          // Preamble length
            lora_fldro: false,             // Low Data Rate Optimization

            // FSK/GMSK/GFSK parameters (future - TODO)
            // fsk_baudrate: 9600,
            // fsk_deviation: 5000,
            // fsk_framing: 'ax25',

            // BPSK parameters (future - TODO)
            // bpsk_baudrate: 9600,
            // bpsk_differential: false,
            // bpsk_framing: 'ax25',

            // Weather parameters (future - TODO)
            // weather_pipeline: 'noaa_apt',
            // weather_sample_rate: 48000,
        }
    };
};
