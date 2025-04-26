import {humanizeFrequency} from "../common/common.jsx";

const FrequencyScale = ({ centerFrequency, sampleRate, containerWidth }) => {
    // Calculate frequencies to display
    const startFreq = centerFrequency - sampleRate / 2;
    const endFreq = centerFrequency + sampleRate / 2;

    // Calculate steps based on width
    const minWidthPerLabel = 100;
    const maxLabels = Math.max(3, Math.floor(containerWidth / minWidthPerLabel));
    const step = sampleRate / (maxLabels - 1);

    const frequencies = [];
    for (let i = 0; i < maxLabels; i++) {
        frequencies.push(startFreq + i * step);
    }

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0 5px'
        }}>
            {frequencies.map((freq, index) => (
                <div key={index} style={{
                    color: 'white',
                    fontSize: '10px',
                    textAlign: 'center',
                    flex: '0 0 auto',
                    position: 'absolute',
                    left: `${(index / (maxLabels - 1)) * 100}%`,
                    transform: 'translateX(-50%)'
                }}>
                    {humanizeFrequency(freq)}
                </div>
            ))}
        </div>
    );
};

export default FrequencyScale;