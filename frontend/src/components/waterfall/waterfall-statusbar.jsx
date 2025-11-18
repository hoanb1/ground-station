import React from 'react';
import {humanizeFrequency, humanizeNumber, WaterfallStatusBarPaper} from "../common/common.jsx";
import { useTranslation } from 'react-i18next';
import { Box } from '@mui/material';

const WaterfallStatusBar = ({isStreaming, eventMetrics, centerFrequency, sampleRate, gain}) => {
    const { t } = useTranslation('waterfall');

    return (
        <WaterfallStatusBarPaper>
            {isStreaming ? (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5, fontSize: '0.75rem', fontFamily: 'monospace', color: 'text.secondary' }}>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Box component="span">FPS: <Box component="span" sx={{ fontWeight: 500, display: 'inline-block', minWidth: '3ch', textAlign: 'right' }}>{eventMetrics.current.renderWaterfallPerSecond}</Box></Box>
                        <Box component="span" sx={{ opacity: 0.6 }}>•</Box>
                        <Box component="span">FFTs/s: <Box component="span" sx={{ fontWeight: 500, display: 'inline-block', minWidth: '4ch', textAlign: 'right' }}>{humanizeNumber(eventMetrics.current.fftUpdatesPerSecond)}</Box></Box>
                        <Box component="span" sx={{ opacity: 0.6 }}>•</Box>
                        <Box component="span">bins/s: <Box component="span" sx={{ fontWeight: 500, display: 'inline-block', minWidth: '4ch', textAlign: 'right' }}>{humanizeNumber(eventMetrics.current.binsPerSecond)}</Box></Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Box component="span">f: <Box component="span" sx={{ fontWeight: 500 }}>{humanizeFrequency(centerFrequency)}</Box></Box>
                        <Box component="span" sx={{ opacity: 0.6 }}>•</Box>
                        <Box component="span">sr: <Box component="span" sx={{ fontWeight: 500 }}>{humanizeFrequency(sampleRate)}</Box></Box>
                        <Box component="span" sx={{ opacity: 0.6 }}>•</Box>
                        <Box component="span">g: <Box component="span" sx={{ fontWeight: 500 }}>{gain} dB</Box></Box>
                    </Box>
                </Box>
            ) : (
                t('statusbar.stopped')
            )}
        </WaterfallStatusBarPaper>
    );
};
export default WaterfallStatusBar;
