import React from 'react';
import {humanizeFrequency, humanizeNumber, WaterfallStatusBarPaper} from "../common/common.jsx";
import { useTranslation } from 'react-i18next';

const WaterfallStatusBar = ({isStreaming, eventMetrics, centerFrequency, sampleRate, gain}) => {
    const { t } = useTranslation('waterfall');

    return (
        <WaterfallStatusBarPaper>
            {isStreaming ?
                `FPS: ${eventMetrics.current.renderWaterfallPerSecond},
                FFTs/s: ${humanizeNumber(eventMetrics.current.fftUpdatesPerSecond)},
                bins/s: ${humanizeNumber(eventMetrics.current.binsPerSecond)},
                f: ${humanizeFrequency(centerFrequency)},
                sr: ${humanizeFrequency(sampleRate)},
                g: ${gain} dB`
                : t('statusbar.stopped')
            }
        </WaterfallStatusBarPaper>
    );
};
export default WaterfallStatusBar;
