
import React, { useState, useEffect, useRef } from 'react';
import { Marker } from 'react-leaflet';
import { Button } from '@mui/material';
import { ThemedLeafletTooltip } from "../common/common.jsx";
import { styled } from '@mui/material/styles';
import { Tooltip as LeafletTooltip } from 'react-leaflet';

// Styled tooltip specifically for tracked satellites
const TrackedSatelliteTooltip = styled(LeafletTooltip)(({ theme }) => ({
    color: theme.palette.text.primary,
    backgroundColor: '#331538',
    borderRadius: theme.shape.borderRadius,
    borderColor: '#7f4de3',
    zIndex: 300,
    '&::before': {
        borderBottomColor: '#5E35B1 !important',
    },
}));

const SatelliteMarker = ({
                             satellite,
                             position,
                             altitude,
                             velocity,
                             trackingSatelliteId,
                             selectedSatelliteId,
                             markerEventHandlers,
                             satelliteIcon,
                             opacity = 1,
                         }) => {
    // Local state for the disabled property
    const [isDisabled, setIsDisabled] = useState(trackingSatelliteId === satellite.norad_id);

    // Update local state whenever the dependencies change
    useEffect(() => {
        setIsDisabled(trackingSatelliteId === satellite.norad_id);
    }, [trackingSatelliteId, satellite.norad_id]);

    const isTracking = trackingSatelliteId === satellite.norad_id;
    
    // Choose which tooltip component to use
    const TooltipComponent = isTracking ? TrackedSatelliteTooltip : ThemedLeafletTooltip;

    return (
        <Marker
            key={`marker-${satellite.norad_id}-${trackingSatelliteId === satellite}`}
            position={position}
            icon={satelliteIcon}
            eventHandlers={markerEventHandlers}
            opacity={opacity}
        >
            <TooltipComponent
                direction="bottom"
                offset={[0, 10]}
                permanent={true}
                className={"tooltip-satellite"}
                interactive={true}
            >
                <strong>
                    <span style={{}}>{isTracking && '◎ '}</span>
                    {satellite.name} - {parseInt(altitude) + " km, " + velocity.toFixed(2) + " km/s"}
                </strong>
            </TooltipComponent>
        </Marker>
    );
};

export default React.memo(SatelliteMarker);