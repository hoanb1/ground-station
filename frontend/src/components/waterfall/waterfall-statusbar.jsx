import React, { useState, useEffect } from 'react';
import {humanizeFrequency, humanizeNumber, WaterfallStatusBarPaper} from "../common/common.jsx";
import { useTranslation } from 'react-i18next';
import { Box } from '@mui/material';

const WaterfallStatusBar = ({isStreaming, eventMetrics, centerFrequency, sampleRate, gain}) => {
    const { t } = useTranslation('waterfall');
    const [transformData, setTransformData] = useState(null);

    // Update transform data periodically when streaming
    useEffect(() => {
        if (!isStreaming) {
            setTransformData(null);
            return;
        }

        const updateTransform = () => {
            if (window.getWaterfallTransform) {
                setTransformData(window.getWaterfallTransform());
            }
        };

        // Initial update
        updateTransform();

        // Update every 100ms for smooth display
        const intervalId = setInterval(updateTransform, 100);

        return () => clearInterval(intervalId);
    }, [isStreaming]);

    return (
        <WaterfallStatusBarPaper>
            {isStreaming ? (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5, fontSize: '0.75rem', fontFamily: 'monospace', color: 'text.secondary' }}>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Box component="span">FPS: <Box component="span" sx={{ fontWeight: 500, display: 'inline-block', minWidth: '2ch', textAlign: 'right' }}>{eventMetrics.current.renderWaterfallPerSecond}</Box></Box>
                        <Box component="span" sx={{ opacity: 0.6 }}>•</Box>
                        <Box component="span">FFTs/s: <Box component="span" sx={{ fontWeight: 500, display: 'inline-block', minWidth: '2ch', textAlign: 'right' }}>{humanizeNumber(eventMetrics.current.fftUpdatesPerSecond)}</Box></Box>
                        <Box component="span" sx={{ opacity: 0.6 }}>•</Box>
                        <Box component="span">bins/s: <Box component="span" sx={{ fontWeight: 500, display: 'inline-block', minWidth: '4ch', textAlign: 'right' }}>{humanizeNumber(eventMetrics.current.binsPerSecond)}</Box></Box>
                    </Box>
                    <Box component="span" sx={{ opacity: 0.6, display: { xs: 'none', md: 'inline' } }}>•</Box>
                    <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5 }}>
                        <Box component="span">f: <Box component="span" sx={{ fontWeight: 500 }}>{humanizeFrequency(centerFrequency)}</Box></Box>
                        <Box component="span" sx={{ opacity: 0.6 }}>•</Box>
                        <Box component="span">sr: <Box component="span" sx={{ fontWeight: 500 }}>{humanizeFrequency(sampleRate)}</Box></Box>
                        <Box component="span" sx={{ opacity: 0.6 }}>•</Box>
                        <Box component="span">g: <Box component="span" sx={{ fontWeight: 500 }}>{gain} dB</Box></Box>
                        {transformData && (
                            <>
                                <Box component="span" sx={{ opacity: 0.6 }}>•</Box>
                                <Box component="span">zoom: <Box component="span" sx={{ fontWeight: 500 }}>{transformData.scale.toFixed(1)}x</Box></Box>
                                <Box component="span" sx={{ opacity: 0.6 }}>•</Box>
                                <Box component="span">view: <Box component="span" sx={{ fontWeight: 500 }}>{humanizeFrequency(transformData.startFreq)} - {humanizeFrequency(transformData.endFreq)}</Box></Box>
                                <Box component="span" sx={{ opacity: 0.6 }}>•</Box>
                                <Box component="span">bw: <Box component="span" sx={{ fontWeight: 500 }}>{humanizeFrequency(transformData.visibleBandwidth)}</Box></Box>
                            </>
                        )}
                    </Box>
                </Box>
            ) : (
                t('statusbar.stopped')
            )}
        </WaterfallStatusBarPaper>
    );
};
export default WaterfallStatusBar;
