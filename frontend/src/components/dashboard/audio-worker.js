class AudioProcessor {
    constructor() {
        this.audioQueue = [];
        this.processingQueue = false;
        this.maxQueueSize = 50; // Increased from 3 to 50 for smooth audio streaming
    }

    processAudioData(audioData) {
        try {
            const { samples, sample_rate, channels = 1 } = audioData;

            if (!samples || samples.length === 0) {
                return null;
            }

            // Validate and normalize samples
            const normalizedSamples = new Float32Array(samples.length);
            for (let i = 0; i < samples.length; i++) {
                // Clamp values between -1 and 1
                normalizedSamples[i] = Math.max(-1, Math.min(1, samples[i]));
            }

            return {
                samples: normalizedSamples,
                sample_rate,
                channels,
                duration: samples.length / sample_rate,
                timestamp: Date.now()
            };
        } catch (error) {
            self.postMessage({
                type: 'ERROR',
                error: error.message
            });
            return null;
        }
    }

    addToQueue(audioData) {
        const processedData = this.processAudioData(audioData);
        if (!processedData) return;

        this.audioQueue.push(processedData);

        // Limit queue size aggressively
        while (this.audioQueue.length > this.maxQueueSize) {
            this.audioQueue.shift(); // Remove oldest
        }

        this.scheduleProcessing();
    }

    scheduleProcessing() {
        if (this.processingQueue || this.audioQueue.length === 0) {
            return;
        }

        this.processingQueue = true;

        // Process immediately without delay for real-time audio
        this.processQueue();
    }

    processQueue() {
        // Process all available chunks at once for continuous audio
        const batch = [];

        while (this.audioQueue.length > 0) {
            const audioData = this.audioQueue.shift();
            if (audioData) {
                batch.push(audioData);
            }
        }

        if (batch.length > 0) {
            self.postMessage({
                type: 'AUDIO_BATCH',
                batch: batch
            });
        }

        this.processingQueue = false;
    }

    getQueueStatus() {
        return {
            queueLength: this.audioQueue.length,
            processing: this.processingQueue
        };
    }
}

const processor = new AudioProcessor();

self.onmessage = function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'AUDIO_DATA':
            processor.addToQueue(data);
            break;

        case 'GET_QUEUE_STATUS':
            self.postMessage({
                type: 'QUEUE_STATUS',
                status: processor.getQueueStatus()
            });
            break;

        case 'CLEAR_QUEUE':
            processor.audioQueue = [];
            processor.processingQueue = false;
            break;

        default:
            console.warn('Unknown message type:', type);
    }
};