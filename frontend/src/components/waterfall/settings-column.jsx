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


import React, {useImperativeHandle, forwardRef, useCallback, useEffect, useState, useRef} from 'react';
import {
    getClassNamesBasedOnGridEditing,
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
    setFFTAveraging,
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
    startRecording,
    stopRecording,
    setRecordingName,
    incrementRecordingDuration,
    setSelectedPlaybackRecording,
    setPlaybackRecordingPath,
    clearPlaybackRecording,
} from './waterfall-slice.jsx';

import {useSocket} from "../common/socket.jsx";
import { toast } from "../../utils/toast-with-timestamp.jsx";
import getValue from "lodash/_getValue.js";
import FrequencyControlAccordion from "./settings-frequency.jsx";
import SdrAccordion from "./settings-sdr.jsx";
import FftAccordion from "./settings-fft.jsx";
import VfoAccordion from "./settings-vfo.jsx";
import RecordingAccordion from "./settings-recording.jsx";
import PlaybackAccordion from "./settings-playback.jsx";
import { useTranslation } from 'react-i18next';

const WaterfallSettings = forwardRef(function WaterfallSettings(props, ref) {
    const { t } = useTranslation('waterfall');
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
        fftAveraging,
        isRecording,
        recordingDuration,
        recordingName,
        selectedPlaybackRecording,
        playbackRecordingPath,
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

    const {socket} = useSocket();

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
                // For sigmfplayback, NEVER send configure without a recording path
                // This prevents overwriting the session with empty recording_path
                if (selectedSDRId === "sigmf-playback" && !playbackRecordingPath) {
                    return;
                }

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
                    fftAveraging: fftAveraging,
                    recordingPath: playbackRecordingPath,
                }
                SDRSettings = {...SDRSettings, ...updates};
                socket.emit('sdr_data', 'configure-sdr', SDRSettings);
            }
        }, [
            selectedSDRId,
            centerFrequency,
            sampleRate,
            gain,
            fftSize,
            fftWindow,
            fftAveraging,
            biasT,
            tunerAgc,
            rtlAgc,
            socket,
            selectedOffsetValue,
            playbackRecordingPath,
            selectedAntenna,
            soapyAgc,
            isStreaming,
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
    }, [dispatch, getSDRConfigParameters, setErrorDialogOpen, setErrorMessage, setIsStreaming, setSelectedSDRId, socket]);

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

    const updateFFTAveraging = (fftAveraging) => (dispatch) => {
        dispatch(setFFTAveraging(fftAveraging));
        return sendSDRConfigToBackend({fftAveraging: fftAveraging});
    };

    const updateSelectedAntenna = (antenna) => (dispatch) => {
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

    const handleVFOPropertyChange = (vfoNumber, updates) => {
        dispatch(setVFOProperty({ vfoNumber, updates }));
    };

    const handleVFOActiveChange = (vfoNumber, isActive) => {
        if (isActive) {
            dispatch(setVfoActive(vfoNumber));
        } else {
            dispatch(setVfoInactive(vfoNumber));
        }
    };

    const handleVFOListenChange = (vfoNumber, isListening) => {
        if (isListening) {
            dispatch(setSelectedVFO(vfoNumber));
        } else {
            dispatch(setSelectedVFO(null));
        }
    };

    const handleVFOTabChange = (newValue) => {
        dispatch(setSelectedVFOTab(newValue));
        // Also select the corresponding VFO on the canvas
        const vfoNumber = newValue + 1; // Convert tab index (0-3) to VFO number (1-4)
        dispatch(setSelectedVFO(vfoNumber));
    };

    // Sync VFO tab selection when a VFO is selected on the canvas
    useEffect(() => {
        if (selectedVFO !== null && selectedVFO >= 1 && selectedVFO <= maxVFOMarkers) {
            const tabIndex = selectedVFO - 1; // Convert VFO number (1-4) to tab index (0-3)
            if (selectedVFOTab !== tabIndex) {
                dispatch(setSelectedVFOTab(tabIndex));
            }
        }
    }, [selectedVFO, maxVFOMarkers, selectedVFOTab, dispatch]);

    // Recording timer
    useEffect(() => {
        let intervalId;
        if (isRecording) {
            intervalId = setInterval(() => {
                dispatch(incrementRecordingDuration());
            }, 1000);
        }
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [isRecording, dispatch]);

    const handleStartRecording = () => {
        dispatch(startRecording({ socket, recordingName, selectedSDRId }))
            .unwrap()
            .catch((error) => {
                toast.error(`Failed to start recording: ${error}`);
            });
    };

    const handleStopRecording = async () => {
        try {
            // Capture waterfall snapshot using the new hook
            let waterfallImage = null;

            try {
                if (window.captureWaterfallSnapshot) {
                    waterfallImage = await window.captureWaterfallSnapshot(1620);
                }
            } catch (captureError) {
                console.error('Error capturing waterfall:', captureError);
                waterfallImage = null;
            }

            dispatch(stopRecording({ socket, selectedSDRId, waterfallImage }))
                .unwrap()
                .then(() => {
                    console.log('Recording stopped successfully');
                })
                .catch((error) => {
                    console.error('Failed to stop recording:', error);
                    toast.error(`Failed to stop recording: ${error}`);
                });
        } catch (error) {
            console.error('Error in handleStopRecording:', error);
            toast.error(`Failed to stop recording: ${error.message}`);
        }
    };

    const handleRecordingSelect = (recording) => {
        // When a recording is selected, auto-select the sigmfplayback SDR
        const sigmfSdr = sdrs.find(sdr => sdr.type === 'sigmfplayback');

        if (sigmfSdr) {
            // Set the selected playback recording
            dispatch(setSelectedPlaybackRecording(recording));

            // Just send the recording name, backend will resolve the full path
            const recordingPath = recording.name;
            dispatch(setPlaybackRecordingPath(recordingPath));

            // Get sample rate from recording metadata and set it in the UI
            const recordingSampleRate = recording.metadata?.sample_rate;
            if (recordingSampleRate) {
                dispatch(setSampleRate(recordingSampleRate));
            }

            // Set antenna to "RX" for sigmfplayback
            dispatch(setSelectedAntenna("RX"));

            // Set gain to 0 for playback
            dispatch(setGain(0));

            // Auto-select the SigMF Playback SDR
            dispatch(setSelectedSDRId(sigmfSdr.id));

            // Expand the SDR accordion
            if (!expandedPanels.includes('sdr')) {
                dispatch(setExpandedPanels([...expandedPanels, 'sdr']));
            }

            // Manually send configure-sdr with the recording path
            // since the useEffect won't have the updated playbackRecordingPath yet
            setTimeout(() => {
                const SDRSettings = {
                    selectedSDRId: sigmfSdr.id,
                    centerFrequency: centerFrequency,
                    sampleRate: recordingSampleRate || sampleRate,
                    gain: 0,
                    fftSize: fftSize,
                    biasT: biasT,
                    tunerAgc: tunerAgc,
                    rtlAgc: rtlAgc,
                    fftWindow: fftWindow,
                    antenna: "RX",
                    soapyAgc: soapyAgc,
                    offsetFrequency: selectedOffsetValue,
                    fftAveraging: fftAveraging,
                    recordingPath: recordingPath,
                };
                socket.emit('sdr_data', 'configure-sdr', SDRSettings);

                // Now fetch SDR parameters after configure-sdr has set the recording path
                setTimeout(() => {
                    dispatch(getSDRConfigParameters({
                        socket,
                        selectedSDRId: sigmfSdr.id
                    }));
                }, 200);
            }, 100);
        } else {
            toast.error('SigMF Playback SDR not found. Please refresh the page.');
        }
    };

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>{t('title')}</TitleBar>
            <div style={{overflowY: 'auto', height: '100%', paddingBottom: '29px'}}>

                <VfoAccordion
                    expanded={expandedPanels.includes('vfo')}
                    onAccordionChange={handleAccordionChange('vfo')}
                    selectedVFOTab={selectedVFOTab}
                    onVFOTabChange={handleVFOTabChange}
                    vfoColors={vfoColors}
                    vfoMarkers={vfoMarkers}
                    vfoActive={vfoActive}
                    onVFOActiveChange={handleVFOActiveChange}
                    onVFOPropertyChange={handleVFOPropertyChange}
                    selectedVFO={selectedVFO}
                    onVFOListenChange={handleVFOListenChange}
                />

                <FrequencyControlAccordion
                    expanded={expandedPanels.includes('freqControl')}
                    onAccordionChange={handleAccordionChange('freqControl')}
                    centerFrequency={centerFrequency}
                    onCenterFrequencyChange={(newFrequency) => {
                        if (!isRecording) {
                            dispatch(updateCenterFrequency(newFrequency));
                        }
                    }}
                    availableTransmitters={availableTransmitters}
                    getProperTransmitterId={getProperTransmitterId}
                    onTransmitterChange={handleTransmitterChange}
                    selectedOffsetMode={selectedOffsetMode}
                    onOffsetModeChange={handleOffsetModeChange}
                    selectedOffsetValue={selectedOffsetValue}
                    onOffsetValueChange={handleOffsetValueChange}
                    isRecording={isRecording}
                    selectedSDRId={selectedSDRId}
                    isStreaming={isStreaming}
                />

                <SdrAccordion
                    expanded={expandedPanels.includes('sdr')}
                    onAccordionChange={handleAccordionChange('sdr')}
                    gettingSDRParameters={gettingSDRParameters}
                    isStreaming={isStreaming}
                    sdrs={sdrs}
                    selectedSDRId={selectedSDRId}
                    onSDRChange={handleSDRChange}
                    gainValues={gainValues}
                    localGain={localGain}
                    onGainChange={(value) => {
                        setLocalGain(value);
                        dispatch(updateSDRGain(value));
                    }}
                    sampleRateValues={sampleRateValues}
                    localSampleRate={localSampleRate}
                    onSampleRateChange={(value) => {
                        if (!isRecording) {
                            setLocalSampleRate(value);
                            dispatch(updateSampleRate(value));
                        }
                    }}
                    antennasList={antennasList}
                    selectedAntenna={selectedAntenna}
                    onAntennaChange={(value) => dispatch(updateSelectedAntenna(value))}
                    hasBiasT={hasBiasT}
                    biasT={biasT}
                    onBiasTChange={(checked) => dispatch(updateBiasT(checked))}
                    hasTunerAgc={hasTunerAgc}
                    tunerAgc={tunerAgc}
                    onTunerAgcChange={(checked) => dispatch(updateTunerAgc(checked))}
                    hasSoapyAgc={hasSoapyAgc}
                    soapyAgc={soapyAgc}
                    onSoapyAgcChange={(checked) => dispatch(updateSoapyAgc(checked))}
                    hasRtlAgc={hasRtlAgc}
                    rtlAgc={rtlAgc}
                    onRtlAgcChange={(checked) => dispatch(updateRtlAgc(checked))}
                    isRecording={isRecording}
                />

                <FftAccordion
                    expanded={expandedPanels.includes('fft')}
                    onAccordionChange={handleAccordionChange('fft')}
                    gettingSDRParameters={gettingSDRParameters}
                    fftSizeValues={fftSizeValues}
                    localFFTSize={localFFTSize}
                    onFFTSizeChange={(value) => {
                        setLocalFFTSize(value);
                        dispatch(updateFFTSize(value));
                    }}
                    fftWindowValues={fftWindowValues}
                    fftWindow={fftWindow}
                    onFFTWindowChange={(value) => dispatch(updateFFTWindow(value))}
                    fftAveraging={fftAveraging}
                    onFFTAveragingChange={(value) => dispatch(updateFFTAveraging(value))}
                    colorMaps={colorMaps}
                    localColorMap={localColorMap}
                    onColorMapChange={(value) => {
                        setLocalColorMap(value);
                        dispatch(setColorMap(value));
                    }}
                />

                <RecordingAccordion
                    expanded={expandedPanels.includes('recording')}
                    onAccordionChange={handleAccordionChange('recording')}
                    isRecording={isRecording}
                    recordingDuration={recordingDuration}
                    recordingName={recordingName}
                    onRecordingNameChange={(name) => dispatch(setRecordingName(name))}
                    onStartRecording={handleStartRecording}
                    onStopRecording={handleStopRecording}
                    isStreaming={isStreaming}
                    selectedSDRId={selectedSDRId}
                />

                <PlaybackAccordion
                    expanded={expandedPanels.includes('playback')}
                    onAccordionChange={handleAccordionChange('playback')}
                    isStreaming={isStreaming}
                    selectedPlaybackRecording={selectedPlaybackRecording}
                    onRecordingSelect={handleRecordingSelect}
                />
            </div>
        </>
    );
});

export default WaterfallSettings;