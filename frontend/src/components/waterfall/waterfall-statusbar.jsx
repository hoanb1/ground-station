import React from 'react';
import {humanizeFrequency, humanizeNumber, WaterfallStatusBarPaper} from "../common/common.jsx";

const WaterfallStatusBar = ({isStreaming, eventMetrics, centerFrequency, sampleRate, gain}) => {
    return (
        <WaterfallStatusBarPaper>
            {isStreaming ?
                `FPS: ${eventMetrics.current.renderWaterfallPerSecond}, 
                FFTs/s: ${humanizeNumber(eventMetrics.current.fftUpdatesPerSecond)}, 
                bins/s: ${humanizeNumber(eventMetrics.current.binsPerSecond)}, 
                f: ${humanizeFrequency(centerFrequency)}, 
                sr: ${humanizeFrequency(sampleRate)}, 
                g: ${gain} dB`
                : `stopped`
            }
        </WaterfallStatusBarPaper>
    );
};
export default WaterfallStatusBar;
