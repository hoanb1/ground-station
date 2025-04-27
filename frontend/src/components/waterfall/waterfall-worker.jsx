
// Function to create a worker using blob URL (inline worker)
export const createInlineWorker = () => {
    const workerCode = `
    let renderIntervalId = null;
    let targetFPS = 30;
    
    // Main message handler
    self.onmessage = function(e) {
      const { cmd, data } = e.data;
      
      switch(cmd) {
        case 'start':
          startRendering(data.fps || targetFPS);
          break;
        
        case 'stop':
          stopRendering();
          break;
        
        case 'updateFPS':
          updateFPS(data.fps);
          break;
          
        case 'updateFFTData':
          // If we receive new FFT data, notify the main thread immediately
          self.postMessage({ type: 'render', immediate: true });
          break;
          
        default:
          console.error('Unknown command:', cmd);
      }
    };
    
    // Start the rendering cycle
    function startRendering(fps) {
      // Clear any existing interval first
      stopRendering();
      
      targetFPS = fps;
      const interval = Math.floor(1000 / targetFPS);
      
      renderIntervalId = setInterval(() => {
        self.postMessage({ type: 'render' });
      }, interval);
      
      // Confirm start
      self.postMessage({ type: 'status', status: 'started', fps: targetFPS });
    }
    
    // Stop the rendering cycle
    function stopRendering() {
      if (renderIntervalId) {
        clearInterval(renderIntervalId);
        renderIntervalId = null;
        
        // Confirm stop
        self.postMessage({ type: 'status', status: 'stopped' });
      }
    }
    
    // Update FPS setting
    function updateFPS(fps) {
      if (fps !== targetFPS) {
        targetFPS = fps;
        
        // Restart with new FPS if currently running
        if (renderIntervalId) {
          startRendering(targetFPS);
        }
        
        self.postMessage({ type: 'status', status: 'fpsUpdated', fps: targetFPS });
      }
    }
  `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);

    return new Worker(workerUrl);
};

