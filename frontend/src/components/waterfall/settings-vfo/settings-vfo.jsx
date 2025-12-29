/**
 * VFO Settings Accordion Component (Refactored)
 *
 * Main orchestrator for VFO settings panel
 */

import React from 'react';
import { Accordion, AccordionSummary, AccordionDetails } from '../settings-elements.jsx';
import Typography from '@mui/material/Typography';
import { Tabs } from "@mui/material";
import { useTranslation } from 'react-i18next';
import { VfoTab } from './vfo-tab-header.jsx';
import { VfoTabPanel } from './vfo-tab-panel.jsx';
import { TransmittersDialog, TranscriptionParamsDialog } from './vfo-dialogs.jsx';
import DecoderParamsDialog from '../decoder-params-dialog.jsx';
import {
    useVfoAudioState,
    useVfoDecoderInfo,
    useVfoWheelHandlers,
    useVfoSatelliteData,
    useVfoStreamingState
} from './vfo-hooks.js';

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
    onTranscriptionToggle,
    geminiConfigured,
    deepgramConfigured,
}) => {
    const { t } = useTranslation('waterfall');

    // Use custom hooks for state management
    const {
        vfoMuted,
        vfoBufferLengths,
        vfoAudioLevels,
        vfoRfPower,
        handleVfoMuteToggle
    } = useVfoAudioState();

    const { getVFODecoderInfo } = useVfoDecoderInfo();

    const {
        transmitters,
        targetSatelliteName,
        targetSatelliteData
    } = useVfoSatelliteData();

    const { streamingVFOs, vfoMutedRedux } = useVfoStreamingState();

    // Set up wheel event handlers for sliders
    useVfoWheelHandlers(vfoMarkers, vfoActive, onVFOPropertyChange);

    // Dialog state management
    const [transmittersDialogOpen, setTransmittersDialogOpen] = React.useState(false);
    const [decoderParamsDialogOpen, setDecoderParamsDialogOpen] = React.useState(false);
    const [decoderParamsVfoIndex, setDecoderParamsVfoIndex] = React.useState(null);
    const [transcriptionParamsDialogOpen, setTranscriptionParamsDialogOpen] = React.useState(false);
    const [transcriptionParamsVfoIndex, setTranscriptionParamsVfoIndex] = React.useState(null);

    // Dialog handlers
    const handleOpenDecoderParams = (vfoIndex) => {
        setDecoderParamsVfoIndex(vfoIndex);
        setDecoderParamsDialogOpen(true);
    };

    const handleOpenTranscriptionParams = (vfoIndex) => {
        setTranscriptionParamsVfoIndex(vfoIndex);
        setTranscriptionParamsDialogOpen(true);
    };

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
                {/* VFO Tabs */}
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
                        <VfoTab
                            key={index}
                            index={index}
                            vfoColors={vfoColors}
                            vfoMarkers={vfoMarkers}
                            vfoActive={vfoActive}
                            streamingVFOs={streamingVFOs}
                            vfoMutedRedux={vfoMutedRedux}
                        />
                    ))}
                </Tabs>

                {/* VFO Tab Panels */}
                {[1, 2, 3, 4].map((vfoIndex) => (
                    <VfoTabPanel
                        key={vfoIndex}
                        vfoIndex={vfoIndex}
                        visible={(selectedVFOTab + 1) === vfoIndex}
                        vfoMarkers={vfoMarkers}
                        vfoActive={vfoActive}
                        vfoMuted={vfoMuted}
                        vfoBufferLengths={vfoBufferLengths}
                        vfoAudioLevels={vfoAudioLevels}
                        vfoRfPower={vfoRfPower}
                        transmitters={transmitters}
                        targetSatelliteName={targetSatelliteName}
                        geminiConfigured={geminiConfigured}
                        deepgramConfigured={deepgramConfigured}
                        onVFOActiveChange={onVFOActiveChange}
                        onVFOPropertyChange={onVFOPropertyChange}
                        onMuteToggle={handleVfoMuteToggle}
                        onTranscriptionToggle={onTranscriptionToggle}
                        onOpenTransmittersDialog={() => setTransmittersDialogOpen(true)}
                        onOpenDecoderParamsDialog={handleOpenDecoderParams}
                        onOpenTranscriptionParamsDialog={handleOpenTranscriptionParams}
                        getVFODecoderInfo={getVFODecoderInfo}
                    />
                ))}
            </AccordionDetails>

            {/* Transmitters Dialog */}
            <TransmittersDialog
                open={transmittersDialogOpen}
                onClose={() => setTransmittersDialogOpen(false)}
                targetSatelliteName={targetSatelliteName}
                targetSatelliteData={targetSatelliteData}
            />

            {/* Decoder Parameters Dialog */}
            <DecoderParamsDialog
                open={decoderParamsDialogOpen}
                onClose={() => setDecoderParamsDialogOpen(false)}
                vfoIndex={decoderParamsVfoIndex}
                vfoMarkers={vfoMarkers}
                vfoActive={vfoActive}
                onVFOPropertyChange={onVFOPropertyChange}
            />

            {/* Transcription Parameters Dialog */}
            <TranscriptionParamsDialog
                open={transcriptionParamsDialogOpen}
                onClose={() => setTranscriptionParamsDialogOpen(false)}
                vfoIndex={transcriptionParamsVfoIndex}
                vfoMarkers={vfoMarkers}
                geminiConfigured={geminiConfigured}
                onVFOPropertyChange={onVFOPropertyChange}
                getVFODecoderInfo={getVFODecoderInfo}
            />
        </Accordion>
    );
};

export default VfoAccordion;
