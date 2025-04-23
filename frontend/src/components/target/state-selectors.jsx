export const satellitePositionSelector = state => state.targetSatTrack.satelliteData.position;
export const satellitePathsSelector = state => state.targetSatTrack.satelliteData.paths;
export const satelliteCoverageSelector = state => state.targetSatTrack.satelliteData.coverage;
export const satelliteTrackingStateSelector = state => state.targetSatTrack.trackingState;
export const satelliteDetailsSelector = state => state.targetSatTrack.satelliteData.details;
export const satelliteTransmittersSelector = state => state.targetSatTrack.satelliteData.transmitters;