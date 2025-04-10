import {useEffect, useState} from "react";
import {FormControl, InputLabel, MenuItem, Select} from "@mui/material";
import * as React from "react";
import {useDispatch, useSelector} from "react-redux";
import {
    setSatelliteGroupSelectOpen,
    setSatelliteSelectOpen,
    setSatelliteId,
    setTrackingStateInBackend,
    setAvailableTransmitters,
} from './target-sat-slice.jsx';
import { useSocket } from "../common/socket.jsx";


function SatelliteList() {
    const dispatch = useDispatch();
    const {socket} = useSocket();
    const {
        satelliteData,
        groupOfSats,
        satelliteId,
        groupId,
        loading,
        satelliteSelectOpen,
        satelliteGroupSelectOpen,
        trackingState,
        uiTrackerDisabled,
        starting,
        selectedRadioRig,
        selectedRotator,
        selectedTransmitter,
        availableTransmitters,
    } = useSelector((state) => state.targetSatTrack);

    function getTransmittersForSatelliteId(satelliteId) {
        if (satelliteId && groupOfSats.length > 0) {
            const satellite = groupOfSats.find(s => s.norad_id === satelliteId);
            if (satellite) {
                return satellite.transmitters || [];
            } else {
                return [];
            }
        }
        return [];
    }

    function handleUIElementChange(event) {
        const satelliteId = event.target.value;
        dispatch(setSatelliteId(satelliteId));
        dispatch(setAvailableTransmitters(getTransmittersForSatelliteId(satelliteId)));

        // set the tracking state in the backend to the new norad id and leave the state as idle
        const data = {
            ...trackingState,
            norad_id: satelliteId,
            rotator_state: "idle",
            rig_state: "idle",
            group_id: groupId,
            rig_id: selectedRadioRig,
            rotator_id: selectedRotator,
            transmitter_id: selectedTransmitter,
        };
        dispatch(setTrackingStateInBackend({ socket, data: data}));
    }

    const handleSelectOpenEvent = (event) => {
        dispatch(setSatelliteSelectOpen(true));
    };

    const handleSelectCloseEvent = (event) => {
        dispatch(setSatelliteSelectOpen(false));
    };

    return (
        <FormControl disabled={trackingState['rotator_state'] === "tracking"} fullWidth={true} variant={"filled"} size={"small"}>
            <InputLabel htmlFor="satellite-select">Satellite</InputLabel>
            <Select onClose={handleSelectCloseEvent} onOpen={handleSelectOpenEvent}  value={groupOfSats.length > 0? satelliteId: ""}
                    id="satellite-select" label="Satellite" variant={"filled"} size={"small"} onChange={handleUIElementChange}>
                {groupOfSats.map((satellite, index) => {
                    return <MenuItem value={satellite['norad_id']} key={index}>#{satellite['norad_id']} {satellite['name']}</MenuItem>;
                })}
            </Select>
        </FormControl>
    );
}

export default SatelliteList;