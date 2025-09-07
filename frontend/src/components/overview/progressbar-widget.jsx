import React, {useEffect, useRef, useState} from "react";
import {DataGrid, useGridApiRef} from "@mui/x-data-grid";
import {useStore} from "react-redux";
import {darken, lighten, styled} from "@mui/material/styles";
import {Typography} from "@mui/material";
import SkyPositionFormatter from "./skyposition-widget.jsx";
import {getBandColor, getFrequencyBand} from "../common/common.jsx";

const ProgressFormatter = React.memo(({params}) => {
    const [, setForceUpdate] = useState(0);

    // Force component to update regularly
    useEffect(() => {
        const interval = setInterval(() => {
            setForceUpdate(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const now = new Date();
    const startDate = new Date(params.row.event_start);
    const endDate = new Date(params.row.event_end);

    if (params.row.is_geostationary || params.row.is_geosynchronous) {
        return "∞";
    }

    // Calculate peak time based on available data
    // Assuming peak_time is available in the data, or we can calculate it from event_start and event_end
    // If peak_time isn't available, we can estimate it as the midpoint
    const peakTime = params.row.peak_time ? new Date(params.row.peak_time) :
        new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);

    // Calculate positions as percentages of the total timeline
    const totalDuration = endDate - startDate;
    const peakPosition = ((peakTime - startDate) / totalDuration) * 100;

    // If the pass hasn't started yet
    if (startDate > now) {
        return (
            <div style={{width: '100%', position: 'relative', height: '35px'}}>
                {/* Timeline bar */}
                <div style={{
                    height: '8px',
                    backgroundColor: '#e0e0e0',
                    width: '100%',
                    borderRadius: '4px',
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)'
                }}/>

                {/* Peak marker */}
                <div style={{
                    height: '16px',
                    width: '2px',
                    backgroundColor: '#ff9800',
                    position: 'absolute',
                    left: `${peakPosition}%`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 2
                }}/>

                {/* Peak indicator dot */}
                <div style={{
                    height: '8px',
                    width: '8px',
                    backgroundColor: '#ff9800',
                    borderRadius: '50%',
                    position: 'absolute',
                    left: `calc(${peakPosition}% - 4px)`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 3
                }} title={`Peak elevation: ${params.row.peak_altitude.toFixed(2)}°`}/>

                {/* Progress percentage (0% for not started) */}
                <div style={{
                    position: 'absolute',
                    right: '2px',
                    bottom: '0px',
                    fontSize: '9px',
                    color: 'rgba(0, 0, 0, 0.6)',
                    fontWeight: 'bold',
                    zIndex: 5
                }}>
                    0%
                </div>
            </div>
        );
    }

    // If the pass has ended
    if (endDate < now) {
        return (
            <div style={{width: '100%', position: 'relative', height: '35px'}}>
                {/* Timeline bar - completed */}
                <div style={{
                    height: '8px',
                    backgroundColor: '#4caf50',
                    width: '100%',
                    borderRadius: '4px',
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)'
                }}/>

                {/* Peak marker */}
                <div style={{
                    height: '16px',
                    width: '2px',
                    backgroundColor: '#ff9800',
                    position: 'absolute',
                    left: `${peakPosition}%`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 2
                }}/>

                {/* Peak indicator dot */}
                <div style={{
                    height: '8px',
                    width: '8px',
                    backgroundColor: '#ff9800',
                    borderRadius: '50%',
                    position: 'absolute',
                    left: `calc(${peakPosition}% - 4px)`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 3
                }} title={`Peak elevation: ${params.row.peak_altitude.toFixed(2)}°`}/>

                {/* Progress percentage (100% for completed) */}
                <div style={{
                    position: 'absolute',
                    right: '2px',
                    bottom: '0px',
                    fontSize: '9px',
                    color: 'rgba(0, 0, 0, 0.6)',
                    fontWeight: 'bold',
                    zIndex: 5
                }}>
                    100%
                </div>
            </div>
        );
    }

    // If the pass is in progress
    const elapsedDuration = now - startDate;
    const progressPercentage = Math.round((elapsedDuration / totalDuration) * 100);

    return (
        <div style={{width: '100%', position: 'relative', height: '35px'}}>
            {/* Timeline background */}
            <div style={{
                height: '8px',
                backgroundColor: '#e0e0e0',
                width: '100%',
                borderRadius: '4px',
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)'
            }}/>

            {/* Progress filled part */}
            <div style={{
                height: '8px',
                backgroundColor: '#4caf50',
                width: `${progressPercentage}%`,
                borderRadius: '4px',
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 1
            }}/>

            {/* Current position indicator */}
            <div style={{
                height: '16px',
                width: '16px',
                backgroundColor: '#1976d2',
                borderRadius: '50%',
                position: 'absolute',
                left: `calc(${progressPercentage}% - 8px)`,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 4,
                border: '2px solid white'
            }} title={`Current progress: ${progressPercentage}%`}/>

            {/* Peak marker */}
            <div style={{
                height: '16px',
                width: '2px',
                backgroundColor: '#ff9800',
                position: 'absolute',
                left: `${peakPosition}%`,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 2
            }}/>

            {/* Peak indicator dot */}
            <div style={{
                height: '8px',
                width: '8px',
                backgroundColor: '#ff9800',
                borderRadius: '50%',
                position: 'absolute',
                left: `calc(${peakPosition}% - 4px)`,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 3
            }} title={`Peak elevation: ${params.row.peak_altitude.toFixed(2)}°`}/>

            {/* Progress percentage (current %) */}
            <div style={{
                position: 'absolute',
                right: '2px',
                bottom: '0px',
                fontSize: '9px',
                color: 'rgba(0, 0, 0, 0.6)',
                fontWeight: 'bold',
                zIndex: 5
            }}>
                {progressPercentage}%
            </div>
        </div>
    );
});

export default ProgressFormatter;