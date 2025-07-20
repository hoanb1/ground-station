
import React, { useState, useEffect, useRef } from 'react';
import { Marker } from 'react-leaflet';
import { Button } from '@mui/material';
import { ThemedLeafletTooltip } from "../common/common.jsx";

const SatelliteMarker = ({
                             satellite,
                             position,
                             altitude,
                             velocity,
                             trackingSatelliteId,
                             selectedSatelliteId,
                             markerEventHandlers,
                             satelliteIcon,
                         }) => {
    // Local state for the disabled property
    const [isDisabled, setIsDisabled] = useState(trackingSatelliteId === satellite.norad_id);

    // Update local state whenever the dependencies change
    useEffect(() => {
        setIsDisabled(trackingSatelliteId === satellite.norad_id);
    }, [trackingSatelliteId, satellite.norad_id]);

    return (
        <Marker
            key={`marker-${satellite.norad_id}-${trackingSatelliteId === satellite}`}
            position={position}
            icon={satelliteIcon}
            eventHandlers={markerEventHandlers}
        >
            <ThemedLeafletTooltip
                direction="bottom"
                offset={[0, 10]}
                permanent={true}
                className={"tooltip-satellite"}
                interactive={true}
            >
                <strong>{satellite.name} - {parseInt(altitude) + " km, " + velocity.toFixed(2) + " km/s"}</strong>
            </ThemedLeafletTooltip>
        </Marker>
    );
};

export default React.memo(SatelliteMarker);